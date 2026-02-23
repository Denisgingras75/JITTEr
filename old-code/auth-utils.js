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
    // Get this from Supabase Dashboard → Project Settings → API
    const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
    const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';

    let supabase = null;
    let currentUser = null;
    let lastSyncTime = null;

    // Initialize Supabase
    async function init() {
        try {
            // Check if Supabase is loaded
            if (typeof supabase === 'undefined' && typeof window.supabase === 'undefined') {
                console.error('Supabase SDK not loaded');
                return false;
            }

            // Initialize Supabase Client
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

            // Initialize stats tracking
            if (typeof StatsUtils !== 'undefined') {
                await StatsUtils.init(supabase);
            }

            // Listen for auth state changes
            supabase.auth.onAuthStateChange((event, session) => {
                currentUser = session?.user || null;
                updateAuthUI();

                if (event === 'SIGNED_IN' && currentUser) {
                    console.log('User logged in:', currentUser.email);
                    // Auto-sync on login
                    syncFromCloud().catch(err => console.error('Auto-sync failed:', err));
                } else if (event === 'SIGNED_OUT') {
                    console.log('User logged out');
                }
            });

            // Get current session
            const { data: { session } } = await supabase.auth.getSession();
            currentUser = session?.user || null;
            updateAuthUI();

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
                email: email,
                password: password
            });

            if (error) throw error;

            currentUser = data.user;

            // Initialize passport in database
            const { error: insertError } = await supabase
                .from('passports')
                .insert([{
                    user_id: currentUser.id,
                    email: email,
                    passport_data: {
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
                    },
                    created_at: new Date().toISOString()
                }]);

            if (insertError) throw insertError;

            // Track signup event
            if (typeof StatsUtils !== 'undefined') {
                await StatsUtils.trackSignup(currentUser.id, 'email');
            }

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
                email: email,
                password: password
            });

            if (error) throw error;

            currentUser = data.user;

            // Sync passport from cloud
            await syncFromCloud();

            // Track login event
            if (typeof StatsUtils !== 'undefined') {
                await StatsUtils.trackLogin(currentUser.id, 'email');
            }

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
            const { data: existingData, error: fetchError } = await supabase
                .from('passports')
                .select('passport_data')
                .eq('user_id', currentUser.id)
                .single();

            if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

            if (!existingData) {
                // First sync - upload local passport
                const { error: insertError } = await supabase
                    .from('passports')
                    .insert([{
                        user_id: currentUser.id,
                        email: currentUser.email,
                        passport_data: localPassport,
                        last_synced: new Date().toISOString()
                    }]);

                if (insertError) throw insertError;

                lastSyncTime = Date.now();
                return { success: true, action: 'uploaded', passport: localPassport };
            }

            const cloudPassport = existingData.passport_data;

            // Merge strategy: Keep passport with MORE keystrokes
            const mergedPassport = mergePassports(localPassport, cloudPassport);

            // Upload merged result
            const { error: updateError } = await supabase
                .from('passports')
                .update({
                    passport_data: mergedPassport,
                    last_synced: new Date().toISOString()
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
            const { data, error: fetchError } = await supabase
                .from('passports')
                .select('passport_data')
                .eq('user_id', currentUser.id)
                .single();

            if (fetchError) {
                if (fetchError.code === 'PGRST116') {
                    return { success: false, error: 'No cloud passport found' };
                }
                throw fetchError;
            }

            const cloudPassport = data.passport_data;

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
                await supabase
                    .from('passports')
                    .update({
                        passport_data: mergedPassport,
                        last_synced: new Date().toISOString()
                    })
                    .eq('user_id', currentUser.id);
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

    // Merge two passports (keep highest keystroke count)
    function mergePassports(local, cloud) {
        // Simple strategy: Take the passport with more total keystrokes
        // This assumes the one with more keystrokes is more "complete"

        if (local.totalKeystrokes > cloud.totalKeystrokes) {
            return { ...local };
        } else if (cloud.totalKeystrokes > local.totalKeystrokes) {
            return { ...cloud };
        } else {
            // Same keystroke count - merge by taking newer timestamps
            return {
                ...local,
                lastUsed: Math.max(local.lastUsed || 0, cloud.lastUsed || 0),
                firstUsed: Math.min(local.firstUsed || Date.now(), cloud.firstUsed || Date.now()),
                dailyStats: { ...cloud.dailyStats, ...local.dailyStats },
                sessionHistory: {
                    lengths: [...new Set([...(cloud.sessionHistory?.lengths || []), ...(local.sessionHistory?.lengths || [])])],
                    timestamps: [...new Set([...(cloud.sessionHistory?.timestamps || []), ...(local.sessionHistory?.timestamps || [])])]
                }
            };
        }
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
            showNotification('✅ Logged in successfully!');
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
            showNotification('⚠️ Login required to sync');
            return;
        }

        showNotification('Syncing...');

        // Get local passport
        chrome.storage.local.get(['passport'], async (data) => {
            const localPassport = data.passport;
            if (!localPassport) {
                showNotification('⚠️ No local passport to sync');
                return;
            }

            const result = await syncToCloud(localPassport);

            if (result.success) {
                if (result.wasMerged) {
                    showNotification('✅ Synced & merged with cloud');
                    // Update UI with merged passport
                    chrome.storage.local.set({ passport: result.passport });
                    if (typeof updateDashboard === 'function') updateDashboard();
                } else {
                    showNotification('✅ Synced to cloud');
                }
                updateAuthUI();
            } else {
                showNotification('❌ Sync failed: ' + result.error);
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
