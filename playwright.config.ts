import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
const extraHTTPHeaders = bypassSecret
  ? { "x-vercel-protection-bypass": bypassSecret }
  : undefined;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    extraHTTPHeaders,
    viewport: { width: 1280, height: 720 },
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "pnpm start",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        // Unconfigured on purpose: no provider keys, so no real API calls.
        env: {
          ...process.env,
          YOUTUBE_API_KEY: "",
          TWITCH_CLIENT_ID: "",
          TWITCH_CLIENT_SECRET: "",
        },
      },
});
