// Tier-2 attack: an UNMODIFIED client fed synthetic keystrokes with sampled timing.
// Drives the real extension capture (biometrics.js handleKeydown/handleKeyup) on a
// fake clock, so profile/session are built exactly as the shipping code builds them,
// then scores with the shipping engine. No tuning against the engine's internals:
// only "sample from log-normal distributions with fixed per-identity parameters".
let clock = 0;
globalThis.performance = { now: () => clock };
globalThis.window = undefined;
const ROOT = require('path').resolve(__dirname, '..', '..');
const bio = require(ROOT + '/extension/src/biometrics.js');

const TEXT = 'The meeting ran long again, but we got through the whole agenda in the end. ' +
  'I think the new plan is better than the old one, even if it takes another month to land. ' +
  'Send me the notes when you have a minute and I will add the numbers from the last quarter. ' +
  'There is one thing I want to check before we tell the rest of the team about it.';

function mulberry32(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function gauss(rnd) { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const lognormal = (rnd, median, sigma) => median * Math.exp(sigma * gauss(rnd));

// Bot A: what the repo's own "human" fixture and Playwright tests do — uniform random timing.
function uniformBot(rnd) {
  return { dwell: () => 60 + rnd() * 80, flight: () => 150 + rnd() * 200, pauseAt: () => 0, mistakes: 0.03 };
}
// Bot B: per-identity fixed parameters (a few hundred bytes), log-normal sampling,
// per-key and per-bigram multipliers, word/sentence pauses, typos with backspace.
function identityBot(seed) {
  const rnd = mulberry32(seed);
  const keyMul = {}, bigramMul = {};
  const dwellMedian = lognormal(rnd, 88, 0.15), flightMedian = lognormal(rnd, 175, 0.2);
  const mul = (map, k, sigma) => (map[k] ??= Math.exp(sigma * gauss(rnd)));
  const sess = mulberry32(seed * 7919 + 17);
  return {
    dwell: (key) => lognormal(sess, dwellMedian * mul(keyMul, key, 0.18), 0.22),
    flight: (prev, key) => lognormal(sess, flightMedian * mul(bigramMul, prev + key, 0.25) * (prev === ' ' ? 1.35 : 1), 0.33),
    pauseAt: (prev) => /[.!?]/.test(prev) ? lognormal(sess, 900, 0.4) : (prev === ' ' && sess() < 0.08 ? lognormal(sess, 450, 0.4) : 0),
    mistakes: 0.04, rnd: sess,
  };
}

function typeSession(bot, text) {
  const s = bio.createSession();
  let prev = '';
  const rnd = bot.rnd || Math.random;
  for (const ch of text) {
    // occasional typo: wrong key, backspace, right key
    if (rnd() < bot.mistakes) {
      const wrong = 'abcdefghijklmnopqrstuvwxyz'[Math.floor(rnd() * 26)];
      press(s, wrong, bot, prev); prev = wrong;
      clock += bot.flight(prev, 'Backspace') * 1.4;
      bio.handleKeydown(s, 'Backspace', false, false, false); clock += 70; bio.handleKeyup(s, 'Backspace', false, false, false);
    }
    press(s, ch, bot, prev); prev = ch;
  }
  return s;
}
function press(s, ch, bot, prev) {
  clock += (prev ? bot.flight(prev, ch) : 0) + bot.pauseAt(prev);
  bio.handleKeydown(s, ch, false, false, false);
  clock += bot.dwell(ch);
  bio.handleKeyup(s, ch, false, false, false);
}

function score(s) {
  const profile = bio.getProfile(s);
  const r = bio.scoreWAR(s, profile);
  return { war: r.war, raw: r.raw_war, cls: r.classification, flags: r.flags, comp: r.components, profile };
}

console.log('engine', require(ROOT + '/extension/src/war-score.js').version);
const A = score(typeSession(uniformBot(mulberry32(3)), TEXT));
console.log(`Bot A (uniform random, = repo fixture/Playwright typing): raw ${A.raw} war ${A.war} -> "${A.cls}" flags=${JSON.stringify(A.flags)}`);

const rows = [];
for (let id = 1; id <= 8; id++) {
  const per = [];
  for (let k = 0; k < 3; k++) per.push(score(typeSession(identityBot(id * 100 + k), TEXT)));
  // identityBot(seed) fixes parameters by seed; use the SAME identity params across sessions:
  const bot = identityBot(id);
  const same = [];
  for (let k = 0; k < 3; k++) same.push(score(typeSession(bot, TEXT)));
  rows.push({ id, sessions: same.map(r => `${r.raw}/${r.cls}`), meanDwell: same.map(r => r.profile.mean_dwell), meanIki: same.map(r => r.profile.mean_inter_key), flags: same[0].flags });
}
console.log('Bot B (fixed per-identity parameters, 3 sessions each): raw_war/classification');
for (const r of rows) console.log(`  id ${r.id}: ${r.sessions.join('  ')}   mean_dwell ${r.meanDwell.join('/')}  mean_iki ${r.meanIki.join('/')}  flags=${JSON.stringify(r.flags)}`);
const all = rows.flatMap(r => r.sessions.map(x => parseFloat(x)));
const verified = all.filter(x => x >= 0.8).length;
console.log(`Bot B summary: ${verified}/${all.length} sessions raw >= 0.80 (would read "verified" on a 30-day-old key); min ${Math.min(...all)} max ${Math.max(...all)}`);
const B = score(typeSession(identityBot(1), TEXT));
console.log('Bot B components (id 1):', JSON.stringify(B.comp));
