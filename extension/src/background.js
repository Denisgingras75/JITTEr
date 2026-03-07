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
});

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

    // Exchange Google token for Supabase session
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=id_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        provider: 'google',
        token: token,
      }),
    });

    if (!res.ok) {
      // Fallback: use token as identity without Supabase session
      const hash = await hashString(token);
      await chrome.storage.local.set({
        jitter_user_id: hash,
        jitter_user_email: null,
        jitter_auth_method: 'token_hash',
      });
      return { ok: true, user_id: hash, method: 'token_hash' };
    }

    const data = await res.json();
    const userId = data.user?.id || await hashString(token);
    const email = data.user?.email || null;

    await chrome.storage.local.set({
      jitter_user_id: userId,
      jitter_user_email: email,
      jitter_auth_method: 'supabase',
      jitter_access_token: data.access_token,
    });

    return { ok: true, user_id: userId, email: email, method: 'supabase' };
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
