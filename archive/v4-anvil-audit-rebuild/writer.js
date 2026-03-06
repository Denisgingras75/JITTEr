/**
 * ANVIL Writer Script
 * Full-screen writing environment with biometric tracking
 */

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const elements = {
  editor: document.getElementById('editor'),
  purity: document.getElementById('purity'),
  humanChars: document.getElementById('humanChars'),
  alienChars: document.getElementById('alienChars'),
  jitter: document.getElementById('jitter'),
  wordCount: document.getElementById('wordCount'),
  toolbarWordCount: document.getElementById('toolbarWordCount'),
  jitterGraph: document.getElementById('jitterGraph'),
  generateBadgeBtn: document.getElementById('generateBadgeBtn'),
  exportBtn: document.getElementById('exportBtn'),
  resetBtn: document.getElementById('resetBtn')
};

// ============================================================================
// STATE
// ============================================================================

class WriterState {
  constructor() {
    this.humanChars = 0;
    this.alienChars = 0;
    this.lastKeyTime = null;
    this.flightTimes = [];
    this.sessionStart = Date.now();
    this.chordStartTime = null;
    this.jitterBars = [];
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
    this.jitterBars = [];
    elements.jitterGraph.innerHTML = '';
    updateUI();
  }
}

const state = new WriterState();

// ============================================================================
// CHORD DETECTION
// ============================================================================

class ChordDetector {
  constructor() {
    this.modifierDownTime = null;
  }

  onModifierDown(event) {
    if (event.ctrlKey || event.metaKey) {
      this.modifierDownTime = performance.now();
    }
  }

  onKeyDown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
      if (this.modifierDownTime) {
        const latency = performance.now() - this.modifierDownTime;

        if (latency < 10) {
          showRoboticAlert(latency);
          return { isRobotic: true, latency };
        }

        return { isRobotic: false, latency };
      }
    }
    return null;
  }

  onModifierUp() {
    this.modifierDownTime = null;
  }
}

const chordDetector = new ChordDetector();

// ============================================================================
// EVENT LISTENERS
// ============================================================================

// Keydown - Track human input
elements.editor.addEventListener('keydown', (event) => {
  // Track modifiers
  if (event.ctrlKey || event.metaKey) {
    chordDetector.onModifierDown(event);
  }

  // Check chord
  const chordResult = chordDetector.onKeyDown(event);
  if (chordResult) {
    return;
  }

  // Track typing (exclude modifier-only keys and special keys)
  if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
    const now = performance.now();

    if (state.lastKeyTime) {
      const flightTime = now - state.lastKeyTime;
      state.flightTimes.push(flightTime);

      // Update jitter graph
      updateJitterGraph(flightTime);

      if (state.flightTimes.length > 100) {
        state.flightTimes.shift();
      }
    }

    state.lastKeyTime = now;
    state.humanChars++;

    // Update UI
    requestAnimationFrame(updateUI);
  }
});

// Keyup - Reset chord detector
elements.editor.addEventListener('keyup', (event) => {
  if (event.key === 'Control' || event.key === 'Meta') {
    chordDetector.onModifierUp();
  }
});

// Paste - Track alien input
elements.editor.addEventListener('paste', (event) => {
  try {
    const pastedText = event.clipboardData?.getData('text') || '';
    const charCount = pastedText.length;

    if (charCount > 0) {
      state.alienChars += charCount;
      console.log('[Anvil Writer] Paste:', charCount, 'chars');

      requestAnimationFrame(updateUI);
    }
  } catch (error) {
    console.warn('[Anvil Writer] Paste error:', error);
  }
});

// Input - Update word count
elements.editor.addEventListener('input', () => {
  updateWordCount();
});

// ============================================================================
// UI UPDATES
// ============================================================================

function updateUI() {
  elements.purity.textContent = state.calculatePurity() + '%';
  elements.humanChars.textContent = formatNumber(state.humanChars);
  elements.alienChars.textContent = formatNumber(state.alienChars);
  elements.jitter.textContent = state.calculateJitter();
}

function updateWordCount() {
  const text = elements.editor.innerText.trim();
  const words = text.length > 0 ? text.split(/\s+/).length : 0;

  elements.wordCount.textContent = formatNumber(words);
  elements.toolbarWordCount.textContent = words + ' word' + (words === 1 ? '' : 's');
}

function updateJitterGraph(flightTime) {
  const bar = document.createElement('div');
  bar.className = 'jitter-bar';

  // Normalize height (cap at 500ms)
  const normalizedHeight = Math.min(flightTime, 500) / 500 * 44; // 44px max height
  bar.style.height = normalizedHeight + 'px';
  bar.style.left = (state.jitterBars.length * 4) + 'px';

  elements.jitterGraph.appendChild(bar);
  state.jitterBars.push(bar);

  // Keep only last 60 bars
  if (state.jitterBars.length > 60) {
    const removed = state.jitterBars.shift();
    removed.remove();

    // Re-position remaining bars
    state.jitterBars.forEach((bar, index) => {
      bar.style.left = (index * 4) + 'px';
    });
  }
}

// ============================================================================
// ALERTS
// ============================================================================

function showRoboticAlert(latency) {
  const alert = document.createElement('div');
  alert.className = 'alert robotic';
  alert.textContent = `⚠️ ROBOTIC PASTE DETECTED: ${latency.toFixed(2)}ms latency`;

  document.body.appendChild(alert);

  setTimeout(() => {
    alert.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => alert.remove(), 300);
  }, 3000);
}

// ============================================================================
// BADGE GENERATION
// ============================================================================

elements.generateBadgeBtn.addEventListener('click', async () => {
  const badgeData = {
    humanChars: state.humanChars,
    alienChars: state.alienChars,
    purity: state.calculatePurity(),
    jitter: state.calculateJitter(),
    timestamp: Date.now(),
    url: 'anvil-writer',
    sessionDuration: Date.now() - state.sessionStart,
    wordCount: elements.editor.innerText.trim().split(/\s+/).length
  };

  const encoded = btoa(JSON.stringify(badgeData));
  const badgeHtml = generateBadgeHtml(encoded, badgeData);

  try {
    await navigator.clipboard.writeText(badgeHtml);

    elements.generateBadgeBtn.textContent = '✓ Badge Copied!';
    elements.generateBadgeBtn.style.background = 'rgba(34, 197, 94, 0.8)';

    setTimeout(() => {
      elements.generateBadgeBtn.textContent = 'Generate Smart Badge';
      elements.generateBadgeBtn.style.background = '';
    }, 2000);
  } catch (error) {
    console.error('[Anvil Writer] Failed to copy badge:', error);
    alert('Failed to copy badge to clipboard.');
  }
});

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
    <span>✓ ${data.purity}% Human (${formatNumber(data.wordCount)} words)</span>
  </a>`;
}

// ============================================================================
// EXPORT
// ============================================================================

elements.exportBtn.addEventListener('click', () => {
  const text = elements.editor.innerText;
  const metadata = `
---
ANVIL Human Verification Certificate
Generated: ${new Date().toISOString()}
Purity: ${state.calculatePurity()}%
Human Characters: ${state.humanChars}
Alien Characters: ${state.alienChars}
Biometric Jitter: ${state.calculateJitter()}ms
Session Duration: ${formatDuration(Date.now() - state.sessionStart)}
---

${text}
`;

  const blob = new Blob([metadata], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `anvil-export-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);

  elements.exportBtn.textContent = '✓ Exported!';
  setTimeout(() => {
    elements.exportBtn.textContent = 'Export Text';
  }, 2000);
});

// ============================================================================
// RESET (HOLD 2 SECONDS)
// ============================================================================

let resetHoldTimer = null;

elements.resetBtn.addEventListener('mousedown', () => {
  elements.resetBtn.classList.add('holding');
  elements.resetBtn.textContent = 'Hold... 2s';

  resetHoldTimer = setTimeout(() => {
    if (confirm('Are you sure you want to reset all stats? This cannot be undone.')) {
      state.reset();
      elements.resetBtn.textContent = '✓ Reset Complete';
    } else {
      elements.resetBtn.textContent = 'Hold to Reset (2s)';
    }

    elements.resetBtn.classList.remove('holding');

    setTimeout(() => {
      elements.resetBtn.textContent = 'Hold to Reset (2s)';
    }, 2000);
  }, 2000);
});

elements.resetBtn.addEventListener('mouseup', () => {
  clearTimeout(resetHoldTimer);
  elements.resetBtn.classList.remove('holding');
  elements.resetBtn.textContent = 'Hold to Reset (2s)';
});

elements.resetBtn.addEventListener('mouseleave', () => {
  clearTimeout(resetHoldTimer);
  elements.resetBtn.classList.remove('holding');
  elements.resetBtn.textContent = 'Hold to Reset (2s)';
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return hours + 'h ' + (minutes % 60) + 'm';
  } else if (minutes > 0) {
    return minutes + 'm';
  } else {
    return seconds + 's';
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

(function init() {
  console.log('[Anvil Writer] Initialized');
  elements.editor.focus();
})();
