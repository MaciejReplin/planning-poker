const express = require('express');
const http = require('http');
const path = require('path');
const { getDb } = require('./src/db');
const { setupWebSocket } = require('./src/ws/handler');
const roomsRouter = require('./src/routes/rooms');
const historyRouter = require('./src/routes/history');
const jiraRouter = require('./src/routes/jira');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/rooms', roomsRouter);
app.use('/api/rooms', historyRouter);
app.use('/api/compare', jiraRouter);

const server = http.createServer(app);

// Initialize DB
getDb();

// Attach WebSocket
setupWebSocket(server);

const HOST = process.env.HOST || '::';
server.listen(PORT, HOST, () => {
  console.log(`Planning Poker running on port ${PORT}`);
});
