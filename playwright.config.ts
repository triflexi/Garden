import { defineConfig, devices } from '@playwright/test';
const external = process.env.E2E_BASE_URL;
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: external ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: external
    ? undefined
    : [
        {
          command: 'npm run dev -w @listva/api',
          url: 'http://127.0.0.1:3000/api/health/ready',
          reuseExistingServer: !process.env.CI,
          timeout: 90000,
          env: { PUBLIC_ORIGIN: 'http://localhost:5173' },
        },
        {
          command: 'npm run dev -w @listva/web -- --host localhost',
          url: 'http://localhost:5173',
          reuseExistingServer: !process.env.CI,
          timeout: 60000,
        },
      ],
});
