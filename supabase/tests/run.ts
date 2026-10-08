// Backend tests: the real attest, verify and erase functions, run against a
// PGlite database with the repo migrations applied. Run with `npm run test:backend`.
// deno-lint-ignore-file no-explicit-any
import { makeDb } from './db.mjs';
import {
  canonicalJson, classify, clientAddress, deviceIdFor, isFreshTimestamp, keyIdFromDeviceId, rpcScalar,
  sha256Hex, signEcdsa, timeCapForAge, verifyEcdsa,
} from '../functions/_shared/trust.ts';

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

// ── T1c a jitter-capture (SDK) badge: no client cap, site's own user ref ─
{
  const dev3 = await makeDevice();
  const r = await attest({ site_key: 'wgh', ...(await signedBadge(dev3, { type: 'capture', site_user: 'wgh-user-42', war: 0.66, war_uncapped: 0.66, meta: { pasteCount: 0 } })) });
  const row = (await g.__pg.query(`select meta from attestations where badge_hash = $1`, [r.json?.badge_hash])).rows[0];
  assert(r.status === 200 && row?.meta?.site_user === 'wgh-user-42' && r.json?.attestation?.classification === 'building',
    `T1c capture badge attested, site_user kept as an opaque reference (got ${r.status} ${JSON.stringify(row?.meta)})`);
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
  const demo = await attest({ site_key: 'demo', ...(await signedBadge(d)) });
  const ext = await attest({ site_key: 'extension', ...(await signedBadge(d)) });
  assert(demo.status === 200 && ext.status === 400 && ext.json?.error === 'unknown_site_key', 'T10 JITTER_SITE_KEYS replaces the default list and is read per request');
  Deno.env.delete('JITTER_SITE_KEYS');
  const writer = await attest({ site_key: 'writer', ...(await signedBadge(d)) });
  const ext2 = await attest({ site_key: 'extension', ...(await signedBadge(d)) });
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
  for (const site of ['wgh', 'writer', 'extension']) await attest({ site_key: site, ...(await signedBadge(d)) });
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

console.log(failed ? `\n${failed} FAILED` : '\nAll backend tests passed.');
Deno.exit(failed ? 1 : 0);
