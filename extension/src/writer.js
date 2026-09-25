/**
 * writer.js - JITTEr Writer (process receipt v4.0)
 *
 * Copyright (c) 2025-2026 Denis Gingras. All Rights Reserved.
 *
 * PROPRIETARY AND CONFIDENTIAL
 * This file is part of the JITTEr project and contains proprietary
 * algorithms. Unauthorized copying, modification, distribution, or use of
 * this software is strictly prohibited without explicit written permission.
 * See LICENSE file for full terms.
 *
 * Records how a text is entered (typed / pasted / deleted, sittings, active
 * writing time, typing rhythm), autosaves the document on this device and
 * issues a signed process receipt. It records; it never refuses.
 * Contract: docs/product/PROCESS_RECEIPT.md.
 *
 * The ledger holds operations, never characters. Content snapshots (the
 * student's replay) live in the checkpoints of the local ledger file only.
 */

const ATTEST_URL = "https://fmguuhnustgcqzgjaoil.supabase.co/functions/v1/attest";
const VERIFY_URL = "https://fmguuhnustgcqzgjaoil.supabase.co/functions/v1/verify";
const DOC_KEY = 'writerDoc';           // one chrome.storage.local key for the whole document
const RECEIPT_VERSION = '4.0';
const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);

// --- STATE ---
const ledger = { ops: [], checkpoints: [], hash: null };
const doc = {
    sessionCount: 0,        // sittings so far (a `session` op per sitting)
    typedSinceReceipt: 0,   // keystrokes since the last receipt (passport history)
    textLen: 0,             // editor text length after the last input event
    lastCheckpointAt: 0,
    ready: false,
};
let passport = { totalKeystrokes: 0, firstUsed: null, lastUsed: null, sessionsCompleted: 0 };
let bioSession = JitterBio.createSession();
let run = null;             // pending typing run { start, last, n }
let runTimer = null;
let blurred = false;
let pasteSelection = 0;     // characters selected when a paste arrived (they are replaced)
let checkpointQueue = Promise.resolve();
let saveTimer = null;
let lastReceipt = null;     // { payload, json, base64, blockID }
let replayInterval = null;

// --- HELPERS ---
function $(id) { return document.getElementById(id); }
function editorEl() { return $('editor'); }
function editorText() { const ed = editorEl(); return ed ? ed.innerText : ''; }
function normalizedText() { return editorText().replace(/\r\n?/g, '\n').trim(); }
// Text length measure for delete counting: text nodes only, so block
// boundaries and placeholder <br>s never look like typed or deleted characters.
function measureText() { const ed = editorEl(); return ed ? ed.textContent.length : 0; }
function nowIso(ms) { return new Date(ms || Date.now()).toISOString(); }
function wordCount(text) { return text.trim().split(/\s+/).filter(w => w.length > 0).length; }
function setText(id, text) { const el = $(id); if (el) el.innerText = text; }
function fmt(n) { return Number(n || 0).toLocaleString('en-US'); }

function selectionLength() {
    try {
        const sel = window.getSelection();
        const ed = editorEl();
        if (!sel || !sel.rangeCount || !ed || !ed.contains(sel.anchorNode)) return 0;
        return sel.toString().length;
    } catch (e) { return 0; }
}

function getCursorOffset() {
    const editor = editorEl();
    const sel = window.getSelection();
    if (!editor || !sel || !sel.rangeCount || !editor.contains(sel.anchorNode)) return 0;
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.setEnd(sel.anchorNode, sel.anchorOffset);
    return range.toString().length;
}

function placeCaretAtEnd(ed) {
    try {
        const range = document.createRange();
        range.selectNodeContents(ed);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    } catch (e) {}
}

function flash(id, text, ms) {
    const btn = $(id);
    if (!btn) return;
    const old = btn.dataset.label || btn.innerText;
    btn.dataset.label = old;
    btn.innerText = text;
    setTimeout(() => { btn.innerText = old; }, ms || 2000);
}

function downloadJson(json, filename) {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileSlug() {
    return 'untitled-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
}

// --- LEDGER: operations (never characters) ---
function pushOp(fields, atMs) {
    const t = atMs || Date.now();
    const op = { op: fields.op, t: nowIso(t) };
    for (const k of Object.keys(fields)) if (k !== 'op' && k !== 't') op[k] = fields[k];
    ledger.ops.push(op);
    scheduleSave();
    return op;
}

function lastOpEndMs() {
    if (run) return run.last;
    const last = ledger.ops[ledger.ops.length - 1];
    if (!last) return 0;
    const t = Date.parse(last.t);
    return last.op === 'type' ? t + (last.ms || 0) : t;
}

function startSitting(now) {
    doc.sessionCount++;
    pushOp({ op: 'session', k: doc.sessionCount }, now);
    takeCheckpoint('session');
}

// A gap over 10 minutes since the previous operation starts a new sitting.
function noteGap(now) {
    const prevEnd = lastOpEndMs();
    if (prevEnd && now - prevEnd > JitterReceipt.SESSION_GAP_MS) {
        flushRun();
        startSitting(now);
    }
}

function recordOp(fields, opts) {
    const now = Date.now();
    flushRun();
    noteGap(now);
    pushOp(fields, now);
    if (!(opts && opts.skipCheckpoint)) maybeCheckpoint(now);
}

// A typed key joins the pending run or starts a new one. A run ends at a
// pause over 2 s, at any other operation, or at 50 keys.
function typedKey(now) {
    noteGap(now);
    if (run && now - run.last <= JitterReceipt.RUN_PAUSE_MS && run.n < JitterReceipt.RUN_MAX_KEYS) {
        run.n++;
        run.last = now;
    } else {
        flushRun();
        run = { start: now, last: now, n: 1 };
    }
    clearTimeout(runTimer);
    runTimer = setTimeout(() => { flushRun(); maybeCheckpoint(Date.now()); updateDashboard(); }, JitterReceipt.RUN_PAUSE_MS + 100);
    doc.typedSinceReceipt++;
    passport.totalKeystrokes++;
    passport.lastUsed = now;
    scheduleSave();
}

function flushRun() {
    if (!run) return;
    const r = run;
    run = null;
    clearTimeout(runTimer);
    runTimer = null;
    pushOp({ op: 'type', n: r.n, ms: Math.max(0, r.last - r.start) }, r.start);
}

// --- LEDGER: checkpoints (hash-chained content snapshots) ---
// hash = sha256(prev_hash + '|' + op_index + '|' + t + '|' + content_hash), prev_hash = 'genesis' first.
// Taken after at most 60 s of activity, after every paste, at every sitting
// boundary and at minting. Hashing is async, so checkpoints are queued to
// keep the chain in order; the snapshot itself is taken synchronously.
function takeCheckpoint(reason) {
    flushRun();
    const snap = { op_index: ledger.ops.length, t: nowIso(), content: editorText(), reason };
    doc.lastCheckpointAt = Date.now();
    checkpointQueue = checkpointQueue.then(async () => {
        const prev = ledger.checkpoints.length ? ledger.checkpoints[ledger.checkpoints.length - 1].hash : 'genesis';
        const content_hash = await JitterReceipt.sha256Hex(snap.content);
        const hash = await JitterReceipt.checkpointHash(prev, snap.op_index, snap.t, content_hash);
        ledger.checkpoints.push({ i: ledger.checkpoints.length, op_index: snap.op_index, t: snap.t, content_hash, content: snap.content, hash });
        ledger.hash = hash;
        updateLedgerUI();
        scheduleSave();
    }).catch(err => console.error('Checkpoint failed', err));
    return checkpointQueue;
}

function maybeCheckpoint(now) {
    if (now - doc.lastCheckpointAt >= JitterReceipt.CHECKPOINT_ACTIVITY_MS) takeCheckpoint('activity');
}

// Characters pasted between checkpoint idx-1 and idx (0 when none).
function pastedBefore(idx) {
    const cp = ledger.checkpoints[idx];
    if (!cp) return 0;
    const from = idx > 0 ? ledger.checkpoints[idx - 1].op_index : 0;
    return ledger.ops.slice(from, cp.op_index).filter(op => op.op === 'paste').reduce((s, op) => s + (op.len || 0), 0);
}

function updateLedgerUI() {
    setText('ledger-count', ledger.checkpoints.length + ' blocks');
    const hashEl = $('ledger-hash');
    if (hashEl) hashEl.innerText = ledger.hash ? ledger.hash.substring(0, 12).toUpperCase() : '—';
}

// --- AUTOSAVE / RESTORE ---
function scheduleSave() {
    if (!doc.ready) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 1000);
}

function snapshotState() {
    return {
        version: RECEIPT_VERSION,
        savedAt: Date.now(),
        html: editorEl().innerHTML,
        ledger: { ops: ledger.ops, checkpoints: ledger.checkpoints },
        sessionCount: doc.sessionCount,
        typedSinceReceipt: doc.typedSinceReceipt,
        pendingRun: run ? { start: run.start, last: run.last, n: run.n } : null,
        bio: bioSession,
    };
}

async function saveNow() {
    if (!doc.ready) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
        await chrome.storage.local.set({ [DOC_KEY]: snapshotState(), passport });
        setText('save-state', 'saved ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
    } catch (e) {
        setText('save-state', 'not saved');
    }
}

// The biometrics session persists across sittings, but no timing may span two
// of them: the transient fields are reset.
function restoreBioSession(saved) {
    const s = JitterBio.createSession();
    if (saved && typeof saved === 'object') Object.assign(s, saved);
    for (const k of ['flightTimes', 'dwellTimes', 'ddTimes', 'flowIntervals', 'gapIntervals', 'fatigueWindows', 'bursts', 'pasteLengths']) {
        if (!Array.isArray(s[k])) s[k] = [];
    }
    if (!s.bigramTimings || typeof s.bigramTimings !== 'object') s.bigramTimings = {};
    if (!s.perKeyDwells || typeof s.perKeyDwells !== 'object') s.perKeyDwells = {};
    s.lastKeyTime = 0;
    s.lastKeyDownTime = 0;
    s.keyDownTimes = {};
    s.currentBurst = 0;
    s.lastKeyChar = '';
    s.lastMouseSampleTime = 0;
    s.mousePositions = [];
    return s;
}

async function loadState() {
    let stored = {};
    try { stored = (await chrome.storage.local.get([DOC_KEY, 'passport'])) || {}; } catch (e) { stored = {}; }
    if (stored.passport && typeof stored.passport === 'object') passport = Object.assign({}, passport, stored.passport);
    if (!passport.firstUsed) passport.firstUsed = Date.now();
    passport.lastUsed = Date.now();

    const state = stored[DOC_KEY];
    if (!state || state.version !== RECEIPT_VERSION) return false;
    const ed = editorEl();
    ed.innerHTML = typeof state.html === 'string' ? state.html : '';
    const saved = state.ledger && typeof state.ledger === 'object' ? state.ledger : {};
    ledger.ops = Array.isArray(saved.ops) ? saved.ops : [];
    ledger.checkpoints = Array.isArray(saved.checkpoints) ? saved.checkpoints : [];
    ledger.hash = ledger.checkpoints.length ? ledger.checkpoints[ledger.checkpoints.length - 1].hash : null;
    doc.sessionCount = state.sessionCount > 0 ? Math.floor(state.sessionCount) : 0;
    doc.typedSinceReceipt = state.typedSinceReceipt > 0 ? Math.floor(state.typedSinceReceipt) : 0;
    const pr = state.pendingRun;
    if (pr && pr.n > 0 && pr.start > 0) pushOp({ op: 'type', n: pr.n, ms: Math.max(0, (pr.last || pr.start) - pr.start) }, pr.start);
    bioSession = restoreBioSession(state.bio);
    return true;
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', async () => {
    const ed = editorEl();
    await loadState();
    doc.textLen = measureText();

    // Every load is a new sitting
    doc.sessionCount++;
    pushOp({ op: 'session', k: doc.sessionCount });

    if (ed) {
        ed.addEventListener('keydown', handleKeydown);
        ed.addEventListener('keyup', handleKeyup);
        ed.addEventListener('paste', handlePaste);
        ed.addEventListener('input', handleInput);
        ed.addEventListener('click', () => {
            JitterBio.handleCursorMove(bioSession, getCursorOffset());
            updateDashboard();
        });
    }
    window.addEventListener('blur', () => {
        if (blurred || !doc.ready) return;
        blurred = true;
        recordOp({ op: 'blur' }, { skipCheckpoint: true });
        saveNow();
    });
    window.addEventListener('focus', () => {
        if (!blurred) return;
        blurred = false;
        recordOp({ op: 'focus' }, { skipCheckpoint: true });
        updateDashboard();
    });
    window.addEventListener('pagehide', () => { saveNow(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });

    const on = (id, handler) => { const el = $(id); if (el) el.addEventListener('click', handler); };
    on('btn-export', getReceipt);
    on('btn-download-receipt', downloadReceipt);
    on('btn-export-ledger', exportLedger);
    on('btn-new-doc', newDocument);
    on('btn-replay', openReplay);
    setupToolbar();

    doc.ready = true;
    await takeCheckpoint('session');
    updateDashboard();
    setInterval(updateActiveTime, 1000);
    await saveNow();

    if (ed) {
        ed.focus();
        placeCaretAtEnd(ed);
        ed.setAttribute('data-ready', '1');
    }
});

// --- INPUT CAPTURE ---
function handleKeydown(e) {
    if (NAV_KEYS.has(e.key)) {
        JitterBio.handleCursorMove(bioSession, getCursorOffset());
        return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
        // The characters actually removed are counted from the input event.
        JitterBio.handleKeydown(bioSession, e.key, e.ctrlKey, e.metaKey, e.altKey);
        return;
    }
    if (e.ctrlKey || e.metaKey) return;
    if (e.key === 'Enter' || e.key.length === 1) {
        if (e.key.length === 1) JitterBio.handleKeydown(bioSession, e.key, e.ctrlKey, e.metaKey, e.altKey);
        typedKey(Date.now());
        updateDashboard();
    }
}

function handleKeyup(e) {
    JitterBio.handleKeyup(bioSession, e.key, e.ctrlKey, e.metaKey, e.altKey);
    JitterBio.handleCursorMove(bioSession, getCursorOffset());
}

// Deleted characters are measured, not guessed: the editor text length before
// and after each input event. A deleted selection counts fully; a key typed
// over a selection counts the selection as deleted.
function handleInput(e) {
    const cur = measureText();
    const delta = cur - doc.textLen;
    doc.textLen = cur;
    const type = (e && e.inputType) || '';
    let removed = 0;
    if (type === 'insertFromPaste') removed = pasteSelection;
    else if (type === 'insertText') removed = Math.max(0, ((e.data || '').length) - delta);
    else if (type === 'insertCompositionText' || type === 'deleteCompositionText' || type.startsWith('format')) removed = 0;
    else removed = Math.max(0, -delta); // delete*, insertParagraph, drop, undo/redo, replacement text
    pasteSelection = 0;
    if (removed > 0) recordOp({ op: 'delete', n: removed });
    updateDashboard();
}

function handlePaste(e) {
    let text = '';
    try {
        if (e.clipboardData) text = e.clipboardData.getData('text/plain') || e.clipboardData.getData('text') || '';
    } catch (err) { text = ''; }
    if (!text.length) return; // files and images enter no text
    pasteSelection = selectionLength();
    JitterBio.handlePaste(bioSession, text.length);
    recordOp({ op: 'paste', len: text.length }, { skipCheckpoint: true });
    // The pasted text lands after this event's default action; the checkpoint
    // "after every paste" is taken once it is in the document.
    setTimeout(() => { takeCheckpoint('paste'); updateDashboard(); }, 0);
    updateDashboard();
}

// --- SIDEBAR ---
function liveOps() {
    return run ? ledger.ops.concat([{ op: 'type', t: run.start, n: run.n, ms: run.last - run.start }]) : ledger.ops;
}

function liveActiveMs() {
    let ms = JitterReceipt.activeMs(liveOps());
    const lastEnd = lastOpEndMs();
    if (lastEnd && !blurred) {
        const tail = Date.now() - lastEnd;
        if (tail > 0 && tail <= JitterReceipt.SESSION_GAP_MS) ms += Math.min(tail, JitterReceipt.ACTIVE_GAP_CAP_MS);
    }
    return ms;
}

function updateActiveTime() {
    setText('active-time', JitterReceipt.formatDuration(liveActiveMs()));
}

function updatePassportUI() {
    const first = passport.firstUsed ? JitterReceipt.formatDay(passport.firstUsed) : 'today';
    const n = passport.sessionsCompleted || 0;
    setText('passport-line', 'Device first used ' + first + ' · ' + n + (n === 1 ? ' receipt' : ' receipts'));
}

function updateDashboard() {
    const ed = editorEl();
    if (!ed) return;
    const c = JitterReceipt.countOps(ledger.ops);
    setText('word-count', fmt(wordCount(ed.innerText)));
    setText('typed-count', fmt(c.typed + (run ? run.n : 0)));
    setText('pasted-count', fmt(c.pasted));
    setText('paste-events', c.pastes === 0 ? 'no pastes' : c.pastes === 1 ? '1 paste' : c.pastes + ' pastes');
    setText('deleted-count', fmt(c.deleted));
    setText('sittings-count', String(Math.max(1, JitterReceipt.sessionsFrom(ledger.ops).length)));
    updateActiveTime();
    updateLedgerUI();
    updatePassportUI();
}

// --- NEW DOCUMENT ---
async function newDocument() {
    if (!confirm('Start a new document? The current text and its ledger will be cleared from this device.')) return;
    run = null;
    clearTimeout(runTimer);
    runTimer = null;
    editorEl().innerHTML = '';
    ledger.ops = [];
    ledger.checkpoints = [];
    ledger.hash = null;
    bioSession = JitterBio.createSession();
    doc.sessionCount = 0;
    doc.typedSinceReceipt = 0;
    doc.textLen = 0;
    doc.lastCheckpointAt = 0;
    pasteSelection = 0;
    lastReceipt = null;
    const dl = $('btn-download-receipt');
    if (dl) dl.disabled = true;
    startSitting(Date.now());
    await checkpointQueue;
    updateDashboard();
    await saveNow();
    editorEl().focus();
}

// --- GET RECEIPT ---
// Builds the v4 payload, signs it with the device key, attests it when the
// server is reachable, copies the badge and keeps it for download.
async function getReceipt() {
    const text = editorText();
    const normalized = text.replace(/\r\n?/g, '\n').trim();
    if (!normalized.length) { flash('btn-export', 'TYPE SOMETHING FIRST'); return; }

    flushRun();
    await takeCheckpoint('mint');
    const now = Date.now();

    const profile = JitterBio.getProfile(bioSession);
    const warResult = profile ? JitterBio.scoreWAR(bioSession, profile) : null;
    const war = warResult && typeof warResult.war === 'number' && isFinite(warResult.war) ? warResult.war : 0;
    const totalEdits = (bioSession.humanChars || 0) + (bioSession.backwardEdits || 0);
    const linearity = profile && typeof profile.editing_linearity === 'number' ? profile.editing_linearity
        : (totalEdits > 0 ? 1 - (bioSession.backwardEdits || 0) / totalEdits : 1);

    const process = JitterReceipt.buildProcess(ledger.ops, {
        finishedAt: now,
        revision: {
            backspaces: bioSession.backspaceCount || 0,
            cursor_jumps: bioSession.cursorJumps || 0,
            backward_edits: bioSession.backwardEdits || 0,
            editing_linearity: linearity,
        },
    });

    await CryptoUtils.getOrCreateKeyPair();
    const publicKeyId = await CryptoUtils.getPublicKeyFingerprint();
    const publicKeyJwk = await CryptoUtils.getPublicKeyJwk();
    const previousBadge = await CryptoUtils.getPreviousBadgeHash();

    const payload = {
        version: RECEIPT_VERSION,
        type: 'process-receipt',
        title: 'Untitled',
        text_hash: await CryptoUtils.textHash(text),
        chars: normalized.length,
        words: wordCount(text),
        url: 'jitter://writer',
        minted_at: new Date(now).toISOString(),
        publicKeyJwk: publicKeyJwk,
        publicKeyId: publicKeyId,
        previousBadge: previousBadge,
        keys: process.typed_chars,
        war: war,
        war_uncapped: war,
        process: process,
        typing: {
            mean_dwell: profile ? profile.mean_dwell : null,
            std_dwell: profile ? profile.std_dwell : null,
            mean_flight: profile ? profile.mean_inter_key : null,
            std_flight: profile ? profile.std_inter_key : null,
            keys: process.typed_chars,
        },
        ledger: { hash: ledger.hash, checkpoints: ledger.checkpoints.length, ops: ledger.ops.length },
    };

    // Sign with the device key, then attest (optional; the receipt verifies offline)
    let verifyHref = null;
    const signature = await CryptoUtils.signBadge(payload);
    if (signature) {
        const res = await CryptoUtils.attest(ATTEST_URL, 'writer', payload, signature);
        if (res) {
            payload.attestation = res.attestation;
            payload.server_signature = res.server_signature || null;
            payload.server_key_id = res.server_key_id || null;
            verifyHref = `${VERIFY_URL}?hash=${res.badge_hash}`;
        }
        payload.signature = signature;
    }

    const json = JSON.stringify(payload);
    const base64 = btoa(json);
    const badgeHash = await CryptoUtils.hashBadge(base64);
    const blockID = (badgeHash || base64).slice(0, 6).toUpperCase();
    await CryptoUtils.storeBadgeHash(base64);

    // Passport: one receipt more on this device
    passport.sessionsCompleted++;
    passport.lastUsed = now;
    if (typeof PassportUtils !== 'undefined') PassportUtils.updatePassport(passport, doc.typedSinceReceipt, true);
    doc.typedSinceReceipt = 0;

    lastReceipt = { payload, json, base64, blockID };
    const dl = $('btn-download-receipt');
    if (dl) dl.disabled = false;

    const code = verifyHref || `#jitter:${base64}`;
    const htmlBadge = `<a href="${code}" style="text-decoration:none;" data-jitter-payload="${base64}"><span style="background:#00F0FF11;color:#00F0FF;border:1px solid #00F0FF;padding:2px 6px;font-size:10px;font-family:monospace;border-radius:4px;">⚡ JITTER RECEIPT 0x${blockID}</span></a>`;
    const plainBadge = `\n\n[ JITTER RECEIPT 0x${blockID} | typed ${JitterReceipt.percent(process.typed_share, process.pasted_chars)} | ${process.sessions.length} sitting${process.sessions.length === 1 ? '' : 's'} ]\n${code}`;

    try {
        const data = [new ClipboardItem({ 'text/html': new Blob([htmlBadge], { type: 'text/html' }), 'text/plain': new Blob([plainBadge], { type: 'text/plain' }) })];
        navigator.clipboard.write(data).then(() => flash('btn-export', 'COPIED!')).catch(() => flash('btn-export', 'RECEIPT READY'));
    } catch (e) {
        flash('btn-export', 'RECEIPT READY');
    }
    updateDashboard();
    saveNow();
}

function downloadReceipt() {
    if (!lastReceipt) { flash('btn-download-receipt', 'GET A RECEIPT FIRST'); return; }
    downloadJson(lastReceipt.json, fileSlug() + '.jitter-receipt.json');
    flash('btn-download-receipt', 'DOWNLOADED!');
}

// --- LEDGER FILE (the student's, shared only for a replay) ---
async function exportLedger() {
    flushRun();
    const last = ledger.checkpoints[ledger.checkpoints.length - 1];
    if (!last || last.op_index !== ledger.ops.length || last.content !== editorText()) await takeCheckpoint('export');
    else await checkpointQueue;

    const file = {
        version: RECEIPT_VERSION,
        type: 'jitter-ledger',
        started_at: ledger.ops.length ? ledger.ops[0].t : nowIso(),
        exported_at: nowIso(),
        ops: ledger.ops,
        checkpoints: ledger.checkpoints,
        final_hash: ledger.hash,
    };
    downloadJson(JSON.stringify(file), fileSlug() + '.jitter-ledger.json');
    flash('btn-export-ledger', 'DOWNLOADED!');
}

// --- REPLAY (over the checkpoints' content snapshots) ---
function openReplay() {
    const panel = $('replay-panel');
    if (!panel) return;
    const isHidden = !panel.style.display || panel.style.display === 'none';
    panel.style.display = isHidden ? 'flex' : 'none';
    if (panel.style.display === 'flex') {
        const scrubber = $('replay-scrubber');
        if (scrubber) {
            scrubber.max = Math.max(0, ledger.checkpoints.length - 1);
            scrubber.value = 0;
        }
        renderReplay(0);
    }
}

function renderReplay(checkpointIdx) {
    if (ledger.checkpoints.length === 0) return;
    const idx = Math.max(0, Math.min(checkpointIdx | 0, ledger.checkpoints.length - 1));
    const cp = ledger.checkpoints[idx];
    if (!cp) return;
    const pasted = pastedBefore(idx);

    const replayEditor = $('replay-editor');
    if (replayEditor) {
        replayEditor.innerText = cp.content;
        if (pasted > 0) {
            replayEditor.style.background = '#FFD70022';
            replayEditor.style.borderColor = '#FFD700';
            setTimeout(() => {
                replayEditor.style.background = '#0a0a0a';
                replayEditor.style.borderColor = '#222';
            }, 800);
        } else {
            replayEditor.style.background = '#0a0a0a';
            replayEditor.style.borderColor = '#222';
        }
    }

    const replayTime = $('replay-time');
    if (replayTime) {
        const origin = ledger.ops.length ? Date.parse(ledger.ops[0].t) : Date.parse(cp.t);
        const elapsed = Math.max(0, Math.round((Date.parse(cp.t) - origin) / 1000));
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        replayTime.innerText = `T+${mins}:${String(secs).padStart(2, '0')} · block ${idx + 1}/${ledger.checkpoints.length}`;
    }

    const replayPaste = $('replay-paste-indicator');
    if (replayPaste) {
        replayPaste.innerText = pasted > 0 ? `📋 PASTE OF ${fmt(pasted)} CHARACTERS IN THIS BLOCK` : '';
        replayPaste.style.display = pasted > 0 ? 'block' : 'none';
    }

    // Time away between this checkpoint and the next
    const blurPanel = $('replay-blur-indicator');
    if (blurPanel) {
        const startOp = cp.op_index;
        const endOp = ledger.checkpoints[idx + 1] ? ledger.checkpoints[idx + 1].op_index : ledger.ops.length;
        const away = JitterReceipt.awayFrom(ledger.ops.slice(startOp, endOp));
        if (away.events > 0) {
            blurPanel.innerText = `Away from the Writer for ${JitterReceipt.formatDuration(away.total_ms)}`;
            blurPanel.style.display = 'block';
        } else {
            blurPanel.style.display = 'none';
        }
    }
}

function toggleReplayPlayback() {
    const btn = $('replay-play-btn');
    if (replayInterval) {
        clearInterval(replayInterval);
        replayInterval = null;
        if (btn) btn.innerText = '▶ PLAY';
    } else {
        const scrubber = $('replay-scrubber');
        let idx = parseInt(scrubber ? scrubber.value : 0, 10) || 0;
        const max = ledger.checkpoints.length - 1;
        if (idx >= max) idx = 0;
        if (btn) btn.innerText = '⏸ PAUSE';
        replayInterval = setInterval(() => {
            idx++;
            if (scrubber) scrubber.value = idx;
            renderReplay(idx);
            if (idx >= max) {
                clearInterval(replayInterval);
                replayInterval = null;
                if (btn) btn.innerText = '▶ PLAY';
            }
        }, 600);
    }
}

// --- TOOLBAR ---
function setupToolbar() {
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.execCommand(btn.dataset.cmd, false, btn.dataset.val || null);
            const ed = editorEl();
            if (ed) ed.focus();
        });
    });

    const fSelect = $('font-select');
    const sSelect = $('spacing-select');
    const ed = editorEl();
    if (fSelect && ed) fSelect.addEventListener('change', (e) => { ed.className = ed.className.replace(/font-\w+/, '') + ' ' + e.target.value; });
    if (sSelect && ed) sSelect.addEventListener('change', (e) => { ed.className = ed.className.replace(/spacing-\w+/, '') + ' ' + e.target.value; });
}
