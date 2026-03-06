# Anvil Protocol - Chrome Extension

A biometric writing environment that tracks human vs AI-generated input to verify content authenticity.

## Features

- **Purity Score**: Tracks the ratio of typed (human) vs pasted (potentially AI) content
- **Passport System**: Global reputation tracking across all websites
- **Project Mode**: Per-document tracking for specific writing sessions
- **Smart Badges**: Verifiable badges you can embed in documents
- **Biometrics**: Keystroke jitter analysis for authenticity verification

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `anvil-extension` folder

## Files

- `manifest.json` - Extension configuration
- `background.js` - Service worker (handles extension icon click)
- `content.js` - Runs on all pages, tracks input and shows the floating shield
- `writer.html` - Dedicated clean-room writing environment
- `writer.js` - Logic for the writer page

## Usage

### Floating Shield (Any Website)
- Click the 🛡️ shield icon in the bottom-right corner of any page
- Start a project to track your writing session
- Copy a "Smart Badge" to embed in your document

### Writer Mode
- Click the extension icon in Chrome toolbar to open the dedicated writer
- Everything typed is tracked; pasting is logged as "alien" content
- Export with a verification badge attached

## Icons

You'll need to add icon files to the `icons/` folder:
- `icon16.png` (16x16)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

Or remove the icon references from `manifest.json` to use Chrome's default.

## Fixes in This Version

1. **Fixed jitter calculation** - Variance formula was incorrect (was adding values twice)
2. **Fixed emoji encoding** - Proper UTF-8 emojis instead of mojibake
3. **Fixed paste handling** - Uses proper selection API instead of deprecated execCommand
4. **Added XSS protection** - escapeHtml function for user data
5. **Added click-outside-to-close** for the floating menu
6. **Added clipboardWrite permission** for reliable clipboard access
7. **Improved error handling** throughout
8. **Better CSS organization** and visual polish
