/* ═══════════════════════════════════════════════════════
   DON'SINO — Main Application
   Router, Socket.IO, State Management, Firebase Auth
   ═══════════════════════════════════════════════════════ */

// ─── Firebase Config ───────────────────────────────────
// PENTING: Ganti dengan konfigurasi Firebase project Anda!
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// ─── Globals ───────────────────────────────────────────
let socket = null;
let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;
let firebaseReady = false;

const App = {
  // Current view
  currentView: 'login',
  
  // Player state
  player: {
    uid: null,
    name: '',
    displayName: '',
    email: '',
    avatar: 1,
    chips: 10000,
    isGuest: true
  },

  // Room state
  room: null,
  selectedGame: null,

  // Game state
  gameState: null,
  isMyTurn: false,
  turnTimer: null,
  turnTimeLeft: 30
};

// ─── Firebase Init ─────────────────────────────────────
function initFirebase() {
  try {
    if (FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') {
      console.warn('[Firebase] Konfigurasi belum diatur. Mode tamu saja.');
      return;
    }
    firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
    firebaseAuth = firebase.auth();
    firebaseDb = firebase.firestore();
    firebaseReady = true;
    console.log('[Firebase] Initialized');

    // Auth state listener
    firebaseAuth.onAuthStateChanged(async (user) => {
      if (user) {
        App.player.uid = user.uid;
        App.player.email = user.email;
        App.player.isGuest = false;
        
        // Load user data from Firestore
        const doc = await firebaseDb.collection('users').doc(user.uid).get();
        if (doc.exists) {
          const data = doc.data();
          App.player.name = data.nickname || 'Player';
          App.player.displayName = `Don "${data.nickname}"`;
          App.player.chips = data.chips || 10000;
          App.player.avatar = data.avatar || 1;
        }
        
        updatePlayerDisplay();
        showView('gameSelect');
      }
    });
  } catch (e) {
    console.warn('[Firebase] Init error:', e.message);
  }
}

// ─── Firebase Auth Functions ───────────────────────────
async function registerUser(email, password, nickname) {
  if (!firebaseReady) {
    showToast('Firebase belum dikonfigurasi. Gunakan mode tamu.', 'error');
    return false;
  }
  try {
    const cred = await firebaseAuth.createUserWithEmailAndPassword(email, password);
    // Save user profile to Firestore
    await firebaseDb.collection('users').doc(cred.user.uid).set({
      nickname: nickname,
      displayName: `Don "${nickname}"`,
      email: email,
      chips: 10000,
      avatar: Math.floor(Math.random() * 8) + 1,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    App.player.name = nickname;
    App.player.displayName = `Don "${nickname}"`;
    showToast(`Selamat datang, Don "${nickname}"!`, 'success');
    return true;
  } catch (e) {
    showToast(e.message, 'error');
    return false;
  }
}

async function loginUser(email, password) {
  if (!firebaseReady) {
    showToast('Firebase belum dikonfigurasi. Gunakan mode tamu.', 'error');
    return false;
  }
  try {
    await firebaseAuth.signInWithEmailAndPassword(email, password);
    return true;
  } catch (e) {
    showToast(getFirebaseErrorMessage(e.code), 'error');
    return false;
  }
}

async function loginWithGoogle() {
  if (!firebaseReady) {
    showToast('Firebase belum dikonfigurasi. Gunakan mode tamu.', 'error');
    return false;
  }
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const result = await firebaseAuth.signInWithPopup(provider);
    
    // Check if user exists in Firestore
    const doc = await firebaseDb.collection('users').doc(result.user.uid).get();
    if (!doc.exists) {
      const name = result.user.displayName || result.user.email.split('@')[0];
      await firebaseDb.collection('users').doc(result.user.uid).set({
        nickname: name,
        displayName: `Don "${name}"`,
        email: result.user.email,
        chips: 10000,
        avatar: Math.floor(Math.random() * 8) + 1,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      App.player.name = name;
      App.player.displayName = `Don "${name}"`;
    }
    return true;
  } catch (e) {
    if (e.code !== 'auth/popup-closed-by-user') {
      showToast(e.message, 'error');
    }
    return false;
  }
}

async function logoutUser() {
  if (firebaseReady) {
    // Save chips before logout
    if (App.player.uid) {
      try {
        await firebaseDb.collection('users').doc(App.player.uid).update({
          chips: App.player.chips
        });
      } catch (e) { /* ignore */ }
    }
    await firebaseAuth.signOut();
  }
  App.player = { uid: null, name: '', displayName: '', email: '', avatar: 1, chips: 10000, isGuest: true };
  if (socket) socket.disconnect();
  showView('login');
}

async function saveChipsToFirebase() {
  if (firebaseReady && App.player.uid) {
    try {
      await firebaseDb.collection('users').doc(App.player.uid).update({
        chips: App.player.chips
      });
    } catch (e) { /* ignore */ }
  }
}

function getFirebaseErrorMessage(code) {
  const messages = {
    'auth/email-already-in-use': 'Email sudah terdaftar',
    'auth/invalid-email': 'Email tidak valid',
    'auth/user-not-found': 'Akun tidak ditemukan',
    'auth/wrong-password': 'Password salah',
    'auth/weak-password': 'Password terlalu lemah (min. 6 karakter)',
    'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi nanti.',
    'auth/invalid-credential': 'Email atau password salah'
  };
  return messages[code] || 'Terjadi kesalahan. Coba lagi.';
}

// ─── Guest Login ───────────────────────────────────────
function loginAsGuest(name) {
  App.player.name = name;
  App.player.displayName = `Don "${name}"`;
  App.player.isGuest = true;
  App.player.chips = 10000;
  App.player.avatar = Math.floor(Math.random() * 8) + 1;
  updatePlayerDisplay();
  showView('gameSelect');
  showToast(`Selamat datang, Don "${name}"!`, 'success');
}

// ─── Socket.IO ─────────────────────────────────────────
function connectSocket() {
  if (socket && socket.connected) return;
  
  socket = io({
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
    showToast('Terhubung ke server', 'success');
  });

  socket.on('disconnect', () => {
    console.log('[Socket] Disconnected');
    showToast('Terputus dari server', 'error');
  });

  socket.on('reconnect', () => {
    showToast('Terhubung kembali', 'success');
  });

  // Room events
  socket.on('room:updated', (roomInfo) => {
    App.room = roomInfo;
    if (App.currentView === 'room') {
      renderRoomPlayers();
    }
  });

  // Game events
  socket.on('game:started', ({ gameType }) => {
    SoundFX.notify();
    showView(gameType === 'poker' ? 'poker' : gameType === 'gaple' ? 'gaple' : 'qiuqiu');
  });

  socket.on('game:state', (state) => {
    App.gameState = state;
    const view = App.currentView;
    if (view === 'poker') PokerUI.render(state);
    else if (view === 'gaple') GapleUI.render(state);
    else if (view === 'qiuqiu') QiuQiuUI.render(state);
  });

  socket.on('game:ended', () => {
    showView('room');
    showToast('Game selesai', 'info');
  });

  // Chat
  socket.on('chat:message', ({ sender, message }) => {
    appendChat(sender, message);
  });

  // Specific game events
  setupPokerSocketEvents();
  setupGapleSocketEvents();
  setupQiuQiuSocketEvents();
}

// ─── View Router ───────────────────────────────────────
function showView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  
  const viewMap = {
    'login': 'viewLogin',
    'gameSelect': 'viewGameSelect',
    'room': 'viewRoom',
    'poker': 'viewPoker',
    'gaple': 'viewGaple',
    'qiuqiu': 'viewQiuQiu'
  };

  const el = document.getElementById(viewMap[viewName]);
  if (el) {
    el.classList.add('active');
    App.currentView = viewName;
  }
}

// ─── UI Helpers ────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function updatePlayerDisplay() {
  const nameEl = document.getElementById('displayPlayerName');
  if (nameEl) nameEl.textContent = App.player.displayName;

  document.querySelectorAll('.chip-amount').forEach(el => {
    el.textContent = formatChips(App.player.chips);
  });
}

function formatChips(n) {
  return n.toLocaleString('id-ID');
}

function appendChat(sender, message) {
  const container = document.getElementById('chatMessages');
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `<span class="chat-sender">${escapeHtml(sender)}:</span> <span class="chat-text">${escapeHtml(message)}</span>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Card/Domino Rendering Helpers ─────────────────────
const SUIT_SYMBOLS = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const RANK_DISPLAY = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: '10', 9: '9', 8: '8', 7: '7', 6: '6', 5: '5', 4: '4', 3: '3', 2: '2' };

function createCardHTML(card, faceDown = false) {
  if (!card) return '';
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const colorClass = isRed ? 'red' : 'black';
  const rankStr = RANK_DISPLAY[card.rank] || card.rank;
  const suitStr = SUIT_SYMBOLS[card.suit] || '';
  
  return `
    <div class="playing-card ${faceDown ? 'flipped' : ''}">
      <div class="card-inner">
        <div class="card-front ${colorClass}">
          <div class="card-rank-suit">
            <span class="card-rank">${rankStr}</span>
            <span class="card-suit">${suitStr}</span>
          </div>
          <span class="card-center-suit">${suitStr}</span>
          <div class="card-rank-suit bottom">
            <span class="card-rank">${rankStr}</span>
            <span class="card-suit">${suitStr}</span>
          </div>
        </div>
        <div class="card-back"><div class="card-back-pattern"></div></div>
      </div>
    </div>
  `;
}

function createCardBackHTML(mini = false) {
  return `
    <div class="playing-card flipped ${mini ? 'card-mini' : ''}">
      <div class="card-inner">
        <div class="card-front"></div>
        <div class="card-back"><div class="card-back-pattern"></div></div>
      </div>
    </div>
  `;
}

// Domino dot positions for a half (0-6)
const DOMINO_DOTS = {
  0: [],
  1: ['dot-4'],
  2: ['dot-2', 'dot-6'],
  3: ['dot-2', 'dot-4', 'dot-6'],
  4: ['dot-1', 'dot-2', 'dot-6', 'dot-7'],
  5: ['dot-1', 'dot-2', 'dot-4', 'dot-6', 'dot-7'],
  6: ['dot-1', 'dot-2', 'dot-3', 'dot-5', 'dot-6', 'dot-7']
};

function createDominoHTML(tile, options = {}) {
  if (!tile) return '';
  const { faceDown = false, horizontal = false, clickable = false, index = 0, validMove = false } = options;
  
  if (faceDown) {
    return `<div class="domino-tile ${horizontal ? 'horizontal' : ''} ${clickable ? 'clickable' : ''}"><div class="domino-back"></div></div>`;
  }

  const topDots = DOMINO_DOTS[tile.top] || [];
  const bottomDots = DOMINO_DOTS[tile.bottom] || [];

  return `
    <div class="domino-tile ${horizontal ? 'horizontal' : ''} ${clickable ? 'clickable' : ''} ${validMove ? 'valid-move' : ''}" 
         data-index="${index}" data-top="${tile.top}" data-bottom="${tile.bottom}">
      <div class="domino-front">
        <div class="domino-half">
          ${topDots.map(d => `<div class="domino-dot ${d}"></div>`).join('')}
        </div>
        <div class="domino-divider"></div>
        <div class="domino-half">
          ${bottomDots.map(d => `<div class="domino-dot ${d}"></div>`).join('')}
        </div>
      </div>
    </div>
  `;
}

function createDominoBackHTML(mini = false) {
  return `<div class="domino-tile ${mini ? 'domino-mini' : ''}"><div class="domino-back"></div></div>`;
}

// ─── Turn Timer ────────────────────────────────────────
function startTurnTimer(barId, seconds = 30) {
  clearTurnTimer();
  App.turnTimeLeft = seconds;
  const bar = document.getElementById(barId);
  if (!bar) return;
  
  bar.style.transition = 'none';
  bar.style.width = '100%';
  
  requestAnimationFrame(() => {
    bar.style.transition = `width ${seconds}s linear`;
    bar.style.width = '0%';
  });

  App.turnTimer = setInterval(() => {
    App.turnTimeLeft--;
    if (App.turnTimeLeft <= 5 && App.turnTimeLeft > 0) {
      SoundFX.tick();
    }
  }, 1000);
}

function clearTurnTimer() {
  if (App.turnTimer) {
    clearInterval(App.turnTimer);
    App.turnTimer = null;
  }
}

// ─── Rendering helpers for room ────────────────────────
const AVATAR_EMOJIS = ['😎', '🤠', '👑', '🦊', '🐉', '🎭', '💎', '🔥'];

function renderRoomPlayers() {
  const container = document.getElementById('roomPlayersList');
  if (!container || !App.room) return;

  container.innerHTML = App.room.players.map(p => {
    const isHost = p.id === App.room.host;
    const isMe = socket && p.id === socket.id;
    const avatarEmoji = AVATAR_EMOJIS[(p.avatar - 1) % AVATAR_EMOJIS.length];

    return `
      <div class="room-player-card ${p.isReady ? 'ready' : ''} ${isHost ? 'host' : ''}">
        <div class="player-avatar">${avatarEmoji}</div>
        <div class="player-card-name">${escapeHtml(p.name)}${isMe ? ' (Kamu)' : ''}</div>
        <div class="player-card-status ${p.isReady ? 'ready-text' : ''}">${p.isReady ? '✅ Ready' : '⏳ Menunggu'}</div>
        <div class="player-card-chips">🪙 ${formatChips(p.chips)}</div>
      </div>
    `;
  }).join('');

  // Show/hide start button (host only)
  const btnStart = document.getElementById('btnStartGame');
  if (btnStart && socket) {
    const isHost = App.room.host === socket.id;
    const allReady = App.room.players.filter(p => p.id !== App.room.host).every(p => p.isReady);
    const enoughPlayers = App.room.players.length >= 2;
    
    if (isHost) {
      btnStart.classList.remove('hidden');
      btnStart.disabled = !(allReady && enoughPlayers);
    } else {
      btnStart.classList.add('hidden');
    }
  }
}

// ─── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initFirebase();
  showView('login');
});
