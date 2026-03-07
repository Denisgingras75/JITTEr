# Attestation Server — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace anvil-protocol.com placeholder with real Supabase backend — attestations table, /attest endpoint, /verify badge page.

**Architecture:** Client-side WAR scoring (no raw biometrics leave device). Supabase stores only: user_id, site_key, war_score, badge_hash, flags, classification. Badge hash = SHA-256(user_id + site_key + war_score + timestamp).

**Tech Stack:** Supabase (Postgres + Edge Functions/Deno), jitter-capture.js client integration.

**BLOCKER:** Denis must create Supabase project at supabase.com first. Need: project ref, anon key, service role key.

---

### Task 1: Init Supabase in repo
- `supabase init` in /tmp/jitter-clone
- `supabase link --project-ref <REF>`
- Commit config

### Task 2: Create attestations table
- Migration: `supabase/migrations/20260307000001_create_attestations.sql`
- Columns: id, user_id, site_key, war_score, classification, badge_hash, flags[], meta jsonb, created_at
- RLS: public SELECT (verify), service role INSERT
- `supabase db push`

### Task 3: /attest edge function
- POST: user_id, site_key, war_score, classification, flags, meta
- Generates badge_hash via SHA-256
- Returns: { badge_hash, timestamp, classification }

### Task 4: /verify edge function
- GET ?hash= returns HTML verification page
- Shows: WAR score, classification, platform, date, flags

### Task 5: Wire jitter-capture.js to /attest
- Optional attestUrl config
- POST after scoring, never blocks review submit
- Returns badge_hash on result

### Task 6: Replace anvil-protocol.com everywhere

### Task 7: Push
