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

    // Mutable name ref so rename can update it for close/message handlers
    const ctx = { name };

    // Add participant
    room.participants.set(ctx.name, ws);
    if (!room.host) room.host = ctx.name;

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
      participant: ctx.name,
      participants: getRoomState(room).participants,
    });

    // Handle messages
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      const n = ctx.name;

      switch (msg.type) {
        case 'ping':          ws.send(JSON.stringify({ type: 'pong' })); break;
        case 'start_voting':  actions.handleStartVoting(room, n, msg); break;
        case 'vote':          actions.handleVote(room, n, msg); break;
        case 'reveal':        actions.handleReveal(room, n); break;
        case 'accept':        actions.handleAccept(room, n, msg); break;
        case 'revote':        actions.handleRevote(room, n); break;
        case 'kick':          actions.handleKick(room, n, msg); break;
        case 'transfer_host': actions.handleTransferHost(room, n, msg); break;
        case 'change_scale':  actions.handleChangeScale(room, n, msg); break;
        case 'rename':        actions.handleRename(room, ctx, msg); break;
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      const n = ctx.name;
      room.participants.delete(n);
      room.votes.delete(n);

      if (room.participants.size === 0) {
        removeRoom(roomId);
        return;
      }

      // Promote new host if host left
      if (room.host === n) {
        room.host = room.participants.keys().next().value;
        actions.broadcast(room, {
          type: 'host_changed',
          host: room.host,
        });
      }

      actions.broadcast(room, {
        type: 'participant_left',
        participant: n,
        participants: getRoomState(room).participants,
      });
    });
  });
}

module.exports = { setupWebSocket };
