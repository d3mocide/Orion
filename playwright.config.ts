import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,

  use: {
    baseURL: "http://localhost:5173",
    headless: true,
    // Enable software WebGL in headless Chromium
    launchOptions: {
      // Allow overriding the browser binary (e.g. sandboxes with a preinstalled build)
      executablePath: process.env["PLAYWRIGHT_CHROMIUM_PATH"] || undefined,
      args: [
        "--use-gl=angle",
        "--enable-webgl",
        "--ignore-gpu-blocklist",
        "--enable-gpu-rasterization",
      ],
    },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Start dev server automatically when running tests
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
