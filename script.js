const START_LP = 8000;
let lp = { 1: START_LP, 2: START_LP };
let logs = { 1: [], 2: [] };
let timerInterval = null;
let timerSeconds = 0;
let timerRunning = false;
let history = [];
let calcPlayer = null;
let calcInput = '';

const lpSound = new Audio('lifedrop_sound.mp3');

// ── Wake Lock ────────────────────────────────────────────────────────────────
// Strategy (in order of preference):
//   1. Native Screen Wake Lock API  → iOS Safari 16.4+ / Android Chrome
//   2. Hidden looping video element → iOS Safari < 16.4
//      (AudioContext is NOT used: iOS blocks it in silent mode)
//
// The wake lock is activated on the first user touch AND when the timer
// play button is pressed, to guarantee we're inside a user-gesture context.
// A 'pause' listener on the video self-heals if iOS briefly pauses it.
// ─────────────────────────────────────────────────────────────────────────────

// Tiny silent MP4/WebM (MIT licence, from NoSleep.js by Rich Tibbett)
// Used as fallback for iOS Safari versions that don't support the native API.
/* eslint-disable */
const _WAKE_MP4 = 'data:video/mp4;base64,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';
/* eslint-enable */

let _nativeLock = null;
let _wakeLockOn = false;
let _wakeVideo  = null;

async function _requestNativeLock() {
    try {
        _nativeLock = await navigator.wakeLock.request('screen');
        _nativeLock.addEventListener('release', () => {
            _nativeLock = null;
            if (_wakeLockOn && document.visibilityState === 'visible') {
                _requestNativeLock();
            }
        });
    } catch (_) { /* denied or not supported */ }
}

function _startVideoLock() {
    if (_wakeVideo) {
        if (_wakeVideo.paused) _wakeVideo.play().catch(() => {});
        return;
    }
    const v = document.createElement('video');
    v.setAttribute('playsinline', '');
    v.muted  = true;
    v.loop   = true;
    v.src    = _WAKE_MP4;
    v.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;';
    // Self-healing: immediately resume if iOS pauses the video
    v.addEventListener('pause', () => { if (_wakeLockOn) v.play().catch(() => {}); });
    document.body.appendChild(v);
    _wakeVideo = v;
    v.play().catch(() => {});
}

async function enableWakeLock() {
    if (_wakeLockOn) return;
    _wakeLockOn = true;
    if ('wakeLock' in navigator) {
        await _requestNativeLock();
        if (_nativeLock) return; // native API succeeded
    }
    // Fallback: video element (iOS Safari < 16.4, or if native API fails)
    _startVideoLock();
}

// Activate on first touch/click
document.addEventListener('touchstart', enableWakeLock, { once: true, passive: true });
document.addEventListener('click',      enableWakeLock, { once: true });

// When returning from background: re-request native lock (released on hide),
// or resume video if it was paused.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !_wakeLockOn) return;
    if ('wakeLock' in navigator && !_nativeLock) {
        _requestNativeLock();
    } else if (_wakeVideo && _wakeVideo.paused) {
        _wakeVideo.play().catch(() => {});
    }
});

function playSound() {
    lpSound.currentTime = 0;
    lpSound.play();
}

function updateDisplay(player) {
    document.getElementById('lp' + player).textContent = lp[player];
}

function animateLP(player, from, to, type) {
    const el = document.getElementById('lp' + player);
    const duration = 2000;
    const startTime = performance.now();
    const diff = to - from;

    el.classList.add(type);
    playSound(type);

    function tick(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // ease-out cubic
        const ease = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(from + diff * ease);
        el.textContent = Math.max(0, current);
        if (progress < 1) {
            requestAnimationFrame(tick);
        } else {
            el.textContent = to;
            setTimeout(() => el.classList.remove(type), 300);
        }
    }
    requestAnimationFrame(tick);
}

function flashLP(player, type) {
    const el = document.getElementById('lp' + player);
    el.classList.add(type);
    setTimeout(() => el.classList.remove(type), 400);
}

function addLog(player, amount) {
    const sign = amount > 0 ? '+' : '';
    logs[player].unshift(sign + amount);
    if (logs[player].length > 3) logs[player].pop();
    document.getElementById('log' + player).textContent = logs[player].join('   ');
}

function changeLP(player, amount) {
    history.push({ player: player, amount: amount, lpBefore: lp[player] });
    lp[player] = Math.max(0, lp[player] + amount);
    updateDisplay(player);
    flashLP(player, amount > 0 ? 'heal' : 'damage');
    addLog(player, amount);
}

function undo() {
    if (history.length === 0) return;
    const last = history.pop();
    lp[last.player] = last.lpBefore;
    updateDisplay(last.player);
    logs[last.player].shift();
    document.getElementById('log' + last.player).textContent = logs[last.player].join('   ');
    flashLP(last.player, 'heal');
    if (calcPlayer === last.player) {
        syncCalcLP();
    }
}

function getCalcValue() {
    if (!calcInput) return 0;
    const num = parseInt(calcInput, 10);
    if (calcInput.length <= 2) return num * 100;
    return num;
}

function updateCalcDisplay() {
    const d = document.getElementById('calcDisplay');
    const typed = d.querySelector('.calc-typed');
    const ghost = d.querySelector('.calc-ghost');

    if (!calcInput) {
        typed.textContent = '';
        ghost.textContent = '000';
    } else if (calcInput.length <= 2) {
        typed.textContent = calcInput;
        ghost.textContent = '00';
    } else {
        typed.textContent = calcInput;
        ghost.textContent = '';
    }
}

function syncCalcLP() {
    document.getElementById('calcCurrentLP').textContent = 'LP: ' + lp[calcPlayer];
}

function openCalc(player) {
    calcPlayer = player;
    calcInput = '';
    document.getElementById('calcHeader').textContent = 'Giocatore ' + player;
    syncCalcLP();
    updateCalcDisplay();

    const overlay = document.getElementById('calcOverlay');
    overlay.classList.remove('p1', 'p2');
    overlay.classList.add('p' + player);
    overlay.classList.add('active');
}

function closeCalc() {
    document.getElementById('calcOverlay').classList.remove('active');
    calcPlayer = null;
    calcInput = '';
}

function calcPress(digit) {
    if (calcInput.length >= 5) return;
    if (calcInput === '' && digit === '0') return;
    calcInput += digit;
    updateCalcDisplay();
}

function calcBack() {
    calcInput = calcInput.slice(0, -1);
    updateCalcDisplay();
}

function calcClear() {
    calcInput = '';
    updateCalcDisplay();
}

function calcHalve() {
    const player = calcPlayer;
    const lpBefore = lp[player];
    const newLP = Math.floor(lpBefore / 2);
    const amount = newLP - lpBefore;

    history.push({ player: player, amount: amount, lpBefore: lpBefore });
    lp[player] = newLP;
    addLog(player, amount);

    document.getElementById('calcOverlay').classList.remove('active');
    calcPlayer = null;
    calcInput = '';

    animateLP(player, lpBefore, newLP, 'damage');
}

function calcApply(sign) {
    const val = getCalcValue();
    if (!val) return;
    const amount = val * sign;
    const player = calcPlayer;
    const lpBefore = lp[player];

    history.push({ player: player, amount: amount, lpBefore: lpBefore });
    lp[player] = Math.max(0, lp[player] + amount);
    addLog(player, amount);

    document.getElementById('calcOverlay').classList.remove('active');
    calcPlayer = null;
    calcInput = '';

    const type = amount > 0 ? 'heal' : 'damage';
    animateLP(player, lpBefore, lp[player], type);
}

document.addEventListener('keydown', function(e) {
    if (!document.getElementById('calcOverlay').classList.contains('active')) return;
    if (e.key >= '0' && e.key <= '9') calcPress(e.key);
    else if (e.key === 'Backspace') calcBack();
    else if (e.key === 'Enter') calcApply(-1);
    else if (e.key === 'Escape') closeCalc();
    else if (e.key === '+') calcApply(1);
    else if (e.key === '-') calcApply(-1);
});

function toggleTimer() {
    enableWakeLock(); // guarantee user-gesture context for wake lock
    if (timerRunning) {
        clearInterval(timerInterval);
        timerRunning = false;
        document.getElementById('timerBtn').innerHTML = '&#9654;';
    } else {
        timerRunning = true;
        document.getElementById('timerBtn').innerHTML = '&#9646;&#9646;';
        timerInterval = setInterval(() => {
            timerSeconds++;
            updateTimerDisplay();
        }, 1000);
    }
}

function updateTimerDisplay() {
    const m = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
    const s = String(timerSeconds % 60).padStart(2, '0');
    document.getElementById('timerDisplay').textContent = m + ':' + s;
}

function resetTimer() {
    clearInterval(timerInterval);
    timerRunning = false;
    timerSeconds = 0;
    updateTimerDisplay();
    document.getElementById('timerBtn').innerHTML = '&#9654;';
}

function confirmReset(includeTimer) {
    const msg = includeTimer ? 'Resettare la partita?' : 'Resettare i Life Points?';
    document.getElementById('confirmText').textContent = msg;
    const okBtn = document.getElementById('confirmOk');
    okBtn.onclick = function() {
        closeConfirm();
        resetGame(includeTimer);
    };
    document.getElementById('confirmOverlay').classList.add('active');
}

function closeConfirm() {
    document.getElementById('confirmOverlay').classList.remove('active');
}

function resetGame(includeTimer) {
    lp[1] = START_LP;
    lp[2] = START_LP;
    logs = { 1: [], 2: [] };
    history = [];
    updateDisplay(1);
    updateDisplay(2);
    document.getElementById('log1').textContent = '';
    document.getElementById('log2').textContent = '';
    if (includeTimer) resetTimer();
}

function openDice() {
    document.getElementById('diceOverlay').classList.add('active');
}

function rollDice() {
    const dice = document.getElementById('dice3d');

    // Remove previous show class
    for (let i = 1; i <= 6; i++) {
        dice.classList.remove('show-' + i);
    }

    // Reset position instantly (no transition)
    dice.style.transition = 'none';
    dice.style.transform = 'none';
    void dice.offsetWidth;

    // Clear inline styles so CSS classes take over
    dice.style.transition = '';
    dice.style.transform = '';
    void dice.offsetWidth;

    // Animate to random face
    const result = Math.floor(Math.random() * 6) + 1;
    dice.classList.add('show-' + result);
}

function closeDice() {
    document.getElementById('diceOverlay').classList.remove('active');
}

