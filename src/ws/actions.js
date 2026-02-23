const { getDb } = require('../db');
const { getScale } = require('../scales');
const { getRoomState } = require('./roomState');

function broadcast(room, message) {
  const data = JSON.stringify(message);
  for (const ws of room.participants.values()) {
    if (ws.readyState === 1) ws.send(data);
  }
}

function sendTo(ws, message) {
  if (ws.readyState === 1) ws.send(JSON.stringify(message));
}

function sendError(ws, msg) {
  sendTo(ws, { type: 'error', message: msg });
}

function isHost(room, name) {
  return room.host === name;
}

function handleStartVoting(room, name, payload) {
  if (!isHost(room, name)) return sendError(room.participants.get(name), 'Only the host can start voting');

  const { jiraKey, jiraUrl, title } = payload;
  if (!title && !jiraKey) return sendError(room.participants.get(name), 'Provide a ticket title or key');

  const db = getDb();
  const roomRow = db.prepare('SELECT * FROM rooms WHERE id = ?').get(room._roomId);
  if (!roomRow) return;

  const result = db.prepare(
    'INSERT INTO estimations (room_id, jira_key, jira_url, title, status) VALUES (?, ?, ?, ?, ?)'
  ).run(room._roomId, jiraKey || null, jiraUrl || null, title || jiraKey, 'voting');

  room.currentEstimation = {
    id: result.lastInsertRowid,
    jiraKey: jiraKey || null,
    jiraUrl: jiraUrl || null,
    title: title || jiraKey,
    status: 'voting',
  };
  room.votes.clear();

  broadcast(room, {
    type: 'voting_started',
    estimation: room.currentEstimation,
  });
}

function handleVote(room, name, payload) {
  if (!room.currentEstimation || room.currentEstimation.status !== 'voting') {
    return sendError(room.participants.get(name), 'No active voting round');
  }

  const db = getDb();
  const roomRow = db.prepare('SELECT * FROM rooms WHERE id = ?').get(room._roomId);
  const scale = getScale(roomRow.scale_type, roomRow.custom_scale);

  if (!scale.includes(payload.value)) {
    return sendError(room.participants.get(name), 'Invalid vote value');
  }

  room.votes.set(name, payload.value);

  // Persist vote
  db.prepare(
    'INSERT INTO votes (estimation_id, participant, value) VALUES (?, ?, ?) ON CONFLICT(estimation_id, participant) DO UPDATE SET value = ?'
  ).run(room.currentEstimation.id, name, payload.value, payload.value);

  broadcast(room, {
    type: 'vote_cast',
    participant: name,
    totalVotes: room.votes.size,
    totalParticipants: room.participants.size,
  });
}

function computeStats(votes) {
  const values = [...votes.values()];
  const numeric = values.map(Number).filter(v => !isNaN(v));
  const stats = {};

  if (numeric.length > 0) {
    stats.average = Math.round((numeric.reduce((a, b) => a + b, 0) / numeric.length) * 10) / 10;
    const sorted = [...numeric].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    stats.median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  const allSame = values.length > 0 && values.every(v => v === values[0]);
  stats.consensus = allSame;

  return stats;
}

function handleReveal(room, name) {
  if (!isHost(room, name)) return sendError(room.participants.get(name), 'Only the host can reveal');
  if (!room.currentEstimation || room.currentEstimation.status !== 'voting') {
    return sendError(room.participants.get(name), 'No active voting round');
  }

  room.currentEstimation.status = 'revealed';
  const db = getDb();
  db.prepare('UPDATE estimations SET status = ? WHERE id = ?').run('revealed', room.currentEstimation.id);

  const voteEntries = [...room.votes.entries()].map(([participant, value]) => ({ participant, value }));
  const stats = computeStats(room.votes);

  broadcast(room, {
    type: 'votes_revealed',
    votes: voteEntries,
    stats,
    estimation: room.currentEstimation,
  });
}

function handleAccept(room, name, payload) {
  if (!isHost(room, name)) return sendError(room.participants.get(name), 'Only the host can accept');
  if (!room.currentEstimation || room.currentEstimation.status !== 'revealed') {
    return sendError(room.participants.get(name), 'Reveal votes first');
  }

  const finalEstimate = payload.finalEstimate || null;
  const jiraSp = payload.jiraSp || null;
  room.currentEstimation.status = 'accepted';
  room.currentEstimation.finalEstimate = finalEstimate;

  const db = getDb();
  db.prepare('UPDATE estimations SET status = ?, final_estimate = ?, jira_sp = ? WHERE id = ?')
    .run('accepted', finalEstimate, jiraSp, room.currentEstimation.id);

  broadcast(room, {
    type: 'estimate_accepted',
    estimation: { ...room.currentEstimation, finalEstimate },
  });

  room.currentEstimation = null;
  room.votes.clear();
}

function handleRevote(room, name) {
  if (!isHost(room, name)) return sendError(room.participants.get(name), 'Only the host can trigger re-vote');
  if (!room.currentEstimation) return sendError(room.participants.get(name), 'No active estimation');

  // Delete old votes from DB
  const db = getDb();
  db.prepare('DELETE FROM votes WHERE estimation_id = ?').run(room.currentEstimation.id);

  room.currentEstimation.status = 'voting';
  db.prepare('UPDATE estimations SET status = ? WHERE id = ?').run('voting', room.currentEstimation.id);

  room.votes.clear();

  broadcast(room, {
    type: 'voting_started',
    estimation: room.currentEstimation,
  });
}

function handleKick(room, name, payload) {
  if (!isHost(room, name)) return sendError(room.participants.get(name), 'Only the host can kick');
  const target = payload.participant;
  if (target === name) return sendError(room.participants.get(name), 'Cannot kick yourself');

  const targetWs = room.participants.get(target);
  if (targetWs) {
    sendTo(targetWs, { type: 'kicked' });
    targetWs.close();
  }
}

function handleChangeScale(room, name, payload) {
  if (!isHost(room, name)) return sendError(room.participants.get(name), 'Only the host can change scale');

  const { scaleType, customScale } = payload;
  const db = getDb();
  const custom = scaleType === 'custom' && customScale
    ? JSON.stringify(customScale.split(',').map(s => s.trim()).filter(Boolean))
    : null;

  db.prepare('UPDATE rooms SET scale_type = ?, custom_scale = ? WHERE id = ?')
    .run(scaleType, custom, room._roomId);

  const scale = getScale(scaleType, custom);

  broadcast(room, {
    type: 'scale_changed',
    scale,
    scaleType,
  });
}

module.exports = {
  handleStartVoting,
  handleVote,
  handleReveal,
  handleAccept,
  handleRevote,
  handleKick,
  handleChangeScale,
  broadcast,
  sendTo,
  sendError,
};
