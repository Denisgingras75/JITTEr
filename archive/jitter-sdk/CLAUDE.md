# Jitter SDK

Embeddable typing biometrics widget. Content provenance, not bot detection. Transparency as a product.

## What This Is
`<script>` tag any site drops in. Captures HOW users type (never WHAT). Returns confidence score + visible badge. Passport persists across sessions.

## Rules
- !raw-keystrokes-over-network — only aggregated stats hit the API
- !text-content-capture — we see timing, never content
- !es2023 — core uses var/function for max browser compat
- !dependencies in core — zero deps, zero build step for script tag
- Zero framework coupling — vanilla JS core, framework wrappers are separate

## Structure
src/core/ — capture engine + scorer (extracted from WGH jitter-box.js)
src/init.js — Jitter.init(), auto-attach, config
src/api-client.js — POST to API on score()
src/badge.js — badge rendering (shadow DOM)
api/ — Supabase Edge Functions
dist/ — bundled output
examples/ — vanilla + React demos

## Build
`npm run build` — bundles to dist/jitter.min.js

## Origin
Core extracted from whats-good-here/src/utils/jitter-box.js (already tested, 11/11 hardened checks passing).
