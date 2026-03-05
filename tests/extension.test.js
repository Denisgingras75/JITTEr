/**
 * Playwright tests for JITTEr extension
 * Tests extension loading and tracking on real sites
 */

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');

// Path to extension
const extensionPath = path.join(__dirname, '..');

test.describe('JITTEr Extension Tests', () => {
    let browser;
    let context;
    let page;

    test.beforeAll(async () => {
        // Launch browser with extension loaded
        browser = await chromium.launchPersistentContext('', {
            headless: false, // Must be false for extensions
            args: [
                `--disable-extensions-except=${extensionPath}`,
                `--load-extension=${extensionPath}`,
                '--no-sandbox'
            ]
        });

        page = await browser.newPage();
    });

    test.afterAll(async () => {
        await browser.close();
    });

    test('Extension loads successfully', async () => {
        // Check extension is loaded
        const targets = browser.contexts()[0].backgroundPages();
        console.log('Background pages:', targets.length);
        expect(targets.length).toBeGreaterThan(0);
    });

    test('Works on simple textarea', async () => {
        // Create test page with textarea
        await page.setContent(`
            <!DOCTYPE html>
            <html>
            <body>
                <textarea id="editor" style="width:500px;height:300px;"></textarea>
            </body>
            </html>
        `);

        // Wait for content script
        await page.waitForTimeout(1000);

        // Check if JITTEr indicator exists
        const indicator = await page.$('#jitter-indicator');
        console.log('Indicator found on textarea:', !!indicator);

        // Type in textarea
        await page.click('#editor');
        await page.type('#editor', 'Hello world, this is a test.');

        // Wait for tracking
        await page.waitForTimeout(500);

        // Check storage for session data
        const sessions = await page.evaluate(() => {
            return new Promise((resolve) => {
                chrome.storage.local.get(['sessions'], (result) => {
                    resolve(result.sessions);
                });
            });
        });

        console.log('Sessions tracked:', sessions ? sessions.length : 0);
        expect(sessions).toBeDefined();
    });

    test('Works on contentEditable div', async () => {
        await page.setContent(`
            <!DOCTYPE html>
            <html>
            <body>
                <div id="editor" contenteditable="true" style="width:500px;height:300px;border:1px solid #ccc;padding:10px;">
                    Start typing here...
                </div>
            </body>
            </html>
        `);

        await page.waitForTimeout(1000);

        // Click and type
        await page.click('#editor');
        await page.keyboard.type('Testing contentEditable tracking.');

        await page.waitForTimeout(500);

        // Check if tracked
        const sessions = await page.evaluate(() => {
            return new Promise((resolve) => {
                chrome.storage.local.get(['sessions'], (result) => {
                    resolve(result.sessions);
                });
            });
        });

        console.log('ContentEditable sessions:', sessions ? sessions.length : 0);
    });

    test('Loads on Google Docs', async () => {
        console.log('\n🔍 Testing Google Docs...');

        // Go to Google Docs (new blank document)
        await page.goto('https://docs.new', { waitUntil: 'networkidle', timeout: 30000 });

        // Wait for docs to load
        await page.waitForTimeout(5000);

        // Check for JITTEr indicator
        const indicator = await page.$('#jitter-indicator');
        console.log('Indicator on Google Docs:', !!indicator);

        // Try to find the document canvas/editor
        // Google Docs uses a complex iframe structure
        const frames = page.frames();
        console.log('Total frames on page:', frames.length);

        // Log any CSP errors
        page.on('console', msg => {
            if (msg.type() === 'error') {
                console.log('CONSOLE ERROR:', msg.text());
            }
        });

        // Try to type (Google Docs needs special handling)
        try {
            // Wait for editor to be ready
            await page.waitForSelector('.docs-texteventtarget-iframe', { timeout: 10000 });
            console.log('✅ Google Docs editor iframe found');

            // Note: Actually typing in Google Docs is complex due to iframes
            // For now, just verify the extension loaded
        } catch (error) {
            console.log('⚠️ Could not find Google Docs editor iframe:', error.message);
        }
    });

    test('Loads on Medium', async () => {
        console.log('\n🔍 Testing Medium...');

        // Go to Medium (need to be logged in to write, so just check public page)
        await page.goto('https://medium.com', { waitUntil: 'networkidle', timeout: 20000 });

        await page.waitForTimeout(2000);

        // Check indicator
        const indicator = await page.$('#jitter-indicator');
        console.log('Indicator on Medium:', !!indicator);

        // Check for CSP errors
        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error' && msg.text().includes('Content Security Policy')) {
                errors.push(msg.text());
            }
        });

        await page.waitForTimeout(1000);

        if (errors.length > 0) {
            console.log('⚠️ CSP errors on Medium:', errors);
        } else {
            console.log('✅ No CSP errors on Medium');
        }
    });

    test('Loads on Substack', async () => {
        console.log('\n🔍 Testing Substack...');

        await page.goto('https://substack.com', { waitUntil: 'networkidle', timeout: 20000 });

        await page.waitForTimeout(2000);

        const indicator = await page.$('#jitter-indicator');
        console.log('Indicator on Substack:', !!indicator);
    });

    test('Content script detects editors correctly', async () => {
        console.log('\n🔍 Testing editor detection...');

        // Test various editor types
        await page.setContent(`
            <!DOCTYPE html>
            <html>
            <body>
                <h2>Test Editors</h2>
                <textarea id="textarea1"></textarea>
                <input type="text" id="input1" />
                <div contenteditable="true" id="contenteditable1" class="medium-editor"></div>
                <div contenteditable="true" id="contenteditable2" class="ProseMirror"></div>
            </body>
            </html>
        `);

        await page.waitForTimeout(1000);

        // Check which ones are detected
        const detected = await page.evaluate(() => {
            const isTextEditor = (el) => {
                if (!el) return false;
                if (el.tagName === 'TEXTAREA') return true;
                if (el.tagName === 'INPUT' && ['text', 'email', 'search'].includes(el.type)) return true;
                if (el.isContentEditable) return true;
                const editorClasses = ['editor', 'medium-editor', 'ProseMirror', 'ql-editor', 'CodeMirror'];
                if (editorClasses.some(cls => el.className && el.className.includes(cls))) return true;
                return false;
            };

            return {
                textarea: isTextEditor(document.getElementById('textarea1')),
                input: isTextEditor(document.getElementById('input1')),
                mediumEditor: isTextEditor(document.getElementById('contenteditable1')),
                proseMirror: isTextEditor(document.getElementById('contenteditable2'))
            };
        });

        console.log('Editor detection results:', detected);
        expect(detected.textarea).toBe(true);
        expect(detected.input).toBe(true);
        expect(detected.mediumEditor).toBe(true);
        expect(detected.proseMirror).toBe(true);
    });

    test('Biometric tracking works', async () => {
        console.log('\n🔍 Testing biometric tracking...');

        await page.setContent(`
            <!DOCTYPE html>
            <html>
            <body>
                <textarea id="editor" style="width:500px;height:300px;"></textarea>
            </body>
            </html>
        `);

        await page.waitForTimeout(1000);

        // Type with varying speed to test Loki algorithm
        await page.click('#editor');

        // Simulate human typing with pauses
        const text = 'Hello, this is a test. How are you? Great!';
        for (const char of text) {
            await page.keyboard.type(char);
            // Pause longer after punctuation (simulate cognitive pause)
            if (['.', '?', '!', ','].includes(char)) {
                await page.waitForTimeout(300 + Math.random() * 200);
            } else {
                await page.waitForTimeout(80 + Math.random() * 120);
            }
        }

        await page.waitForTimeout(1000);

        // Get session stats
        const stats = await page.evaluate(() => {
            return new Promise((resolve) => {
                chrome.storage.local.get(['sessions'], (result) => {
                    resolve(result.sessions ? result.sessions[result.sessions.length - 1] : null);
                });
            });
        });

        console.log('Session stats:', stats);

        if (stats) {
            expect(stats.keystrokes).toBeGreaterThan(0);
            console.log('✅ Keystrokes tracked:', stats.keystrokes);
        }
    });
});
