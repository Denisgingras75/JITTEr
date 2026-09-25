// Shared by the attest, verify and erase functions: canonical JSON, ECDSA
// P-256 helpers, device ids, the server-side trust rules, and the request
// plumbing (CORS, site keys, the per-address limit) attest and erase share.
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
export const MAX_ERASE_BODY_BYTES = 4 * 1024
export const ERASE_WINDOW_MS = 10 * 60 * 1000
export const DEFAULT_SITE_KEYS = ['extension', 'writer', 'wgh']
export const DEFAULT_MAX_REQUESTS_PER_IP_HOUR = 600

// ── Responses ───────────────────────────────────────────────────────────

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
export const fail = (status: number, error: string, detail?: string) => json(status, detail ? { error, detail } : { error })

// ── Site keys ───────────────────────────────────────────────────────────

/** JITTER_SITE_KEYS (comma-separated) or the default list. Read per request, so a change needs no redeploy. */
export function allowedSiteKeys(): string[] {
  const keys = (Deno.env.get('JITTER_SITE_KEYS') ?? '').split(',').map(s => s.trim()).filter(Boolean)
  return keys.length ? keys : DEFAULT_SITE_KEYS
}

// ── Freshness ───────────────────────────────────────────────────────────

/** True when `ts` is an ISO 8601 timestamp within `windowMs` of `now`, either way. */
export function isFreshTimestamp(ts: unknown, windowMs = ERASE_WINDOW_MS, now = Date.now()): boolean {
  if (typeof ts !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(ts)) return false
  const t = Date.parse(ts)
  return Number.isFinite(t) && Math.abs(now - t) <= windowMs
}

// ── Per-address rate limit ──────────────────────────────────────────────
// The address is taken from the platform's proxy headers, hashed with a
// server-side salt, and only the hash and a count reach the database
// (ip_windows). attest and erase draw on the same hourly budget.

export function maxRequestsPerIpHour(): number {
  const n = Number.parseInt(Deno.env.get('JITTER_MAX_ATTESTS_PER_IP_HOUR') ?? '', 10)
  return n > 0 ? n : DEFAULT_MAX_REQUESTS_PER_IP_HOUR
}

/** First x-forwarded-for entry, else cf-connecting-ip, else "unknown". */
export function clientAddress(req: Request): string {
  const first = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
  if (first) return first
  return (req.headers.get('cf-connecting-ip') ?? '').trim() || 'unknown'
}

/** The only form of the address that is stored. Change JITTER_IP_SALT and every bucket starts over. */
export async function ipBucket(address: string): Promise<string> {
  return await sha256Hex(address + ':' + (Deno.env.get('JITTER_IP_SALT') ?? ''))
}

/** A scalar-returning RPC: PostgREST returns the value itself; `SELECT * FROM fn()` returns one row named after the function. */
export function rpcScalar(data: unknown, fn: string): unknown {
  if (data == null || typeof data !== 'object') return data
  const row = Array.isArray(data) ? data[0] : data
  return row && typeof row === 'object' ? (row as Record<string, unknown>)[fn] : undefined
}

type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }

/**
 * Counts this request against its address's hourly window. Returns null
 * when the request may go on, otherwise the response to send instead. It is
 * one database write, so callers place it after the checks that cost only
 * CPU (parsing, validation, the signature) and before any other query.
 */
export async function checkIpLimit(supabase: RpcClient, req: Request): Promise<Response | null> {
  const limit = maxRequestsPerIpHour()
  const { data, error } = await supabase.rpc('bump_ip_window', { p_bucket: await ipBucket(clientAddress(req)), p_limit: limit })
  const allowed = rpcScalar(data, 'bump_ip_window')
  if (error || typeof allowed !== 'boolean') return fail(500, 'rate_limit_error')
  return allowed ? null : fail(429, 'rate_limited_ip', `${limit} requests per hour per address`)
}
