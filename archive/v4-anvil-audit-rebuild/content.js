/**
 * ANVIL Content Script - State Management Bridge
 * Tracks human vs alien input with biometric chord detection
 */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

class AnvilState {
  constructor() {
    this.projectMode = false;
    this.currentUrl = window.location.href;
    this.humanChars = 0;
    this.alienChars = 0;
    this.lastKeyTime = null;
    this.chordStartTime = null; // Tracks Ctrl/Cmd press time
    this.isModifierPressed = false;
    this.flightTimes = []; // Array of keystroke intervals for jitter calculation
    this.sessionStart = Date.now();
    this.projectData = {}; // Per-URL project data
    this.saveDebounceTimer = null;
    this.SAVE_DEBOUNCE_MS = 500;
  }

  // Load state from chrome.storage
  async load() {
    try {
      const result = await chrome.storage.local.get(['anvilState']);
      if (result.anvilState) {
        Object.assign(this, result.anvilState);
      }
    } catch (error) {
      console.error('[Anvil] Failed to load state:', error);
    }
  }

  // Debounced save to chrome.storage
  save() {
    clearTimeout(this.saveDebounceTimer);
    this.saveDebounceTimer = setTimeout(() => {
      this._saveImmediate();
    }, this.SAVE_DEBOUNCE_MS);
  }

  async _saveImmediate() {
    try {
      await chrome.storage.local.set({ anvilState: this.toJSON() });
    } catch (error) {
      console.error('[Anvil] Failed to save state:', error);
    }
  }

  toJSON() {
    return {
      projectMode: this.projectMode,
      currentUrl: this.currentUrl,
      humanChars: this.humanChars,
      alienChars: this.alienChars,
      flightTimes: this.flightTimes.slice(-100), // Keep last 100 for performance
      sessionStart: this.sessionStart,
      projectData: this.projectData
    };
  }

  calculatePurity() {
    const total = this.humanChars + this.alienChars;
    if (total === 0) return 100;
    return ((this.humanChars / total) * 100).toFixed(2);
  }

  calculateJitter() {
    if (this.flightTimes.length < 2) return 0;

    const mean = this.flightTimes.reduce((a, b) => a + b, 0) / this.flightTimes.length;
    const variance = this.flightTimes.reduce((sum, time) => {
      return sum + Math.pow(time - mean, 2);
    }, 0) / this.flightTimes.length;

    return Math.sqrt(variance).toFixed(2);
  }

  reset() {
    this.humanChars = 0;
    this.alienChars = 0;
    this.flightTimes = [];
    this.sessionStart = Date.now();
    this.lastKeyTime = null;
    this.save();
  }
}

// ============================================================================
// GLOBAL STATE INSTANCE
// ============================================================================

const state = new AnvilState();

// ============================================================================
// CHORD DETECTION SYSTEM
// ============================================================================

class ChordDetector {
  constructor() {
    this.modifierDownTime = null;
    this.isPasteChord = false;
  }

  onModifierDown(event) {
    if (event.ctrlKey || event.metaKey) {
      this.modifierDownTime = performance.now();
    }
  }

  onKeyDown(event) {
    // Check for paste chord (Ctrl/Cmd + V)
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
      if (this.modifierDownTime) {
        const latency = performance.now() - this.modifierDownTime;

        // Flag as scripted/robotic if latency < 10ms
        if (latency < 10) {
          console.warn('[Anvil] ROBOTIC PASTE DETECTED: Latency', latency.toFixed(2), 'ms');
          this.isPasteChord = true;
          return { isRobotic: true, latency };
        }

        this.isPasteChord = true;
        return { isRobotic: false, latency };
      }
    }

    return null;
  }

  onModifierUp() {
    this.modifierDownTime = null;
  }

  reset() {
    this.isPasteChord = false;
  }
}

const chordDetector = new ChordDetector();

// ============================================================================
// EVENT LISTENERS
// ============================================================================

// Keydown handler - Track human input and chord detection
document.addEventListener('keydown', (event) => {
  if (!state.projectMode) return;

  // Track modifier keys for chord detection
  if (event.ctrlKey || event.metaKey) {
    chordDetector.onModifierDown(event);
  }

  // Check for paste chord
  const chordResult = chordDetector.onKeyDown(event);
  if (chordResult) {
    // Paste chord detected - will be handled by paste event
    return;
  }

  // Track typing (exclude modifier-only keys)
  if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
    const now = performance.now();

    // Calculate flight time (time between keystrokes)
    if (state.lastKeyTime) {
      const flightTime = now - state.lastKeyTime;
      state.flightTimes.push(flightTime);

      // Keep only last 100 flight times for performance
      if (state.flightTimes.length > 100) {
        state.flightTimes.shift();
      }
    }

    state.lastKeyTime = now;
    state.humanChars++;
    state.save();

    // Notify background script
    notifyStatsUpdate();
  }
}, true);

// Keyup handler - Reset chord detector
document.addEventListener('keyup', (event) => {
  if (event.key === 'Control' || event.key === 'Meta') {
    chordDetector.onModifierUp();
  }
}, true);

// Paste handler - Track alien input
document.addEventListener('paste', (event) => {
  if (!state.projectMode) return;

  try {
    const pastedText = event.clipboardData?.getData('text') || '';
    const charCount = pastedText.length;

    if (charCount > 0) {
      state.alienChars += charCount;
      state.save();

      console.log('[Anvil] Paste detected:', charCount, 'chars');
      notifyStatsUpdate();
    }

    chordDetector.reset();
  } catch (error) {
    // Handle restricted sites (USPTO, etc.) gracefully
    console.warn('[Anvil] Paste event restricted:', error.message);
  }
}, true);

// Mutation observer for detecting non-paste alien input
const mutationObserver = new MutationObserver((mutations) => {
  if (!state.projectMode) return;

  // Only track mutations that weren't triggered by keyboard or paste
  if (state.lastKeyTime && (performance.now() - state.lastKeyTime) < 100) {
    return; // Recent keyboard activity, ignore
  }

  mutations.forEach(mutation => {
    if (mutation.type === 'characterData' || mutation.type === 'childList') {
      // Estimate alien chars from mutation (heuristic)
      const addedNodes = Array.from(mutation.addedNodes);
      const textLength = addedNodes.reduce((sum, node) => {
        return sum + (node.textContent?.length || 0);
      }, 0);

      if (textLength > 5) { // Threshold to avoid noise
        state.alienChars += textLength;
        state.save();
        console.log('[Anvil] Mutation detected:', textLength, 'chars');
        notifyStatsUpdate();
      }
    }
  });
});

// ============================================================================
// BADGE DETECTION SYSTEM
// ============================================================================

class BadgeDetector {
  constructor() {
    this.foundBadges = [];
  }

  scan() {
    // Look for links with anvil hash signatures
    const links = document.querySelectorAll('a[href*="#anvil:"]');

    this.foundBadges = Array.from(links).map(link => {
      const hash = link.href.split('#anvil:')[1];
      return {
        element: link,
        hash: hash,
        decoded: this.decodeHash(hash)
      };
    });

    if (this.foundBadges.length > 0) {
      console.log('[Anvil] Found', this.foundBadges.length, 'smart badges');
      this.notifyBackground();
    }

    return this.foundBadges;
  }

  decodeHash(hash) {
    try {
      const decoded = atob(hash);
      return JSON.parse(decoded);
    } catch (error) {
      console.error('[Anvil] Failed to decode badge:', error);
      return null;
    }
  }

  notifyBackground() {
    chrome.runtime.sendMessage({
      type: 'BADGES_DETECTED',
      count: this.foundBadges.length,
      badges: this.foundBadges.map(b => ({ hash: b.hash, decoded: b.decoded }))
    });
  }

  attachClickListeners() {
    this.foundBadges.forEach(badge => {
      badge.element.addEventListener('click', (event) => {
        event.preventDefault();
        chrome.runtime.sendMessage({
          type: 'OPEN_VERIFIER',
          badgeData: badge.decoded
        });
      });
    });
  }
}

const badgeDetector = new BadgeDetector();

// Scan for badges on page load and DOM changes
window.addEventListener('load', () => {
  badgeDetector.scan();
  badgeDetector.attachClickListeners();
});

// Re-scan on DOM changes (debounced)
let badgeScanTimer = null;
const badgeScanObserver = new MutationObserver(() => {
  clearTimeout(badgeScanTimer);
  badgeScanTimer = setTimeout(() => {
    badgeDetector.scan();
    badgeDetector.attachClickListeners();
  }, 1000);
});

badgeScanObserver.observe(document.body, {
  childList: true,
  subtree: true
});

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'TOGGLE_PROJECT_MODE':
      state.projectMode = message.enabled;

      if (state.projectMode) {
        // Start observing mutations
        mutationObserver.observe(document.body, {
          characterData: true,
          childList: true,
          subtree: true
        });
        console.log('[Anvil] Project mode ENABLED');
      } else {
        mutationObserver.disconnect();
        console.log('[Anvil] Project mode DISABLED');
      }

      state.save();
      sendResponse({ success: true });
      break;

    case 'GET_STATS':
      sendResponse({
        humanChars: state.humanChars,
        alienChars: state.alienChars,
        purity: state.calculatePurity(),
        jitter: state.calculateJitter(),
        projectMode: state.projectMode,
        sessionStart: state.sessionStart
      });
      break;

    case 'RESET_STATS':
      state.reset();
      sendResponse({ success: true });
      break;

    case 'SCAN_BADGES':
      const badges = badgeDetector.scan();
      sendResponse({ badges });
      break;

    default:
      sendResponse({ error: 'Unknown message type' });
  }

  return true; // Keep message channel open for async responses
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function notifyStatsUpdate() {
  chrome.runtime.sendMessage({
    type: 'STATS_UPDATE',
    stats: {
      humanChars: state.humanChars,
      alienChars: state.alienChars,
      purity: state.calculatePurity(),
      jitter: state.calculateJitter()
    }
  });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

(async function init() {
  await state.load();
  console.log('[Anvil] Content script initialized');

  // Initial badge scan
  if (document.readyState === 'complete') {
    badgeDetector.scan();
    badgeDetector.attachClickListeners();
  }
})();
