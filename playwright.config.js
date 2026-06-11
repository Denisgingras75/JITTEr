const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  // Playwright owns *.spec.js only. The *.test.js / *.test.mjs files in tests/
  // are plain node scripts (run via `npm run test:unit`) — without this scoping,
  // Playwright's default testMatch tries to load them and chokes on their
  // top-level process.exit calls.
  testMatch: '**/*.spec.js',
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
        launchOptions: {
          executablePath: '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome',
        },
      },
    },
  ],
});
