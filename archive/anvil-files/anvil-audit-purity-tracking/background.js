/**
 * ANVIL Background Service Worker
 * Manages extension icon state and message routing
 */

// ============================================================================
// ICON MANAGEMENT
// ============================================================================

const IconState = {
  DEFAULT: 'default',
  BADGE_DETECTED: 'badge'
};

let currentIconState = IconState.DEFAULT;
let badgeCache = new Map(); // tabId -> badges[]

async function updateIcon(tabId, state) {
  const colors = {
    [IconState.DEFAULT]: '#808080', // Gray
    [IconState.BADGE_DETECTED]: '#0066FF' // Blue
  };

  try {
    // Set badge background color (simpler than changing icon image)
    await chrome.action.setBadgeBackgroundColor({
      color: colors[state],
      tabId: tabId
    });

    // Set badge text if badges detected
    if (state === IconState.BADGE_DETECTED) {
      const badges = badgeCache.get(tabId) || [];
      await chrome.action.setBadgeText({
        text: badges.length > 0 ? badges.length.toString() : '',
        tabId: tabId
      });
    } else {
      await chrome.action.setBadgeText({
        text: '',
        tabId: tabId
      });
    }

    currentIconState = state;
  } catch (error) {
    console.error('[Anvil] Failed to update icon:', error);
  }
}

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  switch (message.type) {
    case 'BADGES_DETECTED':
      if (tabId) {
        badgeCache.set(tabId, message.badges);
        updateIcon(tabId, IconState.BADGE_DETECTED);
        console.log('[Anvil] Badges detected in tab', tabId, ':', message.count);
      }
      sendResponse({ success: true });
      break;

    case 'STATS_UPDATE':
      // Could broadcast to popup if open
      console.log('[Anvil] Stats update:', message.stats);
      sendResponse({ success: true });
      break;

    case 'OPEN_VERIFIER':
      // Open verifier in new tab or popup
      chrome.windows.create({
        url: chrome.runtime.getURL('verifier.html') + '#' + btoa(JSON.stringify(message.badgeData)),
        type: 'popup',
        width: 600,
        height: 800
      });
      sendResponse({ success: true });
      break;

    case 'OPEN_WRITER':
      // Open writer in new window
      chrome.windows.create({
        url: chrome.runtime.getURL('writer.html'),
        type: 'popup',
        width: 1200,
        height: 800
      });
      sendResponse({ success: true });
      break;

    case 'GENERATE_BADGE':
      const badgeData = {
        humanChars: message.humanChars,
        alienChars: message.alienChars,
        purity: message.purity,
        jitter: message.jitter,
        timestamp: Date.now(),
        url: message.url,
        sessionDuration: message.sessionDuration
      };

      const encoded = btoa(JSON.stringify(badgeData));
      const badgeHtml = generateBadgeHtml(encoded, badgeData);

      sendResponse({ success: true, html: badgeHtml, hash: encoded });
      break;

    default:
      sendResponse({ error: 'Unknown message type' });
  }

  return true; // Keep channel open for async
});

// ============================================================================
// TAB MANAGEMENT
// ============================================================================

// Clear badge cache when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  badgeCache.delete(tabId);
});

// Reset icon when tab is updated (navigated)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    badgeCache.delete(tabId);
    updateIcon(tabId, IconState.DEFAULT);
  }
});

// ============================================================================
// BADGE GENERATION
// ============================================================================

function generateBadgeHtml(hash, data) {
  return `<a href="#anvil:${hash}"
    class="anvil-badge"
    title="Human Verification Badge - Click to verify"
    style="display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 6px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 600; box-shadow: 0 2px 8px rgba(0,0,0,0.15); transition: transform 0.2s;"
    onmouseover="this.style.transform='translateY(-2px)'"
    onmouseout="this.style.transform='translateY(0)'">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
    </svg>
    <span>✓ ${data.purity}% Human</span>
  </a>`;
}

// ============================================================================
// INSTALLATION
// ============================================================================

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Anvil] Extension installed');

  // Initialize storage
  chrome.storage.local.set({
    anvilSettings: {
      projectMode: false,
      autoScan: true
    }
  });
});

console.log('[Anvil] Background service worker ready');
