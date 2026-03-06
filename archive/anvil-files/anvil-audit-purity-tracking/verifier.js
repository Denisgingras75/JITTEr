/**
 * ANVIL Verifier Script
 * Decodes and displays Certificate of Authenticity
 */

// ============================================================================
// DECODE BADGE DATA
// ============================================================================

function decodeBadgeHash() {
  const hash = window.location.hash.substring(1);

  if (!hash) {
    return null;
  }

  try {
    const decoded = atob(hash);
    return JSON.parse(decoded);
  } catch (error) {
    console.error('[Anvil Verifier] Failed to decode badge:', error);
    return null;
  }
}

// ============================================================================
// RENDER CERTIFICATE
// ============================================================================

function renderCertificate(data) {
  const body = document.getElementById('certificateBody');
  const hashDisplay = document.getElementById('hashDisplay');

  // Calculate assessment
  const purity = parseFloat(data.purity);
  let assessmentClass = 'low';
  let assessmentText = '⚠️ Low Human Content - Mostly AI/Pasted';

  if (purity >= 90) {
    assessmentClass = 'high';
    assessmentText = '✓ Highly Human - Excellent Authenticity';
  } else if (purity >= 70) {
    assessmentClass = 'medium';
    assessmentText = '~ Moderately Human - Some AI/Paste Content';
  }

  body.innerHTML = `
    <div class="purity-display">
      <div class="purity-label">Purity Score</div>
      <div class="purity-value">${data.purity}%</div>
      <div class="verification-status">
        <div class="checkmark">✓</div>
        <span>Verified Human Input</span>
      </div>
      <div class="assessment ${assessmentClass}">
        ${assessmentText}
      </div>
    </div>

    <div class="metrics-grid">
      <div class="metric">
        <div class="metric-label">Human Characters</div>
        <div class="metric-value">${formatNumber(data.humanChars)}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Alien Characters</div>
        <div class="metric-value">${formatNumber(data.alienChars)}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Biometric Jitter</div>
        <div class="metric-value">${data.jitter}ms</div>
      </div>
      <div class="metric">
        <div class="metric-label">Word Count</div>
        <div class="metric-value">${formatNumber(data.wordCount || 0)}</div>
      </div>
    </div>

    <div class="metadata">
      <div class="metadata-row">
        <span class="metadata-label">Certificate Generated</span>
        <span class="metadata-value">${new Date(data.timestamp).toLocaleString()}</span>
      </div>
      <div class="metadata-row">
        <span class="metadata-label">Session Duration</span>
        <span class="metadata-value">${formatDuration(data.sessionDuration || 0)}</span>
      </div>
      <div class="metadata-row">
        <span class="metadata-label">Source</span>
        <span class="metadata-value">${data.url || 'N/A'}</span>
      </div>
      <div class="metadata-row">
        <span class="metadata-label">Verification Method</span>
        <span class="metadata-value">Biometric Keystroke Analysis + Input Tracking</span>
      </div>
    </div>
  `;

  // Display hash
  hashDisplay.textContent = 'Hash: ' + window.location.hash.substring(1);
}

// ============================================================================
// ERROR DISPLAY
// ============================================================================

function showError(message) {
  const body = document.getElementById('certificateBody');
  body.innerHTML = `
    <div class="error-message">
      <h2>❌ Verification Failed</h2>
      <p>${message}</p>
    </div>
  `;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatNumber(num) {
  if (typeof num !== 'number') return '0';

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

(function init() {
  const badgeData = decodeBadgeHash();

  if (!badgeData) {
    showError('Invalid or missing badge data. The certificate hash may be corrupted.');
    return;
  }

  console.log('[Anvil Verifier] Badge data:', badgeData);
  renderCertificate(badgeData);
})();
