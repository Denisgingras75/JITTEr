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

// --- CAPTURE SCOPE ---
// This script only runs on sites the user enabled (background.js registers it
// per origin). Within a page, timing is recorded only for ordinary text
// fields: <textarea>, contenteditable, and <input> of type text, search or
// none. Password, e-mail, phone, number, URL and every other input type are
// never touched, nor are fields marked for payment cards, one-time codes or
// passwords through autocomplete, nor anything under data-jitter-ignore.
const CAPTURABLE_INPUT_TYPES = new Set(['text', 'search']);
const SENSITIVE_AUTOCOMPLETE = new Set(['one-time-code', 'current-password', 'new-password']);

function isCapturable(target) {
    let el = target;
    if (el && el.nodeType === 3) el = el.parentElement; // text node inside an editor
    if (!el || el.nodeType !== 1 || typeof el.getAttribute !== 'function') return false;
    if (el.closest('[data-jitter-ignore]')) return false;
    const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/);
    if (autocomplete.some(token => token.startsWith('cc-') || SENSITIVE_AUTOCOMPLETE.has(token))) return false;
    const tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') {
        const type = (el.getAttribute('type') || 'text').trim().toLowerCase();
        return CAPTURABLE_INPUT_TYPES.has(type);
    }
    return !!el.isContentEditable;
}

// The popup can turn capture off (and back on) for this site while the page
// is open; the background relays it here.
let captureOn = true;

function stopCapture() {
    captureOn = false;
    ['jitter-shield', 'jitter-menu', 'jitter-hud'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });
}

function resumeCapture() {
    captureOn = true;
    if (!isIframe) updateUI();
}

// Passport bookkeeping (dates, level, daily count, session history) lives in
// passport-utils.js, loaded ahead of this file.
function touchPassport(keys, isSessionEnd) {
    if (typeof PassportUtils !== 'undefined') PassportUtils.updatePassport(passport, keys, isSessionEnd);
    else passport.lastUsed = Date.now();
}

try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (!msg || typeof msg.action !== 'string') return;
        if (msg.action === 'captureOff') { stopCapture(); sendResponse({ ok: true }); }
        else if (msg.action === 'captureOn') { resumeCapture(); sendResponse({ ok: true }); }
    });
} catch (e) {}

// --- INIT ---
function loadData() {
    try {
        if (!chrome.runtime?.id) return;
        chrome.storage.local.get(['passport', currentURL], (result) => {
            if (result.passport) {
                passport = result.passport;
            }
            // Stamps firstUsed/lastUsed and the level; drops fields older versions stored
            touchPassport(0, false);
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
    if (isCapturable(e.target)) lastActiveElement = e.target;
}, true);

document.addEventListener('input', (e) => {
    if (!captureOn || !project.isActive || !isCapturable(e.target)) return;
    lastActiveElement = e.target;
    if(!isIframe) updateUI();
}, true);

// --- KEYSTROKE DYNAMICS ---
// Only real input counts: page scripts can dispatch synthetic key events
// (isTrusted=false), and auto-repeat from a held key is not a keystroke.
// And only in a capturable field (isCapturable above).
window.addEventListener('keydown', (e) => {
    if (!captureOn || !e.isTrusted || e.repeat || typeof e.key !== 'string') return;
    if (!isCapturable(e.target)) return;
    if (e.key === 'Backspace' || e.key === 'Delete') {
        JitterBio.handleKeydown(bioSession, e.key, e.ctrlKey, e.metaKey, e.altKey);
        if (project.isActive) updateUI();
        return;
    }

    const result = JitterBio.handleKeydown(bioSession, e.key, e.ctrlKey, e.metaKey, e.altKey);
    if (result === 'char') {
        passport.totalKeystrokes++;
        touchPassport(1, false);
        if (project.isActive) {
            project.humanKeystrokes++;
            if(!isIframe) updateUI();
        }
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(saveData, 500);
    }
}, true);

window.addEventListener('keyup', (e) => {
    if (!captureOn || !e.isTrusted || typeof e.key !== 'string') return;
    if (!isCapturable(e.target)) return;
    JitterBio.handleKeyup(bioSession, e.key, e.ctrlKey, e.metaKey, e.altKey);
}, true);

// Mouse sampling is not tied to a field: it is the pointer path on the page.
document.addEventListener('mousemove', (e) => {
    if (!captureOn || !e.isTrusted) return;
    JitterBio.handleMouseMove(bioSession, e.clientX, e.clientY);
});

// --- UTILS ---
window.addEventListener('paste', (e) => {
    if (!captureOn || !e.isTrusted || !isCapturable(e.target)) return;
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

// The field a badge certifies: the last capturable field that had focus.
// Never a password or another excluded field, even if it is focused right now.
function certifiedField() {
    let target = lastActiveElement;
    if (!target || !document.contains(target)) target = document.activeElement;
    if (!target || target.tagName === 'BODY' || target.tagName === 'HTML') return null;
    return isCapturable(target) ? target : null;
}

function certifiedText() {
    const target = certifiedField();
    if (!target) return null;
    if (target.value !== undefined) return target.value;
    if (target.isContentEditable) return target.innerText;
    return null;
}

function calculateStats() {
    const target = certifiedField();

    let totalCharsInBox = 0;
    if (target) {
        if (target.value !== undefined) totalCharsInBox = target.value.length;
        else if (target.isContentEditable) totalCharsInBox = target.innerText.length;
    }

    // Integrity is a share (typed here / characters in the field), never a
    // label: rhythm flags do not zero it.
    let integrity = 100;
    if (totalCharsInBox > 0) {
        integrity = Math.round((bioSession.humanChars / totalCharsInBox) * 100);
        if (integrity > 100) integrity = 100;
    } else if (bioSession.humanChars > 0) integrity = 100;

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
        // The shield shows how much of the field was typed here; it never
        // labels the writer. Rhythm flags travel inside the badge for the
        // server to weigh.
        if (stats.integrity < 80) statusColor = '#FF0055';

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
        // The buttons live in the page's DOM, so page script can call
        // element.click() on them. Those clicks are not trusted; ignore them.
        if (el) el.onclick = (e) => { if (e.isTrusted) handlers[id](); };
    });
}
function setupUI(){if(document.getElementById('jitter-shield'))return;const s=document.createElement('div');s.id='jitter-shield';s.className='jitter-passive';s.innerHTML='⚡';const m=document.createElement('div');m.id='jitter-menu';m.style.display='none';document.body.append(s,m);if(!document.getElementById('jitter-style')){const st=document.createElement('style');st.id='jitter-style';st.textContent=`#jitter-shield{position:fixed;bottom:20px;right:20px;background:#000;color:#444;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;z-index:2147483647;box-shadow:0 0 10px rgba(0,0,0,0.5);border:2px solid #333;transition:all 0.2s ease;user-select:none}#jitter-shield:hover{transform:scale(1.1);color:#fff;border-color:#fff;box-shadow:0 0 20px #ffffff66}#jitter-shield.jitter-active{border-color:#00F0FF!important;color:#00F0FF!important;box-shadow:0 0 15px #00F0FF66!important}#jitter-menu{position:fixed;bottom:75px;right:20px;background:#050505;color:#fff;border-radius:4px;font-family:'Courier New',monospace;z-index:2147483647;box-shadow:0 0 30px rgba(0,0,0,0.8);border:1px solid #333;width:240px;overflow:hidden}.jitter-header{padding:15px;background:#111;border-bottom:1px solid #333;display:flex;align-items:center;justify-content:space-between}.jitter-body{padding:15px}.jitter-row{display:flex;justify-content:space-between;margin-bottom:8px;font-size:12px;color:#aaa}.jitter-val{color:#fff;font-weight:600}.jitter-btn{background:#111;color:#fff;text-align:center;padding:12px;border-radius:2px;cursor:pointer;margin-top:12px;font-weight:600;font-size:12px;transition:all 0.1s ease;border:1px solid #333;letter-spacing:1px;user-select:none}.jitter-btn:hover{background:#222;border-color:#fff;color:#fff;box-shadow:0 0 10px rgba(255,255,255,0.2)}.jitter-btn.primary{background:#00F0FF11;color:#00F0FF;border-color:#00F0FF44}#btn-open-writer{margin-top:15px;border:1px solid #666;color:#ccc;background:#1a1a1a;box-shadow:0 0 5px rgba(0,0,0,0.5)}#btn-open-writer:hover{border-color:#00F0FF;color:#00F0FF;background:#00F0FF11;box-shadow:0 0 15px #00F0FF66;text-shadow:0 0 5px #00F0FF}`;document.head.appendChild(st)}s.addEventListener('click',()=>{const x=document.getElementById('jitter-menu');x.style.display=(x.style.display==='none')?'block':'none';updateUI()})}
// Badge payloads arrive from untrusted links and pasted text: escape every
// string before it goes anywhere near innerHTML.
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeDeep(v) {
    if (typeof v === 'string') return escapeHtml(v);
    if (Array.isArray(v)) return v.map(escapeDeep);
    if (v && typeof v === 'object') {
        const out = {};
        for (const k of Object.keys(v)) out[k] = escapeDeep(v[k]);
        return out;
    }
    return v;
}
document.addEventListener('click',(e)=>{const l=e.target.closest('a');if(!l||!captureOn)return;const u=l.href||"";if(u.includes(VERIFY_URL)){return}if(u.includes(ANCHOR_PREFIX)||l.dataset.jitterPayload){e.preventDefault();e.stopPropagation();let b=l.dataset.jitterPayload||u.split(ANCHOR_PREFIX)[1];if(b)showCertificate(b)}},true);
function runScanner(){scanLinks();new MutationObserver(()=>{if(scannerTimer)clearTimeout(scannerTimer);scannerTimer=setTimeout(scanLinks,500)}).observe(document.body,{childList:true,subtree:true})}
function scanLinks(){document.querySelectorAll('a').forEach(l=>{if(l.dataset.jitterProcessed||!l.href.includes(ANCHOR_PREFIX))return;l.style.borderBottom="2px solid #00F0FF";l.style.textDecoration="none";l.dataset.jitterProcessed="true";l.addEventListener('mouseenter',(e)=>showMiniHUD(l.href.split(ANCHOR_PREFIX)[1],e.clientX,e.clientY));l.addEventListener('mouseleave',hideMiniHUD)})}
function showMiniHUD(b, x, y) {
    if (!captureOn) return;
    try {
        const d = escapeDeep(JSON.parse(atob(b)));
        hideMiniHUD();
        const h = document.createElement('div');
        h.id = 'jitter-hud';
        h.style.cssText = `position:fixed;z-index:2147483647;background:#050505;border:1px solid #00F0FF;padding:10px;top:${y + 20}px;left:${x}px;color:#fff;font-family:monospace;border-radius:4px;box-shadow:0 0 20px #00F0FF44`;
        const warLine = d.war != null
            ? `<div style="margin-top:5px;font-weight:bold;color:#00F0FF">WAR: ${d.war} (${d.war_tier || '—'})</div>`
            : `<div style="margin-top:5px;font-weight:bold;color:#00F0FF">INT: ${d.integrity}%</div>`;
        h.innerHTML = `<div>⚡ JITTER</div><div style="font-size:10px;color:#aaa">${d.date}</div>${warLine}<div style="font-size:10px;color:#666;margin-top:4px">click to check signature</div>`;
        document.body.appendChild(h);
    } catch (e) {}
}
function hideMiniHUD(){const h=document.getElementById('jitter-hud');if(h)h.remove()}
async function showCertificate(b) {
    if (!captureOn) return;
    try {
        const raw = JSON.parse(atob(b));
        const m = document.getElementById('jitter-menu');
        if (!m) return;
        m.style.display = 'block';

        // Check the signature before showing anything as verified. This proves
        // the badge wasn't altered after signing; it does not yet prove who
        // signed it (the badge carries its own public key).
        let sig = { label: 'UNSIGNED', color: '#FFD700', note: 'no cryptographic proof' };
        if (raw.signature && raw.publicKeyJwk && typeof CryptoUtils !== 'undefined') {
            const { signature, ...payload } = raw;
            let ok = false;
            try { ok = await CryptoUtils.verifyBadge(payload, signature, raw.publicKeyJwk); } catch (e) {}
            sig = ok
                ? { label: 'SIGNATURE VALID', color: '#00F0FF', note: 'not altered since signing' }
                : { label: 'SIGNATURE INVALID', color: '#FF0055', note: 'badge may be forged' };
        }

        const d = escapeDeep(raw);

        // Format passport display
        let passportDisplay = '—';
        if (typeof raw.passport === 'number') {
            const k = raw.passport;
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
            <div class="jitter-header" style="background:${sig.color}11;border-color:${sig.color}">
                <span class="jitter-title" style="color:${sig.color}">CERTIFICATE</span>
                <span class="jitter-close">×</span>
            </div>
            <div class="jitter-body" style="text-align:center">
                <div style="font-size:40px;margin-bottom:10px">⚡</div>
                <div style="font-weight:bold;color:${sig.color}">${sig.label}</div>
                <div style="font-size:11px;color:#888;margin-bottom:10px">${sig.note}</div>
                <div style="font-weight:bold;color:#fff">${d.title || 'Badge'}</div>
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
        m.querySelector('.jitter-close').addEventListener('click', () => { m.style.display = 'none'; });
    } catch (e) {}
}
const MIN_KEYS_FOR_BADGE = 20; // same floor the attestation server applies

async function copyBadge(s, isSessionEnd) {
    // The badge records; it never refuses. Rhythm flags from the engine
    // travel inside it (war_flags) for the server and the verifier to weigh.
    const loki = JitterBio.analyzeLoki(bioSession);
    // A badge with nothing behind it proves nothing.
    if (s.typed < MIN_KEYS_FOR_BADGE) {
        alert(`Type at least ${MIN_KEYS_FOR_BADGE} characters before minting a badge (${s.typed} so far).`);
        return;
    }

    const profile = JitterBio.getProfile(bioSession);

    // A session is completed when it is stopped, not on every mint
    if (isSessionEnd) {
        passport.sessionsCompleted++;
        touchPassport(s.typed, true);
    } else {
        passport.lastUsed = Date.now();
    }
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
    const warUncapped = warResult ? warResult.war : null; // applyTimeCap caps in place
    const cappedWar = warResult ? JitterBio.applyTimeCap(warResult, passport.firstUsed) : null;

    const p = {
        version: '3.0',
        type: 'content',
        title: 'Verified',
        timestamp: Date.now(),
        // WAR (v3.0)
        war: cappedWar ? cappedWar.war : null,
        war_uncapped: warUncapped, // typing score after penalties, before the client-side age cap
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
        date: new Date().toISOString().slice(0, 10),
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
        // Crypto chain
        previousBadge: previousBadgeHash,
        publicKeyId: publicKeyFingerprint,
        publicKeyJwk: publicKeyJwk
    };

    // Bind the badge to what it certifies: the text in the field that was
    // typed into, and where. A badge can't be moved to a different text.
    const certified = certifiedText();
    p.text_hash = certified != null && typeof CryptoUtils !== 'undefined' ? await CryptoUtils.textHash(certified) : null;
    p.url = location.origin + location.pathname;
    p.minted_at = new Date().toISOString();

    // Sign with the device key
    let signature = null;
    if (typeof CryptoUtils !== 'undefined') {
        signature = await CryptoUtils.signBadge(p);
    }

    // Attest: the server registers the device, applies the age-based cap and
    // countersigns. Adds nothing the device signed over; never blocks the copy.
    let verifyHref = null;
    if (signature) {
        const res = await CryptoUtils.attest(ATTEST_URL, 'extension', p, signature);
        if (res) {
            p.attestation = res.attestation;
            p.server_signature = res.server_signature || null;
            p.server_key_id = res.server_key_id || null;
            verifyHref = `${VERIFY_URL}?hash=${res.badge_hash}`;
        }
        p.signature = signature;
    }

    const b = btoa(JSON.stringify(p));
    const badgeHash = typeof CryptoUtils !== 'undefined' ? await CryptoUtils.hashBadge(b) : null;
    const id = (badgeHash || b).slice(0, 6).toUpperCase();
    if (!verifyHref) verifyHref = `${ANCHOR_PREFIX}${b}`;

    // Store badge hash for chain
    if (typeof CryptoUtils !== 'undefined') {
        await CryptoUtils.storeBadgeHash(b);
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