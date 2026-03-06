// background.js - Service Worker for Anvil Protocol

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'writer.html' });
});
