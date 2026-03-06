# Jitter Archive -- Proof of Work

Every version below represents a real iteration of the Jitter system.
This is the build history -- from first prototype to production-ready extension.

---

## v1-jitter-protocol/
**"Jitter Protocol" -- The First Extension**
- Chrome Extension v1.0 (Manifest V3)
- 337-line content.js -- first biometric capture implementation
- Basic writer.html for typing environment
- Named "Jitter Protocol" before the Anvil rebrand
- **What it proved:** Keystroke biometrics can run in a browser extension

## v2-anvil-protocol/
**"Anvil Protocol" -- The Rebrand + Writer Expansion**
- Renamed to "Anvil Protocol" v2.0
- 562-line content.js -- significant expansion from v1
- Added background.js service worker
- Writer environment getting more sophisticated
- **What it proved:** The writing environment concept works, biometrics + authoring in one tool

## v3-anvil-claude-collab/
**"Anvil Protocol" -- AI-Assisted Development**
- Same Anvil Protocol v2.0 base
- 604-line content.js -- most complex content script of any version
- Built with Claude collaboration (hence the name)
- Pushed the biometric analysis further
- **What it proved:** AI pair programming accelerates biometric feature development

## v4-anvil-audit-rebuild/
**"Anvil - Human Verification" -- The Audit Rebuild**
- Fresh v1.0.0 rewrite with new name: "Anvil - Human Verification"
- 415-line content.js -- cleaner, more focused
- Added popup.html/popup.js -- first browser action UI
- Added verifier.html/verifier.js -- first standalone verification page
- Added icons/ directory -- first visual branding
- Included README.md -- first documentation
- **What it proved:** Verification is a separate concern from capture. Popup UI makes the extension usable.

## v5-jitter-copy/
**"Anvil Protocol" -- Working Copy / Backup**
- Anvil Protocol v2.0, 385-line content.js
- Appears to be a working snapshot/backup of the v2 era
- **What it proved:** Multiple working copies = Denis was actively iterating

## google-drive-originals/
**Google Drive Archive -- The Paper Trail**
- Original extension files (background.js, content.js, manifest.json, writer)
- JITTEr-main.zip -- earliest known complete package
- jitter-build-specs.docx -- original build specifications
- JITTEr-Passport-Economic-Thesis.docx (3 versions!) -- the economic thesis that became the patent
- **What it proved:** The economic thesis existed BEFORE the code. Ideas came first, then implementation.

---

## anvil-files/
**All Anvil Project Code -- Collected From Every Source**
- `anvil-main/` -- Original Anvil repo (README only -- the starting point)
- `anvil-extension/` -- Anvil Chrome extension with icons, popup, verifier, writer
- `anvil-extension-2/` -- Second extension copy (background, content, manifest, writer)
- `anvil-audit-purity-tracking/` -- Audit version with purity tracking, popup, verifier
- `anvil-keyboard-downloads/` -- Android Kotlin IME (BiometricTracker, AnvilInputMethodService)
- `anvil-keyboard-icloud/` -- iCloud backup of same Android keyboard
- **What it proved:** Anvil was a full product vision -- Chrome extension + Android keyboard + verification system

## jitter-main-v1/
**JITTEr GitHub Repo -- First Download**
- Early modular version with crypto-utils.js, passport-utils.js
- verify.html, writer.html, IMPROVEMENTS.md
- **What it proved:** Cryptographic badge signing and passport system existed early

## jitter-main-v2/
**JITTEr GitHub Repo -- Full Version**
- Complete with auth-utils.js, CO_FOUNDER_AGREEMENT.md, IP_DECLARATION.md
- JITTER_FOUNDATIONS.md (610-line product bible), docs/, LICENSE
- **What it proved:** This was a serious project with legal docs, IP declarations, and architectural planning

## jitter-sdk/
**Embeddable Widget SDK**
- build.js, src/, dist/, examples/, tests/, API docs
- CLAUDE.md, vercel.json -- deployment-ready
- **What it proved:** The vision extended beyond Chrome extension to embeddable infrastructure (Stripe model)

---

## Timeline Summary

```
v1  "Jitter Protocol"         337 lines   First prototype
v2  "Anvil Protocol"          562 lines   Rebrand + expansion
v3  "Anvil + Claude"          604 lines   AI-assisted peak complexity
v4  "Anvil - Human Verify"    415 lines   Clean rewrite + popup/verifier
v5  Working copy              385 lines   Active iteration snapshot
v6  Current (extension-v2)   2400+ lines  Modular architecture, 6 modules
```

Total lines written across all versions: ~4,700+ (archive only)
Current production version: ~2,400+ lines across 6 modular files

This archive represents months of iteration from a single founder
building a novel biometric verification system from scratch.
