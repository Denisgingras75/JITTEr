/**
 * stats-utils.js - Firebase Analytics & Statistics Tracking for JITTEr
 *
 * Copyright (c) 2025-2026 Denis Gingras. All Rights Reserved.
 *
 * PROPRIETARY AND CONFIDENTIAL
 * This file contains proprietary analytics and statistics tracking.
 * Privacy-first: Aggregated stats only, no PII tracking.
 *
 * Unauthorized copying, modification, distribution, or use of this
 * software is strictly prohibited without explicit written permission.
 * See LICENSE file for full terms.
 */

const StatsUtils = (() => {
    let analytics = null;
    let db = null;

    // Initialize Firebase Analytics
    async function init() {
        try {
            if (typeof firebase === 'undefined') {
                console.error('Firebase SDK not loaded');
                return false;
            }

            // Get analytics instance
            if (firebase.analytics) {
                analytics = firebase.analytics();
                console.log('Firebase Analytics initialized');
            }

            // Get Firestore instance
            if (firebase.firestore) {
                db = firebase.firestore();
                console.log('Firestore initialized for stats');
            }

            return true;
        } catch (error) {
            console.error('Stats init error:', error);
            return false;
        }
    }

    // Track user signup
    async function trackSignup(userId, method = 'email') {
        try {
            // Firebase Analytics event
            if (analytics) {
                analytics.logEvent('sign_up', {
                    method: method
                });
            }

            // Store in Firestore
            if (db && userId) {
                await db.collection('user_stats').doc(userId).set({
                    signupDate: firebase.firestore.FieldValue.serverTimestamp(),
                    signupMethod: method,
                    totalBadges: 0,
                    totalKeystrokes: 0,
                    totalSessions: 0,
                    lastActive: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            console.log('Tracked signup for user:', userId);
        } catch (error) {
            console.error('Track signup error:', error);
        }
    }

    // Track user login
    async function trackLogin(userId, method = 'email') {
        try {
            // Firebase Analytics event
            if (analytics) {
                analytics.logEvent('login', {
                    method: method
                });
            }

            // Update last active time
            if (db && userId) {
                await db.collection('user_stats').doc(userId).update({
                    lastActive: firebase.firestore.FieldValue.serverTimestamp(),
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            console.log('Tracked login for user:', userId);
        } catch (error) {
            console.error('Track login error:', error);
        }
    }

    // Track badge mint
    async function trackBadgeMint(userId, badgeData) {
        try {
            // Firebase Analytics event
            if (analytics) {
                analytics.logEvent('badge_mint', {
                    integrity: badgeData.integrity || 0,
                    cognitive_ratio: badgeData.cognitiveRatio || 0,
                    passport_level: badgeData.passportLevel || 'Novice',
                    suspicion_score: badgeData.suspicionScore || 0
                });
            }

            // Update user stats
            if (db && userId) {
                const userStatsRef = db.collection('user_stats').doc(userId);

                await userStatsRef.update({
                    totalBadges: firebase.firestore.FieldValue.increment(1),
                    totalKeystrokes: firebase.firestore.FieldValue.increment(badgeData.keystrokes || 0),
                    lastActive: firebase.firestore.FieldValue.serverTimestamp(),
                    lastBadgeMint: firebase.firestore.FieldValue.serverTimestamp()
                });

                // Store individual badge record
                await db.collection('badges').add({
                    userId: userId,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    integrity: badgeData.integrity || 0,
                    cognitiveRatio: badgeData.cognitiveRatio || 0,
                    entropy: badgeData.entropy || 0,
                    keystrokes: badgeData.keystrokes || 0,
                    wordCount: badgeData.wordCount || 0,
                    sessionDuration: badgeData.sessionDuration || 0,
                    passportLevel: badgeData.passportLevel || 'Novice',
                    passportTotal: badgeData.passportTotal || 0,
                    suspicionScore: badgeData.suspicionScore || 0,
                    riskLevel: badgeData.riskLevel || 'LOW'
                });
            }

            console.log('Tracked badge mint');
        } catch (error) {
            console.error('Track badge mint error:', error);
        }
    }

    // Track session completion
    async function trackSessionComplete(userId, sessionData) {
        try {
            // Firebase Analytics event
            if (analytics) {
                analytics.logEvent('session_complete', {
                    duration: sessionData.duration || 0,
                    keystrokes: sessionData.keystrokes || 0,
                    words: sessionData.words || 0
                });
            }

            // Update user stats
            if (db && userId) {
                await db.collection('user_stats').doc(userId).update({
                    totalSessions: firebase.firestore.FieldValue.increment(1),
                    lastActive: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            console.log('Tracked session complete');
        } catch (error) {
            console.error('Track session complete error:', error);
        }
    }

    // Track passport level up
    async function trackLevelUp(userId, newLevel, totalKeystrokes) {
        try {
            // Firebase Analytics event
            if (analytics) {
                analytics.logEvent('level_up', {
                    level: newLevel,
                    total_keystrokes: totalKeystrokes
                });
            }

            // Store milestone
            if (db && userId) {
                await db.collection('milestones').add({
                    userId: userId,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    type: 'level_up',
                    level: newLevel,
                    totalKeystrokes: totalKeystrokes
                });
            }

            console.log('Tracked level up to:', newLevel);
        } catch (error) {
            console.error('Track level up error:', error);
        }
    }

    // Track bot detection trigger
    async function trackBotDetection(userId, suspicionScore, signals) {
        try {
            // Firebase Analytics event
            if (analytics) {
                analytics.logEvent('bot_detection', {
                    suspicion_score: suspicionScore,
                    signal_count: signals?.length || 0
                });
            }

            // Store bot detection event
            if (db && userId) {
                await db.collection('bot_detections').add({
                    userId: userId,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    suspicionScore: suspicionScore,
                    signals: signals || [],
                    passportData: {
                        // Store relevant passport data for analysis
                    }
                });
            }

            console.log('Tracked bot detection:', suspicionScore);
        } catch (error) {
            console.error('Track bot detection error:', error);
        }
    }

    // Get user stats
    async function getUserStats(userId) {
        if (!db || !userId) {
            return null;
        }

        try {
            const doc = await db.collection('user_stats').doc(userId).get();
            if (doc.exists) {
                return doc.data();
            }
            return null;
        } catch (error) {
            console.error('Get user stats error:', error);
            return null;
        }
    }

    // Get global aggregate stats (for admin dashboard)
    async function getGlobalStats() {
        if (!db) {
            return null;
        }

        try {
            // Get total users
            const usersSnapshot = await db.collection('user_stats').get();
            const totalUsers = usersSnapshot.size;

            // Get total badges
            const badgesSnapshot = await db.collection('badges').get();
            const totalBadges = badgesSnapshot.size;

            // Calculate averages
            let totalIntegrity = 0;
            let totalSuspicion = 0;
            let botCount = 0;

            badgesSnapshot.forEach(doc => {
                const data = doc.data();
                totalIntegrity += data.integrity || 0;
                totalSuspicion += data.suspicionScore || 0;
                if ((data.suspicionScore || 0) > 70) {
                    botCount++;
                }
            });

            const avgIntegrity = totalBadges > 0 ? totalIntegrity / totalBadges : 0;
            const avgSuspicion = totalBadges > 0 ? totalSuspicion / totalBadges : 0;
            const botDetectionRate = totalBadges > 0 ? (botCount / totalBadges) * 100 : 0;

            return {
                totalUsers: totalUsers,
                totalBadges: totalBadges,
                avgIntegrity: Math.round(avgIntegrity),
                avgSuspicion: Math.round(avgSuspicion),
                botDetectionRate: Math.round(botDetectionRate * 10) / 10,
                botCount: botCount,
                timestamp: Date.now()
            };
        } catch (error) {
            console.error('Get global stats error:', error);
            return null;
        }
    }

    // Get recent badges (for admin dashboard)
    async function getRecentBadges(limit = 10) {
        if (!db) {
            return [];
        }

        try {
            const snapshot = await db.collection('badges')
                .orderBy('timestamp', 'desc')
                .limit(limit)
                .get();

            const badges = [];
            snapshot.forEach(doc => {
                badges.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            return badges;
        } catch (error) {
            console.error('Get recent badges error:', error);
            return [];
        }
    }

    // Track custom event
    async function trackEvent(eventName, eventParams = {}) {
        try {
            if (analytics) {
                analytics.logEvent(eventName, eventParams);
            }
            console.log('Tracked event:', eventName, eventParams);
        } catch (error) {
            console.error('Track event error:', error);
        }
    }

    // Set user properties
    async function setUserProperties(userId, properties) {
        try {
            if (analytics) {
                analytics.setUserProperties(properties);
            }

            if (db && userId) {
                await db.collection('user_stats').doc(userId).update({
                    properties: properties,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            console.log('Set user properties');
        } catch (error) {
            console.error('Set user properties error:', error);
        }
    }

    // Public API
    return {
        init,
        trackSignup,
        trackLogin,
        trackBadgeMint,
        trackSessionComplete,
        trackLevelUp,
        trackBotDetection,
        getUserStats,
        getGlobalStats,
        getRecentBadges,
        trackEvent,
        setUserProperties
    };
})();
