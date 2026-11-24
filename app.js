/**
 * Japa Mala - Digital Mantra Counter
 * Production Script
 */

(() => {
  'use strict';

  const STORAGE_KEY = 'japa_mala_devotional_data_v1';
  const CIRCUMFERENCE = 2 * Math.PI * 120;
  const MAX_BEADS = 108;

  const getTodayDateKey = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDateDisplay = (dateStr) => {
    try {
      const [year, month, day] = dateStr.split('-');
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  let state = {
    currentBead: 0,
    completedRounds: 0,
    lifetimeChants: 0,
    targetRounds: 16,
    soundEnabled: true,
    vibrateEnabled: true,
    tapSoundEnabled: true,
    wakeLockEnabled: true,
    history: {}
  };

  let previousState = null;
  let wakeLockSentinel = null;
  let audioCtx = null;

  const dom = {
    btnSoundToggle: document.getElementById('btn-sound-toggle'),
    btnVibrateToggle: document.getElementById('btn-vibrate-toggle'),
    btnHistoryOpen: document.getElementById('btn-history-open'),
    btnSettingsOpen: document.getElementById('btn-settings-open'),
    mantraBanner: document.getElementById('mantra-banner'),
    btnToggleMantra: document.getElementById('btn-toggle-mantra'),
    mantraContent: document.getElementById('mantra-content'),
    mantraArrow: document.getElementById('mantra-arrow'),
    displayRounds: document.getElementById('display-rounds'),
    displayTarget: document.getElementById('display-target'),
    displayLifetime: document.getElementById('display-lifetime'),
    displayBead: document.getElementById('display-bead'),
    progressCircle: document.getElementById('progress-circle'),
    btnChantTap: document.getElementById('btn-chant-tap'),
    rippleContainer: document.getElementById('ripple-container'),
    statusMessage: document.getElementById('status-message'),
    btnUndo: document.getElementById('btn-undo'),
    btnFullscreenToggle: document.getElementById('btn-fullscreen-toggle'),
    btnResetRound: document.getElementById('btn-reset-round'),
    fsOverlay: document.getElementById('fullscreen-overlay'),
    btnFsExit: document.getElementById('btn-fs-exit'),
    fsDisplayRounds: document.getElementById('fs-display-rounds'),
    fsDisplayTarget: document.getElementById('fs-display-target'),
    fsDisplayBead: document.getElementById('fs-display-bead'),
    btnFsUndo: document.getElementById('btn-fs-undo'),
    modalSumeru: document.getElementById('modal-sumeru'),
    sumeruRoundNum: document.getElementById('sumeru-round-num'),
    btnStartNextRound: document.getElementById('btn-start-next-round'),
    btnCloseSumeru: document.getElementById('btn-close-sumeru'),
    modalConfirm: document.getElementById('modal-confirm'),
    confirmTitle: document.getElementById('confirm-title'),
    confirmMessage: document.getElementById('confirm-message'),
    btnConfirmYes: document.getElementById('btn-confirm-yes'),
    btnConfirmCancel: document.getElementById('btn-confirm-cancel'),
    modalHistory: document.getElementById('modal-history'),
    btnHistoryClose: document.getElementById('btn-history-close'),
    historyTodayRounds: document.getElementById('history-today-rounds'),
    historyTodayChants: document.getElementById('history-today-chants'),
    historyGoalPct: document.getElementById('history-goal-pct'),
    historyGoalBar: document.getElementById('history-goal-bar'),
    historyListContainer: document.getElementById('history-list-container'),
    modalSettings: document.getElementById('modal-settings'),
    btnSettingsClose: document.getElementById('btn-settings-close'),
    selectTargetRounds: document.getElementById('select-target-rounds'),
    toggleTapSound: document.getElementById('toggle-tap-sound'),
    toggleWakeLock: document.getElementById('toggle-wake-lock'),
    btnResetToday: document.getElementById('btn-reset-today'),
    btnResetLifetime: document.getElementById('btn-reset-lifetime')
  };

  const initAudio = () => {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  };

  const playTapSound = () => {
    if (!state.soundEnabled || !state.tapSoundEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320 + Math.random() * 20, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(140, audioCtx.currentTime + 0.04);

      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.045);
    } catch {
      // Audio not ready
    }
  };

  const playSumeruBell = () => {
    if (!state.soundEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;

      const rootFreq = 528;
      const harmonics = [1, 2.01, 3.03, 4.2];
      const gains = [0.25, 0.12, 0.06, 0.03];

      harmonics.forEach((ratio, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(rootFreq * ratio, audioCtx.currentTime);

        gain.gain.setValueAtTime(gains[idx], audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 2.4);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 2.5);
      });
    } catch {
      // Audio fallback
    }
  };

  const triggerHaptic = (type = 'tap') => {
    if (!state.vibrateEnabled || !navigator.vibrate) return;
    try {
      if (type === 'tap') {
        navigator.vibrate(22);
      } else if (type === 'sumeru') {
        navigator.vibrate([60, 50, 120]);
      } else if (type === 'undo') {
        navigator.vibrate(40);
      }
    } catch {
      // Vibration unavailable
    }
  };

  const requestWakeLock = async () => {
    if (!state.wakeLockEnabled || !('wakeLock' in navigator)) return;
    try {
      if (!wakeLockSentinel) {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
        wakeLockSentinel.addEventListener('release', () => {
          wakeLockSentinel = null;
        });
      }
    } catch {
      // Wake lock unavailable
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockSentinel) {
      wakeLockSentinel.release();
      wakeLockSentinel = null;
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.wakeLockEnabled) {
      requestWakeLock();
    }
  });

  const loadState = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        state = { ...state, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Could not read state from localStorage', e);
    }
  };

  const saveState = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Could not save state to localStorage', e);
    }
  };

  const recordChantToHistory = () => {
    const today = getTodayDateKey();
    if (!state.history[today]) {
      state.history[today] = { rounds: 0, chants: 0 };
    }
    state.history[today].chants += 1;
  };

  const recordRoundToHistory = () => {
    const today = getTodayDateKey();
    if (!state.history[today]) {
      state.history[today] = { rounds: 0, chants: 0 };
    }
    state.history[today].rounds += 1;
  };

  const getTodayHistory = () => {
    const today = getTodayDateKey();
    return state.history[today] || { rounds: 0, chants: 0 };
  };

  const createRipple = (e) => {
    const button = dom.btnChantTap;
    const rect = button.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.classList.add('ripple-circle');

    let x, y;
    if (e && e.clientX && e.clientY) {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    } else {
      x = rect.width / 2;
      y = rect.height / 2;
    }

    const diameter = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = `${diameter}px`;
    ripple.style.left = `${x - diameter / 2}px`;
    ripple.style.top = `${y - diameter / 2}px`;

    dom.rippleContainer.appendChild(ripple);
    setTimeout(() => ripple.remove(), 450);
  };

  const updateUI = () => {
    dom.displayBead.textContent = state.currentBead;
    dom.fsDisplayBead.textContent = state.currentBead;

    const progressFraction = state.currentBead / MAX_BEADS;
    const offset = CIRCUMFERENCE - (progressFraction * CIRCUMFERENCE);
    dom.progressCircle.style.strokeDashoffset = offset;

    dom.displayRounds.textContent = state.completedRounds;
    dom.fsDisplayRounds.textContent = state.completedRounds;
    dom.displayTarget.textContent = `/ ${state.targetRounds}`;
    dom.fsDisplayTarget.textContent = state.targetRounds;
    dom.displayLifetime.textContent = state.lifetimeChants.toLocaleString();

    dom.btnSoundToggle.classList.toggle('muted', !state.soundEnabled);
    dom.btnSoundToggle.querySelector('.icon').textContent = state.soundEnabled ? '🔔' : '🔕';

    dom.btnVibrateToggle.classList.toggle('muted', !state.vibrateEnabled);
    dom.btnVibrateToggle.querySelector('.icon').textContent = state.vibrateEnabled ? '📳' : '📴';

    dom.selectTargetRounds.value = String(state.targetRounds);
    dom.toggleTapSound.checked = state.tapSoundEnabled;
    dom.toggleWakeLock.checked = state.wakeLockEnabled;

    dom.btnUndo.style.opacity = previousState ? '1' : '0.45';
    dom.btnFsUndo.style.opacity = previousState ? '1' : '0.45';
  };

  const snapshotState = () => {
    previousState = {
      currentBead: state.currentBead,
      completedRounds: state.completedRounds,
      lifetimeChants: state.lifetimeChants,
      historySnapshot: JSON.parse(JSON.stringify(state.history))
    };
  };

  const handleChantTap = (event) => {
    initAudio();
    requestWakeLock();

    snapshotState();

    state.currentBead += 1;
    state.lifetimeChants += 1;
    recordChantToHistory();

    playTapSound();
    triggerHaptic('tap');
    if (event) createRipple(event);

    if (state.currentBead >= MAX_BEADS) {
      handleRoundComplete();
    } else {
      dom.statusMessage.innerHTML = `<span>Bead ${state.currentBead} of 108 • Progress saved</span>`;
    }

    saveState();
    updateUI();
  };

  const handleRoundComplete = () => {
    state.completedRounds += 1;
    recordRoundToHistory();
    saveState();

    playSumeruBell();
    triggerHaptic('sumeru');

    dom.sumeruRoundNum.textContent = state.completedRounds;
    dom.modalSumeru.classList.remove('hidden');

    exitFullscreenMode();
  };

  const startNextRound = () => {
    state.currentBead = 0;
    dom.modalSumeru.classList.add('hidden');
    dom.statusMessage.innerHTML = `<span>Round ${state.completedRounds + 1} started! Haribol!</span>`;
    saveState();
    updateUI();
  };

  const handleUndo = () => {
    if (!previousState) return;

    state.currentBead = previousState.currentBead;
    state.completedRounds = previousState.completedRounds;
    state.lifetimeChants = previousState.lifetimeChants;
    state.history = previousState.historySnapshot;

    previousState = null;
    triggerHaptic('undo');
    dom.statusMessage.innerHTML = `<span>Tap undone successfully ↩</span>`;

    saveState();
    updateUI();
  };

  let confirmCallback = null;

  const showConfirmModal = (title, message, callback) => {
    dom.confirmTitle.textContent = title;
    dom.confirmMessage.textContent = message;
    confirmCallback = callback;
    dom.modalConfirm.classList.remove('hidden');
  };

  const closeConfirmModal = () => {
    dom.modalConfirm.classList.add('hidden');
    confirmCallback = null;
  };

  const enterFullscreenMode = () => {
    dom.fsOverlay.classList.remove('hidden');
    requestWakeLock();
  };

  const exitFullscreenMode = () => {
    dom.fsOverlay.classList.add('hidden');
  };

  const openHistoryDrawer = () => {
    const todayData = getTodayHistory();
    dom.historyTodayRounds.textContent = todayData.rounds;
    dom.historyTodayChants.textContent = todayData.chants.toLocaleString();

    const goalPct = Math.min(100, Math.round((todayData.rounds / state.targetRounds) * 100));
    dom.historyGoalPct.textContent = `${goalPct}%`;
    dom.historyGoalBar.style.width = `${goalPct}%`;

    dom.historyListContainer.innerHTML = '';
    const sortedDates = Object.keys(state.history).sort().reverse();

    if (sortedDates.length === 0) {
      dom.historyListContainer.innerHTML = `
        <div style="text-align: center; color: var(--color-text-subtle); padding: 16px;">
          No previous sessions logged yet. Begin chanting to build your daily history!
        </div>
      `;
    } else {
      sortedDates.slice(0, 14).forEach(dateStr => {
        const item = state.history[dateStr];
        const row = document.createElement('div');
        row.className = 'history-row';
        row.innerHTML = `
          <span class="row-date">${formatDateDisplay(dateStr)}</span>
          <div class="row-stats">
            <span class="row-rounds">${item.rounds} rounds</span>
            <span class="row-chants">(${item.chants} chants)</span>
          </div>
        `;
        dom.historyListContainer.appendChild(row);
      });
    }

    dom.modalHistory.classList.remove('hidden');
  };

  const setupEventListeners = () => {
    dom.btnChantTap.addEventListener('click', (e) => handleChantTap(e));

    dom.fsOverlay.addEventListener('click', (e) => {
      if (e.target === dom.btnFsExit || e.target === dom.btnFsUndo) return;
      handleChantTap(null);
    });

    dom.btnUndo.addEventListener('click', handleUndo);
    dom.btnFsUndo.addEventListener('click', (e) => {
      e.stopPropagation();
      handleUndo();
    });

    dom.btnFullscreenToggle.addEventListener('click', enterFullscreenMode);
    dom.btnFsExit.addEventListener('click', (e) => {
      e.stopPropagation();
      exitFullscreenMode();
    });

    dom.btnToggleMantra.addEventListener('click', () => {
      dom.mantraContent.classList.toggle('collapsed');
      dom.mantraArrow.classList.toggle('collapsed');
    });

    dom.btnSoundToggle.addEventListener('click', () => {
      state.soundEnabled = !state.soundEnabled;
      if (state.soundEnabled) playTapSound();
      saveState();
      updateUI();
    });

    dom.btnVibrateToggle.addEventListener('click', () => {
      state.vibrateEnabled = !state.vibrateEnabled;
      if (state.vibrateEnabled) triggerHaptic('tap');
      saveState();
      updateUI();
    });

    dom.btnResetRound.addEventListener('click', () => {
      if (state.currentBead === 0) return;
      showConfirmModal(
        'Reset Current Round?',
        `This will set your current bead count (${state.currentBead}) back to 0. Completed rounds will remain safe.`,
        () => {
          snapshotState();
          state.currentBead = 0;
          dom.statusMessage.innerHTML = `<span>Current round reset to 0</span>`;
          saveState();
          updateUI();
        }
      );
    });

    dom.btnStartNextRound.addEventListener('click', startNextRound);
    dom.btnCloseSumeru.addEventListener('click', () => {
      dom.modalSumeru.classList.add('hidden');
    });

    dom.btnConfirmYes.addEventListener('click', () => {
      if (confirmCallback) confirmCallback();
      closeConfirmModal();
    });
    dom.btnConfirmCancel.addEventListener('click', closeConfirmModal);

    dom.btnHistoryOpen.addEventListener('click', openHistoryDrawer);
    dom.btnHistoryClose.addEventListener('click', () => {
      dom.modalHistory.classList.add('hidden');
    });

    dom.btnSettingsOpen.addEventListener('click', () => {
      dom.modalSettings.classList.remove('hidden');
    });
    dom.btnSettingsClose.addEventListener('click', () => {
      dom.modalSettings.classList.add('hidden');
    });

    dom.selectTargetRounds.addEventListener('change', (e) => {
      state.targetRounds = parseInt(e.target.value, 10) || 16;
      saveState();
      updateUI();
    });

    dom.toggleTapSound.addEventListener('change', (e) => {
      state.tapSoundEnabled = e.target.checked;
      saveState();
    });

    dom.toggleWakeLock.addEventListener('change', (e) => {
      state.wakeLockEnabled = e.target.checked;
      if (state.wakeLockEnabled) {
        requestWakeLock();
      } else {
        releaseWakeLock();
      }
      saveState();
    });

    dom.btnResetToday.addEventListener('click', () => {
      showConfirmModal(
        "Reset Today's Rounds?",
        "Are you sure you want to reset today's rounds and chants count back to 0?",
        () => {
          const today = getTodayDateKey();
          if (state.history[today]) {
            state.history[today] = { rounds: 0, chants: 0 };
          }
          state.completedRounds = 0;
          state.currentBead = 0;
          saveState();
          updateUI();
          dom.modalSettings.classList.add('hidden');
        }
      );
    });

    dom.btnResetLifetime.addEventListener('click', () => {
      showConfirmModal(
        "Reset All Data?",
        "WARNING: This will permanently wipe all lifetime chants, rounds, and history logs. This action cannot be undone.",
        () => {
          state = {
            currentBead: 0,
            completedRounds: 0,
            lifetimeChants: 0,
            targetRounds: 16,
            soundEnabled: true,
            vibrateEnabled: true,
            tapSoundEnabled: true,
            wakeLockEnabled: true,
            history: {}
          };
          previousState = null;
          saveState();
          updateUI();
          dom.modalSettings.classList.add('hidden');
        }
      );
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        handleChantTap(null);
      } else if (e.code === 'KeyU') {
        handleUndo();
      } else if (e.code === 'Escape') {
        exitFullscreenMode();
        dom.modalSumeru.classList.add('hidden');
        dom.modalConfirm.classList.add('hidden');
        dom.modalHistory.classList.add('hidden');
        dom.modalSettings.classList.add('hidden');
      }
    });

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => {
          console.log('SW registration note:', err);
        });
      });
    }
  };

  const init = () => {
    loadState();
    setupEventListeners();
    updateUI();
    if (state.wakeLockEnabled) {
      requestWakeLock();
    }
  };

  init();
})();
