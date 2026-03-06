// writer.js - THE CLEAN ROOM LOGIC

// STATE
let session = {
    humanChars: 0,
    alienChars: 0,
    flightTimes: [],
    startTime: Date.now(),
    lastPress: 0
};

// DOM ELEMENTS
const editor = document.getElementById('editor');
const purityDisplay = document.getElementById('purity-display');
const humanCount = document.getElementById('human-count');
const alienCount = document.getElementById('alien-count');
const jitterDisplay = document.getElementById('jitter-display');
const statusText = document.getElementById('status-text');
const shieldIcon = document.getElementById('shield-icon');

// --- 1. TYPING TRACKER ---
editor.addEventListener('keydown', (e) => {
    const now = performance.now();
    const forbidden = [
        'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab',
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
        'Enter', 'Backspace', 'Delete', 'Escape', 'Home', 'End',
        'PageUp', 'PageDown', 'Insert'
    ];

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !forbidden.includes(e.key)) {
        session.humanChars++;
        
        // Flight Time (Jitter) - time between key presses
        if (session.lastPress > 0) {
            const flight = now - session.lastPress;
            // Only track reasonable flight times (20ms - 2s)
            if (flight > 20 && flight < 2000) {
                session.flightTimes.push(flight);
            }
        }
        session.lastPress = now;
        
        updateUI();
    }
});

// --- 2. PASTE TRACKER ---
editor.addEventListener('paste', (e) => {
    e.preventDefault(); // Stop default paste to strip formatting
    
    let text = "";
    if (e.clipboardData) {
        text = e.clipboardData.getData('text/plain');
    }
    
    // Insert text manually at cursor position
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    }
    
    // Log it as ALIEN
    if (text.length > 0) {
        session.alienChars += text.length;
        updateUI();
    }
});

// --- 3. UI UPDATER ---
function updateUI() {
    // Calculate purity percentage
    const total = session.humanChars + session.alienChars;
    let purity = 100;
    if (total > 0) {
        purity = Math.round((session.humanChars / total) * 100);
    }
    
    // Calculate jitter (standard deviation of flight times)
    let jitter = "0.0000";
    if (session.flightTimes.length > 5) {
        const n = session.flightTimes.length;
        const mean = session.flightTimes.reduce((sum, val) => sum + val, 0) / n;
        const squaredDiffs = session.flightTimes.map(val => Math.pow(val - mean, 2));
        const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / n;
        const stdDev = Math.sqrt(variance);
        // Convert ms to seconds for display
        jitter = (stdDev / 1000).toFixed(4);
    }

    // Update DOM
    purityDisplay.innerText = `${purity}%`;
    humanCount.innerText = session.humanChars;
    alienCount.innerText = session.alienChars;
    jitterDisplay.innerText = `${jitter}s`;

    // Visual Status
    if (purity < 80) {
        statusText.innerText = "PURITY CRITICAL";
        statusText.className = "status-red";
        purityDisplay.style.color = "#FF4444";
        shieldIcon.style.filter = "grayscale(100%)";
    } else {
        statusText.innerText = "LIVE AUDIT";
        statusText.className = "status-green";
        purityDisplay.style.color = "#00BA7C";
        shieldIcon.style.filter = "none";
    }
}

// --- 4. EXPORT ---
document.getElementById('btn-export').addEventListener('click', () => {
    const text = editor.innerText;
    const total = session.humanChars + session.alienChars;
    const purity = total > 0 ? Math.round((session.humanChars / total) * 100) : 100;
    
    // Generate verification data
    const payload = {
        type: 'project',
        title: 'Verified Human',
        purity: purity,
        human: session.humanChars,
        alien: session.alienChars,
        date: new Date().toLocaleDateString()
    };
    
    const base64Data = btoa(JSON.stringify(payload));
    
    // Set colors based on purity
    let color, bgColor;
    if (purity >= 80) {
        color = '#00BA7C';
        bgColor = 'rgba(0, 186, 124, 0.15)';
    } else {
        color = '#FF4444';
        bgColor = 'rgba(255, 68, 68, 0.15)';
    }
    
    // HTML badge - styled pill/chip that works in Google Docs, Word, etc.
    const tooltipText = `Anvil Protocol Verified | Typed: ${session.humanChars} | Pasted: ${session.alienChars} | Purity: ${purity}% | Date: ${payload.date}`;
    const htmlBadge = `<span title="${tooltipText}" data-anvil-verify="${base64Data}" style="display: inline-block; background-color: ${bgColor}; color: ${color}; padding: 4px 12px; border-radius: 50px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-weight: bold; border: 1px solid ${color}; font-size: 12px; line-height: 1.4; vertical-align: middle;">🛡️ Verified Human | ${purity}% Purity</span>`;
    
    // Plain text badge (fallback for plain text editors)
    const plainBadge = `[ 🛡️ Verified Human | ${purity}% Purity ]`;

    // Combine: Badge + Double Newline + Essay
    const exportHTML = `${htmlBadge}<br><br>${text.replace(/\n/g, "<br>")}`;
    const exportText = `${plainBadge}\n\n${text}`;

    const blobHtml = new Blob([exportHTML], { type: 'text/html' });
    const blobText = new Blob([exportText], { type: 'text/plain' });
    const data = [new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })];

    navigator.clipboard.write(data).then(() => {
        alert("✅ Copied to Clipboard!\n\nYou can now paste this into Google Docs, Word, or Canvas.");
    }).catch(err => {
        console.error('Clipboard write failed:', err);
        alert("❌ Failed to copy. Please try again.");
    });
});

// --- 5. RESET ---
document.getElementById('btn-reset').addEventListener('click', () => {
    if (confirm("Clear the editor and reset all stats?")) {
        editor.innerText = "";
        session = {
            humanChars: 0,
            alienChars: 0,
            flightTimes: [],
            startTime: Date.now(),
            lastPress: 0
        };
        updateUI();
        editor.focus();
    }
});

// --- 6. BACK BUTTON ---
document.getElementById('btn-back').addEventListener('click', () => {
    if (session.humanChars > 0 || session.alienChars > 0) {
        if (confirm("You have unsaved work. Are you sure you want to go back?")) {
            window.history.back();
        }
    } else {
        window.history.back();
    }
});

// Auto-focus on load
editor.focus();
