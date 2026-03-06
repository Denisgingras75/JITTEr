// background.js - Service Worker for Anvil Protocol

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'writer.html' });
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openWriter') {
    chrome.tabs.create({ url: 'writer.html' });
  }
});
