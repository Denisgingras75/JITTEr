// writer.js - JITTER PROTOCOL v7.1

let passport = { totalKeystrokes: 0, level: "Novice" };
let session = { humanChars: 0, alienChars: 0, startTime: Date.now() };

document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['passport'], (result) => {
        if (result.passport) passport = result.passport;
        updateDashboard();
    });

    const editor = document.getElementById('editor');
    editor.focus();

    // Listeners
    editor.addEventListener('keydown', handleKey);
    editor.addEventListener('paste', handlePaste);
    editor.addEventListener('input', updateDashboard);
    
    document.getElementById('btn-export').addEventListener('click', exportBadge);
    document.getElementById('btn-reset').addEventListener('click', resetSession);

    // Toolbar: Formatting Buttons
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const cmd = btn.dataset.cmd;
            const val = btn.dataset.val || null;
            document.execCommand(cmd, false, val);
            editor.focus();
        });
    });

    // Toolbar: Fonts & Spacing
    const fontSelect = document.getElementById('font-select');
    const spaceSelect = document.getElementById('spacing-select');

    fontSelect.addEventListener('change', () => {
        editor.classList.remove('font-classic', 'font-modern', 'font-code');
        editor.classList.add(fontSelect.value);
    });

    spaceSelect.addEventListener('change', () => {
        editor.classList.remove('spacing-1', 'spacing-15', 'spacing-2');
        editor.classList.add(spaceSelect.value);
    });
});

function handleKey(e) {
    const forbidden = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Backspace', 'Delete'];
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !forbidden.includes(e.key)) {
        session.humanChars++;
        passport.totalKeystrokes++;
        chrome.storage.local.set({ passport: passport });
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
    
    // Stats
    const sessionTotal = session.humanChars + session.alienChars;
    let purity = 100;
    if (sessionTotal > 0) purity = Math.round((session.humanChars / sessionTotal) * 100);

    // Word Count
    const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;

    // UI
    document.getElementById('word-count').innerText = words.toLocaleString();
    const pEl = document.getElementById('purity-display');
    pEl.innerText = `${purity}%`;
    pEl.style.color = purity < 80 ? '#FF0055' : '#00F0FF';
}

function resetSession() {
    if(confirm("Clear document and stats?")) {
        session = { humanChars: 0, alienChars: 0, startTime: Date.now() };
        document.getElementById('editor').innerHTML = '';
        updateDashboard();
    }
}

function exportBadge() {
    const editor = document.getElementById('editor');
    const textLength = editor.innerText.length;
    const date = new Date().toLocaleDateString();

    const sessionTotal = session.humanChars + session.alienChars;
    const purity = sessionTotal > 0 ? Math.round((session.humanChars / sessionTotal) * 100) : 100;
    
    let integrity = 100;
    if (textLength > 0) integrity = Math.round((session.humanChars / textLength) * 100);
    if (integrity > 100) integrity = 100;

    const payload = { type: 'project', title: 'Jitter Writer Doc', purity: purity, integrity: integrity, keys: session.humanChars, pastes: session.alienChars, date: date };
    const base64 = btoa(JSON.stringify(payload));
    const blockID = base64.slice(-6).toUpperCase();
    
    const plainBadge = `\n\n[ JITTER-BLOCK: 0x${blockID} | INTEGRITY: ${integrity}% ]`;
    const htmlBadge = `<br><br><span style="background:#00F0FF11; color:#00F0FF; border:1px solid #00F0FF; padding:4px 8px; font-family:monospace;">⚡ JITTER: 0x${blockID}</span>`;

    const data = [new ClipboardItem({ 'text/html': new Blob([htmlBadge], {type:'text/html'}), 'text/plain': new Blob([plainBadge], {type:'text/plain'}) })];

    navigator.clipboard.write(data).then(() => {
        const btn = document.getElementById('btn-export');
        const old = btn.innerText;
        btn.innerText = "COPIED!";
        setTimeout(() => btn.innerText = old, 2000);
    });
}