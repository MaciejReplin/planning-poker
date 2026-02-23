// In-memory room state
// { roomId: { participants: Map<name, ws>, host: string, currentEstimation: {...}, votes: Map<name, value> } }
const rooms = new Map();

function getRoom(roomId) {
  return rooms.get(roomId);
}

function createRoom(roomId) {
  const room = {
    participants: new Map(),   // name -> ws
    host: null,
    currentEstimation: null,   // { id, jiraKey, jiraUrl, title, status }
    votes: new Map(),          // name -> value
  };
  rooms.set(roomId, room);
  return room;
}

function ensureRoom(roomId) {
  return rooms.get(roomId) || createRoom(roomId);
}

function removeRoom(roomId) {
  rooms.delete(roomId);
}

function getRoomState(room) {
  const participants = [];
  for (const name of room.participants.keys()) {
    participants.push({
      name,
      isHost: name === room.host,
      hasVoted: room.votes.has(name),
    });
  }

  return {
    host: room.host,
    participants,
    currentEstimation: room.currentEstimation,
    votedNames: [...room.votes.keys()],
  };
}

module.exports = { getRoom, createRoom, ensureRoom, removeRoom, getRoomState };
