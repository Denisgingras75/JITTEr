/**
 * stats-utils.js - Supabase Analytics & Statistics Tracking for JITTEr
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
    let supabase = null;

    // Initialize with Supabase client
    async function init(supabaseClient) {
        try {
            supabase = supabaseClient;
            console.log('Stats tracking initialized with Supabase');
            return true;
        } catch (error) {
            console.error('Stats init error:', error);
            return false;
        }
    }

    // Track user signup
    async function trackSignup(userId, method = 'email') {
        if (!supabase || !userId) return;

        try {
            await supabase
                .from('user_stats')
                .insert([{
                    user_id: userId,
                    signup_method: method,
                    total_badges: 0,
                    total_keystrokes: 0,
                    total_sessions: 0,
                    last_active: new Date().toISOString(),
                    created_at: new Date().toISOString()
                }]);

            console.log('Tracked signup for user:', userId);
        } catch (error) {
            console.error('Track signup error:', error);
        }
    }

    // Track user login
    async function trackLogin(userId, method = 'email') {
        if (!supabase || !userId) return;

        try {
            await supabase
                .from('user_stats')
                .update({
                    last_active: new Date().toISOString(),
                    last_login: new Date().toISOString()
                })
                .eq('user_id', userId);

            console.log('Tracked login for user:', userId);
        } catch (error) {
            console.error('Track login error:', error);
        }
    }

    // Track badge mint
    async function trackBadgeMint(userId, badgeData) {
        if (!supabase || !userId) return;

        try {
            // Update user stats
            const { data: currentStats } = await supabase
                .from('user_stats')
                .select('total_badges, total_keystrokes')
                .eq('user_id', userId)
                .single();

            if (currentStats) {
                await supabase
                    .from('user_stats')
                    .update({
                        total_badges: (currentStats.total_badges || 0) + 1,
                        total_keystrokes: (currentStats.total_keystrokes || 0) + (badgeData.keystrokes || 0),
                        last_active: new Date().toISOString(),
                        last_badge_mint: new Date().toISOString()
                    })
                    .eq('user_id', userId);
            }

            // Store individual badge record
            await supabase
                .from('badges')
                .insert([{
                    user_id: userId,
                    integrity: badgeData.integrity || 0,
                    cognitive_ratio: badgeData.cognitiveRatio || 0,
                    entropy: badgeData.entropy || 0,
                    keystrokes: badgeData.keystrokes || 0,
                    word_count: badgeData.wordCount || 0,
                    session_duration: badgeData.sessionDuration || 0,
                    passport_level: badgeData.passportLevel || 'Novice',
                    passport_total: badgeData.passportTotal || 0,
                    suspicion_score: badgeData.suspicionScore || 0,
                    risk_level: badgeData.riskLevel || 'LOW',
                    created_at: new Date().toISOString()
                }]);

            console.log('Tracked badge mint');
        } catch (error) {
            console.error('Track badge mint error:', error);
        }
    }

    // Track session completion
    async function trackSessionComplete(userId, sessionData) {
        if (!supabase || !userId) return;

        try {
            const { data: currentStats } = await supabase
                .from('user_stats')
                .select('total_sessions')
                .eq('user_id', userId)
                .single();

            if (currentStats) {
                await supabase
                    .from('user_stats')
                    .update({
                        total_sessions: (currentStats.total_sessions || 0) + 1,
                        last_active: new Date().toISOString()
                    })
                    .eq('user_id', userId);
            }

            console.log('Tracked session complete');
        } catch (error) {
            console.error('Track session complete error:', error);
        }
    }

    // Track passport level up
    async function trackLevelUp(userId, newLevel, totalKeystrokes) {
        if (!supabase || !userId) return;

        try {
            await supabase
                .from('milestones')
                .insert([{
                    user_id: userId,
                    milestone_type: 'level_up',
                    level: newLevel,
                    total_keystrokes: totalKeystrokes,
                    created_at: new Date().toISOString()
                }]);

            console.log('Tracked level up to:', newLevel);
        } catch (error) {
            console.error('Track level up error:', error);
        }
    }

    // Track bot detection trigger
    async function trackBotDetection(userId, suspicionScore, signals) {
        if (!supabase || !userId) return;

        try {
            await supabase
                .from('bot_detections')
                .insert([{
                    user_id: userId,
                    suspicion_score: suspicionScore,
                    signals: signals || [],
                    created_at: new Date().toISOString()
                }]);

            console.log('Tracked bot detection:', suspicionScore);
        } catch (error) {
            console.error('Track bot detection error:', error);
        }
    }

    // Get user stats
    async function getUserStats(userId) {
        if (!supabase || !userId) return null;

        try {
            const { data, error } = await supabase
                .from('user_stats')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Get user stats error:', error);
            return null;
        }
    }

    // Get global aggregate stats (for admin dashboard)
    async function getGlobalStats() {
        if (!supabase) return null;

        try {
            // Get total users
            const { count: totalUsers } = await supabase
                .from('user_stats')
                .select('*', { count: 'exact', head: true });

            // Get total badges and calculate averages
            const { data: badges, count: totalBadges } = await supabase
                .from('badges')
                .select('integrity, suspicion_score, risk_level', { count: 'exact' });

            if (!badges || badges.length === 0) {
                return {
                    totalUsers: totalUsers || 0,
                    totalBadges: 0,
                    avgIntegrity: 0,
                    avgSuspicion: 0,
                    botDetectionRate: 0,
                    botCount: 0,
                    timestamp: Date.now()
                };
            }

            // Calculate averages
            const totalIntegrity = badges.reduce((sum, b) => sum + (b.integrity || 0), 0);
            const totalSuspicion = badges.reduce((sum, b) => sum + (b.suspicion_score || 0), 0);
            const botCount = badges.filter(b => (b.suspicion_score || 0) > 70).length;

            const avgIntegrity = Math.round(totalIntegrity / badges.length);
            const avgSuspicion = Math.round(totalSuspicion / badges.length);
            const botDetectionRate = Math.round((botCount / badges.length) * 1000) / 10;

            return {
                totalUsers: totalUsers || 0,
                totalBadges: totalBadges || 0,
                avgIntegrity: avgIntegrity,
                avgSuspicion: avgSuspicion,
                botDetectionRate: botDetectionRate,
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
        if (!supabase) return [];

        try {
            const { data, error } = await supabase
                .from('badges')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;

            return data || [];
        } catch (error) {
            console.error('Get recent badges error:', error);
            return [];
        }
    }

    // Track custom event (not implemented for Supabase, but kept for API compatibility)
    async function trackEvent(eventName, eventParams = {}) {
        console.log('Custom event:', eventName, eventParams);
        // Can be implemented with a custom events table if needed
    }

    // Set user properties (not implemented for Supabase, but kept for API compatibility)
    async function setUserProperties(userId, properties) {
        if (!supabase || !userId) return;

        try {
            await supabase
                .from('user_stats')
                .update({
                    properties: properties,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId);

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
