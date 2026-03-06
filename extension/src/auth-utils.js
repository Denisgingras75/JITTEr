/**
 * auth-utils.js - Supabase Authentication & Cloud Sync for JITTEr Passport
 *
 * Copyright (c) 2025-2026 Denis Gingras. All Rights Reserved.
 *
 * PROPRIETARY AND CONFIDENTIAL
 * This file contains proprietary cloud synchronization algorithms.
 * Privacy-first: Only syncs passport data, NEVER essay content
 *
 * Unauthorized copying, modification, distribution, or use of this
 * software is strictly prohibited without explicit written permission.
 * See LICENSE file for full terms.
 */

const AuthUtils = (() => {
    // Supabase Configuration
    // IMPORTANT: Replace these with your actual Supabase project config
    // Get this from Supabase Dashboard → Settings → API
    const SUPABASE_URL = 'YOUR_SUPABASE_URL_HERE';
    const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY_HERE';

    let supabase = null;
    let currentUser = null;
    let lastSyncTime = null;
    let authSubscription = null;

    // Initialize Supabase
    async function init() {
        try {
            if (typeof window.supabase === 'undefined' &&
                typeof globalThis.supabaseClient === 'undefined') {
                console.error('Supabase SDK not loaded');
                return false;
            }

            const createClient = window.supabase?.createClient ||
                                 globalThis.supabaseClient?.createClient;

            if (!createClient) {
                console.error('Supabase createClient not found');
                return false;
            }

            supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: {
                    storage: {
                        getItem: (key) => new Promise((resolve) => {
                            chrome.storage.local.get([key], (data) => resolve(data[key] || null));
                        }),
                        setItem: (key, value) => new Promise((resolve) => {
                            chrome.storage.local.set({ [key]: value }, resolve);
                        }),
                        removeItem: (key) => new Promise((resolve) => {
                            chrome.storage.local.remove(key, resolve);
                        })
                    },
                    autoRefreshToken: true,
                    persistSession: true,
                    detectSessionInUrl: false
                }
            });

            // Listen for auth state changes
            const { data } = supabase.auth.onAuthStateChange((event, session) => {
                currentUser = session?.user || null;
                updateAuthUI();

                if (currentUser) {
                    console.log('User logged in:', currentUser.email);
                    syncFromCloud().catch(err => console.error('Auto-sync failed:', err));
                } else {
                    console.log('User logged out');
                }
            });
            authSubscription = data.subscription;

            // Check for existing session
            const { data: sessionData } = await supabase.auth.getSession();
            if (sessionData.session) {
                currentUser = sessionData.session.user;
                updateAuthUI();
            }

            return true;
        } catch (error) {
            console.error('Supabase init error:', error);
            return false;
        }
    }

    // Sign up new user
    async function signup(email, password) {
        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password
            });

            if (error) throw error;

            currentUser = data.user;

            // Initialize cloud passport row
            const { error: insertError } = await supabase
                .from('passports')
                .insert({
                    user_id: currentUser.id,
                    email: email,
                    passport: {
                        totalKeystrokes: 0,
                        level: "Novice",
                        firstUsed: Date.now(),
                        lastUsed: Date.now(),
                        sessionsCompleted: 0,
                        dailyStats: {},
                        hourlyPattern: new Array(24).fill(0),
                        sessionHistory: { lengths: [], timestamps: [] },
                        avgSessionLength: 0,
                        longestSession: 0,
                        sessionLengthVariance: 0,
                        avgDailyKeys: 0,
                        dailyVariance: 0,
                        suspicionScore: 0,
                        suspicionSignals: []
                    }
                });

            if (insertError) throw insertError;

            return { success: true, user: currentUser };
        } catch (error) {
            console.error('Signup error:', error);
            return { success: false, error: error.message };
        }
    }

    // Login existing user
    async function login(email, password) {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            currentUser = data.user;

            // Sync passport from cloud
            await syncFromCloud();

            return { success: true, user: currentUser };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: error.message };
        }
    }

    // Logout
    async function logout() {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;

            currentUser = null;
            lastSyncTime = null;
            return { success: true };
        } catch (error) {
            console.error('Logout error:', error);
            return { success: false, error: error.message };
        }
    }

    // Sync passport TO cloud (backup)
    async function syncToCloud(localPassport) {
        if (!currentUser) {
            return { success: false, error: 'Not logged in' };
        }

        try {
            // Get cloud passport
            const { data: row, error: fetchError } = await supabase
                .from('passports')
                .select('passport')
                .eq('user_id', currentUser.id)
                .maybeSingle();

            if (fetchError) throw fetchError;

            if (!row) {
                // First sync - insert local passport
                const { error: insertError } = await supabase
                    .from('passports')
                    .insert({
                        user_id: currentUser.id,
                        email: currentUser.email,
                        last_synced: new Date().toISOString(),
                        passport: localPassport
                    });

                if (insertError) throw insertError;

                lastSyncTime = Date.now();
                return { success: true, action: 'uploaded', passport: localPassport };
            }

            const cloudPassport = row.passport;

            // Merge strategy: Keep passport with MORE keystrokes
            const mergedPassport = mergePassports(localPassport, cloudPassport);

            // Upload merged result
            const { error: updateError } = await supabase
                .from('passports')
                .update({
                    last_synced: new Date().toISOString(),
                    passport: mergedPassport
                })
                .eq('user_id', currentUser.id);

            if (updateError) throw updateError;

            lastSyncTime = Date.now();

            return {
                success: true,
                action: 'merged',
                passport: mergedPassport,
                wasMerged: JSON.stringify(mergedPassport) !== JSON.stringify(localPassport)
            };
        } catch (error) {
            console.error('Sync to cloud error:', error);
            return { success: false, error: error.message };
        }
    }

    // Sync passport FROM cloud (restore)
    async function syncFromCloud() {
        if (!currentUser) {
            return { success: false, error: 'Not logged in' };
        }

        try {
            const { data: row, error: fetchError } = await supabase
                .from('passports')
                .select('passport')
                .eq('user_id', currentUser.id)
                .maybeSingle();

            if (fetchError) throw fetchError;

            if (!row) {
                return { success: false, error: 'No cloud passport found' };
            }

            const cloudPassport = row.passport;

            // Get local passport
            const result = await new Promise((resolve) => {
                chrome.storage.local.get(['passport'], (data) => {
                    resolve(data.passport || null);
                });
            });

            const localPassport = result;

            if (!localPassport) {
                // No local passport - use cloud version
                await new Promise((resolve) => {
                    chrome.storage.local.set({ passport: cloudPassport }, resolve);
                });
                lastSyncTime = Date.now();
                return { success: true, action: 'downloaded', passport: cloudPassport };
            }

            // Merge strategy
            const mergedPassport = mergePassports(localPassport, cloudPassport);

            // Save merged passport locally
            await new Promise((resolve) => {
                chrome.storage.local.set({ passport: mergedPassport }, resolve);
            });

            // Update cloud if merge changed anything
            if (JSON.stringify(mergedPassport) !== JSON.stringify(cloudPassport)) {
                const { error: updateError } = await supabase
                    .from('passports')
                    .update({
                        last_synced: new Date().toISOString(),
                        passport: mergedPassport
                    })
                    .eq('user_id', currentUser.id);

                if (updateError) throw updateError;
            }

            lastSyncTime = Date.now();

            return {
                success: true,
                action: 'merged',
                passport: mergedPassport,
                wasMerged: JSON.stringify(mergedPassport) !== JSON.stringify(localPassport)
            };
        } catch (error) {
            console.error('Sync from cloud error:', error);
            return { success: false, error: error.message };
        }
    }

    // Merge two passports — deep merge preserving history from both devices
    function mergePassports(local, cloud) {
        // Use the richer passport as the base (more total keystrokes = more history)
        const base = local.totalKeystrokes >= cloud.totalKeystrokes ? local : cloud;
        const other = local.totalKeystrokes >= cloud.totalKeystrokes ? cloud : local;

        // Merge dailyStats: take the max for each day (avoid double-counting same-device data)
        const mergedDailyStats = {};
        const allDays = new Set([
            ...Object.keys(base.dailyStats || {}),
            ...Object.keys(other.dailyStats || {})
        ]);
        for (const day of allDays) {
            mergedDailyStats[day] = Math.max(
                base.dailyStats?.[day] || 0,
                other.dailyStats?.[day] || 0
            );
        }

        // Merge hourlyPattern: sum both (different devices, different hours)
        const mergedHourly = (base.hourlyPattern || new Array(24).fill(0)).map(
            (v, i) => v + (other.hourlyPattern?.[i] || 0)
        );

        // Merge sessionHistory: deduplicate by startTime
        const baseSessions = base.sessionHistory?.timestamps || [];
        const otherSessions = other.sessionHistory?.timestamps || [];
        const baseLengths = base.sessionHistory?.lengths || [];
        const otherLengths = other.sessionHistory?.lengths || [];

        const seen = new Set(baseSessions);
        const mergedTimestamps = [...baseSessions];
        const mergedLengths = [...baseLengths];
        otherSessions.forEach((ts, i) => {
            if (!seen.has(ts)) {
                mergedTimestamps.push(ts);
                mergedLengths.push(otherLengths[i] || 0);
            }
        });

        return {
            ...base,
            totalKeystrokes: Math.max(local.totalKeystrokes || 0, cloud.totalKeystrokes || 0),
            firstUsed: Math.min(local.firstUsed || Date.now(), cloud.firstUsed || Date.now()),
            lastUsed: Math.max(local.lastUsed || 0, cloud.lastUsed || 0),
            sessionsCompleted: Math.max(local.sessionsCompleted || 0, cloud.sessionsCompleted || 0),
            dailyStats: mergedDailyStats,
            hourlyPattern: mergedHourly,
            sessionHistory: { timestamps: mergedTimestamps, lengths: mergedLengths }
        };
    }

    // Delete cloud data (privacy feature)
    async function deleteCloudData() {
        if (!currentUser) {
            return { success: false, error: 'Not logged in' };
        }

        try {
            const { error } = await supabase
                .from('passports')
                .delete()
                .eq('user_id', currentUser.id);

            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('Delete cloud data error:', error);
            return { success: false, error: error.message };
        }
    }

    // Get sync status
    function getSyncStatus() {
        return {
            isLoggedIn: !!currentUser,
            userEmail: currentUser?.email || null,
            lastSyncTime: lastSyncTime,
            timeSinceSync: lastSyncTime ? Date.now() - lastSyncTime : null
        };
    }

    // Update auth UI elements
    function updateAuthUI() {
        const authBox = document.getElementById('auth-box');
        const authEmail = document.getElementById('auth-email');
        const btnLogin = document.getElementById('btn-login');
        const btnLogout = document.getElementById('btn-logout');
        const btnSync = document.getElementById('btn-sync');
        const syncStatus = document.getElementById('sync-status');

        if (!authBox) return; // UI not loaded yet

        if (currentUser) {
            // Logged in state
            authBox.style.borderColor = '#00F0FF';
            if (authEmail) authEmail.innerText = currentUser.email;
            if (btnLogin) btnLogin.style.display = 'none';
            if (btnLogout) btnLogout.style.display = 'block';
            if (btnSync) btnSync.style.display = 'block';
            if (syncStatus) {
                syncStatus.innerText = lastSyncTime ?
                    `Synced ${formatTimeSince(lastSyncTime)}` :
                    'Not synced yet';
                syncStatus.style.color = '#00F0FF';
            }
        } else {
            // Logged out state
            authBox.style.borderColor = '#333';
            if (authEmail) authEmail.innerText = 'Not logged in';
            if (btnLogin) btnLogin.style.display = 'block';
            if (btnLogout) btnLogout.style.display = 'none';
            if (btnSync) btnSync.style.display = 'none';
            if (syncStatus) {
                syncStatus.innerText = 'Login to sync';
                syncStatus.style.color = '#666';
            }
        }
    }

    // Format time since last sync
    function formatTimeSince(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);

        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    }

    // Show login modal
    function showLoginModal() {
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.style.display = 'flex';
            document.getElementById('auth-email-input').focus();
        }
    }

    // Hide login modal
    function hideLoginModal() {
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.style.display = 'none';
            // Clear form
            document.getElementById('auth-email-input').value = '';
            document.getElementById('auth-password-input').value = '';
            document.getElementById('auth-error').innerText = '';
        }
    }

    // Handle login form submission
    async function handleLoginSubmit() {
        const email = document.getElementById('auth-email-input').value.trim();
        const password = document.getElementById('auth-password-input').value;
        const errorEl = document.getElementById('auth-error');
        const isSignup = document.getElementById('auth-mode-toggle').checked;

        if (!email || !password) {
            errorEl.innerText = 'Email and password required';
            return;
        }

        errorEl.innerText = 'Processing...';
        errorEl.style.color = '#FFD700';

        let result;
        if (isSignup) {
            result = await signup(email, password);
        } else {
            result = await login(email, password);
        }

        if (result.success) {
            hideLoginModal();
            showNotification('Logged in successfully!');
        } else {
            errorEl.innerText = result.error;
            errorEl.style.color = '#FF0055';
        }
    }

    // Handle logout
    async function handleLogout() {
        if (confirm('Logout? Your local passport will remain on this device.')) {
            const result = await logout();
            if (result.success) {
                showNotification('Logged out');
            }
        }
    }

    // Handle manual sync
    async function handleManualSync() {
        if (!currentUser) {
            showNotification('Login required to sync');
            return;
        }

        showNotification('Syncing...');

        // Get local passport
        chrome.storage.local.get(['passport'], async (data) => {
            const localPassport = data.passport;
            if (!localPassport) {
                showNotification('No local passport to sync');
                return;
            }

            const result = await syncToCloud(localPassport);

            if (result.success) {
                if (result.wasMerged) {
                    showNotification('Synced & merged with cloud');
                    // Update UI with merged passport
                    chrome.storage.local.set({ passport: result.passport });
                    if (typeof updateDashboard === 'function') updateDashboard();
                } else {
                    showNotification('Synced to cloud');
                }
                updateAuthUI();
            } else {
                showNotification('Sync failed: ' + result.error);
            }
        });
    }

    // Show notification
    function showNotification(message) {
        const notif = document.getElementById('auth-notification');
        if (notif) {
            notif.innerText = message;
            notif.style.display = 'block';
            setTimeout(() => {
                notif.style.display = 'none';
            }, 3000);
        }
    }

    // Public API
    return {
        init,
        signup,
        login,
        logout,
        syncToCloud,
        syncFromCloud,
        deleteCloudData,
        getSyncStatus,
        showLoginModal,
        hideLoginModal,
        handleLoginSubmit,
        handleLogout,
        handleManualSync,
        getCurrentUser: () => currentUser
    };
})();
