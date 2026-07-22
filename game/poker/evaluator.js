/**
 * Poker hand evaluator for Texas Hold'em.
 */

/**
 * Generate all combinations of k elements from an array.
 * @param {Array} arr - The array of elements.
 * @param {number} k - The number of elements in each combination.
 * @returns {Array<Array>} An array of combinations.
 */
function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length === 0) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map(comb => [first, ...comb]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

class PokerEvaluator {
  /**
   * Finds the best 5-card hand from a set of 7 cards.
   * @param {Array} holeCards - 2 hole cards.
   * @param {Array} communityCards - 3 to 5 community cards.
   * @returns {Object} The best hand evaluated.
   */
  evaluateBestHand(holeCards, communityCards) {
    const allCards = [...holeCards, ...communityCards];
    // If fewer than 5 cards total, cannot form a standard hand. Just evaluate what we have.
    if (allCards.length < 5) return null; 

    const possibleHands = combinations(allCards, 5);
    
    let bestHand = null;
    for (const hand of possibleHands) {
      const evalResult = this._evaluate5CardHand(hand);
      if (!bestHand || this.compareHands(evalResult, bestHand) > 0) {
        bestHand = evalResult;
      }
    }
    return bestHand;
  }

  /**
   * Compares two evaluated hands.
   * @param {Object} handA 
   * @param {Object} handB 
   * @returns {number} 1 if A wins, -1 if B wins, 0 if tie
   */
  compareHands(handA, handB) {
    if (handA.rank > handB.rank) return 1;
    if (handA.rank < handB.rank) return -1;
    
    for (let i = 0; i < handA.kickers.length; i++) {
      if (handA.kickers[i] > handB.kickers[i]) return 1;
      if (handA.kickers[i] < handB.kickers[i]) return -1;
    }
    return 0;
  }

  /**
   * Evaluates a precise 5-card hand.
   * @param {Array} cards - Exactly 5 cards.
   * @returns {Object} The evaluation result {rank, name, cards, kickers}.
   * @private
   */
  _evaluate5CardHand(cards) {
    // Sort cards by rank descending
    const sorted = [...cards].sort((a, b) => b.rank - a.rank);
    const ranks = sorted.map(c => c.rank);
    const suits = sorted.map(c => c.suit);
    
    const isFlush = new Set(suits).size === 1;
    
    let isStraight = false;
    let straightHigh = 0;
    
    // Check straight
    if (ranks[0] - ranks[4] === 4 && new Set(ranks).size === 5) {
      isStraight = true;
      straightHigh = ranks[0];
    } else if (ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2) {
      // Ace-low straight A-2-3-4-5
      isStraight = true;
      straightHigh = 5;
    }

    // Count rank occurrences
    const rankCounts = {};
    for (const r of ranks) {
      rankCounts[r] = (rankCounts[r] || 0) + 1;
    }
    
    const counts = Object.values(rankCounts).sort((a, b) => b - a);
    
    if (isFlush && isStraight) {
      if (straightHigh === 14) return { rank: 10, name: 'Royal Flush', cards: sorted, kickers: [14] };
      return { rank: 9, name: 'Straight Flush', cards: sorted, kickers: [straightHigh] };
    }
    if (counts[0] === 4) {
      const quadRank = Number(Object.keys(rankCounts).find(k => rankCounts[k] === 4));
      const kickerRank = Number(Object.keys(rankCounts).find(k => rankCounts[k] === 1));
      return { rank: 8, name: 'Four of a Kind', cards: sorted, kickers: [quadRank, kickerRank] };
    }
    if (counts[0] === 3 && counts[1] === 2) {
      const trioRank = Number(Object.keys(rankCounts).find(k => rankCounts[k] === 3));
      const pairRank = Number(Object.keys(rankCounts).find(k => rankCounts[k] === 2));
      return { rank: 7, name: 'Full House', cards: sorted, kickers: [trioRank, pairRank] };
    }
    if (isFlush) {
      return { rank: 6, name: 'Flush', cards: sorted, kickers: ranks };
    }
    if (isStraight) {
      return { rank: 5, name: 'Straight', cards: sorted, kickers: [straightHigh] };
    }
    if (counts[0] === 3) {
      const trioRank = Number(Object.keys(rankCounts).find(k => rankCounts[k] === 3));
      const kickers = ranks.filter(r => r !== trioRank).sort((a,b)=>b-a);
      return { rank: 4, name: 'Three of a Kind', cards: sorted, kickers: [trioRank, ...kickers] };
    }
    if (counts[0] === 2 && counts[1] === 2) {
      const pairs = Object.keys(rankCounts).filter(k => rankCounts[k] === 2).map(Number).sort((a,b)=>b-a);
      const kicker = ranks.find(r => r !== pairs[0] && r !== pairs[1]);
      return { rank: 3, name: 'Two Pair', cards: sorted, kickers: [...pairs, kicker] };
    }
    if (counts[0] === 2) {
      const pairRank = Number(Object.keys(rankCounts).find(k => rankCounts[k] === 2));
      const kickers = ranks.filter(r => r !== pairRank).sort((a,b)=>b-a);
      return { rank: 2, name: 'One Pair', cards: sorted, kickers: [pairRank, ...kickers] };
    }
    return { rank: 1, name: 'High Card', cards: sorted, kickers: ranks };
  }
}

module.exports = PokerEvaluator;
