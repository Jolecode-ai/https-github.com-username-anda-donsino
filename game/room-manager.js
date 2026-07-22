const RNG = require('./rng');

/**
 * Don'Sino Room Manager
 * Handles room creation, player management, and game lifecycle
 */

class RoomManager {
  constructor() {
    this.rooms = new Map();      // code -> Room
    this.playerRooms = new Map(); // socketId -> roomCode
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

    room.players.push(player);
    this.playerRooms.set(socket.id, code);
    socket.join(code);

    return { room, player };
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

    // If room is empty, delete it
    if (room.players.length === 0) {
      this.rooms.delete(code);
      return { room: null, deleted: true, code };
    }

    // If host left, transfer to next player
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
      players: room.players.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        chips: p.chips,
        isReady: p.isReady,
        isConnected: p.isConnected
      })),
      maxPlayers: room.maxPlayers,
      status: room.status
    };
  }
}

module.exports = RoomManager;
