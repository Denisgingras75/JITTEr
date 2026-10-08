/**
 * verify-page.js - JITTEr receipt check (process receipt v4.0)
 *
 * The teacher's page: checks a process receipt (or an older v3 badge) against
 * the essay and, optionally, the student's ledger file, then describes what
 * the receipt records. Lives in its own file because Manifest V3 pages can't
 * run inline scripts; the timeline is inline SVG (no libraries).
 * Contract: docs/product/PROCESS_RECEIPT.md.
 *
 * Copyright (c) 2025-2026 Denis Gingras. All Rights Reserved.
 */

// Receipts arrive from untrusted links and pasted text: escape every string
// before it goes anywhere near innerHTML.
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

const R = JitterReceipt;
let ledgerReplay = null; // { checkpoints, pasteBefore, originMs } for the scrubber

// --- input decoding ---
function extractBadgeData(input) {
    input = input.trim();
    const htmlMatch = input.match(/data-jitter-payload="([^"]+)"/);
    if (htmlMatch) return { base64: htmlMatch[1] };
    const urlMatch = input.match(/#jitter:([A-Za-z0-9+/=]+)/);
    if (urlMatch) return { base64: urlMatch[1] };
    if (input[0] === '{') return { json: input };
    if (/^https?:\/\//.test(input) && /[?&]hash=/.test(input)) return { link: input };
    return { base64: input.replace(/\s+/g, '') };
}

function decodeReceipt(input) {
    const found = extractBadgeData(input);
    if (found.link) throw new Error('This is a link to the server record only. Paste the receipt code or the badge to check it here.');
    const raw = JSON.parse(found.json || atob(found.base64));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('The decoded data is not a receipt.');
    return raw;
}

// --- checks ---
async function checkSignature(raw) {
    if (!raw.signature || !raw.publicKeyJwk) return 'unsigned';
    try {
        return (await CryptoUtils.verifyBadge(CryptoUtils.signedPart(raw), raw.signature, raw.publicKeyJwk)) ? 'valid' : 'invalid';
    } catch (e) {
        return 'invalid';
    }
}

async function checkText(raw, pastedText) {
    if (!pastedText.trim()) return 'none';
    if (!raw.text_hash) return 'unbound';
    return (await CryptoUtils.textHash(pastedText)) === raw.text_hash ? 'match' : 'mismatch';
}

// 'none' | 'mismatch' | 'unsigned' | 'unchecked' | 'valid' | 'invalid'
async function checkServer(raw) {
    const att = raw.attestation && typeof raw.attestation === 'object' ? raw.attestation : null;
    if (!att) return 'none';
    const deviceId = raw.publicKeyJwk ? await CryptoUtils.deviceIdFromJwk(raw.publicKeyJwk) : null;
    const clientScore = raw.war_uncapped != null ? raw.war_uncapped : raw.war;
    const consistent = (att.text_hash == null || att.text_hash === raw.text_hash)
        && (att.device_id == null || att.device_id === deviceId)
        && (att.war_client == null || Number(att.war_client) === Number(clientScore));
    if (!consistent) return 'mismatch';
    if (!raw.server_signature) return 'unsigned';
    return CryptoUtils.verifyServerSignature(att, raw.server_signature, raw.server_key_id);
}

async function checkLedgerFile(view) {
    const input = document.getElementById('ledger-input');
    const file = input && input.files && input.files[0];
    if (!file) return null;
    let parsed;
    try {
        parsed = JSON.parse(await file.text());
    } catch (e) {
        return { error: 'The ledger file could not be read as JSON.' };
    }
    if (!parsed || typeof parsed !== 'object') return { error: 'The ledger file is not a ledger.' };
    const chain = await R.verifyLedger(parsed);
    const checkpoints = Array.isArray(parsed.checkpoints) ? parsed.checkpoints : [];
    const ops = Array.isArray(parsed.ops) ? parsed.ops : [];
    const receiptHash = view.ledger && view.ledger.hash;
    let match = 'no', matchIndex = -1;
    if (receiptHash && chain.final_hash === receiptHash) { match = 'final'; matchIndex = checkpoints.length - 1; }
    else if (receiptHash) {
        const idx = checkpoints.findIndex(cp => cp && cp.hash === receiptHash);
        if (idx >= 0) { match = 'earlier'; matchIndex = idx; }
    }
    let countsMatch = null;
    if (view.process && match !== 'no') {
        const upTo = match === 'final' ? ops.length : Math.min(ops.length, Number(checkpoints[matchIndex].op_index) || 0);
        const c = R.countOps(ops.slice(0, upTo));
        countsMatch = c.typed === view.process.typed_chars && c.pasted === view.process.pasted_chars && c.deleted === view.process.deleted_chars;
    }
    return { file: parsed, chain, match, matchIndex, countsMatch, checkpoints, ops, pasteBefore: R.pasteCheckpoints(parsed) };
}

// --- rendering ---
function pill(kind, text) { return `<span class="pill ${kind}">${escapeHtml(text)}</span>`; }
function check(kind, title, why) { return `<div class="check">${pill(kind, title)}<div class="why">${why}</div></div>`; }
function row(label, value) { return `<div class="info-row"><span class="info-label">${label}</span><span class="info-value">${value}</span></div>`; }
function card(n, title, body, extraClass) { return `<div class="card ${extraClass || ''}"><div class="card-title"><span class="num">${n}</span>${title}</div>${body}</div>`; }
function list(items) { return items.length ? `<ul class="lines">${items.map(s => `<li>${s}</li>`).join('')}</ul>` : ''; }
function dash(v) { return v == null ? '—' : v; }

function renderReceiptSection(view, data, status, rawAtt) {
    const sig = status.signature === 'valid' ? check('ok', 'Signature valid', 'Signed by the device that produced it; nothing in the receipt has changed since.')
        : status.signature === 'invalid' ? check('bad', 'Signature invalid', 'The receipt was changed after it was signed, or the signature belongs to another receipt.')
        : check('warn', 'No signature', 'This receipt carries no device signature, so it cannot be checked.');
    const text = status.text === 'match' ? check('ok', 'Text matches', 'The receipt was issued for the essay you pasted.')
        : status.text === 'mismatch' ? check('bad', 'Text does not match', 'The receipt was issued for a different text than the one you pasted.')
        : status.text === 'unbound' ? check('warn', 'No text binding', 'This receipt carries no text hash, so it cannot be tied to an essay.')
        : check('muted', 'Text not provided', 'Paste the essay to confirm the receipt was issued for it.');
    const att = rawAtt ? escapeDeep(rawAtt) : null;
    const recorded = att && att.attested_at ? 'Recorded by the server on ' + escapeHtml(R.formatDate(att.attested_at)) : 'Recorded by the server';
    const ageBit = att && typeof att.age_days === 'number' ? ' · device first seen by the server ' + att.age_days + (att.age_days === 1 ? ' day' : ' days') + ' before' : '';
    const server = status.server === 'valid' ? check('ok', 'Server record', recorded + ' · countersignature verified' + ageBit)
        : status.server === 'unchecked' ? check('warn', 'Server record', recorded + ' · countersignature not checked (no server key configured in this page)' + ageBit)
        : status.server === 'unsigned' ? check('warn', 'Server record', recorded + ' · no countersignature' + ageBit)
        : status.server === 'invalid' ? check('bad', 'Server countersignature invalid', 'The server record attached to this receipt does not carry a valid server signature.')
        : status.server === 'mismatch' ? check('bad', 'Server record mismatch', 'The server record attached to this receipt was issued for a different text, device or score.')
        : check('muted', 'No server record', 'The receipt was issued offline. It still verifies by its signature; only the server\'s timestamp is missing.');
    const kind = view.kind === 'receipt' ? 'Process receipt v' + dash(data.version) : 'Older badge v' + dash(data.version) + ' (counts only)';
    const keyId = data.publicKeyId || (att && att.key_id) || null;
    return card(1, 'Receipt', sig + text + server
        + '<div style="margin-top:14px;">'
        + row('Kind', kind)
        + row('Issued', escapeHtml(R.formatDate(view.minted_at)) + (data.url ? ' · ' + data.url : ''))
        + row('Device key id', dash(keyId))
        + row('Previous receipt from this device', data.previousBadge || 'none (first receipt from this device)')
        + row('Text hash', data.text_hash ? data.text_hash.slice(0, 16) + '…' : '—')
        + '</div>');
}

function renderSummarySection(view, summary) {
    if (view.kind !== 'receipt') {
        return card(2, 'Summary', `<p class="headline">${summary.headline}</p>` + (view.date ? `<p class="quiet">Sitting date: ${escapeHtml(view.date)}</p>` : ''));
    }
    return card(2, 'Summary', `<p class="headline">${summary.headline}</p>` + list(summary.sessions.concat([summary.away])));
}

function renderTimelineSection(view) {
    if (view.kind !== 'receipt' || !view.process.timeline.buckets.length) {
        return card(3, 'Timeline', '<p class="quiet">No timeline: this receipt carries no process record.</p>');
    }
    const svg = R.timelineSvg(view.process);
    const legend = '<div class="legend"><span class="typed">typed</span><span class="pasted">pasted</span><span class="deleted">deleted</span><span class="paste-mark">paste event</span><span class="sitting">new sitting</span></div>';
    return card(3, 'Timeline', `<div class="timeline-wrap">${svg}${legend}</div>`);
}

function renderPastesSection(view, summary) {
    if (view.kind !== 'receipt') {
        const c = view.counts || {};
        return card(4, 'Pastes', `<p class="quiet">${c.pastes != null ? escapeHtml(R.plural(c.pastes, 'paste')) + (c.pasted != null ? ', ' + escapeHtml(R.formatNumber(c.pasted)) + ' characters' : '') : 'No paste record'} (an older badge carries no per-paste detail).</p>`);
    }
    return card(4, 'Pastes', summary.pastes.length ? list(summary.pastes) : '<p class="quiet">No pastes recorded.</p>');
}

function renderRevisionSection(view, summary) {
    const rev = view.revision;
    if (!rev) return card(5, 'Revision', '<p class="quiet">No revision record.</p>');
    return card(5, 'Revision', `<p class="quiet" style="margin:0 0 10px 0;">Revision activity while writing:</p>`
        + row('Backspaces', dash(rev.backspaces))
        + row('Backward edits', dash(rev.backward_edits))
        + row('Cursor jumps', dash(rev.cursor_jumps))
        + row('Editing linearity', rev.editing_linearity != null ? rev.editing_linearity.toFixed(2) + ' (1.00 = written straight through)' : '—')
        + (view.kind === 'receipt' ? row('Characters deleted', escapeHtml(R.formatNumber(view.process.deleted_chars))) : '')
        + `<p class="quiet" style="margin:10px 0 0 0;">${summary.revision}</p>`);
}

function renderRhythmSection(view, summary) {
    const t = view.typing || {};
    const ms = (m, s) => m != null ? m.toFixed(1) + ' ms' + (s != null ? ' (spread ' + s.toFixed(1) + ' ms)' : '') : '—';
    return card(6, 'Typing rhythm',
        row('Key hold (dwell)', ms(t.mean_dwell, t.std_dwell))
        + row('Between keys (flight)', ms(t.mean_flight, t.std_flight))
        + row('Timed keystrokes', dash(t.keys != null ? R.formatNumber(t.keys) : null))
        + row('Rhythm score', (view.rhythm != null ? view.rhythm.toFixed(2) : '—') + ' — ' + R.RHYTHM_LABEL)
        + `<p class="quiet" style="margin:10px 0 0 0;">${summary.rhythm}</p>`);
}

function renderLedgerSection(view, ledger) {
    if (!ledger) {
        return card(7, 'Ledger', '<p class="quiet">No ledger file provided. The ledger (.jitter-ledger.json) is optional: ask the student for it to replay the composition block by block.</p>');
    }
    if (ledger.error) return card(7, 'Ledger', check('bad', 'Ledger not read', escapeHtml(ledger.error)));
    const ch = ledger.chain;
    const chain = ch.ok
        ? check('ok', 'Chain recomputed ✓', `${escapeHtml(R.plural(ch.checkpoints, 'block'))}, ${escapeHtml(R.plural(ch.ops, 'operation'))}: every block hashes to the next and the final hash is the last block\'s.`)
        : check('bad', 'Chain does not recompute ✗', ch.firstBad != null
            ? `Block ${ch.firstBad + 1} of ${ch.checkpoints} does not recompute (${ch.reason === 'content' ? 'its content does not match its content hash' : 'its chain hash is not the hash of the previous block, its position, its time and its content'}).`
            : (ch.reason === 'empty' ? 'The file holds no blocks.' : 'The file\'s final hash is not the hash of its last block.'));
    const match = ledger.match === 'final'
        ? check('ok', 'Matches this receipt ✓', 'The ledger\'s final hash is the one this receipt was issued with.')
        : ledger.match === 'earlier'
        ? check('warn', 'Matches an earlier block', `This receipt was issued at block ${ledger.matchIndex + 1} of ${ledger.checkpoints.length}; the ledger continues after it (more writing after the receipt).`)
        : check('bad', 'Does not match this receipt ✗', view.ledger && view.ledger.hash ? 'No block in this ledger carries the hash this receipt was issued with.' : 'This receipt carries no ledger hash to compare with.');
    const counts = ledger.countsMatch == null ? ''
        : ledger.countsMatch ? check('ok', 'Operations add up ✓', 'Typed, pasted and deleted counts in the ledger equal the receipt\'s.')
        : check('bad', 'Operations differ ✗', 'Typed, pasted or deleted counts in the ledger differ from the receipt\'s.');
    const n = ledger.checkpoints.length;
    const replay = n ? `<div class="replay">
            <div class="replay-controls">
                <input type="range" id="ledger-scrubber" min="0" max="${n - 1}" value="0">
                <span id="ledger-replay-label"></span>
            </div>
            <div id="ledger-replay-paste">${pill('warn', 'paste in this block')} <span class="quiet" id="ledger-replay-paste-text"></span></div>
            <div id="ledger-replay-content"></div>
        </div>` : '';
    return card(7, 'Ledger', chain + match + counts + replay);
}

function renderNoteSection() {
    return card(8, 'What a receipt says', `<p style="margin:0;">${R.FIXED_NOTE_HTML}</p>`, 'note-card');
}

function renderLedgerReplay(idx) {
    if (!ledgerReplay) return;
    const cps = ledgerReplay.checkpoints;
    if (!cps.length) return;
    idx = Math.max(0, Math.min(idx | 0, cps.length - 1));
    const cp = cps[idx] && typeof cps[idx] === 'object' ? cps[idx] : {};
    const content = document.getElementById('ledger-replay-content');
    const label = document.getElementById('ledger-replay-label');
    const pasteBox = document.getElementById('ledger-replay-paste');
    const pasteText = document.getElementById('ledger-replay-paste-text');
    const pasted = ledgerReplay.pasteBefore[idx] || 0;
    if (content) {
        content.textContent = typeof cp.content === 'string' ? cp.content : '(this block holds no content snapshot)';
        content.classList.toggle('pasted', pasted > 0);
    }
    if (label) {
        const t = R.toMs(cp.t);
        const elapsed = isFinite(t) && isFinite(ledgerReplay.originMs) ? Math.max(0, t - ledgerReplay.originMs) : null;
        label.textContent = `block ${idx + 1}/${cps.length}` + (elapsed != null ? ' · T+' + R.formatDuration(elapsed) : '');
    }
    if (pasteBox) pasteBox.style.display = pasted > 0 ? 'block' : 'none';
    if (pasteText) pasteText.textContent = pasted > 0 ? 'This block follows a paste of ' + R.plural(pasted, 'character') + '.' : '';
}

async function verifyReceipt() {
    const input = document.getElementById('badge-input').value;
    const resultDiv = document.getElementById('result');

    if (!input.trim()) {
        resultDiv.innerHTML = '<div class="error-box">Paste a receipt first.</div>';
        resultDiv.style.display = 'block';
        return;
    }

    try {
        const raw = decodeReceipt(input);
        const pastedText = (document.getElementById('text-input') || {}).value || '';

        const status = {
            signature: await checkSignature(raw),
            text: await checkText(raw, pastedText),
            server: await checkServer(raw),
        };
        const view = R.describeReceipt(raw);
        const ledger = await checkLedgerFile(view);

        // Everything below is rendered with innerHTML: escape all strings first.
        const data = escapeDeep(view);
        const summary = escapeDeep(R.summarize(view));
        const rawAtt = raw.attestation && typeof raw.attestation === 'object' ? raw.attestation : null;

        const html = renderReceiptSection(view, data, status, rawAtt)
            + renderSummarySection(view, summary)
            + renderTimelineSection(view)
            + renderPastesSection(view, summary)
            + renderRevisionSection(view, summary)
            + renderRhythmSection(view, summary)
            + renderLedgerSection(view, ledger)
            + renderNoteSection();

        resultDiv.innerHTML = html;
        resultDiv.style.display = 'block';

        ledgerReplay = null;
        if (ledger && !ledger.error && ledger.checkpoints.length) {
            const firstOp = ledger.ops.length ? R.toMs(ledger.ops[0] && ledger.ops[0].t) : NaN;
            ledgerReplay = {
                checkpoints: ledger.checkpoints,
                pasteBefore: ledger.pasteBefore,
                originMs: isFinite(firstOp) ? firstOp : R.toMs(ledger.checkpoints[0] && ledger.checkpoints[0].t),
            };
            const scrubber = document.getElementById('ledger-scrubber');
            if (scrubber) scrubber.addEventListener('input', (e) => renderLedgerReplay(parseInt(e.target.value, 10)));
            renderLedgerReplay(0);
        }
    } catch (error) {
        resultDiv.innerHTML = `
            <div class="error-box">
                <h3 style="margin-top:0;">Could not read this receipt</h3>
                <p>Paste the ⚡ JITTER badge, the receipt code (#jitter:…), or the contents of the .jitter-receipt.json file.</p>
                <p style="font-size:12px; margin-top:10px; color:#888;">${escapeHtml(error.message)}</p>
            </div>
        `;
        resultDiv.style.display = 'block';
    }
}

// Ctrl+Enter in the receipt box checks it
document.getElementById('badge-input').addEventListener('keypress', function (e) {
    if (e.key === 'Enter' && e.ctrlKey) verifyReceipt();
});

document.getElementById('verify-btn').addEventListener('click', verifyReceipt);
