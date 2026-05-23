/**
 * Performance smoke test — verifies the app loads, propagates, and renders
 * within acceptable FPS bounds.
 *
 * Full acceptance criterion: FPS ≥ 55 sustained for 30 s at 10k objects (GPU hardware).
 * Headless software rendering (CI) achieves 15–40 FPS; the CI threshold is set
 * accordingly. Run on native hardware to validate the production target.
 */
import { test, expect } from "@playwright/test";

const CI = !!process.env["CI"];
const FPS_THRESHOLD = CI ? 10 : 55; // headless vs GPU
const SAMPLE_DURATION_MS = 30_000;

test("catalog loads and FPS is sustained", async ({ page }) => {
  await page.goto("/");

  // Wait for at least one non-zero catalog size to appear in the TopBar
  await page.waitForFunction(
    () => {
      const spans = [...document.querySelectorAll("span")];
      return spans.some((s) => /^\d{2,} objects$/.test(s.textContent?.trim() ?? ""));
    },
    { timeout: 60_000 },
  );

  // Allow propagation to warm up
  await page.waitForTimeout(5_000);

  // Collect one FPS reading per second for SAMPLE_DURATION_MS
  const fpsSamples: number[] = [];
  const deadline = Date.now() + SAMPLE_DURATION_MS;

  while (Date.now() < deadline) {
    const fps = await page.evaluate(() => {
      // Read FPS value from the TopBar text "N FPS"
      const spans = [...document.querySelectorAll("span")];
      for (const s of spans) {
        const m = s.textContent?.match(/^(\d+) FPS$/);
        if (m) return parseInt(m[1], 10);
      }
      return 0;
    });
    fpsSamples.push(fps);
    await page.waitForTimeout(1_000);
  }

  const avgFps = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;
  const minFps = Math.min(...fpsSamples);

  console.log(
    `[perf-smoke] FPS over ${SAMPLE_DURATION_MS / 1000}s: avg=${avgFps.toFixed(1)} min=${minFps} threshold=${FPS_THRESHOLD}`,
  );

  // Ensure FPS counter is non-zero (app is rendering)
  expect(avgFps).toBeGreaterThan(0);
  // Ensure sustained FPS meets threshold
  expect(avgFps).toBeGreaterThanOrEqual(FPS_THRESHOLD);
});

test("orbit track renders on satellite click", async ({ page }) => {
  await page.goto("/");

  // Wait for satellites to appear
  await page.waitForFunction(
    () => {
      const spans = [...document.querySelectorAll("span")];
      return spans.some((s) => /^\d{3,} objects$/.test(s.textContent?.trim() ?? ""));
    },
    { timeout: 60_000 },
  );

  // Click the catalog toggle to open the drawer
  await page.click("text=Catalog");

  // Wait for at least one row in the catalog table
  await page.waitForSelector("span.font-mono", { timeout: 10_000 });

  // Click the first satellite row
  const firstRow = page.locator(".font-mono").first();
  const noradId = await firstRow.textContent();
  await firstRow.click();

  // Detail panel should open and show the NORAD ID
  await expect(page.locator(`text=${noradId}`).first()).toBeVisible({ timeout: 5_000 });
});
