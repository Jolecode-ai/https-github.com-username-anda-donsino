const RNG = require('./rng');

/**
 * Don'Sino Room Manager
 * Handles room creation, player management, and game lifecycle
 */

class RoomManager {
  constructor() {
    this.rooms = new Map();      // code -> Room
    this.playerRooms = new Map(); // socketId -> roomCode
    this.initDefaultRooms();
  }

  /**
   * Initialize 4 default public casino rooms
   */
  initDefaultRooms() {
    const defaultRooms = [
      { code: 'ROOM-1', name: '👑 Royal VIP Lounge', gameType: 'poker', maxPlayers: 9 },
      { code: 'ROOM-2', name: '🁣 Domino Gaple Club', gameType: 'gaple', maxPlayers: 4 },
      { code: 'ROOM-3', name: '🎲 High Rollers 99', gameType: 'qiuqiu', maxPlayers: 6 },
      { code: 'ROOM-4', name: '🔥 Don\'Sino Arena', gameType: 'poker', maxPlayers: 9 }
    ];

    for (const r of defaultRooms) {
      this.rooms.set(r.code, {
        code: r.code,
        name: r.name,
        gameType: r.gameType,
        host: null,
        players: [],
        maxPlayers: r.maxPlayers,
        status: 'waiting',
        isDefault: true,
        createdAt: Date.now()
      });
    }
  }

  /**
   * Get all active & public rooms for lobby list
   */
  getPublicRooms() {
    const list = [];
    for (const [code, room] of this.rooms.entries()) {
      list.push({
        code: room.code,
        name: room.name || `Room ${room.code}`,
        gameType: room.gameType,
        playerCount: room.players.length,
        maxPlayers: room.maxPlayers,
        status: room.status,
        isDefault: !!room.isDefault
      });
    }
    return list;
  }

  /**
   * Create a new room
   */
  createRoom(gameType, hostSocket, playerName, avatar) {
    let code;
    do {
      code = RNG.generateRoomCode();
    } while (this.rooms.has(code));

    const maxPlayers = { poker: 9, gaple: 4, qiuqiu: 6 }[gameType] || 6;

    const room = {
      code,
      name: `VIP ${code}`,
      gameType,
      host: hostSocket.id,
      players: [{
        id: hostSocket.id,
        name: playerName,
        avatar: avatar || 1,
        chips: 10000,
        isReady: false,
        isConnected: true
      }],
      maxPlayers,
      status: 'waiting', // waiting | playing | finished
      gameState: null,
      createdAt: Date.now()
    };

    this.rooms.set(code, room);
    this.playerRooms.set(hostSocket.id, code);
    hostSocket.join(code);

    return room;
  }

  /**
   * Join an existing room
   */
  joinRoom(code, socket, playerName, avatar) {
    const room = this.rooms.get(code);
    if (!room) return { error: 'Room tidak ditemukan' };
    if (room.status !== 'waiting') return { error: 'Game sudah dimulai' };
    if (room.players.length >= room.maxPlayers) return { error: 'Room sudah penuh' };
    if (room.players.some(p => p.id === socket.id)) return { error: 'Kamu sudah di room ini' };

    const player = {
      id: socket.id,
      name: playerName,
      avatar: avatar || 1,
      chips: 10000,
      isReady: false,
      isConnected: true
    };

    // If default room has no host, first joining player becomes host
    if (!room.host) {
      room.host = socket.id;
    }

    room.players.push(player);
    this.playerRooms.set(socket.id, code);
    socket.join(code);

    return { room, player };
  }

  /**
   * Add an AI bot to the room
   */
  addBot(code) {
    const room = this.rooms.get(code);
    if (!room) return { error: 'Room tidak ditemukan' };
    if (room.status !== 'waiting') return { error: 'Game sudah dimulai' };
    if (room.players.length >= room.maxPlayers) return { error: 'Room sudah penuh' };

    const botNames = ['Bot Lucky 🤖', 'Bot Dealer 🤖', 'Bot Joker 🤖', 'Bot Viper 🤖', 'Bot Shadow 🤖'];
    const usedNames = room.players.map(p => p.name);
    const availableName = botNames.find(n => !usedNames.includes(n)) || `Bot AI ${room.players.length + 1} 🤖`;

    const botId = `bot_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const botPlayer = {
      id: botId,
      name: availableName,
      avatar: Math.floor(Math.random() * 8) + 1,
      chips: 10000,
      isReady: true, // Bots are always ready
      isConnected: true,
      isBot: true
    };

    room.players.push(botPlayer);
    this.playerRooms.set(botId, code);

    return { room, botPlayer };
  }

  /**
   * Remove player from room
   */
  leaveRoom(socketId) {
    const code = this.playerRooms.get(socketId);
    if (!code) return null;

    const room = this.rooms.get(code);
    if (!room) {
      this.playerRooms.delete(socketId);
      return null;
    }

    // Remove player
    room.players = room.players.filter(p => p.id !== socketId);
    this.playerRooms.delete(socketId);

    // If room is empty, reset status and delete if not a default public room
    if (room.players.length === 0) {
      if (room.isDefault) {
        room.status = 'waiting';
        room.host = null;
        room.gameState = null;
        return { room, deleted: false, code };
      } else {
        this.rooms.delete(code);
        return { room: null, deleted: true, code };
      }
    }

    // If host left, transfer host role to next remaining player
    if (room.host === socketId) {
      room.host = room.players[0].id;
    }

    return { room, deleted: false, code };
  }

  /**
   * Toggle player ready status
   */
  toggleReady(socketId) {
    const code = this.playerRooms.get(socketId);
    if (!code) return null;

    const room = this.rooms.get(code);
    if (!room) return null;

    const player = room.players.find(p => p.id === socketId);
    if (!player) return null;

    player.isReady = !player.isReady;
    return { room, player };
  }

  /**
   * Player sits at specific seat index
   */
  sitSeat(socketId, seatIndex) {
    const code = this.playerRooms.get(socketId);
    if (!code) return { error: 'Tidak di room' };
    const room = this.rooms.get(code);
    if (!room) return { error: 'Room tidak ditemukan' };
    if (seatIndex < 0 || seatIndex >= room.maxPlayers) return { error: 'Kursi tidak valid' };

    const seatOccupied = room.players.some(p => p.seatIndex === seatIndex && !p.isSpectator);
    if (seatOccupied) return { error: 'Kursi sudah diduduki' };

    const player = room.players.find(p => p.id === socketId);
    if (!player) return { error: 'Pemain tidak ditemukan' };

    player.seatIndex = seatIndex;
    player.isSpectator = false;
    return { room, player };
  }

  /**
   * Player stands up from table to become spectator
   */
  standUp(socketId) {
    const code = this.playerRooms.get(socketId);
    if (!code) return { error: 'Tidak di room' };
    const room = this.rooms.get(code);
    if (!room) return { error: 'Room tidak ditemukan' };

    const player = room.players.find(p => p.id === socketId);
    if (!player) return { error: 'Pemain tidak ditemukan' };

    player.isSpectator = true;
    player.seatIndex = null;
    player.isReady = false;
    return { room, player };
  }

  /**
   * Check if game can start
   */
  canStart(code) {
    const room = this.rooms.get(code);
    if (!room) return false;
    if (room.players.length < 2) return false;
    // All non-host players must be ready
    return room.players
      .filter(p => p.id !== room.host)
      .every(p => p.isReady);
  }

  /**
   * Get room by code
   */
  getRoom(code) {
    return this.rooms.get(code);
  }

  /**
   * Get room by player socket id
   */
  getRoomByPlayer(socketId) {
    const code = this.playerRooms.get(socketId);
    return code ? this.rooms.get(code) : null;
  }

  /**
   * Get room code by player socket id
   */
  getRoomCode(socketId) {
    return this.playerRooms.get(socketId);
  }

  /**
   * Handle player disconnect (mark as disconnected, don't remove immediately)
   */
  handleDisconnect(socketId) {
    const code = this.playerRooms.get(socketId);
    if (!code) return null;

    const room = this.rooms.get(code);
    if (!room) return null;

    const player = room.players.find(p => p.id === socketId);
    if (player) {
      player.isConnected = false;
    }

    // If game is waiting, remove player
    if (room.status === 'waiting') {
      return this.leaveRoom(socketId);
    }

    // If game is playing, mark disconnected (auto-fold/pass)
    return { room, disconnected: true, code };
  }

  /**
   * Handle player reconnect
   */
  handleReconnect(oldSocketId, newSocketId, newSocket) {
    const code = this.playerRooms.get(oldSocketId);
    if (!code) return null;

    const room = this.rooms.get(code);
    if (!room) return null;

    const player = room.players.find(p => p.id === oldSocketId);
    if (!player) return null;

    // Update socket id
    player.id = newSocketId;
    player.isConnected = true;
    this.playerRooms.delete(oldSocketId);
    this.playerRooms.set(newSocketId, code);
    newSocket.join(code);

    if (room.host === oldSocketId) {
      room.host = newSocketId;
    }

    return { room, player };
  }

  /**
   * Get sanitized room info (safe to send to clients)
   */
  getRoomInfo(code) {
    const room = this.rooms.get(code);
    if (!room) return null;

    return {
      code: room.code,
      gameType: room.gameType,
      host: room.host,
      players: room.players.map((p, idx) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        chips: p.chips,
        isReady: p.isReady,
        isConnected: p.isConnected,
        isBot: !!p.isBot,
        isSpectator: !!p.isSpectator,
        seatIndex: p.seatIndex !== undefined && p.seatIndex !== null ? p.seatIndex : idx
      })),
      maxPlayers: room.maxPlayers,
      status: room.status
    };
  }
}

module.exports = RoomManager;
