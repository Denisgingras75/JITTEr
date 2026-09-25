/**
 * background.js - JITTER PROTOCOL v3.0
 *
 * Copyright (c) 2025-2026 Denis Gingras. All Rights Reserved.
 *
 * PROPRIETARY AND CONFIDENTIAL
 * Unauthorized copying, modification, or use is strictly prohibited.
 * See LICENSE file for full terms.
 *
 * The service worker does three things:
 *  - holds the device key (a non-extractable P-256 pair) and signs for the
 *    content script and the Writer ('deviceKey' / 'sign');
 *  - manages capture opt-in per site: the list of enabled origins and the one
 *    dynamically registered content script that runs on them;
 *  - erases this device's server records on request ('erase').
 * There is no login of any kind.
 */

const SUPABASE_URL = 'https://fmguuhnustgcqzgjaoil.supabase.co';
const ERASE_URL = SUPABASE_URL + '/functions/v1/erase';
const ERASE_TIMEOUT_MS = 8000;

// --- Capture opt-in per site ---
// Capture runs only on origins the user enabled from the popup. The popup asks
// Chrome for the host permission (that needs the click), then tells us to add
// the origin here. One content script registration covers every enabled
// origin; it is rebuilt whenever the list changes and re-synced on install and
// on browser start.
const SITES_KEY = 'jitter_sites';
const CAPTURE_SCRIPT_ID = 'jitter-capture';
const CAPTURE_FILES = [
  'src/crypto-utils.js',
  'src/passport-utils.js',
  'src/war-score.js',
  'src/biometrics.js',
  'src/content.js',
];

chrome.runtime.onInstalled.addListener(() => { syncCaptureRegistration().catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { syncCaptureRegistration().catch(() => {}); });

// The user can also drop a site's permission from chrome://extensions. Keep the
// stored list honest when that happens.
if (chrome.permissions && chrome.permissions.onRemoved) {
  chrome.permissions.onRemoved.addListener((removed) => {
    const origins = (removed && removed.origins) || [];
    if (origins.length === 0) return;
    (async () => {
      const sites = await getSites();
      const kept = sites.filter(site => !origins.some(pattern => patternCoversOrigin(pattern, site)));
      if (kept.length !== sites.length) await setSites(kept);
    })().catch(() => {});
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || typeof request.action !== 'string') return;
  if (request.action === 'openWriter') {
    openWriter();
    return;
  }
  if (request.action === 'deviceKey') {
    deviceInfo().then(sendResponse, () => sendResponse(null));
    return true; // async response
  }
  if (request.action === 'sign') {
    signWithDevice(request.data).then(sig => sendResponse({ signature: sig }), () => sendResponse(null));
    return true;
  }
  if (request.action === 'siteStatus') {
    siteStatus(request.origin).then(sendResponse, e => sendResponse({ ok: false, error: errorText(e) }));
    return true;
  }
  if (request.action === 'enableSite') {
    enableSite(request.origin, request.tabId).then(sendResponse, e => sendResponse({ ok: false, error: errorText(e) }));
    return true;
  }
  if (request.action === 'disableSite') {
    disableSite(request.origin).then(sendResponse, e => sendResponse({ ok: false, error: errorText(e) }));
    return true;
  }
  if (request.action === 'listSites') {
    getSites().then(sites => sendResponse({ ok: true, sites }), e => sendResponse({ ok: false, error: errorText(e) }));
    return true;
  }
  if (request.action === 'erase') {
    eraseServerRecords().then(sendResponse, e => sendResponse({ ok: false, status: 0, error: errorText(e) }));
    return true;
  }
});

function errorText(e) {
  return e && e.message ? e.message : String(e);
}

// Only http(s) origins can be enabled: that is what the optional host
// permissions cover, and the only place a page can host a text field we care
// about. Returns the normalised origin or null.
function normaliseOrigin(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch (e) {
    return null;
  }
}

function originPattern(origin) {
  return origin + '/*';
}

// Does a match pattern from permissions.onRemoved cover an enabled origin?
// Handles the exact pattern we request plus the broad ones ('<all_urls>',
// 'https://*/*', '*://*.example.com/*').
function patternCoversOrigin(pattern, origin) {
  if (pattern === '<all_urls>' || pattern === '*://*/*') return true;
  if (pattern === originPattern(origin)) return true;
  const m = /^(\*|https?):\/\/([^/]+)\/.*$/.exec(pattern);
  if (!m) return false;
  let url;
  try { url = new URL(origin); } catch (e) { return false; }
  const scheme = url.protocol.slice(0, -1);
  if (m[1] !== '*' && m[1] !== scheme) return false;
  const hostPattern = m[2].split(':')[0];
  const host = url.hostname;
  if (hostPattern === '*') return true;
  if (hostPattern.startsWith('*.')) {
    const base = hostPattern.slice(2);
    return host === base || host.endsWith('.' + base);
  }
  return hostPattern === host;
}

async function getSites() {
  const data = await chrome.storage.local.get(SITES_KEY);
  const list = Array.isArray(data[SITES_KEY]) ? data[SITES_KEY] : [];
  return list.map(normaliseOrigin).filter(Boolean);
}

async function setSites(sites) {
  const unique = Array.from(new Set(sites));
  await chrome.storage.local.set({ [SITES_KEY]: unique });
  await syncCaptureRegistration();
  return unique;
}

async function hasOriginPermission(origin) {
  try {
    return await chrome.permissions.contains({ origins: [originPattern(origin)] });
  } catch (e) {
    return false;
  }
}

// Make the registered content script match exactly the enabled origins (or
// nothing when the list is empty). Origins whose permission is gone are not
// registered, so a stale list can never capture anywhere Chrome would not let
// it anyway.
async function syncCaptureRegistration() {
  const sites = await getSites();
  const permitted = [];
  for (const site of sites) {
    if (await hasOriginPermission(site)) permitted.push(site);
  }
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [CAPTURE_SCRIPT_ID] });
  if (permitted.length === 0) {
    if (existing.length > 0) await chrome.scripting.unregisterContentScripts({ ids: [CAPTURE_SCRIPT_ID] });
    return [];
  }
  const script = {
    id: CAPTURE_SCRIPT_ID,
    matches: permitted.map(originPattern),
    js: CAPTURE_FILES,
    runAt: 'document_idle',
    allFrames: true,
    persistAcrossSessions: true,
  };
  if (existing.length > 0) await chrome.scripting.updateContentScripts([script]);
  else await chrome.scripting.registerContentScripts([script]);
  return permitted;
}

async function siteStatus(rawOrigin) {
  const origin = normaliseOrigin(rawOrigin);
  if (!origin) return { ok: true, origin: null, enabled: false, supported: false };
  const sites = await getSites();
  const listed = sites.includes(origin);
  const permitted = listed && await hasOriginPermission(origin);
  return { ok: true, origin, supported: true, enabled: listed && permitted };
}

// The popup has already obtained the host permission from the user's click;
// without it Chrome would never run the script there, so we refuse to list the
// site rather than pretend. When a tab id is given, capture starts in that tab
// right away so the user need not reload: a script that is already there (the
// site was disabled and re-enabled) is told to resume, otherwise the capture
// files are injected.
async function enableSite(rawOrigin, tabId) {
  const origin = normaliseOrigin(rawOrigin);
  if (!origin) return { ok: false, error: 'Capture works on http and https pages only.' };
  if (!await hasOriginPermission(origin)) {
    return { ok: false, error: 'Chrome did not grant access to ' + origin + '.' };
  }
  const sites = await getSites();
  if (!sites.includes(origin)) sites.push(origin);
  await setSites(sites);
  let injected = false;
  if (Number.isInteger(tabId)) {
    injected = await sendToTab(tabId, { action: 'captureOn', origin });
    if (!injected) {
      try {
        await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: CAPTURE_FILES });
        injected = true;
      } catch (e) {
        // The tab may have gone, or be a page the script cannot run in. The
        // registration covers it on the next load.
      }
    }
  }
  return { ok: true, origin, enabled: true, injected };
}

// Resolves true when a content script in that tab answered.
function sendToTab(tabId, message) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (res) => {
        void chrome.runtime.lastError; // no content script there: fine
        resolve(!chrome.runtime.lastError && !!(res && res.ok));
      });
    } catch (e) {
      resolve(false);
    }
  });
}

// Drop the origin from the list, rebuild the registration, tell the pages of
// that site that are open right now to stop capturing, then give the host
// permission back to Chrome.
async function disableSite(rawOrigin) {
  const origin = normaliseOrigin(rawOrigin);
  if (!origin) return { ok: false, error: 'Capture works on http and https pages only.' };
  const sites = await getSites();
  await setSites(sites.filter(site => site !== origin));
  await stopCaptureInOpenTabs(origin);
  try {
    await chrome.permissions.remove({ origins: [originPattern(origin)] });
  } catch (e) {
    // Nothing to remove (already gone, or granted through the manifest).
  }
  return { ok: true, origin, enabled: false };
}

async function stopCaptureInOpenTabs(origin) {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: originPattern(origin) });
  } catch (e) {
    return;
  }
  await Promise.all(tabs.map(tab => sendToTab(tab.id, { action: 'captureOff', origin })));
}

// --- Device key: the extension's identity ---
// A P-256 key pair generated once, non-extractable, kept in this service
// worker's IndexedDB. Content scripts and extension pages ask it to sign;
// the private key never reaches a web page. The device id (SHA-256 of the
// public key) is what the attestation server tracks age and rate limits by.

const DEVICE_DB = 'jitter-device';
let deviceKeyPromise = null;

function openDeviceDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DEVICE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('keys');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db, key) {
  return new Promise((resolve, reject) => {
    const req = db.transaction('keys').objectStore('keys').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('keys', 'readwrite');
    tx.objectStore('keys').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbDelete(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('keys', 'readwrite');
    tx.objectStore('keys').delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function getDeviceKeyPair() {
  if (!deviceKeyPromise) {
    deviceKeyPromise = (async () => {
      const db = await openDeviceDb();
      let pair = await idbGet(db, 'device');
      if (!pair) {
        pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
        await idbPut(db, 'device', pair);
      }
      return pair;
    })().catch(e => { deviceKeyPromise = null; throw e; });
  }
  return deviceKeyPromise;
}

async function deviceInfo() {
  const pair = await getDeviceKeyPair();
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const raw = await crypto.subtle.exportKey('raw', pair.publicKey);
  const digest = await crypto.subtle.digest('SHA-256', raw);
  const deviceId = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  return { jwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, deviceId, keyId: deviceId.slice(0, 12).toUpperCase() };
}

async function signWithDevice(data) {
  if (typeof data !== 'string' || data.length > 65536) throw new Error('bad data');
  const pair = await getDeviceKeyPair();
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, pair.privateKey, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// Forget the device key. The next signing request generates a fresh pair, so
// nothing links later receipts to the erased records.
async function deleteDeviceKey() {
  const db = await openDeviceDb();
  await idbDelete(db, 'device');
  deviceKeyPromise = null;
}

// --- Erase: delete this device's server records ---
// The request is signed by the device key itself, so only the device that
// created the records can delete them. Same rule as CryptoUtils.canonicalJson
// in src/crypto-utils.js (keys sorted at every depth, no whitespace, undefined
// dropped); this worker cannot load that file, so the function lives here too
// and must stay identical.
function canonicalJson(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(v => canonicalJson(v)).join(',') + ']';
  return '{' + Object.keys(value).sort()
    .filter(k => value[k] !== undefined)
    .map(k => JSON.stringify(k) + ':' + canonicalJson(value[k]))
    .join(',') + '}';
}

async function eraseServerRecords() {
  const info = await deviceInfo();
  const publicKeyJwk = info.jwk;
  const requested_at = new Date().toISOString();
  const signature = await signWithDevice(canonicalJson({ action: 'erase', publicKeyJwk, requested_at }));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ERASE_TIMEOUT_MS);
  let res;
  let data = null;
  try {
    res = await fetch(ERASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicKeyJwk, requested_at, signature }),
      signal: controller.signal,
    });
    data = await res.json().catch(() => null);
  } catch (e) {
    const timedOut = e && e.name === 'AbortError';
    return { ok: false, status: 0, error: timedOut ? 'The server did not answer in time.' : 'Could not reach the server.' };
  } finally {
    clearTimeout(timer);
  }

  if (res.status !== 200) {
    const serverError = data && typeof data.error === 'string' ? data.error : null;
    return { ok: false, status: res.status, error: serverError || ('Server answered ' + res.status + '.') };
  }

  // Server records are gone: forget the local identity and passport too, so
  // this device starts over. The badge chain pointer goes with them.
  await deleteDeviceKey();
  await chrome.storage.local.remove(['passport', 'lastBadgeHash']);
  const deleted = data && data.deleted !== undefined ? data.deleted : null;
  return { ok: true, deleted };
}

function openWriter() {
  const writerUrl = chrome.runtime.getURL('writer.html');
  chrome.tabs.create({ url: writerUrl });
}

// Node (tests) only: the service worker has no module object.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { canonicalJson, normaliseOrigin, originPattern, patternCoversOrigin, CAPTURE_FILES, CAPTURE_SCRIPT_ID, SITES_KEY, ERASE_URL };
}
