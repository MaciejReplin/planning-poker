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

  const header = ['Jira Key', 'Title', 'URL', 'Final Estimate', 'Date', ...participants].map(csvEscape).join(',');
  const rows = estimationData.map(e => {
    const voteMap = Object.fromEntries(e.votes.map(v => [v.participant, v.value]));
    const cols = [
      e.jira_key, e.title, e.jira_url, e.final_estimate, e.created_at,
      ...participants.map(p => voteMap[p] || ''),
    ];
    return cols.map(csvEscape).join(',');
  });

  const csv = [header, ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${room.name}-estimations.csv"`);
  res.send(csv);
});

module.exports = router;
