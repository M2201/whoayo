import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.env.ORIGIN_QA_URL;
assert.equal(base, "http://127.0.0.1:4362", "Synthetic fixture only");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext();
const external = [],
  posts = [],
  errors = [],
  requests = [],
  results = [];
await context.route("**/*", (route) => {
  if (route.request().url().startsWith(`${base}/`)) return route.continue();
  external.push(route.request().url());
  return route.abort();
});
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => {
  requests.push(new URL(request.url()).pathname);
  if (request.method() === "POST") posts.push(new URL(request.url()).pathname);
});
page.setDefaultTimeout(10000);
mkdirSync("output/playwright", { recursive: true });
const ready = () =>
  page.waitForFunction(
    () => document.querySelector(".story-site")?.dataset.scrollMotion,
  );
const settled = (locator) =>
  locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const matrix = new DOMMatrixReadOnly(style.transform);
    return style.opacity === "1" && matrix.isIdentity;
  });
try {
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1024, 768],
    [900, 780],
    [820, 1180],
    [390, 844],
    [320, 740],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${base}/?view=welcome`);
    await ready();
    await page.getByRole("heading", { name: "WHOAYO", exact: true }).waitFor();
    assert.equal(
      await page
        .locator("canvas, .seed-flat, [data-seed-dock], .timestamp-breath")
        .count(),
      0,
    );
    assert.equal(
      await page.getByRole("button", { name: /seed animation/ }).count(),
      0,
    );
    const visibleStars = await page
      .locator(".cosmic-twinkle")
      .evaluateAll(
        (stars) =>
          stars.filter((star) => getComputedStyle(star).display !== "none")
            .length,
      );
    assert.equal(
      visibleStars,
      width <= 700 ? 6 : 12,
      `Sparse star budget at ${width}`,
    );
    assert.ok(
      (await page.locator(".story-next").boundingBox()).y < height - 10,
      `Next section visible at ${width}`,
    );
    assert.ok(
      (await page.locator('[data-reveal-state="pending"]').count()) >= 2,
    );
    if ([1440, 390, 320].includes(width))
      await page.screenshot({
        path: `output/playwright/scroll-story-top-${width}.png`,
      });
    const text = page.locator("[data-scroll-reveal]");
    let animated = 0;
    for (let i = 0; i < (await text.count()); i++) {
      const element = text.nth(i);
      const pending =
        (await element.getAttribute("data-reveal-state")) === "pending";
      await element.evaluate((el) =>
        window.scrollTo({
          top: scrollY + el.getBoundingClientRect().top - innerHeight * 0.45,
          behavior: "instant",
        }),
      );
      await page.waitForFunction(
        (index) =>
          document.querySelectorAll("[data-scroll-reveal]")[index].dataset
            .revealState === "visible",
        i,
      );
      if (pending && !(await settled(element))) animated++;
      await page.waitForTimeout(700);
      assert.ok(await settled(element), `Text settles ${width}/${i}`);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Overflow ${width}/${i}`,
      );
    }
    assert.ok(animated >= 1, `Scroll must actually animate text at ${width}`);
    assert.equal(
      await page
        .locator(
          ".join-form [data-scroll-reveal], .workspace-figure[data-scroll-reveal]",
        )
        .count(),
      0,
    );
    await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(700);
    assert.equal(
      await page.locator('[data-reveal-state="pending"]').count(),
      0,
      "No replay when scrolling back",
    );
    const running = await page.evaluate(() =>
      document
        .querySelector(".story-site")
        .getAnimations({ subtree: true })
        .filter((animation) => animation.playState === "running")
        .map((animation) => ({
          cosmic: animation.effect.target.matches(
            ".story-cosmos-art, .cosmic-twinkle",
          ),
          duration: animation.effect.getTiming().duration,
        })),
    );
    assert.ok(running.length >= 2, `Cosmic motion is active at ${width}`);
    assert.ok(
      running.every(({ cosmic }) => cosmic),
      `Only the fingerprint may keep moving at ${width}`,
    );
    assert.ok(
      running.every(({ duration }) => duration >= 9000),
      `Cosmic motion stays slow at ${width}`,
    );
    if (width === 1440) {
      const before = await page
        .locator(".story-cosmos-art")
        .evaluate((element) => getComputedStyle(element).transform);
      await page.waitForTimeout(600);
      const after = await page
        .locator(".story-cosmos-art")
        .evaluate((element) => getComputedStyle(element).transform);
      assert.notEqual(before, after, "Fingerprint drift must progress slowly");
    }
    if ([1440, 390].includes(width))
      await page.screenshot({
        path: `output/playwright/scroll-story-full-${width}.png`,
        fullPage: true,
      });
    assert.equal(
      await page.locator("#our-evidence time").getAttribute("datetime"),
      "2026-10-05T04:52:27Z",
    );
    await page.locator("#our-evidence summary").click();
    assert.match(
      await page.locator("#our-evidence").innerText(),
      /preserved package explicitly names Origin Studio/,
    );
    await page.locator("#our-evidence summary").click();
    results.push({ width, height, animated, visibleStars });
  }
  await page.goto(`${base}/?view=welcome`);
  await ready();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(
    () =>
      document.querySelector(".story-site").dataset.scrollMotion === "reduced",
  );
  assert.equal(
    await page.locator('[data-reveal-state="pending"]').count(),
    0,
    "Preference change reveals all text",
  );
  await page.reload();
  await ready();
  for (const text of await page.locator("[data-scroll-reveal]").all())
    assert.ok(await settled(text));
  assert.equal(
    await page.evaluate(
      () =>
        document
          .querySelector(".story-site")
          .getAnimations({ subtree: true })
          .filter((animation) => animation.playState === "running").length,
    ),
    0,
    "Reduced motion stops all continuous movement",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    delete window.IntersectionObserver;
  });
  await page.reload();
  await ready();
  assert.equal(
    await page.locator('[data-reveal-state="pending"]').count(),
    0,
    "Unsupported browsers retain readable text",
  );
  assert.deepEqual(external, []);
  assert.deepEqual(posts, []);
  assert.deepEqual(errors, []);
  assert.ok(
    !requests.some((path) =>
      /samara|seed-scene|\/api\/(projects|.*snapshot|.*timestamp|.*export)/.test(
        path,
      ),
    ),
    "No seed asset or private evidence requests",
  );
  const result = {
    passed: true,
    syntheticOnly: true,
    viewports: results,
    subtleCosmicFingerprint: true,
    onlyFingerprintMovesContinuously: true,
    minimumAnimationDurationMs: 9000,
    mobileStarBudget: 6,
    reducedMotion: true,
    unsupportedBrowserFallback: true,
    noExternalRequests: true,
  };
  writeFileSync(
    "output/playwright/scroll-story-result.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
