// tests/war-scorer.test.js
// WAR engine tests, run through the extension wrapper (extension/src/biometrics.js),
// which delegates to the canonical engine (extension/src/war-score.js).
// Hand-rolled PASS/FAIL; exits non-zero on any failure.
const bio = require('../extension/src/biometrics.js');
const WAR = require('../extension/src/war-score.js');

let passed = 0, failed = 0;
function assert(condition, msg) {
  if (!condition) { console.error('FAIL:', msg); failed++; process.exitCode = 1; return; }
  console.log('PASS:', msg); passed++;
}
function near(a, b, tol) {
  return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol;
}
function sameJson(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// Seeded PRNG (mulberry32): the same session on every run.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Helper: build a minimal human-like session (50 flights 150-350ms, dwells 60-140ms)
function humanSession(seed = 1) {
  const rnd = mulberry32(seed);
  const s = bio.createSession();
  for (let i = 0; i < 50; i++) {
    s.flightTimes.push(150 + rnd() * 200);
    s.dwellTimes.push(60 + rnd() * 80);
  }
  s.humanChars = 50;
  s.alienChars = 0;
  s.totalKeystrokes = 50;
  s.backspaceCount = 3;
  s.pauseCount = 2;
  return s;
}

// Feed paste events through the real capture entry point (records lengths only)
function withPastes(session, lengths) {
  lengths.forEach(len => bio.handlePaste(session, len));
  return session;
}

function humanProfile() {
  return {
    mean_inter_key: 220,
    std_inter_key: 45,
    mean_dwell: 85,
    std_dwell: 18,
    edit_ratio: 0.06,
    pause_freq: 1.2,
    per_key_dwell: { e: 70, t: 82, a: 90, o: 75, i: 68, n: 88 },
    bigram_signatures: {
      th: { mean: 140, std: 30, n: 8 },
      he: { mean: 160, std: 25, n: 7 },
      in: { mean: 180, std: 35, n: 6 },
      er: { mean: 155, std: 28, n: 5 },
    },
  };
}

// A clear human: per-key and bigram fingerprints well inside the human zone
function strongHumanProfile() {
  return {
    mean_inter_key: 220,
    std_inter_key: 45,
    mean_dwell: 85,
    std_dwell: 18,
    edit_ratio: 0.06,
    pause_freq: 1.2,
    per_key_dwell: { e: 60, t: 95, a: 110, o: 70, i: 55, n: 100 },
    bigram_signatures: {
      th: { mean: 120, std: 30, n: 8 },
      he: { mean: 175, std: 25, n: 7 },
      in: { mean: 210, std: 35, n: 6 },
      er: { mean: 150, std: 28, n: 5 },
      an: { mean: 140, std: 22, n: 5 },
    },
  };
}

function botSession() {
  const s = bio.createSession();
  s.flightTimes = Array(50).fill(5);  // 5ms fixed
  s.dwellTimes = Array(50).fill(1);   // 1ms fixed
  s.humanChars = 50;
  s.alienChars = 0;
  s.totalKeystrokes = 50;
  s.backspaceCount = 0;
  s.pauseCount = 0;
  return s;
}

function botProfile() {
  return {
    mean_inter_key: 5,
    std_inter_key: 0.5,
    mean_dwell: 1,
    std_dwell: 0.2,
    edit_ratio: 0,
    pause_freq: 0,
    per_key_dwell: { e: 1, t: 1, a: 1, o: 1, i: 1, n: 1 },
    bigram_signatures: {
      th: { mean: 5, std: 0.1, n: 8 },
      he: { mean: 5, std: 0.1, n: 7 },
      in: { mean: 5, std: 0.1, n: 6 },
      er: { mean: 5, std: 0.1, n: 5 },
    },
  };
}

// Sophisticated bot: human-like IKI but uniform dwell
function sophisticatedBotProfile() {
  return {
    mean_inter_key: 230,
    std_inter_key: 40,
    mean_dwell: 80,
    std_dwell: 6,   // suspiciously low
    edit_ratio: 0.02,
    pause_freq: 0.3,
    per_key_dwell: { e: 80, t: 80, a: 80, o: 80, i: 80, n: 80 }, // uniform
    bigram_signatures: {
      th: { mean: 200, std: 5, n: 8 },
      he: { mean: 200, std: 5, n: 7 },
      in: { mean: 200, std: 5, n: 6 },
      er: { mean: 200, std: 5, n: 5 },
    },
  };
}

const DAY = 86400000;

// --- HUMANS, BOTS, FLOORS ---
console.log('\n=== Humans, bots, hard floors ===');

// Test 1: Human scores in the human range
const hResult = bio.scoreWAR(humanSession(), humanProfile());
assert(hResult.war >= 0.40, `Human WAR=${hResult.war} should be >= 0.40`);
assert(hResult.tier !== 'Suspicious', `Human tier="${hResult.tier}" should not be Suspicious`);
assert(hResult.classification === WAR.classify(hResult.war),
  `Classification "${hResult.classification}" follows the 0.80 / 0.50 thresholds`);
const strong = bio.scoreWAR(humanSession(), strongHumanProfile());
assert(strong.war >= 0.70, `Strong human WAR=${strong.war} should be >= 0.70`);
assert(strong.flags.length === 0, `Strong human should have no flags, got ${strong.flags}`);

// Test 2: Obvious bot hits hard floor -> WAR = 0
const bResult = bio.scoreWAR(botSession(), botProfile());
assert(bResult.war === 0, `Bot WAR=${bResult.war} should be 0 (hard floor)`);
assert(bResult.tier === 'Suspicious', `Bot tier="${bResult.tier}" should be Suspicious`);
assert(bResult.classification === 'bot', `Bot classification="${bResult.classification}" should be bot`);
assert(bResult.flags.length > 0, `Bot should have flags, got ${bResult.flags}`);

// Test 3: Sophisticated bot gets penalized below human range
const sResult = bio.scoreWAR(humanSession(), sophisticatedBotProfile());
assert(sResult.war < 0.50, `Sophisticated bot WAR=${sResult.war} should be < 0.50`);
assert(sResult.flags.length >= 2, `Sophisticated bot should have 2+ flags, got ${sResult.flags}`);

// Test 4: Hard floor on mean_dwell < 27
const dwellProfile = humanProfile();
dwellProfile.mean_dwell = 15;
const dwResult = bio.scoreWAR(humanSession(), dwellProfile);
assert(dwResult.war === 0 && dwResult.flags.includes('dwell_floor'), `Dwell floor bot WAR=${dwResult.war} should be 0`);

// Test 5: Hard floor on std_inter_key < 9
const varProfile = humanProfile();
varProfile.std_inter_key = 3;
const vrResult = bio.scoreWAR(humanSession(), varProfile);
assert(vrResult.war === 0 && vrResult.flags.includes('variance_floor'), `Variance floor bot WAR=${vrResult.war} should be 0`);

// Test 6: Hard floor on mean_inter_key < 54
const ikiProfile = humanProfile();
ikiProfile.mean_inter_key = 30;
const ikResult = bio.scoreWAR(humanSession(), ikiProfile);
assert(ikResult.war === 0 && ikResult.flags.includes('iki_floor'), `IKI floor bot WAR=${ikResult.war} should be 0`);

// --- WEIGHTS AND COMPONENTS ---
console.log('\n=== Weights and components (JITTER-PLAN "WAR Formula") ===');

const PLAN_WEIGHTS = {
  bigram_rhythm: 0.18, per_key: 0.15, cross_signal: 0.15, distribution: 0.12,
  inter_key_var: 0.10, dwell_std: 0.10, mean_dwell: 0.08, editing: 0.07, purity: 0.05,
};
const wSum = Object.values(bio.WAR_WEIGHTS).reduce((a, b) => a + b, 0);
assert(near(wSum, 1.0, 1e-9), `Weights sum=${wSum} should be 1.0`);
assert(sameJson(Object.keys(bio.WAR_WEIGHTS).sort(), Object.keys(PLAN_WEIGHTS).sort()),
  `Weight keys match the plan: ${Object.keys(bio.WAR_WEIGHTS).sort().join(', ')}`);
assert(Object.keys(PLAN_WEIGHTS).every(k => bio.WAR_WEIGHTS[k] === PLAN_WEIGHTS[k]),
  'Every weight equals the plan value');
assert(!('dwell_uniformity' in bio.WAR_WEIGHTS) && hResult.components.dwell_uniformity === undefined,
  'dwell_uniformity is gone (it duplicated per_key)');
assert(sameJson(Object.keys(hResult.components).sort(), Object.keys(PLAN_WEIGHTS).sort()),
  'A scored session reports exactly the nine plan components');
assert(Object.values(hResult.components).every(v => typeof v === 'number' && v >= 0 && v <= 1),
  'Every component is a number in [0, 1]');
assert(bio.WAR_WEIGHTS === WAR.WAR_WEIGHTS && bio.WAR_RAMPS === WAR.WAR_RAMPS && bio.WAR_TIERS === WAR.WAR_TIERS,
  'biometrics.js exposes the engine tables themselves, not copies');
assert(sameJson(bio.scoreWAR(humanSession(), humanProfile()), WAR.scoreProfile(humanProfile(), humanSession())),
  'bio.scoreWAR is the shared engine (identical result to JitterWAR.scoreProfile)');
assert(!('paste_heavy' in bio.PENALTIES) && !('paste_flood' in bio.PENALTIES),
  'No paste penalties exist (Hard Rule #5: paste is transparent, not punished)');
assert(sameJson(bio.WAR_TIERS, [[0.80, 'Hall of Fame'], [0.60, 'All-Star'], [0.40, 'Solid'], [0.20, 'Rookie'], [0, 'Suspicious']]),
  'Tiers match the plan on the 0-1 scale');
assert(WAR.tierFor(0.8) === 'Hall of Fame' && WAR.tierFor(0.6) === 'All-Star' && WAR.tierFor(0.4) === 'Solid' &&
  WAR.tierFor(0.2) === 'Rookie' && WAR.tierFor(0.19) === 'Suspicious' && WAR.tierFor(null) === null,
  'tierFor() boundaries');
assert(WAR.classify(0.8) === 'verified' && WAR.classify(0.79) === 'suspicious' && WAR.classify(0.5) === 'suspicious' &&
  WAR.classify(0.49) === 'bot' && WAR.classify(null) === 'insufficient_data',
  'classify() thresholds: verified >= 0.80, suspicious >= 0.50, bot below');

// --- PASTE ---
console.log('\n=== Paste: weighted by length, transparent, not punished ===');

const clean = strong;
const url = bio.scoreWAR(withPastes(humanSession(), [45]), strongHumanProfile());
assert(near(url.war, clean.war, 0.02), `One 45-char URL paste: WAR ${url.war} within 0.02 of ${clean.war}`);
assert(url.paste.count === 1 && url.paste.chars === 45 && url.paste.weightedChars === 4.5,
  `URL paste reported transparently: ${JSON.stringify(url.paste)} (45 chars at 0.1x = 4.5)`);
assert(url.classification === clean.classification, `URL paste keeps classification "${clean.classification}"`);

const quote = bio.scoreWAR(withPastes(humanSession(), [250]), strongHumanProfile());
assert(clean.war - quote.war >= 0 && clean.war - quote.war <= 0.10,
  `One 250-char quote: WAR ${clean.war} -> ${quote.war} (drop <= 0.10)`);
assert(quote.raw_war >= 0.5 && quote.classification !== 'bot',
  `250-char quote with raw_war ${quote.raw_war} >= 0.5 is not a bot (${quote.classification})`);
assert(quote.paste.weightedChars === 75, `250 chars at 0.3x = 75 weighted, got ${quote.paste.weightedChars}`);

const three = bio.scoreWAR(withPastes(humanSession(), [40, 40, 40]), strongHumanProfile());
assert(three.flags.includes('high_paste_volume'), `Three pastes set high_paste_volume: ${three.flags}`);
assert(!three.flags.includes('paste_heavy') && !three.flags.includes('paste_flood'),
  'No paste_heavy / paste_flood flags any more');
assert(near(three.war, clean.war, 0.02), `Three small pastes: WAR ${three.war} within 0.02 of ${clean.war} (flag, not penalty)`);
assert(three.paste.count === 3 && three.paste.chars === 120 && three.paste.weightedChars === 12,
  `Three 40-char pastes reported as ${JSON.stringify(three.paste)}`);
const two = bio.scoreWAR(withPastes(humanSession(), [40, 40]), strongHumanProfile());
assert(!two.flags.includes('high_paste_volume'), 'Two pastes do not set high_paste_volume');

const para = bio.scoreWAR(withPastes(humanSession(), [445]), strongHumanProfile());
assert(para.paste.weightedChars === 445, `A 445-char paragraph counts at full weight (${para.paste.weightedChars})`);
assert(clean.war - para.war <= 0.10 && para.classification !== 'bot',
  `445-char paragraph: WAR ${clean.war} -> ${para.war}, still "${para.classification}"`);
assert(para.components.purity < url.components.purity, 'The paragraph shows up in the purity component more than the URL');

// The classic (weaker) human fixture: a paragraph can cost at most the purity weight
const weakPara = bio.scoreWAR(withPastes(humanSession(), [445]), humanProfile());
assert(hResult.war - weakPara.war > 0 && hResult.war - weakPara.war <= 0.10,
  `Weak human + paragraph: WAR ${hResult.war} -> ${weakPara.war} (visible, bounded by the 0.05 purity weight)`);

// Legacy capture that only has totals (no per-event lengths): the total is
// weighted as one paste and the declared count is honoured.
const legacy = humanSession();
legacy.pasteLengths = undefined;
legacy.alienChars = 45; legacy.pastedChars = 45; legacy.pasteCount = 1;
const legacyResult = bio.scoreWAR(legacy, strongHumanProfile());
assert(legacyResult.paste.count === 1 && legacyResult.paste.weightedChars === 4.5,
  `Legacy totals-only session weighted as one paste: ${JSON.stringify(legacyResult.paste)}`);
const legacyMany = humanSession();
legacyMany.pasteLengths = undefined;
legacyMany.alienChars = 120; legacyMany.pastedChars = 120; legacyMany.pasteCount = 3;
assert(bio.scoreWAR(legacyMany, strongHumanProfile()).flags.includes('high_paste_volume'),
  'Legacy pasteCount >= 3 still sets high_paste_volume');

assert(sameJson(WAR.weightedPaste([10, 49, 50, 300, 301]), { count: 5, chars: 710, weightedChars: 411.9 }),
  'weightedPaste(): 10,49 at 0.1x; 50,300 at 0.3x; 301 at 1.0x = 411.9');
assert(WAR.weightedPaste([]).count === 0 && WAR.weightedPaste(null).weightedChars === 0 &&
  WAR.weightedPaste([NaN, -5, 0]).count === 0, 'weightedPaste() ignores empty, NaN and non-positive lengths');
assert(bio.handlePaste(bio.createSession(), 0) === undefined, 'handlePaste() ignores empty pastes without throwing');
const sess = bio.createSession();
bio.handlePaste(sess, 30); bio.handlePaste(sess, 400);
assert(sameJson(sess.pasteLengths, [30, 400]) && sess.pasteCount === 2 && sess.pastedChars === 430 && sess.alienChars === 430,
  'handlePaste() records lengths per event and keeps the old totals');

// --- TIME CAP ---
console.log('\n=== Time confidence cap (step table) ===');

const capped0 = bio.applyTimeCap({ ...clean }, Date.now());
assert(capped0.timeCap === 0.35 && capped0.war === Math.min(clean.war, 0.35),
  `Day 0: cap 0.35, WAR ${clean.war} -> ${capped0.war}`);
assert(capped0.raw_war === clean.raw_war, `raw_war is never capped (${capped0.raw_war})`);
assert(capped0.tier === WAR.tierFor(capped0.war), 'Tier follows the capped WAR');
const capped10 = bio.applyTimeCap({ ...clean }, Date.now() - 10 * DAY);
assert(capped10.timeCap === 0.65 && capped10.war === Math.min(clean.war, 0.65),
  `Day 10: cap 0.65, WAR -> ${capped10.war}`);
const capped400 = bio.applyTimeCap({ ...clean }, Date.now() - 400 * DAY);
assert(capped400.timeCap === 1.0 && capped400.war === clean.war, `Day 400: cap 1.0, WAR stays ${capped400.war}`);
const table = [[0, 0.35], [0.99, 0.35], [1, 0.50], [6.99, 0.50], [7, 0.65], [29.9, 0.65],
  [30, 0.80], [89.9, 0.80], [90, 0.92], [179.9, 0.92], [180, 1.0], [400, 1.0]];
assert(table.every(([d, cap]) => WAR.timeCapFor(d) === cap),
  'timeCapFor(): <1d 0.35, 1-7 0.50, 7-30 0.65, 30-90 0.80, 90-180 0.92, 180+ 1.00');
assert([null, undefined, NaN, 'garbage', 0, -1, Date.now() + 5 * DAY]
  .every(v => bio.applyTimeCap({ ...clean }, v).timeCap === 0.35),
  'Missing, NaN, junk or future firstSeen all count as day 0 without throwing');

// Penalties survive the cap: the cap can lower a score but never lift penalties off it
const penalized = bio.scoreWAR(humanSession(), sophisticatedBotProfile());
assert(penalized.war < penalized.raw_war, `Penalized WAR=${penalized.war} should be below raw_war=${penalized.raw_war}`);
const oldAccount = bio.applyTimeCap({ ...penalized }, Date.now() - 400 * DAY);
assert(oldAccount.war <= penalized.war, `Capped WAR=${oldAccount.war} (old account) should not exceed penalized WAR=${penalized.war}`);
const newAccount = bio.applyTimeCap({ ...penalized }, null);
assert(newAccount.war <= Math.min(penalized.war, 0.35), `Capped WAR=${newAccount.war} (day 0) should be <= min(penalized, 0.35)`);
const cappedHuman = bio.applyTimeCap({ ...hResult }, null);
assert(cappedHuman.war === Math.min(hResult.war, 0.35), `Day-0 cap should apply to a clean human: ${cappedHuman.war}`);

// --- K-S ---
console.log('\n=== K-S statistic: two-sided D ===');

// Hand-computed reference (Python math.erf) for this sample against its own
// log-normal fit: mu = 4.17967, sigma = 1.39342 (population).
//   D+ = max((j+1)/n - F) = 0.35920,  D- = max(F - j/n) = 0.51995
//   two-sided D = 0.520; the old one-sided |F - (j+1)/n| formula gave 0.420.
const ksSample = [1, 100, 101, 102, 103, 104, 105, 106, 107, 108];
const D = WAR.ksStatistic(ksSample);
assert(near(D, 0.520, 0.002), `Two-sided K-S D=${D} matches the hand-computed 0.520`);
const logs = ksSample.map(Math.log).sort((a, b) => a - b);
const mu = WAR.mean(logs), sigma = WAR.std(logs);
let oneSided = 0;
logs.forEach((x, j) => {
  oneSided = Math.max(oneSided, Math.abs((j + 1) / logs.length - WAR.normalCDF((x - mu) / sigma)));
});
assert(near(oneSided, 0.420, 0.002) && D > oneSided,
  `The old one-sided formula (${oneSided.toFixed(3)}) under-reported D (${D})`);
assert(WAR.ksStatistic([100, 200, 300]) === 0.5, 'K-S with fewer than 10 values is neutral (0.5)');
assert(WAR.ksStatistic(Array(20).fill(180)) === 1.0, 'K-S of identical values is 1.0');
assert(near(WAR.ksStatistic(ksSample.concat([NaN, -3, 0])), D, 1e-9), 'K-S ignores NaN and non-positive values');
assert(bio.ksStatistic === WAR.ksStatistic && bio.pearsonR === WAR.pearsonR, 'bio.ksStatistic / pearsonR are the engine helpers');
assert(near(WAR.pearsonR([1, 2, 3, 4], [2, 4, 6, 8]), 1, 1e-12) && WAR.pearsonR([1, 1, 1], [1, 2, 3]) === 0,
  'pearsonR: perfect correlation 1, zero variance 0');

// --- GUARDS ---
console.log('\n=== Guards: never NaN, never fail-open ===');

const nanProfile = humanProfile();
nanProfile.std_dwell = NaN; nanProfile.mean_inter_key = undefined; nanProfile.edit_ratio = 'x';
const nanResult = bio.scoreWAR(humanSession(), nanProfile);
assert(Number.isFinite(nanResult.war) && Number.isFinite(nanResult.raw_war), `NaN/undefined profile fields still give a finite WAR (${nanResult.war})`);
// std_dwell NaN -> dwell_std neutral; edit_ratio 'x' -> edit sub-score neutral,
// pause sub-score still ramps 1.2 -> 0.727, so editing = (0.5 + 0.727) / 2.
assert(nanResult.components.dwell_std === 0.5 && near(nanResult.components.editing, 0.6136, 0.001),
  'Unusable profile fields score neutral (0.5) without poisoning the rest');
const dirty = humanSession();
dirty.flightTimes[3] = NaN; dirty.dwellTimes[0] = Infinity; dirty.flightTimes[7] = 'oops';
assert(Number.isFinite(bio.scoreWAR(dirty, humanProfile()).war), 'NaN / Infinity / strings inside the timing arrays are ignored');
const short = bio.createSession();
short.flightTimes = [100, 200, 300];
const shortResult = bio.scoreWAR(short, humanProfile());
assert(shortResult.war === null && shortResult.raw_war === null && shortResult.classification === 'insufficient_data' &&
  shortResult.flags.includes('too_short') && sameJson(shortResult.components, {}),
  'Fewer than 10 flights: war null, insufficient_data, empty components');
assert(bio.applyTimeCap(shortResult, NaN).war === null, 'applyTimeCap() leaves a null WAR null');
assert(bio.applyTimeCap(null, null).timeCap === 0.35, 'applyTimeCap(null) does not throw');
assert(bio.scoreWAR(humanSession(), null).classification === 'insufficient_data', 'A missing profile does not fail open');
assert(WAR.scoreProfile(humanProfile(), null).classification === 'insufficient_data', 'A missing session does not fail open');
const empty = bio.scoreWAR(bio.createSession(), {});
assert(empty.war === null && empty.paste.count === 0 && empty.paste.weightedChars === 0, 'Empty session scores insufficient_data with zero paste');
const noCounts = humanSession();
noCounts.humanChars = 0; noCounts.alienChars = 0;
assert(bio.scoreWAR(noCounts, humanProfile()).components.purity === 0.5, 'Under 20 characters the purity signal is neutral');

console.log(`\n${passed} passed, ${failed} failed`);
console.log('Done.');
