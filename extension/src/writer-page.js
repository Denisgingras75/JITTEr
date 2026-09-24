/**
 * writer-page.js - JITTER PROTOCOL v3.0
 *
 * Event bindings for writer.html. Manifest V3 pages can't run inline
 * scripts or on* attributes, so every button binds here instead.
 *
 * Copyright (c) 2025-2026 Denis Gingras. All Rights Reserved.
 */

(function () {
    const on = (id, event, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, handler);
    };

    // Cloud sync UI only works when an auth module is loaded on the page.
    // (The Firebase-era auth-utils.js needs a remote SDK that MV3 blocks.)
    const hasAuth = typeof AuthUtils !== 'undefined';
    if (!hasAuth) {
        const authBox = document.getElementById('auth-box');
        if (authBox) authBox.style.display = 'none';
    }
    on('auth-submit-btn', 'click', () => { if (hasAuth) AuthUtils.handleLoginSubmit(); });
    on('auth-cancel-btn', 'click', () => { if (hasAuth) AuthUtils.hideLoginModal(); });
    on('auth-mode-toggle', 'change', (e) => {
        const submitText = document.getElementById('auth-submit-text');
        if (submitText) submitText.innerText = e.target.checked ? 'SIGN UP' : 'LOGIN';
    });

    // Writing Ledger replay panel
    on('replay-close-btn', 'click', () => {
        document.getElementById('replay-panel').style.display = 'none';
    });
    on('replay-play-btn', 'click', () => toggleReplayPlayback());
    on('replay-scrubber', 'input', (e) => renderReplay(parseInt(e.target.value, 10)));
})();
