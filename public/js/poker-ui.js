/* ═══════════════════════════════════════════════════════
   DON'SINO — Poker UI Renderer
   ═══════════════════════════════════════════════════════ */

const PokerUI = (() => {
  const PHASE_NAMES = {
    preflop: 'Pre-Flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown', waiting: 'Menunggu'
  };

  function render(state) {
    if (!state) return;

    // Update header info
    const round = document.getElementById('pokerRound');
    const blinds = document.getElementById('pokerBlinds');
    const phase = document.getElementById('pokerPhase');
    const myChips = document.getElementById('pokerMyChips');

    if (round) round.textContent = `Ronde ${state.roundNumber || 1}`;
    if (blinds) blinds.textContent = `Blind: ${state.smallBlind}/${state.bigBlind}`;
    if (phase) phase.textContent = PHASE_NAMES[state.phase] || state.phase;

    const myPlayer = state.players?.find(p => p.id === socket?.id);
    if (myChips && myPlayer) myChips.textContent = formatChips(myPlayer.chips);

    renderSeats(state);
    renderCommunityCards(state);
    renderPot(state);
    renderMyCards(state);
    renderActions(state);
  }

  function renderSeats(state) {
    const container = document.getElementById('pokerSeats');
    if (!container || !state.players) return;

    // Reorder so current player is at position 0 (bottom)
    const myIndex = state.players.findIndex(p => p.id === socket?.id);
    const ordered = [];
    for (let i = 0; i < state.players.length; i++) {
      ordered.push(state.players[(myIndex + i) % state.players.length]);
    }

    container.innerHTML = ordered.map((p, i) => {
      const isMe = p.id === socket?.id;
      const isCurrent = state.currentPlayerIndex !== undefined && state.players[state.currentPlayerIndex]?.id === p.id;
      const isDealer = state.dealerIndex !== undefined && state.players[state.dealerIndex]?.id === p.id;
      
      // Determine badge
      let badge = '';
      if (isDealer) badge = '<div class="seat-badge badge-dealer">D</div>';
      
      // Cards display (opponent = face down, me = shown separately)
      let cardsHtml = '';
      if (!isMe) {
        if (p.hasFolded) {
          cardsHtml = '';
        } else if (state.phase === 'showdown' && p.holeCards && p.holeCards.length) {
          cardsHtml = `<div class="seat-cards">${p.holeCards.map(c => createCardHTML(c)).join('')}</div>`;
        } else {
          cardsHtml = `<div class="seat-cards">${createCardBackHTML(true)}${createCardBackHTML(true)}</div>`;
        }
      }

      // Bet display
      const betHtml = p.currentBet > 0 ? `<div class="seat-bet">Bet: ${formatChips(p.currentBet)}</div>` : '';

      // Last action label
      let actionLabel = '';
      if (p.lastAction) {
        const labelClass = `label-${p.lastAction}`;
        actionLabel = `<div class="seat-action-label ${labelClass}">${p.lastAction.toUpperCase()}</div>`;
      }

      return `
        <div class="poker-seat seat-pos-${i}">
          <div class="seat-info ${isCurrent ? 'active-turn' : ''} ${p.hasFolded ? 'folded' : ''}">
            ${badge}
            <div class="seat-name">${escapeHtml(p.name || 'Player')}</div>
            <div class="seat-chips">🪙 ${formatChips(p.chips)}</div>
            ${betHtml}
            ${p.isAllIn ? '<div style="color:#f39c12;font-size:0.6rem;font-weight:700;">ALL IN</div>' : ''}
          </div>
          ${cardsHtml}
          ${actionLabel}
        </div>
      `;
    }).join('');
  }

  function renderCommunityCards(state) {
    const container = document.getElementById('pokerCommunityCards');
    if (!container) return;

    if (!state.communityCards || state.communityCards.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = state.communityCards.map((c, i) => {
      return createCardHTML(c);
    }).join('');
  }

  function renderPot(state) {
    const container = document.getElementById('pokerPot');
    if (!container) return;
    const amount = container.querySelector('.pot-amount');
    if (amount) amount.textContent = formatChips(state.pot || 0);
  }

  function renderMyCards(state) {
    const container = document.getElementById('pokerMyCards');
    if (!container) return;

    const myPlayer = state.players?.find(p => p.id === socket?.id);
    if (!myPlayer || !myPlayer.holeCards || myPlayer.holeCards.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = myPlayer.holeCards.map(c => createCardHTML(c)).join('');
  }

  function renderActions(state) {
    const bar = document.getElementById('pokerActionBar');
    if (!bar) return;

    const myPlayer = state.players?.find(p => p.id === socket?.id);
    const isMyTurn = state.currentPlayerIndex !== undefined && 
                     state.players[state.currentPlayerIndex]?.id === socket?.id;

    // Hide action bar if not my turn or game is over
    if (!isMyTurn || !myPlayer || myPlayer.hasFolded || myPlayer.isAllIn || state.phase === 'showdown') {
      bar.querySelectorAll('.btn').forEach(b => b.disabled = true);
      clearTurnTimer();
      return;
    }

    App.isMyTurn = true;
    startTurnTimer('pokerTimerBar', 30);

    const btnFold = document.getElementById('btnFold');
    const btnCheck = document.getElementById('btnCheck');
    const btnCall = document.getElementById('btnCall');
    const btnRaise = document.getElementById('btnRaise');
    const btnAllIn = document.getElementById('btnAllIn');
    const callAmountEl = document.getElementById('callAmount');

    const toCall = (state.currentBet || 0) - (myPlayer.currentBet || 0);
    const canCheck = toCall <= 0;

    btnFold.disabled = false;
    btnCheck.style.display = canCheck ? '' : 'none';
    btnCheck.disabled = false;
    btnCall.style.display = canCheck ? 'none' : '';
    btnCall.disabled = false;
    callAmountEl.textContent = formatChips(Math.min(toCall, myPlayer.chips));
    btnRaise.disabled = false;
    btnAllIn.disabled = false;

    // Raise slider
    const sliderContainer = document.getElementById('raiseSliderContainer');
    const slider = document.getElementById('raiseSlider');
    const raiseAmountInput = document.getElementById('raiseAmount');
    
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

// ─── Poker Socket Events ─────────────────────────────
function setupPokerSocketEvents() {
  if (!socket) return;

  socket.on('poker:showdown', (data) => {
    if (data) {
      // Update chips
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

// ─── Poker Action Handlers ───────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnFold')?.addEventListener('click', () => {
    sendGameAction('fold');
    SoundFX.fold();
  });

  document.getElementById('btnCheck')?.addEventListener('click', () => {
    sendGameAction('check');
    SoundFX.check();
  });

  document.getElementById('btnCall')?.addEventListener('click', () => {
    sendGameAction('call');
    SoundFX.chip();
  });

  document.getElementById('btnRaise')?.addEventListener('click', () => {
    const container = document.getElementById('raiseSliderContainer');
    container.classList.toggle('hidden');
    SoundFX.click();
  });

  document.getElementById('btnConfirmRaise')?.addEventListener('click', () => {
    const amount = parseInt(document.getElementById('raiseAmount').value);
    sendGameAction('raise', amount);
    document.getElementById('raiseSliderContainer').classList.add('hidden');
    SoundFX.chip();
  });

  document.getElementById('btnAllIn')?.addEventListener('click', () => {
    sendGameAction('allin');
    SoundFX.chip();
  });

  document.getElementById('btnPokerMenu')?.addEventListener('click', () => {
    // Simple menu - back to lobby option
    if (confirm('Keluar dari game?')) {
      if (socket) socket.emit('game:back-to-lobby', () => {});
      showView('room');
    }
  });
});

function sendGameAction(action, amount) {
  if (!socket) return;
  App.isMyTurn = false;
  clearTurnTimer();
  
  socket.emit('game:action', { action, amount }, (response) => {
    if (!response.success) {
      showToast(response.error || 'Aksi gagal', 'error');
    }
  });
}
