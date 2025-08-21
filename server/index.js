const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { Chess } = require('chess.js');

const PORT = process.env.PORT || 3001;

const app = express();
// Allow any origin in dev to avoid CORS issues while testing
app.use(cors({ origin: true }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

/**
 * Room structure:
 * rooms[roomId] = {
 *   chess: Chess,
 *   players: { white: socketId|null, black: socketId|null },
 *   messages: Array<{ senderId: string, name?: string, text: string, ts: number }>,
 *   createdAt: number
 * }
 */
const rooms = new Map();

function generateRoomId() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i += 1) {
    id += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return id;
}

function getPlayerColor(room, socketId) {
  if (!room) return null;
  if (room.players.white === socketId) return 'w';
  if (room.players.black === socketId) return 'b';
  return null;
}

function roomSummary(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  const { chess, players, messages = [] } = room;
  return {
    roomId,
    fen: chess.fen(),
    turn: chess.turn(),
    isGameOver: chess.isGameOver(),
    inCheck: chess.inCheck(),
    inCheckmate: chess.isCheckmate(),
    inDraw: chess.isDraw(),
    moves: chess.history(),
    players: {
      white: Boolean(players.white),
      black: Boolean(players.black)
    },
    messages: messages.slice(-50)
  };
}

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);
  socket.on('createGame', (_payload, callback) => {
    let roomId = generateRoomId();
    while (rooms.has(roomId)) {
      roomId = generateRoomId();
    }

    const chess = new Chess();
    const room = {
      chess,
      players: { white: socket.id, black: null },
      messages: [],
      createdAt: Date.now()
    };
    rooms.set(roomId, room);

    socket.join(roomId);
    if (typeof callback === 'function') {
      callback({ roomId, color: 'w', state: roomSummary(roomId) });
    }
    io.to(roomId).emit('state', roomSummary(roomId));
  });

  socket.on('joinGame', (payload, callback) => {
    const { roomId } = payload || {};
    const room = rooms.get(roomId);
    if (!room) {
      if (typeof callback === 'function') callback({ error: 'Room not found' });
      return;
    }
    if (room.players.white && room.players.black) {
      if (typeof callback === 'function') callback({ error: 'Room full' });
      return;
    }
    const color = room.players.white ? 'b' : 'w';
    room.players[color === 'w' ? 'white' : 'black'] = socket.id;
    rooms.set(roomId, room);
    socket.join(roomId);
    if (typeof callback === 'function') {
      callback({ roomId, color, state: roomSummary(roomId) });
    }
    io.to(roomId).emit('state', roomSummary(roomId));
  });

  socket.on('makeMove', (payload, callback) => {
    const { roomId, from, to, promotion } = payload || {};
    const room = rooms.get(roomId);
    if (!room) {
      if (typeof callback === 'function') callback({ error: 'Room not found' });
      return;
    }
    const color = getPlayerColor(room, socket.id);
    if (!color) {
      if (typeof callback === 'function') callback({ error: 'Not a player in this room' });
      return;
    }
    const expectedTurn = room.chess.turn();
    if (expectedTurn !== color) {
      if (typeof callback === 'function') callback({ error: 'Not your turn' });
      return;
    }

    let moveResult;
    try {
      moveResult = room.chess.move({ from, to, promotion });
    } catch (err) {
      if (typeof callback === 'function') callback({ error: 'Illegal move' });
      return;
    }
    if (!moveResult) {
      if (typeof callback === 'function') callback({ error: 'Illegal move' });
      return;
    }

    io.to(roomId).emit('state', roomSummary(roomId));
    if (typeof callback === 'function') callback({ ok: true, state: roomSummary(roomId) });
  });

  socket.on('chatMessage', (payload, callback) => {
    const { roomId, text, name } = payload || {};
    if (!text || typeof text !== 'string') {
      if (typeof callback === 'function') callback({ error: 'Empty message' });
      return;
    }
    const room = rooms.get(roomId);
    if (!room) {
      if (typeof callback === 'function') callback({ error: 'Room not found' });
      return;
    }
    const message = { senderId: socket.id, name, text: String(text).slice(0, 500), ts: Date.now() };
    if (!room.messages) room.messages = [];
    room.messages.push(message);
    // Trim to last 200 messages to avoid unbounded growth
    if (room.messages.length > 200) room.messages = room.messages.slice(-200);
    rooms.set(roomId, room);
    io.to(roomId).emit('chatMessage', message);
    if (typeof callback === 'function') callback({ ok: true });
  });

  socket.on('requestState', (payload, callback) => {
    const { roomId } = payload || {};
    if (!rooms.has(roomId)) {
      if (typeof callback === 'function') callback({ error: 'Room not found' });
      return;
    }
    if (typeof callback === 'function') callback({ state: roomSummary(roomId) });
  });

  socket.on('leaveGame', (payload) => {
    const { roomId } = payload || {};
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.players.white === socket.id) room.players.white = null;
    if (room.players.black === socket.id) room.players.black = null;
    socket.leave(roomId);
    io.to(roomId).emit('state', roomSummary(roomId));
    if (!room.players.white && !room.players.black) {
      rooms.delete(roomId);
    }
  });

  socket.on('disconnect', () => {
    // Clean up player references in rooms
    for (const [roomId, room] of rooms.entries()) {
      if (room.players.white === socket.id) room.players.white = null;
      if (room.players.black === socket.id) room.players.black = null;
      if (!room.players.white && !room.players.black) {
        rooms.delete(roomId);
      } else {
        io.to(roomId).emit('state', roomSummary(roomId));
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});


