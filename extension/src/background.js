/**
 * background.js - JITTER PROTOCOL v3.0
 *
 * Copyright (c) 2025-2026 Denis Gingras. All Rights Reserved.
 *
 * PROPRIETARY AND CONFIDENTIAL
 * Unauthorized copying, modification, or use is strictly prohibited.
 * See LICENSE file for full terms.
 */

const SUPABASE_URL = 'https://fmguuhnustgcqzgjaoil.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtZ3V1aG51c3RnY3F6Z2phb2lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MTIzODMsImV4cCI6MjA4ODQ4ODM4M30.aiCNgJvb2-JzL_P9N--Tt3vN4R4GjefiVgVSBUPvM_U';

chrome.runtime.onInstalled.addListener(() => {
  // Installed
});

chrome.action.onClicked.addListener(() => {
  openWriter();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openWriter') {
    openWriter();
  }
  if (request.action === 'signIn') {
    signInWithGoogle().then(sendResponse);
    return true; // async response
  }
  if (request.action === 'signOut') {
    signOut().then(sendResponse);
    return true;
  }
  if (request.action === 'getUser') {
    getUser().then(sendResponse);
    return true;
  }
  if (request.action === 'deviceKey') {
    deviceInfo().then(sendResponse, () => sendResponse(null));
    return true;
  }
  if (request.action === 'sign') {
    signWithDevice(request.data).then(sig => sendResponse({ signature: sig }), () => sendResponse(null));
    return true;
  }
});

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

function openWriter() {
  const writerUrl = chrome.runtime.getURL('writer.html');
  chrome.tabs.create({ url: writerUrl });
}

// --- Supabase Auth via chrome.identity ---

async function signInWithGoogle() {
  try {
    // Get OAuth token from Chrome identity API
    const token = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (tok) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(tok);
      });
    });

    // Get user's email from Chrome profile
    const userInfo = await new Promise((resolve) => {
      chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, resolve);
    });
    const email = userInfo.email || null;

    // Generate stable user ID from email or token
    const userId = email ? await hashString(email) : await hashString(token);

    await chrome.storage.local.set({
      jitter_user_id: userId,
      jitter_user_email: email,
      jitter_auth_method: 'chrome_identity',
    });

    return { ok: true, user_id: userId, email: email, method: 'chrome_identity' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function signOut() {
  try {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (token) chrome.identity.removeCachedAuthToken({ token: token });
    });
    await chrome.storage.local.remove([
      'jitter_user_id', 'jitter_user_email', 'jitter_auth_method', 'jitter_access_token'
    ]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function getUser() {
  const data = await chrome.storage.local.get(['jitter_user_id', 'jitter_user_email', 'jitter_auth_method']);
  if (data.jitter_user_id) {
    return { loggedIn: true, user_id: data.jitter_user_id, email: data.jitter_user_email, method: data.jitter_auth_method };
  }
  return { loggedIn: false };
}

async function hashString(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}
