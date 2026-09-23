import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
// EDOC_BASE_URL=https://vichsieh9-beep.github.io/edoc/ runs the same tests against the live site.
const BASE_URL = process.env.EDOC_BASE_URL || `http://127.0.0.1:${PORT}/`;

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // One golden file per name, shared by every OS (CI runs on Linux, development on macOS).
  snapshotPathTemplate: '{testDir}/__golden__/{arg}{ext}',
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  webServer: process.env.EDOC_BASE_URL
    ? undefined
    : {
        command: 'node scripts/serve.mjs',
        url: `http://127.0.0.1:${PORT}/`,
        reuseExistingServer: !process.env.CI,
      },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Engine, golden and tooling tests (ingest, changelog) need one browser only.
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: /(engine|golden|ingest|changelog)\.spec/ },
  ],
});
