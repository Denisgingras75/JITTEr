// Backend tests: the real attest and verify functions, run against a PGlite
// database with the repo migrations applied. Run with `npm run test:backend`.
// deno-lint-ignore-file no-explicit-any
import { makeDb } from './db.mjs';
import { canonicalJson, deviceIdFor, signEcdsa, verifyEcdsa, sha256Hex, timeCapForAge, classify } from '../functions/_shared/trust.ts';

const g = globalThis as any;
let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) { failed++; console.error('FAIL:', msg); return; }
  console.log('PASS:', msg);
}

// ── environment the functions expect ────────────────────────────────────
const serverPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const serverPriv = await crypto.subtle.exportKey('jwk', serverPair.privateKey);
const serverPub = { kty: 'EC', crv: 'P-256', x: serverPriv.x!, y: serverPriv.y! };
g.__SERVICE_KEY = 'service-role-key-for-tests';
Deno.env.set('SUPABASE_URL', 'http://tests.local');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', g.__SERVICE_KEY);
Deno.env.set('SUPABASE_ANON_KEY', 'anon-key-for-tests');
Deno.env.set('JITTER_SERVER_KEY_JWK', JSON.stringify({ kty: 'EC', crv: 'P-256', x: serverPriv.x, y: serverPriv.y, d: serverPriv.d }));
g.__pg = await makeDb();

await import('../functions/attest/index.ts');
await import('../functions/verify/index.ts');
const [attestH, verifyH] = g.__handlers;

const ATTEST = 'http://tests.local/functions/v1/attest';
const VERIFY = 'http://tests.local/functions/v1/verify';
async function attest(body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) {
  const res = await attestH(new Request(ATTEST, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }));
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}
async function verify(query: string) {
  const res = await verifyH(new Request(`${VERIFY}?${query}`, { method: 'GET' }));
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, ctype: res.headers.get('content-type'), json, text };
}

// A client device, as the extension or SDK would create it.
async function makeDevice() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const pub = { kty: 'EC', crv: 'P-256', x: jwk.x!, y: jwk.y! };
  const priv = { ...pub, d: jwk.d! };
  return { pub, priv, id: await deviceIdFor(pub) };
}
async function signedBadge(dev: any, overrides: Record<string, unknown> = {}) {
  const badge = {
    version: '3.0', type: 'content', war: 0.72, raw_war: 0.75, war_tier: 'All-Star', war_flags: ['no_editing_behavior'],
    keys: 150, pastes: 0, pastedChars: 0, integrity: 100,
    text_hash: await sha256Hex('the text that was typed'), url: 'https://example.com/posts/1',
    minted_at: new Date().toISOString() + Math.random(), // unique per badge
    publicKeyJwk: dev.pub, ...overrides,
  };
  const signature = await signEcdsa(dev.priv, canonicalJson(badge));
  return { badge, signature };
}

// ── T0 canonicalJson matches the extension's implementation ─────────────
{
  const src = await Deno.readTextFile(new URL('../../extension/src/crypto-utils.js', import.meta.url));
  const fn = new Function('chrome', 'window', src + '\nreturn CryptoUtils;');
  const CryptoUtils = fn({ storage: { local: { get: () => Promise.resolve({}), set: () => Promise.resolve() } } }, {});
  const fixtures = [
    { b: 1, a: { d: [3, { z: 1, y: 2 }], c: 'x' }, u: undefined, n: null, s: 'é ✓ "q" \\', f: 1.5e-7, big: 1e21 },
    [1, 'two', { k: [null, undefined] }], 'plain', 0, false,
  ];
  assert(fixtures.every(f => CryptoUtils.canonicalJson(f) === canonicalJson(f)), 'T0 canonicalJson: server and extension agree on every fixture');
}

// ── T1 a signed badge from a new device ─────────────────────────────────
const dev = await makeDevice();
const first = await signedBadge(dev);
const r1 = await attest({ site_key: 'wgh', ...first });
assert(r1.status === 200, `T1 attest accepts a signed badge (got ${r1.status} ${r1.text.slice(0, 120)})`);
assert(r1.json?.attestation?.device_id === dev.id, 'T1 device id is the hash of the public key');
assert(r1.json?.attestation?.age_days === 0 && r1.json?.attestation?.time_cap === 0.35, 'T1 new device: age 0, cap 0.35');
assert(r1.json?.attestation?.war === 0.35 && r1.json?.attestation?.war_client === 0.72, 'T1 server caps the client score (0.72 -> 0.35)');
assert(r1.json?.attestation?.classification === 'building', `T1 new device with a good score is "building" (got ${r1.json?.attestation?.classification})`);
assert(r1.json?.attestation?.flags?.includes('new_device'), 'T1 new_device flag set');
assert(r1.json?.attestation?.text_hash === first.badge.text_hash && r1.json?.attestation?.url === first.badge.url, 'T1 text hash and url recorded');
assert(typeof r1.json?.server_signature === 'string' && await verifyEcdsa(serverPub, canonicalJson(r1.json.attestation), r1.json.server_signature),
  'T1 server countersignature verifies against the server public key');
assert(r1.json?.profile?.badges === 1 && r1.json?.profile?.level === 'Novice', 'T1 profile created');
const badgeHash = r1.json?.badge_hash;

// ── T1b the client's own cap doesn't hide the typing score ──────────────
{
  const dev2 = await makeDevice();
  const r = await attest({ site_key: 'extension', ...(await signedBadge(dev2, { war: 0.35, war_uncapped: 0.72 })) });
  assert(r.status === 200 && r.json?.attestation?.war_client === 0.72 && r.json?.attestation?.classification === 'building',
    `T1b client-capped badge with war_uncapped 0.72 is "building" (got ${JSON.stringify(r.json?.attestation)})`);
}

// ── T2 tampering / forgery ──────────────────────────────────────────────
{
  const t = await attest({ site_key: 'wgh', badge: { ...first.badge, war: 0.99 }, signature: first.signature });
  assert(t.status === 401 && t.json?.error === 'bad_signature', 'T2 edited badge is rejected (bad_signature)');
  const other = await makeDevice();
  const forged = await attest({ site_key: 'wgh', badge: first.badge, signature: (await signedBadge(other, { minted_at: first.badge.minted_at })).signature });
  assert(forged.status === 401, 'T2 badge signed by a different key than the one it carries is rejected');
  const unsigned = await attest({ user_id: 'someone', site_key: 'wgh', war_score: 1, classification: 'verified' });
  assert(unsigned.status === 400, 'T2 old unsigned contract is rejected');
}

// ── T3 replay ───────────────────────────────────────────────────────────
{
  const again = await attest({ site_key: 'wgh', ...first });
  assert(again.status === 200 && again.json?.duplicate === true && again.json?.badge_hash === badgeHash, 'T3 replaying the same signed badge returns the same attestation');
  const count = (await g.__pg.query(`select count(*)::int as n from attestations where device_id = $1`, [dev.id])).rows[0].n;
  assert(count === 1, 'T3 no second row was written');
}

// ── T4 verify ───────────────────────────────────────────────────────────
{
  const html = await verify(`hash=${badgeHash}`);
  assert(html.status === 200 && /text\/html/.test(html.ctype || '') && html.text.includes('Building Trust') && html.text.includes('Device age'), 'T4 verify page renders the attestation');
  const j = await verify(`hash=${badgeHash}&format=json`);
  assert(j.status === 200 && j.json?.attestation?.war === 0.35 && j.json?.attestation?.age_days === 0 && j.json?.attestation?.device_id === dev.id, 'T4 verify?format=json returns the record');
  assert(j.json?.server_signature === r1.json.server_signature, 'T4 JSON carries the server signature');
  const missing = await verify(`hash=${'0'.repeat(64)}&format=json`);
  assert(missing.status === 404, 'T4 unknown hash -> 404 JSON');
  const bad = await verify(`hash=<script>`);
  assert(bad.status === 200 && bad.text.includes('Badge not found') && !bad.text.includes('<script>'), 'T4 malformed hash is refused and escaped');
}

// ── T5 the time cap follows the server's record of device age ───────────
{
  await g.__pg.exec(`update devices set first_seen = now() - interval '40 days' where device_id = '${dev.id}'`);
  const r = await attest({ site_key: 'wgh', ...(await signedBadge(dev)) });
  assert(r.json?.attestation?.age_days === 40 && r.json?.attestation?.time_cap === 0.8 && r.json?.attestation?.war === 0.72, `T5 40-day device: cap 0.80, war 0.72 (got ${JSON.stringify(r.json?.attestation)})`);
  await g.__pg.exec(`update devices set first_seen = now() - interval '400 days' where device_id = '${dev.id}'`);
  const r2 = await attest({ site_key: 'wgh', ...(await signedBadge(dev, { war: 0.85 })) });
  assert(r2.json?.attestation?.time_cap === 1 && r2.json?.attestation?.war === 0.85 && r2.json?.attestation?.classification === 'verified', 'T5 400-day device with 0.85 is verified');
  assert(r2.json?.profile?.badges === 3 && r2.json?.profile?.best_war === 0.85, 'T5 profile aggregates (3 badges, best 0.85)');
  const bot = await attest({ site_key: 'wgh', ...(await signedBadge(dev, { war: 0.05, war_flags: ['dwell_floor'] })) });
  assert(bot.json?.attestation?.classification === 'bot', 'T5 a floored score is "bot" whatever the device age');
}

// ── T6 input validation ─────────────────────────────────────────────────
{
  const few = await attest({ site_key: 'wgh', ...(await signedBadge(dev, { keys: 5 })) });
  assert(few.status === 400 && few.json?.error === 'insufficient_data', 'T6 fewer than 20 keystrokes is refused');
  const big = await attest('{"site_key":"wgh","badge":{"x":"' + 'a'.repeat(40000) + '"}}');
  assert(big.status === 413, 'T6 oversized body is refused');
  const site = await attest({ site_key: 'bad site!', ...(await signedBadge(dev)) });
  assert(site.status === 400 && site.json?.error === 'bad_site_key', 'T6 bad site_key is refused');
  const nowar = await attest({ site_key: 'wgh', ...(await signedBadge(dev, { war: null })) });
  assert(nowar.status === 400 && nowar.json?.error === 'bad_war', 'T6 badge without a score is refused');
  const opts = await attestH(new Request(ATTEST, { method: 'OPTIONS' }));
  assert(opts.status === 200 && opts.headers.get('access-control-allow-origin') === '*', 'T6 CORS preflight');
}

// ── T7 per-device rate limit ────────────────────────────────────────────
{
  const busy = await makeDevice();
  await attest({ site_key: 'wgh', ...(await signedBadge(busy)) });
  await g.__pg.exec(`insert into attestations (user_id, site_key, war_score, classification, badge_hash, device_id, created_at)
    select '${busy.id}', 'wgh', 0.5, 'suspicious', md5(random()::text) || md5(random()::text), '${busy.id}', now() from generate_series(1, 60)`);
  const r = await attest({ site_key: 'wgh', ...(await signedBadge(busy)) });
  assert(r.status === 429 && r.json?.error === 'rate_limited', 'T7 61st attestation in an hour is rate-limited');
}

// ── T8 the anon role can't reach any of it directly ─────────────────────
{
  const asAnon = async (sql: string) => {
    try { await g.__pg.transaction(async (tx: any) => { await tx.exec('SET LOCAL ROLE anon'); await tx.query(sql); }); return 'ALLOWED'; }
    catch (e: any) { return /permission denied/.test(e.message) ? 'DENIED' : 'ERROR ' + e.message; }
  };
  assert(await asAnon('select * from devices') === 'DENIED', 'T8 anon cannot read devices');
  assert(await asAnon('select * from attestations') === 'DENIED', 'T8 anon cannot read attestations');
  assert(await asAnon(`select * from touch_device('x', '{}'::jsonb, 'wgh')`) === 'DENIED', 'T8 anon cannot call touch_device');
  assert(await asAnon(`select * from record_attestation_stats('x', 'wgh', 0.5, 1, 0, 0)`) === 'DENIED', 'T8 anon cannot call record_attestation_stats');
}

// ── T9 trust rules ──────────────────────────────────────────────────────
{
  assert([0, 1, 7, 30, 90, 180].map(timeCapForAge).join(',') === '0.35,0.5,0.65,0.8,0.92,1', 'T9 time cap step table');
  assert(classify(0.35, 0.72, 0.35, []) === 'building' && classify(0.85, 0.85, 1, []) === 'verified' && classify(0.1, 0.1, 1, []) === 'bot', 'T9 classify');
}

console.log(failed ? `\n${failed} FAILED` : '\nAll backend tests passed.');
Deno.exit(failed ? 1 : 0);
