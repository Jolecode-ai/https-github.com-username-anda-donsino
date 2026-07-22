/* ═══════════════════════════════════════════════════════
   DON'SINO — Lobby UI Logic
   Login, Game Selection, Room Management
   ═══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  // ─── Auth Tab Switching ────────────────────────────────
  const btnTabLogin = document.getElementById('btnTabLogin');
  const btnTabRegister = document.getElementById('btnTabRegister');
  const formLogin = document.getElementById('formLogin');
  const formRegister = document.getElementById('formRegister');

  btnTabLogin.addEventListener('click', () => {
    btnTabLogin.classList.add('active');
    btnTabRegister.classList.remove('active');
    formLogin.classList.remove('hidden');
    formRegister.classList.add('hidden');
    SoundFX.click();
  });

  btnTabRegister.addEventListener('click', () => {
    btnTabRegister.classList.add('active');
    btnTabLogin.classList.remove('active');
    formRegister.classList.remove('hidden');
    formLogin.classList.add('hidden');
    SoundFX.click();
  });

  // ─── Login Form ────────────────────────────────────────
  document.getElementById('formLogin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
      showToast('Isi semua field', 'error');
      return;
    }

    const btn = document.getElementById('btnLogin');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Masuk...';

    const success = await loginUser(email, password);
    
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Masuk';

    if (success) {
      connectSocket();
    }
  });

  // ─── Register Form ─────────────────────────────────────
  document.getElementById('formRegister').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nickname = document.getElementById('regNickname').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;

    if (!nickname || !email || !password) {
      showToast('Isi semua field', 'error');
      return;
    }

    if (nickname.length < 2) {
      showToast('Nickname minimal 2 karakter', 'error');
      return;
    }

    const btn = document.getElementById('btnRegister');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Mendaftar...';

    const success = await registerUser(email, password, nickname);
    
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Buat Akun';

    if (success) {
      connectSocket();
    }
  });

  // ─── Google Login ──────────────────────────────────────
  document.getElementById('btnGoogleLogin').addEventListener('click', async () => {
    const success = await loginWithGoogle();
    if (success) {
      connectSocket();
    }
  });

  // ─── Guest Login ───────────────────────────────────────
  document.getElementById('btnGuest').addEventListener('click', () => {
    const name = document.getElementById('guestName').value.trim();
    if (!name) {
      showToast('Masukkan nama kamu', 'error');
      return;
    }
    if (name.length < 2) {
      showToast('Nama minimal 2 karakter', 'error');
      return;
    }
    loginAsGuest(name);
    connectSocket();
    SoundFX.click();
  });

  // Enter key on guest name input
  document.getElementById('guestName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('btnGuest').click();
    }
  });

  // ─── Logout ────────────────────────────────────────────
  document.getElementById('btnLogout').addEventListener('click', () => {
    logoutUser();
    SoundFX.click();
  });

  // ─── Game Selection ────────────────────────────────────
  const modal = document.getElementById('modalRoomAction');
  const modalTitle = document.getElementById('modalGameTitle');
  const joinInput = document.getElementById('joinRoomInput');

  document.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', () => {
      App.selectedGame = card.dataset.game;
      const names = { poker: '🃏 Texas Hold\'em Poker', gaple: '🁣 Gaple', qiuqiu: '🎲 Qiu Qiu' };
      modalTitle.textContent = names[App.selectedGame] || '';
      joinInput.classList.add('hidden');
      modal.classList.remove('hidden');
      SoundFX.click();
    });
  });

  document.getElementById('btnCloseModal').addEventListener('click', () => {
    modal.classList.add('hidden');
    SoundFX.click();
  });

  document.querySelector('#modalRoomAction .modal-overlay').addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  // ─── Create Room ───────────────────────────────────────
  document.getElementById('btnCreateRoom').addEventListener('click', () => {
    if (!socket || !socket.connected) {
      showToast('Tidak terhubung ke server', 'error');
      return;
    }

    socket.emit('create-room', {
      gameType: App.selectedGame,
      playerName: App.player.displayName,
      avatar: App.player.avatar
    }, (response) => {
      if (response.success) {
        App.room = response.room;
        modal.classList.add('hidden');
        showView('room');
        updateRoomDisplay();
        SoundFX.notify();
      } else {
        showToast(response.error || 'Gagal membuat room', 'error');
      }
    });
  });

  // ─── Join Room ─────────────────────────────────────────
  document.getElementById('btnJoinRoomModal').addEventListener('click', () => {
    joinInput.classList.toggle('hidden');
    if (!joinInput.classList.contains('hidden')) {
      document.getElementById('inputRoomCode').focus();
    }
    SoundFX.click();
  });

  document.getElementById('btnJoinRoom').addEventListener('click', () => {
    joinRoom();
  });

  document.getElementById('inputRoomCode').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinRoom();
  });

  function joinRoom() {
    const code = document.getElementById('inputRoomCode').value.trim().toUpperCase();
    if (!code || code.length !== 6) {
      showToast('Kode room harus 6 karakter', 'error');
      return;
    }

    if (!socket || !socket.connected) {
      showToast('Tidak terhubung ke server', 'error');
      return;
    }

    socket.emit('join-room', {
      code: code,
      playerName: App.player.displayName,
      avatar: App.player.avatar
    }, (response) => {
      if (response.success) {
        App.room = response.room;
        App.selectedGame = response.room.gameType;
        modal.classList.add('hidden');
        showView('room');
        updateRoomDisplay();
        SoundFX.notify();
      } else {
        showToast(response.error || 'Gagal gabung room', 'error');
      }
    });
  }

  // ─── Room Controls ─────────────────────────────────────
  document.getElementById('btnBackToSelect').addEventListener('click', () => {
    if (socket) {
      socket.emit('leave-room', () => {});
    }
    App.room = null;
    showView('gameSelect');
    SoundFX.click();
  });

  document.getElementById('btnCopyCode').addEventListener('click', () => {
    const code = App.room?.code;
    if (code) {
      navigator.clipboard.writeText(code).then(() => {
        showToast('Kode disalin: ' + code, 'success');
      }).catch(() => {
        showToast('Kode: ' + code, 'info');
      });
    }
    SoundFX.click();
  });

  document.getElementById('btnReady').addEventListener('click', () => {
    if (!socket) return;
    socket.emit('toggle-ready', (response) => {
      if (response && response.success) {
        const btn = document.getElementById('btnReady');
        btn.textContent = response.isReady ? '❌ Batal Ready' : '✋ Ready';
        SoundFX.click();
      }
    });
  });

  document.getElementById('btnStartGame').addEventListener('click', () => {
    if (!socket) return;
    socket.emit('start-game', (response) => {
      if (!response.success) {
        showToast(response.error || 'Gagal memulai', 'error');
      }
    });
    SoundFX.notify();
  });

  // ─── Buy Chips ─────────────────────────────────────────
  const buyChipsModal = document.getElementById('modalBuyChips');

  document.getElementById('btnBuyChips').addEventListener('click', () => {
    buyChipsModal.classList.remove('hidden');
    SoundFX.click();
  });

  document.getElementById('btnCloseBuyChips').addEventListener('click', () => {
    buyChipsModal.classList.add('hidden');
    SoundFX.click();
  });

  document.querySelector('#modalBuyChips .modal-overlay').addEventListener('click', () => {
    buyChipsModal.classList.add('hidden');
  });

  document.querySelectorAll('.chip-package').forEach(pkg => {
    pkg.addEventListener('click', () => {
      const amount = parseInt(pkg.dataset.amount);
      if (!socket || !socket.connected) {
        // Offline mode - just add chips
        App.player.chips += amount;
        updatePlayerDisplay();
        buyChipsModal.classList.add('hidden');
        showToast(`+${formatChips(amount)} chip berhasil ditambahkan!`, 'success');
        saveChipsToFirebase();
        SoundFX.chip();
        return;
      }

      socket.emit('buy-chips', { amount }, (response) => {
        if (response.success) {
          App.player.chips = response.newBalance;
          updatePlayerDisplay();
          buyChipsModal.classList.add('hidden');
          showToast(`+${formatChips(amount)} chip berhasil!`, 'success');
          saveChipsToFirebase();
          SoundFX.chip();
        } else {
          showToast(response.error || 'Gagal beli chip', 'error');
        }
      });
    });
  });

  // ─── Chat ──────────────────────────────────────────────
  document.getElementById('btnSendChat').addEventListener('click', sendChatMessage);
  document.getElementById('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });

  function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg || !socket) return;
    socket.emit('chat:message', { message: msg });
    input.value = '';
  }

  // ─── Results Overlay ───────────────────────────────────
  document.getElementById('btnNextRound').addEventListener('click', () => {
    document.getElementById('overlayResults').classList.add('hidden');
    if (socket) {
      socket.emit('game:next-round', (response) => {
        if (!response.success) {
          showToast(response.error || 'Gagal lanjut ronde', 'error');
        }
      });
    }
    SoundFX.click();
  });

  document.getElementById('btnBackToRoom').addEventListener('click', () => {
    document.getElementById('overlayResults').classList.add('hidden');
    if (socket) {
      socket.emit('game:back-to-lobby', () => {});
    }
    showView('room');
    SoundFX.click();
  });
});

// ─── Update Room Display ───────────────────────────────
function updateRoomDisplay() {
  if (!App.room) return;
  
  document.getElementById('roomCodeDisplay').textContent = App.room.code;
  
  const gameNames = { poker: '🃏 Poker', gaple: '🁣 Gaple', qiuqiu: '🎲 Qiu Qiu' };
  document.getElementById('roomGameType').textContent = gameNames[App.room.gameType] || '';
  
  renderRoomPlayers();
}

// ─── Show Results Overlay ──────────────────────────────
function showResults(data) {
  const overlay = document.getElementById('overlayResults');
  const title = document.getElementById('resultsTitle');
  const content = document.getElementById('resultsContent');
  const taxInfo = document.getElementById('taxInfo');
  const taxAmount = document.getElementById('taxAmount');
  const btnNext = document.getElementById('btnNextRound');

  // Check if current player is host
  const isHost = App.room && socket && App.room.host === socket.id;
  btnNext.style.display = isHost ? '' : 'none';

  if (data.winner) {
    const isMe = data.winner.id === socket?.id;
    title.textContent = isMe ? '🏆 Kamu Menang!' : `🏆 ${escapeHtml(data.winner.name)} Menang!`;
    
    if (isMe) SoundFX.win();
    else SoundFX.lose();
  } else {
    title.textContent = '🏁 Ronde Selesai';
  }

  let html = '';
  if (data.results) {
    html += '<div style="text-align:left;">';
    data.results.forEach(r => {
      const chipChange = r.chipChange > 0 ? `+${formatChips(r.chipChange)}` : formatChips(r.chipChange);
      const chipColor = r.chipChange > 0 ? 'var(--accent-emerald-light)' : r.chipChange < 0 ? 'var(--accent-ruby)' : 'var(--text-muted)';
      html += `
        <div style="display:flex;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid rgba(255,255,255,0.05);">
          <span>${escapeHtml(r.name)} ${r.handName ? `(${r.handName})` : ''}</span>
          <span style="color:${chipColor};font-family:var(--font-mono);font-weight:600;">${chipChange}</span>
        </div>
      `;
    });
    html += '</div>';
  }

  content.innerHTML = html;
  
  if (data.tax && data.tax > 0) {
    taxAmount.textContent = formatChips(Math.round(data.tax));
    taxInfo.style.display = '';
  } else {
    taxInfo.style.display = 'none';
  }

  overlay.classList.remove('hidden');
}
