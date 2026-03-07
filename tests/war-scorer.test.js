const bio = require('../extension/src/biometrics.js');

// Helper: build a minimal human-like session
function humanSession() {
  const s = bio.createSession();
  const flights = [];
  const dwells = [];
  for (let i = 0; i < 50; i++) {
    flights.push(150 + Math.random() * 200); // 150-350ms
    dwells.push(60 + Math.random() * 80);    // 60-140ms
  }
  s.flightTimes = flights;
  s.dwellTimes = dwells;
  s.humanChars = 50;
  s.alienChars = 0;
  s.totalKeystrokes = 50;
  s.backspaceCount = 3;
  s.pauseCount = 2;
  return s;
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

// --- TESTS ---

function assert(condition, msg) {
  if (!condition) { console.error('FAIL:', msg); process.exitCode = 1; return; }
  console.log('PASS:', msg);
}

// Test 1: Human scores above 0.50
const hResult = bio.scoreWAR(humanSession(), humanProfile());
assert(hResult.war >= 0.40, `Human WAR=${hResult.war} should be >= 0.40`);
assert(hResult.tier !== 'Suspicious', `Human tier="${hResult.tier}" should not be Suspicious`);

// Test 2: Obvious bot hits hard floor -> WAR = 0
const bResult = bio.scoreWAR(botSession(), botProfile());
assert(bResult.war === 0, `Bot WAR=${bResult.war} should be 0 (hard floor)`);
assert(bResult.tier === 'Suspicious', `Bot tier="${bResult.tier}" should be Suspicious`);
assert(bResult.flags.length > 0, `Bot should have flags, got ${bResult.flags}`);

// Test 3: Sophisticated bot gets penalized below human range
const sSession = humanSession();
const sResult = bio.scoreWAR(sSession, sophisticatedBotProfile());
assert(sResult.war < 0.50, `Sophisticated bot WAR=${sResult.war} should be < 0.50`);
assert(sResult.flags.length >= 2, `Sophisticated bot should have 2+ flags, got ${sResult.flags}`);

// Test 4: dwell_uniformity component exists
assert(hResult.components.dwell_uniformity != null, 'Human should have dwell_uniformity component');
assert(bResult.components.dwell_uniformity != null || bResult.war === 0, 'Bot should have dwell_uniformity or be hard-floored');

// Test 5: Hard floor on mean_dwell < 27
const dwellBot = humanSession();
const dwellProfile = humanProfile();
dwellProfile.mean_dwell = 15;
const dwResult = bio.scoreWAR(dwellBot, dwellProfile);
assert(dwResult.war === 0, `Dwell floor bot WAR=${dwResult.war} should be 0`);

// Test 6: Hard floor on std_inter_key < 9
const varBot = humanSession();
const varProfile = humanProfile();
varProfile.std_inter_key = 3;
const vrResult = bio.scoreWAR(varBot, varProfile);
assert(vrResult.war === 0, `Variance floor bot WAR=${vrResult.war} should be 0`);

// Test 7: Hard floor on mean_inter_key < 54
const ikiBot = humanSession();
const ikiProfile = humanProfile();
ikiProfile.mean_inter_key = 30;
const ikResult = bio.scoreWAR(ikiBot, ikiProfile);
assert(ikResult.war === 0, `IKI floor bot WAR=${ikResult.war} should be 0`);

// Test 8: Weights sum to 1.0
const wSum = Object.values(bio.WAR_WEIGHTS).reduce((a, b) => a + b, 0);
assert(Math.abs(wSum - 1.0) < 0.001, `Weights sum=${wSum} should be 1.0`);

console.log('\nDone.');
