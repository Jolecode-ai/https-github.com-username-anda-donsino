const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const RoomManager = require('./game/room-manager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000
});

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Room manager
const roomManager = new RoomManager();

// Game engine imports (lazy loaded)
let PokerEngine, GapleEngine, QiuQiuEngine;
try { PokerEngine = require('./game/poker/engine'); } catch(e) { console.warn('Poker engine not loaded:', e.message); }
try { GapleEngine = require('./game/gaple/engine'); } catch(e) { console.warn('Gaple engine not loaded:', e.message); }
try { QiuQiuEngine = require('./game/qiuqiu/engine'); } catch(e) { console.warn('QiuQiu engine not loaded:', e.message); }

// Active game instances: roomCode -> engine instance
const activeGames = new Map();

// Turn timers: roomCode -> timeout
const turnTimers = new Map();

const TURN_TIMEOUT = 30000; // 30 seconds

/**
 * Execute an AI Bot action automatically
 */
function executeBotTurn(roomCode, botId) {
  const engine = activeGames.get(roomCode);
  const room = roomManager.getRoom(roomCode);
  if (!engine || !room) return;

  const currentPlayer = engine.state.players[engine.state.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== botId) return;

  let result;
  try {
    if (room.gameType === 'gaple') {
      const validMoves = engine.getValidMoves(botId);
      if (validMoves.length > 0) {
        const move = validMoves[Math.floor(Math.random() * validMoves.length)];
        const side = move.sides[Math.floor(Math.random() * move.sides.length)];
        result = engine.handlePlay(botId, move.tileIndex, side);
      } else if (room.players.length === 2 && engine.state.bonePile.length > 0) {
        result = engine.handleDraw(botId);
      } else {
        result = engine.handlePass(botId);
      }
    } else {
      // Poker or Qiu Qiu
      const toCall = (engine.state.currentBet || 0) - (currentPlayer.currentBet || 0);
      if (toCall <= 0) {
        result = engine.handleAction(botId, 'check');
      } else if (toCall <= currentPlayer.chips) {
        result = engine.handleAction(botId, 'call');
      } else {
        result = engine.handleAction(botId, 'fold');
      }
    }
  } catch (err) {
    try { result = engine.handleTimeout(botId); } catch (e) { }
  }

  if (result && result.events) broadcastEvents(roomCode, result.events);
  sendPlayerViews(roomCode);

  // Check next turn
  checkGameState(roomCode);
}

/**
 * Start a turn timer for the current player
 */
function startTurnTimer(roomCode, playerId) {
  clearTurnTimer(roomCode);

  // Check if player is AI Bot
  if (playerId && (playerId.startsWith('bot_') || roomManager.getRoom(roomCode)?.players.find(p=>p.id===playerId)?.isBot)) {
    const timer = setTimeout(() => {
      executeBotTurn(roomCode, playerId);
    }, 1200);
    turnTimers.set(roomCode, timer);
    return;
  }

  const timer = setTimeout(() => {
    const engine = activeGames.get(roomCode);
    if (!engine) return;
    
    const events = engine.handleTimeout(playerId);
    if (events && events.events) {
      broadcastEvents(roomCode, events.events);
      checkGameState(roomCode);
    }
  }, TURN_TIMEOUT);
  turnTimers.set(roomCode, timer);
}

function clearTurnTimer(roomCode) {
  const timer = turnTimers.get(roomCode);
  if (timer) {
    clearTimeout(timer);
    turnTimers.delete(roomCode);
  }
}

/**
 * Broadcast events to room players
 */
function broadcastEvents(roomCode, events) {
  if (!events) return;
  for (const event of events) {
    if (event.playerId) {
      // Private event - send only to specific player
      io.to(event.playerId).emit(event.type, event.data);
    } else {
      // Public event - broadcast to room
      io.to(roomCode).emit(event.type, event.data);
    }
  }
}

/**
 * Check game state and handle phase transitions
 */
function checkGameState(roomCode) {
  const engine = activeGames.get(roomCode);
  const room = roomManager.getRoom(roomCode);
  if (!engine || !room) return;

  // Send updated view to each player
  for (const player of room.players) {
    const view = engine.getPlayerView(player.id);
    io.to(player.id).emit('game:state', view);
  }

  // Start turn timer for current player if game is still active
  if (engine.state && engine.state.phase !== 'showdown' && engine.state.phase !== 'waiting' && 
      engine.state.phase !== 'roundEnd' && engine.state.phase !== 'gameEnd') {
    const currentPlayer = engine.state.players[engine.state.currentPlayerIndex];
    if (currentPlayer && !currentPlayer.hasFolded && !currentPlayer.isAllIn) {
      startTurnTimer(roomCode, currentPlayer.id);
    }
  }
}

/**
 * Send updated player views to all players in a room
 */
function sendPlayerViews(roomCode) {
  const engine = activeGames.get(roomCode);
  const room = roomManager.getRoom(roomCode);
  if (!engine || !room) return;

  for (const player of room.players) {
    const view = engine.getPlayerView(player.id);
    io.to(player.id).emit('game:state', view);
  }
}

// ─── Socket.IO Connection Handler ──────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ─── Room Events ──────────────────────────────────────────

  socket.on('create-room', ({ gameType, playerName, avatar }, callback) => {
    const room = roomManager.createRoom(gameType, socket, playerName, avatar);
    console.log(`[Room] Created ${room.code} (${gameType}) by ${playerName}`);
    callback({ success: true, room: roomManager.getRoomInfo(room.code) });
  });

  socket.on('join-room', ({ code, playerName, avatar }, callback) => {
    const result = roomManager.joinRoom(code.toUpperCase(), socket, playerName, avatar);
    if (result.error) {
      callback({ success: false, error: result.error });
      return;
    }
    console.log(`[Room] ${playerName} joined ${code}`);
    
    // Notify all players in room
    io.to(code.toUpperCase()).emit('room:updated', roomManager.getRoomInfo(code.toUpperCase()));
    callback({ success: true, room: roomManager.getRoomInfo(code.toUpperCase()) });
  });

  socket.on('rooms:get', (callback) => {
    if (callback) callback({ rooms: roomManager.getPublicRooms() });
  });

  socket.on('emoji:reaction', ({ emoji }) => {
    const code = roomManager.getRoomCode(socket.id);
    if (!code) return;
    const room = roomManager.getRoom(code);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    io.to(code).emit('emoji:received', {
      senderId: socket.id,
      senderName: player.name,
      emoji: emoji
    });
  });

  socket.on('leave-room', (callback) => {
    const result = roomManager.leaveRoom(socket.id);
    if (result && !result.deleted) {
      io.to(result.code).emit('room:updated', roomManager.getRoomInfo(result.code));
    }
    io.emit('lobby:rooms-updated', roomManager.getPublicRooms());
    socket.leave(result?.code);
    if (callback) callback({ success: true });
  });

  socket.on('add-bot', (callback) => {
    const code = roomManager.getRoomCode(socket.id);
    if (!code) {
      if (callback) callback({ success: false, error: 'Tidak ada di room' });
      return;
    }
    const result = roomManager.addBot(code);
    if (result.error) {
      if (callback) callback({ success: false, error: result.error });
      return;
    }
    io.to(code).emit('room:updated', roomManager.getRoomInfo(code));
    if (callback) callback({ success: true, bot: result.botPlayer });
  });

  socket.on('room:sit-seat', ({ seatIndex }, callback) => {
    const result = roomManager.sitSeat(socket.id, seatIndex);
    if (result.error) {
      if (callback) callback({ success: false, error: result.error });
      return;
    }
    const code = roomManager.getRoomCode(socket.id);
    io.to(code).emit('room:updated', roomManager.getRoomInfo(code));
    if (callback) callback({ success: true, seatIndex: result.player.seatIndex });
  });

  socket.on('room:stand-up', (callback) => {
    const result = roomManager.standUp(socket.id);
    if (result.error) {
      if (callback) callback({ success: false, error: result.error });
      return;
    }
    const code = roomManager.getRoomCode(socket.id);
    io.to(code).emit('room:updated', roomManager.getRoomInfo(code));
    if (callback) callback({ success: true });
  });

  socket.on('toggle-ready', (callback) => {
    const result = roomManager.toggleReady(socket.id);
    if (result) {
      const code = roomManager.getRoomCode(socket.id);
      io.to(code).emit('room:updated', roomManager.getRoomInfo(code));
      if (callback) callback({ success: true, isReady: result.player.isReady });
    }
  });

  socket.on('start-game', (callback) => {
    const code = roomManager.getRoomCode(socket.id);
    const room = roomManager.getRoom(code);
    
    if (!room) {
      callback({ success: false, error: 'Room tidak ditemukan' });
      return;
    }
    if (room.host !== socket.id) {
      callback({ success: false, error: 'Hanya host yang bisa mulai' });
      return;
    }
    if (room.players.length < 2) {
      callback({ success: false, error: 'Minimal 2 pemain' });
      return;
    }

    // Create game engine
    const players = room.players.map(p => ({ id: p.id, name: p.name, chips: p.chips }));
    let engine;

    try {
      switch (room.gameType) {
        case 'poker':
          engine = new PokerEngine(players);
          break;
        case 'gaple':
          engine = new GapleEngine(players);
          break;
        case 'qiuqiu':
          engine = new QiuQiuEngine(players);
          break;
        default:
          callback({ success: false, error: 'Game type tidak valid' });
          return;
      }
    } catch (err) {
      console.error('Engine creation error:', err);
      callback({ success: false, error: 'Gagal membuat game: ' + err.message });
      return;
    }

    activeGames.set(code, engine);
    room.status = 'playing';

    // Start first round
    const result = engine.startRound();
    
    // Notify room that game started
    io.to(code).emit('game:started', { gameType: room.gameType });
    
    // Broadcast events
    if (result && result.events) {
      broadcastEvents(code, result.events);
    }

    // Send initial game state to each player
    sendPlayerViews(code);

    // Start turn timer
    const currentPlayer = engine.state.players[engine.state.currentPlayerIndex];
    if (currentPlayer) {
      startTurnTimer(code, currentPlayer.id);
    }

    callback({ success: true });
    console.log(`[Game] ${room.gameType} started in room ${code}`);
  });

  // ─── Game Action Events ────────────────────────────────────

  socket.on('game:action', ({ action, amount, tileIndex, side }, callback) => {
    const code = roomManager.getRoomCode(socket.id);
    const engine = activeGames.get(code);
    const room = roomManager.getRoom(code);

    if (!engine || !room) {
      if (callback) callback({ success: false, error: 'Game tidak ditemukan' });
      return;
    }

    let result;
    try {
      if (room.gameType === 'gaple') {
        if (action === 'play') {
          result = engine.handlePlay(socket.id, tileIndex, side);
        } else if (action === 'pass') {
          result = engine.handlePass(socket.id);
        } else if (action === 'draw') {
          result = engine.handleDraw(socket.id);
        }
      } else {
        // Poker & Qiu Qiu use same action interface
        result = engine.handleAction(socket.id, action, amount);
      }
    } catch (err) {
      console.error('Game action error:', err);
      if (callback) callback({ success: false, error: err.message });
      return;
    }

    if (result && result.error) {
      if (callback) callback({ success: false, error: result.error });
      return;
    }

    // Broadcast events
    if (result && result.events) {
      broadcastEvents(code, result.events);
    }

    // Update player views
    sendPlayerViews(code);

    // Update player chips in room
    if (engine.state && engine.state.players) {
      for (const ep of engine.state.players) {
        const rp = room.players.find(p => p.id === ep.id);
        if (rp) rp.chips = ep.chips;
      }
    }

    // Check for round/game end
    if (engine.state && (engine.state.phase === 'showdown' || engine.state.phase === 'roundEnd' || engine.state.phase === 'gameEnd')) {
      clearTurnTimer(code);
    } else {
      // Start timer for next player
      const currentPlayer = engine.state.players[engine.state.currentPlayerIndex];
      if (currentPlayer && !currentPlayer.hasFolded && !currentPlayer.isAllIn) {
        startTurnTimer(code, currentPlayer.id);
      }
    }

    if (callback) callback({ success: true });
  });

  socket.on('game:next-round', (callback) => {
    const code = roomManager.getRoomCode(socket.id);
    const engine = activeGames.get(code);
    const room = roomManager.getRoom(code);

    if (!engine || !room) {
      if (callback) callback({ success: false, error: 'Game tidak ditemukan' });
      return;
    }

    if (room.host !== socket.id) {
      if (callback) callback({ success: false, error: 'Hanya host yang bisa lanjut ronde' });
      return;
    }

    // Start next round
    engine.nextRound();
    const result = engine.startRound();

    if (result && result.events) {
      broadcastEvents(code, result.events);
    }

    sendPlayerViews(code);

    const currentPlayer = engine.state.players[engine.state.currentPlayerIndex];
    if (currentPlayer) {
      startTurnTimer(code, currentPlayer.id);
    }

    if (callback) callback({ success: true });
  });

  socket.on('game:back-to-lobby', (callback) => {
    const code = roomManager.getRoomCode(socket.id);
    const room = roomManager.getRoom(code);

    if (!room || room.host !== socket.id) {
      if (callback) callback({ success: false });
      return;
    }

    clearTurnTimer(code);
    activeGames.delete(code);
    room.status = 'waiting';
    room.players.forEach(p => p.isReady = false);

    io.to(code).emit('game:ended');
    io.to(code).emit('room:updated', roomManager.getRoomInfo(code));

    if (callback) callback({ success: true });
  });

  // ─── Chat ──────────────────────────────────────────────────

  socket.on('chat:message', ({ message }) => {
    const code = roomManager.getRoomCode(socket.id);
    const room = roomManager.getRoom(code);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    io.to(code).emit('chat:message', {
      sender: player.name,
      message: message.slice(0, 200), // limit length
      timestamp: Date.now()
    });
  });

  // ─── Buy Chips ────────────────────────────────────────────

  socket.on('buy-chips', ({ amount }, callback) => {
    const code = roomManager.getRoomCode(socket.id);
    const room = roomManager.getRoom(code);
    if (!room) {
      if (callback) callback({ success: false, error: 'Tidak di room' });
      return;
    }

    if (room.status === 'playing') {
      if (callback) callback({ success: false, error: 'Tidak bisa beli chip saat bermain' });
      return;
    }

    const player = room.players.find(p => p.id === socket.id);
    if (!player) {
      if (callback) callback({ success: false, error: 'Player tidak ditemukan' });
      return;
    }

    const chipPackages = {
      1000: true, 5000: true, 10000: true, 25000: true, 50000: true, 100000: true
    };

    if (!chipPackages[amount]) {
      if (callback) callback({ success: false, error: 'Paket chip tidak valid' });
      return;
    }

    player.chips += amount;
    io.to(code).emit('room:updated', roomManager.getRoomInfo(code));
    if (callback) callback({ success: true, newBalance: player.chips });
  });

  // ─── Disconnect ────────────────────────────────────────────

  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    const result = roomManager.handleDisconnect(socket.id);
    
    if (result && result.code) {
      const room = roomManager.getRoom(result.code);
      if (room) {
        io.to(result.code).emit('room:updated', roomManager.getRoomInfo(result.code));
        
        // If game is active, handle the disconnected player
        const engine = activeGames.get(result.code);
        if (engine && result.disconnected) {
          // Auto-fold/pass for disconnected player
          try {
            const events = engine.handleTimeout(socket.id);
            if (events && events.events) {
              broadcastEvents(result.code, events.events);
              sendPlayerViews(result.code);
            }
          } catch (e) {
            // Player may already be folded
          }
        }

        // If room is empty after cleanup, delete game
        if (room.players.length === 0) {
          clearTurnTimer(result.code);
          activeGames.delete(result.code);
        }
      }
    }
  });
});

// ─── Start Server ──────────────────────────────────────────────────

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════╗
║                                          ║
║          🎰  DON'SINO  🎰               ║
║                                          ║
║    Poker  •  Gaple  •  Qiu Qiu          ║
║                                          ║
║    Server running on port ${PORT}           ║
║    http://localhost:${PORT}                 ║
║                                          ║
╚══════════════════════════════════════════╝
  `);
});
