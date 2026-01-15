// auth-utils.js - Firebase Authentication & Cloud Sync for JITTEr Passport
// Privacy-first: Only syncs passport data, NEVER essay content

const AuthUtils = (() => {
    // Firebase Configuration
    // IMPORTANT: Replace these with your actual Firebase project config
    // Get this from Firebase Console → Project Settings → Web App
    const firebaseConfig = {
        apiKey: "YOUR_API_KEY_HERE",
        authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
        projectId: "YOUR_PROJECT_ID",
        storageBucket: "YOUR_PROJECT_ID.appspot.com",
        messagingSenderId: "YOUR_SENDER_ID",
        appId: "YOUR_APP_ID"
    };

    let auth = null;
    let db = null;
    let currentUser = null;
    let lastSyncTime = null;

    // Initialize Firebase
    async function init() {
        try {
            // Check if Firebase is loaded
            if (typeof firebase === 'undefined') {
                console.error('Firebase SDK not loaded');
                return false;
            }

            // Initialize Firebase App
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }

            auth = firebase.auth();
            db = firebase.firestore();

            // Listen for auth state changes
            auth.onAuthStateChanged((user) => {
                currentUser = user;
                updateAuthUI();

                if (user) {
                    console.log('User logged in:', user.email);
                    // Auto-sync on login
                    syncFromCloud().catch(err => console.error('Auto-sync failed:', err));
                } else {
                    console.log('User logged out');
                }
            });

            return true;
        } catch (error) {
            console.error('Firebase init error:', error);
            return false;
        }
    }

    // Sign up new user
    async function signup(email, password) {
        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            currentUser = userCredential.user;

            // Initialize cloud passport document
            await db.collection('passports').doc(currentUser.uid).set({
                email: email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
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

            return { success: true, user: currentUser };
        } catch (error) {
            console.error('Signup error:', error);
            return { success: false, error: error.message };
        }
    }

    // Login existing user
    async function login(email, password) {
        try {
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            currentUser = userCredential.user;

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
            await auth.signOut();
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
            const docRef = db.collection('passports').doc(currentUser.uid);
            const doc = await docRef.get();

            if (!doc.exists) {
                // First sync - upload local passport
                await docRef.set({
                    email: currentUser.email,
                    lastSynced: firebase.firestore.FieldValue.serverTimestamp(),
                    passport: localPassport
                });
                lastSyncTime = Date.now();
                return { success: true, action: 'uploaded', passport: localPassport };
            }

            const cloudData = doc.data();
            const cloudPassport = cloudData.passport;

            // Merge strategy: Keep passport with MORE keystrokes
            const mergedPassport = mergePassports(localPassport, cloudPassport);

            // Upload merged result
            await docRef.update({
                lastSynced: firebase.firestore.FieldValue.serverTimestamp(),
                passport: mergedPassport
            });

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
            const docRef = db.collection('passports').doc(currentUser.uid);
            const doc = await docRef.get();

            if (!doc.exists) {
                return { success: false, error: 'No cloud passport found' };
            }

            const cloudData = doc.data();
            const cloudPassport = cloudData.passport;

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
                await docRef.update({
                    lastSynced: firebase.firestore.FieldValue.serverTimestamp(),
                    passport: mergedPassport
                });
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
            await db.collection('passports').doc(currentUser.uid).delete();
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
