/**
 * content.js - JITTER PROTOCOL v10.0 (Loki Shield)
 *
 * Copyright (c) 2025-2026 Denis Gingras. All Rights Reserved.
 *
 * PROPRIETARY AND CONFIDENTIAL
 * This file contains proprietary web monitoring and badge verification algorithms.
 *
 * Unauthorized copying, modification, distribution, or use of this
 * software is strictly prohibited without explicit written permission.
 * See LICENSE file for full terms.
 */

const ANCHOR_PREFIX = "#jitter:";
const ATTEST_URL = "https://fmguuhnustgcqzgjaoil.supabase.co/functions/v1/attest";
const VERIFY_URL = "https://fmguuhnustgcqzgjaoil.supabase.co/functions/v1/verify";
const currentURL = window.location.href.split('?')[0];
const isIframe = (window !== window.top);

let passport = {
    totalKeystrokes: 0,
    level: "Novice",
    firstUsed: null,
    lastUsed: null,
    sessionsCompleted: 0
};
let project = { isActive: false, humanKeystrokes: 0, pasteCount: 0, startTime: null };

// --- LOKI BIOMETRICS ---
let bioSession = JitterBio.createSession();

// --- INIT ---
function loadData() {
    try {
        if (!chrome.runtime?.id) return;
        chrome.storage.local.get(['passport', currentURL], (result) => {
            if (result.passport) {
                passport = result.passport;
            }
            // Initialize timestamps if first time
            if (!passport.firstUsed) {
                passport.firstUsed = Date.now();
            }
            passport.lastUsed = Date.now();
            updatePassportLevel();
            saveData();
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
    if (e.key === 'Backspace' || e.key === 'Delete') {
        JitterBio.handleKeydown(bioSession, e.key, e.ctrlKey, e.metaKey, e.altKey);
        if (project.isActive) updateUI();
        return;
    }

    const result = JitterBio.handleKeydown(bioSession, e.key, e.ctrlKey, e.metaKey, e.altKey);
    if (result === 'char') {
        passport.totalKeystrokes++;
        passport.lastUsed = Date.now();
        updatePassportLevel();
        if (project.isActive) {
            project.humanKeystrokes++;
            if(!isIframe) updateUI();
        }
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(saveData, 500);
    }
}, true);

window.addEventListener('keyup', (e) => {
    JitterBio.handleKeyup(bioSession, e.key, e.ctrlKey, e.metaKey, e.altKey);
}, true);

document.addEventListener('mousemove', (e) => {
    JitterBio.handleMouseMove(bioSession, e.clientX, e.clientY);
});

function updatePassportLevel() {
    const k = passport.totalKeystrokes;
    if (k < 1000) passport.level = "Novice";
    else if (k < 5000) passport.level = "Beginner";
    else if (k < 15000) passport.level = "Intermediate";
    else if (k < 50000) passport.level = "Advanced";
    else if (k < 150000) passport.level = "Expert";
    else passport.level = "Master";
}

// --- UTILS ---
window.addEventListener('paste', (e) => {
    const pastedText = e.clipboardData?.getData('text') || '';
    if (pastedText.length > 0) {
        // Always track paste in bio session (WAR purity signal)
        JitterBio.handlePaste(bioSession, pastedText.length);
        if (project.isActive) {
            project.pasteCount++;
            project.pastedChars = (project.pastedChars || 0) + pastedText.length;
        }
    }
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

    const loki = JitterBio.analyzeLoki(bioSession);
    let integrity = 100;
    if (totalCharsInBox > 0) {
        integrity = Math.round((bioSession.humanChars / totalCharsInBox) * 100);
        if (integrity > 100) integrity = 100;
    } else if (bioSession.humanChars > 0) integrity = 100;
    if (loki.isBot) integrity = 0;

    return { typed: bioSession.humanChars, total: totalCharsInBox, integrity, pastes: bioSession.pasteCount };
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
        const loki = JitterBio.analyzeLoki(bioSession);
        if (loki.isBot) {
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
            ${project.isActive ? (() => {
                const loki = JitterBio.analyzeLoki(bioSession);
                const profile = JitterBio.getProfile(bioSession);
                const warResult = profile ? JitterBio.scoreWAR(bioSession, profile) : null;
                const warDisplay = warResult ? warResult.war : '—';
                const tierDisplay = warResult ? warResult.tier : '—';
                const warColor = warResult && warResult.war >= 0.60 ? '#00F0FF' : warResult && warResult.war >= 0.40 ? '#FFD700' : '#FF0055';
                return `
                <div class="jitter-section-title">WAR SCORE</div>
                <div class="jitter-row"><span>WAR</span><span class="jitter-val" style="color:${warColor};font-size:16px">${warDisplay}</span></div>
                <div class="jitter-row"><span>Tier</span><span class="jitter-val" style="color:${warColor}">${tierDisplay}</span></div>
                <div style="width:100%; background:#222; height:4px; border-radius:2px; overflow:hidden; margin-bottom:10px;">
                    <div style="width:${warResult ? warResult.war * 100 : 0}%; background:${warColor}; height:100%;"></div>
                </div>
                <div class="jitter-section-title">SIGNALS</div>
                <div class="jitter-row"><span>Entropy</span><span class="jitter-val">${loki.entropy}</span></div>
                <div class="jitter-row"><span>Cog. Ratio</span><span class="jitter-val" style="color:${loki.cognitiveRatio < 1.5 ? '#FFD700' : '#00F0FF'}">${loki.cognitiveRatio.toFixed(2)}</span></div>
                <div class="jitter-row"><span>Edits</span><span class="jitter-val">${bioSession.backspaceCount}</span></div>
                <div class="jitter-row"><span>Integrity</span><span class="jitter-val" style="color:${statusColor}">${statusText}</span></div>
                <div class="jitter-btn primary" id="btn-copy">MINT BADGE</div>
                <div class="jitter-btn" id="btn-stop">STOP & COMMIT</div>
            `;
            })() : `<div class="jitter-btn primary" id="btn-start">START SESSION</div>`}
            <div class="jitter-btn" id="btn-open-writer">OPEN WRITER</div>
        </div>
    `;
    bindButtons(stats);
}

function bindButtons(s) {
    const handlers = {
        'btn-close-menu': () => { document.getElementById('jitter-menu').style.display = 'none'; },
        'btn-open-writer': () => { try { chrome.runtime.sendMessage({ action: 'openWriter' }); } catch(e) { alert("Reload"); } },
        'btn-start': () => {
            bioSession = JitterBio.createSession();
            project = { isActive: true, humanKeystrokes: 0, pasteCount: 0, pastedChars: 0, startTime: Date.now() };
            saveData(); updateUI();
        },
        'btn-stop': () => { if (confirm("End?")) { copyBadge(calculateStats(), true); project.isActive = false; saveData(); updateUI(); } },
        'btn-copy': () => copyBadge(s, false)
    };
    ['btn-start', 'btn-stop', 'btn-copy', 'btn-close-menu', 'btn-open-writer'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.onclick = handlers[id];
    });
}
function setupUI(){if(document.getElementById('jitter-shield'))return;const s=document.createElement('div');s.id='jitter-shield';s.className='jitter-passive';s.innerHTML='⚡';const m=document.createElement('div');m.id='jitter-menu';m.style.display='none';document.body.append(s,m);const st=document.createElement('style');st.textContent=`#jitter-shield{position:fixed;bottom:20px;right:20px;background:#000;color:#444;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;z-index:2147483647;box-shadow:0 0 10px rgba(0,0,0,0.5);border:2px solid #333;transition:all 0.2s ease;user-select:none}#jitter-shield:hover{transform:scale(1.1);color:#fff;border-color:#fff;box-shadow:0 0 20px #ffffff66}#jitter-shield.jitter-active{border-color:#00F0FF!important;color:#00F0FF!important;box-shadow:0 0 15px #00F0FF66!important}#jitter-menu{position:fixed;bottom:75px;right:20px;background:#050505;color:#fff;border-radius:4px;font-family:'Courier New',monospace;z-index:2147483647;box-shadow:0 0 30px rgba(0,0,0,0.8);border:1px solid #333;width:240px;overflow:hidden}.jitter-header{padding:15px;background:#111;border-bottom:1px solid #333;display:flex;align-items:center;justify-content:space-between}.jitter-body{padding:15px}.jitter-row{display:flex;justify-content:space-between;margin-bottom:8px;font-size:12px;color:#aaa}.jitter-val{color:#fff;font-weight:600}.jitter-btn{background:#111;color:#fff;text-align:center;padding:12px;border-radius:2px;cursor:pointer;margin-top:12px;font-weight:600;font-size:12px;transition:all 0.1s ease;border:1px solid #333;letter-spacing:1px;user-select:none}.jitter-btn:hover{background:#222;border-color:#fff;color:#fff;box-shadow:0 0 10px rgba(255,255,255,0.2)}.jitter-btn.primary{background:#00F0FF11;color:#00F0FF;border-color:#00F0FF44}#btn-open-writer{margin-top:15px;border:1px solid #666;color:#ccc;background:#1a1a1a;box-shadow:0 0 5px rgba(0,0,0,0.5)}#btn-open-writer:hover{border-color:#00F0FF;color:#00F0FF;background:#00F0FF11;box-shadow:0 0 15px #00F0FF66;text-shadow:0 0 5px #00F0FF}`;document.head.appendChild(st);s.addEventListener('click',()=>{const x=document.getElementById('jitter-menu');x.style.display=(x.style.display==='none')?'block':'none';updateUI()})}
document.addEventListener('click',(e)=>{const l=e.target.closest('a');if(!l)return;const u=l.href||"";if(u.includes(VERIFY_URL)){return}if(u.includes(ANCHOR_PREFIX)||l.dataset.jitterPayload){e.preventDefault();e.stopPropagation();let b=l.dataset.jitterPayload||u.split(ANCHOR_PREFIX)[1];if(b)showCertificate(b)}},true);
function runScanner(){scanLinks();new MutationObserver(()=>{if(scannerTimer)clearTimeout(scannerTimer);scannerTimer=setTimeout(scanLinks,500)}).observe(document.body,{childList:true,subtree:true})}
function scanLinks(){document.querySelectorAll('a').forEach(l=>{if(l.dataset.jitterProcessed||!l.href.includes(ANCHOR_PREFIX))return;l.style.borderBottom="2px solid #00F0FF";l.style.textDecoration="none";l.dataset.jitterProcessed="true";l.addEventListener('mouseenter',(e)=>showMiniHUD(l.href.split(ANCHOR_PREFIX)[1],e.clientX,e.clientY));l.addEventListener('mouseleave',hideMiniHUD)})}
function showMiniHUD(b,x,y){try{const d=JSON.parse(atob(b));hideMiniHUD();const h=document.createElement('div');h.id='jitter-hud';h.style.cssText=`position:fixed;z-index:2147483647;background:#050505;border:1px solid #00F0FF;padding:10px;top:${y+20}px;left:${x}px;color:#fff;font-family:monospace;border-radius:4px;box-shadow:0 0 20px #00F0FF44`;const warLine=d.war!=null?`<div style="margin-top:5px;font-weight:bold;color:#00F0FF">WAR: ${d.war} (${d.war_tier||'—'})</div>`:`<div style="margin-top:5px;font-weight:bold;color:#00F0FF">INT: ${d.integrity}%</div>`;h.innerHTML=`<div>⚡ JITTER</div><div style="font-size:10px;color:#aaa">${d.date}</div>${warLine}`;document.body.appendChild(h)}catch(e){}}
function hideMiniHUD(){const h=document.getElementById('jitter-hud');if(h)h.remove()}
function showCertificate(b) {
    try {
        const d = JSON.parse(atob(b));
        const m = document.getElementById('jitter-menu');
        m.style.display = 'block';

        // Format passport display
        let passportDisplay = '—';
        if (d.passport) {
            const k = d.passport;
            if (k >= 1000000) {
                passportDisplay = (k / 1000000).toFixed(1) + 'M';
            } else if (k >= 1000) {
                passportDisplay = (k / 1000).toFixed(1) + 'K';
            } else {
                passportDisplay = k.toString();
            }
        }

        // Build certificate with passport info
        m.innerHTML = `
            <div class="jitter-header" style="background:#00F0FF11;border-color:#00F0FF">
                <span class="jitter-title" style="color:#00F0FF">CERTIFICATE</span>
                <span class="jitter-close" onclick="document.getElementById('jitter-menu').style.display='none'">×</span>
            </div>
            <div class="jitter-body" style="text-align:center">
                <div style="font-size:40px;margin-bottom:10px">⚡</div>
                <div style="font-weight:bold;color:#fff">${d.title || 'Verified'}</div>
                <div style="font-size:12px;color:#888;margin-bottom:15px">${d.date}</div>

                <div style="font-size:11px;color:#666;text-transform:uppercase;margin-bottom:8px;letter-spacing:1px;">Session Metrics</div>
                <div class="jitter-row"><span>Integrity</span><span class="jitter-val" style="color:#00F0FF">${d.integrity}%</span></div>
                <div class="jitter-row"><span>Cog. Ratio</span><span class="jitter-val">${d.cr || '1.0'}</span></div>
                <div class="jitter-row"><span>Edits</span><span class="jitter-val">${d.edits || '0'}</span></div>

                ${d.passport ? `
                    <div style="border-top:1px solid #333;margin:15px 0;"></div>
                    <div style="font-size:11px;color:#666;text-transform:uppercase;margin-bottom:8px;letter-spacing:1px;">Passport Profile</div>
                    <div class="jitter-row"><span>Total Keys</span><span class="jitter-val" style="color:#FFD700">${passportDisplay}</span></div>
                    <div class="jitter-row"><span>Level</span><span class="jitter-val">${d.passportLevel || '—'}</span></div>
                    <div class="jitter-row"><span>Account Age</span><span class="jitter-val">${d.accountAge || '0'} days</span></div>
                    <div class="jitter-row"><span>Sessions</span><span class="jitter-val">${d.sessions || '1'}</span></div>
                ` : ''}
            </div>
        `;
    } catch (e) {}
}
async function copyBadge(s, a) {
    const loki = JitterBio.analyzeLoki(bioSession);
    if (loki.isBot) {
        alert("Verification Denied: Synthetic Behavior");
        return;
    }

    const profile = JitterBio.getProfile(bioSession);

    // Increment sessions and update passport
    passport.sessionsCompleted++;
    passport.lastUsed = Date.now();
    saveData();

    // Calculate account age
    const accountAgeDays = passport.firstUsed ?
        Math.floor((Date.now() - passport.firstUsed) / (1000 * 60 * 60 * 24)) : 0;

    // Accurate integrity: typed / (typed + pasted)
    const pastedChars = project.pastedChars || 0;
    const totalChars = s.typed + pastedChars;
    const integrity = totalChars > 0 ? Math.round((s.typed / totalChars) * 100) : 100;

    // Get crypto components
    let publicKeyFingerprint = null;
    let publicKeyJwk = null;
    let previousBadgeHash = null;
    if (typeof CryptoUtils !== 'undefined') {
        // Ensure key pair exists before reading fingerprint/JWK
        await CryptoUtils.getOrCreateKeyPair();
        publicKeyFingerprint = await CryptoUtils.getPublicKeyFingerprint();
        publicKeyJwk = await CryptoUtils.getPublicKeyJwk();
        previousBadgeHash = await CryptoUtils.getPreviousBadgeHash();
    }

    // WAR score
    const warResult = profile ? JitterBio.scoreWAR(bioSession, profile) : null;
    const cappedWar = warResult ? JitterBio.applyTimeCap(warResult, passport.firstUsed) : null;

    const p = {
        version: '3.0',
        type: 'content',
        title: 'Verified',
        timestamp: Date.now(),
        // WAR (v3.0)
        war: cappedWar ? cappedWar.war : null,
        raw_war: cappedWar ? cappedWar.raw_war : null,
        war_tier: cappedWar ? cappedWar.tier : null,
        time_cap: cappedWar ? cappedWar.timeCap : null,
        war_components: cappedWar ? cappedWar.components : null,
        war_flags: cappedWar ? cappedWar.flags : null,
        // Legacy (kept for backward compat)
        integrity: integrity,
        keys: s.typed,
        pastedChars: pastedChars,
        pastes: s.pastes,
        date: new Date().toLocaleDateString(),
        edits: bioSession.backspaceCount,
        cr: loki.cognitiveRatio.toFixed(2),
        entropy: loki.entropy,
        // Biometric profile
        meanDwell: profile?.mean_dwell,
        stdDwell: profile?.std_dwell,
        meanFlight: profile?.mean_inter_key,
        stdFlight: profile?.std_inter_key,
        meanDd: profile?.mean_dd_time,
        stdDd: profile?.std_dd_time,
        editRatio: profile?.edit_ratio,
        pauseCount: profile?.pause_count,
        pauseFreq: profile?.pause_freq,
        avgBurstLength: profile?.avg_burst_length,
        burstVariance: profile?.burst_variance,
        burstCount: profile?.burst_count,
        fatigueWindows: profile?.fatigue_windows,
        mousePath: profile?.mouse_path,
        // Passport data
        passport: passport.totalKeystrokes,
        passportLevel: passport.level,
        accountAge: accountAgeDays,
        sessions: passport.sessionsCompleted,
        suspicionScore: passport.suspicionScore || 0,
        suspicionSignals: passport.suspicionSignals || [],
        // Crypto chain
        previousBadge: previousBadgeHash,
        publicKeyId: publicKeyFingerprint,
        publicKeyJwk: publicKeyJwk
    };

    // Sign the payload
    if (typeof CryptoUtils !== 'undefined') {
        const signature = await CryptoUtils.signBadge(p);
        if (signature) p.signature = signature;
    }

    const b = btoa(JSON.stringify(p));
    const id = b.slice(-6).toUpperCase();

    // Store badge hash for chain
    if (typeof CryptoUtils !== 'undefined') {
        await CryptoUtils.storeBadgeHash(b);
    }

    // Get user_id from storage for attestation
    let userId = 'anon';
    try {
        const stored = await new Promise(r => chrome.storage.local.get('jitter_user_id', r));
        if (stored.jitter_user_id) userId = stored.jitter_user_id;
    } catch (e) {}

    // POST to attestation server — never blocks badge copy
    let verifyHref = `${ANCHOR_PREFIX}${b}`;
    try {
        const attestRes = await fetch(ATTEST_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                site_key: 'extension',
                war_score: p.war || 0,
                classification: p.war >= 0.80 ? 'verified' : p.war >= 0.50 ? 'suspicious' : 'bot',
                flags: p.war_flags || [],
                meta: { integrity: p.integrity, keys: p.keys, pastes: p.pastes, sessions: p.sessions },
            })
        });
        const attestData = await attestRes.json();
        if (attestData.badge_hash) {
            verifyHref = `${VERIFY_URL}?hash=${attestData.badge_hash}`;
        }
    } catch (e) {
        // Attestation failed silently — use fallback anchor
    }

    const h = `<a href="${verifyHref}" style="text-decoration:none;" data-jitter-payload="${b}"><span style="background:#00F0FF11;color:#00F0FF;border:1px solid #00F0FF;padding:2px 6px;font-size:10px;font-family:monospace;border-radius:4px;">⚡ JITTER: 0x${id}</span></a>`;
    const t = `[JITTER: 0x${id} | INT:${integrity}%]`;

    navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([h], {type: 'text/html'}),
        'text/plain': new Blob([t], {type: 'text/plain'})
    })]);
    const btn = document.getElementById('btn-stop');
    if (btn) btn.innerText = "COPIED!";
}