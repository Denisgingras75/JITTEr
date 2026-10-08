// crypto-utils.js - Cryptographic utilities for badge verification
// Uses Web Crypto API for ECDSA signatures (no external dependencies)

const CryptoUtils = {
    // The server's countersigning public keys, by server_key_id (the id the
    // attest response carries). Paste the output of
    // supabase/scripts/gen-server-key.mjs here, e.g. { "k1": { kty: 'EC', ... } }.
    // A signature whose key id has no entry is reported as "unchecked".
    SERVER_PUBLIC_KEYS: {},
    // Legacy single entry: consulted when the badge carries no server_key_id,
    // or as the fallback for an id that is not in SERVER_PUBLIC_KEYS.
    SERVER_PUBLIC_JWK: null,

    // Fields added to a badge after it was signed by the device. The device
    // signature covers everything else.
    UNSIGNED_FIELDS: ['signature', 'attestation', 'server_signature', 'server_key_id'],

    // --- Device key (real extension) ---
    // In the extension the key pair lives in the service worker, non-extractable
    // (see background.js). Outside it (tests, plain pages) the storage-backed
    // key pair below is used instead.
    _device: undefined,
    async deviceKey() {
        if (this._device !== undefined) return this._device;
        this._device = null;
        try {
            if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return null;
            const info = await new Promise((resolve) => {
                const timer = setTimeout(() => resolve(null), 3000);
                try {
                    chrome.runtime.sendMessage({ action: 'deviceKey' }, (res) => {
                        clearTimeout(timer);
                        resolve(chrome.runtime.lastError ? null : res);
                    });
                } catch (e) { clearTimeout(timer); resolve(null); }
            });
            if (info && info.jwk) this._device = info;
        } catch (e) {}
        return this._device;
    },

    async signWithDevice(dataString) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => resolve(null), 5000);
            try {
                chrome.runtime.sendMessage({ action: 'sign', data: dataString }, (res) => {
                    clearTimeout(timer);
                    resolve(!chrome.runtime.lastError && res && res.signature ? res.signature : null);
                });
            } catch (e) { clearTimeout(timer); resolve(null); }
        });
    },

    // Generate or retrieve user's key pair
    async getOrCreateKeyPair() {
        if (await this.deviceKey()) return { serviceWorker: true };
        try {
            // Try to load existing keys from storage
            const stored = await chrome.storage.local.get(['jitterPrivateKey', 'jitterPublicKey']);

            if (stored.jitterPrivateKey && stored.jitterPublicKey) {
                // Import existing keys
                const privateKey = await crypto.subtle.importKey(
                    'jwk',
                    stored.jitterPrivateKey,
                    { name: 'ECDSA', namedCurve: 'P-256' },
                    true,
                    ['sign']
                );

                const publicKey = await crypto.subtle.importKey(
                    'jwk',
                    stored.jitterPublicKey,
                    { name: 'ECDSA', namedCurve: 'P-256' },
                    true,
                    ['verify']
                );

                return { privateKey, publicKey };
            }

            // Generate new key pair
            const keyPair = await crypto.subtle.generateKey(
                {
                    name: 'ECDSA',
                    namedCurve: 'P-256'
                },
                true, // extractable
                ['sign', 'verify']
            );

            // Export and store keys
            const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
            const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

            await chrome.storage.local.set({
                jitterPrivateKey: privateKeyJwk,
                jitterPublicKey: publicKeyJwk,
                keyCreatedAt: Date.now()
            });

            return keyPair;
        } catch (error) {
            console.error('Key generation error:', error);
            return null;
        }
    },

    // Get the stored public key JWK (for embedding in badges)
    async getPublicKeyJwk() {
        const device = await this.deviceKey();
        if (device) return device.jwk;
        try {
            const stored = await chrome.storage.local.get(['jitterPublicKey']);
            return stored.jitterPublicKey || null;
        } catch (error) {
            return null;
        }
    },

    // Create a fingerprint of the public key (for badge identification)
    // Uses raw EC point bytes for a canonical, order-independent hash
    async getPublicKeyFingerprint() {
        const device = await this.deviceKey();
        if (device) return device.keyId;
        try {
            const stored = await chrome.storage.local.get(['jitterPublicKey']);
            if (!stored.jitterPublicKey) return null;

            // Import the key so we can export as raw bytes (canonical form)
            const publicKey = await crypto.subtle.importKey(
                'jwk',
                stored.jitterPublicKey,
                { name: 'ECDSA', namedCurve: 'P-256' },
                true,
                ['verify']
            );
            const rawBytes = await crypto.subtle.exportKey('raw', publicKey);
            const hashBuffer = await crypto.subtle.digest('SHA-256', rawBytes);

            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 12).toUpperCase();
        } catch (error) {
            return null;
        }
    },

    // Canonical JSON: keys sorted at every depth, no whitespace, undefined
    // dropped. Signing this means every nested field is covered by the
    // signature. (JSON.stringify with a key array only whitelists names, so
    // nested objects were signed as {} before.)
    canonicalJson(value) {
        if (value === undefined) return 'null';
        if (value === null || typeof value !== 'object') return JSON.stringify(value);
        if (Array.isArray(value)) return '[' + value.map(v => this.canonicalJson(v)).join(',') + ']';
        return '{' + Object.keys(value).sort()
            .filter(k => value[k] !== undefined)
            .map(k => JSON.stringify(k) + ':' + this.canonicalJson(value[k]))
            .join(',') + '}';
    },

    // Sign badge data
    async signBadge(badgeData) {
        try {
            const dataString = CryptoUtils.canonicalJson(badgeData);
            if (await this.deviceKey()) return await this.signWithDevice(dataString);

            const keyPair = await this.getOrCreateKeyPair();
            if (!keyPair) return null;

            const encoder = new TextEncoder();
            const data = encoder.encode(dataString);

            // Sign with private key
            const signature = await crypto.subtle.sign(
                {
                    name: 'ECDSA',
                    hash: { name: 'SHA-256' }
                },
                keyPair.privateKey,
                data
            );

            // Convert to base64
            const signatureArray = Array.from(new Uint8Array(signature));
            const signatureBase64 = btoa(String.fromCharCode(...signatureArray));

            return signatureBase64;
        } catch (error) {
            console.error('Signing error:', error);
            return null;
        }
    },

    // Verify a badge signature
    async verifyBadge(badgeData, signatureBase64, publicKeyJwk) {
        try {
            // Import public key
            const publicKey = await crypto.subtle.importKey(
                'jwk',
                publicKeyJwk,
                { name: 'ECDSA', namedCurve: 'P-256' },
                false,
                ['verify']
            );

            // Reconstruct signed data
            const dataString = CryptoUtils.canonicalJson(badgeData);
            const encoder = new TextEncoder();
            const data = encoder.encode(dataString);

            // Decode signature
            const signatureString = atob(signatureBase64);
            const signature = new Uint8Array(signatureString.length);
            for (let i = 0; i < signatureString.length; i++) {
                signature[i] = signatureString.charCodeAt(i);
            }

            // Verify
            const isValid = await crypto.subtle.verify(
                {
                    name: 'ECDSA',
                    hash: { name: 'SHA-256' }
                },
                publicKey,
                signature,
                data
            );

            return isValid;
        } catch (error) {
            console.error('Verification error:', error);
            return false;
        }
    },

    // Hash previous badge to create chain
    // --- Content binding and server attestation ---

    async sha256Hex(text) {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    },

    // Hash of the certified text. Line endings and outer whitespace are
    // normalised so the same text pasted elsewhere still matches.
    async textHash(text) {
        return this.sha256Hex(String(text).replace(/\r\n?/g, '\n').trim());
    },

    // SHA-256 of the raw public key: the id the attestation server uses.
    async deviceIdFromJwk(jwk) {
        try {
            const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
                { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
            const raw = await crypto.subtle.exportKey('raw', key);
            const digest = await crypto.subtle.digest('SHA-256', raw);
            return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (error) {
            return null;
        }
    },

    // POST a signed badge to the attestation server. Returns the parsed
    // response or null; never throws, never blocks the badge copy.
    async attest(url, siteKey, badge, signature) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ site_key: siteKey, badge, signature }),
                signal: controller.signal,
            });
            const data = await res.json().catch(() => null);
            return res.ok && data && data.badge_hash ? data : null;
        } catch (error) {
            return null;
        } finally {
            clearTimeout(timer);
        }
    },

    // The public key for a server key id: SERVER_PUBLIC_KEYS[keyId], else the
    // legacy SERVER_PUBLIC_JWK; null when nothing is configured for it.
    serverPublicKey(keyId) {
        const keys = this.SERVER_PUBLIC_KEYS && typeof this.SERVER_PUBLIC_KEYS === 'object' ? this.SERVER_PUBLIC_KEYS : {};
        if (keyId != null && Object.prototype.hasOwnProperty.call(keys, keyId) && keys[keyId]) return keys[keyId];
        return this.SERVER_PUBLIC_JWK || null;
    },

    // 'valid' | 'invalid' | 'unchecked' (no server key configured for that id)
    async verifyServerSignature(attestation, signatureBase64, keyId) {
        const jwk = this.serverPublicKey(keyId);
        if (!jwk) return 'unchecked';
        try {
            const ok = await this.verifyBadge(attestation, signatureBase64, jwk);
            return ok ? 'valid' : 'invalid';
        } catch (error) {
            return 'invalid';
        }
    },

    // Split a badge into what the device signed and what was added afterwards.
    signedPart(badge) {
        const out = {};
        for (const k of Object.keys(badge)) if (!this.UNSIGNED_FIELDS.includes(k)) out[k] = badge[k];
        return out;
    },

    async hashBadge(badgeBase64) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(badgeBase64);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);

            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            return hashHex.substring(0, 16); // First 16 chars
        } catch (error) {
            console.error('Hashing error:', error);
            return null;
        }
    },

    // Get previous badge hash from storage
    async getPreviousBadgeHash() {
        try {
            const stored = await chrome.storage.local.get(['lastBadgeHash']);
            return stored.lastBadgeHash || null;
        } catch (error) {
            return null;
        }
    },

    // Store current badge hash for next badge
    async storeBadgeHash(badgeBase64) {
        try {
            const hash = await this.hashBadge(badgeBase64);
            if (hash) {
                await chrome.storage.local.set({ lastBadgeHash: hash });
            }
            return hash;
        } catch (error) {
            return null;
        }
    }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CryptoUtils;
}
