// content.js - JITTER PROTOCOL v10.0 (Loki Shield)

const ANCHOR_PREFIX = "#jitter:";
const currentURL = window.location.href.split('?')[0];
const isIframe = (window !== window.top);

let passport = { totalKeystrokes: 0, level: "Novice" };
let project = { isActive: false, humanKeystrokes: 0, pasteCount: 0, startTime: null };

// --- LOKI BIOMETRICS ---
const bio = { 
    lastTime: null, 
    lastChar: '', 
    flowIntervals: [], 
    gapIntervals: [], 
    isBot: false, 
    entropy: 100, 
    backspaces: 0,
    cognitiveRatio: 0
};

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

// --- TRACKING CORE ---
let lastActiveElement = null;
let debounceTimer = null;
let scannerTimer = null;

document.addEventListener('focusin', (e) => {
    if (e.target.id && e.target.id.includes('jitter')) return;
    lastActiveElement = e.target;
}, true);

document.addEventListener('input', (e) => {
    if (!project.isActive) return;
    lastActiveElement = e.target;
    if(!isIframe) updateUI();
}, true);

// --- KEYSTROKE DYNAMICS ---
window.addEventListener('keydown', (e) => {
    const forbidden = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Enter', 'Escape'];

    if (e.key === 'Backspace' || e.key === 'Delete') {
        bio.backspaces++;
        if (project.isActive) updateUI();
        return;
    }
    
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !forbidden.includes(e.key)) {
        const now = Date.now();
        if (bio.lastTime) {
            const delta = now - bio.lastTime;
            const isGap = /[\s\.\,\;\:\!\?]/.test(bio.lastChar);
            
            if (delta < 2000) {
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

        passport.totalKeystrokes++;
        if (project.isActive) {
            project.humanKeystrokes++;
            if(!isIframe) updateUI(); 
        }
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(saveData, 500);
    }
}, true);

function analyzeRhythm() {
    if (bio.flowIntervals.length < 10) return;
    const avgFlow = bio.flowIntervals.reduce((a,b)=>a+b,0) / bio.flowIntervals.length;
    const avgGap = bio.gapIntervals.length > 0 ? (bio.gapIntervals.reduce((a,b)=>a+b,0) / bio.gapIntervals.length) : avgFlow;

    // The Loki Metric:
    bio.cognitiveRatio = avgGap / avgFlow;

    const squareDiffs = bio.flowIntervals.map(v => Math.pow(v - avgFlow, 2));
    const stdDev = Math.sqrt(squareDiffs.reduce((a,b)=>a+b,0) / bio.flowIntervals.length);

    const botRhythm = stdDev < 8;
    const botSpeed = avgFlow < 35;
    const botLinearity = (bio.cognitiveRatio < 1.2 && project.humanKeystrokes > 200);

    if (botRhythm || botSpeed || botLinearity) {
        bio.isBot = true;
        bio.entropy = 0;
    } else {
        bio.isBot = false;
        bio.entropy = Math.min(Math.round(stdDev + (bio.cognitiveRatio * 10)), 100);
    }
}

// --- UTILS ---
window.addEventListener('paste', (e) => {
    if (!project.isActive) return;
    project.pasteCount++;
    saveData();
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

    if (bio.isBot) integrity = 0;

    return { typed: project.humanKeystrokes, total: totalCharsInBox, integrity: integrity, pastes: project.pasteCount };
}

function saveData() {
    try {
        if (!chrome.runtime?.id) return;
        const data = { passport: passport };
        if (project.isActive) data[currentURL] = project;
        chrome.storage.local.set(data);
    } catch (e) {}
}

// --- UI ---
function updateUI() {
    if (isIframe) return;
    const menu = document.getElementById('jitter-menu');
    const shield = document.getElementById('jitter-shield');
    if (!shield) { setupUI(); return; }

    const stats = calculateStats();
    let statusColor = '#00F0FF';
    let statusText = `${stats.integrity}%`;

    if (project.isActive) {
        if (bio.isBot) {
            statusColor = '#FF0000';
            statusText = "SYNTHETIC";
        } else if (stats.integrity < 80) statusColor = '#FF0055'; 
        
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
            ${project.isActive ? `
                <div class="jitter-section-title">LOKI BIOMETRICS</div>
                <div class="jitter-row"><span>Entropy</span><span class="jitter-val">${bio.entropy}</span></div>
                <div class="jitter-row"><span>Cog. Ratio</span><span class="jitter-val" style="color:${bio.cognitiveRatio < 1.5 ? '#FFD700' : '#00F0FF'}">${bio.cognitiveRatio.toFixed(2)}</span></div>
                <div class="jitter-row"><span>Edits</span><span class="jitter-val">${bio.backspaces}</span></div>
                
                <div class="jitter-meter-container" style="margin-top:10px; margin-bottom:5px;">
                    <div class="jitter-row" style="margin-bottom:2px;">
                        <span>Integrity</span>
                        <span class="jitter-val" style="color:${statusColor}">${statusText}</span>
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

// ... (Include Standard bindButtons, setupUI, copyBadge, etc. from previous context) ...
// Minified Standard Functions for Context:
function bindButtons(s){const i=['btn-start','btn-stop','btn-copy','btn-close-menu','btn-open-writer'];const a={'btn-close-menu':()=>document.getElementById('jitter-menu').style.display='none','btn-open-writer':()=>{try{chrome.runtime.sendMessage({action:'openWriter'})}catch(e){alert("Reload")}},'btn-start':()=>{project={isActive:true,humanKeystrokes:0,pasteCount:0,startTime:Date.now()};saveData();updateUI()},'btn-stop':()=>{if(confirm("End?")){copyBadge(calculateStats(),true);project.isActive=false;saveData();updateUI()}},'btn-copy':()=>copyBadge(s,false)};i.forEach(id=>{const el=document.getElementById(id);if(el)el.onclick=a[id]})}
function setupUI(){if(document.getElementById('jitter-shield'))return;const s=document.createElement('div');s.id='jitter-shield';s.className='jitter-passive';s.innerHTML='⚡';const m=document.createElement('div');m.id='jitter-menu';m.style.display='none';document.body.append(s,m);const st=document.createElement('style');st.textContent=`#jitter-shield{position:fixed;bottom:20px;right:20px;background:#000;color:#444;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;z-index:2147483647;box-shadow:0 0 10px rgba(0,0,0,0.5);border:2px solid #333;transition:all 0.2s ease;user-select:none}#jitter-shield:hover{transform:scale(1.1);color:#fff;border-color:#fff;box-shadow:0 0 20px #ffffff66}#jitter-shield.jitter-active{border-color:#00F0FF!important;color:#00F0FF!important;box-shadow:0 0 15px #00F0FF66!important}#jitter-menu{position:fixed;bottom:75px;right:20px;background:#050505;color:#fff;border-radius:4px;font-family:'Courier New',monospace;z-index:2147483647;box-shadow:0 0 30px rgba(0,0,0,0.8);border:1px solid #333;width:240px;overflow:hidden}.jitter-header{padding:15px;background:#111;border-bottom:1px solid #333;display:flex;align-items:center;justify-content:space-between}.jitter-body{padding:15px}.jitter-row{display:flex;justify-content:space-between;margin-bottom:8px;font-size:12px;color:#aaa}.jitter-val{color:#fff;font-weight:600}.jitter-btn{background:#111;color:#fff;text-align:center;padding:12px;border-radius:2px;cursor:pointer;margin-top:12px;font-weight:600;font-size:12px;transition:all 0.1s ease;border:1px solid #333;letter-spacing:1px;user-select:none}.jitter-btn:hover{background:#222;border-color:#fff;color:#fff;box-shadow:0 0 10px rgba(255,255,255,0.2)}.jitter-btn.primary{background:#00F0FF11;color:#00F0FF;border-color:#00F0FF44}#btn-open-writer{margin-top:15px;border:1px solid #666;color:#ccc;background:#1a1a1a;box-shadow:0 0 5px rgba(0,0,0,0.5)}#btn-open-writer:hover{border-color:#00F0FF;color:#00F0FF;background:#00F0FF11;box-shadow:0 0 15px #00F0FF66;text-shadow:0 0 5px #00F0FF}`;document.head.appendChild(st);s.addEventListener('click',()=>{const x=document.getElementById('jitter-menu');x.style.display=(x.style.display==='none')?'block':'none';updateUI()})}
document.addEventListener('click',(e)=>{const l=e.target.closest('a');if(!l)return;const u=l.href||"";if(u.includes(ANCHOR_PREFIX)||l.dataset.jitterPayload){e.preventDefault();e.stopPropagation();let b=l.dataset.jitterPayload||u.split(ANCHOR_PREFIX)[1];if(b)showCertificate(b)}},true);
function runScanner(){scanLinks();new MutationObserver(()=>{if(scannerTimer)clearTimeout(scannerTimer);scannerTimer=setTimeout(scanLinks,500)}).observe(document.body,{childList:true,subtree:true})}
function scanLinks(){document.querySelectorAll('a').forEach(l=>{if(l.dataset.jitterProcessed||!l.href.includes(ANCHOR_PREFIX))return;l.style.borderBottom="2px solid #00F0FF";l.style.textDecoration="none";l.dataset.jitterProcessed="true";l.addEventListener('mouseenter',(e)=>showMiniHUD(l.href.split(ANCHOR_PREFIX)[1],e.clientX,e.clientY));l.addEventListener('mouseleave',hideMiniHUD)})}
function showMiniHUD(b,x,y){try{const d=JSON.parse(atob(b));hideMiniHUD();const h=document.createElement('div');h.id='jitter-hud';h.style.cssText=`position:fixed;z-index:2147483647;background:#050505;border:1px solid #00F0FF;padding:10px;top:${y+20}px;left:${x}px;color:#fff;font-family:monospace;border-radius:4px;box-shadow:0 0 20px #00F0FF44`;h.innerHTML=`<div>⚡ JITTER</div><div style="font-size:10px;color:#aaa">${d.date}</div><div style="margin-top:5px;font-weight:bold;color:#00F0FF">INT: ${d.integrity}%</div>`;document.body.appendChild(h)}catch(e){}}
function hideMiniHUD(){const h=document.getElementById('jitter-hud');if(h)h.remove()}
function showCertificate(b){try{const d=JSON.parse(atob(b));const m=document.getElementById('jitter-menu');m.style.display='block';m.innerHTML=`<div class="jitter-header" style="background:#00F0FF11;border-color:#00F0FF"><span class="jitter-title" style="color:#00F0FF">CERTIFICATE</span><span class="jitter-close" onclick="document.getElementById('jitter-menu').style.display='none'">×</span></div><div class="jitter-body" style="text-align:center"><div style="font-size:40px;margin-bottom:10px">⚡</div><div style="font-weight:bold;color:#fff">${d.title||'Verified'}</div><div style="font-size:12px;color:#888;margin-bottom:15px">${d.date}</div><div class="jitter-row"><span>Integrity</span><span class="jitter-val" style="color:#00F0FF">${d.integrity}%</span></div><div class="jitter-row"><span>Cog. Ratio</span><span class="jitter-val">${d.cr||'1.0'}</span></div><div class="jitter-row"><span>Edits</span><span class="jitter-val">${d.edits||'0'}</span></div></div>`}catch(e){}}
function copyBadge(s,a){if(bio.isBot){alert("Verification Denied: Synthetic Behavior");return}const p={type:'project',title:'Verified',integrity:s.integrity,keys:s.typed,pastes:s.pastes,date:new Date().toLocaleDateString(),edits:bio.backspaces,cr:bio.cognitiveRatio.toFixed(2)};const b=btoa(JSON.stringify(p));const id=b.slice(-6).toUpperCase();const u=`${ANCHOR_PREFIX}${b}`;const h=`<a href="${u}" style="text-decoration:none;" data-jitter-payload="${b}"><span style="background:#00F0FF11;color:#00F0FF;border:1px solid #00F0FF;padding:2px 6px;font-size:10px;font-family:monospace;border-radius:4px;">⚡ JITTER: 0x${id}</span></a>`;const t=`[JITTER: 0x${id} | INT:${s.integrity}%]`;navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([h],{type:'text/html'}),'text/plain':new Blob([t],{type:'text/plain'})})]);const btn=document.getElementById('btn-stop');if(btn)btn.innerText="COPIED!"}