const START_LP = 8000;
const COOKIE_CONSENT_NAME = 'lp_cookie_consent';
const SETTINGS_COOKIE_NAME = 'lp_counter_settings';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const DEFAULT_SETTINGS = Object.freeze({
    soundEnabled: true,
    lifeAnimationEnabled: true,
    calculatorOrientation: 'fixed'
});

let lp = { 1: START_LP, 2: START_LP };
let logs = { 1: [], 2: [] };
let timerInterval = null;
let timerSeconds = 0;
let timerRunning = false;
let history = [];
let calcPlayer = null;
let calcInput = '';
let cookieConsent = 'pending';
let settings = { ...DEFAULT_SETTINGS };

const lpSound = new Audio('../lifedrop_sound.mp3');

// ── Wake Lock: Screen Wake Lock API (iOS 16.4+, Chrome, Firefox, Edge) ───────
class NoSleep {
    constructor() {
        this._wakeLock = null;
        this._enabled  = false;
    }
    enable() {
        this._enabled = true;
        if (!('wakeLock' in navigator)) return Promise.resolve();
        return navigator.wakeLock.request('screen')
            .then(lock => {
                this._wakeLock = lock;
                lock.addEventListener('release', () => {
                    if (this._enabled) this.enable();
                });
            })
            .catch(() => {});
    }
    disable() {
        this._enabled = false;
        if (this._wakeLock) {
            this._wakeLock.release().catch(() => {});
            this._wakeLock = null;
        }
    }
}
const noSleep = new NoSleep();

// Riacquista il wake lock quando l'app torna in foreground
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && noSleep._enabled) {
        noSleep.enable();
    }
});
// ─────────────────────────────────────────────────────────────────────────────

function playSound() {
    if (!settings.soundEnabled) return;
    lpSound.currentTime = 0;
    lpSound.play().catch(() => {});
}

function updateLifeVisual(player, value = lp[player]) {
    const ratio = Math.max(0, Math.min(value / START_LP, 1));
    const hue = Math.round(ratio * 120);
    const strength = (0.13 + ratio * 0.13).toFixed(3);
    const playerElement = document.querySelector('.player-' + player);

    playerElement.style.setProperty('--lp-hue', hue);
    playerElement.style.setProperty('--lp-strength', strength);
}

function updateDisplay(player) {
    document.getElementById('lp' + player).textContent = lp[player];
    updateLifeVisual(player);
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
        updateLifeVisual(player, current);
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
    overlay.classList.toggle(
        'player-facing',
        settings.calculatorOrientation === 'player' && player === 1
    );
    overlay.classList.add('active');
}

function closeCalc() {
    document.getElementById('calcOverlay').classList.remove('active', 'player-facing');
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
    updateLifeVisual(player, newLP);

    document.getElementById('calcOverlay').classList.remove('active', 'player-facing');
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
    updateLifeVisual(player, lp[player]);

    document.getElementById('calcOverlay').classList.remove('active', 'player-facing');
    calcPlayer = null;
    calcInput = '';

    const type = amount > 0 ? 'heal' : 'damage';
    animateLP(player, lpBefore, lp[player], type);
}

document.addEventListener('keydown', function(e) {
    if (document.getElementById('settingsOverlay').classList.contains('active')) {
        if (e.key === 'Escape') closeSettings();
        return;
    }

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
        noSleep.disable();
        document.getElementById('timerBtn').innerHTML = '&#9654;';
    } else {
        timerRunning = true;
        noSleep.enable();
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
    noSleep.disable();
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

function getCookie(name) {
    const prefix = name + '=';
    const cookie = document.cookie
        .split(';')
        .map(value => value.trim())
        .find(value => value.startsWith(prefix));

    return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

function setCookie(name, value) {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = name + '=' + encodeURIComponent(value)
        + '; Max-Age=' + COOKIE_MAX_AGE
        + '; Path=/; SameSite=Lax'
        + secure;
}

function deleteCookie(name) {
    document.cookie = name + '=; Max-Age=0; Path=/; SameSite=Lax';
}

function loadSettings() {
    const stored = getCookie(SETTINGS_COOKIE_NAME);
    if (!stored) return { ...DEFAULT_SETTINGS };

    try {
        const parsed = JSON.parse(stored);
        return {
            soundEnabled: typeof parsed.soundEnabled === 'boolean'
                ? parsed.soundEnabled
                : DEFAULT_SETTINGS.soundEnabled,
            lifeAnimationEnabled: typeof parsed.lifeAnimationEnabled === 'boolean'
                ? parsed.lifeAnimationEnabled
                : DEFAULT_SETTINGS.lifeAnimationEnabled,
            calculatorOrientation: ['fixed', 'player'].includes(parsed.calculatorOrientation)
                ? parsed.calculatorOrientation
                : DEFAULT_SETTINGS.calculatorOrientation
        };
    } catch (_) {
        return { ...DEFAULT_SETTINGS };
    }
}

function persistSettings() {
    if (cookieConsent !== 'accepted') return;
    setCookie(SETTINGS_COOKIE_NAME, JSON.stringify(settings));
}

function applySettings() {
    document.body.classList.toggle('life-animation-enabled', settings.lifeAnimationEnabled);
    updateLifeVisual(1);
    updateLifeVisual(2);

    if (!settings.soundEnabled) {
        lpSound.pause();
        lpSound.currentTime = 0;
    }
}

function syncSettingsControls() {
    document.getElementById('soundSetting').checked = settings.soundEnabled;
    document.getElementById('animationSetting').checked = settings.lifeAnimationEnabled;

    document.querySelectorAll('input[name="calculatorOrientation"]').forEach(input => {
        input.checked = input.value === settings.calculatorOrientation;
    });
}

function updateStorageStatus() {
    const accepted = cookieConsent === 'accepted';
    document.getElementById('settingsStorageTitle').textContent = accepted
        ? 'Preferenze salvate'
        : 'Preferenze della sessione';
    document.getElementById('settingsStorageText').textContent = accepted
        ? 'Le impostazioni verranno ricordate su questo dispositivo.'
        : 'Le modifiche non verranno salvate alla prossima apertura.';
    document.getElementById('enableCookiesBtn').hidden = accepted;
    document.querySelector('.settings-storage').classList.toggle('saved', accepted);
}

function openSettings() {
    syncSettingsControls();
    updateStorageStatus();
    document.getElementById('settingsOverlay').classList.add('active');
}

function closeSettings() {
    document.getElementById('settingsOverlay').classList.remove('active');
}

function updateBooleanSetting(key, value) {
    if (!['soundEnabled', 'lifeAnimationEnabled'].includes(key)) return;
    settings[key] = value;
    applySettings();
    persistSettings();
}

function updateCalculatorOrientation(value) {
    if (!['fixed', 'player'].includes(value)) return;
    settings.calculatorOrientation = value;
    persistSettings();
}

function acceptCookies(fromSettings) {
    cookieConsent = 'accepted';
    setCookie(COOKIE_CONSENT_NAME, 'accepted');
    persistSettings();
    document.getElementById('cookieOverlay').classList.remove('active');
    updateStorageStatus();

    if (fromSettings) syncSettingsControls();
}

function rejectCookies() {
    cookieConsent = 'rejected';
    deleteCookie(COOKIE_CONSENT_NAME);
    deleteCookie(SETTINGS_COOKIE_NAME);
    document.getElementById('cookieOverlay').classList.remove('active');
    updateStorageStatus();
}

function initializePreferences() {
    if (getCookie(COOKIE_CONSENT_NAME) === 'accepted') {
        cookieConsent = 'accepted';
        settings = loadSettings();
    }

    applySettings();
    syncSettingsControls();
    updateStorageStatus();

    if (cookieConsent !== 'accepted') {
        requestAnimationFrame(() => {
            document.getElementById('cookieOverlay').classList.add('active');
        });
    }
}

initializePreferences();
