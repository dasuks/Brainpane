import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/browser', workers: 1, timeout: 45000,
  use: { viewport: { width: 1400, height: 1000 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' } });
