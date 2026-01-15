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

let passport = {
    totalKeystrokes: 0,
    level: "Novice",
    firstUsed: null,
    lastUsed: null,
    sessionsCompleted: 0
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
    if (e.key === 'Backspace' || e.key === 'Delete') { bio.backspaces++; updateDashboard(); return; }
    
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
        
        bio.lastTime = now;
        bio.lastChar = e.key;

        session.humanChars++;
        passport.totalKeystrokes++;
        passport.lastUsed = Date.now();
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
    let len = 0;
    if (e.clipboardData) { try { len = e.clipboardData.getData('text').length; } catch (err) {} }
    if (len > 0) session.alienChars += len;
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

function exportBadge() {
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
    chrome.storage.local.set({ passport: passport });

    // Calculate account age in days
    const accountAgeDays = passport.firstUsed ?
        Math.floor((Date.now() - passport.firstUsed) / (1000 * 60 * 60 * 24)) : 0;

    // Payload includes Cognitive Ratio (CR) + Passport Data
    const payload = {
        type: 'project',
        title: 'Jitter Doc',
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
        sessions: passport.sessionsCompleted
    };
    
    const base64 = btoa(JSON.stringify(payload));
    const blockID = base64.slice(-6).toUpperCase();
    
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
                if (result.success) {
                    console.log('Auto-synced passport to cloud');
                }
            }).catch(err => console.error('Auto-sync failed:', err));
        }
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