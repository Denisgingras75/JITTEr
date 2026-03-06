// content.js - JITTER PROTOCOL v5.0 (Hologram / Local Anchor)

// --- 1. CONFIG & STATE ---
// We use a local hash fragment. The browser will NEVER try to load a new site.
const ANCHOR_PREFIX = "#jitter:";
const currentURL = window.location.href.split('?')[0];
const isIframe = (window !== window.top);

// State
let passport = { totalKeystrokes: 0, level: "Novice" };
let project = { isActive: false, humanChars: 0, alienChars: 0, startTime: null };
let debounceTimer = null;
let scannerTimer = null;

// --- 2. STORAGE BRIDGE ---
function loadData() {
    try {
        if (!chrome.runtime?.id) return;
        chrome.storage.local.get(['passport', currentURL], (result) => {
            if (result.passport) passport = result.passport;
            if (result[currentURL]) project = result[currentURL];
            if (!isIframe) {
                updateUI();
                runScanner(); 
            }
        });
    } catch (e) { console.log("Jitter: Storage load failed"); }
}

try {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            if (changes.passport) passport = changes.passport.newValue;
            if (changes[currentURL]) {
                project = changes[currentURL].newValue;
                if (!isIframe) updateUI();
            }
        }
    });
} catch (e) {}

// Initial Load
loadData();

// --- 3. THE INTERCEPTOR (Hologram Logic) ---
document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    // Check if this is a Jitter Hologram
    const href = link.getAttribute('href') || ""; // Get raw attribute
    
    if (href.startsWith(ANCHOR_PREFIX) || link.dataset.jitterPayload) {
        // STOP everything.
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // Extract Payload
        let base64 = "";
        if (href.startsWith(ANCHOR_PREFIX)) {
            base64 = href.substring(ANCHOR_PREFIX.length);
        } else {
            base64 = link.dataset.jitterPayload;
        }

        if (base64) showCertificate(base64);
        return false;
    }
}, true);

// --- 4. THE VISUAL SCANNER ---
function runScanner() {
    scanLinks();
    const observer = new MutationObserver((mutations) => {
        if (scannerTimer) clearTimeout(scannerTimer);
        scannerTimer = setTimeout(scanLinks, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

function scanLinks() {
    // Find all links that start with #jitter:
    const selector = `a[href^="${ANCHOR_PREFIX}"]`;
    const links = document.querySelectorAll(selector);

    links.forEach(link => {
        if (link.dataset.jitterProcessed) return;

        // Visuals: Electric Blue Underline
        link.style.borderBottom = "2px solid #00F0FF";
        link.style.textDecoration = "none";
        
        // Hover Logic (The "Better" part)
        link.addEventListener('mouseenter', (e) => {
            let base64 = link.getAttribute('href').substring(ANCHOR_PREFIX.length);
            if(base64) showMiniHUD(base64, e.clientX, e.clientY);
        });
        link.addEventListener('mouseleave', hideMiniHUD);

        link.dataset.jitterProcessed = "true";
    });
}

// --- 5. INPUT TRACKING ---
window.addEventListener('keydown', (e) => {
    const forbidden = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Backspace', 'Delete'];
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !forbidden.includes(e.key)) {
        passport.totalKeystrokes++;
        updateLevel();
        if (project.isActive) {
            project.humanChars++;
            if(!isIframe) updateUI(); 
        }
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(saveData, 500);
    }
}, true);

window.addEventListener('paste', (e) => {
    if (!project.isActive) return;
    let len = 0;
    if (e.clipboardData) try { len = e.clipboardData.getData('text').length; } catch (err) {}
    if (len > 0) {
        project.alienChars += len;
        saveData();
        if(!isIframe) updateUI();
    }
}, true);

function updateLevel() {
    const k = passport.totalKeystrokes;
    if (k >= 50000) passport.level = "Diamond";
    else if (k >= 10000) passport.level = "Platinum";
    else if (k >= 5000) passport.level = "Gold";
    else if (k >= 1000) passport.level = "Silver";
    else passport.level = "Novice";
}

function saveData() {
    try {
        if (!chrome.runtime?.id) return;
        const data = { passport: passport };
        if (project.isActive || project.startTime) data[currentURL] = project;
        chrome.storage.local.set(data);
    } catch (e) { /* Ignore */ }
}

// --- 6. UI COMPONENTS ---

function updateUI() {
    if (isIframe) return;
    const menu = document.getElementById('jitter-menu');
    const shield = document.getElementById('jitter-shield');
    if (!shield) { setupUI(); return; }

    let purity = 100;
    const total = project.humanChars + project.alienChars;
    if (total > 0) purity = Math.round((project.humanChars / total) * 100);

    if (project.isActive) {
        shield.className = (purity < 80) ? 'jitter-critical' : 'jitter-active';
    } else {
        shield.className = 'jitter-passive';
    }

    menu.innerHTML = `
        <div class="jitter-header">
            <span class="jitter-title">JITTER PROTOCOL</span>
            <span class="jitter-close" id="btn-close-menu">×</span>
        </div>
        <div class="jitter-body">
            <div class="jitter-row"><span>Rank</span><span class="jitter-val" style="color:#FFD700">${passport.level}</span></div>
            <div class="jitter-row"><span>Total Keys</span><span class="jitter-val">${passport.totalKeystrokes.toLocaleString()}</span></div>
            ${project.isActive ? `
                <div class="jitter-section-title">Session Active</div>
                <div class="jitter-row"><span>Typed</span><span class="jitter-val">${project.humanChars.toLocaleString()}</span></div>
                <div class="jitter-row"><span>Pasted</span><span class="jitter-val" style="color:${purity < 80 ? '#FF0055' : '#aaa'}">${project.alienChars.toLocaleString()}</span></div>
                <div class="jitter-row"><span>Purity</span><span class="jitter-val" style="color:${purity < 80 ? '#FF0055' : '#00F0FF'}">${purity}%</span></div>
                <div class="jitter-btn primary" id="btn-copy">MINT BADGE</div>
                <div class="jitter-btn" id="btn-stop">STOP SESSION</div>
            ` : `
                <div class="jitter-btn primary" id="btn-start">START SESSION</div>
            `}
            <div class="jitter-btn" id="btn-open-writer" style="margin-top:8px; border:none; color:#666;">OPEN WRITER</div>
        </div>
    `;
    
    bindButtons(purity);
}

function bindButtons(purity) {
    const start = document.getElementById('btn-start');
    const stop = document.getElementById('btn-stop');
    const copy = document.getElementById('btn-copy');
    const close = document.getElementById('btn-close-menu');
    const writer = document.getElementById('btn-open-writer');
    const menu = document.getElementById('jitter-menu');

    if (close) close.onclick = () => { menu.style.display = 'none'; };
    if (writer) writer.onclick = () => { try { chrome.runtime.sendMessage({ action: 'openWriter' }); } catch(e){ alert("Reload Page"); } };
    
    if (start) start.onclick = () => { 
        project = { isActive: true, humanChars: 0, alienChars: 0, startTime: Date.now() }; 
        saveData(); updateUI(); 
    };
    
    if (stop) stop.onclick = () => { 
        if (confirm("End Session?")) { project.isActive = false; saveData(); updateUI(); } 
    };
    
    if (copy) copy.onclick = () => copyBadge(purity);
}

// --- 7. VISUALS (HUD & CERT) ---

function showMiniHUD(base64, x, y) {
    try {
        const json = atob(base64);
        const data = JSON.parse(json);
        hideMiniHUD(); 

        const hud = document.createElement('div');
        hud.id = 'jitter-hud';
        
        let color = '#00F0FF'; 
        let status = 'VERIFIED';
        if (data.type === 'project' && data.purity < 80) { color = '#FF0055'; status = 'CRITICAL'; }
        else if (data.type === 'passport') { color = '#FFD700'; status = 'PASSPORT'; }

        hud.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <div style="font-size:20px;">⚡</div>
                <div>
                    <div style="font-weight:800; font-size:12px; color:${color}; letter-spacing:1px;">${status}</div>
                    <div style="font-size:11px; color:#aaa;">${data.date}</div>
                </div>
            </div>
            ${data.type === 'project' ? `
            <div style="margin-top:8px; display:flex; justify-content:space-between; font-size:12px;">
                <span style="color:#888;">Purity</span>
                <span style="color:#fff; font-weight:bold;">${data.purity}%</span>
            </div>
            <div style="width:100%; background:#222; height:4px; border-radius:2px; margin-top:4px; overflow:hidden;">
                <div style="width:${data.purity}%; background:${color}; height:100%; box-shadow: 0 0 8px ${color};"></div>
            </div>` : ''}
        `;

        hud.style.cssText = `position: fixed; z-index: 2147483647; background: #050505; border: 1px solid ${color}; border-radius: 8px; padding: 12px; width: 180px; box-shadow: 0 0 20px ${color}44; font-family: 'Courier New', monospace; pointer-events: none; opacity: 0; transition: opacity 0.2s ease; top: ${y + 20}px; left: ${x}px;`;

        if (x > window.innerWidth - 200) hud.style.left = (x - 200) + 'px';
        if (y > window.innerHeight - 150) hud.style.top = (y - 150) + 'px';

        document.body.appendChild(hud);
        requestAnimationFrame(() => hud.style.opacity = '1');
    } catch (e) {}
}

function hideMiniHUD() {
    const hud = document.getElementById('jitter-hud');
    if (hud) hud.remove();
}

function showCertificate(base64) {
    try {
        const json = atob(base64);
        const data = JSON.parse(json);
        const menu = document.getElementById('jitter-menu');
        menu.style.display = 'block';
        
        let color = '#00F0FF';
        if (data.type === 'project' && data.purity < 80) color = '#FF0055';
        else if (data.type === 'passport') color = '#FFD700';
        const icon = data.type === 'passport' ? '👤' : '⚡';

        menu.innerHTML = `
            <div class="jitter-header" style="background:${color}11; border-bottom:1px solid ${color}">
                <span class="jitter-title" style="color:${color}; text-shadow:0 0 10px ${color}66;">JITTER PROTOCOL</span>
                <span class="jitter-back" id="btn-close-cert">×</span>
            </div>
            <div class="jitter-body">
                <div style="text-align:center; padding:10px;">
                    <div style="font-size:40px; filter: drop-shadow(0 0 5px ${color});">${icon}</div>
                    <div style="font-weight:bold; font-size:16px; margin-top:10px; color:#fff;">${data.title}</div>
                    <div style="color:#aaa; font-size:12px;">${data.date}</div>
                </div>
                ${data.type === 'project' ? `
                    <div class="jitter-row"><span>Human Input</span> <span class="jitter-val">${data.human}</span></div>
                    <div class="jitter-row"><span>Alien Input</span> <span class="jitter-val">${data.alien}</span></div>
                    <div class="jitter-row"><span>Purity Score</span> <span class="jitter-val" style="color:${color}">${data.purity}%</span></div>
                ` : `
                    <div class="jitter-row"><span>Rank</span> <span class="jitter-val" style="color:${color}">${data.rank}</span></div>
                    <div class="jitter-row"><span>Total Keys</span> <span class="jitter-val">${data.keys}</span></div>
                `}
                <div class="jitter-badge-preview" style="border-color:${color}; color:${color}; margin-top:15px; background:${color}11;">Signature Validated</div>
            </div>
        `;
        document.getElementById('btn-close-cert').onclick = () => { menu.style.display = 'none'; updateUI(); };
    } catch(e) {}
}

// 8. GENERATOR (The Fix: No URL, Just Hash)
function copyBadge(purity) {
    const date = new Date().toLocaleDateString();
    
    const payload = { type: 'project', title: 'Verified Session', purity: purity, human: project.humanChars, alien: project.alienChars, date: date };
    const json = JSON.stringify(payload);
    const base64 = btoa(json);
    
    const isClean = purity >= 80;
    const color = isClean ? '#00F0FF' : '#FF0055';
    const bgColor = isClean ? '#00F0FF11' : '#FF005511';

    const blockID = base64.substring(base64.length - 6, base64.length).toUpperCase();
    const watermarkLabel = `JITTER: 0x${blockID} • ${purity}%`;

    // THE FIX: Use Local Anchor + Raw Base64
    // This looks like a link, but it stays on the page.
    const safeUrl = `${ANCHOR_PREFIX}${base64}`;

    const htmlBadge = `
    <a href="${safeUrl}" style="text-decoration: none; cursor: pointer; display: inline-block;" data-jitter-payload="${base64}">
        <span style="display: inline-block; font-family: 'Courier New', Courier, monospace; font-size: 10px; letter-spacing: 1px; background-color: ${bgColor}; color: ${color}; border: 1px solid ${color}44; padding: 3px 8px; border-radius: 4px; opacity: 0.9; user-select: all;" title="Jitter Protocol Verified | Block: ${blockID}">
            ⚡ ${watermarkLabel}
        </span>
    </a>`.replace(/\s+/g, ' ');

    const plainBadge = `[ JITTER-BLOCK: 0x${blockID} | PURITY: ${purity}% ]`;
    
    const blobHtml = new Blob([htmlBadge], { type: 'text/html' });
    const blobText = new Blob([plainBadge], { type: 'text/plain' });
    const data = [new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })];

    navigator.clipboard.write(data).then(() => {
        const btn = document.getElementById('btn-copy');
        if (btn) { btn.innerText = "MINTED!"; setTimeout(() => { btn.innerText = "MINT BADGE"; }, 1500); }
    }).catch(err => alert('Clipboard permission denied'));
}

// --- 9. INITIAL SETUP ---
function setupUI() {
    if (document.getElementById('jitter-shield')) return;
    
    const shield = document.createElement('div');
    shield.id = 'jitter-shield';
    shield.className = 'jitter-passive';
    shield.innerHTML = '⚡';
    document.body.appendChild(shield);

    const menu = document.createElement('div');
    menu.id = 'jitter-menu';
    menu.style.display = 'none';
    document.body.appendChild(menu);
    
    const style = document.createElement('style');
    style.textContent = `
        #jitter-shield { position: fixed; bottom: 20px; right: 20px; background: #000; color: #444; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; cursor: pointer; z-index: 2147483647; box-shadow: 0 0 10px rgba(0,0,0,0.5); border: 2px solid #333; transition: all 0.2s ease; user-select: none; }
        #jitter-shield:hover { transform: scale(1.05); color: #fff; border-color: #fff; box-shadow: 0 0 15px #ffffff44; }
        #jitter-shield.jitter-active { border-color: #00F0FF !important; color: #00F0FF !important; box-shadow: 0 0 15px #00F0FF66 !important; }
        #jitter-shield.jitter-critical { border-color: #FF0055 !important; color: #FF0055 !important; box-shadow: 0 0 15px #FF005566 !important; }
        #jitter-menu { position: fixed; bottom: 75px; right: 20px; background: #050505; color: #fff; padding: 0; border-radius: 4px; font-family: 'Courier New', monospace; z-index: 2147483647; box-shadow: 0 0 30px rgba(0,0,0,0.8); border: 1px solid #333; width: 240px; overflow: hidden; }
        .jitter-header { padding: 15px; background: #111; border-bottom: 1px solid #333; display: flex; align-items: center; justify-content: space-between; }
        .jitter-title { font-weight: 700; font-size: 14px; letter-spacing:1px; }
        .jitter-back, .jitter-close { cursor: pointer; color: #888; font-size: 18px; padding: 0 5px; }
        .jitter-body { padding: 15px; }
        .jitter-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px; color: #aaa; }
        .jitter-val { color: #fff; font-weight: 600; }
        .jitter-btn { background: #111; color: #fff; text-align: center; padding: 12px; border-radius: 2px; cursor: pointer; margin-top: 12px; font-weight: 600; font-size: 12px; transition: all 0.2s ease; border: 1px solid #333; letter-spacing: 1px; }
        .jitter-btn:hover { background: #222; border-color: #555; }
        .jitter-btn.primary { background: #00F0FF22; color: #00F0FF; border-color: #00F0FF; }
        .jitter-btn.primary:hover { background: #00F0FF44; box-shadow: 0 0 10px #00F0FF44; }
        .jitter-badge-preview { border: 1px solid #00F0FF; color: #00F0FF; padding: 8px; border-radius: 2px; text-align: center; font-size: 10px; margin-top: 10px; }
        .jitter-section-title { margin-top: 15px; margin-bottom: 5px; font-weight: bold; font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
    `;
    document.head.appendChild(style);

    shield.addEventListener('click', () => {
        const m = document.getElementById('jitter-menu');
        if(m) m.style.display = (m.style.display === 'none') ? 'block' : 'none';
        updateUI();
    });
    
    document.addEventListener('click', (e) => {
        if (!shield.contains(e.target) && !menu.contains(e.target)) menu.style.display = 'none';
    });
}