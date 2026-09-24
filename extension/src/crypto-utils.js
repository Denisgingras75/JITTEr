// crypto-utils.js - Cryptographic utilities for badge verification
// Uses Web Crypto API for ECDSA signatures (no external dependencies)

const CryptoUtils = {
    // Generate or retrieve user's key pair
    async getOrCreateKeyPair() {
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
            const keyPair = await this.getOrCreateKeyPair();
            if (!keyPair) return null;

            const dataString = CryptoUtils.canonicalJson(badgeData);
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
