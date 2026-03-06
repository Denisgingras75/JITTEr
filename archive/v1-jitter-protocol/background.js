// background.js - JITTER PROTOCOL (Tab Mode)

chrome.runtime.onInstalled.addListener(() => {
  console.log("Jitter Protocol Installed");
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
  console.log("Opening tab:", writerUrl);
  
  chrome.tabs.create({
    url: writerUrl
  });
}