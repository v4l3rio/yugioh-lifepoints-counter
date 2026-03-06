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
// Strategy:
//   1. Native Screen Wake Lock API  → Chrome / Android / Safari 16.4+ PWA
//   2. AudioContext silent oscillator → iOS Safari (keeps audio session active,
//      which prevents the system from locking the screen)
// Both are started on the first user gesture and kept alive across
// background/foreground transitions via visibilitychange.
// ─────────────────────────────────────────────────────────────────────────────
let _nativeLock = null;
let _audioCtx   = null;
let _wakeLockOn = false;

async function _requestNativeLock() {
    try {
        _nativeLock = await navigator.wakeLock.request('screen');
        _nativeLock.addEventListener('release', () => {
            _nativeLock = null;
            // Auto re-request when the sentinel is released (e.g. tab hidden then shown)
            if (_wakeLockOn && document.visibilityState === 'visible') {
                _requestNativeLock();
            }
        });
    } catch (_) { /* not supported or denied */ }
}

function _startAudioLock() {
    if (_audioCtx) {
        if (_audioCtx.state === 'suspended') _audioCtx.resume();
        return;
    }
    try {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc  = _audioCtx.createOscillator();
        const gain = _audioCtx.createGain();
        // 18 Hz is sub-bass (inaudible), gain 0.001 is ~60 dB below full scale.
        // Non-zero so iOS recognises an active audio session.
        gain.gain.value    = 0.001;
        osc.frequency.value = 18;
        osc.connect(gain);
        gain.connect(_audioCtx.destination);
        osc.start();
    } catch (_) { /* AudioContext not available */ }
}

async function enableWakeLock() {
    if (_wakeLockOn) return;
    _wakeLockOn = true;

    if ('wakeLock' in navigator) {
        await _requestNativeLock();
    } else {
        // iOS Safari: native API not available → audio keepalive
        _startAudioLock();
    }
}

// Activate on first user interaction (required for both AudioContext and video APIs).
document.addEventListener('touchstart', enableWakeLock, { once: true, passive: true });
document.addEventListener('click',      enableWakeLock, { once: true });

// When returning from background: re-request native lock (it's released on hide)
// and resume audio context if suspended.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !_wakeLockOn) return;
    if ('wakeLock' in navigator && !_nativeLock) _requestNativeLock();
    if (_audioCtx) _audioCtx.resume();
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

