/**
 * background.js - JITTER PROTOCOL (Tab Mode)
 *
 * Copyright (c) 2025-2026 Denis Gingras. All Rights Reserved.
 *
 * PROPRIETARY AND CONFIDENTIAL
 * Unauthorized copying, modification, or use is strictly prohibited.
 * See LICENSE file for full terms.
 */

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
});

function openWriter() {
  // FALLBACK: Open as a TAB instead of a Window (Harder to block)
  const writerUrl = chrome.runtime.getURL('writer.html');
  chrome.tabs.create({
    url: writerUrl
  });
}