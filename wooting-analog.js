/**
 * wooting-analog.js - Wooting Analog Keyboard Integration
 *
 * Copyright (c) 2025-2026 Denis Gingras. All Rights Reserved.
 *
 * PROPRIETARY AND CONFIDENTIAL
 * Integrates with Wooting keyboards via WebHID to capture per-key
 * analog depth values for enhanced biometric verification.
 *
 * Wooting Analog SDK: https://github.com/WootingKb/wooting-analog-sdk
 */

const WootingAnalog = {
    // --- STATE ---
    connected: false,
    device: null,
    analogValues: new Map(),     // HID keyCode -> depth (0.0 - 1.0)
    depthReadings: [],           // Rolling window of per-keystroke depth values
    depthCurves: [],             // Rolling window of press/release curve shapes
    perFingerDepths: new Map(),  // Track depth patterns per key region
    callbacks: [],               // Listeners for analog events

    // Max rolling window sizes
    MAX_DEPTH_READINGS: 100,
    MAX_DEPTH_CURVES: 50,

    // --- KNOWN WOOTING DEVICES ---
    WOOTING_FILTERS: [
        { vendorId: 0x31E3 },   // Wooting (current VID: 60HE, Two HE, 80HE)
        { vendorId: 0x03EB }    // Wooting (legacy VID: One, Two)
    ],

    // Wooting analog HID usage page
    ANALOG_USAGE_PAGE: 0xFF54,

    // --- INITIALIZATION ---

    /**
     * Initialize the Wooting analog subsystem.
     * Attempts to reconnect to previously authorized devices automatically.
     * Returns true if a device was found, false otherwise.
     */
    async init() {
        if (!this.isWebHIDAvailable()) {
            return false;
        }

        try {
            // Check for previously authorized Wooting devices
            const devices = await navigator.hid.getDevices();
            const wooting = devices.find(d => this._isWootingDevice(d));

            if (wooting) {
                return await this._connectDevice(wooting);
            }
        } catch (e) {
            // WebHID not available or permission denied — silent fail
        }

        return false;
    },

    /**
     * Request user to select a Wooting keyboard.
     * MUST be called from a user gesture (click handler).
     */
    async requestDevice() {
        if (!this.isWebHIDAvailable()) {
            return false;
        }

        try {
            const devices = await navigator.hid.requestDevice({
                filters: this.WOOTING_FILTERS
            });

            if (devices.length > 0) {
                return await this._connectDevice(devices[0]);
            }
        } catch (e) {
            // User cancelled or error
        }

        return false;
    },

    /**
     * Disconnect from the current device.
     */
    async disconnect() {
        if (this.device && this.device.opened) {
            this.device.removeEventListener('inputreport', this._boundReportHandler);
            await this.device.close();
        }
        this.device = null;
        this.connected = false;
        this.analogValues.clear();
        this._notify('disconnect', null);
    },

    // --- ANALOG DATA ACCESS ---

    /**
     * Get the current analog depth for a specific HID key code.
     * Returns 0.0 (not pressed) to 1.0 (fully pressed), or null if unavailable.
     */
    getKeyDepth(hidKeyCode) {
        if (!this.connected) return null;
        return this.analogValues.get(hidKeyCode) || 0.0;
    },

    /**
     * Get all currently pressed keys and their analog depths.
     * Returns Map of hidKeyCode -> depth.
     */
    getAllDepths() {
        return new Map(this.analogValues);
    },

    /**
     * Record a depth reading for the current keystroke.
     * Called by the keystroke handler in content.js / writer.js
     * when a keydown event occurs and Wooting data is available.
     */
    recordKeystrokeDepth(hidKeyCode) {
        const depth = this.getKeyDepth(hidKeyCode);
        if (depth === null || depth === 0) return null;

        // Store the depth reading
        this.depthReadings.push(depth);
        if (this.depthReadings.length > this.MAX_DEPTH_READINGS) {
            this.depthReadings.shift();
        }

        // Track per-region depths (approximation of finger usage)
        const region = this._getKeyRegion(hidKeyCode);
        if (!this.perFingerDepths.has(region)) {
            this.perFingerDepths.set(region, []);
        }
        const regionDepths = this.perFingerDepths.get(region);
        regionDepths.push(depth);
        if (regionDepths.length > 30) regionDepths.shift();

        return depth;
    },

    /**
     * Get statistical summary of depth readings for biometric analysis.
     */
    getDepthStats() {
        if (this.depthReadings.length < 5) {
            return null;
        }

        const depths = this.depthReadings;
        const n = depths.length;

        // Average depth
        const sum = depths.reduce((a, b) => a + b, 0);
        const avg = sum / n;

        // Standard deviation (pressure consistency)
        const squareDiffs = depths.map(d => Math.pow(d - avg, 2));
        const variance = squareDiffs.reduce((a, b) => a + b, 0) / n;
        const stdDev = Math.sqrt(variance);

        // Min/Max range
        const min = Math.min(...depths);
        const max = Math.max(...depths);

        // Bottom-out rate: how often user presses key to >90% depth
        const bottomOuts = depths.filter(d => d > 0.9).length;
        const bottomOutRate = bottomOuts / n;

        // Light-touch rate: how often user presses key to <40% depth
        const lightTouches = depths.filter(d => d < 0.4).length;
        const lightTouchRate = lightTouches / n;

        // Per-region variance (different fingers press with different force)
        const regionVariance = this._calculateRegionVariance();

        return {
            avgDepth: parseFloat(avg.toFixed(3)),
            depthStdDev: parseFloat(stdDev.toFixed(3)),
            depthRange: parseFloat((max - min).toFixed(3)),
            bottomOutRate: parseFloat(bottomOutRate.toFixed(3)),
            lightTouchRate: parseFloat(lightTouchRate.toFixed(3)),
            regionVariance: parseFloat(regionVariance.toFixed(3)),
            sampleCount: n
        };
    },

    /**
     * Check if analog data is currently available.
     */
    isAvailable() {
        return this.connected && this.depthReadings.length >= 5;
    },

    /**
     * Check if WebHID API is supported in this environment.
     */
    isWebHIDAvailable() {
        return typeof navigator !== 'undefined' && 'hid' in navigator;
    },

    /**
     * Register a callback for analog events.
     * Events: 'connect', 'disconnect', 'depth-update'
     */
    on(event, callback) {
        this.callbacks.push({ event, callback });
    },

    /**
     * Reset all collected depth data (for session reset).
     */
    resetData() {
        this.depthReadings = [];
        this.depthCurves = [];
        this.perFingerDepths.clear();
    },

    // --- INTERNAL METHODS ---

    /**
     * Connect to a specific HID device and start reading analog data.
     */
    async _connectDevice(device) {
        try {
            if (!device.opened) {
                await device.open();
            }

            this.device = device;
            this.connected = true;

            // Bind the input report handler
            this._boundReportHandler = this._handleInputReport.bind(this);
            device.addEventListener('inputreport', this._boundReportHandler);

            // Listen for disconnect
            navigator.hid.addEventListener('disconnect', (e) => {
                if (e.device === this.device) {
                    this.connected = false;
                    this.device = null;
                    this._notify('disconnect', null);
                }
            });

            this._notify('connect', {
                name: device.productName,
                vendorId: device.vendorId,
                productId: device.productId
            });

            return true;
        } catch (e) {
            this.connected = false;
            return false;
        }
    },

    /**
     * Handle incoming HID input report containing analog data.
     * Wooting keyboards send analog values as pairs of (keycode, depth).
     *
     * Report format (Wooting analog interface):
     *   Byte 0:     Report ID
     *   Bytes 1-N:  Pairs of [keycode_hi, keycode_lo, analog_value]
     *               keycode: USB HID keycode (uint16)
     *               analog_value: 0-255 (uint8, maps to 0.0-1.0)
     *
     * Keys with analog_value = 0 are considered released.
     */
    _handleInputReport(event) {
        const { data, reportId } = event;

        // Clear previous values — only currently pressed keys remain
        this.analogValues.clear();

        // Parse key-value pairs from the report
        // Each entry: 2 bytes keycode + 1 byte analog value = 3 bytes per key
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const entrySize = 3;
        const entryCount = Math.floor(data.byteLength / entrySize);

        for (let i = 0; i < entryCount; i++) {
            const offset = i * entrySize;
            if (offset + entrySize > data.byteLength) break;

            const keyCode = view.getUint16(offset, true);  // little-endian
            const analogRaw = view.getUint8(offset + 2);

            // Skip empty entries
            if (keyCode === 0 && analogRaw === 0) continue;

            // Normalize to 0.0 - 1.0
            const depth = analogRaw / 255.0;

            if (depth > 0) {
                this.analogValues.set(keyCode, depth);
            }
        }

        this._notify('depth-update', this.analogValues);
    },

    /**
     * Check if a HID device is a Wooting keyboard.
     */
    _isWootingDevice(device) {
        return this.WOOTING_FILTERS.some(f => device.vendorId === f.vendorId);
    },

    /**
     * Map HID keycode to keyboard region for per-finger depth tracking.
     * Regions approximate which finger typically hits which keys.
     */
    _getKeyRegion(hidKeyCode) {
        // Left pinky region (Q, A, Z, 1, Tab, Caps, Shift)
        if ([0x14, 0x04, 0x1D, 0x1E, 0x2B, 0x39, 0xE1].includes(hidKeyCode)) return 'left-pinky';
        // Left ring (W, S, X, 2)
        if ([0x1A, 0x16, 0x1B, 0x1F].includes(hidKeyCode)) return 'left-ring';
        // Left middle (E, D, C, 3)
        if ([0x08, 0x07, 0x06, 0x20].includes(hidKeyCode)) return 'left-middle';
        // Left index (R, T, F, G, V, B, 4, 5)
        if ([0x15, 0x17, 0x09, 0x0A, 0x19, 0x05, 0x21, 0x22].includes(hidKeyCode)) return 'left-index';
        // Right index (Y, U, H, J, N, M, 6, 7)
        if ([0x1C, 0x18, 0x0B, 0x0D, 0x11, 0x10, 0x23, 0x24].includes(hidKeyCode)) return 'right-index';
        // Right middle (I, K, comma, 8)
        if ([0x0C, 0x0E, 0x36, 0x25].includes(hidKeyCode)) return 'right-middle';
        // Right ring (O, L, period, 9)
        if ([0x12, 0x0F, 0x37, 0x26].includes(hidKeyCode)) return 'right-ring';
        // Right pinky (P, semicolon, slash, 0, brackets, enter, shift)
        if ([0x13, 0x33, 0x38, 0x27, 0x2F, 0x30, 0x28, 0xE5].includes(hidKeyCode)) return 'right-pinky';
        // Thumbs (space)
        if (hidKeyCode === 0x2C) return 'thumb';
        return 'other';
    },

    /**
     * Calculate variance across key regions.
     * Higher variance = more human (different fingers press with different force).
     * Low variance = suspicious (uniform pressure across all regions).
     */
    _calculateRegionVariance() {
        const regionAvgs = [];

        for (const [region, depths] of this.perFingerDepths) {
            if (depths.length >= 3) {
                const avg = depths.reduce((a, b) => a + b, 0) / depths.length;
                regionAvgs.push(avg);
            }
        }

        if (regionAvgs.length < 2) return 0;

        const overallAvg = regionAvgs.reduce((a, b) => a + b, 0) / regionAvgs.length;
        const squareDiffs = regionAvgs.map(a => Math.pow(a - overallAvg, 2));
        return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / regionAvgs.length);
    },

    /**
     * Map a keyboard event's key code to approximate HID usage code.
     * This allows correlating DOM keydown events with Wooting analog data.
     */
    keyEventToHID(e) {
        // Map common KeyboardEvent.code values to HID usage IDs
        const codeMap = {
            'KeyA': 0x04, 'KeyB': 0x05, 'KeyC': 0x06, 'KeyD': 0x07,
            'KeyE': 0x08, 'KeyF': 0x09, 'KeyG': 0x0A, 'KeyH': 0x0B,
            'KeyI': 0x0C, 'KeyJ': 0x0D, 'KeyK': 0x0E, 'KeyL': 0x0F,
            'KeyM': 0x10, 'KeyN': 0x11, 'KeyO': 0x12, 'KeyP': 0x13,
            'KeyQ': 0x14, 'KeyR': 0x15, 'KeyS': 0x16, 'KeyT': 0x17,
            'KeyU': 0x18, 'KeyV': 0x19, 'KeyW': 0x1A, 'KeyX': 0x1B,
            'KeyY': 0x1C, 'KeyZ': 0x1D,
            'Digit1': 0x1E, 'Digit2': 0x1F, 'Digit3': 0x20, 'Digit4': 0x21,
            'Digit5': 0x22, 'Digit6': 0x23, 'Digit7': 0x24, 'Digit8': 0x25,
            'Digit9': 0x26, 'Digit0': 0x27,
            'Enter': 0x28, 'Escape': 0x29, 'Backspace': 0x2A,
            'Tab': 0x2B, 'Space': 0x2C,
            'Minus': 0x2D, 'Equal': 0x2E,
            'BracketLeft': 0x2F, 'BracketRight': 0x30,
            'Backslash': 0x31, 'Semicolon': 0x33,
            'Quote': 0x34, 'Backquote': 0x35,
            'Comma': 0x36, 'Period': 0x37, 'Slash': 0x38
        };
        return codeMap[e.code] || null;
    },

    /**
     * Notify registered callbacks.
     */
    _notify(event, data) {
        this.callbacks
            .filter(cb => cb.event === event)
            .forEach(cb => cb.callback(data));
    }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WootingAnalog;
}
