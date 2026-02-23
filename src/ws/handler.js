const { WebSocketServer } = require('ws');
const url = require('url');
const { getDb } = require('../db');
const { ensureRoom, getRoom, removeRoom, getRoomState } = require('./roomState');
const actions = require('./actions');

function setupWebSocket(server) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    const params = new URL(req.url, 'http://localhost').searchParams;
    const roomId = params.get('room');
    const name = params.get('name');

    if (!roomId || !name) {
      ws.send(JSON.stringify({ type: 'error', message: 'Missing room or name' }));
      ws.close();
      return;
    }

    // Verify room exists in DB
    const db = getDb();
    const roomRow = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
    if (!roomRow) {
      ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
      ws.close();
      return;
    }

    const room = ensureRoom(roomId);
    room._roomId = roomId;

    // Check duplicate name
    if (room.participants.has(name)) {
      ws.send(JSON.stringify({ type: 'error', message: 'Name already taken in this room' }));
      ws.close();
      return;
    }

    // Add participant
    room.participants.set(name, ws);
    if (!room.host) room.host = name;

    // Send full state to new joiner
    const { getScale } = require('../scales');
    const scale = getScale(roomRow.scale_type, roomRow.custom_scale);

    actions.sendTo(ws, {
      type: 'room_state',
      room: { id: roomRow.id, name: roomRow.name, scale, scaleType: roomRow.scale_type },
      ...getRoomState(room),
    });

    // Notify others
    actions.broadcast(room, {
      type: 'participant_joined',
      participant: name,
      participants: getRoomState(room).participants,
    });

    // Handle messages
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      switch (msg.type) {
        case 'start_voting': actions.handleStartVoting(room, name, msg); break;
        case 'vote':         actions.handleVote(room, name, msg); break;
        case 'reveal':       actions.handleReveal(room, name); break;
        case 'accept':       actions.handleAccept(room, name, msg); break;
        case 'revote':       actions.handleRevote(room, name); break;
        case 'kick':         actions.handleKick(room, name, msg); break;
        case 'change_scale': actions.handleChangeScale(room, name, msg); break;
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      room.participants.delete(name);
      room.votes.delete(name);

      if (room.participants.size === 0) {
        removeRoom(roomId);
        return;
      }

      // Promote new host if host left
      if (room.host === name) {
        room.host = room.participants.keys().next().value;
        actions.broadcast(room, {
          type: 'host_changed',
          host: room.host,
        });
      }

      actions.broadcast(room, {
        type: 'participant_left',
        participant: name,
        participants: getRoomState(room).participants,
      });
    });
  });
}

module.exports = { setupWebSocket };
