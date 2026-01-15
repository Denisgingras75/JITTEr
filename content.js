// content.js - JITTER PROTOCOL v7.1 (Neon UI)

const ANCHOR_PREFIX = "#jitter:";
const currentURL = window.location.href.split('?')[0];
const isIframe = (window !== window.top);

let passport = { totalKeystrokes: 0, level: "Novice" };
let project = { isActive: false, humanKeystrokes: 0, pasteCount: 0, startTime: null };
let lastActiveElement = null;
let debounceTimer = null;
let scannerTimer = null;

// --- INIT ---
function loadData() {
    try {
        if (!chrome.runtime?.id) return;
        chrome.storage.local.get(['passport', currentURL], (result) => {
            if (result.passport) passport = result.passport;
            if (result[currentURL]) project = result[currentURL];
            if (!isIframe) { updateUI(); runScanner(); }
        });
    } catch (e) {}
}
loadData();

// --- CORE TRACKING ---
document.addEventListener('focusin', (e) => {
    if (e.target.id && e.target.id.includes('jitter')) return;
    lastActiveElement = e.target;
}, true);

document.addEventListener('input', (e) => {
    if (!project.isActive) return;
    lastActiveElement = e.target;
    if(!isIframe) updateUI();
}, true);

function calculateStats() {
    let target = lastActiveElement;
    if (!target || !document.contains(target)) target = document.activeElement;
    if (target && (target.tagName === 'BODY' || target.tagName === 'HTML')) target = null;

    let totalCharsInBox = 0;
    if (target) {
        if (target.value !== undefined) totalCharsInBox = target.value.length;
        else if (target.isContentEditable) totalCharsInBox = target.innerText.length;
    }

    let integrity = 100;
    if (totalCharsInBox > 0) {
        integrity = Math.round((project.humanKeystrokes / totalCharsInBox) * 100);
        if (integrity > 100) integrity = 100;
    } else if (project.humanKeystrokes > 0) integrity = 100; 

    return { typed: project.humanKeystrokes, total: totalCharsInBox, integrity: integrity, pastes: project.pasteCount };
}

// --- INTERCEPTOR ---
document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;
    const fullUrl = link.href || "";
    if (fullUrl.includes(ANCHOR_PREFIX) || link.dataset.jitterPayload) {
        e.preventDefault(); e.stopPropagation();
        let base64 = link.dataset.jitterPayload || fullUrl.split(ANCHOR_PREFIX)[1];
        if (base64) showCertificate(base64);
    }
}, true);

// --- SCANNER ---
function runScanner() {
    scanLinks();
    new MutationObserver(() => {
        if (scannerTimer) clearTimeout(scannerTimer);
        scannerTimer = setTimeout(scanLinks, 500);
    }).observe(document.body, { childList: true, subtree: true });
}
function scanLinks() {
    document.querySelectorAll('a').forEach(link => {
        if (link.dataset.jitterProcessed || !link.href.includes(ANCHOR_PREFIX)) return;
        link.style.borderBottom = "2px solid #00F0FF";
        link.style.textDecoration = "none"; 
        link.dataset.jitterProcessed = "true";
        link.addEventListener('mouseenter', (e) => showMiniHUD(link.href.split(ANCHOR_PREFIX)[1], e.clientX, e.clientY));
        link.addEventListener('mouseleave', hideMiniHUD);
    });
}

// --- INPUT HANDLERS ---
window.addEventListener('keydown', (e) => {
    const forbidden = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Backspace', 'Delete'];
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !forbidden.includes(e.key)) {
        passport.totalKeystrokes++;
        updateLevel();
        if (project.isActive) {
            project.humanKeystrokes++;
            if(!isIframe) updateUI(); 
        }
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(saveData, 500);
    }
}, true);

window.addEventListener('paste', (e) => {
    if (!project.isActive) return;
    project.pasteCount++;
    saveData();
    if(!isIframe) updateUI();
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
        if (project.isActive) data[currentURL] = project;
        chrome.storage.local.set(data);
    } catch (e) {}
}

// --- UI & GLOW STYLES ---
function updateUI() {
    if (isIframe) return;
    const menu = document.getElementById('jitter-menu');
    const shield = document.getElementById('jitter-shield');
    if (!shield) { setupUI(); return; }

    const stats = calculateStats();
    let statusColor = '#00F0FF';
    if (project.isActive) {
        if (stats.integrity < 80) statusColor = '#FF0055'; 
        else if (project.pasteCount > 5) statusColor = '#FFD700'; 
        shield.className = 'jitter-active';
        shield.style.borderColor = statusColor;
        shield.style.color = statusColor;
        shield.style.boxShadow = `0 0 10px ${statusColor}44`;
    } else {
        shield.className = 'jitter-passive';
        shield.style.borderColor = '#444';
        shield.style.color = '#444';
        shield.style.boxShadow = 'none';
    }

    menu.innerHTML = `
        <div class="jitter-header">
            <span class="jitter-title">JITTER PROTOCOL</span>
            <span class="jitter-close" id="btn-close-menu">×</span>
        </div>
        <div class="jitter-body">
            <div class="jitter-row"><span>Global Rank</span><span class="jitter-val" style="color:#FFD700">${passport.level}</span></div>
            ${project.isActive ? `
                <div class="jitter-section-title">SESSION STATS</div>
                <div class="jitter-row"><span>In Box (Total)</span><span class="jitter-val">${stats.total.toLocaleString()} chars</span></div>
                <div class="jitter-row"><span>You Typed</span><span class="jitter-val">${stats.typed.toLocaleString()} keys</span></div>
                <div class="jitter-meter-container" style="margin-top:10px; margin-bottom:5px;">
                    <div class="jitter-row" style="margin-bottom:2px;">
                        <span>Human Integrity</span>
                        <span class="jitter-val" style="color:${statusColor}">${stats.integrity}%</span>
                    </div>
                    <div style="width:100%; background:#222; height:4px; border-radius:2px; overflow:hidden;">
                        <div style="width:${stats.integrity}%; background:${statusColor}; height:100%;"></div>
                    </div>
                </div>
                <div class="jitter-btn primary" id="btn-copy">MINT BADGE</div>
                <div class="jitter-btn" id="btn-stop">STOP & COMMIT</div>
            ` : `<div class="jitter-btn primary" id="btn-start">START SESSION</div>`}
            
            <div class="jitter-btn" id="btn-open-writer">OPEN WRITER</div>
        </div>
    `;
    bindButtons(stats);
}

function bindButtons(stats) {
    const ids = ['btn-start', 'btn-stop', 'btn-copy', 'btn-close-menu', 'btn-open-writer'];
    const actions = {
        'btn-close-menu': () => document.getElementById('jitter-menu').style.display = 'none',
        'btn-open-writer': () => { try { chrome.runtime.sendMessage({ action: 'openWriter' }); } catch(e){ alert("Reload Page"); } },
        'btn-start': () => { project = { isActive: true, humanKeystrokes: 0, pasteCount: 0, startTime: Date.now() }; saveData(); updateUI(); },
        'btn-stop': () => { if(confirm("End Session?")) { copyBadge(calculateStats(), true); project.isActive = false; saveData(); updateUI(); } },
        'btn-copy': () => copyBadge(stats, false)
    };
    
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.onclick = actions[id];
    });
}

function setupUI() {
    if (document.getElementById('jitter-shield')) return;
    const shield = document.createElement('div'); shield.id = 'jitter-shield'; shield.className = 'jitter-passive'; shield.innerHTML = '⚡';
    const menu = document.createElement('div'); menu.id = 'jitter-menu'; menu.style.display = 'none';
    document.body.append(shield, menu);

    const style = document.createElement('style');
    style.textContent = `
        #jitter-shield { position: fixed; bottom: 20px; right: 20px; background: #000; color: #444; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; cursor: pointer; z-index: 2147483647; box-shadow: 0 0 10px rgba(0,0,0,0.5); border: 2px solid #333; transition: all 0.2s ease; user-select: none; }
        #jitter-shield:hover { transform: scale(1.1); color: #fff; border-color: #fff; box-shadow: 0 0 20px #ffffff66; }
        #jitter-shield.jitter-active { border-color: #00F0FF !important; color: #00F0FF !important; box-shadow: 0 0 15px #00F0FF66 !important; }
        #jitter-menu { position: fixed; bottom: 75px; right: 20px; background: #050505; color: #fff; border-radius: 4px; font-family: 'Courier New', monospace; z-index: 2147483647; box-shadow: 0 0 30px rgba(0,0,0,0.8); border: 1px solid #333; width: 240px; overflow: hidden; }
        .jitter-header { padding: 15px; background: #111; border-bottom: 1px solid #333; display: flex; align-items: center; justify-content: space-between; }
        .jitter-body { padding: 15px; }
        .jitter-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px; color: #aaa; }
        .jitter-val { color: #fff; font-weight: 600; }
        
        .jitter-btn { background: #111; color: #fff; text-align: center; padding: 12px; border-radius: 2px; cursor: pointer; margin-top: 12px; font-weight: 600; font-size: 12px; transition: all 0.1s ease; border: 1px solid #333; letter-spacing: 1px; user-select: none; }
        .jitter-btn:hover { background: #222; border-color: #fff; color: #fff; box-shadow: 0 0 10px rgba(255,255,255,0.2); }
        .jitter-btn:active { transform: translateY(2px); box-shadow: none; opacity: 0.8; }
        .jitter-btn.primary { background: #00F0FF11; color: #00F0FF; border-color: #00F0FF44; }
        
        /* THE GLOWING WRITER BUTTON */
        #btn-open-writer {
            margin-top: 15px;
            border: 1px solid #666;
            color: #ccc;
            background: #1a1a1a;
            box-shadow: 0 0 5px rgba(0,0,0,0.5);
        }
        #btn-open-writer:hover {
            border-color: #00F0FF;
            color: #00F0FF;
            background: #00F0FF11;
            box-shadow: 0 0 15px #00F0FF66;
            text-shadow: 0 0 5px #00F0FF;
        }
    `;
    document.head.appendChild(style);
    shield.addEventListener('click', () => { 
        const m = document.getElementById('jitter-menu'); 
        m.style.display = (m.style.display === 'none') ? 'block' : 'none'; 
        updateUI(); 
    });
}
function copyBadge(stats, auto) {
    const id = btoa(JSON.stringify({i:stats.integrity, d:new Date().toLocaleDateString()})).slice(-6).toUpperCase();
    const url = `${ANCHOR_PREFIX}${btoa(JSON.stringify({type:'project',title:'Verified',integrity:stats.integrity,keys:stats.typed,pastes:stats.pastes,date:new Date().toLocaleDateString()}))}`;
    const html = `<a href="${url}" style="text-decoration:none;" data-jitter-payload="${url.split(':')[1]}"><span style="background:#00F0FF11;color:#00F0FF;border:1px solid #00F0FF44;padding:2px 6px;font-size:10px;font-family:monospace;">⚡ JITTER: 0x${id}</span></a>`;
    const text = `[JITTER: 0x${id} | INT:${stats.integrity}%]`;
    navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([text],{type:'text/plain'})})]);
    const btn = document.getElementById('btn-stop'); if(btn) btn.innerText = "COPIED!";
}
function showMiniHUD() {} 
function hideMiniHUD() {}
function showCertificate() {}