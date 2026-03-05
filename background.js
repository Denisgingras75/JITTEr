/**
 * background.js - JITTEr Background Service Worker
 * Manages sessions, crypto keys, and badge generation
 *
 * Copyright (c) 2025-2026 Denis Gingras. All Rights Reserved.
 */

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
    console.log('🟢 JITTEr: Extension installed');

    // Initialize passport if doesn't exist
    chrome.storage.local.get(['passport'], (result) => {
        if (!result.passport) {
            const passport = {
                userId: generateUserId(),
                createdAt: Date.now(),
                totalKeystrokes: 0,
                level: 'Novice',
                accountAgeDays: 0,
                sessionsCompleted: 0,
                totalHoursTyped: 0,
                avgCognitiveRatio: 0,
                avgEntropy: 0,
                suspicionScore: 0
            };
            chrome.storage.local.set({ passport });
        }
    });

    // Initialize crypto keys if don't exist
    initializeCryptoKeys();
});

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateState') {
        // Update extension badge
        updateBadge(request.isTracking);
    } else if (request.action === 'createBadge') {
        // Generate and sign badge
        createBadge(request.data).then(badge => {
            sendResponse({ badge });
        });
        return true; // Async response
    } else if (request.action === 'getPassport') {
        chrome.storage.local.get(['passport'], (result) => {
            sendResponse({ passport: result.passport });
        });
        return true;
    } else if (request.action === 'sessionUpdate') {
        // Update passport with session stats
        updatePassport(request.session, request.biometrics);
    } else if (request.action === 'openPopup') {
        // Open popup (can't directly, but this triggers action)
        chrome.action.openPopup();
    }
});

// Update extension icon badge
function updateBadge(isTracking) {
    if (isTracking) {
        chrome.action.setBadgeText({ text: '●' });
        chrome.action.setBadgeBackgroundColor({ color: '#00F0FF' });
    } else {
        chrome.action.setBadgeText({ text: '' });
    }
}

// Initialize crypto keys
async function initializeCryptoKeys() {
    const result = await chrome.storage.local.get(['cryptoKeys']);

    if (!result.cryptoKeys) {
        console.log('🔐 JITTEr: Generating crypto keys...');

        try {
            // Generate ECDSA P-256 key pair
            const keyPair = await crypto.subtle.generateKey(
                {
                    name: 'ECDSA',
                    namedCurve: 'P-256'
                },
                true, // extractable
                ['sign', 'verify']
            );

            // Export keys to JWK format
            const publicKey = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
            const privateKey = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

            // Generate fingerprint from public key
            const publicKeyStr = JSON.stringify(publicKey);
            const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(publicKeyStr));
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const fingerprint = hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');

            const cryptoKeys = {
                publicKey,
                privateKey,
                fingerprint
            };

            await chrome.storage.local.set({ cryptoKeys });
            console.log('🔐 JITTEr: Crypto keys generated:', fingerprint);
        } catch (error) {
            console.error('Failed to generate crypto keys:', error);
        }
    }
}

// Update passport with session data
async function updatePassport(session, biometrics) {
    const result = await chrome.storage.local.get(['passport']);
    const passport = result.passport || {};

    // Update keystroke count
    passport.totalKeystrokes = (passport.totalKeystrokes || 0) + (session.keystrokes || 0);

    // Update level based on total keystrokes
    passport.level = calculateLevel(passport.totalKeystrokes);

    // Update account age
    passport.accountAgeDays = Math.floor((Date.now() - passport.createdAt) / (1000 * 60 * 60 * 24));

    // Update averages
    if (biometrics) {
        const prevAvgCR = passport.avgCognitiveRatio || 0;
        const prevAvgEntropy = passport.avgEntropy || 0;
        const sessions = passport.sessionsCompleted || 1;

        passport.avgCognitiveRatio = ((prevAvgCR * sessions) + biometrics.cognitiveRatio) / (sessions + 1);
        passport.avgEntropy = ((prevAvgEntropy * sessions) + biometrics.entropy) / (sessions + 1);
    }

    await chrome.storage.local.set({ passport });
}

// Calculate level from total keystrokes
function calculateLevel(totalKeys) {
    if (totalKeys < 1000) return 'Novice';
    if (totalKeys < 5000) return 'Beginner';
    if (totalKeys < 15000) return 'Intermediate';
    if (totalKeys < 50000) return 'Advanced';
    if (totalKeys < 150000) return 'Expert';
    return 'Master';
}

// Create and sign badge
async function createBadge(data) {
    const { content, title, url, session, biometrics } = data;

    // Get passport and crypto keys
    const result = await chrome.storage.local.get(['passport', 'cryptoKeys', 'badgeChain']);
    const passport = result.passport;
    const cryptoKeys = result.cryptoKeys;
    const badgeChain = result.badgeChain || [];

    // Hash content
    const contentHash = await hashContent(content);

    // Create badge payload
    const badge = {
        version: '3.0',
        type: 'article',

        // Article info
        title: title,
        url: url,
        contentHash: contentHash,
        date: new Date().toISOString(),

        // Session proof
        session: {
            keystrokes: session.keystrokes,
            duration: session.duration,
            backspaces: session.backspaces,
            pasteEvents: session.pasteEvents,
            pasteChars: session.pasteChars,
            site: session.site,
            cognitiveRatio: biometrics.cognitiveRatio,
            entropy: biometrics.entropy,
            isBot: biometrics.isBot
        },

        // Passport proof
        passport: {
            totalKeystrokes: passport.totalKeystrokes,
            level: passport.level,
            accountAge: passport.accountAgeDays,
            sessions: passport.sessionsCompleted + 1,
            avgCognitiveRatio: passport.avgCognitiveRatio,
            suspicionScore: passport.suspicionScore
        },

        // Crypto
        publicKeyFingerprint: cryptoKeys.fingerprint,
        publicKey: cryptoKeys.publicKey,

        // Chain
        prevBadgeHash: badgeChain.length > 0 ? badgeChain[badgeChain.length - 1].hash : null,
        blockId: generateBlockId()
    };

    // Sign badge
    const signature = await signBadge(badge, cryptoKeys.privateKey);
    badge.signature = signature;

    // Add to chain
    const badgeHash = await hashContent(JSON.stringify(badge));
    badgeChain.push({
        hash: badgeHash,
        timestamp: Date.now(),
        blockId: badge.blockId
    });

    // Keep last 1000 badges in chain
    if (badgeChain.length > 1000) {
        badgeChain.shift();
    }

    // Update passport session count
    passport.sessionsCompleted++;

    // Save updates
    await chrome.storage.local.set({
        passport,
        badgeChain
    });

    return badge;
}

// Hash content using SHA-256
async function hashContent(content) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Sign badge with ECDSA
async function signBadge(badge, privateKeyJWK) {
    try {
        // Import private key
        const privateKey = await crypto.subtle.importKey(
            'jwk',
            privateKeyJWK,
            {
                name: 'ECDSA',
                namedCurve: 'P-256'
            },
            false,
            ['sign']
        );

        // Create payload to sign (everything except signature)
        const payload = JSON.stringify({
            contentHash: badge.contentHash,
            session: badge.session,
            passport: badge.passport,
            timestamp: badge.date
        });

        // Sign
        const encoder = new TextEncoder();
        const data = encoder.encode(payload);
        const signatureBuffer = await crypto.subtle.sign(
            {
                name: 'ECDSA',
                hash: { name: 'SHA-256' }
            },
            privateKey,
            data
        );

        // Convert to hex
        const signatureArray = Array.from(new Uint8Array(signatureBuffer));
        return signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
        console.error('Failed to sign badge:', error);
        return null;
    }
}

// Generate block ID (last 6 chars of hash)
function generateBlockId() {
    const random = crypto.getRandomValues(new Uint8Array(3));
    return '0x' + Array.from(random).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
}

// Generate user ID
function generateUserId() {
    return 'user_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
