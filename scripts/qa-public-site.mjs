import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.env.ORIGIN_QA_URL;
assert.equal(base, "http://127.0.0.1:4362");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({ reducedMotion: "reduce" });
let externalRequests = 0;
await context.route("**/*", (route) => {
  if (route.request().url().startsWith(`${base}/`)) return route.continue();
  externalRequests++;
  return route.abort();
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [],
  posts = [];
const contrast = (locator, background) =>
  locator.evaluate((element, backgroundSelector) => {
    const luminance = (color) => {
      const rgb = color
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number);
      return rgb.reduce((sum, channel, i) => {
        const c = channel / 255;
        return (
          sum +
          (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) *
            [0.2126, 0.7152, 0.0722][i]
        );
      }, 0);
    };
    const foreground = luminance(getComputedStyle(element).color);
    const backdrop = luminance(
      getComputedStyle(element.closest(backgroundSelector)).backgroundColor,
    );
    return (
      (Math.max(foreground, backdrop) + 0.05) /
      (Math.min(foreground, backdrop) + 0.05)
    );
  }, background);
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (r.method() === "POST") posts.push(new URL(r.url()).pathname);
});
mkdirSync("output/playwright", { recursive: true });
try {
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [820, 1180],
    [390, 844],
    [320, 740],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(base + "/?view=welcome&timestampStatus=verified");
    await page.getByRole("heading", { name: "WHOAYO", exact: true }).waitFor();
    assert.equal(
      await page.evaluate(() => scrollY),
      0,
      "No autofocus may hide the opening",
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `overflow ${width}`,
    );
    await page.waitForFunction(
      () => document.querySelector(".story-site")?.dataset.scrollMotion,
    );
    await page.waitForFunction(() => {
      const image = document.querySelector(".story-evidence-art");
      return image?.complete && image.naturalWidth >= 1000;
    });
    assert.equal(
      await page
        .locator(".story-site")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      "rgb(9, 12, 14)",
    );
    assert.ok(
      (await contrast(page.locator(".site-cta").first(), ".site-cta")) >= 4.5,
    );
    const proof = page.getByRole("region", {
      name: "Completed timestamp evidence",
    });
    assert.ok(
      (await page.locator(".story-next").boundingBox()).y < height,
      `next section visible ${width}`,
    );
    assert.match(
      await proof.innerText(),
      /Before becoming WHOAYO, we used the name Origin Studio/,
    );
    assert.match(await proof.innerText(), /not a demonstration record/);
    assert.equal(
      await proof.locator("time").getAttribute("datetime"),
      "2026-10-05T04:52:27Z",
    );
    assert.equal(await proof.locator("a, button").count(), 0);
    await page.screenshot({
      path: `output/playwright/public-site-top-${width}.png`,
    });
    await page.locator(".workspace-figure").scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const image = document.querySelector(".workspace-figure img");
      return image?.complete && image.naturalWidth > 0;
    });
    await page.locator(".site-workspace").screenshot({
      path: `output/playwright/public-site-product-${width}.png`,
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `output/playwright/public-site-full-${width}.png`,
      fullPage: true,
    });
    for (const audience of [
      "Researchers",
      "No-code builders",
      "Low-code developers",
    ]) {
      const button = page.getByRole("button", { name: audience, exact: true });
      await button.click();
      assert.equal(await button.getAttribute("aria-pressed"), "true");
      for (const stage of ["Record", "Timestamp", "Develop"]) {
        const stageButton = page.getByRole("button", {
          name: stage,
          exact: true,
        });
        await stageButton.click();
        assert.equal(await stageButton.getAttribute("aria-pressed"), "true");
        assert.ok(
          await page
            .locator(".example-tool")
            .evaluate((el) => el.scrollWidth <= el.clientWidth),
        );
        if (stage === "Timestamp")
          assert.match(
            await page.locator(".example-body").innerText(),
            /Not timestamped/,
          );
      }
    }
    await page
      .getByRole("button", { name: "Start your idea", exact: true })
      .click();
    assert.ok(
      (await contrast(page.locator("#auth-password-hint"), ".site-auth")) >=
        4.5,
      `Hint contrast ${width}`,
    );
    const rejectedRegistration = page.waitForResponse(
      (response) =>
        response.url() === `${base}/api/register` &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Create local account", exact: true })
      .click();
    assert.equal(
      (await rejectedRegistration).status(),
      400,
      "Empty registration is rejected, not saved",
    );
    assert.ok(
      (await contrast(
        page.locator(".auth-field-error").first(),
        ".site-auth",
      )) >= 4.5,
      `Error contrast ${width}`,
    );
    await page
      .getByLabel("Your name", { exact: true })
      .fill("Synthetic website QA");
    await page
      .getByLabel("Email or username", { exact: true })
      .fill(`site-${width}-${Date.now()}@example.invalid`);
    await page
      .getByLabel("Password", { exact: true })
      .fill("Synthetic-site-QA-42!");
    assert.equal(
      await page.getByLabel("Password", { exact: true }).getAttribute("type"),
      "password",
    );
    await page
      .getByRole("button", { name: "Forgot password?", exact: true })
      .click();
    await page.getByRole("dialog").waitFor();
    assert.ok(
      (await contrast(page.getByRole("dialog"), "dialog")) >= 4.5,
      `Recovery contrast ${width}`,
    );
    if (width === 390)
      await page.screenshot({
        path: "output/playwright/public-site-recovery-390.png",
      });
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => document.activeElement?.textContent === "Forgot password?",
    );
    assert.equal(
      await page.getByLabel("Password", { exact: true }).inputValue(),
      "Synthetic-site-QA-42!",
    );
    await page.locator(".site-join").screenshot({
      path: `output/playwright/public-site-account-${width}.png`,
    });
    await page
      .getByRole("button", { name: "Member sign in", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("Your name", { exact: true }).count(),
      0,
    );
    await page
      .getByRole("button", { name: "Start your idea", exact: true })
      .click();
    await page.getByLabel("Your name", { exact: true }).waitFor();
  }
  assert.deepEqual(
    posts,
    Array(5).fill("/api/register"),
    "Only the five deliberate invalid-form checks may post",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .getByLabel("Your name", { exact: true })
    .fill("Synthetic website owner");
  await page
    .getByLabel("Email or username", { exact: true })
    .fill(`website-${Date.now()}@example.invalid`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Synthetic-site-QA-42!");
  await page
    .getByRole("button", { name: "Create local account", exact: true })
    .click();
  await page.getByRole("button", { name: "Security", exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.has("view"), false);
  await page.goto(base + "/?view=welcome");
  await page
    .getByRole("link", { name: "Return to workspace", exact: true })
    .waitFor();
  assert.equal(await page.locator("#auth-password").count(), 0);
  await page
    .getByRole("link", { name: "Return to workspace", exact: true })
    .click();
  await page.getByRole("button", { name: "Security", exact: true }).waitFor();
  assert.deepEqual(
    await (await context.request.get(base + "/api/projects")).json(),
    [],
  );
  assert.deepEqual(posts, Array(6).fill("/api/register"));
  assert.deepEqual(errors, []);
  assert.equal(externalRequests, 0);
  const result = {
    passed: true,
    syntheticOnly: true,
    widths: [1920, 1440, 820, 390, 320],
    noExternalRequests: true,
    noImplicitSavesOrTimestampCalls: true,
    registrationAndExistingSessionReturn: true,
    evidenceArtworkLoaded: true,
    darkThemeAndCriticalContrast: true,
    pageErrors: errors,
  };
  writeFileSync(
    "output/playwright/public-site-result.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
