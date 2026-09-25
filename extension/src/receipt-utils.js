/**
 * receipt-utils.js — Process receipt and ledger helpers (v4.0)
 *
 * Copyright (c) 2025-2026 Denis Gingras. All Rights Reserved.
 *
 * PROPRIETARY AND CONFIDENTIAL
 * This file is part of the JITTEr project. See LICENSE file for full terms.
 *
 * Pure functions, no DOM. The Writer (src/writer.js) builds the receipt's
 * `process` block with them, the verify page (src/verify-page.js) checks and
 * describes receipts with them, and tests/receipt-utils.test.js runs them in
 * Node. Plain script on purpose: one global (JitterReceipt) plus
 * module.exports, the same shape as war-score.js.
 *
 * Contract: docs/product/PROCESS_RECEIPT.md.
 *
 * Nothing here ever sees typed characters. Ledger operations carry counts and
 * timestamps only; a paste carries its length. Content snapshots live in the
 * student's ledger file (their replay), never in the receipt.
 *
 * Ledger operations (`t` is an ISO timestamp, or epoch ms in memory):
 *   { op: 'type',    t, n, ms }   a run of n keystrokes lasting ms
 *   { op: 'delete',  t, n }       n characters removed
 *   { op: 'paste',   t, len }     a paste of len characters
 *   { op: 'blur', t } / { op: 'focus', t }
 *   { op: 'session', t, k }       start of sitting k
 */
const JitterReceipt = (function () {
  'use strict';

  const VERSION = '4.0';
  const RUN_PAUSE_MS = 2000;            // a typing run ends at a pause over this
  const RUN_MAX_KEYS = 50;              // ...or at this many keys
  const SESSION_GAP_MS = 10 * 60000;    // a gap over this starts a new sitting
  const ACTIVE_GAP_CAP_MS = 90000;      // a gap between operations counts up to this
  const CHECKPOINT_ACTIVITY_MS = 60000; // a checkpoint after at most this much activity
  const MAX_BUCKETS = 240;
  const HOUR = 3600000;

  // The note every page that shows a receipt carries (PROCESS_RECEIPT.md,
  // first paragraph, verbatim).
  const FIXED_NOTE = 'A process receipt records how a text was entered into the JITTEr Writer: '
    + 'when, over how many sittings, how much was typed, pasted and deleted, and in what rhythm. '
    + 'It is signed by the device that produced it and bound to the final text, so it cannot be '
    + 'edited or moved to another essay. It does not say who was at the keyboard, whether typed '
    + 'text was copied from another screen, or whether a language model wrote it. Every page that '
    + 'shows a receipt says this.';
  const FIXED_NOTE_HTML = 'A process receipt records <strong>how a text was entered into the JITTEr Writer</strong>: '
    + 'when, over how many sittings, how much was typed, pasted and deleted, and in what rhythm. '
    + 'It is signed by the device that produced it and bound to the final text, so it cannot be '
    + 'edited or moved to another essay. It does <strong>not</strong> say who was at the keyboard, whether typed '
    + 'text was copied from another screen, or whether a language model wrote it. Every page that '
    + 'shows a receipt says this.';

  const RHYTHM_LABEL = 'one statistic, not a verdict';

  const COLORS = { typed: '#00F0FF', pasted: '#FFD700', deleted: '#9A8CFF' };

  // --- small helpers ---
  function toMs(t) {
    if (typeof t === 'number') return isFinite(t) ? t : NaN;
    if (t instanceof Date) return t.getTime();
    if (typeof t === 'string') return Date.parse(t);
    return NaN;
  }
  function iso(ms) { return new Date(ms).toISOString(); }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function count(v) { const n = num(v); return n != null && n > 0 ? n : 0; }
  function str(v) { return typeof v === 'string' ? v : null; }
  function round2(x) { return Math.round(x * 100) / 100; }
  function f1(x) { return (Math.round(x * 10) / 10).toString(); }

  function cleanOps(ops) {
    if (!Array.isArray(ops)) return [];
    return ops.filter(op => op && typeof op === 'object' && typeof op.op === 'string' && isFinite(toMs(op.t)));
  }
  function opEnd(op) {
    const s = toMs(op.t);
    return op.op === 'type' ? s + count(op.ms) : s;
  }

  // --- sittings ---
  // A new sitting starts on a `session` op or after a gap over 10 minutes.
  function segment(ops) {
    const out = [];
    let cur = null, prevEnd = null;
    for (const op of ops) {
      const t = toMs(op.t);
      if (!cur || op.op === 'session' || (prevEnd != null && t - prevEnd > SESSION_GAP_MS)) {
        cur = { start: t, end: t, ops: [] };
        out.push(cur);
      }
      cur.ops.push(op);
      const e = opEnd(op);
      if (e > cur.end) cur.end = e;
      prevEnd = e;
    }
    return out;
  }

  // Active time inside one sitting: gaps between consecutive operations capped
  // at 90 s, plus the durations of typing runs. Time away (blur -> focus) never counts.
  function activeWithin(slice) {
    let total = 0;
    for (let i = 0; i < slice.length; i++) {
      const op = slice[i];
      if (op.op === 'type') total += count(op.ms);
      if (i + 1 < slice.length && op.op !== 'blur') {
        const gap = toMs(slice[i + 1].t) - opEnd(op);
        if (gap > 0) total += Math.min(gap, ACTIVE_GAP_CAP_MS);
      }
    }
    return Math.round(total);
  }

  function countOps(ops) {
    const s = { typed: 0, pasted: 0, pastes: 0, deleted: 0 };
    for (const op of cleanOps(ops)) {
      if (op.op === 'type') s.typed += count(op.n);
      else if (op.op === 'paste') { s.pasted += count(op.len); s.pastes++; }
      else if (op.op === 'delete') s.deleted += count(op.n);
    }
    return s;
  }

  function sessionsFrom(ops) {
    return segment(cleanOps(ops)).map(s => {
      const c = countOps(s.ops);
      return { start: iso(s.start), end: iso(s.end), active_ms: activeWithin(s.ops), typed: c.typed, pasted: c.pasted, deleted: c.deleted };
    });
  }

  function activeMs(ops) {
    return segment(cleanOps(ops)).reduce((sum, s) => sum + activeWithin(s.ops), 0);
  }

  // --- timeline ---
  // 60 s buckets while the span is <= 4 h, 5 min up to 20 h, otherwise 1 h;
  // never more than 240 buckets (longer spans get whole-hour multiples).
  function bucketMsFor(spanMs) {
    const span = Math.max(0, num(spanMs) || 0);
    let bucket = span <= 4 * HOUR ? 60000 : span <= 20 * HOUR ? 300000 : HOUR;
    if (span / bucket > MAX_BUCKETS) bucket = Math.ceil(span / MAX_BUCKETS / HOUR) * HOUR;
    return bucket;
  }

  function timelineFrom(ops, startedAt, finishedAt) {
    const clean = cleanOps(ops);
    let start = toMs(startedAt);
    if (!isFinite(start)) start = clean.length ? toMs(clean[0].t) : 0;
    let end = toMs(finishedAt);
    if (!isFinite(end) || end < start) end = clean.reduce((m, op) => Math.max(m, opEnd(op)), start);
    const bucket_ms = bucketMsFor(end - start);
    const byIndex = new Map();
    for (const op of clean) {
      if (op.op !== 'type' && op.op !== 'paste' && op.op !== 'delete') continue;
      let i = Math.floor((toMs(op.t) - start) / bucket_ms);
      if (!(i >= 0)) i = 0;
      if (i > MAX_BUCKETS - 1) i = MAX_BUCKETS - 1;
      let b = byIndex.get(i);
      if (!b) { b = { i, typed: 0, pasted: 0, deleted: 0 }; byIndex.set(i, b); }
      if (op.op === 'type') b.typed += count(op.n);
      else if (op.op === 'paste') b.pasted += count(op.len);
      else b.deleted += count(op.n);
    }
    const buckets = Array.from(byIndex.values()).sort((a, b) => a.i - b.i);
    return { bucket_ms, buckets };
  }

  // Time away: each blur paired with the next focus.
  function awayFrom(ops) {
    const clean = cleanOps(ops);
    let events = 0, total = 0;
    for (let i = 0; i < clean.length; i++) {
      if (clean[i].op !== 'blur') continue;
      events++;
      for (let j = i + 1; j < clean.length; j++) {
        if (clean[j].op === 'blur') break;
        if (clean[j].op === 'focus') { total += Math.max(0, toMs(clean[j].t) - toMs(clean[i].t)); break; }
      }
    }
    return { events, total_ms: Math.round(total) };
  }

  // The whole `process` block of a receipt.
  // opts: { finishedAt (ms or ISO, default now), revision: { backspaces, cursor_jumps, backward_edits, editing_linearity } }
  function buildProcess(ops, opts) {
    opts = opts || {};
    const clean = cleanOps(ops);
    let finished = toMs(opts.finishedAt);
    if (!isFinite(finished)) finished = Date.now();
    const started = clean.length ? toMs(clean[0].t) : finished;
    const sessions = sessionsFrom(clean);
    const c = countOps(clean);
    const entered = c.typed + c.pasted;
    const rev = opts.revision && typeof opts.revision === 'object' ? opts.revision : {};
    const linearity = num(rev.editing_linearity);
    return {
      started_at: iso(started),
      finished_at: iso(finished),
      sessions,
      active_ms: sessions.reduce((sum, s) => sum + s.active_ms, 0),
      typed_chars: c.typed,
      pasted_chars: c.pasted,
      deleted_chars: c.deleted,
      typed_share: entered > 0 ? round2(c.typed / entered) : null,
      paste_events: clean.filter(op => op.op === 'paste').map(op => ({ t: iso(toMs(op.t)), len: count(op.len) })),
      away: awayFrom(clean),
      revision: {
        backspaces: count(rev.backspaces),
        cursor_jumps: count(rev.cursor_jumps),
        backward_edits: count(rev.backward_edits),
        editing_linearity: linearity != null ? round2(Math.max(0, Math.min(1, linearity))) : 1,
      },
      timeline: timelineFrom(clean, started, finished),
    };
  }

  // --- hashing and the checkpoint chain ---
  function subtle() {
    const c = (typeof crypto !== 'undefined' && crypto) || (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
    if (!c || !c.subtle) throw new Error('WebCrypto (crypto.subtle) is not available');
    return c.subtle;
  }
  async function sha256Hex(text) {
    const buf = await subtle().digest('SHA-256', new TextEncoder().encode(String(text)));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // hash = sha256(prev_hash + '|' + op_index + '|' + t + '|' + content_hash); prev_hash = 'genesis' for the first.
  function checkpointHash(prevHash, opIndex, tIso, contentHash) {
    return sha256Hex(String(prevHash) + '|' + String(opIndex) + '|' + String(tIso) + '|' + String(contentHash));
  }

  // Recomputes the chain of a ledger file.
  // -> { ok, checkpoints, ops, final_hash, firstBad, reason }
  //    firstBad: index of the first checkpoint whose content or hash does not recompute (null when all do)
  //    reason: 'content' | 'hash' | 'final_hash' | 'empty' | null
  async function verifyLedger(file) {
    const cps = file && Array.isArray(file.checkpoints) ? file.checkpoints : [];
    const ops = file && Array.isArray(file.ops) ? file.ops : [];
    let prev = 'genesis', firstBad = null, reason = null;
    for (let i = 0; i < cps.length; i++) {
      const cp = cps[i] && typeof cps[i] === 'object' ? cps[i] : {};
      let contentHash = str(cp.content_hash);
      if (typeof cp.content === 'string') {
        const h = await sha256Hex(cp.content);
        if (contentHash != null && contentHash !== h && firstBad == null) { firstBad = i; reason = 'content'; }
        contentHash = h;
      }
      const expected = await checkpointHash(prev, cp.op_index, cp.t, contentHash);
      if (cp.hash !== expected && firstBad == null) { firstBad = i; reason = 'hash'; }
      prev = typeof cp.hash === 'string' ? cp.hash : expected;
    }
    const last = cps.length ? cps[cps.length - 1] : null;
    const final_hash = last && typeof last.hash === 'string' ? last.hash : null;
    const finalOk = final_hash != null && file && file.final_hash === final_hash;
    if (firstBad == null && !finalOk) reason = cps.length ? 'final_hash' : 'empty';
    return { ok: cps.length > 0 && firstBad == null && finalOk, checkpoints: cps.length, ops: ops.length, final_hash, firstBad, reason };
  }

  // Which checkpoints follow a paste (for the replay highlight): a checkpoint
  // covers the operations since the previous one.
  function pasteCheckpoints(file) {
    const cps = file && Array.isArray(file.checkpoints) ? file.checkpoints : [];
    const ops = file && Array.isArray(file.ops) ? file.ops : [];
    const out = [];
    let from = 0;
    for (let i = 0; i < cps.length; i++) {
      const to = Math.min(ops.length, Math.max(from, count(cps[i] && cps[i].op_index)));
      const pasted = ops.slice(from, to).filter(op => op && op.op === 'paste').reduce((s, op) => s + count(op.len), 0);
      out.push(pasted);
      from = to;
    }
    return out; // characters pasted between checkpoint i-1 and i (0 when none)
  }

  // --- formatting ---
  function formatNumber(n) {
    const v = num(n);
    return v == null ? '—' : Math.round(v).toLocaleString('en-US');
  }
  function plural(n, word) { return formatNumber(n) + ' ' + word + (Math.round(n) === 1 ? '' : 's'); }
  function formatDuration(ms) {
    let s = Math.round((num(ms) || 0) / 1000);
    if (s < 0) s = 0;
    if (s < 60) return s + ' s';
    const m = Math.floor(s / 60), sec = s % 60;
    if (m < 60) return sec ? m + ' min ' + sec + ' s' : m + ' min';
    const h = Math.floor(m / 60), min = m % 60;
    return min ? h + ' h ' + min + ' min' : h + ' h';
  }
  function formatDate(t) {
    const ms = toMs(t);
    if (!isFinite(ms)) return '—';
    return new Date(ms).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function formatDay(t) {
    const ms = toMs(t);
    if (!isFinite(ms)) return '—';
    return new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function formatTime(t) {
    const ms = toMs(t);
    if (!isFinite(ms)) return '—';
    return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  // Never says "100%" when something was pasted, however small the paste:
  // the share is rounded to two decimals in the receipt, so 3 pasted
  // characters in 1 000 typed would otherwise round up to 100%.
  function percent(share, pastedChars) {
    const v = num(share);
    if (v == null) return '—';
    const p = Math.round(Math.max(0, Math.min(1, v)) * 100);
    return (count(pastedChars) > 0 ? Math.min(99, p) : p) + '%';
  }
  function distinctDays(sessions) {
    const days = new Set();
    for (const s of sessions) {
      const a = toMs(s.start), b = toMs(s.end);
      if (isFinite(a)) days.add(new Date(a).toDateString());
      if (isFinite(b)) days.add(new Date(b).toDateString());
    }
    return days.size;
  }

  // --- view model ---
  function normalizeTyping(t) {
    t = t && typeof t === 'object' ? t : {};
    return { mean_dwell: num(t.mean_dwell), std_dwell: num(t.std_dwell), mean_flight: num(t.mean_flight), std_flight: num(t.std_flight), keys: num(t.keys) };
  }
  function normalizeProcess(pr) {
    pr = pr && typeof pr === 'object' ? pr : {};
    const sessions = (Array.isArray(pr.sessions) ? pr.sessions : []).filter(s => s && typeof s === 'object').map(s => ({
      start: str(s.start), end: str(s.end), active_ms: count(s.active_ms), typed: count(s.typed), pasted: count(s.pasted), deleted: count(s.deleted),
    }));
    const paste_events = (Array.isArray(pr.paste_events) ? pr.paste_events : []).filter(e => e && typeof e === 'object').map(e => ({ t: str(e.t), len: count(e.len) }));
    const tl = pr.timeline && typeof pr.timeline === 'object' ? pr.timeline : {};
    const buckets = (Array.isArray(tl.buckets) ? tl.buckets : []).filter(b => b && typeof b === 'object' && num(b.i) != null)
      .map(b => ({ i: Math.max(0, Math.floor(b.i)), typed: count(b.typed), pasted: count(b.pasted), deleted: count(b.deleted) }))
      .sort((a, b) => a.i - b.i);
    const away = pr.away && typeof pr.away === 'object' ? pr.away : {};
    const rev = pr.revision && typeof pr.revision === 'object' ? pr.revision : {};
    return {
      started_at: str(pr.started_at), finished_at: str(pr.finished_at), sessions,
      active_ms: count(pr.active_ms), typed_chars: count(pr.typed_chars), pasted_chars: count(pr.pasted_chars), deleted_chars: count(pr.deleted_chars),
      typed_share: num(pr.typed_share), paste_events,
      away: { events: count(away.events), total_ms: count(away.total_ms) },
      revision: { backspaces: num(rev.backspaces), cursor_jumps: num(rev.cursor_jumps), backward_edits: num(rev.backward_edits), editing_linearity: num(rev.editing_linearity) },
      timeline: { bucket_ms: count(tl.bucket_ms) || 60000, buckets },
    };
  }

  // Normalizes a v4 receipt or a v3 badge (content.js / the old Writer) into
  // one view model. v3 gives signature, text binding, server record and basic counts.
  function describeReceipt(payload) {
    const p = payload && typeof payload === 'object' ? payload : {};
    const isV4 = p.version === '4.0' && p.process && typeof p.process === 'object';
    const att = p.attestation && typeof p.attestation === 'object' ? p.attestation : null;
    const view = {
      kind: isV4 ? 'receipt' : 'badge',
      version: str(p.version),
      type: str(p.type),
      title: str(p.title),
      minted_at: str(p.minted_at) || (num(p.timestamp) != null ? iso(p.timestamp) : null),
      url: str(p.url),
      text_hash: str(p.text_hash),
      publicKeyId: str(p.publicKeyId),
      previousBadge: str(p.previousBadge),
      signed: typeof p.signature === 'string' && !!p.publicKeyJwk,
      attested: !!att,
      attested_at: att ? str(att.attested_at) : null,
      server_key_id: str(p.server_key_id),
      chars: num(p.chars), words: num(p.words), keys: num(p.keys),
      rhythm: num(p.war_uncapped != null ? p.war_uncapped : p.war),
      date: str(p.date),
      counts: null, process: null, typing: null, revision: null, ledger: null,
    };
    if (isV4) {
      view.process = normalizeProcess(p.process);
      view.counts = { typed: view.process.typed_chars, pasted: view.process.pasted_chars, pastes: view.process.paste_events.length, deleted: view.process.deleted_chars, backspaces: view.process.revision.backspaces };
      view.typing = normalizeTyping(p.typing);
      view.revision = view.process.revision;
      view.ledger = p.ledger && typeof p.ledger === 'object' ? { hash: str(p.ledger.hash), checkpoints: num(p.ledger.checkpoints), ops: num(p.ledger.ops) } : null;
    } else {
      view.counts = { typed: num(p.keys), pasted: num(p.pastedChars), pastes: num(p.pastes), deleted: null, backspaces: num(p.edits) };
      view.typing = normalizeTyping({ mean_dwell: p.meanDwell, std_dwell: p.stdDwell, mean_flight: p.meanFlight, std_flight: p.stdFlight, keys: p.keys });
      view.revision = (p.edits != null || p.editingLinearity != null)
        ? { backspaces: num(p.edits), cursor_jumps: num(p.cursorJumps), backward_edits: num(p.backwardEdits), editing_linearity: num(p.editingLinearity) }
        : null;
    }
    return view;
  }

  // --- plain-language summary (the wording the verify page shows) ---
  function revisionSentence(rev) {
    if (!rev) return 'No revision record.';
    const bits = [];
    if (rev.backspaces != null) bits.push(plural(rev.backspaces, 'backspace'));
    if (rev.backward_edits != null) bits.push(plural(rev.backward_edits, 'backward edit'));
    if (rev.cursor_jumps != null) bits.push(plural(rev.cursor_jumps, 'cursor jump'));
    if (rev.editing_linearity != null) bits.push('editing linearity ' + rev.editing_linearity.toFixed(2) + ' (1.00 = written straight through, lower = more going back to revise)');
    return bits.length ? bits.join(' · ') : 'No revision record.';
  }
  function rhythmSentence(typing, rhythm) {
    const t = typing || {};
    const bits = [];
    if (t.mean_dwell != null) bits.push('key hold ' + f1(t.mean_dwell) + ' ms' + (t.std_dwell != null ? ' (spread ' + f1(t.std_dwell) + ' ms)' : ''));
    if (t.mean_flight != null) bits.push('between keys ' + f1(t.mean_flight) + ' ms' + (t.std_flight != null ? ' (spread ' + f1(t.std_flight) + ' ms)' : ''));
    if (!bits.length) bits.push('no rhythm statistics (fewer than 10 timed keystrokes)');
    bits.push(rhythm != null ? 'rhythm score ' + rhythm.toFixed(2) + ' — ' + RHYTHM_LABEL : 'no rhythm score — ' + RHYTHM_LABEL);
    return bits.join(' · ');
  }

  function summarize(input) {
    const view = input && typeof input === 'object' && typeof input.kind === 'string' ? input : describeReceipt(input);
    const out = { kind: view.kind, headline: '', sittings: '', active: '', entered: '', share: '', away: '', pastes: [], sessions: [], revision: '', rhythm: '', ledger: '' };
    out.revision = revisionSentence(view.revision);
    out.rhythm = rhythmSentence(view.typing, view.rhythm);

    if (view.kind !== 'receipt') {
      const c = view.counts || {};
      const bits = [];
      if (c.typed != null) bits.push(formatNumber(c.typed) + ' keystrokes typed');
      if (c.pasted != null) bits.push(formatNumber(c.pasted) + ' characters pasted' + (c.pastes != null ? ' in ' + plural(c.pastes, 'paste') : ''));
      else if (c.pastes != null) bits.push(plural(c.pastes, 'paste'));
      if (c.backspaces != null) bits.push(plural(c.backspaces, 'backspace'));
      out.entered = bits.join(', ');
      out.headline = 'Older badge (version ' + (view.version || 'unknown') + '): it carries counts for one sitting, not a process record.'
        + (out.entered ? ' ' + out.entered.charAt(0).toUpperCase() + out.entered.slice(1) + '.' : '');
      return out;
    }

    const pr = view.process;
    const n = pr.sessions.length;
    const days = distinctDays(pr.sessions);
    out.sittings = n === 1 ? 'Written in one sitting'
      : 'Written over ' + n + ' sittings' + (days > 1 ? ' across ' + days + ' days' : ' in one day');
    out.active = formatDuration(pr.active_ms) + ' of active writing';
    out.entered = formatNumber(pr.typed_chars) + ' characters typed, ' + formatNumber(pr.pasted_chars) + ' pasted'
      + (pr.paste_events.length ? ' in ' + plural(pr.paste_events.length, 'paste') : '')
      + ', ' + formatNumber(pr.deleted_chars) + ' deleted';
    out.share = pr.typed_share == null ? 'nothing was entered through the keyboard or the clipboard'
      : percent(pr.typed_share, pr.pasted_chars) + ' of what was entered was typed here';
    out.headline = [out.sittings, out.active, out.entered, out.share].join(' · ') + '.';
    out.away = pr.away.events
      ? 'Away from the Writer ' + plural(pr.away.events, 'time') + ' during a sitting, ' + formatDuration(pr.away.total_ms) + ' in total (not counted as active writing)'
      : 'Never away from the Writer during a sitting';
    const started = toMs(pr.started_at);
    pr.paste_events.forEach((e, i) => {
      const at = toMs(e.t);
      const bits = ['Paste ' + (i + 1)];
      if (isFinite(at) && isFinite(started)) bits.push(formatDuration(Math.max(0, at - started)) + ' after the start');
      bits.push(plural(e.len, 'character'));
      if (view.chars > 0) bits.push(Math.round((e.len / view.chars) * 100) + '% of the final text length');
      out.pastes.push(bits.join(' · '));
    });
    pr.sessions.forEach((s, i) => {
      out.sessions.push('Sitting ' + (i + 1) + ' · ' + formatDate(s.start) + ' → ' + formatTime(s.end)
        + ' · ' + formatDuration(s.active_ms) + ' active · ' + formatNumber(s.typed) + ' typed, '
        + formatNumber(s.pasted) + ' pasted, ' + formatNumber(s.deleted) + ' deleted');
    });
    if (view.ledger) {
      out.ledger = (view.ledger.checkpoints != null ? plural(view.ledger.checkpoints, 'block') : 'blocks unknown')
        + ', ' + (view.ledger.ops != null ? plural(view.ledger.ops, 'operation') : 'operations unknown')
        + (view.ledger.hash ? ', chain hash ' + view.ledger.hash.slice(0, 12) + '…' : '');
    }
    return out;
  }

  // --- timeline as inline SVG (no libraries: MV3 CSP) ---
  // Bars per bucket (typed / pasted / deleted stacked), paste events marked,
  // sitting boundaries drawn. Everything in the markup is numeric or produced
  // here, so it is safe to place in innerHTML.
  function timelineSvg(process, opts) {
    opts = opts || {};
    const pr = normalizeProcess(process);
    const tl = pr.timeline;
    if (!tl.buckets.length) return '';
    const start = toMs(pr.started_at);
    if (!isFinite(start)) return '';
    let end = toMs(pr.finished_at);
    if (!isFinite(end) || end < start) end = start;
    const bm = tl.bucket_ms;
    const maxI = tl.buckets[tl.buckets.length - 1].i;
    const n = Math.max(1, Math.ceil((end - start) / bm) || 1, maxI + 1);
    const W = opts.width || 720, H = opts.height || 150;
    const padL = 10, padR = 10, padT = 20, padB = 28;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const bw = plotW / n;
    const xOf = t => padL + ((t - start) / bm) * bw;
    const maxV = Math.max(1, ...tl.buckets.map(b => b.typed + b.pasted + b.deleted));
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const parts = [];
    parts.push('<svg class="timeline" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img" aria-label="Characters typed, pasted and deleted over time">');
    parts.push('<line class="tl-axis" x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (W - padR) + '" y2="' + (padT + plotH) + '" stroke="#333" stroke-width="1"/>');
    for (const b of tl.buckets) {
      const x = padL + b.i * bw;
      const w = Math.max(1, bw > 3 ? bw - 1 : bw);
      let y = padT + plotH;
      for (const key of ['typed', 'pasted', 'deleted']) {
        const v = b[key];
        if (!(v > 0)) continue;
        const h = (v / maxV) * plotH;
        y -= h;
        parts.push('<rect class="tl-' + key + '" x="' + f1(x) + '" y="' + f1(y) + '" width="' + f1(w) + '" height="' + f1(h) + '" fill="' + COLORS[key] + '"><title>'
          + esc(formatNumber(v) + ' ' + key + ' · ' + formatTime(start + b.i * bm)) + '</title></rect>');
      }
    }
    pr.sessions.forEach((s, k) => {
      if (k === 0) return;
      const t = toMs(s.start);
      if (!isFinite(t)) return;
      const x = Math.min(W - padR, Math.max(padL, xOf(t)));
      parts.push('<line class="tl-sitting" x1="' + f1(x) + '" y1="' + (padT - 6) + '" x2="' + f1(x) + '" y2="' + (padT + plotH) + '" stroke="#888" stroke-width="1" stroke-dasharray="3 3"/>');
      parts.push('<text class="tl-sitting-label" x="' + f1(x + 3) + '" y="' + (padT - 8) + '" fill="#888" font-size="10" font-family="monospace">sitting ' + (k + 1) + '</text>');
    });
    pr.paste_events.forEach(e => {
      const t = toMs(e.t);
      if (!isFinite(t)) return;
      const x = Math.min(W - padR, Math.max(padL, xOf(t)));
      parts.push('<path class="tl-paste" d="M' + f1(x) + ',' + (padT - 2) + ' l-4,-7 l8,0 z" fill="' + COLORS.pasted + '"><title>' + esc('Paste of ' + plural(e.len, 'character') + ' · ' + formatTime(t)) + '</title></path>');
    });
    parts.push('<text x="' + padL + '" y="' + (H - 10) + '" fill="#888" font-size="10" font-family="monospace">' + esc(formatDate(start)) + '</text>');
    parts.push('<text x="' + (W / 2) + '" y="' + (H - 10) + '" fill="#666" font-size="10" font-family="monospace" text-anchor="middle">each bar = ' + esc(formatDuration(bm)) + '</text>');
    parts.push('<text x="' + (W - padR) + '" y="' + (H - 10) + '" fill="#888" font-size="10" font-family="monospace" text-anchor="end">' + esc(formatDate(end)) + '</text>');
    parts.push('</svg>');
    return parts.join('');
  }

  return {
    VERSION, RUN_PAUSE_MS, RUN_MAX_KEYS, SESSION_GAP_MS, ACTIVE_GAP_CAP_MS, CHECKPOINT_ACTIVITY_MS, MAX_BUCKETS,
    FIXED_NOTE, FIXED_NOTE_HTML, RHYTHM_LABEL, COLORS,
    toMs, iso,
    sessionsFrom, activeMs, countOps, timelineFrom, bucketMsFor, awayFrom, buildProcess,
    sha256Hex, checkpointHash, verifyLedger, pasteCheckpoints,
    describeReceipt, normalizeProcess, summarize, timelineSvg,
    formatDuration, formatNumber, formatDate, formatDay, formatTime, percent, plural,
  };
})();

// Classic <script> (extension pages): global name.
if (typeof window !== 'undefined') {
  window.JitterReceipt = JitterReceipt;
}

// CommonJS (Node tests).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = JitterReceipt;
}
