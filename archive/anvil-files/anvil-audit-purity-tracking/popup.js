/**
 * ANVIL Popup Script
 * Manages extension popup UI and controls
 */

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const elements = {
  purity: document.getElementById('purity'),
  humanChars: document.getElementById('humanChars'),
  alienChars: document.getElementById('alienChars'),
  jitter: document.getElementById('jitter'),
  sessionTime: document.getElementById('sessionTime'),
  sessionStart: document.getElementById('sessionStart'),
  statusIndicator: document.getElementById('statusIndicator'),
  projectToggle: document.getElementById('projectToggle'),
  resetBtn: document.getElementById('resetBtn'),
  generateBadgeBtn: document.getElementById('generateBadgeBtn'),
  openWriterBtn: document.getElementById('openWriterBtn')
};

// ============================================================================
// STATE
// ============================================================================

let currentStats = {
  humanChars: 0,
  alienChars: 0,
  purity: 100,
  jitter: 0,
  projectMode: false,
  sessionStart: Date.now()
};

let resetHoldTimer = null;
let resetHoldStartTime = null;

// ============================================================================
// STATS LOADING & UPDATE
// ============================================================================

async function loadStats() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATS' });

    if (response) {
      currentStats = response;
      updateUI();
    }
  } catch (error) {
    console.warn('[Anvil] Failed to load stats:', error);
  }
}

function updateUI() {
  // Update stats
  elements.purity.textContent = currentStats.purity + '%';
  elements.humanChars.textContent = formatNumber(currentStats.humanChars);
  elements.alienChars.textContent = formatNumber(currentStats.alienChars);
  elements.jitter.textContent = currentStats.jitter;

  // Update session time
  const sessionDuration = Date.now() - currentStats.sessionStart;
  elements.sessionTime.textContent = formatDuration(sessionDuration);
  elements.sessionStart.textContent = new Date(currentStats.sessionStart).toLocaleTimeString();

  // Update project mode toggle
  if (currentStats.projectMode) {
    elements.projectToggle.classList.add('active');
    elements.statusIndicator.style.background = '#4ade80'; // Green
  } else {
    elements.projectToggle.classList.remove('active');
    elements.statusIndicator.style.background = '#ef4444'; // Red
  }
}

// ============================================================================
// PROJECT MODE TOGGLE
// ============================================================================

elements.projectToggle.addEventListener('click', async () => {
  const newState = !currentStats.projectMode;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    await chrome.tabs.sendMessage(tab.id, {
      type: 'TOGGLE_PROJECT_MODE',
      enabled: newState
    });

    currentStats.projectMode = newState;
    updateUI();
  } catch (error) {
    console.error('[Anvil] Failed to toggle project mode:', error);
    alert('Failed to toggle project mode. Make sure you are on a valid web page.');
  }
});

// ============================================================================
// HOLD-TO-RESET MECHANIC (2 seconds)
// ============================================================================

elements.resetBtn.addEventListener('mousedown', () => {
  resetHoldStartTime = Date.now();

  elements.resetBtn.classList.add('holding');
  elements.resetBtn.textContent = 'Hold... 2s';

  resetHoldTimer = setTimeout(async () => {
    // Reset confirmed
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      await chrome.tabs.sendMessage(tab.id, { type: 'RESET_STATS' });

      currentStats.humanChars = 0;
      currentStats.alienChars = 0;
      currentStats.purity = 100;
      currentStats.jitter = 0;
      currentStats.sessionStart = Date.now();

      updateUI();

      elements.resetBtn.textContent = '✓ Reset Complete';
      setTimeout(() => {
        elements.resetBtn.textContent = 'Hold to Reset (2s)';
      }, 2000);
    } catch (error) {
      console.error('[Anvil] Failed to reset:', error);
      alert('Failed to reset stats.');
    }

    elements.resetBtn.classList.remove('holding');
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
// BADGE GENERATION
// ============================================================================

elements.generateBadgeBtn.addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const sessionDuration = Date.now() - currentStats.sessionStart;

    const response = await chrome.runtime.sendMessage({
      type: 'GENERATE_BADGE',
      humanChars: currentStats.humanChars,
      alienChars: currentStats.alienChars,
      purity: currentStats.purity,
      jitter: currentStats.jitter,
      url: tab.url,
      sessionDuration: sessionDuration
    });

    if (response.success) {
      // Copy HTML to clipboard
      await navigator.clipboard.writeText(response.html);

      elements.generateBadgeBtn.textContent = '✓ Badge Copied!';
      elements.generateBadgeBtn.style.background = 'rgba(34, 197, 94, 0.8)';

      setTimeout(() => {
        elements.generateBadgeBtn.textContent = 'Generate Smart Badge';
        elements.generateBadgeBtn.style.background = '';
      }, 2000);
    }
  } catch (error) {
    console.error('[Anvil] Failed to generate badge:', error);
    alert('Failed to generate badge.');
  }
});

// ============================================================================
// OPEN WRITER
// ============================================================================

elements.openWriterBtn.addEventListener('click', () => {
  chrome.windows.create({
    url: chrome.runtime.getURL('writer.html'),
    type: 'popup',
    width: 1200,
    height: 800
  });
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
    return minutes + 'm ' + (seconds % 60) + 's';
  } else {
    return seconds + 's';
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

(async function init() {
  await loadStats();

  // Auto-refresh stats every 2 seconds
  setInterval(loadStats, 2000);
})();
