# ⚒️ Anvil - Human Verification Extension

A Chrome extension that tracks and verifies human authenticity in written content through biometric analysis, keystroke dynamics, and input source tracking.

## Features

### 1. **Project Mode Tracking**
- Toggle Project Mode on any webpage to start tracking input authenticity
- **Human Characters**: Tracked via keyboard events (keydown)
- **Alien Characters**: Tracked via paste events and DOM mutations
- **Purity Score**: Calculated as `(humanChars / (humanChars + alienChars)) * 100`

### 2. **Chord Detection**
- Measures latency between Ctrl/Cmd and 'V' key presses
- Flags paste operations with <10ms latency as **scripted/robotic**
- Helps identify automated or bot-generated input

### 3. **Biometric Jitter Analysis**
- Captures keystroke flight times (intervals between keystrokes)
- Calculates standard deviation to measure natural human typing variation
- Displayed in real-time in the Writer utility

### 4. **Anvil Writer**
- Full-screen contenteditable writing environment
- Real-time sidebar displaying:
  - Purity Score
  - Human/Alien character counts
  - Biometric jitter (ms)
  - Word count
  - Live keystroke jitter graph
- Export functionality with embedded verification metadata
- Smart Badge generation

### 5. **Smart Badge System**
- Generates rich HTML `<a>` tags with Base64-encoded session data
- Badges contain:
  - Purity score
  - Human/Alien character counts
  - Biometric jitter
  - Session duration
  - Timestamp and source URL
- Clickable badges open Certificate of Authenticity

### 6. **Badge Verification**
- DOM scanner automatically detects Smart Badges on web pages
- Extension icon turns blue when badges are found
- Click badge to view detailed Certificate of Authenticity
- Verifier displays:
  - Purity assessment (High/Medium/Low)
  - All verification metrics
  - Session metadata
  - Verification hash

### 7. **Safety Features**
- **Hold-to-Reset**: Requires 2-second hold to prevent accidental data loss
- **Debounced saves**: Optimizes performance by batching storage writes
- **Robust error handling**: Gracefully handles restricted sites (USPTO, etc.)

## Installation

### Development Mode
1. Clone this repository
2. Generate icons (optional - placeholders are provided):
   ```bash
   cd icons
   open generate-icons.html
   # Click "Download All" and move PNGs to icons/
   ```
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" (toggle in top right)
5. Click "Load unpacked"
6. Select the `anvil` directory

### Production Build
1. Ensure all icons are properly generated
2. Test all features thoroughly
3. Zip the directory (excluding .git, node_modules, etc.)
4. Upload to Chrome Web Store

## Usage

### Tracking on Web Pages
1. Navigate to any website
2. Click the Anvil extension icon
3. Toggle "Project Mode" ON
4. Start typing or interacting with the page
5. View real-time stats in the popup

### Using Anvil Writer
1. Click the Anvil extension icon
2. Click "Open Writer"
3. Start typing in the full-screen editor
4. Monitor your purity score in real-time
5. Generate Smart Badges or export your work

### Generating Smart Badges
1. After writing content, click "Generate Smart Badge"
2. The badge HTML is copied to your clipboard
3. Paste the badge into any webpage or document
4. Recipients can click the badge to verify authenticity

### Verifying Badges
1. Navigate to a page containing an Anvil Smart Badge
2. The extension icon will turn blue automatically
3. Click the badge to open the Certificate of Authenticity
4. View detailed verification metrics and assessment

## Architecture

### Core Files
- **manifest.json**: Extension configuration and permissions
- **content.js**: Injected into web pages; tracks user input
- **background.js**: Service worker; manages icon state and messaging
- **popup.html/js**: Extension popup UI
- **writer.html/js**: Full-screen writing environment
- **verifier.html/js**: Certificate of Authenticity viewer

### State Management
- Uses `chrome.storage.local` for persistent state
- Debounced saves (500ms) for performance optimization
- State includes:
  - Project mode status
  - Human/Alien character counts
  - Keystroke flight times (last 100)
  - Session metadata

### Event Tracking
- **Keydown**: Tracks human input + chord detection
- **Paste**: Tracks alien input from clipboard
- **Mutations**: Detects programmatic content insertion
- **Performance API**: Precise timing for chord detection

## Security & Privacy

- All data stored locally using `chrome.storage.local`
- No external network requests
- No telemetry or analytics
- Badge data is client-side only
- Works completely offline after installation

## Technical Details

### Purity Calculation
```javascript
purity = (humanChars / (humanChars + alienChars)) * 100
```

### Jitter Calculation
```javascript
mean = average(flightTimes)
variance = sum((time - mean)^2) / count
jitter = sqrt(variance)
```

### Chord Detection
```javascript
latency = performance.now() - modifierDownTime
isRobotic = (latency < 10ms)
```

### Badge Encoding
```javascript
badgeData = { humanChars, alienChars, purity, jitter, ... }
encoded = btoa(JSON.stringify(badgeData))
url = "#anvil:" + encoded
```

## Browser Compatibility

- **Chrome**: ✅ Full support (Manifest V3)
- **Edge**: ✅ Full support (Chromium-based)
- **Firefox**: ⚠️ Requires Manifest V2 conversion
- **Safari**: ⚠️ Requires Safari extension conversion

## Performance Optimizations

1. **Debounced Storage**: 500ms delay prevents excessive writes
2. **Limited History**: Only last 100 keystroke intervals stored
3. **Efficient DOM Scanning**: Debounced badge detection (1s delay)
4. **Event Capture**: Uses event capturing phase for efficiency
5. **RequestAnimationFrame**: UI updates batched with browser repaints

## Known Limitations

1. Cannot track input on restricted pages (chrome://, etc.)
2. Some websites may block clipboard access
3. Mutation observer may miss very fast programmatic changes
4. Jitter calculation requires minimum 2 keystrokes

## Development

### File Structure
```
anvil/
├── manifest.json           # Extension manifest
├── content.js             # Content script
├── background.js          # Service worker
├── popup.html/js          # Extension popup
├── writer.html/js         # Writing environment
├── verifier.html/js       # Badge verifier
├── icons/                 # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   ├── icon128.png
│   ├── icon.svg
│   ├── generate-icons.html
│   └── create-placeholders.js
└── README.md
```

### Building
No build process required - this is a pure vanilla JavaScript extension.

### Testing
1. Test on various websites (blogs, Google Docs, contenteditable, etc.)
2. Test paste detection with various sources
3. Verify chord detection with different timing
4. Test badge generation and verification flow
5. Verify icon color changes on badge detection

## Contributing

Contributions welcome! Please ensure:
- Code follows existing style
- All features are tested
- Documentation is updated
- No external dependencies added

## License

MIT License - See LICENSE file for details

## Credits

Created for human verification and content authenticity tracking.

Icon design: Gradient anvil (⚒️) symbolizing forging authentic human content.

---

**Version**: 1.0.0
**Last Updated**: 2026-01-11
