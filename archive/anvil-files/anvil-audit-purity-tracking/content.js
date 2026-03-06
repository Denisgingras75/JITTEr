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
// FLOATING WIDGET UI
// ============================================================================

class FloatingWidget {
  constructor() {
    this.container = null;
    this.isMinimized = false;
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
  }

  create() {
    // Create widget container
    this.container = document.createElement('div');
    this.container.id = 'anvil-widget';
    this.container.innerHTML = `
      <style>
        #anvil-widget {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-radius: 16px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          z-index: 2147483647;
          min-width: 280px;
          backdrop-filter: blur(10px);
          transition: all 0.3s ease;
          cursor: move;
        }

        #anvil-widget.minimized {
          min-width: 60px;
          cursor: pointer;
        }

        #anvil-widget.minimized .widget-body,
        #anvil-widget.minimized .widget-controls {
          display: none;
        }

        .widget-header {
          padding: 12px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255,255,255,0.2);
          cursor: move;
        }

        #anvil-widget.minimized .widget-header {
          border: none;
          padding: 16px;
          justify-content: center;
        }

        .widget-title {
          font-weight: 700;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        #anvil-widget.minimized .widget-title-text {
          display: none;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ef4444;
          animation: pulse-dot 2s infinite;
        }

        .status-dot.active {
          background: #22c55e;
        }

        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .widget-minimize {
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          width: 24px;
          height: 24px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }

        .widget-minimize:hover {
          background: rgba(255,255,255,0.3);
        }

        .widget-body {
          padding: 16px;
        }

        .purity-display {
          text-align: center;
          margin-bottom: 16px;
        }

        .purity-label {
          font-size: 10px;
          text-transform: uppercase;
          opacity: 0.8;
          margin-bottom: 4px;
        }

        .purity-value {
          font-size: 36px;
          font-weight: 700;
          background: linear-gradient(90deg, #fff, #ffd700);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .stats-row {
          display: flex;
          gap: 12px;
          margin-bottom: 12px;
        }

        .stat-box {
          flex: 1;
          background: rgba(255,255,255,0.15);
          padding: 8px;
          border-radius: 8px;
          text-align: center;
        }

        .stat-label {
          font-size: 9px;
          text-transform: uppercase;
          opacity: 0.8;
          margin-bottom: 4px;
        }

        .stat-value {
          font-size: 18px;
          font-weight: 700;
        }

        .widget-controls {
          padding: 12px 16px;
          border-top: 1px solid rgba(255,255,255,0.2);
          display: flex;
          gap: 8px;
        }

        .widget-btn {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid rgba(255,255,255,0.3);
          background: rgba(255,255,255,0.2);
          color: white;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .widget-btn:hover {
          background: rgba(255,255,255,0.3);
          transform: translateY(-1px);
        }

        .widget-btn.active {
          background: rgba(34, 197, 94, 0.4);
          border-color: #22c55e;
        }

        .widget-btn.danger {
          background: rgba(239, 68, 68, 0.3);
        }

        .widget-btn.danger:hover {
          background: rgba(239, 68, 68, 0.5);
        }
      </style>

      <div class="widget-header">
        <div class="widget-title">
          <span class="status-dot" id="anvil-status-dot"></span>
          <span class="widget-title-text">⚒️ ANVIL</span>
        </div>
        <button class="widget-minimize" id="anvil-minimize">−</button>
      </div>

      <div class="widget-body">
        <div class="purity-display">
          <div class="purity-label">Purity Score</div>
          <div class="purity-value" id="anvil-purity">100%</div>
        </div>

        <div class="stats-row">
          <div class="stat-box">
            <div class="stat-label">Human</div>
            <div class="stat-value" id="anvil-human">0</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Alien</div>
            <div class="stat-value" id="anvil-alien">0</div>
          </div>
        </div>

        <div class="stats-row">
          <div class="stat-box">
            <div class="stat-label">Jitter</div>
            <div class="stat-value" id="anvil-jitter">0</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Time</div>
            <div class="stat-value" id="anvil-time">0s</div>
          </div>
        </div>
      </div>

      <div class="widget-controls">
        <button class="widget-btn" id="anvil-toggle">Start Tracking</button>
        <button class="widget-btn" id="anvil-writer">Writer</button>
      </div>
    `;

    document.body.appendChild(this.container);
    this.attachEventListeners();
    this.startUpdateLoop();
  }

  attachEventListeners() {
    // Minimize/maximize
    const minimizeBtn = this.container.querySelector('#anvil-minimize');
    minimizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMinimize();
    });

    // Click to maximize when minimized
    this.container.addEventListener('click', () => {
      if (this.isMinimized) {
        this.toggleMinimize();
      }
    });

    // Toggle tracking
    const toggleBtn = this.container.querySelector('#anvil-toggle');
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleTracking();
    });

    // Open writer
    const writerBtn = this.container.querySelector('#anvil-writer');
    writerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: 'OPEN_WRITER' });
    });

    // Dragging
    const header = this.container.querySelector('.widget-header');
    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('#anvil-minimize')) return;
      this.startDrag(e);
    });

    document.addEventListener('mousemove', (e) => this.drag(e));
    document.addEventListener('mouseup', () => this.stopDrag());
  }

  toggleMinimize() {
    this.isMinimized = !this.isMinimized;
    this.container.classList.toggle('minimized', this.isMinimized);
    const btn = this.container.querySelector('#anvil-minimize');
    btn.textContent = this.isMinimized ? '+' : '−';
  }

  toggleTracking() {
    state.projectMode = !state.projectMode;

    if (state.projectMode) {
      mutationObserver.observe(document.body, {
        characterData: true,
        childList: true,
        subtree: true
      });
    } else {
      mutationObserver.disconnect();
    }

    state.save();
    this.updateUI();
  }

  startDrag(e) {
    this.isDragging = true;
    const rect = this.container.getBoundingClientRect();
    this.dragOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    this.container.style.cursor = 'grabbing';
  }

  drag(e) {
    if (!this.isDragging) return;

    const x = e.clientX - this.dragOffset.x;
    const y = e.clientY - this.dragOffset.y;

    // Keep widget on screen
    const maxX = window.innerWidth - this.container.offsetWidth;
    const maxY = window.innerHeight - this.container.offsetHeight;

    this.container.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
    this.container.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
    this.container.style.right = 'auto';
    this.container.style.bottom = 'auto';
  }

  stopDrag() {
    this.isDragging = false;
    this.container.style.cursor = 'move';
  }

  updateUI() {
    const purity = this.container.querySelector('#anvil-purity');
    const human = this.container.querySelector('#anvil-human');
    const alien = this.container.querySelector('#anvil-alien');
    const jitter = this.container.querySelector('#anvil-jitter');
    const time = this.container.querySelector('#anvil-time');
    const statusDot = this.container.querySelector('#anvil-status-dot');
    const toggleBtn = this.container.querySelector('#anvil-toggle');

    purity.textContent = state.calculatePurity() + '%';
    human.textContent = this.formatNumber(state.humanChars);
    alien.textContent = this.formatNumber(state.alienChars);
    jitter.textContent = state.calculateJitter();

    const duration = Date.now() - state.sessionStart;
    time.textContent = this.formatDuration(duration);

    // Update status
    statusDot.classList.toggle('active', state.projectMode);
    toggleBtn.textContent = state.projectMode ? 'Stop Tracking' : 'Start Tracking';
    toggleBtn.classList.toggle('active', state.projectMode);
  }

  formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return hours + 'h';
    if (minutes > 0) return minutes + 'm';
    return seconds + 's';
  }

  startUpdateLoop() {
    setInterval(() => this.updateUI(), 1000);
  }
}

let widget = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

(async function init() {
  await state.load();
  console.log('[Anvil] Content script initialized');

  // Only create widget in top frame (not in iframes)
  if (window === window.top) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        widget = new FloatingWidget();
        widget.create();
      });
    } else {
      widget = new FloatingWidget();
      widget.create();
    }
  }

  // Initial badge scan
  if (document.readyState === 'complete') {
    badgeDetector.scan();
    badgeDetector.attachClickListeners();
  }
})();
