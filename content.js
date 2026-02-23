/**
 * content.js - JITTEr Journalist Content Script
 * Tracks typing across ALL sites (Medium, Google Docs, Substack, etc.)
 *
 * Copyright (c) 2025-2026 Denis Gingras. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL
 */

// Don't run in iframes (avoid duplication)
if (window !== window.top) {
    // We're in an iframe, exit
} else {
    // Main initialization
    init();
}

function init() {
    console.log('🟢 JITTEr: Tracking initialized');

    // Initialize Loki biometric analyzer
    const loki = new LokiAnalyzer();

    // Session state
    let currentSession = {
        sessionId: generateId(),
        site: window.location.hostname,
        startTime: Date.now(),
        endTime: null,
        keystrokes: 0,
        backspaces: 0,
        pasteEvents: 0,
        pasteChars: 0,
        isActive: false,
        lastActivity: Date.now()
    };

    // Track which element user is typing in
    let activeEditor = null;

    // Detect text editors on page
    detectEditors();

    // Listen for focus events to track where user is typing
    document.addEventListener('focusin', (e) => {
        const el = e.target;

        // Check if it's a text input
        if (isTextEditor(el)) {
            activeEditor = el;
            if (!currentSession.isActive) {
                startSession();
            }
            updateIndicator(true);
        }
    }, true);

    // Listen for focusout to pause tracking
    document.addEventListener('focusout', (e) => {
        // Small delay to avoid flickering on quick refocus
        setTimeout(() => {
            if (!document.activeElement || !isTextEditor(document.activeElement)) {
                updateIndicator(false);
            }
        }, 100);
    }, true);

    // Track keystrokes
    document.addEventListener('keydown', (e) => {
        if (!currentSession.isActive || !activeEditor) return;

        // Process keystroke in Loki analyzer
        loki.processKeystroke(e.key, Date.now());

        // Update session stats
        if (e.key === 'Backspace' || e.key === 'Delete') {
            currentSession.backspaces++;
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            currentSession.keystrokes++;
        }

        currentSession.lastActivity = Date.now();

        // Debounced save
        saveSessionDebounced();

        // Update UI
        sendStatsToPopup();
    }, true);

    // Track paste events
    document.addEventListener('paste', (e) => {
        if (!currentSession.isActive || !activeEditor) return;

        const pastedText = (e.clipboardData || window.clipboardData).getData('text');
        currentSession.pasteEvents++;
        currentSession.pasteChars += pastedText.length;

        saveSessionDebounced();
        sendStatsToPopup();
    }, true);

    // Auto-save session every 10 seconds if active
    setInterval(() => {
        if (currentSession.isActive) {
            // If inactive for >5 minutes, end session
            const inactiveTime = Date.now() - currentSession.lastActivity;
            if (inactiveTime > 5 * 60 * 1000) {
                endSession();
            } else {
                saveSession();
            }
        }
    }, 10000);

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'getSessionStats') {
            sendResponse({
                session: currentSession,
                biometrics: loki.getStats(),
                contentHash: null // Will hash on demand when signing
            });
        } else if (request.action === 'signArticle') {
            handleSignArticle(loki);
            sendResponse({ success: true });
        } else if (request.action === 'getPageContent') {
            // Get content for hashing
            const content = getPageContent();
            sendResponse({ content });
        }
        return true;
    });

    // Helper functions

    function startSession() {
        currentSession.isActive = true;
        currentSession.startTime = Date.now();
        currentSession.lastActivity = Date.now();
        loki.reset();
        console.log('🟢 JITTEr: Session started');
        saveSession();
    }

    function endSession() {
        if (!currentSession.isActive) return;

        currentSession.isActive = false;
        currentSession.endTime = Date.now();
        console.log('⏸️ JITTEr: Session ended (inactive)');

        // Save final session
        saveSession();

        // Start new session (don't lose data if they resume typing)
        currentSession = {
            sessionId: generateId(),
            site: window.location.hostname,
            startTime: Date.now(),
            endTime: null,
            keystrokes: 0,
            backspaces: 0,
            pasteEvents: 0,
            pasteChars: 0,
            isActive: false,
            lastActivity: Date.now()
        };
    }

    function isTextEditor(el) {
        if (!el) return false;

        // Check for standard text inputs
        if (el.tagName === 'TEXTAREA') return true;
        if (el.tagName === 'INPUT' && ['text', 'email', 'search'].includes(el.type)) return true;

        // Check for contentEditable (Medium, Google Docs, etc.)
        if (el.isContentEditable) return true;

        // Check for specific editor classes (Medium, Substack, etc.)
        const editorClasses = ['editor', 'medium-editor', 'ProseMirror', 'ql-editor', 'CodeMirror'];
        if (editorClasses.some(cls => el.className && el.className.includes(cls))) {
            return true;
        }

        return false;
    }

    function detectEditors() {
        // Look for common editor elements on page
        const editors = document.querySelectorAll('[contenteditable="true"], textarea, .medium-editor, .ProseMirror');

        if (editors.length > 0) {
            console.log(`🟢 JITTEr: Found ${editors.length} text editor(s) on page`);
        }
    }

    function updateIndicator(active) {
        // Send state to background for badge update
        chrome.runtime.sendMessage({
            action: 'updateState',
            isTracking: active
        });
    }

    let saveDebounceTimer = null;
    function saveSessionDebounced() {
        clearTimeout(saveDebounceTimer);
        saveDebounceTimer = setTimeout(saveSession, 500);
    }

    function saveSession() {
        // Save to chrome.storage
        chrome.storage.local.get(['sessions'], (result) => {
            const sessions = result.sessions || [];

            // Update or add current session
            const existingIndex = sessions.findIndex(s => s.sessionId === currentSession.sessionId);
            if (existingIndex >= 0) {
                sessions[existingIndex] = { ...currentSession };
            } else {
                sessions.push({ ...currentSession });
            }

            // Keep last 100 sessions
            if (sessions.length > 100) {
                sessions.shift();
            }

            chrome.storage.local.set({ sessions });
        });
    }

    function sendStatsToPopup() {
        // Notify popup of stats update
        chrome.runtime.sendMessage({
            action: 'sessionUpdate',
            session: currentSession,
            biometrics: loki.getStats()
        });
    }

    async function handleSignArticle(loki) {
        // Get page content
        const content = getPageContent();
        const title = getPageTitle();

        // Get final session + biometric data
        const sessionData = {
            ...currentSession,
            duration: Date.now() - currentSession.startTime
        };

        const biometricData = loki.getStats();

        // Send to background for badge generation
        chrome.runtime.sendMessage({
            action: 'createBadge',
            data: {
                content,
                title,
                url: window.location.href,
                session: sessionData,
                biometrics: biometricData
            }
        }, (response) => {
            // Handle response from background
            if (chrome.runtime.lastError) {
                console.error('Badge creation failed:', chrome.runtime.lastError);
                chrome.runtime.sendMessage({
                    action: 'badgeError',
                    error: chrome.runtime.lastError.message
                });
                return;
            }

            if (response && response.badge) {
                // Forward badge to popup
                chrome.runtime.sendMessage({
                    action: 'badgeCreated',
                    badge: response.badge
                });
            } else {
                chrome.runtime.sendMessage({
                    action: 'badgeError',
                    error: 'Failed to create badge'
                });
            }
        });
    }

    function getPageContent() {
        // Try to get main article content
        let content = '';

        // Try common article selectors
        const articleSelectors = [
            'article',
            '[role="article"]',
            '.post-content',
            '.article-content',
            'main',
            activeEditor
        ];

        for (const selector of articleSelectors) {
            const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
            if (el) {
                content = el.innerText || el.textContent;
                if (content && content.length > 100) {
                    break;
                }
            }
        }

        // Fallback to body if nothing found
        if (!content || content.length < 100) {
            content = document.body.innerText;
        }

        return content.trim();
    }

    function getPageTitle() {
        // Try to extract article title
        const titleSelectors = [
            'h1',
            '.post-title',
            '.article-title',
            '[property="og:title"]'
        ];

        for (const selector of titleSelectors) {
            const el = document.querySelector(selector);
            if (el) {
                const title = el.innerText || el.textContent || el.getAttribute('content');
                if (title && title.trim().length > 0) {
                    return title.trim();
                }
            }
        }

        // Fallback to page title
        return document.title;
    }

    function generateId() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    // Show small indicator when tracking
    createIndicator();

    function createIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'jitter-indicator';
        indicator.className = 'jitter-inactive'; // Use CSS class instead of inline styles
        indicator.textContent = '⚡';
        indicator.title = 'JITTEr - Click to open';

        // Click to open popup
        indicator.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'openPopup' });
        });

        document.body.appendChild(indicator);

        // Update indicator state
        let isTracking = false;
        chrome.runtime.onMessage.addListener((request) => {
            if (request.action === 'updateIndicator') {
                isTracking = request.isTracking;
                if (isTracking) {
                    indicator.className = 'jitter-tracking';
                } else {
                    indicator.className = 'jitter-inactive';
                }
            }
        });
    }
}
