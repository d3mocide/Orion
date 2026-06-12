/**
 * Performance + interaction smoke tests.
 *
 * Full acceptance criterion: FPS ≥ 55 sustained for 30 s at 10k objects (GPU hardware).
 * Headless software rendering (CI) achieves far less; the CI threshold is set
 * accordingly. Run on native hardware to validate the production target.
 *
 * Works offline: when CelesTrak is unreachable the app boots the synthetic
 * demo constellation, so these tests don't depend on network access.
 */
import { test, expect, type Page } from "@playwright/test";

const CI = !!process.env["CI"];
// Software GL (CI/sandbox) renders ~4 FPS with bloom; only prove liveness there.
const FPS_THRESHOLD = CI ? 2 : 55;
const SAMPLE_DURATION_MS = 30_000;

async function waitForCatalog(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="catalog-count"]');
      if (!el) return false;
      return parseInt((el.textContent ?? "0").replace(/,/g, ""), 10) > 100;
    },
    undefined,
    { timeout: 90_000 },
  );
}

test("catalog loads and FPS is sustained", async ({ page }) => {
  await page.goto("/");
  await waitForCatalog(page);

  // Allow propagation + rendering to warm up
  await page.waitForTimeout(5_000);

  const fpsSamples: number[] = [];
  const deadline = Date.now() + SAMPLE_DURATION_MS;

  while (Date.now() < deadline) {
    const fps = await page.evaluate(() => {
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
  console.log(
    `[perf-smoke] FPS over ${SAMPLE_DURATION_MS / 1000}s: avg=${avgFps.toFixed(1)} min=${Math.min(...fpsSamples)} threshold=${FPS_THRESHOLD}`,
  );

  expect(avgFps).toBeGreaterThan(0);
  expect(avgFps).toBeGreaterThanOrEqual(FPS_THRESHOLD);
});

test("search → select shows detail panel with orbital elements", async ({ page }) => {
  await page.goto("/");
  await waitForCatalog(page);

  const input = page.getByPlaceholder("Search satellites…");
  // Demo catalog names start with DEMO-; live catalogs match plenty on "1"
  await input.fill("DEMO");
  await page.waitForTimeout(600);
  let options = page.locator("header button span.text-aurora-violet");
  if ((await options.count()) === 0) {
    await input.fill("25");
    await page.waitForTimeout(600);
    options = page.locator("header button span.text-aurora-violet");
  }
  expect(await options.count()).toBeGreaterThan(0);

  const noradId = (await options.first().textContent())?.trim() ?? "";
  await options.first().click();

  await expect(page.locator(`text=${noradId}`).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("text=Orbital Elements")).toBeVisible({ timeout: 10_000 });
});

test("catalog drawer lists objects and selects on click", async ({ page }) => {
  await page.goto("/");
  await waitForCatalog(page);

  await page.click("text=Catalog");
  const firstRow = page.locator('[data-index="0"]');
  await expect(firstRow).toBeVisible({ timeout: 10_000 });
  await firstRow.click();
  await expect(page.locator("text=Orbital Elements")).toBeVisible({ timeout: 10_000 });
});
