// Shared by the attest and verify functions: canonical JSON, ECDSA P-256
// helpers, device ids, and the server-side trust rules.
//
// canonicalJson must produce exactly what extension/src/crypto-utils.js
// produces, since the client signs its badge with the same serialization.
// supabase/tests/run.ts checks the two against each other.

const enc = new TextEncoder()

export function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(v => canonicalJson(v)).join(',') + ']'
  const obj = value as Record<string, unknown>
  return '{' + Object.keys(obj).sort()
    .filter(k => obj[k] !== undefined)
    .map(k => JSON.stringify(k) + ':' + canonicalJson(obj[k]))
    .join(',') + '}'
}

export function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(s: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s)))
}

export function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function bytesToB64(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i])
  return btoa(s)
}

export type Jwk = { kty: string; crv: string; x: string; y: string; d?: string }

export function isP256PublicJwk(k: unknown): k is Jwk {
  const j = k as Jwk
  return !!j && typeof j === 'object' && j.kty === 'EC' && j.crv === 'P-256'
    && typeof j.x === 'string' && typeof j.y === 'string' && j.x.length <= 64 && j.y.length <= 64
}

export async function importPublicKey(jwk: Jwk): Promise<CryptoKey> {
  const { kty, crv, x, y } = jwk
  return crypto.subtle.importKey('jwk', { kty, crv, x, y }, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify'])
}

/** SHA-256 of the raw (uncompressed point) public key, hex. */
export async function deviceIdFor(jwk: Jwk): Promise<string> {
  const key = await importPublicKey(jwk)
  const raw = await crypto.subtle.exportKey('raw', key)
  return hex(await crypto.subtle.digest('SHA-256', raw))
}

/** Signature is base64 of the raw r||s form WebCrypto produces. */
export async function verifyEcdsa(jwk: Jwk, data: string, signatureB64: string): Promise<boolean> {
  try {
    const key = await importPublicKey(jwk)
    return await crypto.subtle.verify({ name: 'ECDSA', hash: { name: 'SHA-256' } }, key, b64ToBytes(signatureB64), enc.encode(data))
  } catch {
    return false
  }
}

export async function signEcdsa(privateJwk: Jwk, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, key, enc.encode(data))
  return bytesToB64(sig)
}

/** Twelve hex characters of the device id, the form badges display. */
export function keyIdFromDeviceId(deviceId: string): string {
  return deviceId.slice(0, 12).toUpperCase()
}

// ── Trust rules (JITTER-PLAN "Time confidence cap") ─────────────────────

export function timeCapForAge(ageDays: number): number {
  if (!(ageDays >= 1)) return 0.35
  if (ageDays < 7) return 0.50
  if (ageDays < 30) return 0.65
  if (ageDays < 90) return 0.80
  if (ageDays < 180) return 0.92
  return 1.0
}

export function ageInDays(firstSeen: string | Date, now = Date.now()): number {
  const t = new Date(firstSeen).getTime()
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.floor((now - t) / 86400000))
}

/**
 * The server's verdict. `war` is the client's score after the cap. A new
 * device with a decent raw score is "building", not a bot: the cap is
 * about age, the bot label is about the typing.
 */
export function classify(warCapped: number, warClient: number, cap: number, flags: string[]): string {
  if (warClient < 0.20 || flags.some(f => /_floor$/.test(f))) return 'bot'
  if (warCapped >= 0.80) return 'verified'
  if (cap < 0.80 && warClient >= 0.50) return 'building'
  if (warCapped >= 0.50) return 'suspicious'
  return 'suspicious'
}

export const MAX_ATTESTS_PER_HOUR = 60
export const MIN_KEYS_FOR_ATTESTATION = 20
export const MAX_BODY_BYTES = 32 * 1024
