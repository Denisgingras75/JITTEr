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
    suspicionSignals: []
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
    navigates: 0
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
    
    // 1. Navigation & Edits
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) { bio.navigates++; return; }
    if (e.key === 'Backspace' || e.key === 'Delete') { bio.backspaces++; recordOp({ op: 'delete' }); updateDashboard(); return; }
    
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
        }
        
        // Record pause if gap > 2s (a thought break, not just a coffee break)
        if (bio.lastTime && (now - bio.lastTime) > 2000 && (now - bio.lastTime) < 300000) {
            recordOp({ op: 'pause', duration: now - bio.lastTime });
        }

        bio.lastTime = now;
        bio.lastChar = e.key;

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
    const oldLevel = passport.level;

    if (k < 1000) passport.level = "Novice";
    else if (k < 5000) passport.level = "Beginner";
    else if (k < 15000) passport.level = "Intermediate";
    else if (k < 50000) passport.level = "Advanced";
    else if (k < 150000) passport.level = "Expert";
    else passport.level = "Master";

    // Track level up event
    if (oldLevel !== passport.level && typeof StatsUtils !== 'undefined' && typeof AuthUtils !== 'undefined') {
        const status = AuthUtils.getSyncStatus();
        if (status.isLoggedIn && status.userEmail) {
            StatsUtils.trackLevelUp(AuthUtils.getCurrentUser()?.uid, passport.level, k)
                .catch(err => console.error('Level up tracking failed:', err));
        }
    }
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
        // If Cognitive Ratio is low (Bot-like), warn user
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
}

function resetSession() {
    if(confirm("Reset Session?")) {
        session = { humanChars: 0, alienChars: 0, startTime: Date.now() };
        bio.flowIntervals = []; bio.gapIntervals = []; bio.lastTime = null; bio.isBot = false; 
        bio.backspaces = 0; bio.navigates = 0; bio.lastChar = '';
        document.getElementById('editor').innerHTML = '';
        updateDashboard();
    }
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

    // Payload includes Cognitive Ratio (CR) + Passport Data + Crypto
    const payload = {
        version: '2.0',
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

    // Track badge mint event
    if (typeof StatsUtils !== 'undefined' && typeof AuthUtils !== 'undefined') {
        const status = AuthUtils.getSyncStatus();
        if (status.isLoggedIn && status.userEmail) {
            const wordCount = document.getElementById('word-count')?.innerText || '0';
            const sessionDuration = Date.now() - session.startTime;

            StatsUtils.trackBadgeMint(AuthUtils.getCurrentUser()?.uid, {
                integrity: integrity,
                cognitiveRatio: bio.cognitiveRatio,
                entropy: bio.entropy,
                keystrokes: session.humanChars,
                wordCount: parseInt(wordCount),
                sessionDuration: sessionDuration,
                passportLevel: passport.level,
                passportTotal: passport.totalKeystrokes,
                suspicionScore: passport.suspicionScore || 0,
                riskLevel: passport.suspicionScore > 70 ? 'HIGH' : passport.suspicionScore > 40 ? 'MEDIUM' : 'LOW'
            }).catch(err => console.error('Stats tracking failed:', err));
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