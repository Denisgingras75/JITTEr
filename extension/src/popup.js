/**
 * popup.js - JITTEr toolbar popup
 *
 * Copyright (c) 2025-2026 Denis Gingras. All Rights Reserved.
 *
 * Capture opt-in for the current site, the device's passport summary, the
 * Writer and verify pages, and erasing this device's server records.
 * The host permission is requested here, from the click, because Chrome only
 * grants it during a user gesture; the service worker does the rest.
 */

const els = {
  origin: document.getElementById('site-origin'),
  state: document.getElementById('site-state'),
  toggle: document.getElementById('site-toggle'),
  first: document.getElementById('pp-first'),
  sessions: document.getElementById('pp-sessions'),
  keys: document.getElementById('pp-keys'),
  openWriter: document.getElementById('open-writer'),
  openVerify: document.getElementById('open-verify'),
  erase: document.getElementById('erase'),
  eraseResult: document.getElementById('erase-result'),
};

const site = { origin: null, tabId: null, enabled: false, supported: false, busy: false };

function send(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (res) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(res || { ok: false, error: 'No answer from the extension.' });
      });
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

function originOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.origin;
  } catch (e) {}
  return null;
}

// --- This site ---

async function loadSite() {
  let tab = null;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (e) {}
  site.tabId = tab && Number.isInteger(tab.id) ? tab.id : null;
  site.origin = originOf(tab && tab.url);
  site.supported = !!site.origin;

  if (!site.supported) {
    site.enabled = false;
    renderSite('Capture is not available on this page.');
    return;
  }
  const status = await send({ action: 'siteStatus', origin: site.origin });
  site.enabled = !!(status && status.ok && status.enabled);
  renderSite();
}

function renderSite(message, isError) {
  els.origin.textContent = site.origin || 'This page';
  els.toggle.disabled = !site.supported || site.busy;
  els.toggle.textContent = site.enabled ? 'Disable on this site' : 'Enable on this site';
  els.toggle.classList.toggle('primary', !site.enabled);
  els.state.className = 'state' + (isError ? ' error' : site.enabled ? ' on' : '');
  if (message) els.state.textContent = message;
  else els.state.textContent = site.enabled ? 'Capture is on for this site.' : 'Capture is off for this site.';
}

els.toggle.addEventListener('click', async () => {
  if (!site.supported || site.busy) return;
  site.busy = true;
  renderSite(site.enabled ? 'Turning off…' : 'Asking Chrome for access…');

  if (site.enabled) {
    const res = await send({ action: 'disableSite', origin: site.origin });
    site.busy = false;
    if (res && res.ok) { site.enabled = false; renderSite(); }
    else renderSite('Could not turn capture off: ' + (res && res.error ? res.error : 'unknown error'), true);
    return;
  }

  // permissions.request must run inside the click: it is the first await.
  let granted = false;
  let requestError = null;
  try {
    granted = await chrome.permissions.request({ origins: [site.origin + '/*'] });
  } catch (e) {
    requestError = e && e.message ? e.message : String(e);
  }
  if (!granted) {
    site.busy = false;
    renderSite(requestError ? 'Chrome refused the request: ' + requestError : 'Access was not granted. Capture stays off.', !!requestError);
    return;
  }
  const res = await send({ action: 'enableSite', origin: site.origin, tabId: site.tabId });
  site.busy = false;
  if (res && res.ok) {
    site.enabled = true;
    renderSite(res.injected ? 'Capture is on for this site.' : 'Capture is on for this site. Reload the page to start.');
  } else {
    renderSite('Could not turn capture on: ' + (res && res.error ? res.error : 'unknown error'), true);
  }
});

// --- This device ---

function loadPassport() {
  try {
    chrome.storage.local.get('passport', (data) => {
      const p = (data && data.passport) || {};
      els.first.textContent = p.firstUsed ? new Date(p.firstUsed).toLocaleDateString() : '—';
      els.sessions.textContent = String(p.sessionsCompleted || 0);
      els.keys.textContent = Number(p.totalKeystrokes || 0).toLocaleString();
    });
  } catch (e) {}
}

// --- Pages ---

els.openWriter.addEventListener('click', () => {
  chrome.windows.create({ url: chrome.runtime.getURL('writer.html'), type: 'popup', width: 1200, height: 800 });
  window.close();
});

els.openVerify.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('verify.html') });
  window.close();
});

// --- Erase ---

els.erase.addEventListener('click', async () => {
  const sure = confirm(
    'Delete every record the JITTEr server holds for this device?\n\n' +
    'Receipts you already handed out keep their signature, but the server will no longer confirm them. ' +
    'This device then starts over with a new key and an empty passport.'
  );
  if (!sure) return;

  els.erase.disabled = true;
  showEraseResult('Deleting…', '');
  const res = await send({ action: 'erase' });
  els.erase.disabled = false;

  if (res && res.ok) {
    // The server reports { attestations, profiles, devices } counts.
    const d = res.deleted && typeof res.deleted === 'object' ? res.deleted : null;
    const total = d ? ['attestations', 'profiles', 'devices'].reduce((n, k) => n + (Number(d[k]) || 0), 0) : null;
    const count = total == null ? 'Records' : total + (total === 1 ? ' record' : ' records');
    showEraseResult(count + ' deleted on the server. This device now has a new key; reload any open pages.', 'ok');
    loadPassport();
  } else {
    const status = res && res.status ? ' (HTTP ' + res.status + ')' : '';
    showEraseResult('Nothing was deleted: ' + (res && res.error ? res.error : 'unknown error') + status, 'error');
  }
});

function showEraseResult(text, kind) {
  els.eraseResult.textContent = text;
  els.eraseResult.className = 'result' + (kind ? ' ' + kind : '');
  els.eraseResult.hidden = false;
}

loadSite();
loadPassport();
