// writer.js - JITTER PROTOCOL v8.0 (Biometric Engine)

let passport = { totalKeystrokes: 0, level: "Novice" };
let session = { humanChars: 0, alienChars: 0, startTime: Date.now() };

// --- BIOMETRIC STATE ---
const bio = {
    keyTimes: [],
    intervals: [],
    lastTime: null,
    isBot: false,
    entropy: 100 // 100 = Natural Human Chaos, 0 = Robotic Order
};

document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['passport'], (result) => {
        if (result.passport) passport = result.passport;
        updateDashboard();
    });

    const editor = document.getElementById('editor');
    editor.focus();

    editor.addEventListener('keydown', handleKey);
    editor.addEventListener('paste', handlePaste);
    editor.addEventListener('input', updateDashboard);
    
    document.getElementById('btn-export').addEventListener('click', exportBadge);
    document.getElementById('btn-reset').addEventListener('click', resetSession);

    // Toolbar & Dropdown Listeners (Standard)
    setupToolbar(editor);
});

function handleKey(e) {
    const forbidden = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Backspace', 'Delete'];
    
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !forbidden.includes(e.key)) {
        // --- BIOMETRIC ANALYSIS ---
        const now = Date.now();
        if (bio.lastTime) {
            const delta = now - bio.lastTime;
            // Filter crazy outliers (pauses > 2s)
            if (delta < 2000) {
                bio.intervals.push(delta);
                // Keep rolling window of last 50 keystrokes for analysis
                if (bio.intervals.length > 50) bio.intervals.shift();
                analyzeBiometrics();
            }
        }
        bio.lastTime = now;

        session.humanChars++;
        passport.totalKeystrokes++;
        chrome.storage.local.set({ passport: passport });
    }
}

function analyzeBiometrics() {
    // Need at least 10 keys to judge rhythm
    if (bio.intervals.length < 10) return;

    // 1. Calculate Mean (Average Speed)
    const sum = bio.intervals.reduce((a, b) => a + b, 0);
    const mean = sum / bio.intervals.length;

    // 2. Calculate Variance & Standard Deviation (Rhythm Chaos)
    const squareDiffs = bio.intervals.map(val => Math.pow(val - mean, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
    const stdDev = Math.sqrt(avgSquareDiff);

    // 3. Bot Detection Logic
    // Humans typically have StdDev > 20ms. Scripts are usually < 5ms.
    // Superhuman speed: Mean < 40ms (approx 1500 CPM)
    
    if (stdDev < 10 || mean < 40) {
        bio.isBot = true;
        bio.entropy = 0; // Mechanical
    } else {
        bio.isBot = false;
        // Normalize entropy: 0-100 based on StdDev (Cap at 100)
        bio.entropy = Math.min(Math.round(stdDev), 100);
    }
}

function handlePaste(e) {
    let len = 0;
    if (e.clipboardData) {
        try { len = e.clipboardData.getData('text').length; } catch (err) {}
    }
    if (len > 0) session.alienChars += len;
}

function updateDashboard() {
    const editor = document.getElementById('editor');
    const text = editor.innerText;
    
    const sessionTotal = session.humanChars + session.alienChars;
    let purity = 100;
    
    if (sessionTotal > 0) purity = Math.round((session.humanChars / sessionTotal) * 100);

    // --- BIOMETRIC PENALTY ---
    // If flagged as a bot, Purity crashes to 0
    if (bio.isBot) purity = 0;

    const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;

    document.getElementById('word-count').innerText = words.toLocaleString();
    
    const pEl = document.getElementById('purity-display');
    pEl.innerText = `${purity}%`;
    
    // Visual Alert for Bot Detection
    if (bio.isBot) {
        pEl.style.color = '#FF0000';
        pEl.innerText = "BOT DETECTED";
        pEl.style.fontSize = "14px";
    } else if (purity < 80) {
        pEl.style.color = '#FF0055';
    } else {
        pEl.style.color = '#00F0FF';
    }
}

function resetSession() {
    if(confirm("Clear document and stats?")) {
        session = { humanChars: 0, alienChars: 0, startTime: Date.now() };
        bio.intervals = []; bio.lastTime = null; bio.isBot = false;
        document.getElementById('editor').innerHTML = '';
        updateDashboard();
    }
}

function exportBadge() {
    if (bio.isBot) {
        alert("Verification Failed: Synthetic Typing Patterns Detected.");
        return;
    }
    
    const editor = document.getElementById('editor');
    const textLength = editor.innerText.length;
    const date = new Date().toLocaleDateString();

    const sessionTotal = session.humanChars + session.alienChars;
    const purity = sessionTotal > 0 ? Math.round((session.humanChars / sessionTotal) * 100) : 100;
    
    let integrity = 100;
    if (textLength > 0) integrity = Math.round((session.humanChars / textLength) * 100);
    if (integrity > 100) integrity = 100;

    const payload = { type: 'project', title: 'Jitter Writer Doc', purity: purity, integrity: integrity, keys: session.humanChars, pastes: session.alienChars, entropy: bio.entropy, date: date };
    const base64 = btoa(JSON.stringify(payload));
    const blockID = base64.slice(-6).toUpperCase();
    
    const url = `#jitter:${base64}`;
    const htmlBadge = `<a href="${url}" style="text-decoration:none;" data-jitter-payload="${base64}"><span style="background:#00F0FF11;color:#00F0FF;border:1px solid #00F0FF;padding:2px 6px;font-size:10px;font-family:monospace;border-radius:4px;">⚡ JITTER: 0x${blockID}</span></a>`;
    const plainBadge = `\n\n[ JITTER-BLOCK: 0x${blockID} | INTEGRITY: ${integrity}% | ENTROPY: ${bio.entropy} ]`;

    const data = [new ClipboardItem({ 'text/html': new Blob([htmlBadge], {type:'text/html'}), 'text/plain': new Blob([plainBadge], {type:'text/plain'}) })];

    navigator.clipboard.write(data).then(() => {
        const btn = document.getElementById('btn-export');
        const old = btn.innerText;
        btn.innerText = "COPIED!";
        setTimeout(() => btn.innerText = old, 2000);
    });
}

// Helper for setup
function setupToolbar(editor) {
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { e.preventDefault(); document.execCommand(btn.dataset.cmd, false, btn.dataset.val || null); editor.focus(); });
    });
    document.getElementById('font-select').addEventListener('change', (e) => { editor.className = editor.className.replace(/font-\w+/, '') + ' ' + e.target.value; });
    document.getElementById('spacing-select').addEventListener('change', (e) => { editor.className = editor.className.replace(/spacing-\w+/, '') + ' ' + e.target.value; });
}