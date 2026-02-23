/**
 * biometrics.js - Loki Cognitive Rhythm Analysis
 *
 * Copyright (c) 2025-2026 Denis Gingras. All Rights Reserved.
 *
 * PROPRIETARY AND CONFIDENTIAL
 * Contains proprietary biometric analysis algorithms.
 * Unauthorized copying, modification, or use is strictly prohibited.
 */

/**
 * Loki Biometric Analyzer
 * Distinguishes humans from bots via cognitive rhythm patterns
 */
class LokiAnalyzer {
    constructor() {
        this.lastTime = null;
        this.lastChar = '';
        this.flowIntervals = []; // Typing within words
        this.gapIntervals = [];  // Pauses after punctuation/spaces
        this.backspaces = 0;
        this.cognitiveRatio = 0;
        this.entropy = 100;
        this.isBot = false;
    }

    /**
     * Process a keystroke event
     * @param {string} key - The key that was pressed
     * @param {number} timestamp - When it was pressed (ms)
     */
    processKeystroke(key, timestamp) {
        // Track backspaces separately
        if (key === 'Backspace' || key === 'Delete') {
            this.backspaces++;
            return;
        }

        // Only analyze single character keys
        if (key.length !== 1) return;

        const now = timestamp || Date.now();

        if (this.lastTime) {
            const delta = now - this.lastTime;

            // Only analyze reasonable typing intervals (ignore breaks >2s)
            if (delta < 2000) {
                // Check if previous character was a "thinking point"
                // (space, punctuation where humans pause to think)
                const isGap = /[\s\.\,\;\:\!\?]/.test(this.lastChar);

                if (isGap) {
                    // This is a "gap interval" - pause after thinking
                    this.gapIntervals.push(delta);
                    if (this.gapIntervals.length > 20) {
                        this.gapIntervals.shift(); // Keep last 20
                    }
                } else {
                    // This is a "flow interval" - normal typing speed
                    this.flowIntervals.push(delta);
                    if (this.flowIntervals.length > 50) {
                        this.flowIntervals.shift(); // Keep last 50
                    }
                }

                // Analyze rhythm after enough data
                this.analyzeRhythm();
            }
        }

        this.lastTime = now;
        this.lastChar = key;
    }

    /**
     * The Loki Algorithm
     * Analyzes typing rhythm to detect bot vs human patterns
     */
    analyzeRhythm() {
        // Need minimum data to analyze
        if (this.flowIntervals.length < 10) {
            return;
        }

        // Calculate average flow speed (typing within words)
        const avgFlow = this.flowIntervals.reduce((a, b) => a + b, 0) / this.flowIntervals.length;

        // Calculate average gap speed (pauses after punctuation)
        const avgGap = this.gapIntervals.length > 0
            ? (this.gapIntervals.reduce((a, b) => a + b, 0) / this.gapIntervals.length)
            : avgFlow;

        // THE LOKI METRIC: Cognitive Ratio
        // Humans pause longer after punctuation (thinking) than when typing within words
        // Bots type at consistent speed regardless
        this.cognitiveRatio = avgGap / avgFlow;

        // Calculate variance (entropy)
        const squareDiffs = this.flowIntervals.map(v => Math.pow(v - avgFlow, 2));
        const stdDev = Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / this.flowIntervals.length);

        // Bot detection heuristics
        const botRhythm = stdDev < 8;        // Too consistent (< 8ms variance)
        const botSpeed = avgFlow < 35;        // Impossibly fast (< 35ms per char)
        const botLinearity = this.cognitiveRatio < 1.2; // No cognitive pausing

        if (botRhythm || botSpeed || botLinearity) {
            this.isBot = true;
            this.entropy = 0;
        } else {
            this.isBot = false;
            // Entropy = variance score (higher = more human-like)
            this.entropy = Math.min(Math.round(stdDev + (this.cognitiveRatio * 10)), 100);
        }
    }

    /**
     * Get current biometric stats
     */
    getStats() {
        return {
            cognitiveRatio: parseFloat(this.cognitiveRatio.toFixed(2)),
            entropy: this.entropy,
            isBot: this.isBot,
            backspaces: this.backspaces,
            avgFlowSpeed: this.flowIntervals.length > 0
                ? Math.round(this.flowIntervals.reduce((a, b) => a + b, 0) / this.flowIntervals.length)
                : 0,
            avgGapSpeed: this.gapIntervals.length > 0
                ? Math.round(this.gapIntervals.reduce((a, b) => a + b, 0) / this.gapIntervals.length)
                : 0,
            sampleSize: this.flowIntervals.length
        };
    }

    /**
     * Reset analyzer for new session
     */
    reset() {
        this.lastTime = null;
        this.lastChar = '';
        this.flowIntervals = [];
        this.gapIntervals = [];
        this.backspaces = 0;
        this.cognitiveRatio = 0;
        this.entropy = 100;
        this.isBot = false;
    }

    /**
     * Export raw interval data for advanced analysis
     */
    exportRawData() {
        return {
            flowIntervals: [...this.flowIntervals],
            gapIntervals: [...this.gapIntervals],
            backspaces: this.backspaces
        };
    }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LokiAnalyzer;
}
