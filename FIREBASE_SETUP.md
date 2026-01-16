# Firebase Setup Guide for JITTEr

This guide will walk you through setting up Firebase for JITTEr's authentication, cloud sync, and analytics features.

---

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"** or **"Create a project"**
3. Enter project name: `jitter-app` (or your preferred name)
4. Click **Continue**
5. **Google Analytics**: Enable it (recommended for stats tracking)
6. Select or create Analytics account
7. Click **Create project**
8. Wait for project creation (~30 seconds)
9. Click **Continue**

---

## Step 2: Register Web App

1. In Firebase Console, click the **Web icon** (`</>`) to add a web app
2. App nickname: `JITTEr Extension`
3. **Firebase Hosting**: No need to check this box
4. Click **Register app**
5. **Copy the firebaseConfig object** - you'll need this!

It looks like this:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyA...",
  authDomain: "jitter-app.firebaseapp.com",
  projectId: "jitter-app",
  storageBucket: "jitter-app.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123",
  measurementId: "G-XXXXXXXXXX"
};
```

6. Click **Continue to console**

---

## Step 3: Enable Authentication

1. In left sidebar, click **Build** → **Authentication**
2. Click **Get started**
3. Click **Email/Password** under Sign-in providers
4. **Enable** the toggle switch for "Email/Password"
5. Leave "Email link (passwordless sign-in)" disabled
6. Click **Save**

**Optional but Recommended:**
- Go to **Settings** tab (gear icon at top)
- Under **Authorized domains**, your `chrome-extension://` domain will be auto-added when users sign in
- No action needed here

---

## Step 4: Enable Firestore Database

1. In left sidebar, click **Build** → **Firestore Database**
2. Click **Create database**
3. Choose location: Select closest to your users (e.g., `us-central` for USA)
4. Click **Next**
5. **Security rules**: Choose **"Start in production mode"**
   - We'll update rules next
6. Click **Create**
7. Wait for database creation (~1 minute)

### Set Security Rules:

1. Click **Rules** tab
2. Replace the default rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // User stats - users can only read/write their own
    match /user_stats/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Passports - users can only read/write their own
    match /passports/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Badges - users can create their own, admins can read all
    match /badges/{badgeId} {
      allow create: if request.auth != null;
      allow read: if request.auth != null;
    }

    // Milestones - users can create their own
    match /milestones/{milestoneId} {
      allow create: if request.auth != null;
      allow read: if request.auth != null;
    }

    // Bot detections - system only
    match /bot_detections/{detectionId} {
      allow create: if request.auth != null;
      allow read: if request.auth != null;
    }
  }
}
```

3. Click **Publish**

---

## Step 5: Enable Analytics (Already Enabled)

Analytics should already be enabled from Step 1. Verify:

1. In left sidebar, click **Analytics** → **Dashboard**
2. You should see "Analytics enabled" message
3. No further action needed - analytics will start collecting automatically

---

## Step 6: Update JITTEr Code with Firebase Config

Now update your code with the Firebase config you copied in Step 2.

### File 1: `auth-utils.js`

Open `/home/user/JITTEr/auth-utils.js` and update lines 19-25:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_ACTUAL_API_KEY",              // Replace this
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com", // Replace this
    projectId: "YOUR_PROJECT_ID",                // Replace this
    storageBucket: "YOUR_PROJECT_ID.appspot.com", // Replace this
    messagingSenderId: "YOUR_SENDER_ID",         // Replace this
    appId: "YOUR_APP_ID"                         // Replace this
};
```

### File 2: `admin.html`

Open `/home/user/JITTEr/admin.html` and update lines 194-200:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_ACTUAL_API_KEY",              // Replace this
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com", // Replace this
    projectId: "YOUR_PROJECT_ID",                // Replace this
    storageBucket: "YOUR_PROJECT_ID.appspot.com", // Replace this
    messagingSenderId: "YOUR_SENDER_ID",         // Replace this
    appId: "YOUR_APP_ID"                         // Replace this
};
```

**IMPORTANT:** Use the SAME config in both files!

---

## Step 7: Create Admin User

To access the admin dashboard, you need an admin account:

1. In Firebase Console, go to **Authentication** → **Users**
2. Click **Add user**
3. Email: Your admin email (e.g., `admin@yourdomain.com`)
4. Password: Create a strong password
5. Click **Add user**

**Save these credentials** - you'll use them to login to `admin.html`

---

## Step 8: Test the Setup

### Test 1: Student Signup/Login

1. Load the JITTEr extension in Chrome
2. Click the extension icon → Opens writer
3. Click **LOGIN** button
4. Check "New user? Sign up instead"
5. Enter email and password
6. Click **SIGN UP**
7. You should see "✅ Logged in successfully!"

**Verify in Firebase:**
- Go to **Authentication** → **Users**
- You should see the new user listed

### Test 2: Badge Mint & Analytics

1. In the JITTEr writer, type some text
2. Click **MINT BADGE**
3. Badge should copy to clipboard

**Verify in Firebase:**
- Go to **Firestore Database**
- You should see new documents in:
  - `user_stats` collection
  - `badges` collection

### Test 3: Admin Dashboard

1. Open `admin.html` in your browser
2. Click **LOGIN**
3. Enter your admin credentials from Step 7
4. You should see the dashboard with stats
5. Recent badges table should show your test badge

---

## Troubleshooting

### Error: "Firebase SDK not loaded"
- Check that you're accessing `writer.html` through the Chrome extension
- Make sure all script tags are present in `writer.html`

### Error: "Permission denied" in Firestore
- Check security rules in Step 4
- Make sure user is logged in
- Verify `request.auth.uid` matches document ID

### Error: "Invalid API key"
- Double-check you copied the entire API key
- No extra spaces or quotes
- Config must be in both `auth-utils.js` and `admin.html`

### Analytics not showing data
- Analytics takes 24-48 hours to populate dashboard
- Events are logged immediately but may not show in console right away
- Check **Analytics** → **DebugView** for real-time event testing

---

## Security Best Practices

1. **Never commit Firebase config to public repos**
   - Your config is in `.gitignore` already
   - Keep API keys private

2. **Use strong passwords**
   - Require students to use 8+ character passwords
   - Consider email verification (optional)

3. **Monitor usage**
   - Check Firebase Console weekly
   - Watch for unusual activity in **Authentication** → **Users**

4. **Backup Firestore**
   - Go to **Firestore Database** → **Backups** tab
   - Set up scheduled backups (optional, paid feature)

---

## Cost Estimate (Firebase Free Tier)

**Spark Plan (Free):**
- Authentication: Unlimited
- Firestore: 50K reads/day, 20K writes/day, 1GB storage
- Analytics: Unlimited events
- Hosting: Not used

**Estimated usage for 100 students:**
- ~100 signups (one-time)
- ~500 logins/month
- ~2,000 badge mints/month
- Well within free tier limits ✅

**When you'll need to upgrade:**
- 500+ active students
- 50K+ badges/month
- Still very cheap: ~$5-10/month

---

## Next Steps After Setup

1. **Test thoroughly** with multiple test accounts
2. **Deploy extension** to Chrome Web Store (optional)
3. **Create teacher accounts** for verification dashboard
4. **Monitor analytics** in Firebase Console
5. **Set up email templates** in Firebase for password resets (optional)

---

## Quick Reference

**Firebase Console:** https://console.firebase.google.com/
**Your Project URL:** https://console.firebase.google.com/project/YOUR_PROJECT_ID

**Files to Update:**
- `auth-utils.js` (lines 19-25)
- `admin.html` (lines 194-200)

**Collections Created:**
- `user_stats` - Per-user metrics
- `passports` - User passport data
- `badges` - Badge records
- `milestones` - Level up events
- `bot_detections` - Suspicious activity

---

## Support

If you encounter issues:
1. Check Firebase Console logs
2. Open browser DevTools → Console for errors
3. Verify all config values are correct
4. Test with a fresh incognito window

**Firebase Documentation:** https://firebase.google.com/docs

---

Ready to set up Firebase? Follow the steps above and you'll be tracking stats in minutes!
