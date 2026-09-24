#!/usr/bin/env node
// Generates the server's countersigning key pair.
//
//   node supabase/scripts/gen-server-key.mjs
//
// Then:
//   1. Store the PRIVATE key as a function secret (never commit it):
//        supabase secrets set JITTER_SERVER_KEY_JWK='<private jwk on one line>'
//   2. Paste the PUBLIC key into extension/src/server-key.js so verify.html
//      can check server signatures offline.

const { subtle } = globalThis.crypto;
const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const priv = await subtle.exportKey('jwk', pair.privateKey);
const pub = await subtle.exportKey('jwk', pair.publicKey);
const raw = await subtle.exportKey('raw', pair.publicKey);
const id = Array.from(new Uint8Array(await subtle.digest('SHA-256', raw)))
  .map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12).toUpperCase();

console.log('# PRIVATE key (Supabase secret JITTER_SERVER_KEY_JWK) - keep this out of git:');
console.log(JSON.stringify({ kty: priv.kty, crv: priv.crv, x: priv.x, y: priv.y, d: priv.d }));
console.log('\n# PUBLIC key for extension/src/server-key.js:');
console.log(JSON.stringify({ kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }));
console.log('\n# key id:', id);
