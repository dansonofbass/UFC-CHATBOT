import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  testMatch: '**/admin-provider-settings.spec.ts',
  use: { ...base.use, baseURL: 'http://localhost:3120' },
  webServer: {
    command: 'npm run start -- --port 3120',
    url: 'http://localhost:3120',
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      ADMIN_SESSION_SECRET:
        process.env.ADMIN_BROWSER_TEST_SECRET || 'provider-settings-browser-fixture-secret',
    },
  },
});
