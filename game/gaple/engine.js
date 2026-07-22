const RNG = require('../rng');

const TAX_RATE = 0.025;
const CHIPS_PER_POINT = 10;
const TARGET_SCORE = 300;

/**
 * Engine for the Gaple (Dominoes) game.
 */
class GapleEngine {
  /**
   * Initializes the Gaple Engine.
   * @param {Array<{id: string, name: string, chips: number}>} players
   */
  constructor(players) {
    if (!players || players.length < 2 || players.length > 4) {
      throw new Error('Gaple requires 2 to 4 players');
    }

    this.state = {
      bonePile: [],
      chain: [],  // {tile, playedBy, side: 'left'|'right'}
      leftEnd: null,
      rightEnd: null,
      currentPlayerIndex: 0,
      players: players.map(p => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        hand: [],
        hasPassed: false
      })),
      consecutivePasses: 0,
      roundNumber: 0,
      targetScore: TARGET_SCORE,
      scores: {},  // id -> cumulative score
      phase: 'waiting' // 'waiting'|'playing'|'roundEnd'|'gameEnd'
    };

    this.state.players.forEach(p => {
      this.state.scores[p.id] = 0;
    });
  }

  /**
   * Generates a standard set of 28 domino tiles.
   * @private
   */
  _generateTiles() {
    const tiles = [];
    for (let i = 0; i <= 6; i++) {
      for (let j = i; j <= 6; j++) {
        tiles.push({ top: i, bottom: j, value: i + j, isDouble: i === j });
      }
    }
    return tiles;
  }

  /**
   * Finds the player with the highest double to start the first round.
   * If no doubles, finds the highest tile value.
   * @private
   */
  _findStartingPlayerIndex() {
    let highestDouble = -1;
    let highestDoublePlayerIndex = 0;
    
    let highestTile = -1;
    let highestTilePlayerIndex = 0;

    for (let i = 0; i < this.state.players.length; i++) {
      const hand = this.state.players[i].hand;
      for (const tile of hand) {
        if (tile.isDouble && tile.top > highestDouble) {
          highestDouble = tile.top;
          highestDoublePlayerIndex = i;
        }
        if (tile.value > highestTile) {
          highestTile = tile.value;
          highestTilePlayerIndex = i;
        }
      }
    }

    if (highestDouble !== -1) {
      return highestDoublePlayerIndex;
    }
    return highestTilePlayerIndex;
  }

  /**
   * Starts a new round, dealing tiles and setting up the initial state.
   * @returns {Array<object>} Events generated.
   */
  startRound() {
    this.state.phase = 'playing';
    this.state.roundNumber++;
    this.state.chain = [];
    this.state.leftEnd = null;
    this.state.rightEnd = null;
    this.state.consecutivePasses = 0;
    this.state.players.forEach(p => {
      p.hand = [];
      p.hasPassed = false;
    });

    const rng = new RNG();
    let tiles = this._generateTiles();
    // Shuffle tiles using Fisher-Yates and RNG
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(rng.random() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }

    const numPlayers = this.state.players.length;
    let tilesPerPlayer = 7;
    if (numPlayers === 3) {
      tilesPerPlayer = 9;
    }

    for (let i = 0; i < numPlayers; i++) {
      this.state.players[i].hand = tiles.splice(0, tilesPerPlayer);
    }
    
    this.state.bonePile = tiles;

    if (this.state.roundNumber === 1) {
      this.state.currentPlayerIndex = this._findStartingPlayerIndex();
    }

    return [{
      type: 'ROUND_STARTED',
      roundNumber: this.state.roundNumber,
      currentPlayerId: this.state.players[this.state.currentPlayerIndex].id
    }];
  }

  /**
   * Gets the active player.
   * @private
   */
  _getCurrentPlayer() {
    return this.state.players[this.state.currentPlayerIndex];
  }

  /**
   * Advances the turn to the next player.
   * @private
   */
  _nextTurn() {
    this.state.currentPlayerIndex = (this.state.currentPlayerIndex + 1) % this.state.players.length;
  }

  /**
   * Helper to calculate the sum of dots in a player's hand.
   * @private
   */
  _calculateHandScore(hand) {
    return hand.reduce((sum, tile) => sum + tile.value, 0);
  }

  /**
   * Retrieves valid moves for a given player.
   * @param {string} playerId
   * @returns {Array<{tileIndex: number, sides: Array<'left'|'right'>}>} Valid moves
   */
  getValidMoves(playerId) {
    const player = this.state.players.find(p => p.id === playerId);
    if (!player || player.id !== this._getCurrentPlayer().id) {
      return [];
    }

    const moves = [];
    player.hand.forEach((tile, index) => {
      const sides = [];
      if (this.state.chain.length === 0) {
        sides.push('left', 'right');
      } else {
        if (tile.top === this.state.leftEnd || tile.bottom === this.state.leftEnd) {
          sides.push('left');
        }
        if (tile.top === this.state.rightEnd || tile.bottom === this.state.rightEnd) {
          if (!sides.includes('right')) sides.push('right'); // In case left and right ends are same and tile matches
        }
      }

      if (sides.length > 0) {
        moves.push({ tileIndex: index, sides });
      }
    });

    return moves;
  }

  /**
   * Player plays a tile on the board.
   * @param {string} playerId 
   * @param {number} tileIndex 
   * @param {'left'|'right'} side 
   */
  handlePlay(playerId, tileIndex, side) {
    const player = this._getCurrentPlayer();
    if (player.id !== playerId) {
      throw new Error('Not your turn');
    }
    
    if (this.state.phase !== 'playing') {
      throw new Error('Game is not in playing phase');
    }

    const validMoves = this.getValidMoves(playerId);
    const move = validMoves.find(m => m.tileIndex === tileIndex);

    if (!move || !move.sides.includes(side)) {
      throw new Error('Invalid move');
    }

    const tile = player.hand[tileIndex];
    player.hand.splice(tileIndex, 1);
    
    // Update chain and ends
    if (this.state.chain.length === 0) {
      this.state.leftEnd = tile.top;
      this.state.rightEnd = tile.bottom;
    } else {
      if (side === 'left') {
        if (tile.top === this.state.leftEnd) {
          this.state.leftEnd = tile.bottom;
        } else {
          this.state.leftEnd = tile.top;
        }
      } else {
        if (tile.top === this.state.rightEnd) {
          this.state.rightEnd = tile.bottom;
        } else {
          this.state.rightEnd = tile.top;
        }
      }
    }

    this.state.chain.push({
      tile,
      playedBy: playerId,
      side
    });

    this.state.consecutivePasses = 0;
    player.hasPassed = false;

    let events = [{
      type: 'TILE_PLAYED',
      playerId,
      tile,
      side,
      chainLength: this.state.chain.length
    }];

    if (player.hand.length === 0) {
      let isDouble = tile.isDouble;
      events.push(...this.handleRoundEnd(playerId, isDouble));
    } else {
      this._nextTurn();
      events.push({
        type: 'TURN_CHANGED',
        currentPlayerId: this._getCurrentPlayer().id
      });
    }

    return events;
  }

  /**
   * Player passes their turn.
   * @param {string} playerId 
   */
  handlePass(playerId) {
    const player = this._getCurrentPlayer();
    if (player.id !== playerId) {
      throw new Error('Not your turn');
    }

    if (this.state.phase !== 'playing') {
      throw new Error('Game is not in playing phase');
    }

    const validMoves = this.getValidMoves(playerId);
    if (validMoves.length > 0) {
      throw new Error('Cannot pass if you have valid moves');
    }

    // 2 player mechanics: Must draw from bone pile first
    if (this.state.players.length === 2 && this.state.bonePile.length > 0) {
      throw new Error('Must draw from bone pile before passing');
    }

    player.hasPassed = true;
    this.state.consecutivePasses++;

    let events = [{ type: 'PLAYER_PASSED', playerId }];

    if (this.state.consecutivePasses >= this.state.players.length) {
      // Dead game (all pass)
      let minScore = Infinity;
      let winnerId = null;

      this.state.players.forEach(p => {
        const score = this._calculateHandScore(p.hand);
        if (score < minScore) {
          minScore = score;
          winnerId = p.id;
        }
      });

      events.push(...this.handleRoundEnd(winnerId));
    } else {
      this._nextTurn();
      events.push({
        type: 'TURN_CHANGED',
        currentPlayerId: this._getCurrentPlayer().id
      });
    }

    return events;
  }

  /**
   * Draws a tile from the bone pile (only valid when no plays available and bone pile has tiles).
   * @param {string} playerId 
   */
  handleDraw(playerId) {
    const player = this._getCurrentPlayer();
    if (player.id !== playerId) {
      throw new Error('Not your turn');
    }

    if (this.state.phase !== 'playing') {
      throw new Error('Game is not in playing phase');
    }

    if (this.state.bonePile.length === 0) {
      throw new Error('Bone pile is empty');
    }

    const validMoves = this.getValidMoves(playerId);
    if (validMoves.length > 0) {
      throw new Error('Cannot draw if you have valid moves');
    }

    const tile = this.state.bonePile.shift();
    player.hand.push(tile);

    return [{
      type: 'TILE_DRAWN',
      playerId,
      tilesRemaining: this.state.bonePile.length
    }];
  }

  /**
   * Handle an automatic pass on timeout.
   * @param {string} playerId 
   */
  handleTimeout(playerId) {
    const player = this._getCurrentPlayer();
    if (player.id !== playerId) {
      return [];
    }

    // If 2 players, auto-draw until bone pile is empty or a move is found
    while (this.state.players.length === 2 && this.state.bonePile.length > 0) {
      const validMoves = this.getValidMoves(playerId);
      if (validMoves.length > 0) break;
      this.handleDraw(playerId);
    }

    const validMoves = this.getValidMoves(playerId);
    if (validMoves.length > 0) {
      // Auto-play the first valid move
      const move = validMoves[0];
      return this.handlePlay(playerId, move.tileIndex, move.sides[0]);
    } else {
      // Auto-pass
      return this.handlePass(playerId);
    }
  }

  /**
   * Ends the round and calculates score/chips.
   * @param {string} winnerId 
   * @param {boolean} doublePoints 
   * @private
   */
  handleRoundEnd(winnerId, doublePoints = false) {
    this.state.phase = 'roundEnd';
    
    let totalDots = 0;
    const losers = this.state.players.filter(p => p.id !== winnerId);
    
    losers.forEach(loser => {
      totalDots += this._calculateHandScore(loser.hand);
    });

    const winner = this.state.players.find(p => p.id === winnerId);
    let roundPoints = totalDots;
    if (doublePoints) {
      roundPoints *= 2;
    }

    this.state.scores[winnerId] += roundPoints;

    // Convert points to chips: 1 point = 10 chips from each loser
    // Actually, prompt says "1 point = 10 chips from each loser". Wait.
    // If winner won 15 dots from opponents, is it 150 chips total, or 15 points = 150 chips * from EACH loser?
    // Usually, 1 point = 10 chips. So if total points = 15, winner gets 150 chips.
    // The prompt says: "convert to chips (1 point = 10 chips from each loser)". 
    // This could mean every point gives 10 chips per loser. Let's interpret it as: 
    // Loser pays (their remaining dots * 10) or (total points * 10).
    // Let's go with: each loser pays chips = their dots * 10 (or total points * 10? The prompt says "Winner gets sum of opponents' remaining dots. Convert to chips (1 point = 10 chips from each loser)").
    // This implies if points = 15, does each loser pay 15 * 10? No, that would be 150 from each loser = 450 total.
    // Let's stick to total winnings = roundPoints * 10, then tax is applied. Wait, if it says "1 point = 10 chips from each loser", maybe each loser pays 10 chips per point they contribute?
    // That means: loser pays their dots * 10.
    
    const chipTransfers = [];
    let grossWinnings = 0;

    losers.forEach(loser => {
      let dots = this._calculateHandScore(loser.hand);
      if (doublePoints) dots *= 2; // double points applies to each loser's contribution
      const chipAmount = dots * CHIPS_PER_POINT;
      
      loser.chips -= chipAmount;
      grossWinnings += chipAmount;
      chipTransfers.push({ from: loser.id, amount: chipAmount });
    });

    const tax = Math.floor(grossWinnings * TAX_RATE);
    const netWinnings = grossWinnings - tax;

    winner.chips += netWinnings;

    let events = [{
      type: 'ROUND_ENDED',
      winnerId,
      points: roundPoints,
      doublePoints,
      grossWinnings,
      tax,
      netWinnings,
      chipTransfers,
      scores: { ...this.state.scores }
    }];

    // Determine if game is over
    if (this.isGameOver()) {
      this.state.phase = 'gameEnd';
      const gameWinner = this._getGameWinner();
      events.push({
        type: 'GAME_ENDED',
        winnerId: gameWinner.id,
        scores: { ...this.state.scores }
      });
    } else {
      // Set the winner to start the next round
      this.state.currentPlayerIndex = this.state.players.findIndex(p => p.id === winnerId);
    }

    return events;
  }

  /**
   * Checks if the game is over based on target score.
   */
  isGameOver() {
    return Object.values(this.state.scores).some(score => score >= this.state.targetScore);
  }

  /**
   * Returns the winner of the game (highest score).
   * @private
   */
  _getGameWinner() {
    return this.state.players.reduce((max, player) => {
      return this.state.scores[player.id] > this.state.scores[max.id] ? player : max;
    }, this.state.players[0]);
  }

  /**
   * Returns a sanitized view of the state for a specific player.
   * @param {string} playerId 
   */
  getPlayerView(playerId) {
    return {
      phase: this.state.phase,
      roundNumber: this.state.roundNumber,
      targetScore: this.state.targetScore,
      currentPlayerId: this.state.players[this.state.currentPlayerIndex]?.id,
      chain: this.state.chain,
      leftEnd: this.state.leftEnd,
      rightEnd: this.state.rightEnd,
      bonePileCount: this.state.bonePile.length,
      scores: this.state.scores,
      players: this.state.players.map(p => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        hasPassed: p.hasPassed,
        handCount: p.hand.length,
        // Only reveal hand if it's the requested player or the game is over/round over
        hand: (p.id === playerId || this.state.phase === 'roundEnd' || this.state.phase === 'gameEnd') ? p.hand : []
      }))
    };
  }
}

module.exports = GapleEngine;
