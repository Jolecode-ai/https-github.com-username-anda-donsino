/* ═══════════════════════════════════════════════════════
   DON'SINO — Sound Effects (Web Audio API)
   No external audio files needed
   ═══════════════════════════════════════════════════════ */

const SoundFX = (() => {
  let ctx;
  let enabled = true;

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return ctx;
  }

  function playTone(freq, duration, type = 'sine', volume = 0.15) {
    if (!enabled) return;
    try {
      const c = getCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(c.currentTime);
      osc.stop(c.currentTime + duration);
    } catch (e) { /* ignore audio errors */ }
  }

  return {
    toggle() { enabled = !enabled; return enabled; },
    
    click() { playTone(800, 0.08, 'sine', 0.1); },
    
    deal() {
      playTone(300, 0.05, 'triangle', 0.08);
      setTimeout(() => playTone(400, 0.05, 'triangle', 0.06), 50);
    },
    
    chip() {
      playTone(2000, 0.06, 'sine', 0.08);
      setTimeout(() => playTone(2500, 0.06, 'sine', 0.06), 40);
    },
    
    fold() { playTone(200, 0.2, 'sawtooth', 0.06); },
    
    check() { playTone(600, 0.1, 'sine', 0.08); },
    
    win() {
      [523, 659, 784, 1047].forEach((f, i) => {
        setTimeout(() => playTone(f, 0.3, 'sine', 0.12), i * 100);
      });
    },
    
    lose() {
      [400, 350, 300].forEach((f, i) => {
        setTimeout(() => playTone(f, 0.25, 'sawtooth', 0.06), i * 150);
      });
    },
    
    notify() {
      playTone(880, 0.12, 'sine', 0.1);
      setTimeout(() => playTone(1100, 0.15, 'sine', 0.1), 120);
    },
    
    tick() { playTone(1000, 0.03, 'square', 0.04); },
    
    placeTile() {
      playTone(250, 0.08, 'triangle', 0.1);
      setTimeout(() => playTone(180, 0.06, 'triangle', 0.08), 50);
    }
  };
})();
