// Client-side cost of maintaining a persona: one signed attestation per active day.
// No server: measures the attacker's own CPU time and bytes per attestation.
const ROOT = require('path').resolve(__dirname, '..', '..');
const { webcrypto } = require('crypto');
const fs = require('fs');
const src = fs.readFileSync(ROOT + '/extension/src/crypto-utils.js', 'utf8');
const CryptoUtils = new Function('chrome', 'window', src + '\nreturn CryptoUtils;')({}, {});
const N = 5000;
(async () => {
  // 1. New identities (keygen) per second
  let t = process.hrtime.bigint(); const keys = [];
  for (let i = 0; i < N; i++) keys.push(await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']));
  const keygenMs = Number(process.hrtime.bigint() - t) / 1e6 / N;
  // 2. One daily "session" per persona: a forged badge + signature (no engine, no browser)
  const pub = await webcrypto.subtle.exportKey('jwk', keys[0].publicKey);
  t = process.hrtime.bigint(); let bytes = 0;
  for (let i = 0; i < N; i++) {
    const badge = { version: '3.0', keys: 300, war: 0.9, war_uncapped: 0.9, text_hash: 'ab'.repeat(32), url: 'https://site.example/p/' + i, minted_at: new Date().toISOString(), publicKeyJwk: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y } };
    const sig = await webcrypto.subtle.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, keys[i].privateKey, new TextEncoder().encode(CryptoUtils.canonicalJson(badge)));
    bytes += JSON.stringify({ site_key: 'wgh', badge, signature: Buffer.from(sig).toString('base64') }).length;
  }
  const signMs = Number(process.hrtime.bigint() - t) / 1e6 / N;
  const body = bytes / N;
  const perMonthCpuS = signMs * 30 / 1000;            // one attestation per day, 30 days
  const perMonthBytes = (body + 700) * 30;             // + ~700 B for headers and the JSON response (rough)
  console.log(`keygen: ${keygenMs.toFixed(2)} ms per identity (${(1000 / keygenMs).toFixed(0)}/s, one core)`);
  console.log(`attestation: ${signMs.toFixed(2)} ms CPU + ${body.toFixed(0)} B request body`);
  console.log(`persona-month (1 attestation/day): ${perMonthCpuS.toFixed(3)} CPU-seconds, ~${(perMonthBytes / 1024).toFixed(0)} KB traffic`);
  console.log(`one core, 24h/day: ${(86400 / (signMs / 1000) / 30).toFixed(0)} persona-months per core-month (client CPU only)`);
  console.log(`1,000,000 personas x 30 days: ${(perMonthCpuS * 1e6 / 3600).toFixed(0)} CPU-hours, ${(perMonthBytes * 1e6 / 1e9).toFixed(0)} GB`);
})();
