const RNG = require('../rng');
const QiuQiuEvaluator = require('./evaluator');

/**
 * Qiu Qiu Game Engine
 */
class QiuQiuEngine {
  /**
   * Initializes the engine
   * @param {Array<{id: string, name: string, chips: number}>} players 
   */
  constructor(players) {
    if (!players || players.length < 2 || players.length > 6) {
      throw new Error("Game requires 2 to 6 players");
    }

    this.evaluator = new QiuQiuEvaluator();
    this.TAX_RATE = 0.025;

    this.state = {
      phase: 'waiting',
      tiles: [],
      pot: 0,
      currentBet: 0,
      currentPlayerIndex: 0,
      dealerIndex: 0,
      players: players.map(p => ({
        ...p,
        hand: [],
        currentBet: 0,
        totalBet: 0,
        hasFolded: false,
        hasActed: false
      })),
      smallBlind: 50,
      bigBlind: 100,
      roundNumber: 0,
      minRaise: 100
    };
  }

  /**
   * Generates a 28-tile domino set
   */
  _generateTiles() {
    const tiles = [];
    for (let top = 0; top <= 6; top++) {
      for (let bottom = top; bottom <= 6; bottom++) {
        tiles.push({ top, bottom });
      }
    }
    return tiles;
  }

  /**
   * Shuffles tiles using RNG
   * @param {Array} array 
   */
  _shuffle(array) {
    return RNG.shuffle(array);
  }

  /**
   * Starts a new round
   * @returns {Array} events
   */
  startRound() {
    this.state.roundNumber++;
    this.state.pot = 0;
    this.state.currentBet = this.state.bigBlind;
    this.state.minRaise = this.state.bigBlind;
    
    // Blind escalation every 10 rounds
    if (this.state.roundNumber > 1 && (this.state.roundNumber - 1) % 10 === 0) {
      this.state.smallBlind *= 2;
      this.state.bigBlind *= 2;
      this.state.currentBet = this.state.bigBlind;
      this.state.minRaise = this.state.bigBlind;
    }

    // Reset players
    this.state.players.forEach(p => {
      p.hand = [];
      p.currentBet = 0;
      p.totalBet = 0;
      p.hasFolded = false;
      p.hasActed = false;
    });

    this.state.tiles = this._generateTiles();
    this._shuffle(this.state.tiles);

    const sbIndex = (this.state.dealerIndex + 1) % this.state.players.length;
    const bbIndex = (this.state.dealerIndex + 2) % this.state.players.length;

    // Post blinds
    this._postBet(sbIndex, this.state.smallBlind);
    this._postBet(bbIndex, this.state.bigBlind);

    // Deal 3 tiles each
    this.state.players.forEach(p => {
      p.hand.push(this.state.tiles.pop());
      p.hand.push(this.state.tiles.pop());
      p.hand.push(this.state.tiles.pop());
    });

    this.state.phase = 'betting1';
    this.state.currentPlayerIndex = this.getNextActivePlayer(bbIndex);

    return [
      { type: 'round_started', roundNumber: this.state.roundNumber },
      { type: 'blinds_posted', sb: this.state.smallBlind, bb: this.state.bigBlind },
      { type: 'tiles_dealt', count: 3 }
    ];
  }

  _postBet(playerIndex, amount) {
    const p = this.state.players[playerIndex];
    const actualBet = Math.min(amount, p.chips);
    p.chips -= actualBet;
    p.currentBet += actualBet;
    p.totalBet += actualBet;
    this.state.pot += actualBet;
    return actualBet;
  }

  /**
   * Handles player actions
   * @param {string} playerId 
   * @param {string} action 'fold', 'check', 'call', 'raise'
   * @param {number} amount 
   * @returns {Array} events
   */
  handleAction(playerId, action, amount = 0) {
    const pIndex = this.state.currentPlayerIndex;
    const p = this.state.players[pIndex];

    if (p.id !== playerId) {
      throw new Error("Not player's turn");
    }

    if (p.hasFolded) {
      throw new Error("Player has already folded");
    }

    const events = [];

    if (action === 'fold') {
      p.hasFolded = true;
      events.push({ type: 'player_folded', playerId });
    } else if (action === 'check') {
      if (p.currentBet < this.state.currentBet) {
        throw new Error("Cannot check, must call or raise");
      }
      events.push({ type: 'player_checked', playerId });
    } else if (action === 'call') {
      const callAmount = this.state.currentBet - p.currentBet;
      const actualBet = this._postBet(pIndex, callAmount);
      events.push({ type: 'player_called', playerId, amount: actualBet });
    } else if (action === 'raise') {
      if (amount < this.state.minRaise) {
        throw new Error(`Raise must be at least ${this.state.minRaise}`);
      }
      const totalToBet = (this.state.currentBet - p.currentBet) + amount;
      const actualBet = this._postBet(pIndex, totalToBet);
      
      this.state.currentBet += amount;
      this.state.minRaise = amount;
      
      // Reset hasActed for others
      this.state.players.forEach((otherP, idx) => {
        if (idx !== pIndex && !otherP.hasFolded) {
          otherP.hasActed = false;
        }
      });
      events.push({ type: 'player_raised', playerId, raiseAmount: amount, actualBet });
    } else {
      throw new Error("Invalid action");
    }

    p.hasActed = true;

    if (this._checkRoundComplete()) {
      events.push(...this._advancePhase());
    } else {
      this.state.currentPlayerIndex = this.getNextActivePlayer(pIndex);
    }

    return events;
  }

  _checkRoundComplete() {
    const activePlayers = this.state.players.filter(p => !p.hasFolded);
    if (activePlayers.length === 1) return true; // Everyone else folded

    return activePlayers.every(p => p.hasActed && p.currentBet === this.state.currentBet);
  }

  _advancePhase() {
    const events = [];
    
    // Reset current bet and hasActed for the next betting round
    this.state.currentBet = 0;
    this.state.minRaise = this.state.bigBlind;
    this.state.players.forEach(p => {
      p.currentBet = 0;
      if (!p.hasFolded) p.hasActed = false;
    });

    const activePlayers = this.state.players.filter(p => !p.hasFolded);

    if (activePlayers.length === 1) {
      // Early win
      this.state.phase = 'showdown';
      events.push(...this.handleShowdown());
      return events;
    }

    if (this.state.phase === 'betting1') {
      events.push(...this.dealFourthTile());
      this.state.phase = 'betting2';
      this.state.currentPlayerIndex = this.getNextActivePlayer(this.state.dealerIndex);
    } else if (this.state.phase === 'betting2') {
      this.state.phase = 'showdown';
      events.push(...this.handleShowdown());
    }

    return events;
  }

  /**
   * Deals 4th tile to active players
   */
  dealFourthTile() {
    this.state.players.forEach(p => {
      if (!p.hasFolded) {
        p.hand.push(this.state.tiles.pop());
      }
    });
    return [{ type: 'fourth_tile_dealt' }];
  }

  /**
   * Handles showdown
   */
  handleShowdown() {
    const activePlayers = this.state.players.filter(p => !p.hasFolded);
    const events = [];

    if (activePlayers.length === 1) {
      const winner = activePlayers[0];
      const winnings = this.state.pot;
      const netProfit = winnings - winner.totalBet;
      let tax = 0;
      if (netProfit > 0) {
        tax = Math.floor(netProfit * this.TAX_RATE);
        winner.chips -= tax;
      }
      winner.chips += winnings; // Give full pot then subtract tax (or just give winnings - tax, wait chips was already decremented by bet)
      
      events.push({ type: 'showdown', winner: winner.id, amount: winnings - tax, tax });
      return events;
    }

    // Evaluate hands
    const evaluatedPlayers = activePlayers.map(p => ({
      player: p,
      evaluation: this.evaluator.evaluateHand(p.hand)
    }));

    // Sort to find best
    evaluatedPlayers.sort((a, b) => this.evaluator.compareHands(b.player.hand, a.player.hand)); // Descending

    const winnerData = evaluatedPlayers[0];
    const winner = winnerData.player;
    
    // Pot distribution with tax
    const winnings = this.state.pot;
    const netProfit = winnings - winner.totalBet;
    let tax = 0;
    if (netProfit > 0) {
      tax = Math.floor(netProfit * this.TAX_RATE);
    }
    
    winner.chips += winnings - tax;

    events.push({ 
      type: 'showdown', 
      winner: winner.id, 
      handRank: winnerData.evaluation.name,
      amount: winnings - tax,
      tax,
      showdownHands: evaluatedPlayers.map(e => ({ playerId: e.player.id, hand: e.player.hand, evaluation: e.evaluation }))
    });

    return events;
  }

  /**
   * Auto folds player on timeout
   * @param {string} playerId 
   */
  handleTimeout(playerId) {
    if (this.state.players[this.state.currentPlayerIndex].id === playerId) {
      return this.handleAction(playerId, 'fold');
    }
    return [];
  }

  /**
   * Prepare for next round
   */
  nextRound() {
    this.state.dealerIndex = (this.state.dealerIndex + 1) % this.state.players.length;
    this.state.phase = 'waiting';
  }

  /**
   * Returns view for specific player
   * @param {string} playerId 
   */
  getPlayerView(playerId) {
    const view = { ...this.state };
    view.players = this.state.players.map(p => {
      const pView = { ...p };
      if (p.id !== playerId && this.state.phase !== 'showdown') {
        pView.hand = pView.hand.map(() => ({ top: -1, bottom: -1 })); // Hide hand
      }
      return pView;
    });
    return view;
  }

  /**
   * Gets next active player
   * @param {number} fromIndex 
   */
  getNextActivePlayer(fromIndex) {
    let curr = (fromIndex + 1) % this.state.players.length;
    while (this.state.players[curr].hasFolded) {
      curr = (curr + 1) % this.state.players.length;
    }
    return curr;
  }
}

module.exports = QiuQiuEngine;
