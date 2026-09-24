const { defineConfig } = require('@playwright/test');

// Run with `npm run test:e2e`. Playwright's own Chromium is used unless
// JITTER_CHROME points at another browser binary.
module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js', // *.test.js files are plain Node scripts (npm run test:unit)
  timeout: 60000,
  retries: 0,
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
    actionTimeout: 10000,
    baseURL: `file://${__dirname}`,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: process.env.JITTER_CHROME
          ? { executablePath: process.env.JITTER_CHROME }
          : {},
      },
    },
  ],
});
