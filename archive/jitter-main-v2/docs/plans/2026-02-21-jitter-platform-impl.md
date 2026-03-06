# JITTEr Platform — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a React SPA at `~/Desktop/jitter-platform/` — a B2B dashboard where platform customers manage JITTEr API keys and see verification stats, and Denis has a super-admin view of all customers and MRR.

**Architecture:** New React 19 + Vite project. Supabase for auth, DB, and the verification API Edge Function. Two role views (customer dashboard + admin) enforced by Supabase RLS. Vercel for hosting (free tier).

**Tech Stack:** React 19, Vite, Tailwind CSS, React Router v6, @supabase/supabase-js, @tanstack/react-query, vitest + @testing-library/react

**Design doc:** `docs/plans/2026-02-21-jitter-platform-design.md` — read this for full context on data model and business model.

**Working directory for all tasks:** `~/Desktop/jitter-platform/`

---

## Task 1: Scaffold project

**Files:**
- Create: `~/Desktop/jitter-platform/` (entire project)

**Step 1: Scaffold Vite + React project**

```bash
cd ~/Desktop
npm create vite@latest jitter-platform -- --template react
cd jitter-platform
```

**Step 2: Install dependencies**

```bash
npm install
npm install react-router-dom @supabase/supabase-js @tanstack/react-query
npm install -D tailwindcss postcss autoprefixer vitest @testing-library/react @testing-library/jest-dom jsdom
npx tailwindcss init -p
```

**Step 3: Configure tailwind**

Replace `tailwind.config.js` with:
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

**Step 4: Replace `src/index.css`** with:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-bg: #0f1117;
  --color-surface: #1a1d27;
  --color-surface-elevated: #252836;
  --color-border: #2e3248;
  --color-text-primary: #f0f0f0;
  --color-text-secondary: #9ca3af;
  --color-text-tertiary: #6b7280;
  --color-primary: #6366f1;       /* Indigo — JITTEr brand */
  --color-primary-hover: #4f46e5;
  --color-success: #10b981;
  --color-danger: #ef4444;
  --color-warning: #f59e0b;
  --color-bot: #ef4444;           /* Red for bot-detected */
  --color-human: #10b981;         /* Green for verified human */
}

body {
  background-color: var(--color-bg);
  color: var(--color-text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

* { box-sizing: border-box; }
```

**Step 5: Configure vitest in `vite.config.js`**

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
  },
})
```

**Step 6: Create test setup `src/test/setup.js`**

```javascript
import '@testing-library/jest-dom'
```

**Step 7: Create `.env.example`**

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_ADMIN_USER_ID=your-supabase-user-id
```

**Step 8: Copy `.env.example` to `.env.local`** and fill in real Supabase values (create a new Supabase project at supabase.com first — free tier).

**Step 9: Verify dev server starts**

```bash
npm run dev
```

Expected: Vite dev server at `http://localhost:5173` with default React page.

**Step 10: Commit**

```bash
git init
git add -A
git commit -m "feat: scaffold jitter-platform project"
```

---

## Task 2: Supabase schema

**Files:**
- Create: `supabase/schema.sql`

**Step 1: Create schema file**

Create `supabase/schema.sql`:

```sql
-- ============================================================
-- JITTEr Platform Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- Plans lookup table
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_verifications INTEGER NOT NULL,  -- -1 = unlimited
  price_cents INTEGER NOT NULL              -- 0 = free, -1 = custom
);

INSERT INTO plans (id, name, monthly_verifications, price_cents) VALUES
  ('free',       'Free',       1000,   0),
  ('starter',    'Starter',    50000,  4900),
  ('business',   'Business',   500000, 19900),
  ('enterprise', 'Enterprise', -1,     -1)
ON CONFLICT (id) DO NOTHING;

-- Platform customers (one per Supabase auth user)
CREATE TABLE IF NOT EXISTS platform_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  company_name TEXT NOT NULL,
  contact_email TEXT,
  plan TEXT NOT NULL DEFAULT 'free' REFERENCES plans(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admins (Denis's row goes here manually after first login)
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- API keys
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES platform_customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default',
  key_prefix TEXT NOT NULL,     -- first 12 chars shown in UI
  key_hash TEXT NOT NULL,       -- sha256 of full key, never stored plaintext
  env TEXT NOT NULL DEFAULT 'live' CHECK (env IN ('live', 'test')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ
);

-- Daily usage aggregates (one row per customer per day)
CREATE TABLE IF NOT EXISTS usage_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES platform_customers(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  verification_count INTEGER NOT NULL DEFAULT 0,
  bot_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(customer_id, date)
);

-- Individual verification records (metadata only, no badge content)
CREATE TABLE IF NOT EXISTS verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES api_keys(id),
  valid BOOLEAN NOT NULL,
  bot_detected BOOLEAN NOT NULL DEFAULT false,
  suspicion_score INTEGER,
  passport_age_days INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verifications_api_key_created
  ON verifications(api_key_id, created_at DESC);

-- Webhook endpoints
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES platform_customers(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Customer lifecycle events (for investor metrics)
CREATE TABLE IF NOT EXISTS customer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES platform_customers(id),
  event_type TEXT NOT NULL,  -- 'signup' | 'upgrade' | 'downgrade' | 'cancel' | 'api_key_created'
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE platform_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Helper function: is current user an admin?
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Helper function: get current user's customer id
CREATE OR REPLACE FUNCTION my_customer_id()
RETURNS UUID AS $$
  SELECT id FROM platform_customers WHERE user_id = auth.uid() LIMIT 1
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- platform_customers: own row + admin sees all
CREATE POLICY "customer_own" ON platform_customers
  FOR ALL USING (user_id = auth.uid() OR is_platform_admin());

-- api_keys: own customer's keys + admin sees all
CREATE POLICY "apikeys_own" ON api_keys
  FOR ALL USING (customer_id = my_customer_id() OR is_platform_admin());

-- usage_daily: own data + admin
CREATE POLICY "usage_own" ON usage_daily
  FOR ALL USING (customer_id = my_customer_id() OR is_platform_admin());

-- verifications: via api_key_id join to own keys + admin
-- (simplified: admin-only for now since customers query via usage_daily)
CREATE POLICY "verifications_admin" ON verifications
  FOR ALL USING (is_platform_admin());

-- customer_events: own + admin
CREATE POLICY "events_own" ON customer_events
  FOR ALL USING (customer_id = my_customer_id() OR is_platform_admin());

-- webhook_endpoints: own + admin
CREATE POLICY "webhooks_own" ON webhook_endpoints
  FOR ALL USING (customer_id = my_customer_id() OR is_platform_admin());

-- admins: only admins can see admin list
CREATE POLICY "admins_admin_only" ON admins
  FOR ALL USING (is_platform_admin());
```

**Step 2: Run in Supabase SQL Editor**

Go to Supabase dashboard → SQL Editor → New query → paste schema.sql contents → Run.

Expected: "Success. No rows returned."

**Step 3: Add Denis as admin**

In Supabase: Auth > Users — find your user ID after first login. Then in SQL Editor:

```sql
INSERT INTO admins (user_id) VALUES ('your-user-id-here');
```

**Step 4: Commit schema**

```bash
git add supabase/schema.sql
git commit -m "feat: supabase schema for jitter platform"
```

---

## Task 3: Core infrastructure

**Files:**
- Create: `src/lib/supabase.js`
- Create: `src/context/AuthContext.jsx`
- Modify: `src/main.jsx`
- Create: `src/App.jsx`
- Create: `src/components/ProtectedRoute.jsx`

**Step 1: Create `src/lib/supabase.js`**

```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, storageKey: 'jitter-platform-auth' },
})
```

**Step 2: Create `src/context/AuthContext.jsx`**

```jsx
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
```

**Step 3: Replace `src/main.jsx`**

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './context/AuthContext'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
```

**Step 4: Create `src/components/ProtectedRoute.jsx`**

```jsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function ProtectedRoute({ children, requireAdmin = false }) {
  const { user, loading, isAdmin } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--color-primary)' }} />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (requireAdmin && !isAdmin) return <Navigate to="/dashboard" replace />

  return children
}
```

**Step 5: Update `AuthContext.jsx` to include `isAdmin` check**

Add to `AuthContext.jsx` state + useEffect:
```jsx
const [isAdmin, setIsAdmin] = useState(false)

// Inside the useEffect, after setLoading(false):
async function checkAdmin(userId) {
  if (!userId) { setIsAdmin(false); return }
  const { data } = await supabase.from('admins').select('id').eq('user_id', userId).maybeSingle()
  setIsAdmin(!!data)
}

// Call in onAuthStateChange:
checkAdmin(session?.user?.id ?? null)
```

Then add `isAdmin` to the context value.

**Step 6: Create `src/App.jsx`**

```jsx
import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Login } from './pages/Login'
import { Signup } from './pages/Signup'
import { DashboardLayout } from './components/DashboardLayout'
import { AdminLayout } from './components/AdminLayout'
import { DashboardOverview } from './pages/dashboard/Overview'
import { DashboardApiKeys } from './pages/dashboard/ApiKeys'
import { DashboardEmbed } from './pages/dashboard/Embed'
import { DashboardBilling } from './pages/dashboard/Billing'
import { AdminOverview } from './pages/admin/Overview'
import { AdminCustomers } from './pages/admin/Customers'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      <Route path="/dashboard" element={
        <ProtectedRoute><DashboardLayout /></ProtectedRoute>
      }>
        <Route index element={<DashboardOverview />} />
        <Route path="api-keys" element={<DashboardApiKeys />} />
        <Route path="embed" element={<DashboardEmbed />} />
        <Route path="billing" element={<DashboardBilling />} />
      </Route>

      <Route path="/admin" element={
        <ProtectedRoute requireAdmin><AdminLayout /></ProtectedRoute>
      }>
        <Route index element={<AdminOverview />} />
        <Route path="customers" element={<AdminCustomers />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
```

**Step 7: Verify — run tests**

```bash
npm run dev
```

Expected: app loads at localhost:5173, redirects to /login (since no session).

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: core infrastructure (supabase, auth context, routing)"
```

---

## Task 4: Auth pages (Login + Signup)

**Files:**
- Create: `src/pages/Login.jsx`
- Create: `src/pages/Signup.jsx`

**Step 1: Create `src/pages/Login.jsx`**

```jsx
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) { setError(error.message); return }
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>
            ⚡ JITTEr
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Platform dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg text-sm" style={{ background: 'color-mix(in srgb, var(--color-danger) 15%, var(--color-surface))', color: 'var(--color-danger)' }}>
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg font-semibold text-sm transition-opacity disabled:opacity-50"
            style={{ background: 'var(--color-primary)', color: '#fff' }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-sm mt-6" style={{ color: 'var(--color-text-tertiary)' }}>
          Don't have an account?{' '}
          <Link to="/signup" style={{ color: 'var(--color-primary)' }}>Sign up</Link>
        </p>
      </div>
    </div>
  )
}
```

**Step 2: Create `src/pages/Signup.jsx`**

```jsx
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function Signup() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [company, setCompany] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password })
    if (authError) { setError(authError.message); setLoading(false); return }

    // 2. Create platform_customers row
    const userId = authData.user?.id
    if (userId) {
      const { error: customerError } = await supabase
        .from('platform_customers')
        .insert({ user_id: userId, company_name: company.trim(), contact_email: email })
      if (customerError) { setError(customerError.message); setLoading(false); return }

      // 3. Log signup event
      await supabase.from('customer_events').insert({
        customer_id: (await supabase.from('platform_customers').select('id').eq('user_id', userId).single()).data?.id,
        event_type: 'signup',
        metadata: { plan: 'free' },
      })
    }

    setLoading(false)
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>
            ⚡ JITTEr
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Start verifying humans — free, no credit card
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg text-sm" style={{ background: 'color-mix(in srgb, var(--color-danger) 15%, var(--color-surface))', color: 'var(--color-danger)' }}>
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              Company / Platform name
            </label>
            <input
              type="text"
              required
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="e.g. Acme Reviews"
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg font-semibold text-sm transition-opacity disabled:opacity-50"
            style={{ background: 'var(--color-primary)', color: '#fff' }}
          >
            {loading ? 'Creating account...' : 'Create free account'}
          </button>
        </form>

        <p className="text-center text-sm mt-4" style={{ color: 'var(--color-text-tertiary)' }}>
          1,000 free verifications/month. No card required.
        </p>
        <p className="text-center text-sm mt-4" style={{ color: 'var(--color-text-tertiary)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--color-primary)' }}>Sign in</Link>
        </p>
      </div>
    </div>
  )
}
```

**Step 3: Verify — test auth flow manually**

1. Start dev server: `npm run dev`
2. Go to `/signup`, create an account with a real email
3. Confirm email (check inbox)
4. Go to `/login`, sign in
5. Should redirect to `/dashboard` (even if it 404s — routing is wired)
6. In Supabase Auth dashboard: verify user row created
7. In Supabase Table Editor: verify `platform_customers` row created

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: auth pages (login + signup with customer row creation)"
```

---

## Task 5: Dashboard layout with sidebar

**Files:**
- Create: `src/components/DashboardLayout.jsx`
- Create: `src/components/AdminLayout.jsx`

**Step 1: Create `src/components/DashboardLayout.jsx`**

```jsx
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Overview', icon: '⚡', end: true },
  { to: '/dashboard/api-keys', label: 'API Keys', icon: '🔑' },
  { to: '/dashboard/embed', label: 'Embed', icon: '</>' },
  { to: '/dashboard/billing', label: 'Billing', icon: '💳' },
]

export function DashboardLayout() {
  const { user, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--color-bg)' }}>
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 flex flex-col border-r" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
        <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <span className="text-lg font-bold" style={{ color: 'var(--color-primary)' }}>⚡ JITTEr</span>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>Platform Dashboard</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ to, label, icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'text-white' : ''
                }`
              }
              style={({ isActive }) => ({
                background: isActive ? 'var(--color-primary)' : 'transparent',
                color: isActive ? '#fff' : 'var(--color-text-secondary)',
              })}
            >
              <span>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t space-y-1" style={{ borderColor: 'var(--color-border)' }}>
          {isAdmin && (
            <NavLink
              to="/admin"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium"
              style={{ color: 'var(--color-warning)' }}
            >
              <span>🛡️</span> Admin
            </NavLink>
          )}
          <div className="px-3 py-2 text-xs truncate" style={{ color: 'var(--color-text-tertiary)' }}>
            {user?.email}
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-left"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <span>↩</span> Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
```

**Step 2: Create `src/components/AdminLayout.jsx`**

```jsx
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const ADMIN_NAV = [
  { to: '/admin', label: 'Overview', icon: '📊', end: true },
  { to: '/admin/customers', label: 'Customers', icon: '🏢' },
]

export function AdminLayout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <aside className="w-56 flex-shrink-0 flex flex-col border-r" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
        <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <span className="text-lg font-bold" style={{ color: 'var(--color-warning)' }}>🛡️ Admin</span>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>God mode</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {ADMIN_NAV.map(({ to, label, icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium"
              style={({ isActive }) => ({
                background: isActive ? 'color-mix(in srgb, var(--color-warning) 20%, var(--color-surface))' : 'transparent',
                color: isActive ? 'var(--color-warning)' : 'var(--color-text-secondary)',
              })}
            >
              <span>{icon}</span>{label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t space-y-1" style={{ borderColor: 'var(--color-border)' }}>
          <NavLink to="/dashboard" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            ← Customer view
          </NavLink>
          <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left" style={{ color: 'var(--color-text-tertiary)' }}>
            ↩ Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
```

**Step 3: Verify layout renders**

Navigate to `/dashboard` — should see sidebar + empty content area. No console errors.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: dashboard and admin sidebar layouts"
```

---

## Task 6: API layer

**Files:**
- Create: `src/api/customerApi.js`
- Create: `src/api/apiKeysApi.js`
- Create: `src/api/usageApi.js`
- Create: `src/api/adminApi.js`

**Step 1: Create `src/api/customerApi.js`**

```javascript
import { supabase } from '../lib/supabase'

export const customerApi = {
  async getMyCustomer() {
    const { data, error } = await supabase
      .from('platform_customers')
      .select('*, plans(*)')
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data
  },

  async updateSettings({ companyName, contactEmail }) {
    const { data, error } = await supabase
      .from('platform_customers')
      .update({ company_name: companyName, contact_email: contactEmail })
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
      .select()
      .single()
    if (error) throw new Error(error.message)
    return data
  },
}
```

**Step 2: Create `src/api/apiKeysApi.js`**

```javascript
import { supabase } from '../lib/supabase'

// Generates a random API key string and returns both the full key and its prefix+hash
async function generateKeyComponents(env) {
  const raw = crypto.getRandomValues(new Uint8Array(24))
  const keyString = (env === 'test' ? 'pk_test_' : 'pk_live_') +
    Array.from(raw).map(b => b.toString(16).padStart(2,'0')).join('').substring(0, 32)

  const prefix = keyString.substring(0, 12)

  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(keyString))
  const keyHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2,'0')).join('')

  return { keyString, prefix, keyHash }
}

export const apiKeysApi = {
  async listKeys() {
    // Get customer_id first
    const { data: customer } = await supabase
      .from('platform_customers')
      .select('id')
      .maybeSingle()
    if (!customer) return []

    const { data, error } = await supabase
      .from('api_keys')
      .select('id, name, key_prefix, env, created_at, revoked_at, last_used_at')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return data || []
  },

  // Returns the full key string ONCE — never retrievable again
  async createKey({ name, env = 'live' }) {
    const { data: customer } = await supabase
      .from('platform_customers')
      .select('id')
      .maybeSingle()
    if (!customer) throw new Error('No customer account found')

    const { keyString, prefix, keyHash } = await generateKeyComponents(env)

    const { data, error } = await supabase
      .from('api_keys')
      .insert({ customer_id: customer.id, name, key_prefix: prefix, key_hash: keyHash, env })
      .select('id, name, key_prefix, env, created_at')
      .single()
    if (error) throw new Error(error.message)

    // Log event
    await supabase.from('customer_events').insert({
      customer_id: customer.id,
      event_type: 'api_key_created',
      metadata: { key_id: data.id, env },
    })

    return { ...data, full_key: keyString } // full_key shown ONCE only
  },

  async revokeKey(keyId) {
    const { error } = await supabase
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', keyId)
    if (error) throw new Error(error.message)
  },
}
```

**Step 3: Create `src/api/usageApi.js`**

```javascript
import { supabase } from '../lib/supabase'

export const usageApi = {
  // Returns usage for the current calendar month
  async getMonthlyUsage() {
    const { data: customer } = await supabase
      .from('platform_customers')
      .select('id, plan, plans(monthly_verifications)')
      .maybeSingle()
    if (!customer) return { verification_count: 0, bot_count: 0, limit: 1000 }

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { data, error } = await supabase
      .from('usage_daily')
      .select('verification_count, bot_count')
      .eq('customer_id', customer.id)
      .gte('date', startOfMonth.toISOString().split('T')[0])

    if (error) throw new Error(error.message)

    const totals = (data || []).reduce(
      (acc, row) => ({
        verification_count: acc.verification_count + row.verification_count,
        bot_count: acc.bot_count + row.bot_count,
      }),
      { verification_count: 0, bot_count: 0 }
    )

    return {
      ...totals,
      human_count: totals.verification_count - totals.bot_count,
      limit: customer.plans?.monthly_verifications ?? 1000,
      plan: customer.plan,
    }
  },

  // Returns daily usage for the last N days (for the chart)
  async getDailyUsage(days = 30) {
    const { data: customer } = await supabase
      .from('platform_customers')
      .select('id')
      .maybeSingle()
    if (!customer) return []

    const since = new Date()
    since.setDate(since.getDate() - days)

    const { data, error } = await supabase
      .from('usage_daily')
      .select('date, verification_count, bot_count')
      .eq('customer_id', customer.id)
      .gte('date', since.toISOString().split('T')[0])
      .order('date', { ascending: true })

    if (error) throw new Error(error.message)
    return data || []
  },
}
```

**Step 4: Create `src/api/adminApi.js`**

```javascript
import { supabase } from '../lib/supabase'

export const adminApi = {
  async isAdmin() {
    const { data } = await supabase.from('admins').select('id').maybeSingle()
    return !!data
  },

  async getAllCustomers() {
    const { data, error } = await supabase
      .from('platform_customers')
      .select(`
        id, company_name, contact_email, plan, status, created_at,
        plans(name, price_cents),
        usage_daily(verification_count, bot_count, date)
      `)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return data || []
  },

  // MRR = sum of active paid customers' plan prices
  async getMrrEstimate() {
    const { data, error } = await supabase
      .from('platform_customers')
      .select('plan, plans(price_cents)')
      .eq('status', 'active')
      .neq('plan', 'free')
      .neq('plan', 'enterprise')
    if (error) throw new Error(error.message)
    const mrr = (data || []).reduce((sum, c) => sum + (c.plans?.price_cents ?? 0), 0)
    return mrr // in cents
  },

  async getRecentEvents(limit = 20) {
    const { data, error } = await supabase
      .from('customer_events')
      .select('*, platform_customers(company_name)')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw new Error(error.message)
    return data || []
  },

  async updateCustomerPlan(customerId, plan) {
    const { error } = await supabase
      .from('platform_customers')
      .update({ plan })
      .eq('id', customerId)
    if (error) throw new Error(error.message)

    await supabase.from('customer_events').insert({
      customer_id: customerId,
      event_type: 'upgrade',
      metadata: { to_plan: plan, changed_by: 'admin' },
    })
  },

  async suspendCustomer(customerId) {
    const { error } = await supabase
      .from('platform_customers')
      .update({ status: 'suspended' })
      .eq('id', customerId)
    if (error) throw new Error(error.message)
  },
}
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: API layer (customer, api keys, usage, admin)"
```

---

## Task 7: Customer Overview page

**Files:**
- Create: `src/pages/dashboard/Overview.jsx`

**Step 1: Create `src/pages/dashboard/Overview.jsx`**

```jsx
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { usageApi } from '../../api/usageApi'
import { customerApi } from '../../api/customerApi'

function StatCard({ label, value, sub, color = 'var(--color-text-primary)' }) {
  return (
    <div className="p-5 rounded-xl border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
      <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>{label}</p>
      <p className="text-3xl font-bold" style={{ color }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>{sub}</p>}
    </div>
  )
}

function UsageMeter({ used, limit }) {
  const pct = limit === -1 ? 0 : Math.min(100, (used / limit) * 100)
  const color = pct > 90 ? 'var(--color-danger)' : pct > 70 ? 'var(--color-warning)' : 'var(--color-primary)'
  return (
    <div>
      <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>
        <span>{used.toLocaleString()} verifications used</span>
        <span>{limit === -1 ? 'Unlimited' : `${limit.toLocaleString()} limit`}</span>
      </div>
      <div className="h-2 rounded-full" style={{ background: 'var(--color-border)' }}>
        <div
          className="h-2 rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  )
}

export function DashboardOverview() {
  const now = new Date()
  const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ['usage', 'monthly'],
    queryFn: () => usageApi.getMonthlyUsage(),
  })

  const { data: customer } = useQuery({
    queryKey: ['customer'],
    queryFn: () => customerApi.getMyCustomer(),
  })

  const { data: daily = [] } = useQuery({
    queryKey: ['usage', 'daily'],
    queryFn: () => usageApi.getDailyUsage(14),
  })

  if (usageLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--color-primary)' }} />
      </div>
    )
  }

  const verified = usage?.human_count ?? 0
  const bots = usage?.bot_count ?? 0
  const limit = usage?.limit ?? 1000
  const remaining = limit === -1 ? null : limit - (usage?.verification_count ?? 0)

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Overview
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {monthName} · {customer?.company_name}
          </p>
        </div>
        <span
          className="px-3 py-1 rounded-full text-xs font-semibold capitalize"
          style={{ background: 'color-mix(in srgb, var(--color-primary) 20%, var(--color-surface))', color: 'var(--color-primary)' }}
        >
          {customer?.plan ?? 'free'} plan
        </span>
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard
          label="Humans verified"
          value={verified.toLocaleString()}
          sub="sessions with clean typing patterns"
          color="var(--color-human)"
        />
        <StatCard
          label="Bots blocked"
          value={bots.toLocaleString()}
          sub="sessions flagged as non-human"
          color="var(--color-bot)"
        />
      </div>

      {/* Usage meter */}
      <div className="p-5 rounded-xl border mb-6" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Monthly usage</p>
          {remaining !== null && remaining < limit * 0.2 && (
            <Link to="/dashboard/billing" className="text-xs font-medium" style={{ color: 'var(--color-warning)' }}>
              Upgrade plan →
            </Link>
          )}
        </div>
        <UsageMeter used={usage?.verification_count ?? 0} limit={limit} />
        {remaining !== null && (
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
            {remaining.toLocaleString()} verifications remaining this month
          </p>
        )}
      </div>

      {/* Recent activity (last 14 days) */}
      {daily.length > 0 && (
        <div className="p-5 rounded-xl border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <p className="text-sm font-medium mb-4" style={{ color: 'var(--color-text-primary)' }}>Last 14 days</p>
          <div className="flex items-end gap-1 h-16">
            {daily.map((d) => {
              const maxVal = Math.max(...daily.map(x => x.verification_count), 1)
              const h = (d.verification_count / maxVal) * 100
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${d.verification_count} verifications`}>
                  <div
                    className="w-full rounded-t"
                    style={{ height: `${h}%`, minHeight: '2px', background: 'var(--color-primary)', opacity: 0.8 }}
                  />
                </div>
              )
            })}
          </div>
          <div className="flex justify-between text-xs mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
            <span>{daily[0]?.date}</span>
            <span>{daily[daily.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {daily.length === 0 && (
        <div className="p-8 rounded-xl border text-center" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <p className="text-sm font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>No verifications yet</p>
          <p className="text-xs mb-4" style={{ color: 'var(--color-text-secondary)' }}>
            Get your API key and embed the widget to start verifying humans.
          </p>
          <Link
            to="/dashboard/embed"
            className="inline-block px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--color-primary)', color: '#fff' }}
          >
            Get started →
          </Link>
        </div>
      )}
    </div>
  )
}
```

**Step 2: Verify — navigate to /dashboard after login**

Should see the overview with 0 stats and the "No verifications yet" card linking to embed.

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: customer dashboard overview page"
```

---

## Task 8: Customer API Keys page

**Files:**
- Create: `src/pages/dashboard/ApiKeys.jsx`

**Step 1: Create `src/pages/dashboard/ApiKeys.jsx`**

```jsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiKeysApi } from '../../api/apiKeysApi'

function KeyRow({ k, onRevoke }) {
  const isRevoked = !!k.revoked_at
  return (
    <div
      className="flex items-center justify-between p-4 rounded-xl border"
      style={{
        background: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
        opacity: isRevoked ? 0.5 : 1,
      }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>
            {k.name}
          </p>
          <span
            className="px-1.5 py-0.5 rounded text-xs font-mono"
            style={{
              background: k.env === 'test'
                ? 'color-mix(in srgb, var(--color-warning) 20%, var(--color-surface))'
                : 'color-mix(in srgb, var(--color-human) 20%, var(--color-surface))',
              color: k.env === 'test' ? 'var(--color-warning)' : 'var(--color-human)',
            }}
          >
            {k.env}
          </span>
          {isRevoked && (
            <span className="px-1.5 py-0.5 rounded text-xs" style={{ color: 'var(--color-danger)', background: 'color-mix(in srgb, var(--color-danger) 15%, var(--color-surface))' }}>
              revoked
            </span>
          )}
        </div>
        <p className="text-xs font-mono" style={{ color: 'var(--color-text-secondary)' }}>
          {k.key_prefix}••••••••••••••••••
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
          Created {new Date(k.created_at).toLocaleDateString()}
          {k.last_used_at && ` · Last used ${new Date(k.last_used_at).toLocaleDateString()}`}
        </p>
      </div>
      {!isRevoked && (
        <button
          onClick={() => onRevoke(k.id, k.name)}
          className="ml-4 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--color-danger)', border: '1px solid var(--color-danger)' }}
        >
          Revoke
        </button>
      )}
    </div>
  )
}

function NewKeyModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [env, setEnv] = useState('live')
  const [newKey, setNewKey] = useState(null)
  const [copied, setCopied] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  async function handleCreate() {
    if (!name.trim()) return
    setCreating(true)
    setError(null)
    try {
      const result = await onCreate({ name: name.trim(), env })
      setNewKey(result.full_key)
    } catch (e) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  function handleCopy() {
    const ta = document.createElement('textarea')
    ta.value = newKey
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border)' }}>
        <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>
          {newKey ? 'Copy your API key' : 'Create API key'}
        </h2>

        {!newKey ? (
          <div className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg text-sm" style={{ color: 'var(--color-danger)', background: 'color-mix(in srgb, var(--color-danger) 15%, transparent)' }}>
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Key name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Production"
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Environment</label>
              <select
                value={env}
                onChange={e => setEnv(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              >
                <option value="live">Live</option>
                <option value="test">Test</option>
              </select>
            </div>
            <div className="flex gap-3 mt-2">
              <button onClick={onClose} className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !name.trim()}
                className="flex-1 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: 'var(--color-primary)', color: '#fff' }}
              >
                {creating ? 'Creating...' : 'Create key'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 rounded-lg text-sm font-medium" style={{ color: 'var(--color-warning)', background: 'color-mix(in srgb, var(--color-warning) 15%, transparent)' }}>
              Copy this key now. It will never be shown again.
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={newKey}
                className="flex-1 px-3 py-2 rounded-lg border text-xs font-mono"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              />
              <button
                onClick={handleCopy}
                className="px-3 py-2 rounded-lg text-sm font-medium"
                style={{ background: copied ? 'var(--color-human)' : 'var(--color-primary)', color: '#fff' }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <button onClick={onClose} className="w-full py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function DashboardApiKeys() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiKeysApi.listKeys(),
  })

  const revokeMutation = useMutation({
    mutationFn: (keyId) => apiKeysApi.revokeKey(keyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
  })

  async function handleRevoke(keyId, name) {
    if (!confirm(`Revoke key "${name}"? Any integrations using it will stop working.`)) return
    revokeMutation.mutate(keyId)
  }

  async function handleCreate(params) {
    const result = await apiKeysApi.createKey(params)
    queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    return result
  }

  const activeKeys = keys.filter(k => !k.revoked_at)
  const revokedKeys = keys.filter(k => k.revoked_at)

  return (
    <div className="p-8 max-w-3xl">
      {showModal && (
        <NewKeyModal
          onClose={() => setShowModal(false)}
          onCreate={handleCreate}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>API Keys</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            Use these keys to authenticate requests to the JITTEr verification API.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--color-primary)', color: '#fff' }}
        >
          + Create key
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12" style={{ color: 'var(--color-text-tertiary)' }}>Loading...</div>
      ) : activeKeys.length === 0 && revokedKeys.length === 0 ? (
        <div className="text-center py-12 rounded-xl border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>No API keys yet</p>
          <button onClick={() => setShowModal(true)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--color-primary)', color: '#fff' }}>
            Create your first key
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {activeKeys.map(k => (
            <KeyRow key={k.id} k={k} onRevoke={handleRevoke} />
          ))}
          {revokedKeys.length > 0 && (
            <details className="mt-4">
              <summary className="text-xs cursor-pointer" style={{ color: 'var(--color-text-tertiary)' }}>
                {revokedKeys.length} revoked key{revokedKeys.length !== 1 ? 's' : ''}
              </summary>
              <div className="space-y-3 mt-3">
                {revokedKeys.map(k => (
                  <KeyRow key={k.id} k={k} onRevoke={handleRevoke} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Verify — navigate to /dashboard/api-keys**

- Create a key → modal shows → full key displayed once → copy it
- Key appears in list with prefix + ••• masking
- Revoke a key → it moves to "revoked keys" section

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: API keys page (create, list, revoke with one-time key display)"
```

---

## Task 9: Customer Embed page

**Files:**
- Create: `src/pages/dashboard/Embed.jsx`

**Step 1: Create `src/pages/dashboard/Embed.jsx`**

```jsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiKeysApi } from '../../api/apiKeysApi'
import { Link } from 'react-router-dom'

const TABS = ['HTML Widget', 'React', 'REST API']

function CodeBlock({ code }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    const ta = document.createElement('textarea')
    ta.value = code
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative rounded-xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid var(--color-border)' }}>
      <button
        onClick={handleCopy}
        className="absolute top-3 right-3 px-2.5 py-1 rounded text-xs font-medium"
        style={{ background: copied ? 'var(--color-human)' : 'var(--color-surface-elevated)', color: copied ? '#fff' : 'var(--color-text-secondary)' }}
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre className="p-5 text-xs overflow-x-auto" style={{ color: '#e6edf3', fontFamily: 'monospace', lineHeight: 1.6 }}>
        {code}
      </pre>
    </div>
  )
}

export function DashboardEmbed() {
  const [activeTab, setActiveTab] = useState(0)

  const { data: keys = [] } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiKeysApi.listKeys(),
  })

  const liveKey = keys.find(k => k.env === 'live' && !k.revoked_at)
  const apiKey = liveKey ? `${liveKey.key_prefix}••••••••••••••••••` : 'YOUR_API_KEY'

  const snippets = [
    // HTML Widget
    `<!-- 1. Add to your <head> -->
<script src="https://cdn.jitter.so/widget.js" defer></script>

<!-- 2. Drop inside your review/comment form -->
<jitter-widget
  api-key="${apiKey}"
  on-badge="handleJitterBadge"
></jitter-widget>

<!-- 3. Handle the result -->
<script>
function handleJitterBadge(event) {
  const { valid, bot_detected, suspicion_score } = event.detail

  if (bot_detected) {
    // Block the submission or flag for review
    console.warn('Bot detected — score:', suspicion_score)
  } else {
    // Proceed with form submission
    console.log('Human verified ✅')
  }
}
</script>`,

    // React
    `import { useCallback } from 'react'

// Install: npm install @jitter/react
import { JitterWidget } from '@jitter/react'

function ReviewForm() {
  const handleBadge = useCallback((badge) => {
    if (badge.bot_detected) {
      console.warn('Bot detected')
      return
    }
    // Attach badge to your form submission
    submitReview({ badge })
  }, [])

  return (
    <form>
      <textarea placeholder="Write your review..." />
      <JitterWidget
        apiKey="${apiKey}"
        onBadge={handleBadge}
      />
      <button type="submit">Submit</button>
    </form>
  )
}`,

    // REST API
    `# Server-side verification (never trust client-only)
# Call this from your backend after receiving a form submission

curl -X POST https://api.jitter.so/v1/verify \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "badge": "<base64-encoded-badge-from-widget>"
  }'

# Response:
{
  "valid": true,
  "bot_detected": false,
  "suspicion_score": 8,
  "passport_age_days": 107,
  "level": "Advanced"
}`,
  ]

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Embed JITTEr</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
          Add human verification to any form in minutes.
        </p>
      </div>

      {!liveKey && (
        <div className="p-4 rounded-xl mb-6 border" style={{ background: 'color-mix(in srgb, var(--color-warning) 10%, var(--color-surface))', borderColor: 'var(--color-warning)' }}>
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--color-warning)' }}>
            You need a live API key first
          </p>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            <Link to="/dashboard/api-keys" style={{ color: 'var(--color-warning)' }}>Create an API key</Link> to get your embed code.
          </p>
        </div>
      )}

      {/* Tab selector */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl w-fit" style={{ background: 'var(--color-surface)' }}>
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: activeTab === i ? 'var(--color-primary)' : 'transparent',
              color: activeTab === i ? '#fff' : 'var(--color-text-secondary)',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <CodeBlock code={snippets[activeTab]} />

      <div className="mt-6 p-4 rounded-xl border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
        <p className="text-sm font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>How it works</p>
        <ol className="space-y-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          <li>1. Widget captures typing metadata (no content, no keystrokes)</li>
          <li>2. Mints a cryptographically signed badge with the session stats</li>
          <li>3. Your server calls our API to verify the badge and passport</li>
          <li>4. You get a simple <code className="text-xs font-mono" style={{ color: 'var(--color-human)' }}>&#123; valid, bot_detected &#125;</code> response</li>
        </ol>
      </div>
    </div>
  )
}
```

**Step 2: Verify — navigate to /dashboard/embed**

- Should see three tabs with code snippets
- If no API key: warning banner with link to create one
- Copy button works

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: embed page with HTML/React/REST code snippets"
```

---

## Task 10: Customer Billing page

**Files:**
- Create: `src/pages/dashboard/Billing.jsx`

**Step 1: Create `src/pages/dashboard/Billing.jsx`**

```jsx
import { useQuery } from '@tanstack/react-query'
import { customerApi } from '../../api/customerApi'
import { usageApi } from '../../api/usageApi'

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0/mo',
    verifications: '1,000',
    features: ['Session verification', 'Basic bot detection', 'Community support'],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: '$49/mo',
    verifications: '50,000',
    features: ['Everything in Free', 'Passport verification', 'Jitter Verified badge', 'Email support'],
    highlight: true,
  },
  {
    id: 'business',
    name: 'Business',
    price: '$199/mo',
    verifications: '500,000',
    features: ['Everything in Starter', 'Webhook delivery', 'Priority API', 'Priority support'],
  },
]

export function DashboardBilling() {
  const { data: customer } = useQuery({
    queryKey: ['customer'],
    queryFn: () => customerApi.getMyCustomer(),
  })

  const { data: usage } = useQuery({
    queryKey: ['usage', 'monthly'],
    queryFn: () => usageApi.getMonthlyUsage(),
  })

  const currentPlan = customer?.plan ?? 'free'

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Billing</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
          Current plan: <span className="capitalize font-medium" style={{ color: 'var(--color-primary)' }}>{currentPlan}</span>
        </p>
      </div>

      {/* Usage summary */}
      {usage && (
        <div className="p-4 rounded-xl border mb-8" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <div className="flex justify-between text-sm mb-2">
            <span style={{ color: 'var(--color-text-secondary)' }}>This month</span>
            <span style={{ color: 'var(--color-text-primary)' }}>
              {usage.verification_count.toLocaleString()} / {usage.limit === -1 ? '∞' : usage.limit.toLocaleString()}
            </span>
          </div>
          <div className="h-2 rounded-full" style={{ background: 'var(--color-border)' }}>
            <div
              className="h-2 rounded-full"
              style={{
                width: usage.limit === -1 ? '5%' : `${Math.min(100, (usage.verification_count / usage.limit) * 100)}%`,
                background: 'var(--color-primary)',
              }}
            />
          </div>
        </div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-3 gap-4">
        {PLANS.map(plan => {
          const isCurrent = plan.id === currentPlan
          return (
            <div
              key={plan.id}
              className="p-5 rounded-xl border"
              style={{
                background: plan.highlight ? 'color-mix(in srgb, var(--color-primary) 8%, var(--color-surface))' : 'var(--color-surface)',
                borderColor: plan.highlight ? 'var(--color-primary)' : 'var(--color-border)',
              }}
            >
              {plan.highlight && (
                <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: 'var(--color-primary)' }}>
                  Most popular
                </div>
              )}
              <p className="font-bold text-lg mb-0.5" style={{ color: 'var(--color-text-primary)' }}>{plan.name}</p>
              <p className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>{plan.price}</p>
              <p className="text-xs mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                {plan.verifications} verifications/mo
              </p>
              <ul className="space-y-1.5 mb-5">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    <span style={{ color: 'var(--color-human)' }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <div className="w-full py-2 rounded-lg text-xs font-medium text-center" style={{ background: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
                  Current plan
                </div>
              ) : (
                <a
                  href={`mailto:hello@jitter.so?subject=Upgrade to ${plan.name}&body=Hi, I'd like to upgrade my account (${customer?.contact_email}) to the ${plan.name} plan.`}
                  className="block w-full py-2 rounded-lg text-xs font-medium text-center"
                  style={{ background: 'var(--color-primary)', color: '#fff' }}
                >
                  {plan.id === 'free' ? 'Downgrade' : 'Upgrade →'}
                </a>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-6 text-center text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
        Enterprise plans available with custom limits, SLA, and dedicated support.{' '}
        <a href="mailto:hello@jitter.so?subject=Enterprise inquiry" style={{ color: 'var(--color-primary)' }}>
          Contact us
        </a>
      </div>

      <p className="text-center text-xs mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
        Billing is manual at this stage. Upgrades handled by email within 24 hours.
      </p>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: billing page with plan comparison and mailto upgrade CTA"
```

---

## Task 11: Admin Overview page

**Files:**
- Create: `src/pages/admin/Overview.jsx`

**Step 1: Create `src/pages/admin/Overview.jsx`**

```jsx
import { useQuery } from '@tanstack/react-query'
import { adminApi } from '../../api/adminApi'

function Stat({ label, value, sub, color }) {
  return (
    <div className="p-5 rounded-xl border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
      <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>{label}</p>
      <p className="text-3xl font-bold" style={{ color: color || 'var(--color-text-primary)' }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>{sub}</p>}
    </div>
  )
}

const EVENT_LABELS = {
  signup: { label: 'New signup', color: 'var(--color-human)' },
  upgrade: { label: 'Upgrade', color: 'var(--color-primary)' },
  downgrade: { label: 'Downgrade', color: 'var(--color-warning)' },
  cancel: { label: 'Cancellation', color: 'var(--color-danger)' },
  api_key_created: { label: 'API key created', color: 'var(--color-text-tertiary)' },
}

export function AdminOverview() {
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['admin', 'customers'],
    queryFn: () => adminApi.getAllCustomers(),
  })

  const { data: mrr = 0 } = useQuery({
    queryKey: ['admin', 'mrr'],
    queryFn: () => adminApi.getMrrEstimate(),
  })

  const { data: events = [] } = useQuery({
    queryKey: ['admin', 'events'],
    queryFn: () => adminApi.getRecentEvents(15),
  })

  const planCounts = customers.reduce((acc, c) => {
    acc[c.plan] = (acc[c.plan] || 0) + 1
    return acc
  }, {})

  const totalVerifications = customers.reduce((sum, c) => {
    return sum + (c.usage_daily || []).reduce((s, d) => s + d.verification_count, 0)
  }, 0)

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-warning)' }}>God Mode</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Business overview — visible to Denis only</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--color-warning)' }} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4 mb-8">
            <Stat
              label="MRR"
              value={`$${(mrr / 100).toLocaleString()}`}
              sub="monthly recurring revenue"
              color="var(--color-human)"
            />
            <Stat
              label="Total customers"
              value={customers.length}
              sub={`${planCounts.free || 0} free · ${(planCounts.starter || 0) + (planCounts.business || 0)} paid`}
            />
            <Stat
              label="Verifications"
              value={totalVerifications.toLocaleString()}
              sub="all time"
            />
            <Stat
              label="Paying customers"
              value={(planCounts.starter || 0) + (planCounts.business || 0) + (planCounts.enterprise || 0)}
              sub={`${planCounts.enterprise || 0} enterprise`}
              color="var(--color-primary)"
            />
          </div>

          {/* Plan breakdown */}
          <div className="grid grid-cols-4 gap-3 mb-8">
            {['free', 'starter', 'business', 'enterprise'].map(plan => (
              <div key={plan} className="p-4 rounded-xl border text-center" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                <p className="text-xs capitalize mb-1" style={{ color: 'var(--color-text-tertiary)' }}>{plan}</p>
                <p className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{planCounts[plan] || 0}</p>
              </div>
            ))}
          </div>

          {/* Recent events feed */}
          <div>
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-secondary)' }}>Recent events</h2>
            <div className="space-y-2">
              {events.length === 0 && (
                <p className="text-sm py-4 text-center" style={{ color: 'var(--color-text-tertiary)' }}>No events yet</p>
              )}
              {events.map(event => {
                const cfg = EVENT_LABELS[event.event_type] || { label: event.event_type, color: 'var(--color-text-tertiary)' }
                return (
                  <div
                    key={event.id}
                    className="flex items-center justify-between p-3 rounded-xl border"
                    style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ color: cfg.color, background: `color-mix(in srgb, ${cfg.color} 15%, var(--color-surface))` }}>
                        {cfg.label}
                      </span>
                      <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                        {event.platform_customers?.company_name || 'Unknown'}
                      </span>
                      {event.metadata?.to_plan && (
                        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>→ {event.metadata.to_plan}</span>
                      )}
                    </div>
                    <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      {new Date(event.created_at).toLocaleString()}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: admin overview with MRR, customer counts, and event feed"
```

---

## Task 12: Admin Customers page

**Files:**
- Create: `src/pages/admin/Customers.jsx`

**Step 1: Create `src/pages/admin/Customers.jsx`**

```jsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '../../api/adminApi'

const PLAN_COLORS = {
  free: 'var(--color-text-tertiary)',
  starter: 'var(--color-primary)',
  business: 'var(--color-human)',
  enterprise: 'var(--color-warning)',
}

export function AdminCustomers() {
  const queryClient = useQueryClient()
  const [sort, setSort] = useState('created_at')

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['admin', 'customers'],
    queryFn: () => adminApi.getAllCustomers(),
  })

  const upgradeMutation = useMutation({
    mutationFn: ({ id, plan }) => adminApi.updateCustomerPlan(id, plan),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'customers'] }),
  })

  const suspendMutation = useMutation({
    mutationFn: (id) => adminApi.suspendCustomer(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'customers'] }),
  })

  function getMonthlyTotal(customer) {
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    return (customer.usage_daily || [])
      .filter(d => d.date >= monthStart)
      .reduce((sum, d) => sum + d.verification_count, 0)
  }

  const sorted = [...customers].sort((a, b) => {
    if (sort === 'usage') return getMonthlyTotal(b) - getMonthlyTotal(a)
    if (sort === 'plan') return a.plan.localeCompare(b.plan)
    return new Date(b.created_at) - new Date(a.created_at)
  })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-warning)' }}>Customers</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Sort:</span>
          {['created_at', 'plan', 'usage'].map(s => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className="px-3 py-1 rounded-lg text-xs font-medium capitalize"
              style={{
                background: sort === s ? 'var(--color-surface-elevated)' : 'transparent',
                color: sort === s ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                border: '1px solid var(--color-border)',
              }}
            >
              {s === 'created_at' ? 'Recent' : s}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12" style={{ color: 'var(--color-text-tertiary)' }}>Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {['Company', 'Email', 'Plan', 'Usage (mo)', 'Joined', 'Status', 'Actions'].map(h => (
                  <th key={h} className="text-left pb-3 pr-4 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(c => (
                <tr
                  key={c.id}
                  style={{ borderBottom: '1px solid var(--color-border)', opacity: c.status === 'suspended' ? 0.5 : 1 }}
                >
                  <td className="py-3 pr-4 font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    {c.company_name}
                  </td>
                  <td className="py-3 pr-4 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {c.contact_email || '—'}
                  </td>
                  <td className="py-3 pr-4">
                    <select
                      value={c.plan}
                      onChange={e => upgradeMutation.mutate({ id: c.id, plan: e.target.value })}
                      className="text-xs font-medium capitalize px-2 py-1 rounded border-0 cursor-pointer"
                      style={{ background: 'transparent', color: PLAN_COLORS[c.plan] || 'var(--color-text-primary)' }}
                    >
                      {['free', 'starter', 'business', 'enterprise'].map(p => (
                        <option key={p} value={p} style={{ background: 'var(--color-surface)', color: 'var(--color-text-primary)' }}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 pr-4 text-xs font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                    {getMonthlyTotal(c).toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full capitalize"
                      style={{
                        color: c.status === 'active' ? 'var(--color-human)' : 'var(--color-danger)',
                        background: c.status === 'active'
                          ? 'color-mix(in srgb, var(--color-human) 15%, var(--color-surface))'
                          : 'color-mix(in srgb, var(--color-danger) 15%, var(--color-surface))',
                      }}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="py-3">
                    {c.status === 'active' && (
                      <button
                        onClick={() => {
                          if (confirm(`Suspend ${c.company_name}?`)) suspendMutation.mutate(c.id)
                        }}
                        className="text-xs"
                        style={{ color: 'var(--color-danger)' }}
                      >
                        Suspend
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {customers.length === 0 && (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
              No customers yet. Share the signup link.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: admin customers table with sortable columns and plan management"
```

---

## Task 13: Verification API (Supabase Edge Function)

This is the actual API that platform customers call to verify badges.

**Files:**
- Create: `supabase/functions/verify/index.ts`

**Step 1: Create Edge Function**

Create `supabase/functions/verify/index.ts`:

```typescript
// JITTEr Verification API — Supabase Edge Function
// POST /functions/v1/verify
// Authorization: Bearer pk_live_xxxxx
// Body: { badge: "<base64-encoded-badge-json>" }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Extract API key from Authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Missing API key' }, 401)
    }
    const rawKey = authHeader.slice(7).trim()

    // 2. Parse request body
    const { badge: badgeBase64 } = await req.json()
    if (!badgeBase64) {
      return json({ error: 'Missing badge in request body' }, 400)
    }

    // 3. Look up API key by prefix + hash match
    const keyPrefix = rawKey.substring(0, 12)
    const keyHashBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(rawKey)
    )
    const keyHash = Array.from(new Uint8Array(keyHashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: apiKey } = await supabase
      .from('api_keys')
      .select('id, customer_id, revoked_at')
      .eq('key_prefix', keyPrefix)
      .eq('key_hash', keyHash)
      .maybeSingle()

    if (!apiKey || apiKey.revoked_at) {
      return json({ error: 'Invalid or revoked API key' }, 401)
    }

    // 4. Decode and verify badge
    const badgeJson = atob(badgeBase64)
    let badge: Record<string, unknown>
    try {
      badge = JSON.parse(badgeJson)
    } catch {
      return json({ error: 'Invalid badge format' }, 400)
    }

    // 5. Verify ECDSA signature on badge
    let signatureValid = false
    const botDetected = badge.session?.bot_detected ?? true
    const suspicionScore = badge.passport?.suspicion_score ?? 100
    const passportAgeDays = badge.passport?.account_age_days ?? 0

    if (badge.crypto?.signature && badge.crypto?.public_key_jwk) {
      try {
        const { signature, ...payloadWithoutSignature } = badge
        // Normalize: remove signature field, sort keys, sign
        const payloadStr = JSON.stringify(payloadWithoutSignature, Object.keys(payloadWithoutSignature).sort())

        const publicKey = await crypto.subtle.importKey(
          'jwk',
          badge.crypto.public_key_jwk,
          { name: 'ECDSA', namedCurve: 'P-256' },
          false,
          ['verify']
        )

        const sigBytes = Uint8Array.from(atob(badge.crypto.signature), c => c.charCodeAt(0))
        signatureValid = await crypto.subtle.verify(
          { name: 'ECDSA', hash: { name: 'SHA-256' } },
          publicKey,
          sigBytes,
          new TextEncoder().encode(payloadStr)
        )
      } catch {
        signatureValid = false
      }
    }

    const valid = signatureValid && !botDetected && suspicionScore < 50

    // 6. Increment usage_daily (upsert)
    const today = new Date().toISOString().split('T')[0]
    await supabase.rpc('increment_usage', {
      p_customer_id: apiKey.customer_id,
      p_date: today,
      p_bot: !valid,
    })

    // 7. Insert verification record
    await supabase.from('verifications').insert({
      api_key_id: apiKey.id,
      valid,
      bot_detected: botDetected,
      suspicion_score: suspicionScore,
      passport_age_days: passportAgeDays,
    })

    // 8. Update last_used_at on key
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', apiKey.id)

    // 9. Return result
    return json({
      valid,
      bot_detected: botDetected,
      suspicion_score: suspicionScore,
      passport_age_days: passportAgeDays,
      signature_valid: signatureValid,
    })

  } catch (error) {
    console.error('Verify error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
```

**Step 2: Add `increment_usage` RPC to schema.sql**

Add to `supabase/schema.sql`:

```sql
-- Upsert daily usage counter (called by Edge Function with service role)
CREATE OR REPLACE FUNCTION increment_usage(
  p_customer_id UUID,
  p_date DATE,
  p_bot BOOLEAN
) RETURNS VOID AS $$
BEGIN
  INSERT INTO usage_daily (customer_id, date, verification_count, bot_count)
  VALUES (p_customer_id, p_date, 1, CASE WHEN p_bot THEN 1 ELSE 0 END)
  ON CONFLICT (customer_id, date) DO UPDATE
    SET
      verification_count = usage_daily.verification_count + 1,
      bot_count = usage_daily.bot_count + CASE WHEN p_bot THEN 1 ELSE 0 END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

Run this in Supabase SQL Editor.

**Step 3: Deploy the Edge Function**

```bash
# Install Supabase CLI if not installed
npm install -g supabase

# Link to your project (get project ID from Supabase dashboard URL)
supabase link --project-ref YOUR_PROJECT_REF

# Deploy the function
supabase functions deploy verify
```

**Step 4: Test with curl**

```bash
# Get a real API key from your /dashboard/api-keys page
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/verify \
  -H "Authorization: Bearer YOUR_FULL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"badge": "eyJ2ZXJzaW9uIjoiMi4wIn0="}'
```

Expected response (with a real badge from the extension):
```json
{
  "valid": true,
  "bot_detected": false,
  "suspicion_score": 12,
  "passport_age_days": 45,
  "signature_valid": true
}
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: verification API edge function + increment_usage RPC"
```

---

## Task 14: Deploy to Vercel

**Step 1: Build check**

```bash
npm run build
```

Expected: no errors. Output in `dist/`.

**Step 2: Push to GitHub**

```bash
# Create a new PRIVATE repo on github.com first, then:
git remote add origin https://github.com/YOUR_USERNAME/jitter-platform.git
git push -u origin main
```

**Step 3: Deploy on Vercel**

1. Go to vercel.com → New Project → Import from GitHub → select `jitter-platform`
2. Framework: Vite
3. Environment variables: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
4. Deploy

**Step 4: Configure Supabase Auth redirect URL**

In Supabase dashboard → Auth → URL Configuration:
- Add `https://your-vercel-url.vercel.app` to "Redirect URLs"

**Step 5: Verify production**

Open the Vercel URL, sign up with a real email, confirm, log in. Check that /dashboard loads with 0 stats.

**Step 6: Final commit**

```bash
git add -A
git commit -m "chore: deployment configuration"
git push
```

---

## Done — MVP Checklist

- [ ] Platform customer can sign up and log in
- [ ] Customer can create and revoke API keys (key shown once)
- [ ] Customer dashboard shows bots blocked + humans verified this month
- [ ] Usage meter shows progress toward plan limit
- [ ] Customer can copy integration snippet (HTML, React, REST)
- [ ] Billing page shows plan comparison + email upgrade CTA
- [ ] Denis can log in and see all customers at /admin
- [ ] Denis can change a customer's plan directly from the table
- [ ] Verification API edge function deployed and accepting badge payloads
- [ ] Deployed to Vercel, auth email redirects working
