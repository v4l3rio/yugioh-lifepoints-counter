const SETTINGS_COOKIE = 'lp_newui_settings';
const CONSENT_COOKIE = 'lp_newui_consent';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const COOKIE_PATH = window.location.pathname.replace(/[^/]*$/, '') || '/';

const DEFAULT_SETTINGS = Object.freeze({
    player1Name: 'Giocatore 1',
    player2Name: 'Giocatore 2',
    player1Color: '#e0aa5a',
    player2Color: '#6fb7e9',
    startLp: 8000,
    timerMinutes: 40,
    timeAlerts: true,
    soundEnabled: true,
    hapticsEnabled: true,
    wakeLockEnabled: true,
    smartHundreds: false,
    calculatorOrientation: 'player',
    animationsEnabled: true,
    animationIntensity: 'normal',
    highContrast: false
});

const state = {
    settings: { ...DEFAULT_SETTINGS },
    consent: 'pending',
    life: { 1: DEFAULT_SETTINGS.startLp, 2: DEFAULT_SETTINGS.startLp },
    history: [],
    wins: { 1: 0, 2: 0 },
    gameNumber: 1,
    timerSeconds: DEFAULT_SETTINGS.timerMinutes * 60,
    timerRunning: false,
    timerEndAt: null,
    timerInterval: null,
    timerAlertsShown: new Set(),
    calculatorPlayer: null,
    calculatorInput: '',
    activeTool: 'dice',
    pendingConfirm: null
};

const elements = {};
const changeTimers = { 1: null, 2: null };
const lpSound = new Audio('../lifedrop_sound.mp3');
let toastTimer = null;
let wakeLock = null;

function cacheElements() {
    const ids = [
        'appShell', 'playerPanel1', 'playerPanel2', 'playerName1', 'playerName2',
        'lifeValue1', 'lifeValue2', 'lastChange1', 'lastChange2', 'lifeTrack1', 'lifeTrack2',
        'timer', 'matchRound', 'matchScore', 'timerControl',
        'undoAction', 'calculatorOverlay', 'calculatorPlayer', 'equationBefore',
        'equationOperator', 'equationAmount', 'equationResult', 'toolOverlay', 'toolTitle',
        'toolResult', 'toolCaption', 'rerollButton', 'moreOverlay', 'historyOverlay',
        'historyList', 'winnerOverlay', 'winnerName1', 'winnerName2', 'settingsOverlay',
        'confirmOverlay', 'confirmTitle', 'confirmDescription', 'confirmCancel', 'confirmAccept',
        'cookieOverlay', 'acceptCookies', 'rejectCookies', 'toast', 'liveRegion',
        'storageTitle', 'storageDescription', 'enableStorageButton', 'clearStorageButton'
    ];

    ids.forEach(id => { elements[id] = document.getElementById(id); });
}

function getCookie(name) {
    const prefix = name + '=';
    const match = document.cookie
        .split(';')
        .map(value => value.trim())
        .find(value => value.startsWith(prefix));

    if (!match) return null;
    try {
        return decodeURIComponent(match.slice(prefix.length));
    } catch (_) {
        return null;
    }
}

function setCookie(name, value) {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = name + '=' + encodeURIComponent(value)
        + '; Max-Age=' + COOKIE_MAX_AGE
        + '; Path=' + COOKIE_PATH
        + '; SameSite=Lax'
        + secure;
}

function deleteCookie(name) {
    document.cookie = name + '=; Max-Age=0; Path=' + COOKIE_PATH + '; SameSite=Lax';
}

function sanitizeSettings(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const validColors = /^#[0-9a-f]{6}$/i;
    const validStartLp = [4000, 8000, 12000];
    const validMinutes = [40, 45, 50, 60];

    return {
        player1Name: cleanName(source.player1Name, DEFAULT_SETTINGS.player1Name),
        player2Name: cleanName(source.player2Name, DEFAULT_SETTINGS.player2Name),
        player1Color: validColors.test(source.player1Color || '') ? source.player1Color : DEFAULT_SETTINGS.player1Color,
        player2Color: validColors.test(source.player2Color || '') ? source.player2Color : DEFAULT_SETTINGS.player2Color,
        startLp: validStartLp.includes(Number(source.startLp)) ? Number(source.startLp) : DEFAULT_SETTINGS.startLp,
        timerMinutes: validMinutes.includes(Number(source.timerMinutes)) ? Number(source.timerMinutes) : DEFAULT_SETTINGS.timerMinutes,
        timeAlerts: booleanOrDefault(source.timeAlerts, DEFAULT_SETTINGS.timeAlerts),
        soundEnabled: booleanOrDefault(source.soundEnabled, DEFAULT_SETTINGS.soundEnabled),
        hapticsEnabled: booleanOrDefault(source.hapticsEnabled, DEFAULT_SETTINGS.hapticsEnabled),
        wakeLockEnabled: booleanOrDefault(source.wakeLockEnabled, DEFAULT_SETTINGS.wakeLockEnabled),
        smartHundreds: booleanOrDefault(source.smartHundreds, DEFAULT_SETTINGS.smartHundreds),
        calculatorOrientation: ['player', 'fixed'].includes(source.calculatorOrientation)
            ? source.calculatorOrientation
            : DEFAULT_SETTINGS.calculatorOrientation,
        animationsEnabled: booleanOrDefault(source.animationsEnabled, DEFAULT_SETTINGS.animationsEnabled),
        animationIntensity: ['subtle', 'normal', 'strong'].includes(source.animationIntensity)
            ? source.animationIntensity
            : DEFAULT_SETTINGS.animationIntensity,
        highContrast: booleanOrDefault(source.highContrast, DEFAULT_SETTINGS.highContrast)
    };
}

function booleanOrDefault(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
}

function cleanName(value, fallback) {
    if (typeof value !== 'string') return fallback;
    const cleaned = value.trim().slice(0, 18);
    return cleaned || fallback;
}

function loadPreferences() {
    if (getCookie(CONSENT_COOKIE) !== 'accepted') return;
    state.consent = 'accepted';
    const stored = getCookie(SETTINGS_COOKIE);
    if (!stored) return;

    try {
        state.settings = sanitizeSettings(JSON.parse(stored));
    } catch (_) {
        state.settings = { ...DEFAULT_SETTINGS };
    }
}

function persistPreferences() {
    if (state.consent !== 'accepted') return;
    setCookie(SETTINGS_COOKIE, JSON.stringify(state.settings));
}

function acceptPreferenceCookies() {
    state.consent = 'accepted';
    setCookie(CONSENT_COOKIE, 'accepted');
    persistPreferences();
    closeOverlay('cookieOverlay');
    renderStorageStatus();
    showToast('Preferenze salvate su questo dispositivo');
}

function rejectPreferenceCookies() {
    state.consent = 'rejected';
    deleteCookie(CONSENT_COOKIE);
    deleteCookie(SETTINGS_COOKIE);
    closeOverlay('cookieOverlay');
    renderStorageStatus();
}

function clearSavedPreferences() {
    state.consent = 'rejected';
    deleteCookie(CONSENT_COOKIE);
    deleteCookie(SETTINGS_COOKIE);
    renderStorageStatus();
    showToast('Preferenze eliminate: le modifiche restano solo per questa sessione');
}

function applyPreferences(options = {}) {
    const { resetTimerValue = false } = options;
    const settings = state.settings;
    const root = document.documentElement;

    root.style.setProperty('--player-1', settings.player1Color);
    root.style.setProperty('--player-2', settings.player2Color);
    root.style.setProperty('--player-1-rgb', hexToRgb(settings.player1Color).join(' '));
    root.style.setProperty('--player-2-rgb', hexToRgb(settings.player2Color).join(' '));

    const intensity = {
        subtle: ['0.22', '0.14'],
        normal: ['0.34', '0.22'],
        strong: ['0.48', '0.32']
    }[settings.animationIntensity];
    root.style.setProperty('--animation-percent', intensity[0]);
    root.style.setProperty('--animation-secondary-percent', intensity[1]);

    document.body.classList.toggle('animations-enabled', settings.animationsEnabled);
    document.body.classList.toggle('high-contrast', settings.highContrast);

    elements.playerName1.textContent = settings.player1Name;
    elements.playerName2.textContent = settings.player2Name;
    elements.winnerName1.textContent = settings.player1Name;
    elements.winnerName2.textContent = settings.player2Name;
    elements.playerPanel1.setAttribute('aria-label', 'Modifica i Life Points di ' + settings.player1Name);
    elements.playerPanel2.setAttribute('aria-label', 'Modifica i Life Points di ' + settings.player2Name);

    if (resetTimerValue && !state.timerRunning) {
        state.timerSeconds = settings.timerMinutes * 60;
        state.timerAlertsShown.clear();
    }

    renderPlayers();
    renderTimer();
    renderMatchState();
    renderStorageStatus();
    syncSettingsControls();

    if (!settings.soundEnabled) {
        lpSound.pause();
        lpSound.currentTime = 0;
    }

    if (!settings.wakeLockEnabled) releaseWakeLock();
}

function renderStorageStatus() {
    const isSaved = state.consent === 'accepted';
    const container = document.querySelector('.storage-status');
    if (!container) return;

    container.classList.toggle('is-saved', isSaved);
    elements.storageTitle.textContent = isSaved ? 'Preferenze salvate' : 'Preferenze della sessione';
    elements.storageDescription.textContent = isSaved
        ? 'Le impostazioni vengono ricordate su questo dispositivo.'
        : 'Le modifiche non sono salvate sul dispositivo.';
    elements.enableStorageButton.hidden = isSaved;
    elements.clearStorageButton.hidden = !isSaved;
}

function syncSettingsControls() {
    const settings = state.settings;
    const values = {
        settingName1: settings.player1Name,
        settingName2: settings.player2Name,
        settingStartLp: String(settings.startLp),
        settingTimerMinutes: String(settings.timerMinutes),
        settingTimeAlerts: settings.timeAlerts,
        settingSound: settings.soundEnabled,
        settingHaptics: settings.hapticsEnabled,
        settingWakeLock: settings.wakeLockEnabled,
        settingSmartHundreds: settings.smartHundreds,
        settingCalculatorOrientation: settings.calculatorOrientation,
        settingAnimations: settings.animationsEnabled,
        settingAnimationIntensity: settings.animationIntensity,
        settingColor1: settings.player1Color,
        settingColor2: settings.player2Color,
        settingHighContrast: settings.highContrast
    };

    Object.entries(values).forEach(([id, value]) => {
        const input = document.getElementById(id);
        if (!input) return;
        if (input.type === 'checkbox') input.checked = value;
        else input.value = value;
    });
}

function registerSettingsListeners() {
    const bindings = [
        ['settingName1', 'player1Name', 'text'],
        ['settingName2', 'player2Name', 'text'],
        ['settingStartLp', 'startLp', 'number'],
        ['settingTimerMinutes', 'timerMinutes', 'number'],
        ['settingTimeAlerts', 'timeAlerts', 'checkbox'],
        ['settingSound', 'soundEnabled', 'checkbox'],
        ['settingHaptics', 'hapticsEnabled', 'checkbox'],
        ['settingWakeLock', 'wakeLockEnabled', 'checkbox'],
        ['settingSmartHundreds', 'smartHundreds', 'checkbox'],
        ['settingCalculatorOrientation', 'calculatorOrientation', 'value'],
        ['settingAnimations', 'animationsEnabled', 'checkbox'],
        ['settingAnimationIntensity', 'animationIntensity', 'value'],
        ['settingColor1', 'player1Color', 'value'],
        ['settingColor2', 'player2Color', 'value'],
        ['settingHighContrast', 'highContrast', 'checkbox']
    ];

    bindings.forEach(([id, key, type]) => {
        const input = document.getElementById(id);
        const eventName = type === 'text' || input.type === 'color' ? 'input' : 'change';
        input.addEventListener(eventName, () => {
            let value;
            if (type === 'checkbox') value = input.checked;
            else if (type === 'number') value = Number(input.value);
            else if (type === 'text') value = cleanName(input.value, DEFAULT_SETTINGS[key]);
            else value = input.value;

            state.settings[key] = value;
            state.settings = sanitizeSettings(state.settings);
            persistPreferences();
            applyPreferences({ resetTimerValue: key === 'timerMinutes' });

            if (key === 'startLp') showToast('Il nuovo valore verrà applicato al prossimo reset');
        });
    });
}

function renderPlayers() {
    renderPlayer(1);
    renderPlayer(2);
}

function renderPlayer(player) {
    const life = state.life[player];
    const start = state.settings.startLp;
    const ratio = Math.max(0, Math.min(life / start, 1));
    const dangerRatio = Math.max(0, Math.min((0.28 - ratio) / 0.28, 1));
    const panel = elements['playerPanel' + player];
    const value = elements['lifeValue' + player];
    const track = elements['lifeTrack' + player];
    const lifeColor = dangerRatio > 0 ? mixHexColors(playerColor(player), '#ff6262', dangerRatio) : playerColor(player);

    value.textContent = String(life);
    track.style.transform = 'scaleX(' + ratio + ')';
    panel.style.setProperty('--life-ratio', ratio.toFixed(3));
    panel.style.setProperty('--danger-ratio', dangerRatio.toFixed(3));
    panel.style.setProperty('--life-color', lifeColor);
    panel.style.setProperty('--player-rgb', hexToRgb(playerColor(player)).join(' '));
    panel.style.setProperty('--life-rgb', hexToRgb(lifeColor).join(' '));
    panel.style.setProperty('--ambient-speed', (11 - dangerRatio * 3).toFixed(1) + 's');
    panel.classList.toggle('is-critical', life > 0 && ratio <= 0.25);
    panel.classList.toggle('is-defeated', life === 0);
}

function playerColor(player) {
    return player === 1 ? state.settings.player1Color : state.settings.player2Color;
}

function playerName(player) {
    return player === 1 ? state.settings.player1Name : state.settings.player2Name;
}

function mixHexColors(first, second, amount) {
    const a = hexToRgb(first);
    const b = hexToRgb(second);
    const channels = a.map((value, index) => Math.round(value + (b[index] - value) * amount));
    return '#' + channels.map(value => value.toString(16).padStart(2, '0')).join('');
}

function hexToRgb(color) {
    return color.match(/\w\w/g).map(value => parseInt(value, 16));
}

function changeLife(player, nextLife, source = 'manual') {
    const before = state.life[player];
    const after = Math.max(0, Math.round(nextLife));
    const delta = after - before;
    if (delta === 0) return false;

    state.life[player] = after;
    state.history.unshift({
        id: Date.now() + '-' + Math.random().toString(16).slice(2),
        player,
        before,
        after,
        delta,
        source,
        timestamp: new Date()
    });

    renderPlayer(player);
    showLifeChange(player, delta);
    updateUndoState();
    playLifeSound();
    vibrate(delta < 0 ? 22 : 14);
    announce(playerName(player) + ': ' + before + ' a ' + after + ', ' + formatDelta(delta));
    return true;
}

function showLifeChange(player, delta) {
    const badge = elements['lastChange' + player];
    const value = elements['lifeValue' + player];
    clearTimeout(changeTimers[player]);

    badge.textContent = formatDelta(delta);
    badge.className = 'last-change is-visible ' + (delta < 0 ? 'is-damage' : 'is-heal');
    value.classList.remove('is-changing');
    void value.offsetWidth;
    value.classList.add('is-changing');
    value.addEventListener('animationend', () => value.classList.remove('is-changing'), { once: true });

    changeTimers[player] = setTimeout(() => {
        badge.classList.remove('is-visible');
    }, 3800);
}

function formatDelta(delta) {
    return (delta > 0 ? '+' : '−') + Math.abs(delta);
}

function updateUndoState() {
    elements.undoAction.disabled = state.history.length === 0;
}

function undoLastChange() {
    const entry = state.history.shift();
    if (!entry) return;
    state.life[entry.player] = entry.before;
    renderPlayer(entry.player);
    showLifeChange(entry.player, -entry.delta);
    updateUndoState();
    vibrate(12);
    showToast('Ultima modifica annullata');
}

function resetLifePoints(options = {}) {
    const { resetTimerToo = false, clearHistory = true } = options;
    state.life[1] = state.settings.startLp;
    state.life[2] = state.settings.startLp;
    if (clearHistory) state.history = [];
    if (resetTimerToo) resetTimer();

    [1, 2].forEach(player => {
        clearTimeout(changeTimers[player]);
        elements['lastChange' + player].className = 'last-change';
        elements['lastChange' + player].textContent = '';
    });

    renderPlayers();
    updateUndoState();
}

function resetMatch() {
    stopTimer();
    state.wins = { 1: 0, 2: 0 };
    state.gameNumber = 1;
    resetLifePoints({ resetTimerToo: true });
    renderMatchState();
    showToast('Nuova partita iniziata');
}

function awardGame(player) {
    state.wins[player] += 1;
    closeOverlay('winnerOverlay');
    renderMatchState();

    if (state.wins[player] >= 2) {
        stopTimer();
        showToast(playerName(player) + ' vince la partita');
        announce(playerName(player) + ' vince la partita');
        vibrate([30, 40, 30]);
        return;
    }

    state.gameNumber = Math.min(3, state.wins[1] + state.wins[2] + 1);
    resetLifePoints({ resetTimerToo: true });
    renderMatchState();
    showToast(playerName(player) + ' vince il duello. Inizia il Duello ' + state.gameNumber);
}

function renderMatchState() {
    elements.matchRound.textContent = 'Duello ' + state.gameNumber;
    elements.matchScore.textContent = state.wins[1] + '–' + state.wins[2];
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return String(minutes).padStart(2, '0') + ':' + String(remainingSeconds).padStart(2, '0');
}

function renderTimer() {
    const value = formatTime(state.timerSeconds);
    elements.timer.textContent = value;
    elements.timerControl.classList.toggle('is-running', state.timerRunning);
    elements.timerControl.setAttribute('aria-label', state.timerRunning ? 'Metti in pausa il timer' : 'Avvia il timer');

    const duelHub = document.querySelector('.duel-hub');
    duelHub.classList.toggle('is-warning', state.timerSeconds > 0 && state.timerSeconds <= 5 * 60);
    duelHub.classList.toggle('is-expired', state.timerSeconds === 0);
}

function toggleTimer() {
    if (state.timerRunning) stopTimer();
    else startTimer();
}

function startTimer() {
    if (state.timerSeconds === 0) resetTimer();
    state.timerRunning = true;
    state.timerEndAt = Date.now() + state.timerSeconds * 1000;
    state.timerInterval = setInterval(tickTimer, 250);
    requestWakeLock();
    renderTimer();
    vibrate(10);
}

function tickTimer() {
    const nextSeconds = Math.max(0, Math.ceil((state.timerEndAt - Date.now()) / 1000));
    if (nextSeconds === state.timerSeconds) return;
    state.timerSeconds = nextSeconds;
    checkTimerAlerts();
    renderTimer();

    if (state.timerSeconds === 0) {
        stopTimer();
        playAlertTone();
        vibrate([80, 60, 80]);
        showToast('Tempo scaduto');
        announce('Tempo scaduto');
    }
}

function stopTimer() {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
    state.timerRunning = false;
    state.timerEndAt = null;
    releaseWakeLock();
    renderTimer();
}

function resetTimer() {
    stopTimer();
    state.timerSeconds = state.settings.timerMinutes * 60;
    state.timerAlertsShown.clear();
    renderTimer();
}

function checkTimerAlerts() {
    if (!state.settings.timeAlerts) return;
    const alertMinutes = [10, 5, 1];
    alertMinutes.forEach(minutes => {
        const threshold = minutes * 60;
        if (state.timerSeconds <= threshold && !state.timerAlertsShown.has(minutes)) {
            state.timerAlertsShown.add(minutes);
            showToast(minutes === 1 ? 'Manca 1 minuto' : 'Mancano ' + minutes + ' minuti');
            playAlertTone();
            vibrate([25, 35, 25]);
        }
    });
}

async function requestWakeLock() {
    if (!state.settings.wakeLockEnabled || !('wakeLock' in navigator)) return;
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (_) {}
}

function releaseWakeLock() {
    if (!wakeLock) return;
    wakeLock.release().catch(() => {});
    wakeLock = null;
}

function playLifeSound() {
    if (!state.settings.soundEnabled) return;
    lpSound.currentTime = 0;
    lpSound.play().catch(() => {});
}

function playAlertTone() {
    if (!state.settings.soundEnabled) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    try {
        const context = new AudioContextClass();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = 740;
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.11, context.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.24);
        oscillator.addEventListener('ended', () => context.close());
    } catch (_) {}
}

function vibrate(pattern) {
    if (!state.settings.hapticsEnabled || !('vibrate' in navigator)) return;
    navigator.vibrate(pattern);
}

function openCalculator(player) {
    state.calculatorPlayer = player;
    state.calculatorInput = '';
    elements.calculatorPlayer.textContent = playerName(player);
    elements.calculatorOverlay.style.setProperty('--active-player-color', playerColor(player));
    elements.calculatorOverlay.classList.toggle(
        'is-player-facing',
        player === 1 && state.settings.calculatorOrientation === 'player'
    );
    updateCalculatorPreview('damage');
    openOverlay('calculatorOverlay');
    vibrate(8);
}

function closeCalculator() {
    closeOverlay('calculatorOverlay');
    elements.calculatorOverlay.classList.remove('is-player-facing');
    state.calculatorPlayer = null;
    state.calculatorInput = '';
}

function calculatorPressDigit(digit) {
    if (state.calculatorInput.length >= 6) return;
    if (!state.calculatorInput && digit === '0') return;
    state.calculatorInput += digit;
    updateCalculatorPreview('damage');
    vibrate(5);
}

function calculatorValue() {
    if (!state.calculatorInput) return 0;
    const raw = Number.parseInt(state.calculatorInput, 10);
    if (state.settings.smartHundreds && state.calculatorInput.length <= 2) return raw * 100;
    return raw;
}

function updateCalculatorPreview(operation) {
    const player = state.calculatorPlayer || 1;
    const before = state.life[player];
    const amount = calculatorValue();
    let result = before;
    let operator = '−';

    if (operation === 'heal') {
        operator = '+';
        result = before + amount;
    } else if (operation === 'halve') {
        operator = '÷2';
        result = Math.floor(before / 2);
    } else {
        result = Math.max(0, before - amount);
    }

    elements.equationBefore.textContent = String(before);
    elements.equationOperator.textContent = operator;
    elements.equationAmount.textContent = operation === 'halve' ? '' : String(amount);
    elements.equationAmount.hidden = operation === 'halve';
    elements.equationResult.textContent = String(result);
}

function applyCalculatorOperation(operation) {
    const player = state.calculatorPlayer;
    if (!player) return;
    const before = state.life[player];
    let next = before;

    if (operation === 'halve') {
        next = Math.floor(before / 2);
    } else {
        const amount = calculatorValue();
        if (!amount) {
            showToast('Inserisci un valore');
            return;
        }
        next = operation === 'heal' ? before + amount : before - amount;
    }

    if (changeLife(player, next, operation)) closeCalculator();
}

function setCalculatorQuickValue(value) {
    state.calculatorInput = String(value);
    updateCalculatorPreview('damage');
    vibrate(5);
}

function openTool(tool) {
    state.activeTool = tool;
    elements.toolResult.classList.toggle('is-coin', tool === 'coin');
    elements.toolTitle.textContent = tool === 'dice' ? 'Dado' : 'Moneta';
    elements.rerollButton.textContent = tool === 'dice' ? 'Rilancia' : 'Ritira';
    openOverlay('toolOverlay');
    rollActiveTool();
}

function rollActiveTool() {
    const isCoin = state.activeTool === 'coin';
    const result = isCoin ? (secureRandom(2) === 0 ? 'TESTA' : 'CROCE') : String(secureRandom(6) + 1);
    elements.toolResult.classList.remove('is-rolling');
    void elements.toolResult.offsetWidth;
    elements.toolResult.textContent = result;
    elements.toolResult.classList.add('is-rolling');
    elements.toolCaption.textContent = isCoin ? 'Risultato del lancio' : 'Risultato del dado';
    vibrate([12, 35, 18]);
}

function secureRandom(max) {
    if (window.crypto && window.crypto.getRandomValues) {
        const values = new Uint32Array(1);
        window.crypto.getRandomValues(values);
        return Math.floor((values[0] / 4294967296) * max);
    }
    return Math.floor(Math.random() * max);
}

function renderHistory() {
    if (!state.history.length) {
        elements.historyList.innerHTML = '<div class="history-empty">Nessuna modifica ai Life Points in questo duello.</div>';
        return;
    }

    elements.historyList.innerHTML = state.history.map(entry => {
        const time = entry.timestamp.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        const typeClass = entry.delta < 0 ? 'is-damage' : 'is-heal';
        return '<article class="history-item" style="--item-player-color:' + playerColor(entry.player) + '">'
            + '<span class="history-item__marker" aria-hidden="true"></span>'
            + '<span class="history-item__main"><strong>' + escapeHtml(playerName(entry.player)) + '</strong>'
            + '<small>' + time + ' · ' + entry.before + ' → ' + entry.after + '</small></span>'
            + '<span class="history-item__delta ' + typeClass + '">' + formatDelta(entry.delta) + '</span>'
            + '</article>';
    }).join('');
}

function escapeHtml(value) {
    const container = document.createElement('div');
    container.textContent = value;
    return container.innerHTML;
}

function openOverlay(id) {
    const overlay = elements[id] || document.getElementById(id);
    if (!overlay) return;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
}

function closeOverlay(id) {
    const overlay = elements[id] || document.getElementById(id);
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
}

function closeNamedOverlay(name) {
    const mapping = {
        calculator: 'calculatorOverlay',
        tool: 'toolOverlay',
        more: 'moreOverlay',
        history: 'historyOverlay',
        winner: 'winnerOverlay',
        settings: 'settingsOverlay'
    };
    if (name === 'calculator') closeCalculator();
    else if (mapping[name]) closeOverlay(mapping[name]);
}

function requestConfirmation(title, description, action) {
    state.pendingConfirm = action;
    elements.confirmTitle.textContent = title;
    elements.confirmDescription.textContent = description;
    openOverlay('confirmOverlay');
}

function acceptConfirmation() {
    const action = state.pendingConfirm;
    state.pendingConfirm = null;
    closeOverlay('confirmOverlay');
    if (action) action();
}

function cancelConfirmation() {
    state.pendingConfirm = null;
    closeOverlay('confirmOverlay');
}

function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add('is-visible');
    toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), 3000);
}

function announce(message) {
    elements.liveRegion.textContent = '';
    requestAnimationFrame(() => { elements.liveRegion.textContent = message; });
}

function handleDockAction(action) {
    if (action === 'dice' || action === 'coin') openTool(action);
    else if (action === 'undo') undoLastChange();
    else if (action === 'more') openOverlay('moreOverlay');
}

function handleMenuAction(action) {
    closeOverlay('moreOverlay');
    if (action === 'history') {
        renderHistory();
        openOverlay('historyOverlay');
    } else if (action === 'winner') {
        openOverlay('winnerOverlay');
    } else if (action === 'settings') {
        syncSettingsControls();
        renderStorageStatus();
        openOverlay('settingsOverlay');
    } else if (action === 'reset-lp') {
        requestConfirmation(
            'Azzera i Life Points?',
            'Entrambi i giocatori torneranno a ' + state.settings.startLp + ' LP e la cronologia verrà eliminata.',
            () => {
                resetLifePoints();
                showToast('Life Points ripristinati');
            }
        );
    } else if (action === 'reset-match') {
        requestConfirmation(
            'Nuova partita?',
            'Punteggio, timer e cronologia verranno azzerati.',
            resetMatch
        );
    }
}

function registerMainListeners() {
    [1, 2].forEach(player => {
        const panel = elements['playerPanel' + player];
        panel.addEventListener('click', () => openCalculator(player));
        panel.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openCalculator(player);
            }
        });
    });

    elements.timerControl.addEventListener('click', toggleTimer);

    document.querySelectorAll('[data-action]').forEach(button => {
        button.addEventListener('click', () => handleDockAction(button.dataset.action));
    });

    document.querySelectorAll('[data-close]').forEach(button => {
        button.addEventListener('click', () => closeNamedOverlay(button.dataset.close));
    });

    document.querySelectorAll('[data-menu-action]').forEach(button => {
        button.addEventListener('click', () => handleMenuAction(button.dataset.menuAction));
    });

    document.querySelectorAll('[data-digit]').forEach(button => {
        button.addEventListener('click', () => calculatorPressDigit(button.dataset.digit));
    });

    document.querySelectorAll('[data-quick-value]').forEach(button => {
        button.addEventListener('click', () => setCalculatorQuickValue(Number(button.dataset.quickValue)));
    });

    document.querySelectorAll('[data-operation]').forEach(button => {
        button.addEventListener('click', () => applyCalculatorOperation(button.dataset.operation));
    });

    document.querySelectorAll('[data-calc-action]').forEach(button => {
        button.addEventListener('click', () => {
            if (button.dataset.calcAction === 'clear') state.calculatorInput = '';
            else state.calculatorInput = state.calculatorInput.slice(0, -1);
            updateCalculatorPreview('damage');
            vibrate(5);
        });
    });

    document.querySelectorAll('[data-winner]').forEach(button => {
        button.addEventListener('click', () => awardGame(Number(button.dataset.winner)));
    });

    elements.rerollButton.addEventListener('click', rollActiveTool);
    elements.confirmAccept.addEventListener('click', acceptConfirmation);
    elements.confirmCancel.addEventListener('click', cancelConfirmation);
    elements.acceptCookies.addEventListener('click', acceptPreferenceCookies);
    elements.rejectCookies.addEventListener('click', rejectPreferenceCookies);
    elements.enableStorageButton.addEventListener('click', acceptPreferenceCookies);
    elements.clearStorageButton.addEventListener('click', clearSavedPreferences);

    document.addEventListener('keydown', handleKeyboard);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && state.timerRunning) requestWakeLock();
    });
}

function handleKeyboard(event) {
    if (elements.calculatorOverlay.classList.contains('is-open')) {
        if (event.key >= '0' && event.key <= '9') calculatorPressDigit(event.key);
        else if (event.key === 'Backspace') {
            state.calculatorInput = state.calculatorInput.slice(0, -1);
            updateCalculatorPreview('damage');
        } else if (event.key === 'Enter' || event.key === '-') applyCalculatorOperation('damage');
        else if (event.key === '+') applyCalculatorOperation('heal');
        else if (event.key === 'Escape') closeCalculator();
        return;
    }

    if (event.key === 'Escape') {
        const openOverlays = Array.from(document.querySelectorAll('.overlay.is-open'));
        const last = openOverlays.at(-1);
        if (last && last.id !== 'cookieOverlay') closeOverlay(last.id);
    }
}

function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || window.location.protocol === 'file:') return;
    navigator.serviceWorker.register('./sw.js').catch(() => {});
}

function initialize() {
    cacheElements();
    loadPreferences();
    state.life = { 1: state.settings.startLp, 2: state.settings.startLp };
    state.timerSeconds = state.settings.timerMinutes * 60;
    registerMainListeners();
    registerSettingsListeners();
    applyPreferences();
    renderPlayers();
    renderTimer();
    renderMatchState();
    updateUndoState();
    registerServiceWorker();

    if (state.consent !== 'accepted') {
        requestAnimationFrame(() => openOverlay('cookieOverlay'));
    }
}

initialize();
