const { Router } = require('express');
const { getDb } = require('../db');

const router = Router();

// Get estimation history for a room
router.get('/:id/history', (req, res) => {
  const db = getDb();
  const room = db.prepare('SELECT id FROM rooms WHERE id = ?').get(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const estimations = db.prepare(
    `SELECT * FROM estimations WHERE room_id = ? AND status = 'accepted' ORDER BY created_at DESC`
  ).all(req.params.id);

  const voteStmt = db.prepare('SELECT participant, value FROM votes WHERE estimation_id = ?');
  const result = estimations.map(e => ({
    ...e,
    votes: voteStmt.all(e.id),
  }));

  res.json(result);
});

// CSV export
router.get('/:id/history/export', (req, res) => {
  const db = getDb();
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const estimations = db.prepare(
    `SELECT * FROM estimations WHERE room_id = ? AND status = 'accepted' ORDER BY created_at DESC`
  ).all(req.params.id);

  const voteStmt = db.prepare('SELECT participant, value FROM votes WHERE estimation_id = ?');

  // Collect all unique participants
  const allParticipants = new Set();
  const estimationData = estimations.map(e => {
    const votes = voteStmt.all(e.id);
    votes.forEach(v => allParticipants.add(v.participant));
    return { ...e, votes };
  });

  const participants = [...allParticipants].sort();
  const csvEscape = (val) => {
    if (val == null) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const header = ['Jira Key', 'Title', 'URL', 'Final Estimate', 'Jira SP', 'Date', ...participants].map(csvEscape).join(',');
  const rows = estimationData.map(e => {
    const voteMap = Object.fromEntries(e.votes.map(v => [v.participant, v.value]));
    const cols = [
      e.jira_key, e.title, e.jira_url, e.final_estimate, e.jira_sp, e.created_at,
      ...participants.map(p => voteMap[p] || ''),
    ];
    return cols.map(csvEscape).join(',');
  });

  const csv = [header, ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${room.name}-estimations.csv"`);
  res.send(csv);
});

// Leaderboard
router.get('/:id/leaderboard', (req, res) => {
  const db = getDb();
  const room = db.prepare('SELECT id, name FROM rooms WHERE id = ?').get(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  // Get all accepted estimations with numeric final_estimate
  const estimations = db.prepare(
    `SELECT id, final_estimate FROM estimations WHERE room_id = ? AND status = 'accepted'`
  ).all(req.params.id).filter(e => !isNaN(parseFloat(e.final_estimate)));

  if (!estimations.length) {
    return res.json({ room, leaderboard: [] });
  }

  const voteStmt = db.prepare('SELECT participant, value FROM votes WHERE estimation_id = ?');
  const stats = {}; // name -> { total, exact, diffs[] }

  for (const est of estimations) {
    const finalVal = parseFloat(est.final_estimate);
    const votes = voteStmt.all(est.id);

    for (const v of votes) {
      const voteVal = parseFloat(v.value);
      if (isNaN(voteVal)) continue; // skip ?, coffee

      if (!stats[v.participant]) {
        stats[v.participant] = { total: 0, exact: 0, withinOne: 0, diffs: [] };
      }

      const s = stats[v.participant];
      const diff = voteVal - finalVal;
      s.total++;
      s.diffs.push(diff);
      if (diff === 0) s.exact++;
      if (Math.abs(diff) <= 1) s.withinOne++;
    }
  }

  const leaderboard = Object.entries(stats).map(([name, s]) => {
    const absDiffs = s.diffs.map(Math.abs);
    const avgDiff = Math.round((absDiffs.reduce((a, b) => a + b, 0) / s.total) * 10) / 10;
    const bias = Math.round((s.diffs.reduce((a, b) => a + b, 0) / s.total) * 10) / 10;

    return {
      name,
      totalVotes: s.total,
      exactMatches: s.exact,
      withinOne: s.withinOne,
      accuracyPct: Math.round((s.exact / s.total) * 100),
      withinOnePct: Math.round((s.withinOne / s.total) * 100),
      avgDiff,
      bias, // positive = tends to overestimate
    };
  }).sort((a, b) => b.accuracyPct - a.accuracyPct || a.avgDiff - b.avgDiff);

  // Assign rank with ties
  let rank = 1;
  leaderboard.forEach((entry, i) => {
    if (i > 0 && entry.accuracyPct !== leaderboard[i - 1].accuracyPct) rank = i + 1;
    entry.rank = rank;
  });

  res.json({ room, leaderboard });
});

module.exports = router;
