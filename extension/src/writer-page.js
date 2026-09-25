/**
 * writer-page.js - JITTEr Writer (process receipt v4.0)
 *
 * Event bindings for the replay panel in writer.html. Manifest V3 pages
 * can't run inline scripts or on* attributes, so the controls bind here.
 * The editor, sidebar and action buttons bind in writer.js.
 *
 * Copyright (c) 2025-2026 Denis Gingras. All Rights Reserved.
 */

(function () {
    const on = (id, event, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, handler);
    };

    // Writing Ledger replay panel
    on('replay-close-btn', 'click', () => {
        const panel = document.getElementById('replay-panel');
        if (panel) panel.style.display = 'none';
    });
    on('replay-play-btn', 'click', () => toggleReplayPlayback());
    on('replay-scrubber', 'input', (e) => renderReplay(parseInt(e.target.value, 10)));
})();
