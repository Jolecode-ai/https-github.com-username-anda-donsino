const crypto = require('crypto');

/**
 * Don'Sino RNG Module
 * Cryptographically secure random number generation
 * Uses Node.js crypto.randomBytes() for entropy
 */

class RNG {
  /**
   * Generate a cryptographically secure random integer in [min, max] inclusive
   */
  static randomInt(min, max) {
    const range = max - min + 1;
    const bytesNeeded = Math.ceil(Math.log2(range) / 8) || 1;
    const maxValid = Math.floor(256 ** bytesNeeded / range) * range - 1;
    
    let value;
    do {
      const bytes = crypto.randomBytes(bytesNeeded);
      value = 0;
      for (let i = 0; i < bytesNeeded; i++) {
        value = (value << 8) | bytes[i];
      }
    } while (value > maxValid);
    
    return min + (value % range);
  }

  /**
   * Fisher-Yates shuffle — O(n), unbiased, cryptographically secure
   * Returns a new shuffled array (does not mutate original)
   */
  static shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = RNG.randomInt(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Pick n random elements from array without replacement
   */
  static pick(array, n) {
    const shuffled = RNG.shuffle(array);
    return shuffled.slice(0, n);
  }

  /**
   * Generate a random room code (6 uppercase alphanumeric characters)
   */
  static generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[RNG.randomInt(0, chars.length - 1)];
    }
    return code;
  }
}

module.exports = RNG;
