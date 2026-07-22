const RNG = require('../rng');
const PokerEvaluator = require('./evaluator');

/**
 * Core Texas Hold'em Poker Engine.
 */
class PokerEngine {
  /**
   * Initializes the PokerEngine.
   * @param {Array<{id: string, name: string, chips: number}>} players - The players entering the game.
   */
  constructor(players) {
    this.evaluator = new PokerEvaluator();
    this.TAX_RATE = 0.025;

    this.state = {
      phase: 'waiting', // 'waiting'|'preflop'|'flop'|'turn'|'river'|'showdown'
      deck: [],
      communityCards: [],
      pot: 0,
      sidePots: [],
      currentBet: 0,
      dealerIndex: 0,
      currentPlayerIndex: 0,
      players: players.map(p => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        holeCards: [],
        currentBet: 0,
        totalBet: 0,
        hasFolded: false,
        isAllIn: false,
        hasActed: false
      })),
      smallBlind: 50,
      bigBlind: 100,
      roundNumber: 0,
      minRaise: 100
    };
  }

  /**
   * Creates a standard 52-card deck.
   * @returns {Array<{rank: number, suit: string}>} The deck of cards.
   * @private
   */
  createDeck() {
    const deck = [];
    const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
    for (let suit of suits) {
      for (let rank = 2; rank <= 14; rank++) {
        deck.push({ rank, suit });
      }
    }
    return deck;
  }

  /**
   * Starts a new round of Poker.
   * @returns {Object} Events emitted during start round.
   */
  startRound() {
    this.state.roundNumber++;
    
    // Blind escalation: double every 10 rounds
    if (this.state.roundNumber > 1 && this.state.roundNumber % 10 === 1) {
      this.state.smallBlind *= 2;
      this.state.bigBlind *= 2;
    }

    this.state.phase = 'preflop';
    this.state.deck = this.createDeck();
    
    // Assuming RNG is an object with a shuffle method or similar. We will just shuffle the array.
    if (RNG && typeof RNG.shuffle === 'function') {
      this.state.deck = RNG.shuffle(this.state.deck);
    } else {
      // fallback shuffle
      for (let i = this.state.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.state.deck[i], this.state.deck[j]] = [this.state.deck[j], this.state.deck[i]];
      }
    }

    this.state.communityCards = [];
    this.state.pot = 0;
    this.state.sidePots = [];
    this.state.currentBet = this.state.bigBlind;
    this.state.minRaise = this.state.bigBlind;
    
    this.state.players.forEach(p => {
      p.holeCards = [];
      p.currentBet = 0;
      p.totalBet = 0;
      p.hasFolded = false;
      p.isAllIn = p.chips === 0;
      p.hasActed = false;
    });

    const activePlayers = this.state.players.filter(p => p.chips > 0);
    if (activePlayers.length < 2) {
      return { events: [{ type: 'error', data: 'Not enough players' }] };
    }

    // Deal hole cards
    for (let i = 0; i < 2; i++) {
      for (let p of this.state.players) {
        if (!p.isAllIn && p.chips > 0) {
          p.holeCards.push(this.state.deck.pop());
        }
      }
    }

    // Post Blinds
    const sbIndex = this.getNextActivePlayer(this.state.dealerIndex);
    const bbIndex = this.getNextActivePlayer(sbIndex);
    
    const sbPlayer = this.state.players[sbIndex];
    const bbPlayer = this.state.players[bbIndex];

    const sbAmount = Math.min(sbPlayer.chips, this.state.smallBlind);
    sbPlayer.chips -= sbAmount;
    sbPlayer.currentBet = sbAmount;
    sbPlayer.totalBet += sbAmount;
    if (sbPlayer.chips === 0) sbPlayer.isAllIn = true;

    const bbAmount = Math.min(bbPlayer.chips, this.state.bigBlind);
    bbPlayer.chips -= bbAmount;
    bbPlayer.currentBet = bbAmount;
    bbPlayer.totalBet += bbAmount;
    if (bbPlayer.chips === 0) bbPlayer.isAllIn = true;

    this.state.currentPlayerIndex = this.getNextActivePlayer(bbIndex);

    return {
      events: [
        { type: 'round_started', data: { roundNumber: this.state.roundNumber } },
        { type: 'blinds_posted', data: { smallBlind: sbAmount, bigBlind: bbAmount } }
      ]
    };
  }

  /**
   * Processes a player action.
   * @param {string} playerId 
   * @param {string} action - 'fold', 'check', 'call', 'raise', 'allin'
   * @param {number} [amount] 
   * @returns {Object} Events emitted.
   */
  handleAction(playerId, action, amount = 0) {
    const player = this.state.players[this.state.currentPlayerIndex];
    if (player.id !== playerId) {
      return { events: [{ type: 'error', data: 'Not your turn' }] };
    }

    const events = [];
    let validAction = false;

    switch (action) {
      case 'fold':
        player.hasFolded = true;
        events.push({ type: 'player_folded', playerId });
        validAction = true;
        break;
      
      case 'check':
        if (player.currentBet === this.state.currentBet) {
          events.push({ type: 'player_checked', playerId });
          validAction = true;
        }
        break;

      case 'call':
        const callAmount = this.state.currentBet - player.currentBet;
        if (callAmount > 0) {
          const actualCall = Math.min(callAmount, player.chips);
          player.chips -= actualCall;
          player.currentBet += actualCall;
          player.totalBet += actualCall;
          if (player.chips === 0) player.isAllIn = true;
          events.push({ type: 'player_called', playerId, data: { amount: actualCall } });
          validAction = true;
        } else if (player.currentBet === this.state.currentBet) {
          // If no call amount needed, treat as check
          events.push({ type: 'player_checked', playerId });
          validAction = true;
        }
        break;

      case 'raise':
        const raiseAmount = amount;
        if (raiseAmount >= this.state.minRaise && raiseAmount <= player.chips) {
          player.chips -= raiseAmount;
          const totalNewBet = player.currentBet + raiseAmount;
          this.state.minRaise = totalNewBet - this.state.currentBet; // update minRaise
          this.state.currentBet = totalNewBet;
          player.currentBet = totalNewBet;
          player.totalBet += raiseAmount;
          if (player.chips === 0) player.isAllIn = true;
          events.push({ type: 'player_raised', playerId, data: { amount: raiseAmount } });
          
          // Reset hasActed for others because of the raise
          this.state.players.forEach(p => {
            if (p.id !== playerId && !p.hasFolded && !p.isAllIn) {
              p.hasActed = false;
            }
          });
          validAction = true;
        }
        break;

      case 'allin':
        const allInAmount = player.chips;
        player.chips = 0;
        player.isAllIn = true;
        player.currentBet += allInAmount;
        player.totalBet += allInAmount;
        
        if (player.currentBet > this.state.currentBet) {
          const raised = player.currentBet - this.state.currentBet;
          if (raised > this.state.minRaise) {
            this.state.minRaise = raised;
          }
          this.state.currentBet = player.currentBet;
          // Reset others
          this.state.players.forEach(p => {
            if (p.id !== playerId && !p.hasFolded && !p.isAllIn) {
              p.hasActed = false;
            }
          });
        }
        events.push({ type: 'player_allin', playerId, data: { amount: allInAmount } });
        validAction = true;
        break;
    }

    if (!validAction) {
      return { events: [{ type: 'error', data: 'Invalid action' }] };
    }

    player.hasActed = true;

    // Check if round is over (everyone folded except one, or all phases done)
    if (this.isRoundOver()) {
      const earlyWin = this.state.players.filter(p => !p.hasFolded).length === 1;
      if (earlyWin) {
        events.push(...this.handleShowdown().events);
        this.nextRound();
      } else {
        // Everyone is all-in or acted, advance to showdown rapidly
        while (this.state.phase !== 'showdown') {
          events.push(...this.advancePhase().events);
        }
        events.push(...this.handleShowdown().events);
        this.nextRound();
      }
      return { events };
    }

    // Check if betting phase is complete
    const activePlayers = this.state.players.filter(p => !p.hasFolded && !p.isAllIn);
    const needToAct = activePlayers.filter(p => !p.hasActed || p.currentBet < this.state.currentBet);

    if (needToAct.length === 0) {
      events.push(...this.advancePhase().events);
      if (this.state.phase === 'showdown') {
        events.push(...this.handleShowdown().events);
        this.nextRound();
      }
    } else {
      this.state.currentPlayerIndex = this.getNextActivePlayer(this.state.currentPlayerIndex);
    }

    return { events };
  }

  /**
   * Advances the game phase.
   * @returns {Object} Events emitted.
   */
  advancePhase() {
    this.calculateSidePots();
    
    // Reset bets
    this.state.players.forEach(p => {
      p.currentBet = 0;
      p.hasActed = false;
    });
    this.state.currentBet = 0;
    this.state.minRaise = this.state.bigBlind; // reset minRaise

    const events = [];

    switch (this.state.phase) {
      case 'preflop':
        this.state.phase = 'flop';
        this.state.deck.pop(); // burn
        this.state.communityCards.push(this.state.deck.pop(), this.state.deck.pop(), this.state.deck.pop());
        events.push({ type: 'phase_flop', data: { cards: this.state.communityCards.slice(-3) } });
        break;
      case 'flop':
        this.state.phase = 'turn';
        this.state.deck.pop(); // burn
        this.state.communityCards.push(this.state.deck.pop());
        events.push({ type: 'phase_turn', data: { card: this.state.communityCards[this.state.communityCards.length - 1] } });
        break;
      case 'turn':
        this.state.phase = 'river';
        this.state.deck.pop(); // burn
        this.state.communityCards.push(this.state.deck.pop());
        events.push({ type: 'phase_river', data: { card: this.state.communityCards[this.state.communityCards.length - 1] } });
        break;
      case 'river':
        this.state.phase = 'showdown';
        events.push({ type: 'phase_showdown' });
        break;
    }

    if (this.state.phase !== 'showdown') {
      this.state.currentPlayerIndex = this.getNextActivePlayer(this.state.dealerIndex);
    }

    return { events };
  }

  /**
   * Handles showdown and distribution of pots.
   * @returns {Object} Events emitted.
   */
  handleShowdown() {
    this.calculateSidePots(); // final pot calculation
    
    const events = [];
    const remainingPlayers = this.state.players.filter(p => !p.hasFolded);

    if (remainingPlayers.length === 1) {
      const winner = remainingPlayers[0];
      const winAmount = this.state.pot;
      
      const netWin = Math.max(0, winAmount - winner.totalBet);
      const tax = netWin * this.TAX_RATE;
      const actualWin = winAmount - tax;
      
      winner.chips += actualWin;
      events.push({ type: 'player_won', playerId: winner.id, data: { amount: actualWin, tax, hand: null } });
      this.state.pot = 0;
      return { events };
    }

    // Evaluate all remaining hands
    const evaluated = remainingPlayers.map(p => {
      const bestHand = this.evaluator.evaluateBestHand(p.holeCards, this.state.communityCards);
      return { player: p, bestHand };
    });

    // Handle each side pot
    // For simplicity of this implementation, if side pots exist, they would be resolved here.
    // Assuming a simple single pot for now if no complicated all-ins, otherwise we distribute per pot.
    
    // Pot distribution logic (simplified for single pot, can be expanded for side pots)
    evaluated.sort((a, b) => this.evaluator.compareHands(b.bestHand, a.bestHand));
    
    let winners = [];
    if (evaluated.length > 0) {
      winners.push(evaluated[0]);
      for (let i = 1; i < evaluated.length; i++) {
        if (this.evaluator.compareHands(evaluated[0].bestHand, evaluated[i].bestHand) === 0) {
          winners.push(evaluated[i]);
        }
      }
    }

    if (winners.length > 0) {
      const winAmount = this.state.pot / winners.length;
      winners.forEach(w => {
        const netWin = Math.max(0, winAmount - w.player.totalBet);
        const tax = netWin * this.TAX_RATE;
        const actualWin = winAmount - tax;
        w.player.chips += actualWin;
        events.push({ 
          type: 'player_won', 
          playerId: w.player.id, 
          data: { amount: actualWin, tax, hand: w.bestHand } 
        });
      });
    }

    this.state.pot = 0;
    this.state.sidePots = [];
    
    return { events };
  }

  /**
   * Calculates side pots and moves bets into main/side pots.
   */
  calculateSidePots() {
    let bets = this.state.players.filter(p => p.currentBet > 0).map(p => p.currentBet);
    if (bets.length === 0) return;

    // Simple accumulation into main pot for now.
    // Full side pot logic requires checking smallest all-in, subtracting from all bets, creating a side pot, and repeating.
    let totalBetThisRound = 0;
    this.state.players.forEach(p => {
      totalBetThisRound += p.currentBet;
    });
    this.state.pot += totalBetThisRound;
  }

  /**
   * Returns the game state from the perspective of a specific player.
   * @param {string} playerId 
   * @returns {Object} Masked game state.
   */
  getPlayerView(playerId) {
    return {
      ...this.state,
      players: this.state.players.map(p => ({
        ...p,
        holeCards: (p.id === playerId || this.state.phase === 'showdown') ? p.holeCards : []
      }))
    };
  }

  /**
   * Checks if the round is over.
   * @returns {boolean} True if round is over.
   */
  isRoundOver() {
    const active = this.state.players.filter(p => !p.hasFolded);
    if (active.length <= 1) return true;
    
    const canAct = active.filter(p => !p.isAllIn);
    if (canAct.length <= 1) {
      // If only one (or zero) can act, betting is essentially over, we just deal out the rest.
      const needingToAct = canAct.filter(p => !p.hasActed || p.currentBet < this.state.currentBet);
      if (needingToAct.length === 0) return true;
    }

    return this.state.phase === 'showdown';
  }

  /**
   * Gets the next active player index.
   * @param {number} fromIndex 
   * @returns {number} The next active player index.
   */
  getNextActivePlayer(fromIndex) {
    let index = fromIndex;
    for (let i = 0; i < this.state.players.length; i++) {
      index = (index + 1) % this.state.players.length;
      const p = this.state.players[index];
      if (!p.hasFolded && !p.isAllIn && p.chips > 0) {
        return index;
      }
    }
    return index;
  }

  /**
   * Automatically folds a player if they time out.
   * @param {string} playerId 
   * @returns {Object} Events emitted.
   */
  handleTimeout(playerId) {
    return this.handleAction(playerId, 'fold');
  }

  /**
   * Rotates dealer and resets for the next round.
   */
  nextRound() {
    this.state.dealerIndex = (this.state.dealerIndex + 1) % this.state.players.length;
    this.state.phase = 'waiting';
  }
}

module.exports = PokerEngine;
