/**
 * writer.js - JITTER PROTOCOL v10.0 (Loki Architecture)
 *
 * Copyright (c) 2025-2026 Denis Gingras. All Rights Reserved.
 *
 * PROPRIETARY AND CONFIDENTIAL
 * This file is part of the JITTEr project and contains proprietary
 * algorithms including the Loki Biometric Analysis System.
 *
 * Unauthorized copying, modification, distribution, or use of this
 * software is strictly prohibited without explicit written permission.
 * See LICENSE file for full terms.
 */

// --- WRITING LEDGER ---
const ledger = {
    ops: [],           // append-only operation timeline
    checkpoints: [],   // content snapshots every 10 ops, hash-chained
    startTime: null,
    ledgerHash: null,
    blurStart: null    // tracks when window was unfocused
};

async function sha256hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function takeCheckpoint(hasPaste) {
    const editor = document.getElementById('editor');
    const content = editor ? editor.innerText : '';
    const prevHash = ledger.checkpoints.length > 0
        ? ledger.checkpoints[ledger.checkpoints.length - 1].hash
        : 'genesis';
    const hash = await sha256hex(prevHash + '|' + content + '|' + Date.now());
    ledger.checkpoints.push({
        t: Date.now(),
        opIdx: ledger.ops.length,
        content,
        hasPaste: hasPaste || false,
        hash
    });
    ledger.ledgerHash = hash;
    updateLedgerUI();
}

let pendingPaste = false;
async function recordOp(op) {
    ledger.ops.push({ t: Date.now(), ...op });
    if (op.op === 'paste') pendingPaste = true;
    if (ledger.ops.length % 10 === 0) {
        await takeCheckpoint(pendingPaste);
        pendingPaste = false;
    }
}

function updateLedgerUI() {
    const el = document.getElementById('ledger-count');
    const hashEl = document.getElementById('ledger-hash');
    if (el) el.innerText = ledger.checkpoints.length + ' blocks';
    if (hashEl && ledger.ledgerHash) {
        hashEl.innerText = ledger.ledgerHash.substring(0, 12).toUpperCase();
    }
}

let passport = {
    totalKeystrokes: 0,
    level: "Novice",
    firstUsed: null,
    lastUsed: null,
    sessionsCompleted: 0,
    // Activity tracking
    dailyStats: {},
    hourlyPattern: new Array(24).fill(0),
    sessionHistory: { lengths: [], timestamps: [] },
    avgSessionLength: 0,
    longestSession: 0,
    sessionLengthVariance: 0,
    avgDailyKeys: 0,
    dailyVariance: 0,
    suspicionScore: 0,
    suspicionSignals: [],
    // --- Baseball Card: Career Stats ---
    careerWpm: 0,                    // Average WPM across career
    careerPurity: 1.000,             // Career purity average (.000 format)
    careerCognitiveRatio: 0,         // Career average cognitive ratio
    careerErrorRate: 0,              // Errors per 100 keys (career)
    streak: { current: 0, longest: 0, lastActiveDate: null }, // Active day streaks
    // --- Baseball Card: Biometric Signatures ---
    digraphProfile: {},              // Career average digraph timings
    dwellProfile: { mean: 0, stdDev: 0 }, // Career dwell time signature
    rhythmSignature: 0,              // Consistency of digraph patterns (0-100)
    // --- Baseball Card: Session History for Advanced Metrics ---
    sessionStats: [],                // Last 20 sessions: { purity, cr, entropy, wpm, errorRate, timestamp }
    consistencyIndex: 0,             // Coefficient of variation across recent sessions (0-100)
    war: 0                           // Writer Authenticity Rating (0-10)
};
let session = { humanChars: 0, alienChars: 0, startTime: Date.now() };

// --- LOKI BIOMETRICS ---
const bio = {
    lastTime: null,
    lastChar: '',
    flowIntervals: [], // Speed between letters (t -> h)
    gapIntervals: [],  // Speed after punctuation (. -> T)
    isBot: false,
    entropy: 100,
    cognitiveRatio: 0, // The "Human Thought" Metric
    backspaces: 0,
    navigates: 0,
    // --- Baseball Card: Dwell Time ---
    keydownTimes: {},      // Tracks keydown timestamps by e.code
    dwellTimes: [],        // Array of dwell durations (ms) — max 200
    // --- Baseball Card: Digraph Timing ---
    digraphs: {},          // { "th": [intervals], "he": [intervals], ... }
    // --- Baseball Card: WPM Windows ---
    wpmWindows: [],        // Rolling 60-second WPM snapshots
    wpmWindowStart: null,  // Start of current WPM window
    wpmWindowChars: 0,     // Chars typed in current window
    // --- Baseball Card: Error Patterns ---
    lastErrorTime: null,   // Timestamp of last non-backspace key (for correction speed)
    correctionSpeeds: [],  // Time between error keystroke and backspace (ms)
    typoKeys: {},          // { "e": 3, "t": 2 } — keys most commonly followed by backspace
    errorsPerWindow: [],   // Error count per 100-keystroke window
    windowKeyCount: 0,     // Keys in current 100-key window
    windowErrorCount: 0,   // Errors in current 100-key window
    // --- Baseball Card: Session Timing ---
    sessionActiveMs: 0,    // Total active typing time (gaps < 5s)
    lastActiveTime: null,  // Last keystroke time for focus tracking
    peakWpm: 0,            // Highest WPM in any window
    flowStateMax: 0,       // Longest run of keystrokes without pause >3s
    flowStateCurrent: 0    // Current run of keystrokes without pause >3s
};

document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['passport'], (result) => {
        if (result.passport) {
            passport = result.passport;
        }
        // Initialize timestamps if first time
        if (!passport.firstUsed) {
            passport.firstUsed = Date.now();
        }
        passport.lastUsed = Date.now();
        updatePassportLevel();
        chrome.storage.local.set({ passport: passport });
        updateDashboard();
    });

    const editor = document.getElementById('editor');
    if(editor) {
        editor.focus();
        editor.addEventListener('keydown', handleKey);
        editor.addEventListener('keyup', handleKeyUp);
        editor.addEventListener('paste', handlePaste);
        editor.addEventListener('input', updateDashboard);
        editor.addEventListener('click', () => { bio.navigates++; updateDashboard(); });
    }

    // Ledger: track window blur/focus (student leaving the writer)
    ledger.startTime = Date.now();
    window.addEventListener('blur', () => {
        ledger.blurStart = Date.now();
    });
    window.addEventListener('focus', () => {
        if (ledger.blurStart) {
            const duration = Date.now() - ledger.blurStart;
            recordOp({ op: 'blur', duration });
            ledger.blurStart = null;
        }
    });

    // Initial checkpoint (empty document)
    takeCheckpoint(false);

    // Bind ledger buttons
    const btnReplay = document.getElementById('btn-replay');
    const btnExportLedger = document.getElementById('btn-export-ledger');
    if (btnReplay) btnReplay.addEventListener('click', openReplay);
    if (btnExportLedger) btnExportLedger.addEventListener('click', exportLedger);

    // UI Bindings
    const btnExport = document.getElementById('btn-export');
    const btnReset = document.getElementById('btn-reset');
    if(btnExport) btnExport.addEventListener('click', exportBadge);
    if(btnReset) btnReset.addEventListener('click', resetSession);

    setupToolbar();
    setupAuthHandlers();
});

function handleKey(e) {
    const forbidden = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Enter', 'Escape'];

    // Track dwell time: record keydown timestamp
    if (e.code) {
        bio.keydownTimes[e.code] = performance.now();
    }

    // 1. Navigation & Edits
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) { bio.navigates++; return; }
    if (e.key === 'Backspace' || e.key === 'Delete') {
        bio.backspaces++;
        // Error pattern: correction speed
        if (bio.lastActiveTime) {
            const corrSpeed = Date.now() - bio.lastActiveTime;
            if (corrSpeed < 5000) { // Only track corrections within 5 seconds
                bio.correctionSpeeds.push(corrSpeed);
                if (bio.correctionSpeeds.length > 50) bio.correctionSpeeds.shift();
            }
        }
        // Error pattern: typo fingerprint (which key was before backspace)
        if (bio.lastChar && bio.lastChar.length === 1) {
            bio.typoKeys[bio.lastChar] = (bio.typoKeys[bio.lastChar] || 0) + 1;
        }
        // Error pattern: errors per window
        bio.windowErrorCount++;
        // Flow state: reset on backspace
        bio.flowStateCurrent = 0;
        recordOp({ op: 'delete' });
        updateDashboard();
        return;
    }

    // 2. Keystroke Dynamics
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !forbidden.includes(e.key)) {
        const now = Date.now();

        if (bio.lastTime) {
            const delta = now - bio.lastTime;

            // "Loki" Logic: Distinguish Flow vs. Gap
            const isGap = /[\s\.\,\;\:\!\?]/.test(bio.lastChar); // Was last char punctuation/space?

            if (delta < 2000) { // Ignore coffee breaks
                if (isGap) {
                    bio.gapIntervals.push(delta);
                    if (bio.gapIntervals.length > 20) bio.gapIntervals.shift();
                } else {
                    bio.flowIntervals.push(delta);
                    if (bio.flowIntervals.length > 50) bio.flowIntervals.shift();
                }
                analyzeRhythm();
            }

            // Digraph tracking: time between consecutive character keys
            if (bio.lastChar && bio.lastChar.length === 1 && delta < 2000) {
                const pair = (bio.lastChar + e.key).toLowerCase();
                if (!bio.digraphs[pair]) bio.digraphs[pair] = [];
                bio.digraphs[pair].push(delta);
                if (bio.digraphs[pair].length > 20) bio.digraphs[pair].shift();
            }

            // Active time tracking (count time between keystrokes if gap < 5s)
            if (delta < 5000) {
                bio.sessionActiveMs += delta;
            }

            // Flow state tracking (consecutive keystrokes without >3s pause)
            if (delta <= 3000) {
                bio.flowStateCurrent++;
                if (bio.flowStateCurrent > bio.flowStateMax) {
                    bio.flowStateMax = bio.flowStateCurrent;
                }
            } else {
                bio.flowStateCurrent = 0;
            }
        }

        // Record pause if gap > 2s (a thought break, not just a coffee break)
        if (bio.lastTime && (now - bio.lastTime) > 2000 && (now - bio.lastTime) < 300000) {
            recordOp({ op: 'pause', duration: now - bio.lastTime });
        }

        bio.lastTime = now;
        bio.lastActiveTime = now;
        bio.lastChar = e.key;

        // WPM windowing: track 60-second rolling windows
        if (!bio.wpmWindowStart) bio.wpmWindowStart = now;
        bio.wpmWindowChars++;
        if (now - bio.wpmWindowStart >= 60000) {
            const windowWpm = Math.round((bio.wpmWindowChars / 5) / ((now - bio.wpmWindowStart) / 60000));
            bio.wpmWindows.push(windowWpm);
            if (bio.wpmWindows.length > 60) bio.wpmWindows.shift(); // Keep last 60 windows (1 hour)
            if (windowWpm > bio.peakWpm) bio.peakWpm = windowWpm;
            bio.wpmWindowChars = 0;
            bio.wpmWindowStart = now;
        }

        // Error rate per 100 keystrokes
        bio.windowKeyCount++;
        if (bio.windowKeyCount >= 100) {
            bio.errorsPerWindow.push(bio.windowErrorCount);
            if (bio.errorsPerWindow.length > 50) bio.errorsPerWindow.shift();
            bio.windowKeyCount = 0;
            bio.windowErrorCount = 0;
        }

        // Record to ledger (store char for replay)
        recordOp({ op: 'key', char: e.key });

        session.humanChars++;
        passport.totalKeystrokes++;
        passport.lastUsed = Date.now();

        // Update activity patterns
        if (typeof PassportUtils !== 'undefined') {
            PassportUtils.updatePassport(passport, 1, false);
        }

        updatePassportLevel();
        chrome.storage.local.set({ passport: passport });
        updateDashboard();
    }
}

// --- DWELL TIME: keyup handler ---
function handleKeyUp(e) {
    if (bio.keydownTimes[e.code]) {
        const dwellTime = performance.now() - bio.keydownTimes[e.code];
        bio.dwellTimes.push(dwellTime);
        if (bio.dwellTimes.length > 200) bio.dwellTimes.shift();
        delete bio.keydownTimes[e.code];
    }
}

function analyzeRhythm() {
    if (bio.flowIntervals.length < 10) return;

    // 1. Calculate Averages
    const avgFlow = bio.flowIntervals.reduce((a,b)=>a+b,0) / bio.flowIntervals.length;
    const avgGap = bio.gapIntervals.length > 0 ? (bio.gapIntervals.reduce((a,b)=>a+b,0) / bio.gapIntervals.length) : avgFlow;

    // 2. The Cognitive Ratio (Gap Speed / Flow Speed)
    // Humans pause at words/sentences. Bots don't.
    // Human: ~150ms flow, ~400ms gap -> Ratio 2.6
    // Bot: ~50ms flow, ~50ms gap -> Ratio 1.0
    bio.cognitiveRatio = avgGap / avgFlow;

    // 3. Standard Deviation (Micro-Variance)
    const squareDiffs = bio.flowIntervals.map(v => Math.pow(v - avgFlow, 2));
    const stdDev = Math.sqrt(squareDiffs.reduce((a,b)=>a+b,0) / bio.flowIntervals.length);

    // --- DETECTION LOGIC ---
    const botRhythm = stdDev < 8; // Too clean
    const botSpeed = avgFlow < 35; // Too fast
    const botLinearity = (bio.cognitiveRatio < 1.2 && session.humanChars > 100); // No thinking pauses

    if (botRhythm || botSpeed || botLinearity) {
        bio.isBot = true;
        bio.entropy = 0;
    } else {
        bio.isBot = false;
        // Entropy Score combines Variance + Cognitive Ratio
        bio.entropy = Math.min(Math.round(stdDev + (bio.cognitiveRatio * 10)), 100);
    }
}

function handlePaste(e) {
    let text = '';
    if (e.clipboardData) { try { text = e.clipboardData.getData('text'); } catch (err) {} }
    if (text.length > 0) {
        session.alienChars += text.length;
        recordOp({ op: 'paste', text, len: text.length });
    }
    updateDashboard();
}

function updatePassportLevel() {
    const k = passport.totalKeystrokes;
    if (k < 1000) passport.level = "Novice";
    else if (k < 5000) passport.level = "Beginner";
    else if (k < 15000) passport.level = "Intermediate";
    else if (k < 50000) passport.level = "Advanced";
    else if (k < 150000) passport.level = "Expert";
    else passport.level = "Master";
}

function updateDashboard() {
    const editor = document.getElementById('editor');
    if(!editor) return;

    const text = editor.innerText;
    const sessionTotal = session.humanChars + session.alienChars;
    let purity = 100;

    if (sessionTotal > 0) purity = Math.round((session.humanChars / sessionTotal) * 100);
    if (bio.isBot) purity = 0; // Bot Penalty

    const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;

    // UI Updates
    const elWord = document.getElementById('word-count');
    const elPurity = document.getElementById('purity-display');
    const elEntropy = document.getElementById('entropy-display');
    const elEdits = document.getElementById('edits-display');

    if(elWord) elWord.innerText = words.toLocaleString();
    if(elEdits) elEdits.innerText = bio.backspaces.toLocaleString();

    if(elEntropy) {
        elEntropy.innerText = bio.entropy;
        elEntropy.style.color = (bio.cognitiveRatio < 1.5) ? '#FFD700' : '#00F0FF';
    }

    if(elPurity) {
        if (bio.isBot) {
            elPurity.innerText = "SYNTHETIC";
            elPurity.style.color = '#FF0000';
            elPurity.style.fontSize = '16px';
        } else {
            elPurity.innerText = `${purity}%`;
            elPurity.style.color = purity < 80 ? '#FF0055' : '#00F0FF';
            elPurity.style.fontSize = '24px';
        }
    }

    // Update passport display
    const elPassport = document.getElementById('passport-display');
    const elPassportLevel = document.getElementById('passport-level');
    if(elPassport) {
        const k = passport.totalKeystrokes;
        if (k >= 1000000) {
            elPassport.innerText = (k / 1000000).toFixed(1) + 'M';
        } else if (k >= 1000) {
            elPassport.innerText = (k / 1000).toFixed(1) + 'K';
        } else {
            elPassport.innerText = k.toString();
        }
    }
    if(elPassportLevel) {
        elPassportLevel.innerText = passport.level;
    }

    // --- Baseball Card: Live Session Stats ---
    // WPM (live calculation)
    const elWpm = document.getElementById('wpm-display');
    if (elWpm) {
        const activeMin = bio.sessionActiveMs / 60000;
        const liveWpm = activeMin > 0.5 ? Math.round((session.humanChars / 5) / activeMin) : 0;
        elWpm.innerText = liveWpm > 0 ? liveWpm : '—';
        elWpm.style.color = liveWpm > 0 ? '#fff' : '#666';
    }

    // Focus Time
    const elFocus = document.getElementById('focus-display');
    if (elFocus) {
        const elapsed = (Date.now() - session.startTime) / 60000;
        const active = bio.sessionActiveMs / 60000;
        const focus = elapsed > 1 ? Math.round((active / elapsed) * 100) : 0;
        elFocus.innerText = focus > 0 ? focus + '%' : '—';
        elFocus.style.color = focus >= 50 ? '#00F0FF' : (focus > 0 ? '#FFD700' : '#666');
    }

    // --- Baseball Card: Career Stats ---
    const elSessions = document.getElementById('career-sessions');
    const elCareerWpm = document.getElementById('career-wpm');
    const elCareerPurity = document.getElementById('career-purity');
    const elCareerStreak = document.getElementById('career-streak');

    if (elSessions) elSessions.innerText = passport.sessionsCompleted || 0;
    if (elCareerWpm) elCareerWpm.innerText = passport.careerWpm > 0 ? passport.careerWpm + ' WPM' : '—';
    if (elCareerPurity) elCareerPurity.innerText = passport.careerPurity > 0 ? '.' + String(Math.round(passport.careerPurity * 1000)).padStart(3, '0') : '—';
    if (elCareerStreak) {
        const streak = passport.streak?.current || 0;
        const longest = passport.streak?.longest || 0;
        elCareerStreak.innerText = streak > 0 ? streak + 'd (best: ' + longest + 'd)' : '—';
    }

    // --- Baseball Card: WAR Display ---
    const elWar = document.getElementById('war-display');
    const elWarTier = document.getElementById('war-tier');
    const elWarFill = document.getElementById('war-fill');
    if (elWar) {
        const war = passport.war || 0;
        elWar.innerText = war > 0 ? war.toFixed(1) : '—';
        if (war > 0) {
            const tier = getWARTier(war);
            if (elWarTier) elWarTier.innerText = tier.icon + ' ' + tier.label;
            if (elWarFill) elWarFill.style.width = (war * 10) + '%';
            elWar.style.color = tier.color;
            const warCard = document.getElementById('war-card');
            if (warCard) warCard.style.borderColor = tier.color;
        }
    }
}

function resetSession() {
    if(confirm("Reset Session?")) {
        session = { humanChars: 0, alienChars: 0, startTime: Date.now() };
        bio.flowIntervals = []; bio.gapIntervals = []; bio.lastTime = null; bio.isBot = false;
        bio.backspaces = 0; bio.navigates = 0; bio.lastChar = '';
        // Reset baseball card bio fields
        bio.keydownTimes = {}; bio.dwellTimes = [];
        bio.digraphs = {};
        bio.wpmWindows = []; bio.wpmWindowStart = null; bio.wpmWindowChars = 0;
        bio.lastErrorTime = null; bio.correctionSpeeds = []; bio.typoKeys = {};
        bio.errorsPerWindow = []; bio.windowKeyCount = 0; bio.windowErrorCount = 0;
        bio.sessionActiveMs = 0; bio.lastActiveTime = null; bio.peakWpm = 0;
        bio.flowStateMax = 0; bio.flowStateCurrent = 0;
        document.getElementById('editor').innerHTML = '';
        updateDashboard();
    }
}

// --- BASEBALL CARD: Session Stats Calculator (Box Score) ---
function calculateSessionStats() {
    const sessionTotal = session.humanChars + session.alienChars;
    const sessionElapsedMs = Date.now() - session.startTime;
    const sessionElapsedMin = sessionElapsedMs / 60000;
    const activeMin = bio.sessionActiveMs / 60000;

    // Session Purity (SP) — .000 format like batting average
    const purity = sessionTotal > 0 ? session.humanChars / sessionTotal : 1.0;

    // Cognitive Ratio (CR) — gap/flow ratio
    const cr = bio.cognitiveRatio;

    // Rhythm Entropy (RE) — already calculated in analyzeRhythm()
    const entropy = bio.entropy;

    // Edit Rate (ER) — backspaces / total keystrokes
    const totalKeys = session.humanChars + bio.backspaces;
    const editRate = totalKeys > 0 ? bio.backspaces / totalKeys : 0;

    // Burst Rate (BR) — StdDev of WPM across windows
    let burstRate = 0;
    if (bio.wpmWindows.length > 1) {
        const avgWpm = bio.wpmWindows.reduce((a, b) => a + b, 0) / bio.wpmWindows.length;
        const squareDiffs = bio.wpmWindows.map(v => Math.pow(v - avgWpm, 2));
        burstRate = Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / bio.wpmWindows.length);
    }

    // Focus Time (FT) — active typing minutes / total session minutes
    const focusTime = sessionElapsedMin > 0 ? Math.min(activeMin / sessionElapsedMin, 1.0) : 0;

    // Paste Events (PE)
    const pasteEvents = ledger.ops.filter(o => o.op === 'paste').length;

    // Paste Volume (PV) — pasted chars / total chars
    const pasteVolume = sessionTotal > 0 ? session.alienChars / sessionTotal : 0;

    // Typing Speed (WPM) for this session
    const sessionWpm = activeMin > 0.5 ? Math.round((session.humanChars / 5) / activeMin) : 0;

    // Dwell Signature — mean + stdDev of dwell times
    let dwellMean = 0, dwellStdDev = 0;
    if (bio.dwellTimes.length > 10) {
        dwellMean = bio.dwellTimes.reduce((a, b) => a + b, 0) / bio.dwellTimes.length;
        const dSquares = bio.dwellTimes.map(v => Math.pow(v - dwellMean, 2));
        dwellStdDev = Math.sqrt(dSquares.reduce((a, b) => a + b, 0) / bio.dwellTimes.length);
    }

    // Correction Speed — average time between error and backspace
    let avgCorrectionSpeed = 0;
    if (bio.correctionSpeeds.length > 0) {
        avgCorrectionSpeed = Math.round(bio.correctionSpeeds.reduce((a, b) => a + b, 0) / bio.correctionSpeeds.length);
    }

    // Flow State Index — longest run without >3s pause
    const flowStateIndex = bio.flowStateMax;

    // Error Rate per 100 keys
    const errorRate = totalKeys > 0 ? parseFloat(((bio.backspaces / totalKeys) * 100).toFixed(1)) : 0;

    // Warm-Up Curve: WPM in first 2 windows vs windows 5-10
    let warmUpCurve = 0;
    if (bio.wpmWindows.length >= 5) {
        const earlyWpm = bio.wpmWindows.slice(0, 2).reduce((a, b) => a + b, 0) / Math.min(2, bio.wpmWindows.length);
        const peakWindows = bio.wpmWindows.slice(4, 10);
        const peakWpm = peakWindows.length > 0 ? peakWindows.reduce((a, b) => a + b, 0) / peakWindows.length : earlyWpm;
        warmUpCurve = peakWpm > 0 ? parseFloat((earlyWpm / peakWpm).toFixed(2)) : 0;
    }

    // Digraph DNA: average timings for top digraphs
    const digraphDNA = {};
    const topDigraphs = ['th', 'he', 'in', 'er', 'an', 're', 'on', 'at', 'en', 'nd',
                         'ti', 'es', 'or', 'te', 'of', 'ed', 'is', 'it', 'al', 'ar'];
    for (const pair of topDigraphs) {
        if (bio.digraphs[pair] && bio.digraphs[pair].length >= 3) {
            const avg = bio.digraphs[pair].reduce((a, b) => a + b, 0) / bio.digraphs[pair].length;
            digraphDNA[pair] = Math.round(avg);
        }
    }

    return {
        purity: parseFloat(purity.toFixed(3)),
        cr: parseFloat(cr.toFixed(2)),
        entropy,
        editRate: parseFloat(editRate.toFixed(3)),
        burstRate: Math.round(burstRate),
        focusTime: parseFloat(focusTime.toFixed(2)),
        pasteEvents,
        pasteVolume: parseFloat(pasteVolume.toFixed(3)),
        wpm: sessionWpm,
        peakWpm: bio.peakWpm,
        dwellMean: Math.round(dwellMean),
        dwellStdDev: Math.round(dwellStdDev),
        correctionSpeed: avgCorrectionSpeed,
        flowStateIndex,
        errorRate,
        warmUpCurve,
        digraphDNA,
        wpmWindows: [...bio.wpmWindows],
        activeMinutes: parseFloat(activeMin.toFixed(1)),
        totalMinutes: parseFloat(sessionElapsedMin.toFixed(1)),
        typoKeys: { ...bio.typoKeys }
    };
}

// --- BASEBALL CARD: Update Career Stats on Session End ---
function updateCareerStats(sessionStats) {
    // Update career WPM (running average)
    if (sessionStats.wpm > 0 && passport.sessionsCompleted > 0) {
        const n = passport.sessionsCompleted;
        passport.careerWpm = Math.round(((passport.careerWpm * (n - 1)) + sessionStats.wpm) / n);
    }

    // Update career purity (running average)
    if (passport.sessionsCompleted > 0) {
        const n = passport.sessionsCompleted;
        passport.careerPurity = parseFloat((((passport.careerPurity * (n - 1)) + sessionStats.purity) / n).toFixed(3));
    }

    // Update career cognitive ratio
    if (sessionStats.cr > 0 && passport.sessionsCompleted > 0) {
        const n = passport.sessionsCompleted;
        passport.careerCognitiveRatio = parseFloat((((passport.careerCognitiveRatio * (n - 1)) + sessionStats.cr) / n).toFixed(2));
    }

    // Update career error rate
    if (passport.sessionsCompleted > 0) {
        const n = passport.sessionsCompleted;
        passport.careerErrorRate = parseFloat((((passport.careerErrorRate * (n - 1)) + sessionStats.errorRate) / n).toFixed(1));
    }

    // Update streak
    const today = new Date().toISOString().split('T')[0];
    if (!passport.streak) passport.streak = { current: 0, longest: 0, lastActiveDate: null };
    if (passport.streak.lastActiveDate === today) {
        // Already counted today
    } else {
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        if (passport.streak.lastActiveDate === yesterday) {
            passport.streak.current++;
        } else {
            passport.streak.current = 1;
        }
        passport.streak.lastActiveDate = today;
        if (passport.streak.current > passport.streak.longest) {
            passport.streak.longest = passport.streak.current;
        }
    }

    // Update dwell profile
    if (sessionStats.dwellMean > 0) {
        if (!passport.dwellProfile) passport.dwellProfile = { mean: 0, stdDev: 0 };
        const n = passport.sessionsCompleted;
        passport.dwellProfile.mean = Math.round(((passport.dwellProfile.mean * (n - 1)) + sessionStats.dwellMean) / n);
        passport.dwellProfile.stdDev = Math.round(((passport.dwellProfile.stdDev * (n - 1)) + sessionStats.dwellStdDev) / n);
    }

    // Update digraph profile (career averages)
    if (!passport.digraphProfile) passport.digraphProfile = {};
    for (const [pair, avg] of Object.entries(sessionStats.digraphDNA)) {
        if (!passport.digraphProfile[pair]) {
            passport.digraphProfile[pair] = avg;
        } else {
            // Running average
            passport.digraphProfile[pair] = Math.round((passport.digraphProfile[pair] + avg) / 2);
        }
    }

    // Store session stats for consistency/advanced metrics (keep last 20)
    if (!passport.sessionStats) passport.sessionStats = [];
    passport.sessionStats.push({
        purity: sessionStats.purity,
        cr: sessionStats.cr,
        entropy: sessionStats.entropy,
        wpm: sessionStats.wpm,
        errorRate: sessionStats.errorRate,
        editRate: sessionStats.editRate,
        focusTime: sessionStats.focusTime,
        timestamp: Date.now()
    });
    if (passport.sessionStats.length > 20) passport.sessionStats.shift();

    // Calculate Rhythm Signature (digraph consistency 0-100)
    passport.rhythmSignature = calculateRhythmSignature();

    // Calculate Consistency Index
    passport.consistencyIndex = calculateConsistencyIndex();

    // Calculate WAR
    passport.war = calculateWAR(sessionStats);
}

// --- BASEBALL CARD: Rhythm Signature (0-100) ---
// Measures how consistent your digraph patterns are session-to-session
function calculateRhythmSignature() {
    if (!passport.digraphProfile || Object.keys(passport.digraphProfile).length < 5) return 0;
    if (!passport.sessionStats || passport.sessionStats.length < 3) return 0;

    // Compare current session digraphs to career profile
    let matches = 0;
    let comparisons = 0;
    const topDigraphs = ['th', 'he', 'in', 'er', 'an', 're', 'on', 'at', 'en', 'nd'];

    for (const pair of topDigraphs) {
        if (bio.digraphs[pair] && bio.digraphs[pair].length >= 3 && passport.digraphProfile[pair]) {
            const sessionAvg = bio.digraphs[pair].reduce((a, b) => a + b, 0) / bio.digraphs[pair].length;
            const careerAvg = passport.digraphProfile[pair];
            // Score: how close is session to career (within 30% = good)
            const deviation = Math.abs(sessionAvg - careerAvg) / careerAvg;
            if (deviation < 0.3) matches++;
            comparisons++;
        }
    }

    if (comparisons === 0) return 0;
    return Math.round((matches / comparisons) * 100);
}

// --- BASEBALL CARD: Consistency Index (0-100) ---
// Coefficient of variation of key metrics across last 10 sessions
function calculateConsistencyIndex() {
    if (!passport.sessionStats || passport.sessionStats.length < 3) return 0;

    const recent = passport.sessionStats.slice(-10);
    const metrics = ['wpm', 'cr', 'entropy', 'errorRate'];
    let totalConsistency = 0;
    let metricCount = 0;

    for (const metric of metrics) {
        const values = recent.map(s => s[metric]).filter(v => v > 0);
        if (values.length < 3) continue;

        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        if (avg === 0) continue;

        const squareDiffs = values.map(v => Math.pow(v - avg, 2));
        const stdDev = Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);
        const cv = stdDev / avg; // Coefficient of variation

        // Lower CV = more consistent = higher score
        // CV of 0.0 = 100 (perfect consistency), CV of 1.0+ = 0
        const consistency = Math.max(0, Math.min(100, Math.round((1 - cv) * 100)));
        totalConsistency += consistency;
        metricCount++;
    }

    return metricCount > 0 ? Math.round(totalConsistency / metricCount) : 0;
}

// --- BASEBALL CARD: WAR (Writer Authenticity Rating) 0-10 ---
function calculateWAR(sessionStats) {
    const accountAgeDays = passport.firstUsed ?
        Math.floor((Date.now() - passport.firstUsed) / (1000 * 60 * 60 * 24)) : 0;

    // Account Age Score (0-10): logarithmic scale, peaks at ~365 days
    const accountAgeScore = Math.min(10, (Math.log(accountAgeDays + 1) / Math.log(365)) * 10);

    // Career Volume Score (0-10): logarithmic, peaks around 500K
    const volumeScore = Math.min(10, (Math.log(passport.totalKeystrokes + 1) / Math.log(500000)) * 10);

    // Session Purity Score (0-10)
    const purityScore = sessionStats.purity * 10;

    // Cognitive Ratio Score (0-10): 2.0+ is human, 1.0 is bot
    const crScore = Math.min(10, Math.max(0, (sessionStats.cr - 1.0) * 5));

    // Rhythm Match Score (0-10): based on rhythm signature
    const rhythmScore = (passport.rhythmSignature || 0) / 10;

    // Consistency Index Score (0-10)
    const consistencyScore = (passport.consistencyIndex || 0) / 10;

    // Edit Behavior Score (0-10): natural edit rate is 3-10%
    let editScore = 0;
    if (sessionStats.editRate > 0.01 && sessionStats.editRate < 0.20) {
        editScore = 10 - Math.abs(sessionStats.editRate - 0.06) * 50; // Peak at ~6%
        editScore = Math.max(0, Math.min(10, editScore));
    }

    // Focus Time Score (0-10): 50-80% active is natural
    const focusScore = Math.min(10, sessionStats.focusTime * 12);

    // WAR composite with weights from spec
    const war = (
        accountAgeScore     * 0.20 +
        volumeScore         * 0.15 +
        purityScore         * 0.15 +
        crScore             * 0.10 +
        rhythmScore         * 0.15 +
        consistencyScore    * 0.10 +
        editScore           * 0.10 +
        focusScore          * 0.05
    );

    return parseFloat(Math.min(10, Math.max(0, war)).toFixed(1));
}

// --- BASEBALL CARD: Get WAR tier display ---
function getWARTier(war) {
    if (war >= 8.0) return { label: 'Hall of Fame', icon: '\u2B50', color: '#FFD700' };
    if (war >= 6.0) return { label: 'All-Star', icon: '\u2705', color: '#00F0FF' };
    if (war >= 4.0) return { label: 'Solid', icon: '\uD83D\uDD37', color: '#4488FF' };
    if (war >= 2.0) return { label: 'Rookie', icon: '\u26A0\uFE0F', color: '#FFD700' };
    return { label: 'Suspicious', icon: '\uD83D\uDEA9', color: '#FF0055' };
}

async function exportBadge() {
    if (bio.isBot) { alert("Verification Denied: Rhythm indicates synthetic origin."); return; }

    const editor = document.getElementById('editor');
    const textLength = editor.innerText.length;
    const date = new Date().toLocaleDateString();

    const sessionTotal = session.humanChars + session.alienChars;
    const purity = sessionTotal > 0 ? Math.round((session.humanChars / sessionTotal) * 100) : 100;

    let integrity = 100;
    if (textLength > 0) integrity = Math.round((session.humanChars / textLength) * 100);
    if (integrity > 100) integrity = 100;

    // Increment sessions completed
    passport.sessionsCompleted++;
    passport.lastUsed = Date.now();

    // Record this session in passport history
    if (typeof PassportUtils !== 'undefined') {
        PassportUtils.updatePassport(passport, session.humanChars, true);
    }

    // Calculate account age in days
    const accountAgeDays = passport.firstUsed ?
        Math.floor((Date.now() - passport.firstUsed) / (1000 * 60 * 60 * 24)) : 0;

    // Get cryptographic components
    let signature = null;
    let publicKeyFingerprint = null;
    let previousBadgeHash = null;

    let publicKeyJwk = null;
    if (typeof CryptoUtils !== 'undefined') {
        publicKeyFingerprint = await CryptoUtils.getPublicKeyFingerprint();
        previousBadgeHash = await CryptoUtils.getPreviousBadgeHash();
        publicKeyJwk = await CryptoUtils.getPublicKeyJwk();
    }

    // Calculate baseball card session stats
    const stats = calculateSessionStats();

    // Update career stats with this session's data
    updateCareerStats(stats);

    // Payload includes Cognitive Ratio (CR) + Passport Data + Baseball Card Stats + Crypto
    const payload = {
        version: '3.0',
        type: 'project',
        title: 'Jitter Doc',
        timestamp: Date.now(),
        purity: purity,
        integrity: integrity,
        keys: session.humanChars,
        edits: bio.backspaces,
        cr: bio.cognitiveRatio.toFixed(2), // The Loki Metric
        entropy: bio.entropy,
        date: date,
        // Passport data
        passport: passport.totalKeystrokes,
        passportLevel: passport.level,
        accountAge: accountAgeDays,
        sessions: passport.sessionsCompleted,
        avgDailyKeys: passport.avgDailyKeys || 0,
        suspicionScore: passport.suspicionScore || 0,
        suspicionSignals: passport.suspicionSignals || [],
        // Writing Ledger
        ledgerHash: ledger.ledgerHash || null,
        ledgerBlocks: ledger.checkpoints.length,
        // --- Baseball Card: Session Stats (Box Score) ---
        sessionPurity: stats.purity,
        sessionCR: stats.cr,
        sessionEntropy: stats.entropy,
        editRate: stats.editRate,
        burstRate: stats.burstRate,
        focusTime: stats.focusTime,
        pasteEvents: stats.pasteEvents,
        pasteVolume: stats.pasteVolume,
        sessionWpm: stats.wpm,
        peakWpm: stats.peakWpm,
        dwellMean: stats.dwellMean,
        dwellStdDev: stats.dwellStdDev,
        correctionSpeed: stats.correctionSpeed,
        flowStateIndex: stats.flowStateIndex,
        errorRate: stats.errorRate,
        warmUpCurve: stats.warmUpCurve,
        digraphDNA: stats.digraphDNA,
        activeMinutes: stats.activeMinutes,
        totalMinutes: stats.totalMinutes,
        // --- Baseball Card: Career Stats ---
        careerWpm: passport.careerWpm,
        careerPurity: passport.careerPurity,
        careerCR: passport.careerCognitiveRatio,
        careerErrorRate: passport.careerErrorRate,
        rhythmSignature: passport.rhythmSignature,
        consistencyIndex: passport.consistencyIndex,
        streak: passport.streak?.current || 0,
        longestStreak: passport.streak?.longest || 0,
        war: passport.war,
        // Crypto chain
        previousBadge: previousBadgeHash,
        publicKeyId: publicKeyFingerprint,
        publicKeyJwk: publicKeyJwk
    };

    // Sign the payload
    if (typeof CryptoUtils !== 'undefined') {
        signature = await CryptoUtils.signBadge(payload);
        if (signature) {
            payload.signature = signature;
        }
    }

    chrome.storage.local.set({ passport: passport });

    const base64 = btoa(JSON.stringify(payload));
    const blockID = base64.slice(-6).toUpperCase();

    // Store badge hash for next badge's chain
    if (typeof CryptoUtils !== 'undefined') {
        await CryptoUtils.storeBadgeHash(base64);
    }
    
    const url = `#jitter:${base64}`;
    const htmlBadge = `<a href="${url}" style="text-decoration:none;" data-jitter-payload="${base64}"><span style="background:#00F0FF11;color:#00F0FF;border:1px solid #00F0FF;padding:2px 6px;font-size:10px;font-family:monospace;border-radius:4px;">⚡ JITTER: 0x${blockID}</span></a>`;
    const plainBadge = `\n\n[ JITTER-BLOCK: 0x${blockID} | INT:${integrity}% | RATIO:${payload.cr} ]`;

    const data = [new ClipboardItem({ 'text/html': new Blob([htmlBadge], {type:'text/html'}), 'text/plain': new Blob([plainBadge], {type:'text/plain'}) })];

    navigator.clipboard.write(data).then(() => {
        const btn = document.getElementById('btn-export');
        const old = btn.innerText;
        btn.innerText = "COPIED!";
        setTimeout(() => btn.innerText = old, 2000);
    });

    // Auto-sync to cloud if logged in
    if (typeof AuthUtils !== 'undefined') {
        const status = AuthUtils.getSyncStatus();
        if (status.isLoggedIn) {
            AuthUtils.syncToCloud(passport).then(result => {
                }).catch(() => {});
        }
    }
}

// --- WRITING LEDGER EXPORT ---
async function exportLedger() {
    // Take a final checkpoint to capture current state
    await takeCheckpoint(false);

    const ledgerFile = {
        version: '3.0',
        type: 'jitter-ledger',
        meta: {
            created: ledger.startTime,
            exported: Date.now(),
            duration: Date.now() - ledger.startTime,
            ledgerHash: ledger.ledgerHash,
            totalOps: ledger.ops.length,
            totalCheckpoints: ledger.checkpoints.length,
            pasteEvents: ledger.ops.filter(o => o.op === 'paste').length,
            blurEvents: ledger.ops.filter(o => o.op === 'blur').length,
            stats: {
                typedChars: session.humanChars,
                pastedChars: session.alienChars,
                backspaces: bio.backspaces,
                cognitiveRatio: bio.cognitiveRatio,
                entropy: bio.entropy,
                isBot: bio.isBot
            }
        },
        // Checkpoints are the backbone of replay — content at every 10 ops
        checkpoints: ledger.checkpoints,
        // Full op timeline for granular replay
        ops: ledger.ops
    };

    const blob = new Blob([JSON.stringify(ledgerFile, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jitter-ledger-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    const btn = document.getElementById('btn-export-ledger');
    if (btn) {
        const old = btn.innerText;
        btn.innerText = 'DOWNLOADED!';
        setTimeout(() => btn.innerText = old, 2000);
    }
}

// --- WRITING LEDGER REPLAY ---
function openReplay() {
    const panel = document.getElementById('replay-panel');
    if (!panel) return;
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    if (panel.style.display === 'flex') {
        renderReplay(0);
        // Update scrubber max
        const scrubber = document.getElementById('replay-scrubber');
        if (scrubber) {
            scrubber.max = Math.max(0, ledger.checkpoints.length - 1);
            scrubber.value = 0;
        }
    }
}

function renderReplay(checkpointIdx) {
    if (ledger.checkpoints.length === 0) return;
    const idx = Math.min(checkpointIdx, ledger.checkpoints.length - 1);
    const cp = ledger.checkpoints[idx];
    if (!cp) return;

    const replayEditor = document.getElementById('replay-editor');
    const replayTime = document.getElementById('replay-time');
    const replayPaste = document.getElementById('replay-paste-indicator');

    if (replayEditor) {
        replayEditor.innerText = cp.content;
        // Flash yellow if this checkpoint contains a paste
        if (cp.hasPaste) {
            replayEditor.style.background = '#FFD70022';
            replayEditor.style.borderColor = '#FFD700';
            setTimeout(() => {
                replayEditor.style.background = '#0a0a0a';
                replayEditor.style.borderColor = '#222';
            }, 800);
        } else {
            replayEditor.style.background = '#0a0a0a';
            replayEditor.style.borderColor = '#222';
        }
    }

    if (replayTime) {
        const elapsed = Math.round((cp.t - ledger.startTime) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        replayTime.innerText = `T+${mins}:${String(secs).padStart(2, '0')}`;
    }

    if (replayPaste) {
        replayPaste.style.display = cp.hasPaste ? 'block' : 'none';
    }

    // Check for blur events between this checkpoint and next
    const blurPanel = document.getElementById('replay-blur-indicator');
    if (blurPanel) {
        const startOp = cp.opIdx;
        const endOp = ledger.checkpoints[idx + 1]?.opIdx || ledger.ops.length;
        const blurInRange = ledger.ops.slice(startOp, endOp).find(o => o.op === 'blur');
        if (blurInRange) {
            const blurSecs = Math.round(blurInRange.duration / 1000);
            blurPanel.innerText = `⚠️ Window unfocused for ${blurSecs}s`;
            blurPanel.style.display = 'block';
        } else {
            blurPanel.style.display = 'none';
        }
    }
}

let replayInterval = null;
function toggleReplayPlayback() {
    const btn = document.getElementById('replay-play-btn');
    if (replayInterval) {
        clearInterval(replayInterval);
        replayInterval = null;
        if (btn) btn.innerText = '▶ PLAY';
    } else {
        const scrubber = document.getElementById('replay-scrubber');
        let idx = parseInt(scrubber?.value || 0);
        const max = ledger.checkpoints.length - 1;
        if (idx >= max) idx = 0;
        if (btn) btn.innerText = '⏸ PAUSE';
        replayInterval = setInterval(() => {
            idx++;
            if (scrubber) scrubber.value = idx;
            renderReplay(idx);
            if (idx >= max) {
                clearInterval(replayInterval);
                replayInterval = null;
                if (btn) btn.innerText = '▶ PLAY';
            }
        }, 300); // 300ms per checkpoint ≈ roughly real-time at 10 ops/checkpoint
    }
}

function setupToolbar() {
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { 
            e.preventDefault(); 
            document.execCommand(btn.dataset.cmd, false, btn.dataset.val || null); 
            const ed = document.getElementById('editor');
            if(ed) ed.focus(); 
        });
    });
    
    const fSelect = document.getElementById('font-select');
    const sSelect = document.getElementById('spacing-select');
    const ed = document.getElementById('editor');
    if(fSelect && ed) fSelect.addEventListener('change', (e) => { ed.className = ed.className.replace(/font-\w+/, '') + ' ' + e.target.value; });
    if(sSelect && ed) sSelect.addEventListener('change', (e) => { ed.className = ed.className.replace(/spacing-\w+/, '') + ' ' + e.target.value; });
}

function setupAuthHandlers() {
    // Initialize Firebase auth
    if (typeof AuthUtils !== 'undefined') {
        AuthUtils.init();
    }

    // Login button
    const btnLogin = document.getElementById('btn-login');
    if (btnLogin) {
        btnLogin.addEventListener('click', () => {
            if (typeof AuthUtils !== 'undefined') {
                AuthUtils.showLoginModal();
            }
        });
    }

    // Logout button
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            if (typeof AuthUtils !== 'undefined') {
                AuthUtils.handleLogout();
            }
        });
    }

    // Manual sync button
    const btnSync = document.getElementById('btn-sync');
    if (btnSync) {
        btnSync.addEventListener('click', () => {
            if (typeof AuthUtils !== 'undefined') {
                AuthUtils.handleManualSync();
            }
        });
    }

    // Handle Enter key in password field
    const passwordInput = document.getElementById('auth-password-input');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && typeof AuthUtils !== 'undefined') {
                AuthUtils.handleLoginSubmit();
            }
        });
    }
}