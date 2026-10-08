// tests/engine-gen.test.js
// One engine, one number. The attestation server scores with a generated
// copy of extension/src/war-score.js (supabase/functions/_shared/engine.gen.mjs);
// this checks that the copy and the SDK bundle are what `node sdk/build.js`
// produces today, and that the extension capture, the SDK core, the server
// copy and the server's validated session all give the same score for the
// same timing payload.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { generate } = require('../sdk/build.js');
const bio = require('../extension/src/biometrics.js');

const ROOT = path.resolve(__dirname, '..');
const ENGINE_GEN = path.join(ROOT, 'supabase', 'functions', '_shared', 'engine.gen.mjs');
const DIST = path.join(ROOT, 'sdk', 'dist', 'jitter.min.js');

let passed = 0, failed = 0;
function assert(condition, msg) {
  if (!condition) { console.error('FAIL:', msg); failed++; process.exitCode = 1; return; }
  console.log('PASS:', msg); passed++;
}

// Deterministic sessions driven through the real extension capture.
function lcg(seed) { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }
function gauss(rnd) { const u = Math.max(1e-9, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const TEXT = 'the quick brown fox jumps over the lazy dog, then it rests. another sentence is here to add more letters and pairs. ';
let clock = 0;
performance.now = () => clock;

function fuzzSession(seed) {
  const rnd = lcg(seed);
  const kind = seed % 4; // 0 human, 1 fast human, 2 script, 3 human with pastes
  const s = bio.createSession();
  const keys = 60 + Math.floor(rnd() * 240);
  const base = kind === 2 ? 100 : kind === 1 ? 90 : 160;
  const sigma = kind === 2 ? 0 : 0.3;
  for (let i = 0; i < keys; i++) {
    const ch = TEXT[i % TEXT.length];
    const gapMul = /[ .,]/.test(TEXT[(i + TEXT.length - 1) % TEXT.length]) ? 1.8 : 1;
    let flight = Math.exp(Math.log(base) + sigma * gauss(rnd)) * gapMul;
    if (kind !== 2 && rnd() < 0.02) flight = 2500 + rnd() * 2000;   // a thinking pause
    clock += flight;
    if (kind !== 2 && rnd() < 0.06) { bio.handleKeydown(s, 'Backspace', false, false, false); clock += 60; }
    bio.handleKeydown(s, ch, false, false, false);
    // Scripts hold keys 12 ms: inside the capture window, under the 27 ms floor.
    // (A 2 ms hold would be discarded by the capture and never trip the floor: audit P1-16, open.)
    clock += kind === 2 ? 12 : Math.max(12, 80 + 20 * gauss(rnd) + (ch.charCodeAt(0) % 7) * 4);
    bio.handleKeyup(s, ch, false, false, false);
    if (kind === 3 && i === Math.floor(keys / 2)) bio.handlePaste(s, 40 + Math.floor(rnd() * 400));
  }
  return s;
}

(async () => {
  console.log('\n=== Generated files are current ===');
  const gen = generate();
  assert(fs.existsSync(ENGINE_GEN) && fs.readFileSync(ENGINE_GEN, 'utf8') === gen.engine,
    'supabase/functions/_shared/engine.gen.mjs is what sdk/build.js generates from war-score.js (else: node sdk/build.js)');
  assert(fs.readFileSync(DIST, 'utf8') === gen.bundle, 'sdk/dist/jitter.min.js is what sdk/build.js generates (else: node sdk/build.js)');
  assert(/^\/\/ GENERATED/.test(gen.engine) && /export const JitterWAR/.test(gen.engine) && !/module\.exports/.test(gen.engine),
    'the server module is an ES module with no script or CommonJS shims');

  console.log('\n=== The server copy is the engine ===');
  const { JitterWAR: Srv } = await import(pathToFileURL(ENGINE_GEN).href);
  const { default: JitterBox } = await import(pathToFileURL(path.join(ROOT, 'sdk', 'src', 'core', 'jitter-box.js')).href);
  assert(Srv.version === bio.WAR.version && typeof Srv.scoreSession === 'function' && typeof Srv.sanitizeTiming === 'function',
    `server engine ${Srv.version} = client engine ${bio.WAR.version}`);
  assert(JSON.stringify(Srv.WAR_WEIGHTS) === JSON.stringify(bio.WAR.WAR_WEIGHTS) && JSON.stringify(Srv.HARD_FLOORS) === JSON.stringify(bio.WAR.HARD_FLOORS),
    'same weights and floors');

  console.log('\n=== One number: extension capture, SDK core, server copy, validated session ===');
  const N = 300;
  let same = 0, accepted = 0, nearLive = 0, scored = 0, bots = 0, pasted = 0;
  const diffs = [];
  for (let i = 0; i < N; i++) {
    const session = fuzzSession(1000 + i);
    const timing = bio.WAR.timingFromSession(session);
    const copy = JSON.parse(JSON.stringify(timing));           // what the server receives
    const a = bio.WAR.scoreSession(timing).war;                 // the extension's badge / receipt score
    const b = Srv.scoreSession(timing).war;                     // the server, same payload
    const c = JitterBox.scoreRaw(timing).war;                   // the SDK (WGH path)
    const san = Srv.sanitizeTiming(copy);
    const d = san.ok ? Srv.scoreSession(san.session).war : 'rejected';
    if (san.ok) accepted++;
    if (a === b && b === c && c === d) same++; else diffs.push({ i, a, b, c, d });
    const live = bio.scoreWAR(session, bio.getProfile(session)).war;
    if ((live == null && a == null) || (live != null && a != null && Math.abs(live - a) <= 0.02)) nearLive++;
    if (a != null) scored++;
    if (a === 0) bots++;
    if (timing.pasteLengths.length) pasted++;
  }
  assert(accepted === N, `every client payload passes the server's validation (${accepted}/${N})`);
  assert(same === N, `the four paths agree on every session (${same}/${N})${diffs.length ? ' first diff ' + JSON.stringify(diffs[0]) : ''}`);
  assert(nearLive === N, `the live-session score and the payload score agree within rounding (${nearLive}/${N})`);
  assert(scored > N * 0.9 && bots >= N / 4 - 2 && pasted >= N / 4 - 2, `the fuzz covers scored sessions (${scored}), floored scripts (${bots}) and pastes (${pasted})`);

  console.log('\n=== The payload never carries text, and stays small ===');
  const big = fuzzSession(7);
  const t = bio.WAR.timingFromSession(big);
  const json = JSON.stringify(t);
  assert(!/[a-z]{4,}/.test(json.replace(/"(v|flightTimes|dwellTimes|fatigueWindows|humanChars|alienChars|totalKeystrokes|backspaceCount|pauseCount|pasteCount|pasteLengths|perKeyDwells|bigramTimings)"/g, '')),
    'only field names, keys, bigrams and numbers: no words');
  assert(t.flightTimes.length <= 100 && t.dwellTimes.length <= 100 && Object.values(t.perKeyDwells).every(v => v.length <= 50) && Object.values(t.bigramTimings).every(v => v.length <= 50),
    'bounded: at most 100 flights, 100 dwells, 50 samples per key and per bigram');
  assert(json.length < 24 * 1024, `a full payload is ${json.length} bytes (< 24 KB; the server accepts 64 KB)`);
  assert(t.flightTimes.every(x => x >= 20 && x <= 2000) && t.dwellTimes.every(x => x >= 10 && x <= 500), 'values stay inside the capture windows');

  console.log(`\n${passed} passed, ${failed} failed`);
})().catch(e => { console.error('FAIL:', e); process.exitCode = 1; });
