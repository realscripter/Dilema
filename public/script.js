'use strict';

// ─── Utilities ──────────────────────────────────────────────────────

/**
 * Escape HTML special characters to prevent XSS when inserting into DOM.
 * Uses a cached <div> element for reliable encoding.
 */
const _escapeDiv = document.createElement('div');
function escapeHtml(str) {
    if (!str) return '';
    _escapeDiv.textContent = str;
    return _escapeDiv.innerHTML;
}

/**
 * Debounce button clicks to prevent rapid double-submissions.
 * @param {HTMLElement} btn - Button element
 * @param {number} ms - Lock duration in milliseconds
 * @returns {boolean} true if click is allowed, false if locked
 */
function debounceClick(btn, ms = 1500) {
    if (btn.dataset.locked === '1') return false;
    btn.dataset.locked = '1';
    setTimeout(() => { btn.dataset.locked = '0'; }, ms);
    return true;
}

/**
 * Safely get an element by ID, logging a warning if missing.
 * @param {string} id
 * @returns {HTMLElement|null}
 */
function $(id) {
    return document.getElementById(id);
}

// ─── Session Token (crypto-safe) ────────────────────────────────────
function generateSessionToken() {
    try {
        const array = new Uint8Array(24);
        crypto.getRandomValues(array);
        return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    } catch {
        // Fallback for environments without crypto.getRandomValues
        return Math.random().toString(36).substr(2) + Date.now().toString(36);
    }
}

const sessionToken = localStorage.getItem('dilemma_token') || generateSessionToken();
localStorage.setItem('dilemma_token', sessionToken);

// ─── Sound Effects (Web Audio API) ──────────────────────────────────
const SFX = (() => {
    let ctx = null;

    function getCtx() {
        if (!ctx) {
            try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
            catch { return null; }
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    function playTick() {
        const c = getCtx();
        if (!c) return;
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, c.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, c.currentTime + 0.05);
        gain.gain.setValueAtTime(0.15, c.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start();
        osc.stop(c.currentTime + 0.08);
    }

    function playTickUrgent() {
        const c = getCtx();
        if (!c) return;
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(1000, c.currentTime);
        gain.gain.setValueAtTime(0.2, c.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start();
        osc.stop(c.currentTime + 0.1);
    }

    function playReveal() {
        const c = getCtx();
        if (!c) return;
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, c.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, c.currentTime + 0.15);
        osc.frequency.exponentialRampToValueAtTime(600, c.currentTime + 0.3);
        gain.gain.setValueAtTime(0.2, c.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start();
        osc.stop(c.currentTime + 0.4);
    }

    function playSuccess() {
        const c = getCtx();
        if (!c) return;
        [523.25, 659.25, 783.99].forEach((freq, i) => {
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, c.currentTime + i * 0.12);
            gain.gain.setValueAtTime(0.15, c.currentTime + i * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.12 + 0.2);
            osc.connect(gain);
            gain.connect(c.destination);
            osc.start(c.currentTime + i * 0.12);
            osc.stop(c.currentTime + i * 0.12 + 0.2);
        });
    }

    function playBuzzer() {
        const c = getCtx();
        if (!c) return;
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, c.currentTime);
        gain.gain.setValueAtTime(0.15, c.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start();
        osc.stop(c.currentTime + 0.3);
    }

    function playVote() {
        const c = getCtx();
        if (!c) return;
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(500, c.currentTime);
        osc.frequency.exponentialRampToValueAtTime(700, c.currentTime + 0.08);
        gain.gain.setValueAtTime(0.12, c.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start();
        osc.stop(c.currentTime + 0.12);
    }

    return { playTick, playTickUrgent, playReveal, playSuccess, playBuzzer, playVote };
})();

// ─── Animation Helpers ──────────────────────────────────────────────
const Anim = {
    /**
     * Add a CSS animation class to an element, remove it after completion.
     */
    animate(el, animClass, duration = 500) {
        if (!el) return Promise.resolve();
        return new Promise(resolve => {
            el.classList.add(animClass);
            setTimeout(() => {
                el.classList.remove(animClass);
                resolve();
            }, duration);
        });
    },

    /**
     * Fade an element in with optional slide.
     */
    fadeIn(el, delay = 0) {
        if (!el) return;
        el.style.opacity = '0';
        el.style.transform = 'translateY(12px)';
        el.style.transition = 'none';
        setTimeout(() => {
            el.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        }, delay);
    },

    /**
     * Stagger animate children of a container.
     */
    staggerIn(container, selector, baseDelay = 50) {
        if (!container) return;
        const children = container.querySelectorAll(selector);
        children.forEach((child, i) => {
            child.style.opacity = '0';
            child.style.transform = 'translateY(10px)';
            child.style.transition = 'none';
            setTimeout(() => {
                child.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                child.style.opacity = '1';
                child.style.transform = 'translateY(0)';
            }, baseDelay * (i + 1));
        });
    },

    /**
     * Pulse an element.
     */
    pulse(el) {
        if (!el) return;
        el.classList.add('anim-pulse');
        setTimeout(() => el.classList.remove('anim-pulse'), 600);
    },

    /**
     * Scale pop an element.
     */
    pop(el) {
        if (!el) return;
        el.classList.add('anim-pop');
        setTimeout(() => el.classList.remove('anim-pop'), 400);
    }
};

// ─── Socket.IO Connection ───────────────────────────────────────────
const socket = io({
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
    auth: { token: sessionToken }
});

// ─── Application State ──────────────────────────────────────────────
let currentRoom = null;
let myId = null;
let players = [];
let currentDilemma = null;
let currentMode = 'dilemma';
let currentSettings = {};
let selectedChoice = null;
let selectedVotePerson = null;
let photoData = { 1: null, 2: null };
let slideshowInterval = null;
let createTimerInterval = null;
let createTimerSeconds = null;
let pageVisibilityTimeout = null;
let lastInputTime = 0;
let inputMonitorInterval = null;
let currentCropImage = null;
let currentCropTarget = null;
let cropBox = null;
let cropBoxX = 0, cropBoxY = 0, cropBoxSize = 100;
let cropStartX = 0, cropStartY = 0;
let initialCropBoxX = 0, initialCropBoxY = 0, initialCropBoxSize = 100;
let voteTimerInterval = null;
let voteTimerSeconds = null;
let tournamentData = null;
let scoreboardData = null;
let isSpectator = false;
let gameHistory = [];

// ─── Custom Questions (localStorage) ────────────────────────────────
const CustomQuestions = {
    KEY: 'dilemma_custom_questions',

    load() {
        try {
            const data = localStorage.getItem(this.KEY);
            return data ? JSON.parse(data) : [];
        } catch { return []; }
    },

    save(questions) {
        try {
            localStorage.setItem(this.KEY, JSON.stringify(questions));
        } catch { /* quota exceeded */ }
    },

    add(option1, option2) {
        const questions = this.load();
        questions.push({ option1, option2 });
        this.save(questions);
        return questions;
    },

    remove(index) {
        const questions = this.load();
        questions.splice(index, 1);
        this.save(questions);
        return questions;
    },

    exportJSON() {
        return JSON.stringify(this.load(), null, 2);
    },

    importJSON(json) {
        try {
            const data = JSON.parse(json);
            if (!Array.isArray(data)) return false;
            const valid = data.filter(q => q.option1 && q.option2);
            this.save(valid);
            return valid.length;
        } catch { return false; }
    }
};

// ─── Emoji Reactions ────────────────────────────────────────────────
const EmojiReactions = {
    emojis: ['😂', '😍', '🤯', '😱', '🔥', '💀', '👀', '🤮', '😈', '🥶', '👏', '💯'],

    send(emoji) {
        if (!currentRoom) return;
        socket.emit('emoji-reaction', { roomCode: currentRoom, emoji });
        // Also show locally
        this.float(emoji, 'Jij');
    },

    float(emoji, playerName) {
        const container = $('emoji-float-container');
        if (!container) return;

        const el = document.createElement('div');
        el.className = 'emoji-float';
        el.textContent = emoji;
        el.style.left = (10 + Math.random() * 80) + '%';
        el.style.animationDuration = (2 + Math.random() * 1.5) + 's';
        el.style.fontSize = (1.5 + Math.random() * 1) + 'rem';
        container.appendChild(el);

        el.addEventListener('animationend', () => el.remove());
        setTimeout(() => { if (el.parentNode) el.remove(); }, 5000);
    }
};

// ─── Sound Effects: Additional ──────────────────────────────────────
// Extend SFX with fanfare
SFX.playFanfare = function() {
    const c = SFX._getCtx ? SFX._getCtx() : null;
    if (!c) {
        // Fallback: use playSuccess pattern but more elaborate
        // Access via closure in the SFX IIFE
    }
};

// Patch SFX to add fanfare and countdown tick (extend the existing object)
(function extendSFX() {
    let ctx = null;
    function getCtx() {
        if (!ctx) {
            try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
            catch { return null; }
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    SFX.playCountdownTick = function(remaining) {
        const c = getCtx();
        if (!c) return;
        const freq = remaining <= 3 ? 880 : 660;
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = remaining <= 3 ? 'square' : 'sine';
        osc.frequency.setValueAtTime(freq, c.currentTime);
        gain.gain.setValueAtTime(remaining <= 3 ? 0.2 : 0.12, c.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start();
        osc.stop(c.currentTime + 0.1);
    };

    SFX.playFanfare = function() {
        const c = getCtx();
        if (!c) return;
        const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
        const durations = [0.15, 0.15, 0.15, 0.3, 0.15, 0.4];
        let time = c.currentTime;
        notes.forEach((freq, i) => {
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, time);
            gain.gain.setValueAtTime(0.18, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + durations[i]);
            osc.connect(gain);
            gain.connect(c.destination);
            osc.start(time);
            osc.stop(time + durations[i]);
            time += durations[i] * 0.8;
        });
    };

    SFX.playVoteReveal = function() {
        const c = getCtx();
        if (!c) return;
        // Dramatic drum roll effect
        for (let i = 0; i < 6; i++) {
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(200 + i * 80, c.currentTime + i * 0.05);
            gain.gain.setValueAtTime(0.1 + i * 0.02, c.currentTime + i * 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.05 + 0.08);
            osc.connect(gain);
            gain.connect(c.destination);
            osc.start(c.currentTime + i * 0.05);
            osc.stop(c.currentTime + i * 0.05 + 0.08);
        }
        // Final hit
        setTimeout(() => {
            const osc2 = c.createOscillator();
            const gain2 = c.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(600, c.currentTime);
            osc2.frequency.exponentialRampToValueAtTime(900, c.currentTime + 0.2);
            gain2.gain.setValueAtTime(0.2, c.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.4);
            osc2.connect(gain2);
            gain2.connect(c.destination);
            osc2.start();
            osc2.stop(c.currentTime + 0.4);
        }, 350);
    };
})();

// ─── DOM References ─────────────────────────────────────────────────
const usernameInput = $('username-input');
const createInitBtn = $('create-init-btn');
const roomCodeInput = $('room-code-input');
const joinBtn = $('join-btn');
const createConfirmBtn = $('create-confirm-btn');
const submitDilemmaBtn = $('submit-dilemma-btn');
const option1Input = $('option1-input');
const option2Input = $('option2-input');
const voteBtn1 = $('vote-option1');
const voteBtn2 = $('vote-option2');
const leaveBtn = $('leave-btn');
const leaveGameBtn = $('leave-game-btn');
const confirmModal = $('confirm-modal');
const alertModal = $('alert-modal');
const resultMessage = $('result-message');
const answerDisplay = $('answer-display');
const answerInput = $('answer-input');
const submitAnswerBtn = $('submit-answer-btn');
const backVoteBtn = $('back-vote-btn');
const selectedQuestionText = $('selected-question-text');
const votersProgressContainer = $('voters-progress-container');
const timerProgress = $('timer-progress');
const timerSeconds = $('timer-seconds');
const resultTimerContainer = $('result-timer-container');

// ─── Alert System ───────────────────────────────────────────────────
let alertCallback = null;

/**
 * Show a modal alert dialog.
 * @param {string} title
 * @param {string} message
 * @param {function} [callback] - Called when user clicks OK
 */
function showAlert(title, message, callback) {
    const titleEl = $('alert-title');
    const msgEl = $('alert-message');
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    alertCallback = callback || null;
    if (alertModal) alertModal.classList.add('active');
}

$('alert-ok-btn')?.addEventListener('click', () => {
    if (alertModal) alertModal.classList.remove('active');
    if (alertCallback) {
        const cb = alertCallback;
        alertCallback = null;
        cb();
    }
});

// ─── Screen / View Management ───────────────────────────────────────

/**
 * Switch to a named screen (landing, settings, waiting, game).
 * @param {string} screenName
 */
function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = $(screenName + '-screen');
    if (el) el.classList.add('active');
}

/**
 * Switch to a named view within the game screen.
 * @param {string} viewName
 */
function showView(viewName) {
    const map = {
        creatorChoice: 'creator-choice-view',
        creatorInput: 'creator-input-view',
        voterWaiting: 'voter-waiting-view',
        vote: 'vote-view',
        votePerson: 'vote-person-view',
        answer: 'answer-view',
        result: 'result-view',
        tournamentView: 'tournament-view'
    };
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = $(map[viewName]);
    if (el) el.classList.add('active');
}

// ─── Socket Events: Connection ──────────────────────────────────────
socket.on('connect', () => { myId = socket.id; });

socket.on('disconnect', () => {
    if (currentRoom) {
        showAlert('Verbinding verloren', 'Probeer opnieuw te verbinden...');
    }
});

socket.on('reconnect', () => {
    // Session token reconnection is handled by server automatically
});

// ─── Reconnect Notifications ────────────────────────────────────────
socket.on('player-disconnected', ({ name, timeout }) => {
    showToast(`⚠️ ${name} is losgekoppeld (${timeout}s om terug te komen)`, 'warning');
});

socket.on('player-reconnected', ({ name }) => {
    showToast(`✅ ${name} is teruggekomen!`, 'success');
    SFX.playSuccess();
});

// ─── Spectator Events ───────────────────────────────────────────────
socket.on('spectator-joined', ({ code, players: p, spectatorCount, settings }) => {
    isSpectator = true;
    currentRoom = code;
    currentSettings = settings;
    players = p;
    const codeDisplay = $('room-code-display');
    if (codeDisplay) codeDisplay.textContent = code;
    updatePlayerList(p);
    updateLobbySettings(settings);
    showScreen('waiting');
    showToast('👁️ Je kijkt mee als spectator', 'info');
    updateSpectatorCount(spectatorCount);
});

socket.on('spectator-count', (count) => {
    updateSpectatorCount(count);
});

// ─── Emoji Reaction Received ────────────────────────────────────────
socket.on('emoji-reaction', ({ emoji, playerName }) => {
    EmojiReactions.float(emoji, playerName);
});

// ─── Game History Received ──────────────────────────────────────────
socket.on('game-history', ({ history }) => {
    gameHistory = history;
    renderGameHistory(history);
});

socket.on('error', (msg) => {
    // Re-enable submit button if it was disabled for AI check
    if (submitDilemmaBtn) {
        submitDilemmaBtn.disabled = false;
        submitDilemmaBtn.textContent = 'Verstuur';
    }
    showAlert('Fout', typeof msg === 'string' ? msg : 'Er is een fout opgetreden.');
});

// ─── Activity Tracking ──────────────────────────────────────────────
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentRoom) {
        socket.emit('player-activity', currentRoom);
    }
});

// Periodic activity ping (every 60s when tab is visible)
setInterval(() => {
    if (!document.hidden && currentRoom) {
        socket.emit('player-activity', currentRoom);
    }
}, 60000);

// ─── Landing Screen ─────────────────────────────────────────────────
createInitBtn?.addEventListener('click', () => {
    const name = usernameInput?.value.trim();
    if (!name) return showAlert('Naam nodig', 'Vul eerst je naam in!');
    if (name.length > 12) return showAlert('Naam te lang', 'Maximaal 12 tekens!');
    showScreen('settings');
});

$('back-settings-btn')?.addEventListener('click', () => showScreen('landing'));

// Player count selector
document.querySelectorAll('#size-options .num-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#size-options .num-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

// ─── Toggle Switches ────────────────────────────────────────────────

/**
 * Handle toggling a settings switch, with validation for minimum modes.
 * @param {HTMLElement} toggle
 */
function handleToggle(toggle) {
    const mode = toggle.dataset.mode;

    if (mode === 'public-room') {
        toggle.classList.toggle('active');
    } else if (mode === 'rare-round') {
        toggle.classList.toggle('active');
        const settings = $('rare-round-settings');
        if (settings) settings.hidden = !toggle.classList.contains('active');
    } else if (mode === 'random-turn-order') {
        toggle.classList.toggle('active');
    } else if (mode === 'ai-filter') {
        toggle.classList.toggle('active');
        const settings = $('ai-filter-settings');
        if (settings) settings.hidden = !toggle.classList.contains('active');
    } else if (mode === 'timed-mode') {
        toggle.classList.toggle('active');
        const settings = $('timed-mode-settings');
        if (settings) settings.hidden = !toggle.classList.contains('active');
    } else if (mode === 'tournament-mode') {
        toggle.classList.toggle('active');
    } else if (mode === 'scoreboard-mode') {
        toggle.classList.toggle('active');
    } else if (toggle.dataset.category) {
        // Category toggles — allow multiple selection
        toggle.classList.toggle('active');
    } else {
        // Game mode toggles — enforce at least 1 active
        const wasActive = toggle.classList.contains('active');
        if (wasActive) {
            const activeToggles = document.querySelectorAll('#mode-settings-list .toggle-switch.active');
            if (activeToggles.length <= 1) {
                showAlert('Minimaal 1 modus', 'Je moet minstens 1 spelmodus actief hebben.');
                return;
            }
        }
        toggle.classList.toggle('active');
    }
}

document.querySelectorAll('.toggle-row').forEach(row => {
    row.addEventListener('click', (e) => {
        // Don't toggle when clicking on input fields or labels inside the row
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'LABEL') return;
        const toggle = row.querySelector('.toggle-switch');
        if (toggle) handleToggle(toggle);
    });
});

// ─── Create Room ────────────────────────────────────────────────────
createConfirmBtn?.addEventListener('click', () => {
    if (!debounceClick(createConfirmBtn)) return;

    const name = usernameInput?.value.trim();
    if (!name) return showAlert('Naam nodig', 'Vul eerst je naam in!');

    const maxPlayers = document.querySelector('#size-options .num-btn.active')?.dataset.value || '2';
    const allowedModes = [];
    document.querySelectorAll('#mode-settings-list .toggle-switch.active').forEach(t => {
        allowedModes.push(t.dataset.mode);
    });

    const timerVal = parseInt($('timer-select')?.value) || 0;
    const rareRoundEnabled = $('rare-round-toggle')?.classList.contains('active') || false;
    const rareRoundFrequency = rareRoundEnabled ? (parseInt($('rare-round-frequency')?.value) || 5) : null;
    const randomTurnOrder = $('random-turn-order-toggle')?.classList.contains('active') || false;
    const aiFilterEnabled = $('ai-filter-toggle')?.classList.contains('active') || false;
    const aiApiKey = aiFilterEnabled ? ($('ai-api-key')?.value.trim() || null) : null;

    // Validate AI filter terms of service
    if (aiFilterEnabled) {
        const tos = $('ai-tos-checkbox');
        if (!tos || !tos.checked) {
            return showAlert('Voorwaarden', 'Accepteer de voorwaarden om de AI filter te gebruiken.');
        }
    }

    const timedModeEnabled = $('timed-mode-toggle')?.classList.contains('active') || false;
    const timedModeSeconds = timedModeEnabled ? (parseInt($('timed-mode-seconds')?.value) || 15) : null;
    const tournamentEnabled = $('tournament-toggle')?.classList.contains('active') || false;
    const scoreboardEnabled = $('scoreboard-toggle')?.classList.contains('active') || false;

    const selectedCategories = [];
    document.querySelectorAll('#category-options .toggle-switch.active').forEach(t => {
        selectedCategories.push(t.dataset.category);
    });

    const isPublic = $('public-room-toggle')?.classList.contains('active') || false;
    const selectedAvatar = $('avatar-picker-btn')?.textContent.trim() || '😎';

    socket.emit('create-room', {
        playerName: name,
        maxPlayers,
        allowedModes,
        createTimerMinutes: timerVal > 0 ? timerVal : null,
        rareRoundEnabled,
        rareRoundFrequency,
        randomTurnOrder,
        aiFilterEnabled,
        aiApiKey,
        timedModeEnabled,
        timedModeSeconds,
        tournamentEnabled,
        scoreboardEnabled,
        selectedCategories,
        isPublic,
        avatar: selectedAvatar
    });
});

// ─── Join Room ──────────────────────────────────────────────────────
joinBtn?.addEventListener('click', () => {
    if (!debounceClick(joinBtn)) return;

    const name = usernameInput?.value.trim();
    const code = roomCodeInput?.value.trim().toUpperCase();
    if (!name) return showAlert('Naam nodig', 'Vul eerst je naam in!');
    if (!code || code.length < 4) return showAlert('Code nodig', 'Vul de kamercode in!');

    const selectedAvatar = $('avatar-picker-btn')?.textContent.trim() || '😎';
    socket.emit('join-room', { roomCode: code, playerName: name, avatar: selectedAvatar });
});

// Enter key shortcuts
roomCodeInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); joinBtn?.click(); }
});

usernameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); createInitBtn?.click(); }
});

// ─── Room Events ────────────────────────────────────────────────────
socket.on('room-created', ({ code, players: p, settings }) => {
    currentRoom = code;
    currentSettings = settings;
    players = p;
    const codeDisplay = $('room-code-display');
    if (codeDisplay) codeDisplay.textContent = code;
    updatePlayerList(p);
    updateLobbySettings(settings);
    showScreen('waiting');
    updateHostButton();
});

socket.on('join-success', ({ code, players: p, settings }) => {
    currentRoom = code;
    currentSettings = settings;
    players = p;
    const codeDisplay = $('room-code-display');
    if (codeDisplay) codeDisplay.textContent = code;
    updatePlayerList(p);
    updateLobbySettings(settings);
    showScreen('waiting');
    updateHostButton();
});

socket.on('player-update', (p) => {
    players = p;
    updatePlayerList(p);
    updateHostButton();
});

/**
 * Show/hide the host start button based on whether current player is host.
 */
function updateHostButton() {
    const btn = $('host-start-btn');
    if (!btn || !players.length) return;
    const isHost = players[0]?.id === myId;
    const enough = players.length >= 2;
    btn.hidden = !(isHost && enough);
}

$('host-start-btn')?.addEventListener('click', () => {
    if (currentRoom) socket.emit('start-game-request', currentRoom);
});

/**
 * Update the player list display in the lobby.
 * @param {Array} playersList
 */
function updatePlayerList(playersList) {
    players = playersList;
    const list = $('player-list');
    const counter = $('player-count-indicator');
    if (!list) return;

    list.innerHTML = '';
    playersList.forEach((p, i) => {
        const item = document.createElement('div');
        item.className = 'player-item';

        const leftSide = document.createElement('span');
        leftSide.className = 'player-item-left';
        const avatarSpan = document.createElement('span');
        avatarSpan.className = 'player-avatar';
        avatarSpan.textContent = p.avatar || '😎';
        leftSide.appendChild(avatarSpan);
        const nameSpan = document.createElement('span');
        nameSpan.textContent = p.name;
        leftSide.appendChild(nameSpan);
        item.appendChild(leftSide);

        if (i === 0) {
            const badge = document.createElement('span');
            badge.className = 'role-badge';
            badge.textContent = 'HOST';
            item.appendChild(badge);
        }
        list.appendChild(item);
    });

    if (counter) {
        counter.textContent = playersList.length + ' / ' + (currentSettings.maxPlayers || '?');
    }

    // Update opponents display in game header
    const opponentsDisplay = $('opponents-display');
    if (opponentsDisplay) {
        const names = playersList.filter(p => p.id !== myId).map(p => p.name);
        opponentsDisplay.textContent = names.join(', ');
    }
}

/**
 * Display room settings in the lobby waiting screen.
 * @param {object} settings
 */
function updateLobbySettings(settings) {
    const display = $('lobby-settings-display');
    if (!display) return;

    const modeNames = {
        dilemma: "Dilemma's",
        question: 'Open Vragen',
        photo: 'Foto',
        'vote-person': 'Vote Persoon'
    };
    const modes = (settings.allowedModes || []).map(m => modeNames[m] || m).join(', ');

    display.innerHTML = '';
    const items = [
        ['Spelmodi', modes],
        ['Timer', settings.createTimerMinutes ? settings.createTimerMinutes + ' min' : 'Oneindig'],
        ['Zeldzame rondes', settings.rareRoundEnabled ? 'Elke ' + settings.rareRoundFrequency + ' rondes' : 'Uit'],
        ['Willekeurige volgorde', settings.randomTurnOrder ? 'Aan' : 'Uit']
    ];

    if (settings.timedModeEnabled) items.push(['Vote Timer', settings.timedModeSeconds + ' sec']);
    if (settings.tournamentEnabled) items.push(['Tournament', 'Aan']);
    if (settings.scoreboardEnabled) items.push(['Scoreboard', 'Aan']);
    if (settings.selectedCategories?.length > 0) items.push(['Categorieën', settings.selectedCategories.join(', ')]);
    if (settings.isPublic) items.push(['Zichtbaarheid', '🌐 Openbaar']);

    items.forEach(([label, value]) => {
        const row = document.createElement('div');
        row.className = 'setting-item';
        const l = document.createElement('span');
        l.textContent = label;
        const v = document.createElement('strong');
        v.textContent = value;
        row.appendChild(l);
        row.appendChild(v);
        display.appendChild(row);
    });
}

/**
 * Update the round counter display.
 * @param {number} round
 */
function updateRound(round) {
    const el = $('round-display');
    if (el) el.textContent = round;
}

// ─── Game Start ─────────────────────────────────────────────────────
socket.on('game-start', ({ turnId, round, players: p, settings, isSpectator: spec }) => {
    if (spec) isSpectator = true;
    currentSettings = settings;
    players = p;
    updatePlayerList(p);
    updateRound(round);
    showScreen('game');
    handleTurn(turnId);
    updateModeButtons();
    SFX.playSuccess();

    // Show scoreboard toggle if enabled
    const sbBtn = $('scoreboard-toggle-btn');
    if (sbBtn) sbBtn.hidden = !settings.scoreboardEnabled;

    // Show spectator badge if spectator
    if (isSpectator) {
        const badge = $('spectator-self-badge');
        if (badge) badge.hidden = false;
    }
});

/**
 * Show/hide mode buttons based on allowed modes in settings.
 */
function updateModeButtons() {
    const modes = currentSettings.allowedModes || ['dilemma', 'question'];
    const map = {
        dilemma: 'choice-dilemma-btn',
        question: 'choice-question-btn',
        photo: 'choice-photo-btn',
        'vote-person': 'choice-vote-person-btn',
        'would-you-rather': 'choice-wyr-btn'
    };
    Object.entries(map).forEach(([mode, id]) => {
        const btn = $(id);
        if (btn) btn.hidden = !modes.includes(mode);
    });

    // Show tournament button if enabled
    const tournamentBtn = $('choice-tournament-btn');
    if (tournamentBtn) tournamentBtn.hidden = !currentSettings.tournamentEnabled;
}

/**
 * Handle a new turn — show appropriate view for creator or voter.
 * @param {string} newTurnId - Socket ID of the player whose turn it is
 */
function handleTurn(newTurnId) {
    resetTimer();
    if (answerInput) answerInput.value = '';
    if (option1Input) option1Input.value = '';
    if (option2Input) option2Input.value = '';
    photoData = { 1: null, 2: null };
    currentMode = 'dilemma';
    stopInputMonitoring();

    // Reset WYR-specific styling
    if (voteBtn1) voteBtn1.classList.remove('wyr-option');
    if (voteBtn2) voteBtn2.classList.remove('wyr-option');

    // Hide vote timer
    const vtContainer = $('vote-timer-container');
    if (vtContainer) vtContainer.hidden = true;

    // Reset photo previews
    [1, 2].forEach(num => {
        const prev = $('preview-' + num);
        if (prev) prev.hidden = true;
        const fi = $('file-input-' + num);
        if (fi) fi.value = '';
        const rmBtn = document.querySelector('.remove-photo-btn[data-target="' + num + '"]');
        if (rmBtn) rmBtn.hidden = true;
        const ub = $('photo-upload-' + num);
        if (ub) ub.classList.remove('has-image');
    });

    if (isSpectator) {
        // Spectator just waits and watches
        showView('voterWaiting');
        const waitH2 = document.querySelector('#voter-waiting-view h2');
        const creatorName = players.find(p => p.id === newTurnId)?.name || 'Iemand';
        if (waitH2) waitH2.innerHTML = '👁️ Spectating — <span>' + escapeHtml(creatorName) + '</span> maakt iets...';
        return;
    }

    if (newTurnId === myId) {
        // It's my turn — show creator view
        const rareInfo = $('rare-round-indicator');
        if (rareInfo) rareInfo.remove();

        if (currentSettings.isRareRound && currentSettings.rareRoundQuestion) {
            const indicator = document.createElement('div');
            indicator.id = 'rare-round-indicator';
            indicator.className = 'rare-hint';
            indicator.textContent = 'Zeldzame Ronde: ' + currentSettings.rareRoundQuestion;
            const choiceView = $('creator-choice-view');
            if (choiceView) {
                choiceView.insertBefore(indicator, choiceView.querySelector('.choice-buttons'));
            }
        }
        showView('creatorChoice');
    } else {
        // Someone else's turn — show waiting view
        const creatorName = players.find(p => p.id === newTurnId)?.name || 'Iemand';
        const waitH2 = document.querySelector('#voter-waiting-view h2');
        if (waitH2) waitH2.innerHTML = '<span>' + escapeHtml(creatorName) + '</span> maakt iets...';

        // Rare round indicator for voters
        const oldIndicator = $('rare-round-indicator-voter');
        if (oldIndicator) oldIndicator.remove();

        if (currentSettings.isRareRound) {
            const indicator = document.createElement('div');
            indicator.className = 'rare-hint';
            indicator.textContent = 'Zeldzame Ronde!';
            indicator.id = 'rare-round-indicator-voter';
            const waitView = $('voter-waiting-view');
            if (waitView && waitView.children[2]) {
                waitView.insertBefore(indicator, waitView.children[2]);
            }
        }
        showView('voterWaiting');
    }
}

// ─── Creator Mode Selection ─────────────────────────────────────────

/**
 * Select a creation mode and transition to the input view.
 * @param {string} mode - 'dilemma', 'question', 'photo', or 'vote-person'
 */
function selectCreatorMode(mode) {
    currentMode = mode;
    setCreatorMode(mode);
    showView('creatorInput');
    startCreatorTimer();
    if (mode === 'vote-person') startInputMonitoring();
}

$('choice-dilemma-btn')?.addEventListener('click', () => selectCreatorMode('dilemma'));
$('choice-question-btn')?.addEventListener('click', () => selectCreatorMode('question'));
$('choice-photo-btn')?.addEventListener('click', () => selectCreatorMode('photo'));
$('choice-vote-person-btn')?.addEventListener('click', () => selectCreatorMode('vote-person'));
$('choice-wyr-btn')?.addEventListener('click', () => selectCreatorMode('would-you-rather'));
$('choice-tournament-btn')?.addEventListener('click', () => {
    if (currentRoom) socket.emit('start-tournament', currentRoom);
});

$('back-choice-btn')?.addEventListener('click', () => {
    stopInputMonitoring();
    showView('creatorChoice');
});

/**
 * Request the server to start the creation timer if configured.
 */
function startCreatorTimer() {
    if (currentRoom && currentSettings.createTimerMinutes) {
        socket.emit('start-create-timer', currentRoom);
    }
}

/**
 * Add a rare round hint element to a container.
 * @param {HTMLElement} container
 */
function showRareRoundHint(container) {
    if (!container || !currentSettings.isRareRound || !currentSettings.rareRoundQuestion) return;
    const existing = container.querySelector('.rare-hint');
    if (existing) existing.remove();
    const hint = document.createElement('div');
    hint.className = 'rare-hint';
    hint.textContent = 'Zeldzame ronde: ' + currentSettings.rareRoundQuestion;
    container.insertBefore(hint, container.firstChild);
}

/**
 * Configure the creator input view for a specific mode.
 * @param {string} mode
 */
function setCreatorMode(mode) {
    const title = $('input-title');
    const instruction = $('instruction-text');
    const textInputs = $('text-inputs');
    const photoInputs = $('photo-inputs');
    const votePersonInputs = $('vote-person-inputs');

    // Reset all inputs
    if (option1Input) { option1Input.value = ''; option1Input.placeholder = 'Optie 1...'; }
    if (option2Input) { option2Input.value = ''; option2Input.placeholder = 'Optie 2...'; }
    const photoQ = $('photo-question-input');
    if (photoQ) photoQ.value = '';
    const vpQ = $('vote-person-question-input');
    if (vpQ) vpQ.value = '';

    // Hide all optional input containers
    if (photoInputs) { photoInputs.hidden = true; photoInputs.style.display = 'none'; }
    if (votePersonInputs) votePersonInputs.hidden = true;
    if (textInputs) textInputs.style.display = 'none';
    const wyrInputs = $('wyr-inputs');
    if (wyrInputs) wyrInputs.hidden = true;

    const isRare = currentSettings.isRareRound && currentSettings.rareRoundQuestion;
    const rareQ = currentSettings.rareRoundQuestion || '';

    if (mode === 'dilemma') {
        if (title) title.textContent = 'Nieuw Dilemma';
        if (instruction) instruction.textContent = isRare
            ? 'Maak een dilemma gebaseerd op: "' + rareQ + '"'
            : 'Verzin een lastig dilemma.';
        if (textInputs) textInputs.style.display = 'block';
        showRareRoundHint(textInputs);
    } else if (mode === 'question') {
        if (title) title.textContent = 'Open Vraag';
        if (instruction) instruction.textContent = isRare
            ? 'Stel 2 vragen gebaseerd op: "' + rareQ + '"'
            : 'Stel 2 vragen. Anderen kiezen er 1 en geven antwoord.';
        if (textInputs) textInputs.style.display = 'block';
        if (option1Input) option1Input.placeholder = 'Vraag 1...';
        if (option2Input) option2Input.placeholder = 'Vraag 2...';
        showRareRoundHint(textInputs);
    } else if (mode === 'photo') {
        if (title) title.textContent = 'Foto Modus';
        if (instruction) instruction.textContent = isRare
            ? 'Kies fotos gebaseerd op: "' + rareQ + '"'
            : 'Upload 2 fotos en laat anderen kiezen.';
        if (photoInputs) { photoInputs.hidden = false; photoInputs.style.display = 'flex'; }
        showRareRoundHint(photoInputs);
    } else if (mode === 'vote-person') {
        if (title) title.textContent = 'Vote de Persoon';
        if (instruction) instruction.textContent = isRare
            ? 'Stel een vraag gebaseerd op: "' + rareQ + '"'
            : 'Stel een vraag en laat anderen stemmen op wie er het beste bij past.';
        if (votePersonInputs) votePersonInputs.hidden = false;
        showRareRoundHint(votePersonInputs);
    } else if (mode === 'would-you-rather') {
        if (title) title.textContent = 'Zou Je Liever...';
        if (instruction) instruction.textContent = 'Kies een categorie of gebruik een random vraag!';

        // Show WYR inputs
        const wyrInputs = $('wyr-inputs');
        if (wyrInputs) wyrInputs.hidden = false;

        // Request a question from server
        const selectedCat = currentSettings.selectedCategories?.length > 0
            ? currentSettings.selectedCategories[Math.floor(Math.random() * currentSettings.selectedCategories.length)]
            : null;
        socket.emit('request-wyr', { roomCode: currentRoom, category: selectedCat });
    }
}

// ─── Input Monitoring (vote-person live typing) ─────────────────────
let lastTypingEmit = 0;

function startInputMonitoring() {
    stopInputMonitoring();
    const vpInput = $('vote-person-question-input');
    if (!vpInput) return;

    inputMonitorInterval = setInterval(() => {
        if (currentMode !== 'vote-person' || !currentRoom) return;
        const now = Date.now();
        if (now - lastTypingEmit < 200) return;
        lastTypingEmit = now;
        socket.emit('vote-person-typing', { roomCode: currentRoom, question: vpInput.value });
    }, 250);
}

function stopInputMonitoring() {
    if (inputMonitorInterval) {
        clearInterval(inputMonitorInterval);
        inputMonitorInterval = null;
    }
}

// ─── Create Timer Events ────────────────────────────────────────────
socket.on('create-timer-update', ({ remainingSeconds }) => {
    const container = $('timer-display-container');
    const timerValue = $('timer-value');
    if (container) container.hidden = false;

    if (timerValue) {
        const min = Math.floor(remainingSeconds / 60);
        const sec = remainingSeconds % 60;
        timerValue.textContent = min + ':' + (sec < 10 ? '0' : '') + sec;
        timerValue.style.color = remainingSeconds <= 10 ? 'var(--danger)' : '';
    }

    // Show countdown in voter waiting view
    const waitView = $('voter-waiting-view');
    if (waitView?.classList.contains('active')) {
        const waitText = waitView.querySelector('h2');
        if (waitText) {
            waitText.innerHTML = 'Wachten... <small>(' + remainingSeconds + 's)</small>';
        }
    }
});

socket.on('create-timer-stopped', () => {
    const container = $('timer-display-container');
    if (container) container.hidden = true;
});

socket.on('timer-expired-check', () => { attemptAutoSubmit(); });

socket.on('timer-expired', () => {
    const container = $('timer-display-container');
    if (container) container.hidden = true;
});

socket.on('round-skipped', ({ message }) => {
    showAlert('Ronde Overgeslagen', message);
});

/**
 * Attempt to auto-submit whatever the creator has filled in when timer expires.
 */
function attemptAutoSubmit() {
    if (!currentRoom) return;
    const payload = { roomCode: currentRoom, type: currentMode, isAutoSubmit: true };

    if (currentMode === 'photo') {
        if (photoData[1] && photoData[2]) {
            payload.option1 = photoData[1];
            payload.option2 = photoData[2];
            const q = $('photo-question-input')?.value.trim();
            if (q) payload.question = q;
            socket.emit('submit-dilemma', payload);
        }
    } else if (currentMode === 'vote-person') {
        const q = $('vote-person-question-input')?.value.trim();
        if (q) {
            payload.question = q;
            payload.option1 = 'vote-person';
            payload.option2 = 'vote-person';
            socket.emit('submit-dilemma', payload);
        }
    } else {
        const o1 = option1Input?.value.trim();
        const o2 = option2Input?.value.trim();
        if (o1 && o2) {
            payload.option1 = o1;
            payload.option2 = o2;
            socket.emit('submit-dilemma', payload);
        }
    }
}

// ─── Photo Crop Modal ───────────────────────────────────────────────
const MAX_PHOTO_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Open the crop modal for a selected image file.
 * @param {File} file - Image file to crop
 */
function openCropModal(file) {
    try {
        if (file.size > MAX_PHOTO_FILE_SIZE) {
            showAlert('Fout', 'Foto is te groot! Maximaal 10MB.');
            return;
        }

        const reader = new FileReader();
        reader.onerror = () => { showAlert('Fout', 'Kon foto niet laden.'); };
        reader.onload = (e) => {
            const img = new Image();
            img.onerror = () => { showAlert('Fout', 'Foto is beschadigd of ongeldig formaat.'); };
            img.onload = () => {
                currentCropImage = img;
                const canvas = $('crop-canvas');
                if (!canvas) return;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                // Scale image to fit modal
                const maxSize = Math.min(window.innerWidth * 0.8, window.innerHeight * 0.6, 500);
                let cw = img.width, ch = img.height;
                if (cw > maxSize || ch > maxSize) {
                    const ratio = maxSize / Math.max(cw, ch);
                    cw = Math.floor(cw * ratio);
                    ch = Math.floor(ch * ratio);
                }

                canvas.width = cw;
                canvas.height = ch;
                ctx.drawImage(img, 0, 0, cw, ch);

                // Initialize crop box to 60% of smallest dimension, centered
                cropBoxSize = Math.min(cw, ch) * 0.6;
                cropBoxX = (cw - cropBoxSize) / 2;
                cropBoxY = (ch - cropBoxSize) / 2;
                updateCropBox();

                $('crop-modal')?.classList.add('active');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    } catch {
        showAlert('Fout', 'Kon foto niet lezen.');
    }
}

/**
 * Update the visual position of the crop selection box.
 */
function updateCropBox() {
    if (!cropBox) {
        cropBox = $('crop-box');
        if (!cropBox) return;
    }
    const canvas = $('crop-canvas');
    if (!canvas) return;
    const container = canvas.parentElement;
    if (!container) return;

    const cr = canvas.getBoundingClientRect();
    const pr = container.getBoundingClientRect();
    const sx = cr.width / canvas.width;
    const sy = cr.height / canvas.height;

    cropBox.style.width = (cropBoxSize * sx) + 'px';
    cropBox.style.height = (cropBoxSize * sy) + 'px';
    cropBox.style.left = (cr.left - pr.left + (cropBoxX * sx)) + 'px';
    cropBox.style.top = (cr.top - pr.top + (cropBoxY * sy)) + 'px';
}

/**
 * Perform the crop operation and store the result as a data URL.
 */
function cropImage() {
    if (!currentCropImage || !currentCropTarget) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const src = $('crop-canvas');
    if (!src || !ctx) return;

    const sx = currentCropImage.width / src.width;
    const sy = currentCropImage.height / src.height;
    const cropSize = cropBoxSize * Math.min(sx, sy);

    // Output as 600×600 JPEG at 70% quality
    canvas.width = 600;
    canvas.height = 600;
    ctx.drawImage(currentCropImage, cropBoxX * sx, cropBoxY * sy, cropSize, cropSize, 0, 0, 600, 600);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    const num = currentCropTarget;

    photoData[num] = dataUrl;
    const img = $('preview-' + num);
    if (img) { img.src = dataUrl; img.hidden = false; }
    const rmBtn = document.querySelector('.remove-photo-btn[data-target="' + num + '"]');
    if (rmBtn) rmBtn.hidden = false;
    const uploadBox = $('photo-upload-' + num);
    if (uploadBox) uploadBox.classList.add('has-image');

    closeCropModal();
}

function closeCropModal() {
    $('crop-modal')?.classList.remove('active');
    currentCropImage = null;
    currentCropTarget = null;
}

$('crop-confirm-btn')?.addEventListener('click', cropImage);
$('crop-cancel-btn')?.addEventListener('click', closeCropModal);

// ─── Crop Drag Interaction ──────────────────────────────────────────
let isDragging = false;
let dragHandle = null;

function setupCropDrag() {
    const el = $('crop-box');
    if (!el) return;
    el.addEventListener('mousedown', handleCropStart);
    el.addEventListener('touchstart', handleCropTouchStart, { passive: false });
}

function getCanvasCoords(clientX, clientY) {
    const canvas = $('crop-canvas');
    if (!canvas) return { x: clientX, y: clientY };
    const r = canvas.getBoundingClientRect();
    return {
        x: (clientX - r.left) * (canvas.width / r.width),
        y: (clientY - r.top) * (canvas.height / r.height)
    };
}

function handleCropStart(e) {
    isDragging = true;
    const c = getCanvasCoords(e.clientX, e.clientY);

    if (e.target.classList.contains('crop-handle')) {
        dragHandle = e.target.classList[1];
        cropStartX = c.x;
        cropStartY = c.y;
        initialCropBoxX = cropBoxX;
        initialCropBoxY = cropBoxY;
        initialCropBoxSize = cropBoxSize;
    } else {
        dragHandle = 'move';
        cropStartX = c.x - cropBoxX;
        cropStartY = c.y - cropBoxY;
    }
    e.preventDefault();
    document.addEventListener('mousemove', handleCropMove);
    document.addEventListener('mouseup', handleCropEnd);
}

function handleCropTouchStart(e) {
    isDragging = true;
    const touch = e.touches[0];
    const c = getCanvasCoords(touch.clientX, touch.clientY);

    if (e.target.classList.contains('crop-handle')) {
        dragHandle = e.target.classList[1];
        cropStartX = c.x;
        cropStartY = c.y;
        initialCropBoxX = cropBoxX;
        initialCropBoxY = cropBoxY;
        initialCropBoxSize = cropBoxSize;
    } else {
        dragHandle = 'move';
        cropStartX = c.x - cropBoxX;
        cropStartY = c.y - cropBoxY;
    }
    e.preventDefault();
    document.addEventListener('touchmove', handleCropTouchMove, { passive: false });
    document.addEventListener('touchend', handleCropEnd);
}

function handleCropMove(e) {
    if (isDragging) updateCropPosition(e.clientX, e.clientY);
}

function handleCropTouchMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    if (e.touches.length > 0) updateCropPosition(e.touches[0].clientX, e.touches[0].clientY);
}

function updateCropPosition(clientX, clientY) {
    const canvas = $('crop-canvas');
    if (!canvas) return;
    const c = getCanvasCoords(clientX, clientY);

    if (dragHandle === 'move') {
        cropBoxX = Math.max(0, Math.min(canvas.width - cropBoxSize, c.x - cropStartX));
        cropBoxY = Math.max(0, Math.min(canvas.height - cropBoxSize, c.y - cropStartY));
    } else if (dragHandle) {
        // Resize from corner handle — maintain square aspect ratio
        const cx = initialCropBoxX + initialCropBoxSize / 2;
        const cy = initialCropBoxY + initialCropBoxSize / 2;
        const newSize = Math.max(50, Math.min(
            Math.min(canvas.width, canvas.height),
            Math.max(Math.abs(c.x - cx), Math.abs(c.y - cy)) * 2
        ));
        cropBoxSize = newSize;
        cropBoxX = Math.max(0, Math.min(canvas.width - cropBoxSize, cx - cropBoxSize / 2));
        cropBoxY = Math.max(0, Math.min(canvas.height - cropBoxSize, cy - cropBoxSize / 2));
    }
    updateCropBox();
}

function handleCropEnd() {
    isDragging = false;
    dragHandle = null;
    document.removeEventListener('mousemove', handleCropMove);
    document.removeEventListener('mouseup', handleCropEnd);
    document.removeEventListener('touchmove', handleCropTouchMove);
    document.removeEventListener('touchend', handleCropEnd);
}

// Initialize crop drag on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupCropDrag);
} else {
    setupCropDrag();
}

// ─── Photo Upload Handlers ──────────────────────────────────────────
document.querySelectorAll('.photo-upload-box').forEach(box => {
    box.addEventListener('click', (e) => {
        // Don't trigger file input when clicking the remove button
        if (e.target.tagName !== 'BUTTON' && !e.target.closest('.remove-photo-btn')) {
            const inputId = box.id.replace('photo-upload-', 'file-input-');
            $(inputId)?.click();
        }
    });
});

['file-input-1', 'file-input-2'].forEach(id => {
    const input = $(id);
    if (!input) return;

    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showAlert('Fout', 'Alleen afbeeldingen zijn toegestaan.');
            e.target.value = '';
            return;
        }

        currentCropTarget = id.split('-')[2];
        openCropModal(file);
        if (currentRoom) socket.emit('player-activity', currentRoom);
    });
});

document.querySelectorAll('.remove-photo-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const num = btn.dataset.target;
        photoData[num] = null;
        const prev = $('preview-' + num);
        if (prev) prev.hidden = true;
        const fi = $('file-input-' + num);
        if (fi) fi.value = '';
        btn.hidden = true;
        const ub = $('photo-upload-' + num);
        if (ub) ub.classList.remove('has-image');
    });
});

// ─── Submit Dilemma ─────────────────────────────────────────────────
submitDilemmaBtn?.addEventListener('click', () => {
    if (!debounceClick(submitDilemmaBtn)) return;
    if (!currentRoom) return;

    const payload = { roomCode: currentRoom, type: currentMode, isAutoSubmit: false };

    if (currentMode === 'photo') {
        if (!photoData[1] || !photoData[2]) {
            showAlert('Let op', 'Upload beide fotos!');
            return;
        }
        payload.option1 = photoData[1];
        payload.option2 = photoData[2];
        const q = $('photo-question-input')?.value.trim();
        if (q) payload.question = q;
    } else if (currentMode === 'vote-person') {
        const q = $('vote-person-question-input')?.value.trim();
        if (!q) {
            showAlert('Let op', 'Vul een vraag in!');
            return;
        }
        payload.question = q;
        payload.option1 = 'vote-person';
        payload.option2 = 'vote-person';
    } else if (currentMode === 'would-you-rather') {
        // WYR uses the text inputs pre-filled by the server
        const o1 = option1Input?.value.trim();
        const o2 = option2Input?.value.trim();
        if (!o1 || !o2) {
            showAlert('Let op', 'Shuffle eerst een vraag!');
            return;
        }
        payload.option1 = o1;
        payload.option2 = o2;
        payload.type = 'would-you-rather';
    } else {
        const o1 = option1Input?.value.trim();
        const o2 = option2Input?.value.trim();
        if (!o1 || !o2) {
            showAlert('Let op', 'Vul beide opties in!');
            return;
        }
        payload.option1 = o1;
        payload.option2 = o2;
    }

    // Show loading state when AI filter is active
    if (currentSettings.aiFilterEnabled) {
        submitDilemmaBtn.disabled = true;
        submitDilemmaBtn.textContent = 'Controleren...';
    }
    socket.emit('submit-dilemma', payload);
});

// ─── Voting ─────────────────────────────────────────────────────────
socket.on('waiting-for-vote', () => {
    if (submitDilemmaBtn) {
        submitDilemmaBtn.disabled = false;
        submitDilemmaBtn.textContent = 'Verstuur';
    }
    showView('voterWaiting');
    const h2 = document.querySelector('#voter-waiting-view h2');
    if (h2) h2.textContent = 'Wachten op antwoorden...';
    if (votersProgressContainer) votersProgressContainer.innerHTML = '';
});

socket.on('vote-person-typing-update', ({ question, creatorName }) => {
    const waitView = $('voter-waiting-view');
    if (!waitView?.classList.contains('active')) return;

    const waitH2 = waitView.querySelector('h2');
    if (!waitH2) return;

    const safe = escapeHtml(creatorName || 'De speler');
    if (question?.trim()) {
        waitH2.innerHTML = '<span>' + safe + '</span> typt...<br><small class="vote-person-info">"' + escapeHtml(question) + '"</small>';
    } else {
        waitH2.innerHTML = '<span>' + safe + '</span> maakt iets...';
    }
});

socket.on('update-vote-status', (statusList) => {
    if (!votersProgressContainer) return;
    votersProgressContainer.innerHTML = '';

    if (!Array.isArray(statusList)) return;
    statusList.forEach(s => {
        const chip = document.createElement('span');
        chip.className = 'voter-chip' + (s.voted ? ' voted' : '');
        chip.textContent = (s.avatar || '😎') + ' ' + s.name;
        votersProgressContainer.appendChild(chip);
    });
});

socket.on('dilemma-received', ({ option1, option2, type, creatorName, question, isSpectator: spec }) => {
    if (spec) isSpectator = true;
    currentDilemma = { option1, option2, type, question };

    const textOpts = $('text-vote-options');
    const photoOpts = $('photo-vote-options');
    const title = document.querySelector('#vote-view h2');

    // Reset visibility
    if (textOpts) textOpts.style.display = 'none';
    if (photoOpts) { photoOpts.style.display = 'none'; photoOpts.removeAttribute('hidden'); }

    if (type === 'vote-person') {
        showView('votePerson');
        setupVotePersonList(question || 'Kies een persoon', creatorName);
        return;
    }

    if (type === 'would-you-rather') {
        if (textOpts) textOpts.style.display = 'flex';
        if (voteBtn1) voteBtn1.textContent = option1;
        if (voteBtn2) voteBtn2.textContent = option2;
        if (title) title.textContent = 'Zou je liever...';

        // Add WYR styling
        if (voteBtn1) voteBtn1.classList.add('wyr-option');
        if (voteBtn2) voteBtn2.classList.add('wyr-option');
    } else if (type === 'photo') {
        if (photoOpts) photoOpts.style.display = 'flex';
        const vi1 = $('vote-img-1');
        const vi2 = $('vote-img-2');
        if (vi1) vi1.src = option1;
        if (vi2) vi2.src = option2;

        const vp1 = $('vote-photo-1');
        const vp2 = $('vote-photo-2');
        if (vp1) vp1.onclick = () => handleVoteChoice(1);
        if (vp2) vp2.onclick = () => handleVoteChoice(2);

        if (title) {
            title.textContent = escapeHtml(creatorName) + ': ' + (question ? escapeHtml(question) : 'Welke foto wint?');
        }
    } else {
        if (textOpts) textOpts.style.display = 'flex';
        if (voteBtn1) voteBtn1.textContent = option1 || 'Optie 1';
        if (voteBtn2) voteBtn2.textContent = option2 || 'Optie 2';
        if (title) {
            title.textContent = type === 'question'
                ? escapeHtml(creatorName) + ' stelt vragen. Kies er een!'
                : escapeHtml(creatorName) + ' stelt een dilemma!';
        }
    }
    showView('vote');
});

/**
 * Build the vote-person selection list.
 * @param {string} question - The question being asked
 * @param {string} creatorName - Name of the question creator
 */
function setupVotePersonList(question, creatorName) {
    const list = $('vote-person-list');
    const qtitle = $('vote-person-question-title');
    if (!list) return;
    if (qtitle) qtitle.textContent = question;

    list.innerHTML = '';
    selectedVotePerson = null;

    // Find creator by name to mark them
    const creator = players.find(p => p.name === creatorName);
    const creatorId = creator ? creator.id : null;

    players.filter(p => p.id !== myId).forEach(player => {
        const item = document.createElement('div');
        item.className = 'vote-person-item';
        item.textContent = player.name;
        item.dataset.playerId = player.id;

        if (player.id === creatorId) {
            const badge = document.createElement('span');
            badge.className = 'creator-badge';
            badge.textContent = ' (Vraagmaker)';
            item.appendChild(badge);
        }

        item.addEventListener('click', () => {
            document.querySelectorAll('.vote-person-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            selectedVotePerson = player.id;
            // Brief delay for visual feedback before submitting
            setTimeout(() => submitVotePerson(), 300);
        });
        list.appendChild(item);
    });
}

function submitVotePerson() {
    if (isSpectator) {
        showToast('👁️ Je bent spectator — je kunt niet stemmen', 'info');
        return;
    }
    if (!selectedVotePerson || !currentRoom) {
        showAlert('Let op', 'Kies eerst een persoon!');
        return;
    }
    socket.emit('vote', {
        roomCode: currentRoom,
        choice: 1,
        answer: null,
        selectedPersonId: selectedVotePerson
    });
    showView('voterWaiting');
    const h2 = document.querySelector('#voter-waiting-view h2');
    if (h2) h2.textContent = 'Wachten op de rest...';
}

voteBtn1?.addEventListener('click', () => handleVoteChoice(1));
voteBtn2?.addEventListener('click', () => handleVoteChoice(2));

/**
 * Handle when a player selects a vote option.
 * For questions, transitions to the answer view. For dilemmas/photos, submits directly.
 * @param {number} choice - 1 or 2
 */
function handleVoteChoice(choice) {
    if (isSpectator) {
        showToast('👁️ Je bent spectator — je kunt niet stemmen', 'info');
        return;
    }
    selectedChoice = choice;

    if (currentDilemma?.type === 'question') {
        // Show answer input for the selected question
        const q = choice === 1 ? currentDilemma.option1 : currentDilemma.option2;
        if (selectedQuestionText) selectedQuestionText.textContent = q;
        showView('answer');
    } else {
        submitVote(choice, null);
        showView('voterWaiting');
        const h2 = document.querySelector('#voter-waiting-view h2');
        if (h2) h2.textContent = 'Wachten op de rest...';
    }
}

backVoteBtn?.addEventListener('click', () => showView('vote'));

submitAnswerBtn?.addEventListener('click', () => {
    if (!debounceClick(submitAnswerBtn)) return;
    const answer = answerInput?.value.trim();
    if (answer) {
        submitVote(selectedChoice, answer);
        showView('voterWaiting');
        const h2 = document.querySelector('#voter-waiting-view h2');
        if (h2) h2.textContent = 'Wachten op de rest...';
    } else {
        showAlert('Let op', 'Vul een antwoord in!');
    }
});

/**
 * Send a vote to the server.
 * @param {number} choice
 * @param {string|null} answer
 */
function submitVote(choice, answer) {
    if (!currentRoom) return;
    socket.emit('vote', { roomCode: currentRoom, choice, answer });
    SFX.playVote();
}

// ─── Results ────────────────────────────────────────────────────────
socket.on('vote-result', ({ winningChoice, votesByOption, dilemma, answers, votePersonResults, delay, scoreboard }) => {
    const r1 = $('result-option1');
    const r2 = $('result-option2');
    const textRes = $('text-results');
    const photoRes = $('photo-results');
    const vpDiv = $('vote-person-results');

    const isPhoto = dilemma.type === 'photo';
    const isVP = dilemma.type === 'vote-person';
    const v1 = votesByOption[1]?.length || 0;
    const v2 = votesByOption[2]?.length || 0;
    const totalVotes = v1 + v2;
    const p1 = totalVotes > 0 ? Math.round((v1 / totalVotes) * 100) : 0;
    const p2 = totalVotes > 0 ? Math.round((v2 / totalVotes) * 100) : 0;
    const isTie = winningChoice === 0 && totalVotes > 0;

    // Reset all result containers
    if (vpDiv) vpDiv.hidden = true;
    if (answerDisplay) answerDisplay.hidden = true;

    if (isVP) {
        renderVotePersonResults(dilemma, votePersonResults, delay);
    } else if (dilemma.type === 'would-you-rather' || dilemma.type === 'tournament') {
        renderWyrResults(dilemma, votesByOption, winningChoice, v1, v2, p1, p2, isTie, totalVotes, delay);
    } else if (isPhoto) {
        renderPhotoResults(dilemma, votesByOption, winningChoice, v1, v2, p1, p2, isTie, delay);
    } else {
        renderTextResults(dilemma, votesByOption, winningChoice, answers, v1, v2, p1, p2, isTie, totalVotes, delay);
    }
    showView('result');
    SFX.playVoteReveal();

    // Render scoreboard if available
    if (scoreboard) {
        scoreboardData = scoreboard;
        renderScoreboard(scoreboard);
    }
});

/**
 * Render vote-person type results.
 */
function renderVotePersonResults(dilemma, votePersonResults, delay) {
    const textRes = $('text-results');
    const photoRes = $('photo-results');
    const vpDiv = $('vote-person-results');
    const vpList = $('vote-person-results-list');
    const vpQ = $('vote-person-results-question');

    if (textRes) textRes.style.display = 'none';
    if (photoRes) photoRes.hidden = true;

    if (!vpDiv || !vpList || !vpQ) return;

    vpDiv.hidden = false;
    vpQ.textContent = dilemma.question || 'Resultaten';
    vpList.innerHTML = '';

    // Build sorted array of results
    const arr = players.map(p => ({
        player: p,
        voters: votePersonResults?.[p.id] || [],
        count: (votePersonResults?.[p.id] || []).length
    }));
    arr.sort((a, b) => b.count - a.count);

    arr.forEach(r => {
        const item = document.createElement('div');
        item.className = 'vote-person-result-item';
        if (r.count > 0) item.style.borderLeft = '3px solid var(--success)';

        const pn = document.createElement('div');
        pn.className = 'player-name';
        pn.textContent = r.player.name;

        const vb = document.createElement('div');
        vb.className = 'voted-by';

        if (r.count > 0) {
            const strong = document.createElement('strong');
            strong.textContent = r.count + ' stem' + (r.count !== 1 ? 'men' : '');
            const small = document.createElement('small');
            small.textContent = r.voters.join(', ');
            small.style.color = 'var(--text-muted)';
            vb.appendChild(strong);
            vb.appendChild(document.createElement('br'));
            vb.appendChild(small);
        } else {
            const small = document.createElement('small');
            small.textContent = 'Geen stemmen';
            small.style.color = 'var(--text-muted)';
            vb.appendChild(small);
        }

        item.appendChild(pn);
        item.appendChild(vb);
        vpList.appendChild(item);
    });

    if (resultMessage) resultMessage.textContent = 'Stemmen geteld!';
    startProgressBar(delay || (6000 + players.length * 2000));
}

/**
 * Render photo mode results.
 */
function renderPhotoResults(dilemma, votesByOption, winningChoice, v1, v2, p1, p2, isTie, delay) {
    const textRes = $('text-results');
    const photoRes = $('photo-results');

    if (textRes) textRes.style.display = 'none';
    if (photoRes) { photoRes.hidden = false; photoRes.style.display = 'flex'; }

    const ri1 = $('res-img-1');
    const ri2 = $('res-img-2');
    if (ri1) ri1.src = dilemma.option1;
    if (ri2) ri2.src = dilemma.option2;

    const pc1 = $('result-photo-1');
    const pc2 = $('result-photo-2');
    if (pc1) {
        pc1.className = 'result-card photo-card';
        pc1.classList.add(isTie ? 'selected' : (winningChoice === 1 ? 'selected' : 'not-selected'));
    }
    if (pc2) {
        pc2.className = 'result-card photo-card';
        pc2.classList.add(isTie ? 'selected' : (winningChoice === 2 ? 'selected' : 'not-selected'));
    }

    const ol1 = document.querySelector('#result-photo-1 .overlay-stats');
    const ol2 = document.querySelector('#result-photo-2 .overlay-stats');
    if (ol1) ol1.innerHTML = formatVoteOverlay(votesByOption[1] || [], v1, p1);
    if (ol2) ol2.innerHTML = formatVoteOverlay(votesByOption[2] || [], v2, p2);

    if (resultMessage) {
        resultMessage.textContent = dilemma.question
            ? dilemma.question
            : (winningChoice === 1 ? 'De meerderheid koos: Foto 1' : 'De meerderheid koos: Foto 2');
    }
    startProgressBar(delay || (6000 + players.length * 2000));
}

/**
 * Format the vote overlay HTML for photo results.
 */
function formatVoteOverlay(voters, count, pct) {
    if (count > 0) {
        return '<strong>' + count + ' stem' + (count !== 1 ? 'men' : '') + ' (' + pct + '%)</strong><br><span>' + escapeHtml(voters.join(', ')) + '</span>';
    }
    return '<strong>0 stemmen (0%)</strong>';
}

/**
 * Render text/dilemma/question results.
 */
function renderTextResults(dilemma, votesByOption, winningChoice, answers, v1, v2, p1, p2, isTie, totalVotes, delay) {
    const textRes = $('text-results');
    const photoRes = $('photo-results');
    const r1 = $('result-option1');
    const r2 = $('result-option2');

    if (textRes) textRes.style.display = 'flex';
    if (photoRes) photoRes.hidden = true;

    if (r1) {
        r1.innerHTML = '<span>' + escapeHtml(dilemma.option1) + '</span>';
        addVoterList(r1, votesByOption[1] || [], p1);
        r1.className = 'result-card';
        void r1.offsetWidth; // Force reflow for animation
        r1.classList.add(isTie ? 'selected' : (winningChoice === 1 ? 'selected' : 'not-selected'));
    }
    if (r2) {
        r2.innerHTML = '<span>' + escapeHtml(dilemma.option2) + '</span>';
        addVoterList(r2, votesByOption[2] || [], p2);
        r2.className = 'result-card';
        void r2.offsetWidth;
        r2.classList.add(isTie ? 'selected' : (winningChoice === 2 ? 'selected' : 'not-selected'));
    }

    let msg;
    if (isTie) {
        msg = 'Gelijkspel!';
    } else {
        msg = winningChoice === 1 ? 'De meerderheid koos: Optie 1' : 'De meerderheid koos: Optie 2';
    }

    if (dilemma.type === 'question' && answers?.length > 0) {
        const mj = winningChoice === 1 ? dilemma.option1 : dilemma.option2;
        const mjv = winningChoice === 1 ? v1 : v2;
        msg = 'De meerderheid (' + mjv + '/' + totalVotes + ') koos: "' + mj + '"';
        if (answerDisplay) answerDisplay.hidden = false;
        playAnswerSlideshow(answers, dilemma, delay, votesByOption);
    } else {
        startProgressBar(delay || (6000 + players.length * 2000));
    }
    if (resultMessage) resultMessage.textContent = msg;
}

/**
 * Render Would You Rather / Tournament results with prominent percentages.
 */
function renderWyrResults(dilemma, votesByOption, winningChoice, v1, v2, p1, p2, isTie, totalVotes, delay) {
    const textRes = $('text-results');
    const photoRes = $('photo-results');
    const r1 = $('result-option1');
    const r2 = $('result-option2');

    if (textRes) textRes.style.display = 'flex';
    if (photoRes) photoRes.hidden = true;

    if (r1) {
        r1.innerHTML =
            '<span>' + escapeHtml(dilemma.option1) + '</span>' +
            '<span class="wyr-pct-label">' + p1 + '%</span>' +
            '<div class="wyr-pct-bar"><div class="wyr-pct-fill opt1" style="width: 0%"></div></div>';
        addVoterList(r1, votesByOption[1] || [], p1);
        r1.className = 'result-card';
        void r1.offsetWidth;
        r1.classList.add(isTie ? 'selected' : (winningChoice === 1 ? 'selected' : 'not-selected'));

        // Animate percentage bar
        setTimeout(() => {
            const fill = r1.querySelector('.wyr-pct-fill');
            if (fill) fill.style.width = p1 + '%';
        }, 100);
    }
    if (r2) {
        r2.innerHTML =
            '<span>' + escapeHtml(dilemma.option2) + '</span>' +
            '<span class="wyr-pct-label">' + p2 + '%</span>' +
            '<div class="wyr-pct-bar"><div class="wyr-pct-fill opt2" style="width: 0%"></div></div>';
        addVoterList(r2, votesByOption[2] || [], p2);
        r2.className = 'result-card';
        void r2.offsetWidth;
        r2.classList.add(isTie ? 'selected' : (winningChoice === 2 ? 'selected' : 'not-selected'));

        setTimeout(() => {
            const fill = r2.querySelector('.wyr-pct-fill');
            if (fill) fill.style.width = p2 + '%';
        }, 100);
    }

    const typeLabel = dilemma.type === 'tournament' ? '🏆 Tournament' : 'Zou je liever...';
    let msg;
    if (isTie) {
        msg = typeLabel + ' — Gelijkspel! ' + p1 + '% vs ' + p2 + '%';
    } else {
        const winner = winningChoice === 1 ? dilemma.option1 : dilemma.option2;
        const winPct = winningChoice === 1 ? p1 : p2;
        msg = typeLabel + ' — ' + winPct + '% koos: "' + winner + '"';
    }
    if (resultMessage) resultMessage.textContent = msg;
    startProgressBar(delay || (6000 + players.length * 2000));

    // Play success sound for winner reveal
    setTimeout(() => SFX.playSuccess(), 300);
}

/**
 * Add voter names list to a result card.
 */
function addVoterList(el, votes, pct) {
    const div = document.createElement('div');
    div.className = 'voter-names';
    if (votes.length > 0) {
        div.innerHTML = '<strong>' + votes.length + ' stem' + (votes.length !== 1 ? 'men' : '') + ' (' + pct + '%)</strong><br><span>' + escapeHtml(votes.join(', ')) + '</span>';
    } else {
        div.style.color = 'var(--text-muted)';
        div.innerHTML = '<strong>0 stemmen (0%)</strong>';
    }
    el.appendChild(div);
}

/**
 * Play a slideshow of answer responses for question mode.
 */
function playAnswerSlideshow(answers, dilemma, totalDelay, votesByOption) {
    if (slideshowInterval) { clearInterval(slideshowInterval); slideshowInterval = null; }
    if (!answers?.length || !answerDisplay) return;

    // Sort: majority choice answers first
    const wc = votesByOption?.[1] && votesByOption?.[2]
        ? (votesByOption[1].length >= votesByOption[2].length ? 1 : 2) : 1;
    const sorted = [...answers.filter(a => a.choice === wc), ...answers.filter(a => a.choice !== wc)];
    const dur = totalDelay ? Math.floor(totalDelay / sorted.length) : 10000;
    let idx = 0;

    const show = () => {
        if (idx >= sorted.length) {
            if (slideshowInterval) { clearInterval(slideshowInterval); slideshowInterval = null; }
            return;
        }
        const a = sorted[idx];
        const qt = a.choice === 2 ? dilemma.option2 : dilemma.option1;

        answerDisplay.innerHTML =
            '<div class="slide-item">' +
                '<span class="slide-name">' + escapeHtml(a.name) + '</span>' +
                '<div class="slide-choice-label">Koos: <strong>"' + escapeHtml(qt) + '"</strong></div>' +
                '<div class="slide-answer-label">Omdat:</div>' +
                '<div class="slide-answer">"' + escapeHtml(a.text) + '"</div>' +
            '</div>';
        startProgressBar(dur);
        idx++;
    };

    show();
    slideshowInterval = setInterval(show, dur);
}

// ─── Result Timer / Progress Bar ────────────────────────────────────
let timerInterval = null;
let timerRemainingSeconds = 0;

/**
 * Start the visual countdown progress bar.
 * @param {number} duration - Duration in milliseconds
 */
function startProgressBar(duration) {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    if (resultTimerContainer) resultTimerContainer.style.display = 'block';

    timerRemainingSeconds = Math.ceil(duration / 1000);
    if (timerSeconds) timerSeconds.textContent = timerRemainingSeconds;

    if (timerProgress) {
        timerProgress.style.transition = 'none';
        timerProgress.style.width = '100%';
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (timerProgress) {
                    timerProgress.style.transition = 'width ' + duration + 'ms linear';
                    timerProgress.style.width = '0%';
                }
            });
        });
    }

    timerInterval = setInterval(() => {
        timerRemainingSeconds--;
        if (timerSeconds) timerSeconds.textContent = Math.max(0, timerRemainingSeconds);
        if (timerRemainingSeconds <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            if (timerSeconds) timerSeconds.textContent = '0';
            if (timerProgress) timerProgress.style.width = '0%';
            setTimeout(() => {
                if (resultTimerContainer) resultTimerContainer.style.display = 'none';
            }, 500);
        }
    }, 1000);
}

/**
 * Reset the timer / progress bar state.
 */
function resetTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    timerRemainingSeconds = 0;
    if (timerProgress) { timerProgress.style.width = '0%'; timerProgress.style.transition = 'none'; }
    if (resultTimerContainer) resultTimerContainer.style.display = 'none';
}

// ─── WYR Question Received ──────────────────────────────────────────
socket.on('wyr-question', ({ option1, option2, category }) => {
    const wyrO1 = $('wyr-option1-display');
    const wyrO2 = $('wyr-option2-display');
    const wyrCat = $('wyr-category-display');

    if (wyrO1) wyrO1.textContent = option1;
    if (wyrO2) wyrO2.textContent = option2;
    if (wyrCat) {
        const catNames = { grappig: '😂 Grappig', serieus: '🤔 Serieus', dark: '🌑 Dark', random: '🎲 Random', 'would-you-rather': '💭 Klassiek' };
        wyrCat.textContent = catNames[category] || category;
    }

    // Auto-fill the text inputs so submit works
    if (option1Input) option1Input.value = option1;
    if (option2Input) option2Input.value = option2;
});

$('wyr-shuffle-btn')?.addEventListener('click', () => {
    if (!currentRoom) return;
    const selectedCat = currentSettings.selectedCategories?.length > 0
        ? currentSettings.selectedCategories[Math.floor(Math.random() * currentSettings.selectedCategories.length)]
        : null;
    socket.emit('request-wyr', { roomCode: currentRoom, category: selectedCat });
    SFX.playVote();
});

// ─── Vote Timer Events ──────────────────────────────────────────────
socket.on('vote-timer-update', ({ remainingSeconds, totalSeconds }) => {
    // Update all vote timer containers (vote view + vote-person view)
    ['', '-vp'].forEach(suffix => {
        const container = $('vote-timer-container' + suffix);
        const bar = $('vote-timer-bar' + suffix);
        const text = $('vote-timer-text' + suffix);

        if (container) container.hidden = false;
        if (text) text.textContent = remainingSeconds + 's';
        if (bar) {
            const pct = (remainingSeconds / totalSeconds) * 100;
            bar.style.width = pct + '%';
            bar.className = 'vote-timer-progress' + (remainingSeconds <= 5 ? ' urgent' : '');
        }
    });

    // Sound effects for ticking
    if (remainingSeconds <= 5 && remainingSeconds > 0) {
        SFX.playTickUrgent();
    } else if (remainingSeconds <= 10 && remainingSeconds > 0 && remainingSeconds % 2 === 0) {
        SFX.playTick();
    }
});

socket.on('vote-timer-stopped', () => {
    ['', '-vp'].forEach(suffix => {
        const container = $('vote-timer-container' + suffix);
        if (container) container.hidden = true;
    });
});

socket.on('vote-timer-expired', ({ message }) => {
    ['', '-vp'].forEach(suffix => {
        const container = $('vote-timer-container' + suffix);
        if (container) container.hidden = true;
    });
    SFX.playBuzzer();
});

// ─── Tournament Events ──────────────────────────────────────────────
socket.on('tournament-started', ({ bracket, phase, totalMatches }) => {
    tournamentData = { bracket, phase, totalMatches };
    showView('tournamentView');

    const bracketDisplay = $('tournament-bracket-display');
    if (bracketDisplay) {
        bracketDisplay.innerHTML = '';
        bracket.forEach((q, i) => {
            const item = document.createElement('div');
            item.className = 'tournament-bracket-item';
            item.innerHTML = '<span class="bracket-num">#' + (i + 1) + '</span> ' + escapeHtml(q.option1) + ' <span class="vs-tiny">vs</span> ' + escapeHtml(q.option2);
            bracketDisplay.appendChild(item);
            Anim.fadeIn(item, i * 100);
        });
    }
});

socket.on('tournament-match', ({ dilemma1, dilemma2, phase, matchIndex }) => {
    currentDilemma = {
        option1: dilemma1.option1 + ' vs ' + dilemma1.option2,
        option2: dilemma2.option1 + ' vs ' + dilemma2.option2,
        type: 'tournament'
    };

    const phaseNames = { quarter: 'Kwartfinale', semi: 'Halve Finale', final: 'FINALE' };
    const title = document.querySelector('#vote-view h2');
    if (title) title.textContent = (phaseNames[phase] || phase) + ' - Match ' + (matchIndex + 1);

    const textOpts = $('text-vote-options');
    const photoOpts = $('photo-vote-options');
    if (textOpts) textOpts.style.display = 'flex';
    if (photoOpts) photoOpts.style.display = 'none';

    if (voteBtn1) voteBtn1.innerHTML = '<div class="tournament-option">' + escapeHtml(dilemma1.option1) + ' <span class="vs-tiny">vs</span> ' + escapeHtml(dilemma1.option2) + '</div>';
    if (voteBtn2) voteBtn2.innerHTML = '<div class="tournament-option">' + escapeHtml(dilemma2.option1) + ' <span class="vs-tiny">vs</span> ' + escapeHtml(dilemma2.option2) + '</div>';

    showView('vote');
    SFX.playReveal();
});

// ─── Scoreboard Events ──────────────────────────────────────────────
socket.on('scoreboard-data', (data) => {
    scoreboardData = data;
    renderScoreboard(data);
});

function renderScoreboard(data) {
    const container = $('scoreboard-container');
    const list = $('scoreboard-list');
    if (!container || !list) return;

    container.hidden = false;
    list.innerHTML = '';

    if (!data || data.length === 0) {
        list.innerHTML = '<div class="scoreboard-empty">Nog geen scores</div>';
        return;
    }

    data.forEach((entry, i) => {
        const item = document.createElement('div');
        item.className = 'scoreboard-item' + (i === 0 ? ' first' : '');
        const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : (i + 1) + '.'));

        item.innerHTML =
            '<span class="scoreboard-rank">' + medal + '</span>' +
            '<span class="scoreboard-name">' + escapeHtml(entry.name) + '</span>' +
            '<span class="scoreboard-points">' +
                '<span class="score-total">' + entry.total + '</span>' +
                '<span class="score-detail">⚡' + entry.speed + ' ✨' + entry.unique + '</span>' +
            '</span>';

        list.appendChild(item);
        Anim.fadeIn(item, i * 80);
    });
}

$('scoreboard-toggle-btn')?.addEventListener('click', () => {
    const panel = $('scoreboard-panel');
    if (panel) {
        panel.hidden = !panel.hidden;
        if (!panel.hidden && currentRoom) {
            socket.emit('request-scoreboard', currentRoom);
        }
    }
});

// ─── New Round ──────────────────────────────────────────────────────
socket.on('new-round', ({ turnId, round, settings, isRareRound, rareRoundQuestion }) => {
    // Clean up any running slideshow from previous round
    if (slideshowInterval) { clearInterval(slideshowInterval); slideshowInterval = null; }

    updateRound(round);
    if (settings) currentSettings = settings;
    currentSettings.isRareRound = isRareRound || false;
    currentSettings.rareRoundQuestion = rareRoundQuestion || null;
    handleTurn(turnId);
});

// ─── Leave / End Game ───────────────────────────────────────────────
leaveBtn?.addEventListener('click', () => confirmModal?.classList.add('active'));
leaveGameBtn?.addEventListener('click', () => confirmModal?.classList.add('active'));
$('cancel-leave')?.addEventListener('click', () => confirmModal?.classList.remove('active'));
$('confirm-leave')?.addEventListener('click', () => {
    confirmModal?.classList.remove('active');
    if (currentRoom) socket.emit('leave-room', currentRoom);
    resetGame();
});

socket.on('player-left', ({ name, remaining }) => {
    showAlert('Speler Vertrokken', name + ' heeft het spel verlaten.');
    updatePlayerList(remaining);
});

socket.on('game-ended', (reason) => {
    // Request game history before showing end screen
    if (currentRoom) {
        socket.emit('request-game-history', currentRoom);
    }
    showAlert('Spel Afgelopen', typeof reason === 'string' ? reason : 'Het spel is afgelopen.', () => resetGame());
});

/**
 * Reset all game state and return to the landing screen.
 */
function resetGame() {
    if (slideshowInterval) { clearInterval(slideshowInterval); slideshowInterval = null; }
    if (createTimerInterval) { clearInterval(createTimerInterval); createTimerInterval = null; }
    if (pageVisibilityTimeout) { clearTimeout(pageVisibilityTimeout); pageVisibilityTimeout = null; }
    stopInputMonitoring();

    currentRoom = null;
    currentDilemma = null;
    currentMode = 'dilemma';
    players = [];
    createTimerSeconds = null;
    selectedChoice = null;
    selectedVotePerson = null;
    photoData = { 1: null, 2: null };
    tournamentData = null;
    scoreboardData = null;
    isSpectator = false;
    gameHistory = [];
    if (voteTimerInterval) { clearInterval(voteTimerInterval); voteTimerInterval = null; }

    // Hide scoreboard
    const sbPanel = $('scoreboard-panel');
    if (sbPanel) sbPanel.hidden = true;

    // Hide history panel
    const histPanel = $('history-panel');
    if (histPanel) histPanel.hidden = true;

    showScreen('landing');
    if (roomCodeInput) roomCodeInput.value = '';
    if (joinBtn) { joinBtn.disabled = false; joinBtn.textContent = 'JOIN'; }
    if (createConfirmBtn) { createConfirmBtn.disabled = false; createConfirmBtn.textContent = 'Start Lobby'; }
    if (submitDilemmaBtn) { submitDilemmaBtn.disabled = false; submitDilemmaBtn.textContent = 'Verstuur'; }
}

// ─── Toast Notifications ────────────────────────────────────────────
function showToast(message, type = 'info') {
    const container = $('toast-container') || createToastContainer();
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
    return container;
}

// ─── Spectator Count Display ────────────────────────────────────────
function updateSpectatorCount(count) {
    let badge = $('spectator-count-badge');
    if (count > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.id = 'spectator-count-badge';
            badge.className = 'spectator-badge';
            const gameHeader = document.querySelector('.game-header');
            if (gameHeader) gameHeader.insertBefore(badge, gameHeader.lastElementChild);
        }
        badge.textContent = '👁️ ' + count;
        badge.title = count + ' spectator' + (count !== 1 ? 's' : '');
    } else if (badge) {
        badge.remove();
    }
}

// ─── Game History Rendering ─────────────────────────────────────────
function renderGameHistory(history) {
    const panel = $('history-panel');
    const list = $('history-list');
    if (!panel || !list) return;

    panel.hidden = false;
    list.innerHTML = '';

    if (!history || history.length === 0) {
        list.innerHTML = '<div class="history-empty">Geen rondes gespeeld</div>';
        return;
    }

    // Find most controversial question
    let maxControversy = -1;
    let controversialIdx = -1;
    history.forEach((entry, i) => {
        if (entry.controversyScore > maxControversy) {
            maxControversy = entry.controversyScore;
            controversialIdx = i;
        }
    });

    history.forEach((entry, i) => {
        const item = document.createElement('div');
        item.className = 'history-item' + (i === controversialIdx ? ' controversial' : '');

        const d = entry.dilemma;
        const v1 = entry.votesByOption?.[1]?.length || 0;
        const v2 = entry.votesByOption?.[2]?.length || 0;
        const total = v1 + v2;

        let questionText = '';
        if (d.type === 'vote-person') {
            questionText = d.question || 'Vote de Persoon';
        } else if (d.type === 'photo') {
            questionText = d.question || 'Foto Vraag';
        } else {
            questionText = escapeHtml(d.option1) + ' vs ' + escapeHtml(d.option2);
        }

        item.innerHTML =
            '<div class="history-round">Ronde ' + entry.round + (i === controversialIdx ? ' 🔥 Meest Controversieel!' : '') + '</div>' +
            '<div class="history-question">' + questionText + '</div>' +
            (total > 0 ? '<div class="history-votes">' +
                '<span class="hv-opt1">' + v1 + ' stem' + (v1 !== 1 ? 'men' : '') + '</span>' +
                ' vs ' +
                '<span class="hv-opt2">' + v2 + ' stem' + (v2 !== 1 ? 'men' : '') + '</span>' +
                ' (' + Math.round(entry.controversyScore * 100) + '% controversieel)' +
            '</div>' : '') +
            (entry.votesByOption?.[1]?.length ? '<div class="history-voters">Optie 1: ' + entry.votesByOption[1].join(', ') + '</div>' : '') +
            (entry.votesByOption?.[2]?.length ? '<div class="history-voters">Optie 2: ' + entry.votesByOption[2].join(', ') + '</div>' : '');

        list.appendChild(item);
    });
}

$('history-toggle-btn')?.addEventListener('click', () => {
    const panel = $('history-panel');
    if (panel) {
        panel.hidden = !panel.hidden;
        if (!panel.hidden && currentRoom) {
            socket.emit('request-game-history', currentRoom);
        }
    }
});

// ─── Share Game Results ─────────────────────────────────────────────
$('share-history-btn')?.addEventListener('click', () => {
    if (!gameHistory || gameHistory.length === 0) {
        showToast('Geen resultaten om te delen', 'warning');
        return;
    }

    let text = '🎮 DILEMMA - Spelresultaten\n\n';

    // Find most controversial
    let maxC = -1, cIdx = -1;
    gameHistory.forEach((e, i) => {
        if (e.controversyScore > maxC) { maxC = e.controversyScore; cIdx = i; }
    });

    gameHistory.forEach((entry, i) => {
        const d = entry.dilemma;
        const v1 = entry.votesByOption?.[1]?.length || 0;
        const v2 = entry.votesByOption?.[2]?.length || 0;
        text += 'Ronde ' + entry.round + ': ';
        if (d.type !== 'vote-person' && d.type !== 'photo') {
            text += d.option1 + ' vs ' + d.option2;
        } else {
            text += d.question || d.type;
        }
        text += ' (' + v1 + '-' + v2 + ')';
        if (i === cIdx) text += ' 🔥';
        text += '\n';
    });

    if (navigator.share) {
        navigator.share({ title: 'Dilemma Resultaten', text }).catch(() => {});
    } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('📋 Gekopieerd naar klembord!', 'success');
        }).catch(() => {
            showToast('Kon niet kopiëren', 'warning');
        });
    }
});

// ─── Custom Questions UI ────────────────────────────────────────────
$('custom-questions-btn')?.addEventListener('click', () => {
    const modal = $('custom-questions-modal');
    if (modal) {
        modal.classList.add('active');
        renderCustomQuestionsList();
    }
});

$('close-custom-questions')?.addEventListener('click', () => {
    $('custom-questions-modal')?.classList.remove('active');
});

$('add-custom-question')?.addEventListener('click', () => {
    const o1 = $('custom-q-option1')?.value.trim();
    const o2 = $('custom-q-option2')?.value.trim();
    if (!o1 || !o2) {
        showToast('Vul beide opties in!', 'warning');
        return;
    }
    CustomQuestions.add(o1, o2);
    if ($('custom-q-option1')) $('custom-q-option1').value = '';
    if ($('custom-q-option2')) $('custom-q-option2').value = '';
    renderCustomQuestionsList();
    showToast('Vraag toegevoegd!', 'success');
});

$('export-questions')?.addEventListener('click', () => {
    const json = CustomQuestions.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dilemma-vragen.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Vragen geëxporteerd!', 'success');
});

$('import-questions')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const count = CustomQuestions.importJSON(ev.target.result);
            if (count !== false) {
                renderCustomQuestionsList();
                showToast(count + ' vragen geïmporteerd!', 'success');
            } else {
                showToast('Ongeldig bestand!', 'warning');
            }
        };
        reader.readAsText(file);
    };
    input.click();
});

function renderCustomQuestionsList() {
    const list = $('custom-questions-list');
    if (!list) return;
    const questions = CustomQuestions.load();
    list.innerHTML = '';

    if (questions.length === 0) {
        list.innerHTML = '<div class="cq-empty">Nog geen custom vragen</div>';
        return;
    }

    questions.forEach((q, i) => {
        const item = document.createElement('div');
        item.className = 'cq-item';
        item.innerHTML =
            '<div class="cq-text">' + escapeHtml(q.option1) + ' <span class="vs-tiny">vs</span> ' + escapeHtml(q.option2) + '</div>' +
            '<button class="cq-remove" data-idx="' + i + '">✕</button>';
        item.querySelector('.cq-remove').addEventListener('click', () => {
            CustomQuestions.remove(i);
            renderCustomQuestionsList();
        });
        list.appendChild(item);
    });
}

// ─── Emoji Bar Toggle ───────────────────────────────────────────────
$('emoji-toggle-btn')?.addEventListener('click', () => {
    const bar = $('emoji-bar');
    if (bar) bar.hidden = !bar.hidden;
});

// Setup emoji bar clicks
document.querySelectorAll('.emoji-btn')?.forEach(btn => {
    btn.addEventListener('click', () => {
        EmojiReactions.send(btn.dataset.emoji);
        Anim.pop(btn);
    });
});

// ─── Avatar Picker ──────────────────────────────────────────────────
const AVATAR_EMOJIS = [
    '😎', '🤠', '👻', '🦊', '🐱', '🐶', '🦁', '🐸', '🐨', '🐼',
    '🦄', '🐲', '🦋', '🌸', '⭐', '🔥', '💎', '🎭', '🎪', '🍄',
    '🌈', '🎮', '🎯', '🎸', '🚀', '🌙', '🍀', '🎃', '🤖', '👽',
    '🧙', '🦸', '🧛', '🧜', '🧚', '🎪', '🏆', '💀', '🎩', '🤡'
];

(function initAvatarPicker() {
    const btn = $('avatar-picker-btn');
    const modal = $('avatar-modal');
    const grid = $('avatar-grid');
    const closeBtn = $('close-avatar-modal');
    if (!btn || !modal || !grid) return;

    // Load saved avatar from localStorage
    const savedAvatar = localStorage.getItem('dilemma_avatar');
    if (savedAvatar) btn.textContent = savedAvatar;

    btn.addEventListener('click', () => {
        grid.innerHTML = '';
        AVATAR_EMOJIS.forEach(emoji => {
            const cell = document.createElement('button');
            cell.className = 'avatar-grid-item';
            if (btn.textContent.trim() === emoji) cell.classList.add('selected');
            cell.textContent = emoji;
            cell.addEventListener('click', () => {
                btn.textContent = emoji;
                localStorage.setItem('dilemma_avatar', emoji);
                modal.classList.remove('active');
                // Update avatar on server if in a room
                if (currentRoom) {
                    socket.emit('update-avatar', { roomCode: currentRoom, avatar: emoji });
                }
            });
            grid.appendChild(cell);
        });
        modal.classList.add('active');
    });

    closeBtn?.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });
})();

// ─── Player Stats (localStorage + server hybrid) ────────────────────
const PlayerStats = {
    KEY: 'dilemma_player_stats',

    load() {
        try {
            const data = localStorage.getItem(this.KEY);
            return data ? JSON.parse(data) : { wins: 0, losses: 0, gamesPlayed: 0, questionsCreated: 0, votesCast: 0 };
        } catch { return { wins: 0, losses: 0, gamesPlayed: 0, questionsCreated: 0, votesCast: 0 }; }
    },

    save(stats) {
        try { localStorage.setItem(this.KEY, JSON.stringify(stats)); } catch { /* quota */ }
    },

    merge(serverStats) {
        // Use the higher value from server or local (server is source of truth for session)
        const local = this.load();
        const merged = {
            wins: Math.max(local.wins, serverStats.wins || 0),
            losses: Math.max(local.losses, serverStats.losses || 0),
            gamesPlayed: Math.max(local.gamesPlayed, serverStats.gamesPlayed || 0),
            questionsCreated: Math.max(local.questionsCreated, serverStats.questionsCreated || 0),
            votesCast: Math.max(local.votesCast, serverStats.votesCast || 0)
        };
        this.save(merged);
        return merged;
    }
};

(function initStatsModal() {
    const btn = $('stats-btn');
    const modal = $('stats-modal');
    const content = $('stats-content');
    const closeBtn = $('close-stats-modal');
    if (!btn || !modal || !content) return;

    btn.addEventListener('click', () => {
        // Request from server, then merge with local
        socket.emit('request-stats');
        content.innerHTML = '<div class="stats-loading">Laden...</div>';
        modal.classList.add('active');
    });

    closeBtn?.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });
})();

socket.on('player-stats', (serverStats) => {
    const stats = PlayerStats.merge(serverStats);
    const content = $('stats-content');
    if (!content) return;

    const winRate = stats.votesCast > 0 ? Math.round((stats.wins / stats.votesCast) * 100) : 0;

    content.innerHTML =
        '<div class="stats-grid">' +
            '<div class="stat-card"><div class="stat-value">' + stats.gamesPlayed + '</div><div class="stat-label">Gespeeld</div></div>' +
            '<div class="stat-card win"><div class="stat-value">' + stats.wins + '</div><div class="stat-label">Gewonnen</div></div>' +
            '<div class="stat-card lose"><div class="stat-value">' + stats.losses + '</div><div class="stat-label">Verloren</div></div>' +
            '<div class="stat-card"><div class="stat-value">' + winRate + '%</div><div class="stat-label">Win Rate</div></div>' +
            '<div class="stat-card"><div class="stat-value">' + stats.votesCast + '</div><div class="stat-label">Stemmen</div></div>' +
            '<div class="stat-card"><div class="stat-value">' + stats.questionsCreated + '</div><div class="stat-label">Vragen</div></div>' +
        '</div>';
});

// ─── Room Browser ───────────────────────────────────────────────────
(function initRoomBrowser() {
    const btn = $('browse-rooms-btn');
    const modal = $('room-browser-modal');
    const list = $('room-browser-list');
    const refreshBtn = $('refresh-rooms-btn');
    const closeBtn = $('close-room-browser');
    if (!btn || !modal) return;

    function fetchRooms() {
        if (list) list.innerHTML = '<div class="room-browser-loading">Zoeken naar kamers...</div>';
        socket.emit('browse-rooms');
    }

    btn.addEventListener('click', () => {
        modal.classList.add('active');
        fetchRooms();
    });

    refreshBtn?.addEventListener('click', fetchRooms);
    closeBtn?.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });
})();

socket.on('room-list', (roomList) => {
    const list = $('room-browser-list');
    if (!list) return;

    if (!roomList || roomList.length === 0) {
        list.innerHTML = '<div class="room-browser-empty">Geen open kamers gevonden. Maak er zelf een!</div>';
        return;
    }

    list.innerHTML = '';
    roomList.forEach(room => {
        const card = document.createElement('div');
        card.className = 'room-browser-card';

        const modeStr = (room.modes || []).map(m => {
            const map = { dilemma: '🎭', question: '❓', photo: '📷', 'vote-person': '🗳️', 'would-you-rather': '🤔' };
            return map[m] || m;
        }).join(' ');

        const features = [];
        if (room.hasTimer) features.push('⏱️');
        if (room.hasTournament) features.push('🏆');
        if (room.hasScoreboard) features.push('📊');

        card.innerHTML =
            '<div class="room-card-header">' +
                '<span class="room-host">' + escapeHtml(room.hostAvatar || '😎') + ' ' + escapeHtml(room.hostName) + '</span>' +
                '<span class="room-code-badge">' + escapeHtml(room.code) + '</span>' +
            '</div>' +
            '<div class="room-card-info">' +
                '<span class="room-players">👥 ' + room.playerCount + '/' + room.maxPlayers + '</span>' +
                '<span class="room-modes">' + modeStr + '</span>' +
                (features.length ? '<span class="room-features">' + features.join(' ') + '</span>' : '') +
            '</div>';

        card.addEventListener('click', () => {
            const name = usernameInput?.value.trim();
            if (!name) {
                showAlert('Naam nodig', 'Vul eerst je naam in op het hoofdscherm!');
                return;
            }
            $('room-browser-modal')?.classList.remove('active');
            const selectedAvatar = $('avatar-picker-btn')?.textContent.trim() || '😎';
            socket.emit('join-room', { roomCode: room.code, playerName: name, avatar: selectedAvatar });
        });

        list.appendChild(card);
        Anim.fadeIn(card, 0);
    });
});

// ─── In-Game Chat ───────────────────────────────────────────────────
(function initChat() {
    const toggleBtn = $('chat-toggle-btn');
    const panel = $('chat-panel');
    const input = $('chat-input');
    const sendBtn = $('chat-send-btn');
    const messages = $('chat-messages');
    if (!toggleBtn || !panel) return;

    let unreadCount = 0;

    toggleBtn.addEventListener('click', () => {
        panel.hidden = !panel.hidden;
        if (!panel.hidden) {
            unreadCount = 0;
            toggleBtn.textContent = '💬';
            input?.focus();
            // Scroll to bottom
            if (messages) messages.scrollTop = messages.scrollHeight;
        }
    });

    function sendMessage() {
        if (!input || !currentRoom) return;
        const text = input.value.trim();
        if (!text) return;
        socket.emit('chat-message', { roomCode: currentRoom, message: text });
        input.value = '';
    }

    sendBtn?.addEventListener('click', sendMessage);
    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); sendMessage(); }
    });

    // Render a chat message
    function renderChatMessage(msg) {
        if (!messages) return;
        const el = document.createElement('div');

        if (msg.type === 'system') {
            el.className = 'chat-msg system';
            el.textContent = msg.message;
        } else {
            el.className = 'chat-msg player';
            el.innerHTML =
                '<span class="chat-avatar">' + escapeHtml(msg.avatar || '😎') + '</span>' +
                '<div class="chat-bubble">' +
                    '<span class="chat-name">' + escapeHtml(msg.name) + (msg.isSpectator ? ' 👁️' : '') + '</span>' +
                    '<span class="chat-text">' + escapeHtml(msg.message) + '</span>' +
                '</div>';
        }

        messages.appendChild(el);
        messages.scrollTop = messages.scrollHeight;

        // Notify if panel is hidden
        if (panel.hidden) {
            unreadCount++;
            toggleBtn.textContent = '💬 ' + unreadCount;
        }
    }

    // Listen for chat messages
    socket.on('chat-message', (msg) => {
        renderChatMessage(msg);
    });

    // Load chat history on join/reconnect
    socket.on('chat-history', (history) => {
        if (!messages) return;
        messages.innerHTML = '';
        if (Array.isArray(history)) {
            history.forEach(msg => renderChatMessage(msg));
        }
    });
})();

// ─── Share / Copy Room Link ─────────────────────────────────────────
function shareRoom() {
    if (!currentRoom) return;
    const url = window.location.origin + '?room=' + currentRoom;
    const text = '🎮 Join mijn Dilemma spel! Code: ' + currentRoom + '\n' + url;

    if (navigator.share) {
        navigator.share({ title: 'Dilemma Spel', text, url }).catch(() => {});
    } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
            showToast('📋 Link gekopieerd!', 'success');
        }).catch(() => {
            showToast('Kon link niet kopiëren', 'warning');
        });
    } else {
        // Fallback: select from temp input
        const temp = document.createElement('input');
        temp.value = url;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
        showToast('📋 Link gekopieerd!', 'success');
    }
}

$('share-room-btn')?.addEventListener('click', shareRoom);
$('share-game-btn')?.addEventListener('click', shareRoom);

// ─── Auto-Join from URL ─────────────────────────────────────────────
(function checkUrlRoom() {
    const params = new URLSearchParams(window.location.search);
    const roomCode = params.get('room');
    if (roomCode && /^\d{6}$/.test(roomCode)) {
        if (roomCodeInput) roomCodeInput.value = roomCode;
        showToast('🎮 Kamercode ' + roomCode + ' ingevuld!', 'info');
    }
})();
