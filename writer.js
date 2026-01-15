// writer.js - JITTER PROTOCOL v1.1

let passport = { totalKeystrokes: 0, level: "Novice" };
let session = { humanChars: 0, alienChars: 0, startTime: Date.now() };

document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['passport'], (result) => {
        if (result.passport) {
            passport = result.passport;
            updateDashboard();
        }
    });

    const editor = document.getElementById('editor');
    editor.focus();

    editor.addEventListener('keydown', handleKey);
    editor.addEventListener('paste', handlePaste);
    editor.addEventListener('input', updateDashboard); // Update on any change
    
    document.getElementById('btn-export').addEventListener('click', exportBadge);
    document.getElementById('btn-reset').addEventListener('click', resetSession);
});

function handleKey(e) {
    const forbidden = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Backspace', 'Delete'];
    
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !forbidden.includes(e.key)) {
        session.humanChars++;
        passport.totalKeystrokes++;
        chrome.storage.local.set({ passport: passport });
        // Don't call updateDashboard here, 'input' event handles it
    }
}

function handlePaste(e) {
    let len = 0;
    if (e.clipboardData) {
        try { len = e.clipboardData.getData('text').length; } catch (err) {}
    }
    if (len > 0) {
        session.alienChars += len;
    }
}

function updateDashboard() {
    const editor = document.getElementById('editor');
    const totalText = editor.innerText.length;
    
    // Calculate Purity (Action based)
    const sessionTotal = session.humanChars + session.alienChars;
    let purity = 100;
    if (sessionTotal > 0) {
        purity = Math.round((session.humanChars / sessionTotal) * 100);
    }

    // Update UI
    document.getElementById('total-display').innerText = totalText.toLocaleString();
    document.getElementById('purity-display').innerText = `${purity}%`;
    document.getElementById('human-count').innerText = session.humanChars.toLocaleString();
    document.getElementById('alien-count').innerText = session.alienChars.toLocaleString();
    
    const purityEl = document.getElementById('purity-display');
    if (purity < 80) purityEl.style.color = '#FF0055';
    else purityEl.style.color = '#00F0FF';
}

function resetSession() {
    if(confirm("Reset current session stats?")) {
        session = { humanChars: 0, alienChars: 0, startTime: Date.now() };
        document.getElementById('editor').innerText = '';
        updateDashboard();
    }
}

function exportBadge() {
    const editor = document.getElementById('editor');
    const textLength = editor.innerText.length;
    const date = new Date().toLocaleDateString();

    const sessionTotal = session.humanChars + session.alienChars;
    const purity = sessionTotal > 0 ? Math.round((session.humanChars / sessionTotal) * 100) : 100;

    // Integrity: Typed vs Total on Screen
    let integrity = 100;
    if (textLength > 0) {
        integrity = Math.round((session.humanChars / textLength) * 100);
        if (integrity > 100) integrity = 100;
    }

    const payload = { 
        type: 'project', 
        title: 'Verified Writer Session', 
        purity: purity, 
        integrity: integrity,
        keys: session.humanChars, 
        pastes: session.alienChars,
        date: date
    };

    const json = JSON.stringify(payload);
    const base64 = btoa(json);
    const blockID = base64.substring(base64.length - 6, base64.length).toUpperCase();

    const isClean = integrity >= 80;
    const color = isClean ? '#00F0FF' : '#FF0055';
    const bgColor = isClean ? '#00F0FF11' : '#FF005511';
    
    const label = `JITTER: 0x${blockID} • ${integrity}% INT`;
    const safeUrl = `#jitter:${base64}`;

    const htmlBadge = `
    <a href="${safeUrl}" style="text-decoration: none; cursor: pointer; display: inline-block;" data-jitter-payload="${base64}">
        <span style="display: inline-block; font-family: 'Courier New', Courier, monospace; font-size: 10px; letter-spacing: 1px; background-color: ${bgColor}; color: ${color}; border: 1px solid ${color}44; padding: 3px 8px; border-radius: 4px; opacity: 0.9; user-select: all;" title="Jitter Protocol | ${label}">
            ⚡ ${label}
        </span>
    </a><br><br>`.replace(/\s+/g, ' ');

    const plainBadge = `\n\n[ JITTER-BLOCK: 0x${blockID} | INTEGRITY: ${integrity}% ]`;

    const blobHtml = new Blob([htmlBadge], { type: 'text/html' });
    const blobText = new Blob([plainBadge], { type: 'text/plain' });
    const data = [new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })];

    navigator.clipboard.write(data).then(() => {
        const btn = document.getElementById('btn-export');
        const oldText = btn.innerText;
        btn.innerText = "MINTED!";
        setTimeout(() => btn.innerText = oldText, 2000);
    });
}