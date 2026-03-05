# Supabase Setup Guide for JITTEr

This guide will walk you through setting up Supabase for JITTEr's authentication, cloud sync, and analytics features.

**✅ You already connected to GitHub** - Great! Now let's configure the database and get your API keys.

---

## Step 1: Create Supabase Project

1. Go to [Supabase Dashboard](https://app.supabase.com/)
2. Click **"New project"**
3. Select your organization (or create one)
4. Project settings:
   - **Name**: `jitter-app` (or your preferred name)
   - **Database Password**: Create a strong password (save this!)
   - **Region**: Select closest to your users (e.g., `us-east-1`)
   - **Pricing Plan**: Free (perfect for thousands of users)
5. Click **"Create new project"**
6. Wait ~2 minutes for project creation

---

## Step 2: Get API Keys

1. In your project dashboard, go to **Settings** → **API**
2. Copy these values (you'll need them soon):
   - **Project URL**: `https://YOUR_PROJECT_ID.supabase.co`
   - **anon public** key: `eyJh...` (long string)

**IMPORTANT**: Keep the `anon` key, NOT the `service_role` key!

---

## Step 3: Create Database Tables

Go to **SQL Editor** in the left sidebar and run these SQL commands:

### 1. Create passports table:

```sql
CREATE TABLE passports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  passport_data JSONB NOT NULL,
  last_synced TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable Row Level Security
ALTER TABLE passports ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own passport
CREATE POLICY "Users can view own passport"
  ON passports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own passport"
  ON passports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own passport"
  ON passports FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own passport"
  ON passports FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX passports_user_id_idx ON passports(user_id);
```

### 2. Create user_stats table:

```sql
CREATE TABLE user_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  signup_method TEXT DEFAULT 'email',
  total_badges INTEGER DEFAULT 0,
  total_keystrokes INTEGER DEFAULT 0,
  total_sessions INTEGER DEFAULT 0,
  last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_badge_mint TIMESTAMP WITH TIME ZONE,
  properties JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable Row Level Security
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;

-- Users can view own stats, admins can view all
CREATE POLICY "Users can view own stats"
  ON user_stats FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own stats"
  ON user_stats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own stats"
  ON user_stats FOR UPDATE
  USING (auth.uid() = user_id);

-- Create index
CREATE INDEX user_stats_user_id_idx ON user_stats(user_id);
```

### 3. Create badges table:

```sql
CREATE TABLE badges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  integrity INTEGER DEFAULT 0,
  cognitive_ratio DECIMAL(5,2) DEFAULT 0,
  entropy INTEGER DEFAULT 0,
  keystrokes INTEGER DEFAULT 0,
  word_count INTEGER DEFAULT 0,
  session_duration INTEGER DEFAULT 0,
  passport_level TEXT DEFAULT 'Novice',
  passport_total INTEGER DEFAULT 0,
  suspicion_score INTEGER DEFAULT 0,
  risk_level TEXT DEFAULT 'LOW',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;

-- Users can create badges, anyone authenticated can read
CREATE POLICY "Authenticated users can view badges"
  ON badges FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can create own badges"
  ON badges FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create indexes
CREATE INDEX badges_user_id_idx ON badges(user_id);
CREATE INDEX badges_created_at_idx ON badges(created_at DESC);
CREATE INDEX badges_risk_level_idx ON badges(risk_level);
```

### 4. Create milestones table:

```sql
CREATE TABLE milestones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  milestone_type TEXT NOT NULL,
  level TEXT,
  total_keystrokes INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;

-- Users can view own milestones, create them
CREATE POLICY "Users can view own milestones"
  ON milestones FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own milestones"
  ON milestones FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create index
CREATE INDEX milestones_user_id_idx ON milestones(user_id);
CREATE INDEX milestones_created_at_idx ON milestones(created_at DESC);
```

### 5. Create bot_detections table:

```sql
CREATE TABLE bot_detections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  suspicion_score INTEGER NOT NULL,
  signals JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE bot_detections ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can view detections
CREATE POLICY "Authenticated users can view detections"
  ON bot_detections FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can create detections"
  ON bot_detections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create indexes
CREATE INDEX bot_detections_user_id_idx ON bot_detections(user_id);
CREATE INDEX bot_detections_score_idx ON bot_detections(suspicion_score DESC);
CREATE INDEX bot_detections_created_at_idx ON bot_detections(created_at DESC);
```

Click **RUN** for each SQL block. You should see "Success. No rows returned" for each.

---

## Step 4: Configure Authentication

1. Go to **Authentication** → **Providers** in the left sidebar
2. **Email** provider should already be enabled
3. Scroll down to **Email Auth** settings:
   - **Enable Email Confirmations**: Turn OFF (for easier testing)
     - Or leave ON for production (users get confirmation email)
   - **Secure email change**: Can leave as default
4. Click **Save**

### Optional: Email Templates
1. Go to **Authentication** → **Email Templates**
2. Customize confirmation and password reset emails if desired

---

## Step 5: Update JITTEr Code with Supabase Config

Now update your code with the API keys from Step 2.

### File 1: `auth-utils.js`

Open `/home/user/JITTEr/auth-utils.js` and update lines 19-20:

```javascript
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';  // From Step 2
const SUPABASE_ANON_KEY = 'eyJh...';  // Your anon public key from Step 2
```

### File 2: `admin.html`

Open `/home/user/JITTEr/admin.html` and update lines 215-216:

```javascript
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';  // Same as above
const SUPABASE_ANON_KEY = 'eyJh...';  // Same anon key
```

**IMPORTANT:** Use the SAME values in both files!

---

## Step 6: Test the Setup

### Test 1: Student Signup

1. Load the JITTEr extension in Chrome
2. Click extension icon → Opens writer
3. Click **LOGIN** button in sidebar
4. Check "New user? Sign up instead"
5. Enter email and password
6. Click **SIGN UP**

**Expected**: "✅ Logged in successfully!"

**Verify in Supabase:**
- Go to **Authentication** → **Users**
- You should see your test user
- Go to **Table Editor** → **passports**
- You should see a passport record
- Go to **Table Editor** → **user_stats**
- You should see user stats

### Test 2: Badge Mint & Stats

1. In JITTEr writer (while logged in), type some text
2. Click **MINT BADGE**
3. Badge should copy to clipboard

**Verify in Supabase:**
- Go to **Table Editor** → **badges**
- You should see a new badge with integrity, cognitive_ratio, etc.
- Go to **Table Editor** → **user_stats**
- `total_badges` should increment to 1
- `total_keystrokes` should show your keystrokes

### Test 3: Admin Dashboard

1. Open `admin.html` in browser (file:// or local server)
2. Click **LOGIN**
3. Enter your admin credentials (same as test user)
4. You should see dashboard with stats:
   - Total users: 1
   - Total badges: 1
   - Recent badges table with your test badge

---

## Step 7: Create Admin User (Optional)

For production, create a dedicated admin account:

1. In Supabase, go to **Authentication** → **Users**
2. Click **Add user** → **Create new user**
3. Email: `admin@yourdomain.com`
4. Password: Strong admin password
5. Click **Create user**

Use these credentials to login to `admin.html`.

---

## Database Schema Overview

Your Supabase database now has:

**Tables:**
- `passports` - User passport data (JSONB with keystroke history)
- `user_stats` - Aggregated user metrics
- `badges` - Individual badge records
- `milestones` - Level up events
- `bot_detections` - Suspicious activity logs

**Row Level Security (RLS):**
- Users can only read/write their own data
- Badges are readable by all authenticated users (for stats)
- All tables have CASCADE delete (cleanup when user deleted)

---

## Troubleshooting

### Error: "Supabase SDK not loaded"
- Check that Supabase script tag is in `writer.html` and `admin.html`
- Make sure you're accessing through Chrome extension, not `file://`

### Error: "new row violates row-level security policy"
- Check RLS policies in Step 3
- Verify you're logged in when creating records

### Error: "relation does not exist"
- Run all 5 SQL blocks from Step 3
- Check **Table Editor** to verify tables exist

### Stats not showing in admin dashboard
- Verify you're logged in to admin.html
- Check browser console for errors
- Verify API keys match in both files

### Error: "Invalid API key"
- Double-check you copied the `anon public` key (not `service_role`)
- No extra spaces in the key
- Both files have same config

---

## Cost Estimate (Supabase Free Tier)

**Free Plan Limits:**
- Database: 500 MB storage
- Auth: Unlimited users
- API requests: No hard limit on free tier
- Bandwidth: 2 GB/month
- Row Level Security: Unlimited

**Estimated usage for 100 students:**
- Storage: ~50 MB (passports + badges)
- Bandwidth: ~100 MB/month
- Well within free tier limits ✅

**When you'll need to upgrade:**
- 1,000+ active students
- 100+ MB database size
- Still very cheap: ~$25/month for Pro plan

---

## Security Best Practices

1. **Never commit API keys to public repos**
   - Your config is in JavaScript files (already in repo)
   - Consider environment variables for production
   - Keys are "anon" keys which are safe to expose in client code

2. **Row Level Security (RLS)**
   - Already configured in Step 3
   - Users can only access their own data
   - Admins see aggregate stats only

3. **Password requirements**
   - Supabase defaults: 6+ characters
   - Recommend 8+ for students
   - Consider enabling email confirmation for production

4. **Monitor usage**
   - Check Supabase Dashboard weekly
   - Watch for unusual activity in **Database** → **Logs**

---

## GitHub Integration (Already Done!)

Since you already connected to GitHub:
- **Automatic backups**: Supabase backs up daily
- **Database migrations**: Track schema changes in git
- **Collaboration**: Share project with team via Supabase

---

## Next Steps After Setup

1. **Test thoroughly** with multiple test accounts
2. **Create teacher accounts** for verification dashboard
3. **Monitor analytics** in Supabase Dashboard
4. **Set up email templates** (optional, for production)
5. **Enable email confirmation** before public launch (optional)

---

## Quick Reference

**Supabase Dashboard:** https://app.supabase.com/project/YOUR_PROJECT_ID

**Files to Update:**
- `auth-utils.js` (lines 19-20)
- `admin.html` (lines 215-216)

**Tables Created:**
- `passports` - User passport data
- `user_stats` - User metrics
- `badges` - Badge records
- `milestones` - Level ups
- `bot_detections` - Bot alerts

**Key Features:**
- PostgreSQL database (not NoSQL like Firebase)
- Row Level Security built-in
- Real-time subscriptions available
- GitHub integration for backups
- Free tier generous enough for schools

---

## Support

If you encounter issues:
1. Check Supabase Console → **Logs** for errors
2. Open browser DevTools → Console
3. Verify all 5 tables exist in **Table Editor**
4. Test with a fresh incognito window

**Supabase Documentation:** https://supabase.com/docs

---

Ready! Your JITTEr system is now powered by Supabase with full authentication, cloud sync, and analytics. 🚀
