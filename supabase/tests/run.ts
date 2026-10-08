// Backend tests: the real attest, verify and erase functions, run against a
// PGlite database with the repo migrations applied. Run with `npm run test:backend`.
// deno-lint-ignore-file no-explicit-any
import { makeDb } from './db.mjs';
import {
  b64ToBytes, bytesToB64, canonicalJson, classify, clientAddress, deviceIdFor, hex, isFreshTimestamp, keyIdFromDeviceId, rpcScalar,
  sha256Hex, signEcdsa, timeCapForAge, verifyEcdsa,
} from '../functions/_shared/trust.ts';
import { JitterWAR } from '../functions/_shared/engine.gen.mjs';

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
await import('../functions/erase/index.ts');
const [attestH, verifyH, eraseH] = g.__handlers;

const ATTEST = 'http://tests.local/functions/v1/attest';
const VERIFY = 'http://tests.local/functions/v1/verify';
const ERASE = 'http://tests.local/functions/v1/erase';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
async function post(handler: (req: Request) => Promise<Response>, url: string, body: unknown, headers: Record<string, string>) {
  const res = await handler(new Request(url, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }));
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}
const attest = (body: unknown, headers: Record<string, string> = JSON_HEADERS) => post(attestH, ATTEST, body, headers);
const erase = (body: unknown, headers: Record<string, string> = JSON_HEADERS) => post(eraseH, ERASE, body, headers);
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
// ── timing payloads the server scores ───────────────────────────────────
// Deterministic (seeded), so expected scores are reproducible.
function lcg(seed: number) { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }
function gauss(rnd: () => number) { const u = Math.max(1e-9, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const r2 = (x: number) => Math.round(x * 100) / 100;
// A strong human session: log-normal flights that slow over the session, two
// thinking pauses followed by slower keys, dwells that drift with the flights
// (flow coupling), distinct per-key dwells and bigram timings, edits and pauses.
function humanTiming(seed = 1) {
  const rnd = lcg(seed);
  const flightTimes: number[] = [], dwellTimes: number[] = [];
  for (let i = 0; i < 100; i++) {
    const drift = i / 100 * 0.25;
    let f = Math.exp(Math.log(170) + drift + 0.3 * gauss(rnd));
    if (i === 30 || i === 60) f = 1500;
    else if ((i > 30 && i <= 33) || (i > 60 && i <= 63)) f *= 1.6;
    flightTimes.push(r2(Math.min(2000, Math.max(20, f))));
    dwellTimes.push(r2(Math.min(500, Math.max(10, 85 + drift * 60 + 22 * gauss(rnd)))));
  }
  const perKeyDwells: Record<string, number[]> = {};
  ['e', 't', 'a', 'o', 'i', 'n', 's', 'r', 'h', 'l'].forEach((k, i) => { perKeyDwells[k] = Array.from({ length: 8 }, () => r2(Math.max(10, 60 + i * 10 + 6 * gauss(rnd)))); });
  const bigramTimings: Record<string, number[]> = {};
  ['th', 'he', 'in', 'er', 'an', 're', 'on', 'at'].forEach((b, i) => { bigramTimings[b] = Array.from({ length: 6 }, () => r2(Math.max(20, 120 + i * 20 + 10 * gauss(rnd)))); });
  return { v: 1, flightTimes, dwellTimes, fatigueWindows: [165, 175, 190, 205],
    humanChars: 150, alienChars: 0, totalKeystrokes: 150, backspaceCount: 14, pauseCount: 3, pasteCount: 0,
    pasteLengths: [] as number[], perKeyDwells, bigramTimings };
}
// A script's session: a constant 100 ms between keys, 12 ms holds, no edits.
function botTiming() {
  return { v: 1, flightTimes: Array(100).fill(100), dwellTimes: Array(100).fill(12), fatigueWindows: [] as number[],
    humanChars: 150, alienChars: 0, totalKeystrokes: 150, backspaceCount: 0, pauseCount: 0, pasteCount: 0,
    pasteLengths: [] as number[], perKeyDwells: {}, bigramTimings: {} };
}
const HUMAN_WAR: number = JitterWAR.scoreSession(humanTiming()).war;

// A badge as the extension or SDK signs it: the client's score is computed on
// the very timing payload that goes to the server, whose hash is signed.
async function signedBadge(dev: any, overrides: Record<string, unknown> = {}, timing: any = humanTiming()) {
  const scored = JitterWAR.scoreSession(timing);
  const badge = {
    version: '3.1', type: 'content', site_key: 'wgh',
    war: scored.war, war_uncapped: scored.war, raw_war: scored.raw_war, war_tier: scored.tier, war_flags: scored.flags,
    keys: 150, pastes: 0, pastedChars: 0, integrity: 100,
    text_hash: await sha256Hex('the text that was typed'), url: 'https://example.com/posts/1',
    minted_at: new Date().toISOString() + Math.random(), // unique per badge
    publicKeyJwk: dev.pub,
    timing_hash: await sha256Hex(canonicalJson(timing)),
    ...overrides,
  };
  const signature = await signEcdsa(dev.priv, canonicalJson(badge));
  return { badge, signature, timing };
}
// An erase request, signed the way the popup signs it: over { action, publicKeyJwk, requested_at }.
async function signedErase(dev: any, opts: { requested_at?: string; signer?: any; action?: string } = {}) {
  const requested_at = opts.requested_at ?? new Date().toISOString();
  const signature = await signEcdsa((opts.signer ?? dev).priv, canonicalJson({ action: opts.action ?? 'erase', publicKeyJwk: dev.pub, requested_at }));
  return { publicKeyJwk: dev.pub, requested_at, signature };
}
// Runs a statement as the anon role (what the public anon key can do).
async function asAnon(sql: string) {
  try { await g.__pg.transaction(async (tx: any) => { await tx.exec('SET LOCAL ROLE anon'); await tx.query(sql); }); return 'ALLOWED'; }
  catch (e: any) { return /permission denied/.test(e.message) ? 'DENIED' : 'ERROR ' + e.message; }
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

// ── T0b the fixtures: the engine itself scores them as intended ──────────
assert(HUMAN_WAR >= 0.80, `T0b the human fixture scores at least 0.80 on the engine (got ${HUMAN_WAR}); the tests below rely on it`);
assert(JitterWAR.scoreSession(botTiming()).war === 0, 'T0b the script fixture hits a hard floor (war 0)');
assert(JitterWAR.sanitizeTiming(humanTiming()).ok && JitterWAR.sanitizeTiming(botTiming()).ok, 'T0b both fixtures pass the server\'s timing validation');

// ── T1 a signed badge from a new device ─────────────────────────────────
const dev = await makeDevice();
const first = await signedBadge(dev);
const r1 = await attest({ site_key: 'wgh', ...first });
assert(r1.status === 200, `T1 attest accepts a signed badge (got ${r1.status} ${r1.text.slice(0, 120)})`);
assert(r1.json?.attestation?.device_id === dev.id, 'T1 device id is the hash of the public key');
assert(r1.json?.attestation?.age_days === 0 && r1.json?.attestation?.time_cap === 0.35, 'T1 new device: age 0, cap 0.35');
assert(r1.json?.attestation?.war === 0.35 && r1.json?.attestation?.war_server === HUMAN_WAR && r1.json?.attestation?.war_client === HUMAN_WAR,
  `T1 the server scores the timing itself (${HUMAN_WAR}) and caps it (-> 0.35); the client's claim is kept as war_client`);
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
  const r = await attest({ site_key: 'extension', ...(await signedBadge(dev2, { site_key: 'extension', war: 0.35 })) });
  assert(r.status === 200 && r.json?.attestation?.war_client === HUMAN_WAR && r.json?.attestation?.classification === 'building',
    `T1b client-capped badge (war 0.35, war_uncapped ${HUMAN_WAR}) is "building" (got ${JSON.stringify(r.json?.attestation)})`);
}

// ── T1c a jitter-capture (SDK) badge: no client cap, site's own user ref ─
{
  const dev3 = await makeDevice();
  const r = await attest({ site_key: 'wgh', ...(await signedBadge(dev3, { type: 'capture', site_user: 'wgh-user-42', meta: { pasteCount: 0 } })) });
  const row = (await g.__pg.query(`select meta from attestations where badge_hash = $1`, [r.json?.badge_hash])).rows[0];
  assert(r.status === 200 && row?.meta?.site_user === 'wgh-user-42' && r.json?.attestation?.classification === 'building',
    `T1c capture badge attested, site_user kept as an opaque reference (got ${r.status} ${JSON.stringify(row?.meta)})`);
}

// ── T2 tampering / forgery ──────────────────────────────────────────────
{
  const t = await attest({ site_key: 'wgh', badge: { ...first.badge, war: 0.99 }, signature: first.signature, timing: first.timing });
  assert(t.status === 401 && t.json?.error === 'bad_signature', 'T2 edited badge is rejected (bad_signature)');
  const other = await makeDevice();
  const forged = await attest({ site_key: 'wgh', badge: first.badge, signature: (await signedBadge(other, { minted_at: first.badge.minted_at })).signature, timing: first.timing });
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
  assert(r.json?.attestation?.age_days === 40 && r.json?.attestation?.time_cap === 0.8 && r.json?.attestation?.war === Math.min(HUMAN_WAR, 0.8), `T5 40-day device: cap 0.80, war ${Math.min(HUMAN_WAR, 0.8)} (got ${JSON.stringify(r.json?.attestation)})`);
  await g.__pg.exec(`update devices set first_seen = now() - interval '400 days' where device_id = '${dev.id}'`);
  const r2 = await attest({ site_key: 'wgh', ...(await signedBadge(dev)) });
  assert(r2.json?.attestation?.time_cap === 1 && r2.json?.attestation?.war === HUMAN_WAR && r2.json?.attestation?.classification === 'verified', `T5 400-day device with ${HUMAN_WAR} is verified`);
  assert(r2.json?.profile?.badges === 3 && r2.json?.profile?.best_war === HUMAN_WAR, `T5 profile aggregates (3 badges, best ${HUMAN_WAR})`);
  const bot = await attest({ site_key: 'wgh', ...(await signedBadge(dev, {}, botTiming())) });
  assert(bot.json?.attestation?.classification === 'bot' && bot.json?.attestation?.war === 0, 'T5 a floored session is "bot" whatever the device age');
}

// ── T6 input validation ─────────────────────────────────────────────────
{
  const few = await attest({ site_key: 'wgh', ...(await signedBadge(dev, { keys: 5 })) });
  assert(few.status === 400 && few.json?.error === 'insufficient_data', 'T6 fewer than 20 keystrokes is refused');
  const big = await attest('{"site_key":"wgh","badge":{"x":"' + 'a'.repeat(70000) + '"}}');
  assert(big.status === 413, 'T6 oversized body is refused');
  const site = await attest({ site_key: 'bad site!', ...(await signedBadge(dev)) });
  assert(site.status === 400 && site.json?.error === 'bad_site_key', 'T6 bad site_key is refused');
  const nowar = await attest({ site_key: 'wgh', ...(await signedBadge(dev, { war: null, war_uncapped: null })) });
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

// ── T10 site-key allowlist ──────────────────────────────────────────────
{
  const d = await makeDevice();
  const r = await attest({ site_key: 'nope', ...(await signedBadge(d)) });
  assert(r.status === 400 && r.json?.error === 'unknown_site_key', 'T10 a well-formed site key that is not on the list is refused (unknown_site_key)');
  Deno.env.set('JITTER_SITE_KEYS', 'wgh, demo');
  const demo = await attest({ site_key: 'demo', ...(await signedBadge(d, { site_key: 'demo' })) });
  const ext = await attest({ site_key: 'extension', ...(await signedBadge(d, { site_key: 'extension' })) });
  assert(demo.status === 200 && ext.status === 400 && ext.json?.error === 'unknown_site_key', 'T10 JITTER_SITE_KEYS replaces the default list and is read per request');
  Deno.env.delete('JITTER_SITE_KEYS');
  const writer = await attest({ site_key: 'writer', ...(await signedBadge(d, { site_key: 'writer' })) });
  const ext2 = await attest({ site_key: 'extension', ...(await signedBadge(d, { site_key: 'extension' })) });
  assert(writer.status === 200 && ext2.status === 200, 'T10 the default list is extension, writer, wgh');
}

// ── T11 per-address rate limit ──────────────────────────────────────────
{
  Deno.env.set('JITTER_MAX_ATTESTS_PER_IP_HOUR', '5');
  Deno.env.set('JITTER_IP_SALT', 'salt-for-tests');
  const from = (h: Record<string, string>) => ({ ...JSON_HEADERS, ...h });
  const a = await makeDevice();
  const rs: any[] = [];
  for (let i = 0; i < 6; i++) rs.push(await attest({ site_key: 'wgh', ...(await signedBadge(a)) }, from({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' })));
  assert(rs.slice(0, 5).every(r => r.status === 200) && rs[5].status === 429 && rs[5].json?.error === 'rate_limited_ip',
    `T11 the sixth request in an hour from one address is 429 rate_limited_ip (got ${rs.map(r => r.status).join(',')})`);
  const b = await makeDevice();
  const other = await attest({ site_key: 'wgh', ...(await signedBadge(b)) }, from({ 'x-forwarded-for': '198.51.100.7' }));
  assert(other.status === 200, 'T11 another address still passes');
  const cf = await attest({ site_key: 'wgh', ...(await signedBadge(b)) }, from({ 'cf-connecting-ip': '203.0.113.9' }));
  assert(cf.status === 429, 'T11 cf-connecting-ip is used when x-forwarded-for is absent: same address, same bucket');
  const er = await erase(await signedErase(a), from({ 'x-forwarded-for': '203.0.113.9' }));
  assert(er.status === 429 && er.json?.error === 'rate_limited_ip', 'T11 erase draws on the same address budget');
  const rows = (await g.__pg.query('select bucket, count from ip_windows')).rows;
  const expected = await sha256Hex('203.0.113.9:salt-for-tests');
  const mine = rows.find((r: any) => r.bucket === expected);
  assert(mine && mine.count === 8, `T11 the bucket is sha256(address:salt) and refused calls still count (got ${JSON.stringify(mine)})`);
  const dump = JSON.stringify(rows);
  assert(rows.length > 0 && rows.every((r: any) => /^[0-9a-f]{64}$/.test(r.bucket)) && !dump.includes('203.0.113') && !dump.includes('198.51.100') && !dump.includes('10.0.0.1'),
    'T11 ip_windows holds salted hashes and counts, never an address');
  Deno.env.delete('JITTER_MAX_ATTESTS_PER_IP_HOUR');
  Deno.env.delete('JITTER_IP_SALT');
  const relaxed = await attest({ site_key: 'wgh', ...(await signedBadge(a)) }, from({ 'x-forwarded-for': '203.0.113.9' }));
  assert(relaxed.status === 200, 'T11 default limit (600) restored; a new salt is a new bucket');
}

// ── T12 erase ───────────────────────────────────────────────────────────
{
  const d = await makeDevice();
  const minted = await attest({ site_key: 'wgh', ...(await signedBadge(d)) });
  const hash = minted.json?.badge_hash;
  const bystander = await makeDevice();
  await attest({ site_key: 'wgh', ...(await signedBadge(bystander)) });
  const rowsFor = async (id: string) => {
    const n = async (sql: string) => (await g.__pg.query(sql, [id])).rows[0].n;
    return [await n('select count(*)::int as n from attestations where device_id = $1'),
            await n('select count(*)::int as n from profiles where user_id = $1'),
            await n('select count(*)::int as n from devices where device_id = $1')].join(',');
  };
  assert(minted.status === 200 && await rowsFor(d.id) === '1,1,1', 'T12 setup: one attestation, one profile, one device row');

  const other = await makeDevice();
  const wrong = await erase(await signedErase(d, { signer: other }));
  assert(wrong.status === 401 && wrong.json?.error === 'bad_signature', 'T12 a request signed by another key is refused (bad_signature)');
  const stale = await erase(await signedErase(d, { requested_at: new Date(Date.now() - 20 * 60000).toISOString() }));
  assert(stale.status === 400 && stale.json?.error === 'stale_request', 'T12 requested_at 20 minutes old is refused (stale_request)');
  const early = await erase(await signedErase(d, { requested_at: new Date(Date.now() + 20 * 60000).toISOString() }));
  assert(early.status === 400 && early.json?.error === 'stale_request', 'T12 requested_at 20 minutes ahead is refused too');
  const otherAction = await erase(await signedErase(d, { action: 'attest' }));
  assert(otherAction.status === 401, 'T12 the signature must be over { action: "erase", publicKeyJwk, requested_at }');
  const tampered = { ...(await signedErase(d)), requested_at: new Date(Date.now() + 1000).toISOString() };
  assert((await erase(tampered)).status === 401, 'T12 changing requested_at after signing breaks the signature');
  assert(await rowsFor(d.id) === '1,1,1', 'T12 refused requests erased nothing');

  const ok = await erase(await signedErase(d));
  assert(ok.status === 200 && ok.json?.device_id === d.id && JSON.stringify(ok.json?.deleted) === JSON.stringify({ attestations: 1, profiles: 1, devices: 1 }),
    `T12 a correctly signed request erases the attestation, the profile and the device (got ${ok.status} ${ok.text.slice(0, 160)})`);
  assert(await rowsFor(d.id) === '0,0,0', 'T12 no row for the device remains');
  const gone = await verify(`hash=${hash}&format=json`);
  assert(gone.status === 404, 'T12 /verify no longer finds the badge');
  assert(await rowsFor(bystander.id) === '1,1,1', 'T12 another device\'s rows are untouched');
  const again = await erase(await signedErase(d));
  assert(again.status === 200 && JSON.stringify(again.json?.deleted) === JSON.stringify({ attestations: 0, profiles: 0, devices: 0 }), 'T12 a second erase returns zeros');
  const reborn = await attest({ site_key: 'wgh', ...(await signedBadge(d)) });
  assert(reborn.status === 200 && reborn.json?.attestation?.age_days === 0 && reborn.json?.profile?.badges === 1, 'T12 the device can start over afterwards: age 0, fresh profile');

  const badJwk = await erase({ publicKeyJwk: { kty: 'RSA', n: 'x' }, requested_at: new Date().toISOString(), signature: 'AA==' });
  assert(badJwk.status === 400 && badJwk.json?.error === 'bad_public_key', 'T12 a key that is not P-256 is refused (bad_public_key)');
  const missing = await erase({ publicKeyJwk: d.pub });
  assert(missing.status === 400 && missing.json?.error === 'missing_fields', 'T12 requested_at and signature are required');
  const big = await erase('{"publicKeyJwk":{"x":"' + 'a'.repeat(5000) + '"}}');
  assert(big.status === 413 && big.json?.error === 'payload_too_large', 'T12 oversized body is refused');
  const opts = await eraseH(new Request(ERASE, { method: 'OPTIONS' }));
  assert(opts.status === 200 && opts.headers.get('access-control-allow-origin') === '*' && /content-type/.test(opts.headers.get('access-control-allow-headers') || ''), 'T12 CORS preflight, same headers as attest');
  assert((await eraseH(new Request(ERASE, { method: 'GET' }))).status === 405, 'T12 GET is refused');
}

// ── T12b erase covers every attestation of the device, whatever the site ─
{
  const d = await makeDevice();
  for (const site of ['wgh', 'writer', 'extension']) await attest({ site_key: site, ...(await signedBadge(d, { site_key: site })) });
  const r = await erase(await signedErase(d));
  assert(r.status === 200 && JSON.stringify(r.json?.deleted) === JSON.stringify({ attestations: 3, profiles: 1, devices: 1 }), `T12b three attestations on three sites, one profile, one device (got ${JSON.stringify(r.json?.deleted)})`);
}

// ── T13 the anon role can't reach the new objects either ────────────────
{
  assert(await asAnon('select * from ip_windows') === 'DENIED', 'T13 anon cannot read ip_windows');
  assert(await asAnon(`select bump_ip_window('x', 1)`) === 'DENIED', 'T13 anon cannot call bump_ip_window');
  assert(await asAnon(`select prune_ip_windows()`) === 'DENIED', 'T13 anon cannot call prune_ip_windows');
  assert(await asAnon(`select * from erase_device('x')`) === 'DENIED', 'T13 anon cannot call erase_device');
}

// ── T14 the window functions themselves ─────────────────────────────────
{
  await g.__pg.exec(`insert into ip_windows (bucket, window_start, count) values ('stale-window', now() - interval '2 days', 3)`);
  const pruned = (await g.__pg.query('select prune_ip_windows() as n')).rows[0].n;
  const left = (await g.__pg.query(`select count(*)::int as n from ip_windows where bucket = 'stale-window'`)).rows[0].n;
  const kept = (await g.__pg.query(`select count(*)::int as n from ip_windows where window_start = date_trunc('hour', now())`)).rows[0].n;
  assert(pruned >= 1 && left === 0 && kept > 0, `T14 prune_ip_windows drops windows older than a day and keeps the current hour (pruned ${pruned}, left ${left}, kept ${kept})`);
  const seq: boolean[] = [];
  for (let i = 0; i < 4; i++) seq.push((await g.__pg.query(`select bump_ip_window('window-test', 3) as ok`)).rows[0].ok);
  assert(seq.join(',') === 'true,true,true,false', `T14 bump_ip_window allows up to the limit and refuses the next (got ${seq})`);
  const c = (await g.__pg.query(`select count from ip_windows where bucket = 'window-test'`)).rows[0].count;
  assert(c === 4, `T14 one row per bucket per hour; the refused call is counted (got ${c})`);
}

// ── T15 helpers ─────────────────────────────────────────────────────────
{
  assert(isFreshTimestamp(new Date().toISOString()) && !isFreshTimestamp(new Date(Date.now() - 11 * 60000).toISOString())
    && !isFreshTimestamp('yesterday') && !isFreshTimestamp(12345), 'T15 isFreshTimestamp: an ISO timestamp within ten minutes');
  assert(rpcScalar(true, 'f') === true && rpcScalar([{ f: false }], 'f') === false && rpcScalar(null, 'f') === null, 'T15 rpcScalar reads PostgREST scalars and SELECT * rows alike');
  const req = (h: Record<string, string>) => new Request('http://x/', { headers: h });
  assert(clientAddress(req({ 'x-forwarded-for': ' 203.0.113.9 , 10.0.0.1' })) === '203.0.113.9' && clientAddress(req({ 'cf-connecting-ip': '198.51.100.7' })) === '198.51.100.7'
    && clientAddress(req({})) === 'unknown', 'T15 clientAddress: first x-forwarded-for entry, then cf-connecting-ip, then "unknown"');
}

// ── T16 server key id travels with the record (rotation) ────────────────
{
  const oldId = keyIdFromDeviceId(await deviceIdFor(serverPub));
  const stored = (await g.__pg.query('select server_key_id from attestations where badge_hash = $1', [badgeHash])).rows[0]?.server_key_id;
  assert(r1.json?.server_key_id === oldId && stored === oldId, `T16 server_key_id is the server key's id and is stored with the attestation (got ${r1.json?.server_key_id}, stored ${stored})`);
  const oldSecret = Deno.env.get('JITTER_SERVER_KEY_JWK')!;
  const rotated = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const newPriv = await crypto.subtle.exportKey('jwk', rotated.privateKey);
  const newPub = { kty: 'EC', crv: 'P-256', x: newPriv.x!, y: newPriv.y! };
  const newId = keyIdFromDeviceId(await deviceIdFor(newPub));
  Deno.env.set('JITTER_SERVER_KEY_JWK', JSON.stringify({ ...newPub, d: newPriv.d }));
  const replay = await attest({ site_key: 'wgh', ...first });
  assert(replay.json?.duplicate === true && replay.json?.server_key_id === oldId && replay.json?.server_signature === r1.json.server_signature,
    'T16 after rotation a replayed badge returns its stored signature and the id of the key that made it');
  const fresh = await attest({ site_key: 'wgh', ...(await signedBadge(dev)) });
  assert(fresh.status === 200 && fresh.json?.server_key_id === newId && newId !== oldId
    && await verifyEcdsa(newPub, canonicalJson(fresh.json.attestation), fresh.json.server_signature), 'T16 new attestations are countersigned with the new key and carry its id');
  Deno.env.set('JITTER_SERVER_KEY_JWK', oldSecret);
}

// ── T17 the server scores the timing, not the client's claim ────────────
{
  const d = await makeDevice();
  await attest({ site_key: 'wgh', ...(await signedBadge(d)) });
  await g.__pg.exec(`update devices set first_seen = now() - interval '400 days' where device_id = '${d.id}'`); // no cap: the claims would count
  const forged = await attest({ site_key: 'wgh', ...(await signedBadge(d, { war: 0.95, war_uncapped: 0.95 }, botTiming())) });
  const fa = forged.json?.attestation;
  assert(forged.status === 200 && fa?.classification === 'bot' && fa?.war === 0 && fa?.war_server === 0 && fa?.war_client === 0.95
    && fa?.flags?.includes('war_mismatch') && fa?.flags?.some((f: string) => /_floor$/.test(f)),
    `T17 a signed claim of 0.95 on a script's timing is scored 0 and "bot"; the claim is kept as war_client with war_mismatch (got ${JSON.stringify(fa)})`);
  const inflated = await attest({ site_key: 'wgh', ...(await signedBadge(d, { war: 0.99, war_uncapped: 0.99 })) });
  const ia = inflated.json?.attestation;
  assert(ia?.war === HUMAN_WAR && ia?.war_server === HUMAN_WAR && ia?.war_client === 0.99 && ia?.flags?.includes('war_mismatch'),
    `T17 an inflated claim on real timing gets the server's number (${HUMAN_WAR}) and a war_mismatch flag (got ${JSON.stringify(ia)})`);
  const honest = await attest({ site_key: 'wgh', ...(await signedBadge(d)) });
  assert(honest.json?.attestation?.war_server === HUMAN_WAR && !honest.json?.attestation?.flags?.includes('war_mismatch'), 'T17 an honest claim carries no mismatch flag');
  const j = await verify(`hash=${forged.json?.badge_hash}&format=json`);
  assert(j.json?.attestation?.war_server === 0 && j.json?.attestation?.war_client === 0.95 && j.json?.attestation?.classification === 'bot', 'T17 /verify reports the server score, the client\'s claim and the verdict');
  const cols = (await g.__pg.query(`select column_name from information_schema.columns where table_name = 'attestations'`)).rows.map((r: any) => r.column_name);
  const row = (await g.__pg.query('select meta, flags from attestations where badge_hash = $1', [honest.json?.badge_hash])).rows[0];
  assert(!cols.includes('timing') && !JSON.stringify(row).includes('flightTimes'), 'T17 the timing payload is scored and discarded, never stored');
}

// ── T18 the timing is bound to the signed badge ─────────────────────────
{
  const d = await makeDevice();
  const b = await signedBadge(d);
  const swapped = await attest({ site_key: 'wgh', badge: b.badge, signature: b.signature, timing: humanTiming(2) });
  assert(swapped.status === 400 && swapped.json?.error === 'timing_hash_mismatch', 'T18 a timing other than the one the badge was signed over is refused');
  const none = await attest({ site_key: 'wgh', badge: b.badge, signature: b.signature });
  assert(none.status === 400 && none.json?.error === 'missing_timing', 'T18 timing is required');
  const outside = await attest({ site_key: 'wgh', ...(await signedBadge(d, {}, { ...humanTiming(), flightTimes: humanTiming().flightTimes.slice(0, 99).concat([5000]) })) });
  assert(outside.status === 400 && outside.json?.error === 'bad_timing' && /flightTimes/.test(outside.json?.detail), 'T18 a value outside the capture window is refused (bad_timing)');
  const extra = await attest({ site_key: 'wgh', ...(await signedBadge(d, {}, { ...humanTiming(), text: 'never' })) });
  assert(extra.status === 400 && extra.json?.error === 'bad_timing' && /unknown_field/.test(extra.json?.detail), 'T18 an unknown timing field is refused');
  const tooMany = await attest({ site_key: 'wgh', ...(await signedBadge(d, {}, { ...humanTiming(), dwellTimes: Array(101).fill(90) })) });
  assert(tooMany.status === 400 && tooMany.json?.error === 'bad_timing', 'T18 more samples than a capture keeps are refused');
  // A client that claims a score over five timed keystrokes (an honest client would have no score to claim)
  const short = await attest({ site_key: 'wgh', ...(await signedBadge(d, { war: 0.9, war_uncapped: 0.9 }, { ...humanTiming(), flightTimes: humanTiming().flightTimes.slice(0, 5) })) });
  assert(short.status === 400 && short.json?.error === 'insufficient_data', 'T18 fewer than 10 timed keystrokes is insufficient_data, whatever the claim');
  const noHash = await signedBadge(d, { timing_hash: undefined });
  assert((await attest({ site_key: 'wgh', ...noHash })).json?.error === 'bad_timing_hash', 'T18 a badge without a signed timing_hash is refused');
  const noText = await signedBadge(d, { text_hash: undefined });
  assert((await attest({ site_key: 'wgh', ...noText })).json?.error === 'bad_text_hash', 'T18 text_hash is required: every attestation is bound to a text');
  const otherSite = await attest({ site_key: 'writer', ...(await signedBadge(d)) });
  assert(otherSite.status === 400 && otherSite.json?.error === 'site_key_mismatch', 'T18 a badge signed for wgh cannot be attested as writer');
  const noSite = await signedBadge(d, { site_key: undefined });
  assert((await attest({ site_key: 'wgh', ...noSite })).json?.error === 'site_key_mismatch', 'T18 site_key must be inside the signed badge');
}

// ── T19 a rewritten signature is the same attestation (ECDSA malleability) ─
{
  const d = await makeDevice();
  const b = await signedBadge(d);
  const first = await attest({ site_key: 'wgh', ...b });
  const sig = b64ToBytes(b.signature);
  const n = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
  const s2 = (n - BigInt('0x' + hex(sig.slice(32).buffer as ArrayBuffer))).toString(16).padStart(64, '0');
  const sig2 = new Uint8Array(64);
  sig2.set(sig.slice(0, 32), 0);
  for (let i = 0; i < 32; i++) sig2[32 + i] = parseInt(s2.slice(2 * i, 2 * i + 2), 16);
  const malleated = bytesToB64(sig2);
  assert(malleated !== b.signature && await verifyEcdsa(d.pub, canonicalJson(b.badge), malleated), 'T19 (r, n - s) is a second valid signature over the same badge');
  const again = await attest({ site_key: 'wgh', badge: b.badge, signature: malleated, timing: b.timing });
  assert(first.status === 200 && again.status === 200 && again.json?.duplicate === true && again.json?.badge_hash === first.json?.badge_hash,
    `T19 attesting with the rewritten signature returns the same attestation (got ${again.status} ${again.text.slice(0, 100)})`);
  const count = (await g.__pg.query('select count(*)::int as n from attestations where device_id = $1', [d.id])).rows[0].n;
  assert(count === 1, 'T19 no second row: replay is keyed on the signed content, not the signature bytes');
}

// ── T20 parity: the server's number is the engine's number ──────────────
{
  const d = await makeDevice();
  await attest({ site_key: 'wgh', ...(await signedBadge(d)) });
  await g.__pg.exec(`update devices set first_seen = now() - interval '400 days' where device_id = '${d.id}'`);
  let mismatches = 0;
  for (let seed = 10; seed < 40; seed++) {
    const t = humanTiming(seed);
    const r = await attest({ site_key: 'wgh', ...(await signedBadge(d, {}, t)) });
    const expected = JitterWAR.scoreSession(t).war;
    if (r.status !== 200 || r.json?.attestation?.war_server !== expected || r.json?.attestation?.war !== expected) mismatches++;
  }
  assert(mismatches === 0, `T20 30 sessions: war_server equals the engine's scoreSession on the same payload (${mismatches} mismatches)`);
}

console.log(failed ? `\n${failed} FAILED` : '\nAll backend tests passed.');
Deno.exit(failed ? 1 : 0);
