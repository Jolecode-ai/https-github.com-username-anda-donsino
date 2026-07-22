/* ═══════════════════════════════════════════════════════
   DON'SINO — Qiu Qiu UI Renderer
   ═══════════════════════════════════════════════════════ */

const QiuQiuUI = (() => {
  const PHASE_NAMES = {
    deal3: 'Deal 3 Kartu', betting1: 'Betting Ronde 1', deal4: 'Deal Kartu ke-4',
    betting2: 'Betting Ronde 2', showdown: 'Showdown', waiting: 'Menunggu'
  };

  function render(state) {
    if (!state) return;

    // Update header
    const round = document.getElementById('qiuqiuRound');
    const blinds = document.getElementById('qiuqiuBlinds');
    const phase = document.getElementById('qiuqiuPhase');
    const myChips = document.getElementById('qiuqiuMyChips');

    if (round) round.textContent = `Ronde ${state.roundNumber || 1}`;
    if (blinds) blinds.textContent = `Blind: ${state.smallBlind}/${state.bigBlind}`;
    if (phase) phase.textContent = PHASE_NAMES[state.phase] || state.phase;

    const myPlayer = state.players?.find(p => p.id === socket?.id);
    if (myChips && myPlayer) myChips.textContent = formatChips(myPlayer.chips);

    renderSeats(state);
    renderPot(state);
    renderMyHand(state);
    renderActions(state);
  }

  function renderSeats(state) {
    const container = document.getElementById('qiuqiuSeats');
    if (!container || !state.players) return;

    // Reorder so current player is at position 0
    const myIndex = state.players.findIndex(p => p.id === socket?.id);
    const ordered = [];
    for (let i = 0; i < state.players.length; i++) {
      ordered.push(state.players[(myIndex + i) % state.players.length]);
    }

    container.innerHTML = ordered.map((p, i) => {
      const isMe = p.id === socket?.id;
      const isCurrent = state.currentPlayerIndex !== undefined && state.players[state.currentPlayerIndex]?.id === p.id;
      const isDealer = state.dealerIndex !== undefined && state.players[state.dealerIndex]?.id === p.id;

      let badge = '';
      if (isDealer) badge = '<div class="seat-badge badge-dealer">D</div>';

      // Tiles display
      let tilesHtml = '';
      if (!isMe) {
        if (p.hasFolded) {
          tilesHtml = '';
        } else if (state.phase === 'showdown' && p.hand && p.hand.length) {
          tilesHtml = `<div class="seat-tiles">${p.hand.map((t, idx) => createDominoHTML(t, {index: idx})).join('')}</div>`;
        } else {
          const count = p.handCount || (p.hand ? p.hand.length : 3);
          tilesHtml = `<div class="seat-tiles">${Array.from({length: count}, () => createDominoBackHTML(true)).join('')}</div>`;
        }
      }

      // Hand name at showdown
      let handNameHtml = '';
      if (state.phase === 'showdown' && p.handResult) {
        handNameHtml = `<div class="hand-combination">${p.handResult.name}</div>`;
      }

      const betHtml = p.currentBet > 0 ? `<div class="seat-bet">Bet: ${formatChips(p.currentBet)}</div>` : '';

      return `
        <div class="qiuqiu-seat qq-seat-pos-${i}">
          <div class="seat-info ${isCurrent ? 'active-turn' : ''} ${p.hasFolded ? 'folded' : ''}">
            ${badge}
            <div class="seat-name">${escapeHtml(p.name || 'Player')}</div>
            <div class="seat-chips">🪙 ${formatChips(p.chips)}</div>
            ${betHtml}
          </div>
          ${tilesHtml}
          ${handNameHtml}
        </div>
      `;
    }).join('');
  }

  function renderPot(state) {
    const container = document.getElementById('qiuqiuPot');
    if (!container) return;
    const amount = container.querySelector('.pot-amount');
    if (amount) amount.textContent = formatChips(state.pot || 0);
  }

  function renderMyHand(state) {
    const container = document.getElementById('qiuqiuMyHand');
    if (!container) return;

    const myPlayer = state.players?.find(p => p.id === socket?.id);
    if (!myPlayer || !myPlayer.hand) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = myPlayer.hand.map((tile, i) => {
      return createDominoHTML(tile, { index: i });
    }).join('');
  }

  function renderActions(state) {
    const bar = document.getElementById('qiuqiuActionBar');
    if (!bar) return;

    const myPlayer = state.players?.find(p => p.id === socket?.id);
    const isMyTurn = state.currentPlayerIndex !== undefined &&
                     state.players[state.currentPlayerIndex]?.id === socket?.id;

    const isBettingPhase = state.phase === 'betting1' || state.phase === 'betting2';

    if (!isMyTurn || !myPlayer || myPlayer.hasFolded || !isBettingPhase) {
      bar.querySelectorAll('.btn').forEach(b => b.disabled = true);
      clearTurnTimer();
      return;
    }

    App.isMyTurn = true;
    startTurnTimer('qiuqiuTimerBar', 30);

    const btnFold = document.getElementById('btnQQFold');
    const btnCheck = document.getElementById('btnQQCheck');
    const btnCall = document.getElementById('btnQQCall');
    const btnRaise = document.getElementById('btnQQRaise');
    const callAmountEl = document.getElementById('qqCallAmount');

    const toCall = (state.currentBet || 0) - (myPlayer.currentBet || 0);
    const canCheck = toCall <= 0;

    btnFold.disabled = false;
    btnCheck.style.display = canCheck ? '' : 'none';
    btnCheck.disabled = false;
    btnCall.style.display = canCheck ? 'none' : '';
    btnCall.disabled = false;
    callAmountEl.textContent = formatChips(Math.min(toCall, myPlayer.chips));
    btnRaise.disabled = false;

    // Raise slider
    const sliderContainer = document.getElementById('qqRaiseSliderContainer');
    const slider = document.getElementById('qqRaiseSlider');
    const raiseAmountInput = document.getElementById('qqRaiseAmount');

    const minRaise = (state.currentBet || 0) + (state.minRaise || state.bigBlind || 100);
    slider.min = minRaise;
    slider.max = myPlayer.chips + (myPlayer.currentBet || 0);
    slider.value = minRaise;
    raiseAmountInput.value = minRaise;
    raiseAmountInput.min = minRaise;

    slider.oninput = () => { raiseAmountInput.value = slider.value; };
    raiseAmountInput.oninput = () => { slider.value = raiseAmountInput.value; };
  }

  return { render };
})();

// ─── Qiu Qiu Socket Events ──────────────────────────
function setupQiuQiuSocketEvents() {
  if (!socket) return;

  socket.on('qiuqiu:showdown', (data) => {
    if (data) {
      if (data.results) {
        data.results.forEach(r => {
          if (r.id === socket.id) {
            App.player.chips = r.chips;
            updatePlayerDisplay();
          }
        });
      }
      showResults(data);
    }
  });
}

// ─── Qiu Qiu Action Handlers ────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnQQFold')?.addEventListener('click', () => {
    sendQQAction('fold');
    SoundFX.fold();
  });

  document.getElementById('btnQQCheck')?.addEventListener('click', () => {
    sendQQAction('check');
    SoundFX.check();
  });

  document.getElementById('btnQQCall')?.addEventListener('click', () => {
    sendQQAction('call');
    SoundFX.chip();
  });

  document.getElementById('btnQQRaise')?.addEventListener('click', () => {
    const container = document.getElementById('qqRaiseSliderContainer');
    container.classList.toggle('hidden');
    SoundFX.click();
  });

  document.getElementById('btnQQConfirmRaise')?.addEventListener('click', () => {
    const amount = parseInt(document.getElementById('qqRaiseAmount').value);
    sendQQAction('raise', amount);
    document.getElementById('qqRaiseSliderContainer').classList.add('hidden');
    SoundFX.chip();
  });

  document.getElementById('btnQiuQiuMenu')?.addEventListener('click', () => {
    if (confirm('Keluar dari game?')) {
      if (socket) socket.emit('game:back-to-lobby', () => {});
      showView('room');
    }
  });
});

function sendQQAction(action, amount) {
  if (!socket) return;
  App.isMyTurn = false;
  clearTurnTimer();

  socket.emit('game:action', { action, amount }, (response) => {
    if (!response.success) {
      showToast(response.error || 'Aksi gagal', 'error');
    }
  });
}
