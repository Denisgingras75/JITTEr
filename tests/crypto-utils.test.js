/**
 * Badge signing: the signature must cover every field, nested ones included.
 *
 * crypto-utils.js is a browser script that talks to chrome.storage, so it is
 * loaded here with a small in-memory stub of that API.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const store = {};
global.chrome = {
  storage: {
    local: {
      get: (keys) => {
        const out = {};
        (Array.isArray(keys) ? keys : [keys]).forEach(k => { if (k in store) out[k] = store[k]; });
        return Promise.resolve(out);
      },
      set: (obj) => { Object.assign(store, obj); return Promise.resolve(); },
    },
  },
};
global.window = global;

const src = fs.readFileSync(path.join(__dirname, '..', 'extension', 'src', 'crypto-utils.js'), 'utf8');
vm.runInThisContext(src + '\n;globalThis.CryptoUtils = CryptoUtils;');
const CryptoUtils = globalThis.CryptoUtils;

function assert(condition, msg) {
  if (!condition) { console.error('FAIL:', msg); process.exitCode = 1; return; }
  console.log('PASS:', msg);
}

(async () => {
  // --- canonicalJson ---
  const a = { b: 1, a: { d: [3, { z: 1, y: 2 }], c: 'x' }, u: undefined };
  const b = { a: { c: 'x', d: [3, { y: 2, z: 1 }] }, b: 1 };
  assert(CryptoUtils.canonicalJson(a) === CryptoUtils.canonicalJson(b),
    'canonicalJson: key order is irrelevant at every depth, undefined dropped');
  assert(CryptoUtils.canonicalJson([1, 2]) !== CryptoUtils.canonicalJson([2, 1]),
    'canonicalJson: array order is preserved');
  assert(CryptoUtils.canonicalJson(a) === '{"a":{"c":"x","d":[3,{"y":2,"z":1}]},"b":1}',
    'canonicalJson: compact, sorted output');

  // --- sign / verify ---
  const badge = {
    version: '3.0', type: 'project', war: 0.62, purity: 97, keys: 812,
    war_components: { bigram_rhythm: 0.9, per_key: 0.4, purity: 1.0 },
    war_flags: ['no_editing_behavior'],
    date: '2026-09-24',
  };
  const signature = await CryptoUtils.signBadge(badge);
  const jwk = await CryptoUtils.getPublicKeyJwk();
  assert(typeof signature === 'string' && signature.length > 40, 'signBadge returns a signature');
  assert(jwk && jwk.kty === 'EC', 'a P-256 public key is stored');

  const verify = (mutate) => { const copy = JSON.parse(JSON.stringify(badge)); mutate(copy); return CryptoUtils.verifyBadge(copy, signature, jwk); };
  assert(await verify(() => {}) === true, 'untouched badge verifies');
  assert(await verify(b => { b.war = 0.99; }) === false, 'top-level tamper is detected');
  assert(await verify(b => { b.war_components.bigram_rhythm = 0.1; }) === false,
    'nested tamper (war_components.bigram_rhythm) is detected');
  assert(await verify(b => { b.war_components.per_key = 1.0; }) === false,
    'nested tamper (war_components.per_key) is detected');
  assert(await verify(b => { b.war_flags = []; }) === false, 'tampering with an array is detected');
  assert(await verify(b => { b.extra = 1; }) === false, 'adding a field is detected');

  // A reordered copy of the same badge still verifies (the wire format is
  // plain JSON, so key order can change in transit).
  const reordered = { date: badge.date, war_flags: badge.war_flags, war_components: { purity: 1.0, per_key: 0.4, bigram_rhythm: 0.9 }, keys: 812, purity: 97, war: 0.62, type: 'project', version: '3.0' };
  assert(await CryptoUtils.verifyBadge(reordered, signature, jwk) === true, 'key order does not affect verification');

  console.log('\nDone.');
})().catch(e => { console.error('FAIL:', e); process.exitCode = 1; });
