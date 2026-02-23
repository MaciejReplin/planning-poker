const { Router } = require('express');
const { getDb } = require('../db');

const router = Router();

// --- Compare: per room ---

router.get('/compare/room/:roomId', (req, res) => {
  const db = getDb();
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const estimations = db.prepare(
    `SELECT * FROM estimations WHERE room_id = ? AND status = 'accepted' AND jira_sp IS NOT NULL AND jira_sp != ''`
  ).all(req.params.roomId);

  if (!estimations.length) {
    return res.json({ room: { id: room.id, name: room.name }, comparisons: [], stats: null });
  }

  const comparisons = estimations.map(e => {
    const ourEst = parseFloat(e.final_estimate);
    const jiraSP = parseFloat(e.jira_sp);
    return {
      jiraKey: e.jira_key,
      title: e.title,
      ourEstimate: e.final_estimate,
      jiraStoryPoints: isNaN(jiraSP) ? e.jira_sp : jiraSP,
      difference: (!isNaN(ourEst) && !isNaN(jiraSP)) ? Math.round((ourEst - jiraSP) * 10) / 10 : null,
      estimatedAt: e.created_at,
    };
  });

  res.json({
    room: { id: room.id, name: room.name },
    comparisons,
    stats: computeStats(comparisons),
  });
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
    const ys = paired.map(c => parseFloat(c.jiraStoryPoints));
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
