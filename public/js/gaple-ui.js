/* ═══════════════════════════════════════════════════════
   DON'SINO — Gaple UI Renderer
   ═══════════════════════════════════════════════════════ */

const GapleUI = (() => {
  let selectedTileIndex = null;
  let selectedSide = null;

  function render(state) {
    if (!state) return;

    // Update header
    const round = document.getElementById('gapleRound');
    const scores = document.getElementById('gapleScores');
    const phase = document.getElementById('gaplePhase');
    const myChips = document.getElementById('gapleMyChips');

    if (round) round.textContent = `Ronde ${state.roundNumber || 1}`;
    if (phase) phase.textContent = state.phase === 'playing' ? 'Bermain' : state.phase;
    
    const myPlayer = state.players?.find(p => p.id === socket?.id);
    if (myChips && myPlayer) myChips.textContent = formatChips(myPlayer.chips);
    
    if (scores && state.scores && myPlayer) {
      scores.textContent = `Skor: ${state.scores[myPlayer.id] || 0}`;
    }

    renderOpponents(state);
    renderChain(state);
    renderMyHand(state);
    renderBonePile(state);
    renderActions(state);
  }

  function renderOpponents(state) {
    const container = document.getElementById('gapleOpponents');
    if (!container || !state.players) return;

    const opponents = state.players.filter(p => p.id !== socket?.id);
    const currentPlayer = state.players[state.currentPlayerIndex];

    container.innerHTML = opponents.map(p => {
      const tileCount = p.handCount || (p.hand ? p.hand.length : '?');
      const isActive = currentPlayer?.id === p.id;
      
      return `
        <div class="gaple-opponent ${isActive ? 'active-turn' : ''} ${p.hasPassed ? 'passed' : ''}">
          <div class="opponent-name">${escapeHtml(p.name || 'Player')}</div>
          <div class="opponent-tiles">
            ${Array.from({length: Math.min(tileCount, 7)}, () => createDominoBackHTML(true)).join('')}
          </div>
          <div class="opponent-tiles-count">${tileCount} kartu</div>
        </div>
      `;
    }).join('');
  }

  function renderChain(state) {
    const container = document.getElementById('gapleChain');
    if (!container) return;

    if (!state.chain || state.chain.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);font-style:italic;padding:2rem;">Menunggu kartu pertama...</div>';
      return;
    }

    container.innerHTML = state.chain.map((entry, i) => {
      const tile = entry.tile;
      const isNew = i === state.chain.length - 1;
      return createDominoHTML(tile, { horizontal: true, index: i });
    }).join('');
  }

  function renderMyHand(state) {
    const container = document.getElementById('gapleMyHand');
    if (!container) return;

    const myPlayer = state.players?.find(p => p.id === socket?.id);
    if (!myPlayer || !myPlayer.hand) {
      container.innerHTML = '';
      return;
    }

    const validMoves = state.validMoves || [];
    const isMyTurn = state.players[state.currentPlayerIndex]?.id === socket?.id;

    container.innerHTML = myPlayer.hand.map((tile, i) => {
      const move = validMoves.find(m => m.tileIndex === i);
      const isValid = isMyTurn && !!move;
      const isSelected = selectedTileIndex === i;

      let html = createDominoHTML(tile, { clickable: isMyTurn, index: i, validMove: isValid });
      
      // Add side selection popup if this tile is selected
      if (isSelected && move) {
        const sides = move.sides || [];
        let sideButtons = '';
        if (sides.includes('left') || sides.includes('both')) {
          sideButtons += `<button class="btn btn-sm btn-gold side-btn" data-side="left">← Kiri</button>`;
        }
        if (sides.includes('right') || sides.includes('both')) {
          sideButtons += `<button class="btn btn-sm btn-gold side-btn" data-side="right">Kanan →</button>`;
        }
        // If only one side available, just show it
        if (sides.length === 1 && sides[0] !== 'both') {
          sideButtons = `<button class="btn btn-sm btn-gold side-btn" data-side="${sides[0]}">${sides[0] === 'left' ? '← Kiri' : 'Kanan →'}</button>`;
        }
        html += `<div class="side-select">${sideButtons}</div>`;
      }

      return `<div class="domino-wrapper" style="position:relative;display:inline-block;">${html}</div>`;
    }).join('');

    // Bind click events
    if (isMyTurn) {
      container.querySelectorAll('.domino-tile.clickable').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = parseInt(el.dataset.index);
          const move = validMoves.find(m => m.tileIndex === idx);
          
          if (!move) {
            showToast('Kartu ini tidak bisa dimainkan', 'error');
            return;
          }

          // If only one side, play directly
          const sides = move.sides || [];
          if (sides.length === 1 && sides[0] !== 'both') {
            playDomino(idx, sides[0]);
            return;
          }

          // If both sides available, or the chain is empty (first play)
          if (state.chain.length === 0) {
            playDomino(idx, 'right');
            return;
          }

          // Toggle selection for side choice
          selectedTileIndex = selectedTileIndex === idx ? null : idx;
          render(state); // Re-render to show side selector
          SoundFX.click();
        });
      });

      // Bind side buttons
      container.querySelectorAll('.side-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const side = btn.dataset.side;
          if (selectedTileIndex !== null) {
            playDomino(selectedTileIndex, side);
            selectedTileIndex = null;
          }
        });
      });
    }
  }

  function renderBonePile(state) {
    const bonePile = document.getElementById('gapleBonePile');
    if (!bonePile) return;

    if (state.bonePileCount > 0) {
      bonePile.classList.remove('hidden');
      bonePile.querySelector('.bone-pile-count').textContent = `${state.bonePileCount} sisa`;
    } else {
      bonePile.classList.add('hidden');
    }
  }

  function renderActions(state) {
    const bar = document.getElementById('gapleActionBar');
    if (!bar) return;

    const isMyTurn = state.players[state.currentPlayerIndex]?.id === socket?.id;
    const btnPass = document.getElementById('btnGaplePass');
    const btnDraw = document.getElementById('btnDrawTile');
    const validMoves = state.validMoves || [];

    if (isMyTurn) {
      startTurnTimer('gapleTimerBar', 30);
      
      // Can only pass if no valid moves
      if (btnPass) {
        btnPass.disabled = validMoves.length > 0;
        btnPass.style.display = '';
      }
      
      // Draw button for 2-player mode
      if (btnDraw) {
        btnDraw.style.display = (state.bonePileCount > 0 && validMoves.length === 0) ? '' : 'none';
      }
    } else {
      clearTurnTimer();
      if (btnPass) btnPass.disabled = true;
    }
  }

  function playDomino(tileIndex, side) {
    if (!socket) return;
    clearTurnTimer();
    
    socket.emit('game:action', { action: 'play', tileIndex, side }, (response) => {
      if (!response.success) {
        showToast(response.error || 'Gagal menaruh kartu', 'error');
      } else {
        SoundFX.placeTile();
      }
    });
  }

  return { render };
})();

// ─── Gaple Socket Events ─────────────────────────────
function setupGapleSocketEvents() {
  if (!socket) return;

  socket.on('gaple:round-end', (data) => {
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

// ─── Gaple Action Handlers ───────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnGaplePass')?.addEventListener('click', () => {
    if (!socket) return;
    clearTurnTimer();
    socket.emit('game:action', { action: 'pass' }, (response) => {
      if (!response.success) {
        showToast(response.error || 'Gagal pass', 'error');
      }
    });
    SoundFX.click();
  });

  document.getElementById('btnDrawTile')?.addEventListener('click', () => {
    if (!socket) return;
    socket.emit('game:action', { action: 'draw' }, (response) => {
      if (!response.success) {
        showToast(response.error || 'Gagal ambil kartu', 'error');
      } else {
        SoundFX.deal();
      }
    });
  });

  document.getElementById('btnGapleMenu')?.addEventListener('click', () => {
    if (confirm('Keluar dari game?')) {
      if (socket) socket.emit('game:back-to-lobby', () => {});
      showView('room');
    }
  });
});
