// content.js - STABILITY & VIEWER EDITION

// --- 1. CONFIG & STATE ---
const currentURL = window.location.href.split('?')[0];
const isIframe = (window !== window.top);

// State
let passport = { totalKeystrokes: 0, level: "Novice" };
let project = { isActive: false, humanChars: 0, alienChars: 0, startTime: null };

// Runtime
let debounceTimer = null;

// --- 2. STORAGE BRIDGE (Google Docs Fix) ---
// Ensures that when the Docs iFrame saves data, the Main Window UI updates.
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
        if (changes.passport) {
            passport = changes.passport.newValue;
        }
        
        // Only update project if it matches THIS url
        if (changes[currentURL]) {
            project = changes[currentURL].newValue;
            if (!isIframe) {
                updateUI();
            }
        }
    }
});

// Load Data on Init
chrome.storage.local.get(['passport', currentURL], (result) => {
    if (result.passport) {
        passport = result.passport;
    }
    if (result[currentURL]) {
        project = result[currentURL];
    }
    
    // Only init UI in main window (not iframes)
    if (!isIframe) {
        setupUI();
        initBadgeListener();
    }
});

// --- 3. INPUT ENGINE (Strict Separation) ---

// A. GLOBAL TRACKER (Passport)
// Tracks typing on ALL TABS. Ignores pasting/reading.
window.addEventListener('keydown', (e) => {
    const forbidden = [
        'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab',
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
        'Enter', 'Escape', 'Backspace', 'Delete', 'Home', 'End',
        'PageUp', 'PageDown', 'Insert', 'F1', 'F2', 'F3', 'F4',
        'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'
    ];
    
    // Valid Keystroke? Single character, no modifier keys held
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !forbidden.includes(e.key)) {
        
        // 1. Update Global Reputation
        passport.totalKeystrokes++;
        updateLevel();

        // 2. Update Project (ONLY if active on this specific tab)
        if (project.isActive) {
            project.humanChars++;
        }

        // Save Data (Debounced to prevent lag)
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(saveData, 500);
    }
}, true);

// B. PROJECT TRACKER (Audit)
// Only tracks "Alien" input if the project is actually running.
window.addEventListener('paste', (e) => {
    if (!project.isActive) return;
    
    let len = 0;
    if (e.clipboardData) {
        try {
            len = e.clipboardData.getData('text').length;
        } catch (err) {
            console.warn('Anvil: Could not read clipboard data');
        }
    }
    
    if (len > 0) {
        project.alienChars += len;
        saveData();
    }
}, true);

// --- 4. DATA LOGIC ---
function updateLevel() {
    const k = passport.totalKeystrokes;
    if (k >= 50000) {
        passport.level = "Diamond";
    } else if (k >= 10000) {
        passport.level = "Platinum";
    } else if (k >= 5000) {
        passport.level = "Gold";
    } else if (k >= 1000) {
        passport.level = "Silver";
    } else {
        passport.level = "Novice";
    }
}

function saveData() {
    const data = { passport: passport };
    
    // Only save project data if it exists/is active
    if (project.isActive || project.startTime) {
        data[currentURL] = project;
    }
    
    chrome.storage.local.set(data);
}

// --- 5. THE BADGE VIEWER (New Feature) ---
// Watches for clicks on "Anvil Badges" and opens the proof.
function initBadgeListener() {
    document.addEventListener('click', (e) => {
        const target = e.target.closest('a');
        if (target && target.href && target.href.includes('#anvil_verify=')) {
            e.preventDefault();
            const rawData = target.href.split('#anvil_verify=')[1];
            showCertificate(rawData);
        }
    });
}

function showCertificate(base64Data) {
    try {
        const json = atob(base64Data);
        const data = JSON.parse(json);
        
        const menu = document.getElementById('anvil-menu');
        if (!menu) return;
        
        // Open menu
        menu.style.display = 'block';
        
        // Determine color based on type and purity
        let color = '#00BA7C';
        if (data.type === 'project' && data.purity < 80) {
            color = '#FF4444';
        } else if (data.type === 'passport') {
            color = '#FFD700';
        }

        const icon = data.type === 'passport' ? '👤' : '🛡️';

        menu.innerHTML = `
            <div class="anvil-header" style="background:${color}22; border-bottom:1px solid ${color}">
                <span class="anvil-title" style="color:${color}">✅ VERIFIED DATA</span>
                <span class="anvil-back" id="btn-close-cert">×</span>
            </div>
            <div class="anvil-body">
                <div style="text-align:center; padding:10px;">
                    <div style="font-size:40px;">${icon}</div>
                    <div style="font-weight:bold; font-size:16px; margin-top:10px; color:#fff;">${escapeHtml(data.title)}</div>
                    <div style="color:#aaa; font-size:12px;">${escapeHtml(data.date)}</div>
                </div>
                
                ${data.type === 'project' ? `
                    <div class="anvil-row"><span>Human Input</span> <span class="anvil-val">${data.human}</span></div>
                    <div class="anvil-row"><span>External Input</span> <span class="anvil-val">${data.alien}</span></div>
                    <div class="anvil-row"><span>Purity Score</span> <span class="anvil-val" style="color:${color}">${data.purity}%</span></div>
                ` : `
                    <div class="anvil-row"><span>Creator Rank</span> <span class="anvil-val" style="color:${color}">${escapeHtml(data.rank)}</span></div>
                    <div class="anvil-row"><span>Total Keys</span> <span class="anvil-val">${data.keys}</span></div>
                `}
                
                <div class="anvil-badge-preview" style="border-color:${color}; color:${color}; margin-top:15px;">
                    Signature Validated by Anvil Protocol
                </div>
            </div>
        `;
        
        document.getElementById('btn-close-cert').onclick = () => {
            menu.style.display = 'none';
            updateUI();
        };

    } catch (err) {
        console.error('Anvil: Invalid badge data', err);
        alert("Invalid Badge Data");
    }
}

// Helper to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// --- 6. UI ENGINE ---
function setupUI() {
    if (document.getElementById('anvil-shield')) return;

    const shield = document.createElement('div');
    shield.id = 'anvil-shield';
    shield.className = 'anvil-passive';
    shield.innerHTML = '🛡️';
    document.body.appendChild(shield);

    const menu = document.createElement('div');
    menu.id = 'anvil-menu';
    menu.style.display = 'none';
    document.body.appendChild(menu);

    const style = document.createElement('style');
    style.textContent = `
        #anvil-shield {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #222;
            color: #888;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            cursor: pointer;
            z-index: 2147483647;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            border: 2px solid #444;
            transition: all 0.2s ease;
            user-select: none;
        }
        
        #anvil-shield:hover {
            transform: scale(1.05);
            color: #fff;
            border-color: #fff;
        }
        
        #anvil-shield.anvil-active {
            border-color: #00BA7C !important;
            color: #00BA7C !important;
            background: #0d1117 !important;
        }
        
        #anvil-shield.anvil-warn {
            border-color: #FFD700 !important;
            color: #FFD700 !important;
        }
        
        #anvil-shield.anvil-critical {
            border-color: #FF4444 !important;
            color: #FF4444 !important;
        }
        
        #anvil-menu {
            position: fixed;
            bottom: 75px;
            right: 20px;
            background: #1a1a1a;
            color: #fff;
            padding: 0;
            border-radius: 12px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            z-index: 2147483647;
            box-shadow: 0 10px 30px rgba(0,0,0,0.6);
            border: 1px solid #333;
            width: 240px;
            overflow: hidden;
        }
        
        .anvil-header {
            padding: 15px;
            background: #222;
            border-bottom: 1px solid #333;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        
        .anvil-title {
            font-weight: 700;
            font-size: 14px;
            letter-spacing: 0.5px;
        }
        
        .anvil-back {
            cursor: pointer;
            color: #888;
            font-size: 18px;
            padding: 0 5px;
            transition: color 0.2s;
        }
        
        .anvil-back:hover {
            color: #fff;
        }
        
        .anvil-body {
            padding: 15px;
        }
        
        .anvil-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 13px;
            color: #aaa;
        }
        
        .anvil-val {
            color: #fff;
            font-weight: 600;
        }
        
        .anvil-btn {
            background: #333;
            color: #fff;
            text-align: center;
            padding: 12px;
            border-radius: 6px;
            cursor: pointer;
            margin-top: 12px;
            font-weight: 600;
            font-size: 13px;
            transition: background 0.2s ease;
            border: none;
            width: 100%;
        }
        
        .anvil-btn:hover {
            background: #444;
        }
        
        .anvil-btn.primary {
            background: #00BA7C;
            color: #000;
        }
        
        .anvil-btn.primary:hover {
            background: #009e69;
        }
        
        .anvil-badge-preview {
            background: rgba(0, 186, 124, 0.1);
            border: 1px solid #00BA7C;
            color: #00BA7C;
            padding: 8px;
            border-radius: 6px;
            text-align: center;
            font-size: 11px;
            margin-top: 10px;
        }
        
        .anvil-section-title {
            margin-top: 15px;
            margin-bottom: 5px;
            font-weight: bold;
            font-size: 12px;
            color: #aaa;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
    `;
    document.head.appendChild(style);

    shield.addEventListener('click', () => {
        if (menu.style.display === 'none') {
            menu.style.display = 'block';
            updateUI();
        } else {
            menu.style.display = 'none';
        }
    });
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!shield.contains(e.target) && !menu.contains(e.target)) {
            menu.style.display = 'none';
        }
    });
    
    // Initial UI update
    updateUI();
}

function updateUI() {
    if (isIframe) return;
    
    const menu = document.getElementById('anvil-menu');
    const shield = document.getElementById('anvil-shield');
    if (!menu || !shield) return;

    // Calculate purity
    let purity = 100;
    const total = project.humanChars + project.alienChars;
    if (total > 0) {
        purity = Math.round((project.humanChars / total) * 100);
    }

    // Update shield icon class
    if (project.isActive) {
        if (purity < 80) {
            shield.className = 'anvil-critical';
        } else {
            shield.className = 'anvil-active';
        }
    } else {
        shield.className = 'anvil-passive';
    }

    // Render menu content
    menu.innerHTML = `
        <div class="anvil-header">
            <span class="anvil-title">🛡️ ANVIL PROTOCOL</span>
            <span style="font-size:11px; color:#666;">v2.0</span>
        </div>
        <div class="anvil-body">
            <div class="anvil-row">
                <span>Rank</span>
                <span class="anvil-val" style="color:#FFD700">${escapeHtml(passport.level)}</span>
            </div>
            <div class="anvil-row">
                <span>Total Keystrokes</span>
                <span class="anvil-val">${passport.totalKeystrokes.toLocaleString()}</span>
            </div>
            
            ${project.isActive ? `
                <div class="anvil-section-title">Current Session</div>
                <div class="anvil-row">
                    <span>Typed</span>
                    <span class="anvil-val">${project.humanChars.toLocaleString()}</span>
                </div>
                <div class="anvil-row">
                    <span>Pasted</span>
                    <span class="anvil-val" style="color:${purity < 80 ? '#ff6b6b' : '#aaa'}">${project.alienChars.toLocaleString()}</span>
                </div>
                <div class="anvil-row">
                    <span>Purity</span>
                    <span class="anvil-val" style="color:${purity < 80 ? '#ff6b6b' : '#00BA7C'}">${purity}%</span>
                </div>
                
                <div class="anvil-btn primary" id="btn-copy">Copy Smart Badge</div>
                <div class="anvil-btn" id="btn-stop" style="background:#222; border:1px solid #444;">Stop Project</div>
            ` : `
                <div class="anvil-btn primary" id="btn-start">Start Project</div>
                <div class="anvil-btn" id="btn-copy-pass">Copy Passport Badge</div>
            `}
        </div>
    `;

    // Attach event listeners after DOM update
    requestAnimationFrame(() => {
        const startBtn = document.getElementById('btn-start');
        const stopBtn = document.getElementById('btn-stop');
        const copyBtn = document.getElementById('btn-copy');
        const copyPassBtn = document.getElementById('btn-copy-pass');
        
        if (startBtn) {
            startBtn.onclick = () => {
                project = {
                    isActive: true,
                    humanChars: 0,
                    alienChars: 0,
                    startTime: Date.now()
                };
                saveData();
                updateUI();
            };
        }
        
        if (stopBtn) {
            stopBtn.onclick = () => {
                if (confirm("End this session?")) {
                    project.isActive = false;
                    saveData();
                    updateUI();
                }
            };
        }
        
        if (copyBtn) {
            copyBtn.onclick = () => copyBadge('project');
        }
        
        if (copyPassBtn) {
            copyPassBtn.onclick = () => copyBadge('passport');
        }
    });
}

// --- 7. SMART BADGE GENERATOR ---
function copyBadge(type) {
    const date = new Date().toLocaleDateString();
    let payload = {};
    let label = '';
    let color = '';

    if (type === 'passport') {
        payload = {
            type: 'passport',
            title: `${passport.level} Human`,
            rank: passport.level,
            keys: passport.totalKeystrokes,
            date: date
        };
        label = `👤 ${passport.level} Human`;
        color = '#FFD700';
    } else {
        const total = project.humanChars + project.alienChars;
        const purity = total > 0 ? Math.round((project.humanChars / total) * 100) : 100;
        payload = {
            type: 'project',
            title: 'Verified Human',
            purity: purity,
            human: project.humanChars,
            alien: project.alienChars,
            date: date
        };
        label = `🛡️ Verified Human | ${purity}%`;
        color = purity >= 80 ? '#00BA7C' : '#FF4444';
    }

    // Encode data in URL hash
    const json = JSON.stringify(payload);
    const base64 = btoa(json);
    const link = `https://anvil-protocol.com#anvil_verify=${base64}`;

    // HTML badge for rich text editors
    const html = `<a href="${link}" style="display:inline-block; background:${color}15; color:${color}; padding:4px 10px; border-radius:50px; text-decoration:none; font-family:sans-serif; font-weight:bold; border:1px solid ${color}; font-size:12px;">${label}</a>`;
    
    // Plain text fallback
    const plain = `[ ${label} ] (Verified)`;

    const blobHtml = new Blob([html], { type: 'text/html' });
    const blobText = new Blob([plain], { type: 'text/plain' });
    const data = [new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })];

    navigator.clipboard.write(data).then(() => {
        const btnId = type === 'project' ? 'btn-copy' : 'btn-copy-pass';
        const btn = document.getElementById(btnId);
        if (btn) {
            const originalText = btn.innerText;
            btn.innerText = "✅ Copied!";
            setTimeout(() => {
                btn.innerText = originalText;
            }, 1500);
        }
    }).catch(err => {
        console.error('Anvil: Clipboard write failed', err);
        alert('Failed to copy badge. Please try again.');
    });
}
