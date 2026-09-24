/**
 * verify-page.js - JITTER PROTOCOL v3.0
 *
 * Badge verification dashboard logic for verify.html. Lives in its own
 * file because Manifest V3 pages can't run inline scripts.
 *
 * Copyright (c) 2025-2026 Denis Gingras. All Rights Reserved.
 */

// Badge payloads arrive from untrusted links and pasted text: escape every
// string before it goes anywhere near innerHTML.
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeDeep(v) {
    if (typeof v === 'string') return escapeHtml(v);
    if (Array.isArray(v)) return v.map(escapeDeep);
    if (v && typeof v === 'object') {
        const out = {};
        for (const k of Object.keys(v)) out[k] = escapeDeep(v[k]);
        return out;
    }
    return v;
}

function extractBadgeData(input) {
    input = input.trim();

    // Try to extract from HTML
    const htmlMatch = input.match(/data-jitter-payload="([^"]+)"/);
    if (htmlMatch) return htmlMatch[1];

    // Try to extract from URL
    const urlMatch = input.match(/#jitter:([A-Za-z0-9+/=]+)/);
    if (urlMatch) return urlMatch[1];

    // Assume it's raw base64
    return input;
}

function getRiskClass(score) {
    if (score >= 70) return 'risk-high';
    if (score >= 40) return 'risk-medium';
    return 'risk-low';
}

function getRiskEmoji(score) {
    if (score >= 70) return '🚨';
    if (score >= 40) return '⚠️';
    return '✅';
}

function getRiskText(score) {
    if (score >= 70) return 'HIGH RISK';
    if (score >= 40) return 'MEDIUM RISK';
    return 'LOW RISK';
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

async function verifyBadge() {
    const input = document.getElementById('badge-input').value;
    const resultDiv = document.getElementById('result');

    if (!input) {
        resultDiv.innerHTML = '<div class="error-box">Please paste a badge first.</div>';
        resultDiv.style.display = 'block';
        return;
    }

    try {
        const base64 = extractBadgeData(input);
        const jsonString = atob(base64);
        const raw = JSON.parse(jsonString);

        // --- CRYPTOGRAPHIC VERIFICATION ---
        // The signature was computed over the payload WITHOUT the signature field.
        // Strip signature to reconstruct what was originally signed.
        let cryptoStatus = 'unsigned'; // 'unsigned' | 'valid' | 'invalid'
        if (raw.signature && raw.publicKeyJwk) {
            const { signature, ...payloadWithoutSignature } = raw;
            try {
                const isValid = await CryptoUtils.verifyBadge(
                    payloadWithoutSignature,
                    signature,
                    raw.publicKeyJwk
                );
                cryptoStatus = isValid ? 'valid' : 'invalid';
            } catch (e) {
                cryptoStatus = 'invalid';
            }
        }

        // Everything below is rendered with innerHTML: escape all strings first.
        const data = escapeDeep(raw);

        const suspicionScore = data.suspicionScore || 0;
        const riskClass = getRiskClass(suspicionScore);
        const riskEmoji = getRiskEmoji(suspicionScore);
        const riskText = getRiskText(suspicionScore);

        // Build crypto status banner
        const cryptoBanner = cryptoStatus === 'valid'
            ? `<div style="background:#00F0FF11;border:2px solid #00F0FF;border-radius:6px;padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;gap:10px;"><span style="font-size:20px;">🔐</span><div><div style="font-weight:bold;color:#00F0FF;">SIGNATURE VALID — Cryptographically Verified</div><div style="font-size:12px;color:#888;margin-top:2px;">ECDSA P-256 · Key ID: ${data.publicKeyId || '—'}</div></div></div>`
            : cryptoStatus === 'invalid'
            ? `<div style="background:#FF005511;border:2px solid #FF0055;border-radius:6px;padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;gap:10px;"><span style="font-size:20px;">🚨</span><div><div style="font-weight:bold;color:#FF0055;">SIGNATURE INVALID — Badge may be forged</div><div style="font-size:12px;color:#888;margin-top:2px;">The cryptographic signature does not match the payload.</div></div></div>`
            : `<div style="background:#FFD70011;border:2px solid #FFD700;border-radius:6px;padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;gap:10px;"><span style="font-size:20px;">⚠️</span><div><div style="font-weight:bold;color:#FFD700;">UNSIGNED BADGE — No cryptographic proof</div><div style="font-size:12px;color:#888;margin-top:2px;">Data is readable but authenticity cannot be confirmed.</div></div></div>`;

        const headerTitle = cryptoStatus === 'valid' ? 'Badge Verified ✅' : cryptoStatus === 'invalid' ? 'Badge Invalid ❌' : 'Badge Decoded (Unsigned)';

        let html = `
            <div class="result-card">
                <div class="result-header">
                    <h2 style="margin:0; color:#fff;">${headerTitle}</h2>
                    <div class="risk-badge ${riskClass}">
                        ${riskEmoji} ${riskText} (${suspicionScore}/100)
                    </div>
                </div>
                ${cryptoBanner}

                ${data.war != null ? `
                <div class="metric-grid">
                    <div class="metric">
                        <div class="metric-label">WAR Score</div>
                        <div class="metric-value" style="color: ${data.war >= 0.60 ? '#00F0FF' : data.war >= 0.40 ? '#FFD700' : '#FF0055'}">
                            ${data.war}
                        </div>
                        <div class="metric-status" style="color: ${data.war >= 0.60 ? '#00F0FF' : data.war >= 0.40 ? '#FFD700' : '#FF0055'}">
                            ${data.war_tier || 'Unknown'}${data.raw_war != null && data.raw_war !== data.war ? ' (raw score ' + data.raw_war + ')' : ''}
                        </div>
                    </div>

                    <div class="metric">
                        <div class="metric-label">Time Cap</div>
                        <div class="metric-value" style="color: ${(data.time_cap || 0) >= 0.80 ? '#00F0FF' : '#FFD700'}">
                            ${data.time_cap != null ? Math.round(data.time_cap * 100) + '%' : '—'}
                        </div>
                        <div class="metric-status" style="color: ${(data.accountAge || 0) >= 30 ? '#00F0FF' : '#FFD700'}">
                            ${(data.accountAge || 0)} day${data.accountAge !== 1 ? 's' : ''} old
                        </div>
                    </div>

                    <div class="metric">
                        <div class="metric-label">Total Keystrokes</div>
                        <div class="metric-value" style="color: #FFD700">
                            ${formatNumber(data.passport || 0)}
                        </div>
                        <div class="metric-status" style="color: #FFD700">
                            ${data.passportLevel || 'Unknown'}
                        </div>
                    </div>

                    <div class="metric">
                        <div class="metric-label">Session Integrity</div>
                        <div class="metric-value" style="color: ${data.integrity >= 80 ? '#00F0FF' : '#FFD700'}">
                            ${data.integrity}%
                        </div>
                        <div class="metric-status" style="color: ${data.integrity >= 80 ? '#00F0FF' : '#FFD700'}">
                            ${data.integrity >= 80 ? 'Clean' : 'Review'}
                        </div>
                    </div>
                </div>
                ` : `
                <div class="metric-grid">
                    <div class="metric">
                        <div class="metric-label">Session Integrity</div>
                        <div class="metric-value" style="color: ${data.integrity >= 80 ? '#00F0FF' : '#FFD700'}">
                            ${data.integrity}%
                        </div>
                        <div class="metric-status" style="color: ${data.integrity >= 80 ? '#00F0FF' : '#FFD700'}">
                            ${data.integrity >= 80 ? 'Clean' : 'Review'}
                        </div>
                    </div>

                    <div class="metric">
                        <div class="metric-label">Cognitive Ratio</div>
                        <div class="metric-value" style="color: ${data.cr >= 1.5 ? '#00F0FF' : '#FFD700'}">
                            ${data.cr}
                        </div>
                        <div class="metric-status" style="color: ${data.cr >= 1.5 ? '#00F0FF' : '#FFD700'}">
                            ${data.cr >= 1.5 ? 'Human-like' : 'Low variance'}
                        </div>
                    </div>

                    <div class="metric">
                        <div class="metric-label">Total Keystrokes</div>
                        <div class="metric-value" style="color: #FFD700">
                            ${formatNumber(data.passport || 0)}
                        </div>
                        <div class="metric-status" style="color: #FFD700">
                            ${data.passportLevel || 'Unknown'}
                        </div>
                    </div>

                    <div class="metric">
                        <div class="metric-label">Account Age</div>
                        <div class="metric-value" style="color: ${(data.accountAge || 0) >= 30 ? '#00F0FF' : '#FFD700'}">
                            ${data.accountAge || 0}
                        </div>
                        <div class="metric-status" style="color: ${(data.accountAge || 0) >= 30 ? '#00F0FF' : '#FFD700'}">
                            ${(data.accountAge || 0) >= 30 ? 'Established' : 'New account'}
                        </div>
                    </div>
                </div>
                `}

                <div class="section-header">SESSION DETAILS</div>
                <div class="info-row">
                    <span class="info-label">Date Submitted</span>
                    <span class="info-value">${data.date || 'Unknown'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Session Keys</span>
                    <span class="info-value">${formatNumber(data.keys || 0)}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Human Edits</span>
                    <span class="info-value">${data.edits || 0}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Entropy Score</span>
                    <span class="info-value">${data.entropy || 0}/100</span>
                </div>

                <div class="section-header">BIOMETRIC PROFILE</div>
                <div class="info-row">
                    <span class="info-label">Dwell Time</span>
                    <span class="info-value">${data.meanDwell != null ? data.meanDwell + 'ms (\u00b1' + (data.stdDwell || 0) + ')' : '\u2014'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Flight Time</span>
                    <span class="info-value">${data.meanFlight != null ? data.meanFlight + 'ms (\u00b1' + (data.stdFlight || 0) + ')' : '\u2014'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">DD Time</span>
                    <span class="info-value">${data.meanDd != null ? data.meanDd + 'ms (\u00b1' + (data.stdDd || 0) + ')' : '\u2014'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Edit Ratio</span>
                    <span class="info-value">${data.editRatio != null ? (data.editRatio * 100).toFixed(1) + '%' : '\u2014'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Pause Frequency</span>
                    <span class="info-value">${data.pauseFreq != null ? data.pauseFreq + '/100 keys' : '\u2014'}</span>
                </div>

                <div class="section-header">COMPOSITION ANALYSIS</div>
                <div class="info-row">
                    <span class="info-label">Burst Count</span>
                    <span class="info-value">${data.burstCount != null ? data.burstCount : '\u2014'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Avg Burst Length</span>
                    <span class="info-value">${data.avgBurstLength != null ? data.avgBurstLength + ' keys' : '\u2014'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Burst Variance</span>
                    <span class="info-value" style="color: ${data.burstVariance != null && data.burstVariance < 0.15 ? '#FFD700' : '#fff'}">${data.burstVariance != null ? data.burstVariance : '\u2014'}</span>
                </div>
`;

        // Cursor tracking (writer mode only)
        if (data.editingLinearity != null) {
            const linearityPct = (data.editingLinearity * 100).toFixed(0);
            const linearityColor = data.editingLinearity > 0.95 ? '#FFD700' : '#00F0FF';
            html += `
                <div class="info-row">
                    <span class="info-label">Editing Linearity</span>
                    <span class="info-value" style="color: ${linearityColor}">${linearityPct}%</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Cursor Jumps</span>
                    <span class="info-value">${data.cursorJumps || 0}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Backward Edits</span>
                    <span class="info-value">${data.backwardEdits || 0}</span>
                </div>
            `;
        }

        // Fatigue trend
        if (data.fatigueWindows && data.fatigueWindows.length > 1) {
            const first = data.fatigueWindows[0];
            const last = data.fatigueWindows[data.fatigueWindows.length - 1];
            const trend = last > first ? '\u2197 slowing' : '\u2198 speeding up';
            const trendColor = last > first ? '#FFD700' : '#00F0FF';
            html += `
                <div class="info-row">
                    <span class="info-label">Fatigue Trend</span>
                    <span class="info-value" style="color: ${trendColor}">${data.fatigueWindows.join(' \u2192 ')} <span style="font-size:12px">(${trend})</span></span>
                </div>
            `;
        }

        html += `
                <div class="section-header">PASSPORT PROFILE</div>
                <div class="info-row">
                    <span class="info-label">Lifetime Keystrokes</span>
                    <span class="info-value">${formatNumber(data.passport || 0)}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Level</span>
                    <span class="info-value">${data.passportLevel || 'Unknown'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Sessions Completed</span>
                    <span class="info-value">${data.sessions || 0}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Avg Daily Output</span>
                    <span class="info-value">${formatNumber(data.avgDailyKeys || 0)} keys/day</span>
                </div>
`;

        // Show chain link if present
        if (data.previousBadge) {
            html += `
                <div class="section-header">BADGE CHAIN</div>
                <div class="chain-indicator">
                    <span class="chain-icon">⛓️</span>
                    <div>
                        <div style="font-weight:bold; color:#00F0FF;">Linked to Previous Badge</div>
                        <div style="font-size:12px; color:#888; margin-top:3px;">
                            Previous hash: ${data.previousBadge}
                        </div>
                    </div>
                </div>
            `;
        }

        // Transcription warning
        if (data.transcriptionFlag) {
            html += `
                <div class="alert-box" style="background: #FFD70011; border-color: #FFD700;">
                    <div class="alert-title" style="color: #FFD700;">\u26a0\ufe0f TRANSCRIPTION PATTERN DETECTED</div>
                    <div style="color: #ddd; font-size: 13px;">
                        Writing pattern suggests transcription (pure forward typing, low burst variance).
                        This is not a bot detection \u2014 it indicates the content may have been typed from another source.
                    </div>
                </div>
            `;
        }

        // Show warnings if high risk
        if (suspicionScore >= 40) {
            html += `
                <div class="alert-box">
                    <div class="alert-title">⚠️ SUSPICIOUS PATTERNS DETECTED</div>
                    ${data.avgDailyKeys > 3000 ? '<div class="alert-item">High daily output (' + formatNumber(data.avgDailyKeys) + ' keys/day)</div>' : ''}
                    ${data.accountAge < 7 && data.passport > 5000 ? '<div class="alert-item">New account with suspiciously high output</div>' : ''}
                    ${data.cr < 1.5 ? '<div class="alert-item">Low cognitive ratio (bot-like typing)</div>' : ''}
                    ${data.integrity < 80 ? '<div class="alert-item">High paste percentage</div>' : ''}
                    ${data.burstVariance != null && data.burstVariance < 0.15 && data.burstCount > 5 ? '<div class="alert-item">Unnaturally consistent burst pattern</div>' : ''}
                    ${data.editingLinearity != null && data.editingLinearity > 0.95 && data.keys > 500 ? '<div class="alert-item">Pure forward typing (possible transcription)</div>' : ''}
                    <div style="margin-top:10px; font-size:12px; color:#ddd;">
                        Recommendation: Review this submission manually
                    </div>
                </div>
            `;
        } else if (suspicionScore < 20 && cryptoStatus === 'valid') {
            html += `
                <div class="success-box">
                    ✅ Signature verified + all metrics within normal human ranges. High confidence in authenticity.
                </div>
            `;
        } else if (suspicionScore < 20 && cryptoStatus === 'unsigned') {
            html += `
                <div class="success-box" style="background:#FFD70011;border-color:#FFD700;color:#FFD700;">
                    ⚠️ Metrics look human, but no cryptographic proof. Ask student to re-submit using Jitter v2.0.
                </div>
            `;
        }

        html += `</div>`;

        resultDiv.innerHTML = html;
        resultDiv.style.display = 'block';

    } catch (error) {
        resultDiv.innerHTML = `
            <div class="error-box">
                <h3 style="margin-top:0;">❌ Invalid Badge</h3>
                <p>Could not decode badge data. Please check the input and try again.</p>
                <p style="font-size:12px; margin-top:10px; color:#888;">Error: ${escapeHtml(error.message)}</p>
            </div>
        `;
        resultDiv.style.display = 'block';
    }
}

// Allow Enter key to verify
document.getElementById('badge-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && e.ctrlKey) {
        verifyBadge();
    }
});

document.getElementById('verify-btn').addEventListener('click', verifyBadge);
