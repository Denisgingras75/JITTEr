// tests/receipt-utils.test.js
// Process receipt helpers (extension/src/receipt-utils.js), run in Node.
// Contract: docs/product/PROCESS_RECEIPT.md.
// Hand-rolled PASS/FAIL like war-scorer.test.js; exits non-zero on any failure.
const fs = require('fs');
const path = require('path');
const nodeCrypto = require('crypto');
const R = require('../extension/src/receipt-utils.js');

let passed = 0, failed = 0;
function assert(condition, msg) {
  if (!condition) { console.error('FAIL:', msg); failed++; process.exitCode = 1; return; }
  console.log('PASS:', msg); passed++;
}
function near(a, b, tol) { return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol; }

const T0 = Date.parse('2026-09-20T10:00:00.000Z');
const SEC = 1000, MIN = 60000, HOUR = 3600000;
const iso = ms => new Date(ms).toISOString();
// An op at T0 + offset
const at = (offset, fields) => Object.assign({ t: iso(T0 + offset) }, fields);

// Words that never appear in anything a teacher sees. "verdict" is allowed
// only inside the fixed label "one statistic, not a verdict".
const FORBIDDEN = /\b(risk|risks|risky|suspicious|bot|bots|human-like|authentic|authenticity|verdict|detected|synthetic|denied)\b/i;
const FORBIDDEN_AI = /\bAI\b/;
function forbiddenIn(text) {
  const t = String(text).split(R.RHYTHM_LABEL).join(' ');
  const m = t.match(FORBIDDEN) || t.match(FORBIDDEN_AI);
  return m ? m[0] : null;
}
function allStrings(v, out) {
  out = out || [];
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach(x => allStrings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach(x => allStrings(x, out));
  return out;
}

(async () => {
  // --- SITTINGS ---
  console.log('\n=== Sittings: a session op, or a gap over 10 minutes ===');
  const ops1 = [
    at(0, { op: 'session', k: 1 }),
    at(1 * SEC, { op: 'type', n: 50, ms: 8000 }),                 // ends at 9 s
    at(12 * SEC, { op: 'type', n: 30, ms: 5000 }),                // 3 s gap, ends at 17 s
    at(17 * SEC + 9 * MIN, { op: 'type', n: 20, ms: 3000 }),      // 9 min gap: same sitting, ends 20 s + 9 min
    at(20 * SEC + 20 * MIN, { op: 'type', n: 10, ms: 1000 }),     // 11 min gap: new sitting
  ];
  const s1 = R.sessionsFrom(ops1);
  assert(s1.length === 2, `Two sittings split at the 11-minute gap (got ${s1.length})`);
  assert(s1[0].typed === 100 && s1[1].typed === 10, `Typed per sitting: ${s1[0].typed} / ${s1[1].typed}`);
  assert(s1[0].start === iso(T0) && s1[0].end === iso(T0 + 20 * SEC + 9 * MIN), `Sitting 1 spans its first op to the end of its last run (${s1[0].start} → ${s1[0].end})`);
  assert(s1[1].start === iso(T0 + 20 * SEC + 20 * MIN) && s1[1].end === iso(T0 + 21 * SEC + 20 * MIN), 'Sitting 2 starts at the op after the gap');
  assert(s1.every(s => 'active_ms' in s && 'pasted' in s && 'deleted' in s), 'Each sitting carries start, end, active_ms, typed, pasted, deleted');

  const ops2 = [at(0, { op: 'type', n: 5, ms: 500 }), at(1 * SEC, { op: 'session', k: 2 }), at(2 * SEC, { op: 'type', n: 5, ms: 500 })];
  assert(R.sessionsFrom(ops2).length === 2, 'An explicit session op starts a sitting even after a short gap');
  const ops3a = [at(0, { op: 'type', n: 1, ms: 0 }), at(10 * MIN, { op: 'type', n: 1, ms: 0 })];
  const ops3b = [at(0, { op: 'type', n: 1, ms: 0 }), at(10 * MIN + 1, { op: 'type', n: 1, ms: 0 })];
  assert(R.sessionsFrom(ops3a).length === 1 && R.sessionsFrom(ops3b).length === 2, 'Exactly 10 minutes stays one sitting; over 10 minutes splits');
  assert(R.sessionsFrom([]).length === 0 && R.sessionsFrom(null).length === 0, 'No ops: no sittings, no throw');
  assert(R.sessionsFrom([{ op: 'type', t: 'garbage', n: 3 }, at(0, { op: 'type', n: 2, ms: 10 })]).length === 1, 'Ops with unreadable timestamps are ignored');

  // --- ACTIVE TIME ---
  console.log('\n=== Active time: gaps capped at 90 s + run durations; blur -> focus never counts ===');
  const focusAt = 131 * SEC + 5 * MIN;
  const ops4 = [
    at(0, { op: 'type', n: 50, ms: 8000 }),               // 8 000 (ends 8 s)
    at(8 * SEC + 120 * SEC, { op: 'type', n: 10, ms: 2000 }), // gap 120 s -> 90 000; run 2 000 (ends 130 s)
    at(131 * SEC, { op: 'blur' }),                          // gap 1 000
    at(focusAt, { op: 'focus' }),                           // blur -> focus: 0
    at(focusAt + 10 * SEC, { op: 'type', n: 5, ms: 1500 }), // gap 10 000; run 1 500
    at(focusAt + 12 * SEC, { op: 'delete', n: 3 }),         // gap 500 (run ended at +11.5 s)
  ];
  const expected4 = 8000 + 90000 + 2000 + 1000 + 0 + 10000 + 1500 + 500;
  assert(R.activeMs(ops4) === expected4, `Active time ${R.activeMs(ops4)} ms = ${expected4} (cap, run durations, no away time)`);
  assert(R.sessionsFrom(ops4)[0].active_ms === expected4, 'sessionsFrom() reports the same active_ms for the sitting');
  const expected1 = (1000 + 8000 + 3000 + 5000 + 90000 + 3000) + 1000; // the 1 s from the session op to the first run counts too
  assert(R.activeMs(ops1) === expected1, `Across sittings the 11-minute gap counts nothing: ${R.activeMs(ops1)} = ${expected1}`);
  const longAway = [at(0, { op: 'type', n: 5, ms: 1000 }), at(2 * SEC, { op: 'blur' }), at(2 * SEC + 15 * MIN, { op: 'focus' }), at(3 * SEC + 15 * MIN, { op: 'type', n: 5, ms: 1000 })];
  assert(R.sessionsFrom(longAway).length === 2 && R.activeMs(longAway) === 1000 + 1000 + 1000 + 1000,
    'A 15-minute absence starts a new sitting at the focus op and counts no time');
  assert(R.activeMs([at(0, { op: 'blur' }), at(5 * SEC, { op: 'type', n: 1, ms: 100 })]) === 100, 'The gap after a blur never counts, whatever follows');

  // --- TIMELINE ---
  console.log('\n=== Timeline buckets: 60 s (<= 4 h), 5 min (<= 20 h), 1 h, never more than 240 ===');
  function spread(spanMs, everyMs, n) {
    const ops = [];
    for (let t = 0; t < spanMs; t += everyMs) ops.push(at(t, { op: 'type', n, ms: 1000 }));
    return ops;
  }
  const tl3h = R.timelineFrom(spread(3 * HOUR, MIN, 7), T0, T0 + 3 * HOUR);
  assert(tl3h.bucket_ms === 60000 && tl3h.buckets.length === 180, `3 h span: 60 s buckets, one per minute typed (${tl3h.buckets.length})`);
  assert(tl3h.buckets.every((b, i) => b.i === i && b.typed === 7 && b.pasted === 0 && b.deleted === 0), '3 h span: each bucket carries i, typed, pasted, deleted');
  const tl10h = R.timelineFrom(spread(10 * HOUR, 5 * MIN, 3), T0, T0 + 10 * HOUR);
  assert(tl10h.bucket_ms === 300000 && tl10h.buckets.length === 120, `10 h span: 5 min buckets (${tl10h.buckets.length} buckets)`);
  const tl30h = R.timelineFrom(spread(30 * HOUR, HOUR, 2), T0, T0 + 30 * HOUR);
  assert(tl30h.bucket_ms === 3600000 && tl30h.buckets.length === 30, `30 h span: 1 h buckets (${tl30h.buckets.length} buckets)`);
  const tl40d = R.timelineFrom(spread(40 * 24 * HOUR, HOUR, 1), T0, T0 + 40 * 24 * HOUR);
  assert(tl40d.buckets.length <= 240 && tl40d.buckets[tl40d.buckets.length - 1].i <= 239 && tl40d.bucket_ms % HOUR === 0,
    `40-day span: ${tl40d.buckets.length} buckets of ${tl40d.bucket_ms / HOUR} h (never more than 240)`);
  assert(R.bucketMsFor(4 * HOUR) === 60000 && R.bucketMsFor(4 * HOUR + 1) === 300000 && R.bucketMsFor(20 * HOUR) === 300000 && R.bucketMsFor(20 * HOUR + 1) === 3600000,
    'bucketMsFor(): boundaries at 4 h and 20 h');
  const sparse = R.timelineFrom([at(10 * SEC, { op: 'type', n: 4, ms: 100 }), at(30 * MIN, { op: 'paste', len: 120 }), at(30 * MIN + 5 * SEC, { op: 'delete', n: 40 })], T0, T0 + 45 * MIN);
  assert(sparse.buckets.length === 2 && sparse.buckets[0].i === 0 && sparse.buckets[1].i === 30, 'Empty buckets are omitted');
  assert(sparse.buckets[1].pasted === 120 && sparse.buckets[1].deleted === 40, 'A paste counts its length, a deleted selection its size (40 at once counts 40)');
  const edge = R.timelineFrom([at(4 * HOUR, { op: 'type', n: 1, ms: 0 })], T0, T0 + 4 * HOUR);
  assert(edge.buckets.length === 1 && edge.buckets[0].i === 239, 'An op at the very end of a 4 h span lands in bucket 239');
  assert(R.timelineFrom([], T0, T0).buckets.length === 0 && R.timelineFrom([], T0, T0).bucket_ms === 60000, 'No ops: no buckets, 60 s size');

  // --- BUILD PROCESS ---
  console.log('\n=== buildProcess(): the whole process block ===');
  const ops5 = [
    at(0, { op: 'session', k: 1 }),
    at(2 * SEC, { op: 'type', n: 300, ms: 40 * SEC }),
    at(50 * SEC, { op: 'paste', len: 320 }),
    at(55 * SEC, { op: 'type', n: 100, ms: 20 * SEC }),
    at(80 * SEC, { op: 'delete', n: 40 }),
    at(90 * SEC, { op: 'blur' }),
    at(90 * SEC + 3 * MIN, { op: 'focus' }),
    at(95 * SEC + 3 * MIN, { op: 'paste', len: 60 }),
    at(2 * HOUR, { op: 'session', k: 2 }),
    at(2 * HOUR + 5 * SEC, { op: 'type', n: 200, ms: 30 * SEC }),
    at(2 * HOUR + 40 * SEC, { op: 'delete', n: 10 }),
  ];
  const finished = T0 + 2 * HOUR + 60 * SEC;
  const pr = R.buildProcess(ops5, { finishedAt: finished, revision: { backspaces: 12, cursor_jumps: 3, backward_edits: 2, editing_linearity: 0.973 } });
  assert(pr.started_at === iso(T0) && pr.finished_at === iso(finished), 'started_at is the first op, finished_at the minting time');
  assert(pr.sessions.length === 2 && pr.typed_chars === 600 && pr.pasted_chars === 380 && pr.deleted_chars === 50,
    `Counts: ${pr.sessions.length} sittings, ${pr.typed_chars} typed, ${pr.pasted_chars} pasted, ${pr.deleted_chars} deleted`);
  assert(pr.typed_share === Math.round((600 / 980) * 100) / 100, `typed_share = typed / (typed + pasted) = ${pr.typed_share}`);
  assert(pr.paste_events.length === 2 && pr.paste_events[0].len === 320 && pr.paste_events[0].t === iso(T0 + 50 * SEC) && !('text' in pr.paste_events[0]),
    'paste_events carry t and len only');
  assert(pr.away.events === 1 && pr.away.total_ms === 3 * MIN, `away: ${pr.away.events} event, ${pr.away.total_ms} ms`);
  assert(pr.active_ms === pr.sessions.reduce((s, x) => s + x.active_ms, 0), 'active_ms is the sum over sittings');
  assert(pr.revision.backspaces === 12 && pr.revision.editing_linearity === 0.97 && pr.revision.cursor_jumps === 3 && pr.revision.backward_edits === 2,
    'revision block carries the four fields (linearity rounded to 2 decimals)');
  assert(pr.timeline.bucket_ms === 60000 && pr.timeline.buckets.length > 0 && pr.timeline.buckets.reduce((s, b) => s + b.typed, 0) === 600,
    'timeline buckets add up to the typed count');
  const empty = R.buildProcess([at(0, { op: 'session', k: 1 })], { finishedAt: T0 + SEC });
  assert(empty.typed_share === null && empty.typed_chars === 0 && empty.sessions.length === 1, 'Nothing entered: typed_share null, one sitting');
  const defaults = R.buildProcess([], {});
  assert(defaults.revision.editing_linearity === 1 && defaults.revision.backspaces === 0 && defaults.sessions.length === 0, 'Missing revision data defaults to zero counts and linearity 1');
  assert(JSON.stringify(pr).indexOf('"content"') < 0, 'The process block never carries content');

  // --- CHECKPOINT CHAIN ---
  console.log('\n=== Checkpoint chain: sha256(prev|op_index|t|content_hash) ===');
  async function makeLedger(contents, opIndexes) {
    const checkpoints = [];
    let prev = 'genesis';
    for (let i = 0; i < contents.length; i++) {
      const t = iso(T0 + i * 30 * SEC);
      const content_hash = await R.sha256Hex(contents[i]);
      const hash = await R.checkpointHash(prev, opIndexes[i], t, content_hash);
      checkpoints.push({ i, op_index: opIndexes[i], t, content_hash, content: contents[i], hash });
      prev = hash;
    }
    const ops = [at(0, { op: 'session', k: 1 }), at(1 * SEC, { op: 'type', n: 5, ms: 900 }), at(3 * SEC, { op: 'paste', len: 6 }),
      at(30 * SEC, { op: 'type', n: 6, ms: 1200 }), at(40 * SEC, { op: 'delete', n: 1 }), at(50 * SEC, { op: 'type', n: 1, ms: 0 }), at(60 * SEC, { op: 'type', n: 2, ms: 100 })];
    return { version: '4.0', type: 'jitter-ledger', started_at: iso(T0), exported_at: iso(T0 + 2 * MIN), ops, checkpoints, final_hash: prev };
  }
  const file = await makeLedger(['', 'Hello', 'Hello world'], [0, 3, 7]);
  const nodeHash = s => nodeCrypto.createHash('sha256').update(s).digest('hex');
  assert(file.checkpoints[0].hash === nodeHash('genesis|0|' + file.checkpoints[0].t + '|' + nodeHash('')), 'The first hash chains from "genesis" exactly as the spec formula says (Node crypto agrees)');
  assert(file.checkpoints[1].hash === nodeHash(file.checkpoints[0].hash + '|3|' + file.checkpoints[1].t + '|' + nodeHash('Hello')), 'The second hash chains from the first');
  const ok = await R.verifyLedger(file);
  assert(ok.ok === true && ok.checkpoints === 3 && ok.ops === 7 && ok.firstBad === null && ok.final_hash === file.final_hash && ok.reason === null,
    `An untouched ledger verifies: ${JSON.stringify(ok)}`);

  const tamperContent = JSON.parse(JSON.stringify(file));
  tamperContent.checkpoints[1].content = 'Hello!';
  const bad1 = await R.verifyLedger(tamperContent);
  assert(bad1.ok === false && bad1.firstBad === 1 && bad1.reason === 'content', `Edited content in block 2 fails at index 1 (${bad1.reason})`);

  const tamperHash = JSON.parse(JSON.stringify(file));
  tamperHash.checkpoints[2].hash = 'f'.repeat(64);
  tamperHash.final_hash = tamperHash.checkpoints[2].hash;
  const bad2 = await R.verifyLedger(tamperHash);
  assert(bad2.ok === false && bad2.firstBad === 2 && bad2.reason === 'hash', `A rewritten chain hash fails at index 2 (${bad2.reason})`);

  const tamperOrder = JSON.parse(JSON.stringify(file));
  tamperOrder.checkpoints[1].op_index = 4;
  assert((await R.verifyLedger(tamperOrder)).firstBad === 1, 'Changing an op_index breaks that block\'s hash');

  const tamperFinal = JSON.parse(JSON.stringify(file));
  tamperFinal.final_hash = 'a'.repeat(64);
  const bad3 = await R.verifyLedger(tamperFinal);
  assert(bad3.ok === false && bad3.firstBad === null && bad3.reason === 'final_hash', 'A wrong final_hash fails without blaming a block');

  const dropped = JSON.parse(JSON.stringify(file));
  dropped.checkpoints.pop();
  assert((await R.verifyLedger(dropped)).ok === false, 'Dropping the last block leaves final_hash unmatched');

  const noContent = JSON.parse(JSON.stringify(file));
  noContent.checkpoints.forEach(cp => { delete cp.content; });
  assert((await R.verifyLedger(noContent)).ok === true, 'A ledger shared without snapshots (content_hash only) still recomputes');

  const emptyFile = await R.verifyLedger({ checkpoints: [], ops: [] });
  assert(emptyFile.ok === false && emptyFile.reason === 'empty' && (await R.verifyLedger(null)).ok === false, 'An empty or missing file never verifies and never throws');
  const pasteMarks = R.pasteCheckpoints(file);
  assert(JSON.stringify(pasteMarks) === '[0,6,0]', `pasteCheckpoints(): characters pasted before each block ${JSON.stringify(pasteMarks)}`);

  // --- DESCRIBE + SUMMARIZE ---
  console.log('\n=== describeReceipt() / summarize(): wording ===');
  const fakeJwk = { kty: 'EC', crv: 'P-256', x: 'f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU', y: 'x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0' };
  const receipt = {
    version: '4.0', type: 'process-receipt', title: 'Untitled',
    text_hash: nodeHash('essay'), chars: 4380, words: 812, url: 'jitter://writer', minted_at: iso(finished),
    publicKeyJwk: fakeJwk, publicKeyId: 'ABCDEF012345', previousBadge: null,
    keys: 600, war: 0.71, war_uncapped: 0.71,
    process: pr,
    typing: { mean_dwell: 91.2, std_dwell: 24.1, mean_flight: 214.5, std_flight: 96.3, keys: 600 },
    ledger: { hash: 'c'.repeat(64), checkpoints: 41, ops: 1180 },
    signature: 'MEUCIQ' + 'A'.repeat(80),
  };
  const view = R.describeReceipt(receipt);
  assert(view.kind === 'receipt' && view.signed === true && view.attested === false && view.rhythm === 0.71, 'A v4 receipt is described as a receipt');
  assert(view.counts.typed === 600 && view.counts.pasted === 380 && view.counts.pastes === 2 && view.counts.deleted === 50, 'Counts come from the process block');
  assert(view.typing.mean_flight === 214.5 && view.ledger.checkpoints === 41, 'Typing and ledger blocks are carried over');
  const summary = R.summarize(receipt);
  assert(summary.headline.startsWith('Written over 2 sittings'), `Headline: ${summary.headline}`);
  assert(summary.headline.indexOf(' of active writing · 600 characters typed, 380 pasted in 2 pastes, 50 deleted · 61% of what was entered was typed here.') > 0,
    'Headline follows the spec sentence: sittings · active writing · typed/pasted/deleted · share');
  assert(summary.pastes.length === 2 && /^Paste 1 · 50 s after the start · 320 characters · 7% of the final text length$/.test(summary.pastes[0]), `Paste line: ${summary.pastes[0]}`);
  assert(summary.sessions.length === 2 && /^Sitting 1 · .* active · 400 typed, 380 pasted, 40 deleted$/.test(summary.sessions[0]), `Sitting line: ${summary.sessions[0]}`);
  assert(summary.rhythm.indexOf('rhythm score 0.71 — one statistic, not a verdict') > 0 && summary.rhythm.indexOf('key hold 91.2 ms (spread 24.1 ms)') === 0, `Rhythm line: ${summary.rhythm}`);
  assert(summary.revision.indexOf('12 backspaces · 2 backward edits · 3 cursor jumps · editing linearity 0.97') === 0, `Revision line: ${summary.revision}`);
  assert(summary.away === 'Away from the Writer 1 time during a sitting, 3 min in total (not counted as active writing)', `Away line: ${summary.away}`);
  assert(R.summarize(view).headline === summary.headline, 'summarize() accepts a view model or a raw receipt');

  const oneSitting = R.summarize(Object.assign({}, receipt, { process: R.buildProcess(ops5.slice(0, 5), { finishedAt: T0 + 2 * MIN }) }));
  assert(oneSitting.headline.startsWith('Written in one sitting · '), `One sitting: ${oneSitting.headline}`);
  const noEntry = R.summarize(Object.assign({}, receipt, { process: empty }));
  assert(noEntry.share === 'nothing was entered through the keyboard or the clipboard', 'No entry has its own wording');
  const twoDays = R.summarize(Object.assign({}, receipt, { process: R.buildProcess([at(0, { op: 'type', n: 5, ms: 100 }), at(3 * 24 * HOUR, { op: 'session', k: 2 }), at(3 * 24 * HOUR + SEC, { op: 'type', n: 5, ms: 100 })], { finishedAt: T0 + 3 * 24 * HOUR + MIN }) }));
  assert(twoDays.sittings === 'Written over 2 sittings across 2 days', `Days: ${twoDays.sittings}`);

  const badge = { version: '3.0', type: 'content', keys: 812, pastedChars: 40, pastes: 2, edits: 30, meanDwell: 90, stdDwell: 20, meanFlight: 200, stdFlight: 80,
    war: 0.35, war_uncapped: 0.7, text_hash: nodeHash('x'), url: 'https://example.org/post', minted_at: iso(T0), date: '2026-09-20', publicKeyJwk: fakeJwk, signature: 'sig', accountAge: 3, passport: 5000 };
  const bview = R.describeReceipt(badge);
  assert(bview.kind === 'badge' && bview.counts.typed === 812 && bview.counts.pastes === 2 && bview.counts.backspaces === 30 && bview.typing.mean_dwell === 90 && bview.rhythm === 0.7 && bview.process === null,
    'A v3 badge is described with its basic counts and rhythm only');
  const bsum = R.summarize(badge);
  assert(bsum.headline.startsWith('Older badge (version 3.0)') && bsum.headline.indexOf('812 keystrokes typed, 40 characters pasted in 2 pastes, 30 backspaces') > 0, `v3 headline: ${bsum.headline}`);
  assert(R.describeReceipt(null).kind === 'badge' && R.summarize(null).headline.length > 0 && R.summarize({ version: '4.0', process: { sessions: 'x', timeline: 5 } }).kind === 'receipt',
    'Junk input is described without throwing');

  // Wording: no forbidden words anywhere a teacher reads
  const strings = allStrings(summary).concat(allStrings(bsum), allStrings(noEntry), allStrings(twoDays), [R.FIXED_NOTE, R.FIXED_NOTE_HTML, R.timelineSvg(pr)]);
  const hits = strings.map(forbiddenIn).filter(Boolean);
  assert(hits.length === 0, `No forbidden word in summaries, note or timeline (${hits.length ? 'found: ' + hits.join(', ') : 'none found in ' + strings.length + ' strings'})`);
  assert(strings.some(s => s.indexOf('one statistic, not a verdict') >= 0), 'The rhythm score carries the fixed label');
  assert(forbiddenIn('This is suspicious') === 'suspicious' && forbiddenIn('an AI wrote it') === 'AI' && forbiddenIn('detail available chain') === null,
    'The forbidden-word check itself works (whole words only)');

  // The fixed note is the spec's first paragraph, verbatim
  const spec = fs.readFileSync(path.join(__dirname, '..', 'docs', 'product', 'PROCESS_RECEIPT.md'), 'utf8');
  const paragraph = spec.split('\n').find(line => line.startsWith('A process receipt records'));
  assert(paragraph && paragraph.replace(/\*\*/g, '') === R.FIXED_NOTE, 'FIXED_NOTE equals the first paragraph of PROCESS_RECEIPT.md');
  assert(R.FIXED_NOTE_HTML.replace(/<\/?strong>/g, '') === R.FIXED_NOTE, 'FIXED_NOTE_HTML is the same text with the spec\'s emphasis');

  // --- TIMELINE SVG ---
  console.log('\n=== timelineSvg(): inline SVG, no libraries ===');
  const svg = R.timelineSvg(pr);
  assert(svg.startsWith('<svg') && svg.endsWith('</svg>') && svg.indexOf('<script') < 0, 'Inline SVG markup');
  assert((svg.match(/class="tl-typed"/g) || []).length === pr.timeline.buckets.filter(b => b.typed > 0).length, 'One typed bar per bucket with typing');
  assert((svg.match(/class="tl-paste"/g) || []).length === 2 && (svg.match(/class="tl-sitting"/g) || []).length === 1, 'Paste marks per paste event, a boundary per extra sitting');
  assert(R.timelineSvg({}) === '' && R.timelineSvg(null) === '', 'No process: no markup');
  const hostile = R.timelineSvg(Object.assign({}, pr, { started_at: '<script>', sessions: [{ start: '"><img src=x>' }] }));
  assert(hostile.indexOf('<script>') < 0 && hostile.indexOf('<img') < 0, 'Hostile strings never reach the markup (numeric or formatted values only)');

  // --- FORMATTING ---
  console.log('\n=== Formatting ===');
  assert(R.formatDuration(0) === '0 s' && R.formatDuration(45000) === '45 s' && R.formatDuration(61000) === '1 min 1 s' && R.formatDuration(120000) === '2 min'
    && R.formatDuration(6120000) === '1 h 42 min' && R.formatDuration(3600000) === '1 h' && R.formatDuration(-5) === '0 s' && R.formatDuration(NaN) === '0 s',
    'formatDuration(): s, min s, h min');
  assert(R.formatNumber(4120) === '4,120' && R.formatNumber(null) === '—' && R.plural(1, 'paste') === '1 paste' && R.plural(2, 'paste') === '2 pastes', 'formatNumber() / plural()');
  assert(R.percent(0.92) === '92%' && R.percent(0.999, 5) === '99%' && R.percent(1, 0) === '100%' && R.percent(null) === '—', 'percent(): never 100% while something was pasted');
  assert(R.countOps(ops5).typed === 600 && R.countOps(ops5).pastes === 2, 'countOps() totals');
  assert(R.awayFrom([at(0, { op: 'blur' })]).events === 1 && R.awayFrom([at(0, { op: 'blur' })]).total_ms === 0, 'An unpaired blur counts as an event with no duration');

  // --- SIZE ---
  console.log('\n=== Receipt size (target: under 8 KB for a 5 000-character essay) ===');
  function receiptFor(ops, finishedAt) {
    const p = R.buildProcess(ops, { finishedAt, revision: { backspaces: 540, cursor_jumps: 12, backward_edits: 9, editing_linearity: 0.97 } });
    return Object.assign({}, receipt, { process: p, keys: p.typed_chars, chars: 5000, words: 900, previousBadge: '0123456789abcdef', attestation: undefined });
  }
  // 5 000 characters typed briskly in 20 minutes with two pastes and some deleting
  const fast = [at(0, { op: 'session', k: 1 })];
  for (let t = SEC; t < 20 * MIN; t += 12 * SEC) fast.push(at(t, { op: 'type', n: 50, ms: 10 * SEC }));
  fast.push(at(5 * MIN, { op: 'paste', len: 200 }), at(9 * MIN, { op: 'delete', n: 60 }), at(14 * MIN, { op: 'paste', len: 90 }));
  fast.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const fastSize = JSON.stringify(receiptFor(fast, T0 + 20 * MIN)).length;
  assert(fastSize < 8192, `A 20-minute 5 000-character receipt is ${fastSize} bytes (< 8 192)`);
  // The same essay over 3 hours in 3 sittings, typing in most minutes
  const slow = [];
  for (let s = 0; s < 3; s++) {
    const base = s * 70 * MIN;
    slow.push(at(base, { op: 'session', k: s + 1 }));
    for (let t = SEC; t < 55 * MIN; t += 60 * SEC) slow.push(at(base + t, { op: 'type', n: 30, ms: 40 * SEC }));
    slow.push(at(base + 20 * MIN + 30 * SEC, { op: 'delete', n: 25 }));
  }
  slow.push(at(75 * MIN, { op: 'paste', len: 200 }), at(150 * MIN, { op: 'paste', len: 90 }));
  slow.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const slowReceipt = receiptFor(slow, T0 + 3 * HOUR);
  const slowSize = JSON.stringify(slowReceipt).length;
  console.log(`INFO: a 3-hour, 3-sitting 5 000-character receipt is ${slowSize} bytes with ${slowReceipt.process.timeline.buckets.length} timeline buckets`);
  assert(slowSize < 16384, `A 3-hour 5 000-character receipt stays under 16 KB (${slowSize} bytes)`);

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log('Done.');
})().catch(e => { console.error('FAIL:', e); process.exitCode = 1; });
