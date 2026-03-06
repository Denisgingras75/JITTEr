// background.js - JITTER PROTOCOL
// NUCLEAR PATH FINDING

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
  // THE FIX: Force Absolute Path Resolution
  const writerUrl = chrome.runtime.getURL('writer.html');
  
  console.log("Attempting to launch:", writerUrl);

  chrome.windows.create({
    url: writerUrl, 
    type: 'popup',
    state: 'maximized'
  });
}