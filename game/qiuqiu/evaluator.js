/**
 * Qiu Qiu Evaluator
 * Evaluates hands for a 99 Domino Poker game.
 */
class QiuQiuEvaluator {
  /**
   * Evaluates a hand of 4 domino tiles.
   * @param {Array<{top: number, bottom: number}>} tiles 
   * @returns {Object} Evaluation result
   */
  evaluateHand(tiles) {
    if (!tiles || tiles.length !== 4) {
      throw new Error("Hand must contain exactly 4 tiles");
    }

    const tileValues = tiles.map(t => t.top + t.bottom);
    const sumAll = tileValues.reduce((a, b) => a + b, 0);

    // 1. Murni Besar (Sum >= 39)
    if (sumAll >= 39) {
      return { rank: 8, name: 'Murni Besar', value: sumAll, pairValues: [], description: 'Sum of all dots is 39 or more' };
    }

    // 2. Murni Kecil (Sum <= 9)
    if (sumAll <= 9) {
      return { rank: 7, name: 'Murni Kecil', value: sumAll, pairValues: [], description: 'Sum of all dots is 9 or less' };
    }

    // 3. Balak (All doubles)
    const isBalak = tiles.every(t => t.top === t.bottom);
    if (isBalak) {
      return { rank: 6, name: 'Balak', value: sumAll, pairValues: [], description: 'All 4 tiles are doubles' };
    }

    // 4. Enam Dewa (All tiles have value >= 6)
    const isEnamDewa = tileValues.every(val => val >= 6);
    if (isEnamDewa) {
      return { rank: 5, name: 'Enam Dewa', value: sumAll, pairValues: [], description: 'All tiles have value 6 or more' };
    }

    // 5. Straight (Consecutive values)
    const sortedValues = [...tileValues].sort((a, b) => a - b);
    const isStraight = sortedValues[1] === sortedValues[0] + 1 && 
                       sortedValues[2] === sortedValues[1] + 1 && 
                       sortedValues[3] === sortedValues[2] + 1;
    if (isStraight) {
      return { rank: 4, name: 'Straight', value: sortedValues[3], pairValues: [], description: '4 tiles form a consecutive sequence' };
    }

    // Pairings for ranks 3, 2, 1
    const bestPairing = this.findBestPairing(tiles);

    // 6. Qiu Qiu (9-9)
    if (bestPairing[0] === 9 && bestPairing[1] === 9) {
      return { rank: 3, name: 'Qiu Qiu (9-9)', value: 99, pairValues: bestPairing, description: 'Both pairs end in 9' };
    }

    // 7. Qiu (One 9)
    if (bestPairing[0] === 9 || bestPairing[1] === 9) {
      return { rank: 2, name: 'Qiu', value: bestPairing[0] === 9 ? bestPairing[1] : bestPairing[0], pairValues: bestPairing, description: 'One pair ends in 9' };
    }

    // 8. Biasa
    return { rank: 1, name: 'Biasa', value: Math.max(...bestPairing), pairValues: bestPairing, description: 'Normal hand, best pair value' };
  }

  /**
   * Finds the best pairing for 4 tiles.
   * @param {Array<{top: number, bottom: number}>} tiles 
   * @returns {number[]} [highestPair, lowestPair]
   */
  findBestPairing(tiles) {
    // 3 possible pairings: (0,1),(2,3) | (0,2),(1,3) | (0,3),(1,2)
    const ways = [
      [[tiles[0], tiles[1]], [tiles[2], tiles[3]]],
      [[tiles[0], tiles[2]], [tiles[1], tiles[3]]],
      [[tiles[0], tiles[3]], [tiles[1], tiles[2]]]
    ];

    let bestPairing = [-1, -1];
    
    for (const way of ways) {
      const v1 = (way[0][0].top + way[0][0].bottom + way[0][1].top + way[0][1].bottom) % 10;
      const v2 = (way[1][0].top + way[1][0].bottom + way[1][1].top + way[1][1].bottom) % 10;
      
      const ordered = v1 > v2 ? [v1, v2] : [v2, v1];
      
      if (ordered[0] > bestPairing[0] || (ordered[0] === bestPairing[0] && ordered[1] > bestPairing[1])) {
        bestPairing = ordered;
      }
    }
    return bestPairing;
  }

  /**
   * Compares two hands.
   * @param {Array<{top: number, bottom: number}>} handA 
   * @param {Array<{top: number, bottom: number}>} handB 
   * @returns {number} 1 if A wins, -1 if B wins, 0 for tie
   */
  compareHands(handA, handB) {
    const evalA = this.evaluateHand(handA);
    const evalB = this.evaluateHand(handB);

    if (evalA.rank !== evalB.rank) {
      return evalA.rank > evalB.rank ? 1 : -1;
    }

    if (evalA.value !== evalB.value) {
      return evalA.value > evalB.value ? 1 : -1;
    }

    if (evalA.pairValues.length > 0 && evalB.pairValues.length > 0) {
      if (evalA.pairValues[0] !== evalB.pairValues[0]) {
        return evalA.pairValues[0] > evalB.pairValues[0] ? 1 : -1;
      }
      if (evalA.pairValues[1] !== evalB.pairValues[1]) {
        return evalA.pairValues[1] > evalB.pairValues[1] ? 1 : -1;
      }
    }

    // Tie breaker: Compare highest individual tile
    const getHighestTileScore = (hand) => {
      let maxScore = -1;
      for (const t of hand) {
        const isDouble = (t.top === t.bottom) ? 1000 : 0;
        const sum = t.top + t.bottom;
        const highestVal = Math.max(t.top, t.bottom);
        const score = isDouble + sum * 10 + highestVal;
        if (score > maxScore) {
          maxScore = score;
        }
      }
      return maxScore;
    };

    const scoreA = getHighestTileScore(handA);
    const scoreB = getHighestTileScore(handB);
    
    if (scoreA !== scoreB) {
      return scoreA > scoreB ? 1 : -1;
    }
    
    return 0;
  }
}

module.exports = QiuQiuEvaluator;
