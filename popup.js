/**
 * popup.js - JITTEr Popup Interface
 */

// Load data on open
document.addEventListener('DOMContentLoaded', async () => {
    // Load passport
    loadPassport();

    // Get current session stats from active tab
    updateCurrentSession();

    // Poll for updates every second
    setInterval(updateCurrentSession, 1000);

    // Button handlers
    document.getElementById('btn-sign').addEventListener('click', handleSignArticle);
    document.getElementById('btn-toggle').addEventListener('click', handleToggleTracking);
    document.getElementById('link-portfolio').addEventListener('click', (e) => {
        e.preventDefault();
        alert('Portfolio page coming soon!');
    });
    document.getElementById('link-help').addEventListener('click', (e) => {
        e.preventDefault();
        alert('Help: JITTEr tracks your typing to prove your work is human-written.\n\n1. Write anywhere (Medium, Google Docs, etc.)\n2. Click "Sign This Article" when done\n3. Paste badge into your article');
    });

    // Listen for badge creation results
    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === 'badgeCreated') {
            showBadge(request.badge);
        } else if (request.action === 'badgeError') {
            showError(request.error);
        } else if (request.action === 'sessionUpdate') {
            updateSessionUI(request.session, request.biometrics);
        }
    });
});

// Update current session (called on load + every 1s)
async function updateCurrentSession() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
            chrome.tabs.sendMessage(tab.id, { action: 'getSessionStats' }, (response) => {
                if (chrome.runtime.lastError) {
                    // Content script not loaded on this page
                    return;
                }
                if (response) {
                    updateSessionUI(response.session, response.biometrics);
                }
            });
        }
    } catch (error) {
        // Silently fail if can't query tabs
    }
}


// Load passport data
async function loadPassport() {
    chrome.storage.local.get(['passport'], (result) => {
        const passport = result.passport;
        if (passport) {
            document.getElementById('passport-level').textContent = passport.level || 'Novice';
            document.getElementById('passport-keystrokes').textContent = formatNumber(passport.totalKeystrokes || 0);
            document.getElementById('passport-age').textContent = `${passport.accountAgeDays || 0} days`;
            document.getElementById('passport-sessions').textContent = passport.sessionsCompleted || 0;
        }
    });
}

// Update session UI
function updateSessionUI(session, biometrics) {
    if (!session) return;

    if (session.isActive && session.keystrokes > 0) {
        // Show active session
        document.getElementById('session-inactive').style.display = 'none';
        document.getElementById('session-active').style.display = 'block';

        // Update stats
        const duration = Math.floor((Date.now() - session.startTime) / 1000 / 60);
        document.getElementById('session-duration').textContent = `${duration}m`;
        document.getElementById('session-keystrokes').textContent = session.keystrokes;

        if (biometrics && biometrics.cognitiveRatio) {
// Handle sign article
async function handleSignArticle() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab || !tab.id) {
            showError('No active tab found');
            return;
        }

        // Show loading state
        const btn = document.getElementById('btn-sign');
        btn.textContent = 'Generating...';
        btn.disabled = true;

        // Request badge creation from content script
        chrome.tabs.sendMessage(tab.id, { action: 'signArticle' }, (response) => {
            if (chrome.runtime.lastError) {
                showError('Please reload the page and try again.');
                btn.textContent = '✍️ Sign This Article';
                btn.disabled = false;
                return;
            }

            if (!response || !response.success) {
                showError('Failed to sign article. Make sure you typed at least 100 characters.');
                btn.textContent = '✍️ Sign This Article';
                btn.disabled = false;
                return;
            }

            // Badge creation initiated, waiting for 'badgeCreated' message
        });
    } catch (error) {
        console.error('Sign article error:', error);
        showError('An error occurred. Please try again.');
    }
}

// Show error message
function showError(message) {
    alert(`❌ ${message}`);
    const btn = document.getElementById('btn-sign');
    if (btn) {
        btn.textContent = '✍️ Sign This Article';
        btn.disabled = false;
    }
}

            chrome.runtime.onMessage.addListener(function badgeListener(request) {
                if (request.action === 'badgeCreated') {
                    // Show badge to user
                    showBadge(request.badge);
                    chrome.runtime.onMessage.removeListener(badgeListener);
                }
            });

            // Show loading state
            const btn = document.getElementById('btn-sign');
            btn.textContent = 'Generating...';
            btn.disabled = true;
        }
    });
}

// Show generated badge
function showBadge(badge) {
    // Encode badge as base64
    const badgeBase64 = btoa(JSON.stringify(badge));

    // Create HTML embed code
    const embedCode = generateEmbedCode(badge, badgeBase64);

    // Copy to clipboard
    navigator.clipboard.writeText(embedCode).then(() => {
        // Show success
        const btn = document.getElementById('btn-sign');
        btn.textContent = '✓ Copied to Clipboard!';
        setTimeout(() => {
            btn.textContent = '✍️ Sign This Article';
            btn.disabled = false;
        }, 2000);

        // Show preview
        showBadgePreview(badge);
    });
}

// Generate embed code
function generateEmbedCode(badge, badgeBase64) {
    const blockId = badge.blockId;
    const verifyUrl = `https://verify.jitter.com/${badge.contentHash.substring(0, 12)}`;

    return `<!-- JITTEr Human Verification Badge -->
<div class="jitter-verified-badge" data-jitter-id="${blockId}">
  <div style="font-family:monospace;border:1px solid #00F0FF;border-radius:4px;padding:12px;background:#050505;color:#fff;display:inline-block;margin:20px 0;">
    <div style="color:#00F0FF;font-weight:bold;margin-bottom:8px;font-size:13px;">
      ✍️ HUMAN-WRITTEN VERIFIED
    </div>
    <div style="font-size:11px;color:#aaa;line-height:1.6;">
      <div><strong style="color:#fff">${badge.title || 'Article'}</strong></div>
      <div style="margin-top:6px;">Written: ${formatDuration(badge.session.duration)} • ${formatNumber(badge.session.keystrokes)} keystrokes</div>
      <div>Passport: <span style="color:#FFD700">${badge.passport.level}</span> • ${formatNumber(badge.passport.totalKeystrokes)} lifetime</div>
      <div style="margin-top:8px;">
        <a href="${verifyUrl}" style="color:#00F0FF;text-decoration:none;" target="_blank">
          🔐 Verify this article →
        </a>
      </div>
    </div>
  </div>
</div>`;
}

// Show badge preview
function showBadgePreview(badge) {
    // TODO: Show modal with badge preview
    alert(`Badge Created!\n\nBlock ID: ${badge.blockId}\nKeystrokes: ${badge.session.keystrokes}\nLevel: ${badge.passport.level}\n\nHTML code copied to clipboard.\nPaste it into your article!`);
}

// Handle toggle tracking
function handleToggleTracking() {
    // TODO: Implement tracking toggle
    alert('Tracking toggle coming soon!\n\nCurrently tracking is always on when you type in text editors.');
}

// Format number (e.g., 1234567 → 1.2M)
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

// Format duration (seconds → "3.2 hours")
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}h ${mins}m`;
    } else if (mins > 0) {
        return `${mins}m`;
    } else {
        return `${seconds}s`;
    }
}
