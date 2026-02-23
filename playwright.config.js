/**
 * Playwright configuration for JITTEr extension testing
 */

module.exports = {
    testDir: './tests',
    timeout: 60000,
    retries: 0,
    workers: 1, // Run tests sequentially
    use: {
        headless: false, // Extensions require headed mode
        viewport: { width: 1280, height: 720 },
        screenshot: 'only-on-failure',
        video: 'retain-on-failure'
    },
    projects: [
        {
            name: 'chromium',
            use: {
                browserName: 'chromium',
                channel: 'chrome'
            }
        }
    ]
};
