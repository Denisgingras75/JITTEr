# JITTEr Platform — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan from this design.

**Goal:** Build the JITTEr B2B platform — a React SPA where platform customers (Yelp, Reddit, schools, etc.) self-manage their JITTEr integration, and Denis manages the entire business from a super-admin view.

**Author:** Denis Gingras
**Date:** 2026-02-21

---

## 1. What This Is

Two products in one app:

1. **Customer Dashboard** — self-service for platform customers. They sign up, get API keys, embed the widget, and see how many bots they're blocking.
2. **Super-Admin** — Denis's god-mode. Every customer, every verification, MRR, churn, upgrade events.

Both live at the same domain (e.g., `app.jitter.so`). Supabase RLS enforces the role separation.

---

## 2. Architecture

**Stack:**
- React 19 + Vite + Tailwind CSS
- Supabase (new project, free tier — ~$0/month)
- Vercel (free tier hosting)
- No other services at MVP

**New repo:** `jitter-platform` (separate from the Chrome extension)

**Routing:**
```
/                     → redirect: logged in → /dashboard, logged out → /login
/login                → auth for both roles
/signup               → platform customer account creation

/dashboard            → customer home (layout with sidebar)
/dashboard/overview   → bots blocked, humans verified, usage vs limit
/dashboard/api-keys   → create/revoke/view API keys
/dashboard/embed      → copy-paste integration snippet
/dashboard/billing    → plan, usage meter, upgrade CTA
/dashboard/settings   → company name, contact email, notifications

/admin                → Denis's super-admin (layout with sidebar, RLS blocks others)
/admin/overview       → MRR, total customers, total verifications, alerts
/admin/customers      → all platform accounts, plan, status, last active
/admin/analytics      → verification volume by day, bot rates, top platforms
/admin/settings       → pricing tier limits, global rate limits, feature flags
```

---

## 3. Data Model (Supabase)

### Table: `platform_customers`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE
company_name    TEXT NOT NULL
plan            TEXT NOT NULL DEFAULT 'free'  -- 'free' | 'starter' | 'business' | 'enterprise'
status          TEXT NOT NULL DEFAULT 'active' -- 'active' | 'suspended'
contact_email   TEXT
created_at      TIMESTAMPTZ DEFAULT now()
```

### Table: `api_keys`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
customer_id     UUID REFERENCES platform_customers(id) ON DELETE CASCADE
name            TEXT NOT NULL DEFAULT 'Default'
key_prefix      TEXT NOT NULL   -- first 12 chars shown in UI ('pk_live_abc1')
key_hash        TEXT NOT NULL   -- sha256 of full key (plaintext never stored)
env             TEXT NOT NULL DEFAULT 'live'  -- 'live' | 'test'
created_at      TIMESTAMPTZ DEFAULT now()
revoked_at      TIMESTAMPTZ     -- NULL = active
last_used_at    TIMESTAMPTZ
```

### Table: `usage_daily`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
customer_id     UUID REFERENCES platform_customers(id) ON DELETE CASCADE
date            DATE NOT NULL
verification_count  INTEGER NOT NULL DEFAULT 0
bot_count           INTEGER NOT NULL DEFAULT 0
UNIQUE(customer_id, date)
```

### Table: `verifications`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
api_key_id      UUID REFERENCES api_keys(id)
valid           BOOLEAN NOT NULL
bot_detected    BOOLEAN NOT NULL DEFAULT false
suspicion_score INTEGER
passport_age_days INTEGER     -- NULL if no passport
created_at      TIMESTAMPTZ DEFAULT now()
-- NOTE: No badge content stored here. Metadata only. Keeps rows ~80 bytes.
-- Index: (api_key_id, created_at DESC) for dashboard queries
```

### Table: `webhook_endpoints`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
customer_id     UUID REFERENCES platform_customers(id) ON DELETE CASCADE
url             TEXT NOT NULL
secret_hash     TEXT NOT NULL   -- sha256 of signing secret
active          BOOLEAN DEFAULT true
created_at      TIMESTAMPTZ DEFAULT now()
```

### Table: `customer_events`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
customer_id     UUID REFERENCES platform_customers(id)
event_type      TEXT NOT NULL  -- 'signup' | 'upgrade' | 'downgrade' | 'cancel' | 'api_key_created'
metadata        JSONB          -- { from_plan: 'free', to_plan: 'starter' }
created_at      TIMESTAMPTZ DEFAULT now()
-- This is Denis's investor metrics table. MRR, churn, conversion all computable from this.
```

### Table: `plans`
```sql
id              TEXT PRIMARY KEY  -- 'free' | 'starter' | 'business' | 'enterprise'
name            TEXT NOT NULL
monthly_verifications  INTEGER NOT NULL  -- -1 = unlimited
price_cents     INTEGER NOT NULL  -- 0 for free, -1 for enterprise custom
```

**Seed data:**
```sql
INSERT INTO plans VALUES
  ('free',       'Free',     1000,    0),
  ('starter',    'Starter',  50000,   4900),
  ('business',   'Business', 500000,  19900),
  ('enterprise', 'Enterprise', -1,   -1);
```

---

## 4. Auth Model

- **Platform customers:** Sign up via `/signup`. Supabase Auth creates a `auth.users` row. After email confirmation, a `platform_customers` row is created via trigger or onboarding step.
- **Super-admin (Denis):** Manually insert Denis's `user_id` into an `admins` table (same pattern as WGH). RLS on `/admin/*` routes checks `admins` membership.

```sql
-- admins table (simple, same as WGH)
CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: customers only see their own data
ALTER TABLE platform_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_data" ON platform_customers
  FOR ALL USING (auth.uid() = user_id);

-- RLS: admins see everything
CREATE POLICY "admin_all" ON platform_customers
  FOR ALL USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()));
```

---

## 5. Business Model — Pricing Tiers

| Tier | Price | Verifications/mo | Passport verify | Webhooks |
|---|---|---|---|---|
| Free | $0 | 1,000 | No (session-only) | No |
| Starter | $49/mo | 50,000 | Yes | No |
| Business | $199/mo | 500,000 | Yes | Yes |
| Enterprise | Custom | Unlimited | Yes | Yes + SLA |

**Why these numbers work on a budget:**
- Supabase free tier covers ~50 paying customers before DB costs
- 10 Starter customers = $490 MRR — covers first infra upgrade
- 5 Business customers = $995 MRR — profitable solo operation
- 1 Enterprise deal = $2K-5K MRR — changes everything

**Revenue mechanics:**
- Land on free (zero friction to start, no credit card required)
- Expand naturally: 1,000 verifications runs out fast for any real platform
- Upgrade path is self-serve: billing page shows usage vs limit, upgrade button
- Stripe integration deferred to post-MVP (manually invoice first Enterprise customer)

---

## 6. Key UI Sections

### Customer Dashboard: Overview
The headline metric that makes them stay:
```
┌────────────────────────────────────────┐
│  847 bots blocked       Feb 2026       │
│  9,153 humans verified                 │
│  ████████░░  9,153 / 50,000           │
│  1,000 uses remaining on Starter plan  │
│  [Upgrade to Business]                 │
└────────────────────────────────────────┘
```

Chart: verifications per day (7-day rolling). Two lines: humans verified vs bots blocked.

### Customer Dashboard: API Keys
- List of keys: `pk_live_abc1xxxx` · name · created date · last used · [Revoke]
- "Create new key" button → modal with name field → shows full key ONCE (copy prompt)
- Test keys for integration (`pk_test_`) vs live keys (`pk_live_`)

### Customer Dashboard: Embed
Copy-paste snippet. Three tabs: HTML widget, React component, REST API.

```html
<!-- Drop in your review form -->
<script src="https://cdn.jitter.so/widget.js"></script>
<jitter-widget api-key="pk_live_abc1xxxx" />
```

### Customer Dashboard: Billing
- Plan pill: "Starter — $49/mo"
- Usage this month: progress bar, days remaining in billing period
- [Upgrade] / [Cancel] buttons
- Note: Stripe not wired at MVP. Upgrade → "Contact us" mailto link.

### Super-Admin: Overview
```
MRR: $2,457    ↑ $490 this month
Customers: 47  (12 free, 31 Starter, 4 Business)
Verifications: 1.2M this month
Bot detection: 8.3%
```

Recent customer events (upgrades, new signups, cancels — live feed).

### Super-Admin: Customers Table
Columns: Company, Plan, Verifications (this month), Last active, Status, [View]

Sortable by plan, usage, join date. Click → customer detail page (their API keys, usage history, event log).

---

## 7. Integration with JITTEr Extension

The Chrome extension (existing) and the platform are connected at the **verification endpoint**.

When a platform embeds the widget:
1. Widget captures typing session → mints badge (ECDSA-signed, same as extension)
2. Widget sends badge to `POST /api/v1/verify` with `Authorization: Bearer pk_live_xxxx`
3. Server validates signature, scores passport, returns `{ valid, bot_detected, suspicion_score, passport_age_days }`
4. Platform shows "Jitter Verified" on content or drops the review

The verification API is a Supabase Edge Function (or lightweight Vercel serverless function). It:
- Looks up API key by prefix, hashes the provided key, checks against stored hash
- Validates ECDSA badge signature (Web Crypto API works in Edge Functions)
- Increments `usage_daily`, inserts into `verifications`
- Returns result JSON

---

## 8. What This Is NOT (MVP Scope)

- No Stripe billing (manual for first Enterprise customer)
- No webhooks (the table is there, the delivery system is not)
- No team members / multiple users per account
- No public docs site (use a Notion page or README for now)
- No mobile app
- No analytics beyond the dashboard numbers

All of these are V2. The MVP proves the business model with one paying customer.

---

## 9. Success Criteria for MVP

- [ ] Platform customer can sign up and log in
- [ ] Customer can create and revoke API keys
- [ ] Customer can see their usage and bot-blocking stats
- [ ] Customer can copy-paste the embed snippet
- [ ] Denis can see all customers and their usage in `/admin`
- [ ] The verification API endpoint accepts a badge + API key and returns a result
- [ ] One real platform has integrated the widget (even if manually onboarded)
