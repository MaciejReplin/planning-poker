const { Router } = require('express');
const { getDb } = require('../db');

const router = Router();

// --- Jira fetch helper ---

function getConfig() {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_TOKEN;
  if (!baseUrl || !email || !token) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ''), email, token };
}

async function jiraFetch(path, options = {}) {
  const config = getConfig();
  if (!config) throw new Error('Jira not configured');

  const auth = Buffer.from(`${config.email}:${config.token}`).toString('base64');
  const url = `${config.baseUrl}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Jira API ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

// --- Story points field discovery ---

let storyPointsFieldId = null;

async function discoverStoryPointsField() {
  if (storyPointsFieldId) return storyPointsFieldId;

  const fields = await jiraFetch('/rest/api/3/field');

  // Try custom field first (classic projects)
  const custom = fields.find(f => f.custom && /story\s*point/i.test(f.name));
  if (custom) {
    storyPointsFieldId = custom.id;
    return storyPointsFieldId;
  }

  // Try built-in story_points (next-gen / team-managed projects)
  const builtin = fields.find(f => f.id === 'story_points' || f.key === 'story_points');
  if (builtin) {
    storyPointsFieldId = builtin.id;
    return storyPointsFieldId;
  }

  // Fallback: try common field IDs
  storyPointsFieldId = 'story_points';
  return storyPointsFieldId;
}

// --- Status (no auth middleware) ---

router.get('/status', (req, res) => {
  const config = getConfig();
  res.json({
    configured: !!config,
    baseUrl: config ? config.baseUrl : null,
  });
});

// --- Auth middleware for all other routes ---

router.use((req, res, next) => {
  if (!getConfig()) {
    return res.status(503).json({ error: 'Jira integration not configured', configured: false });
  }
  next();
});

// --- Field discovery ---

router.get('/fields', async (req, res) => {
  try {
    const fieldId = await discoverStoryPointsField();
    res.json({ fieldId });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// --- Boards ---

router.get('/boards', async (req, res) => {
  try {
    const data = await jiraFetch(`/rest/agile/1.0/board?type=scrum&maxResults=50&startAt=${req.query.startAt || 0}`);
    res.json({
      boards: (data.values || []).map(b => ({ id: b.id, name: b.name })),
      total: data.total,
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// --- Sprints for a board ---

router.get('/boards/:boardId/sprints', async (req, res) => {
  try {
    const data = await jiraFetch(
      `/rest/agile/1.0/board/${req.params.boardId}/sprint?state=active,closed&maxResults=50`
    );
    const sprints = (data.values || []).sort((a, b) => {
      if (a.state === 'active' && b.state !== 'active') return -1;
      if (b.state === 'active' && a.state !== 'active') return 1;
      return new Date(b.startDate || 0) - new Date(a.startDate || 0);
    });
    res.json({
      sprints: sprints.map(s => ({
        id: s.id, name: s.name, state: s.state,
        startDate: s.startDate, endDate: s.endDate,
      })),
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// --- Sprint issues ---

router.get('/sprints/:sprintId/issues', async (req, res) => {
  try {
    const spField = await discoverStoryPointsField();
    let allIssues = [];
    let startAt = 0;

    while (true) {
      const data = await jiraFetch(
        `/rest/agile/1.0/sprint/${req.params.sprintId}/issue?maxResults=100&startAt=${startAt}&fields=summary,status,${spField}`
      );
      const issues = (data.issues || []).map(i => ({
        key: i.key,
        summary: i.fields.summary,
        status: i.fields.status?.name,
        storyPoints: i.fields[spField] ?? null,
      }));
      allIssues = allIssues.concat(issues);
      if (allIssues.length >= (data.total || 0)) break;
      startAt += 100;
    }

    res.json({ issues: allIssues });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// --- Bulk issue lookup by keys ---

router.post('/issues/bulk', async (req, res) => {
  try {
    const { keys } = req.body;
    if (!keys || !keys.length) return res.json({ issues: {} });

    const spField = await discoverStoryPointsField();
    const result = {};

    // Jira JQL max ~100 keys per query
    for (let i = 0; i < keys.length; i += 100) {
      const batch = keys.slice(i, i + 100);
      const jql = `key in (${batch.join(',')})`;
      const fields = ['summary', 'status', spField].join(',');
      const data = await jiraFetch(
        `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=${fields}&maxResults=100`
      );

      for (const issue of (data.issues || [])) {
        result[issue.key] = {
          summary: issue.fields.summary,
          status: issue.fields.status?.name,
          storyPoints: issue.fields[spField] ?? null,
        };
      }
    }

    res.json({ issues: result });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// --- Compare: per room ---

router.get('/compare/room/:roomId', async (req, res) => {
  try {
    const db = getDb();
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const estimations = db.prepare(
      `SELECT * FROM estimations WHERE room_id = ? AND status = 'accepted' AND jira_key IS NOT NULL AND jira_key != ''`
    ).all(req.params.roomId);

    if (!estimations.length) {
      return res.json({ room: { id: room.id, name: room.name }, comparisons: [], stats: null });
    }

    const jiraKeys = estimations.map(e => e.jira_key);
    const spField = await discoverStoryPointsField();

    // Fetch from Jira
    const jiraData = {};
    for (let i = 0; i < jiraKeys.length; i += 100) {
      const batch = jiraKeys.slice(i, i + 100);
      const jql = `key in (${batch.join(',')})`;
      const fields = ['summary', 'status', spField].join(',');
      const data = await jiraFetch(
        `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=${fields}&maxResults=100`
      );
      for (const issue of (data.issues || [])) {
        jiraData[issue.key] = {
          summary: issue.fields.summary,
          status: issue.fields.status?.name,
          storyPoints: issue.fields[spField] ?? null,
        };
      }
    }

    const comparisons = estimations.map(e => {
      const jira = jiraData[e.jira_key];
      const ourEst = parseFloat(e.final_estimate);
      const jiraSP = jira?.storyPoints;
      return {
        jiraKey: e.jira_key,
        title: e.title,
        ourEstimate: e.final_estimate,
        jiraStoryPoints: jiraSP,
        jiraStatus: jira?.status || null,
        difference: (!isNaN(ourEst) && jiraSP != null) ? ourEst - jiraSP : null,
        estimatedAt: e.created_at,
      };
    });

    res.json({
      room: { id: room.id, name: room.name },
      comparisons,
      stats: computeStats(comparisons),
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// --- Compare: per sprint ---

router.get('/compare/sprint/:sprintId', async (req, res) => {
  try {
    const spField = await discoverStoryPointsField();

    // Fetch all sprint issues
    let allIssues = [];
    let startAt = 0;
    while (true) {
      const data = await jiraFetch(
        `/rest/agile/1.0/sprint/${req.params.sprintId}/issue?maxResults=100&startAt=${startAt}&fields=summary,status,${spField}`
      );
      allIssues = allIssues.concat(data.issues || []);
      if (allIssues.length >= (data.total || 0)) break;
      startAt += 100;
    }

    // Cross-reference with our DB
    const db = getDb();
    const keys = allIssues.map(i => i.key);
    let ourEstimates = {};
    if (keys.length) {
      const placeholders = keys.map(() => '?').join(',');
      const rows = db.prepare(
        `SELECT jira_key, final_estimate, title FROM estimations WHERE jira_key IN (${placeholders}) AND status = 'accepted'`
      ).all(...keys);
      for (const r of rows) {
        ourEstimates[r.jira_key] = r;
      }
    }

    const comparisons = allIssues.map(i => {
      const ours = ourEstimates[i.key];
      const jiraSP = i.fields[spField] ?? null;
      const ourEst = ours ? parseFloat(ours.final_estimate) : NaN;
      return {
        jiraKey: i.key,
        title: ours?.title || i.fields.summary,
        ourEstimate: ours?.final_estimate || null,
        jiraStoryPoints: jiraSP,
        jiraStatus: i.fields.status?.name,
        difference: (!isNaN(ourEst) && jiraSP != null) ? ourEst - jiraSP : null,
      };
    });

    res.json({
      comparisons,
      stats: computeStats(comparisons),
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// --- Stats computation ---

function computeStats(comparisons) {
  const paired = comparisons.filter(c => c.difference != null);
  if (!paired.length) return null;

  const diffs = paired.map(c => c.difference);
  const absDiffs = diffs.map(Math.abs);

  const avgDiff = Math.round((diffs.reduce((a, b) => a + b, 0) / diffs.length) * 10) / 10;
  const avgAbsDiff = Math.round((absDiffs.reduce((a, b) => a + b, 0) / absDiffs.length) * 10) / 10;

  const exact = diffs.filter(d => d === 0).length;
  const over = diffs.filter(d => d > 0).length;
  const under = diffs.filter(d => d < 0).length;

  // Pearson correlation
  let correlation = null;
  if (paired.length >= 3) {
    const xs = paired.map(c => parseFloat(c.ourEstimate));
    const ys = paired.map(c => c.jiraStoryPoints);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const num = xs.reduce((sum, x, i) => sum + (x - mx) * (ys[i] - my), 0);
    const denX = Math.sqrt(xs.reduce((sum, x) => sum + (x - mx) ** 2, 0));
    const denY = Math.sqrt(ys.reduce((sum, y) => sum + (y - my) ** 2, 0));
    if (denX > 0 && denY > 0) {
      correlation = Math.round((num / (denX * denY)) * 100) / 100;
    }
  }

  return {
    totalCompared: paired.length,
    avgDifference: avgDiff,
    avgAbsDifference: avgAbsDiff,
    correlation,
    exactMatches: exact,
    overEstimated: over,
    underEstimated: under,
  };
}

module.exports = router;
