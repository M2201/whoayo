import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.env.ORIGIN_QA_URL;
assert.equal(base, "http://127.0.0.1:4362");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
// Match existing QA: isolated profile and synthetic in-memory server only.
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
});
await context.route("**/*", (route) =>
  route.request().url().startsWith(`${base}/`)
    ? route.continue()
    : route.abort(),
);
const page = await context.newPage();
const errors = [],
  screenshots = [];
let prepareCount = 0,
  sendCount = 0;
let delayNextList = false,
  releaseList;
let signalListHeld;
const listHeld = new Promise((resolve) => {
  signalListHeld = resolve;
});
await page.route(`${base}/api/projects`, async (route) => {
  if (delayNextList && route.request().method() === "GET") {
    delayNextList = false;
    await new Promise((resolve) => {
      releaseList = resolve;
      signalListHeld();
    });
  }
  await route.continue();
});
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => {
  if (request.url().endsWith("/prepare")) prepareCount++;
  if (request.url().endsWith("/send")) sendCount++;
});
mkdirSync("output/playwright", { recursive: true });
async function screenshot(name, width, height) {
  await page.setViewportSize({ width, height });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    `page overflow at ${width}`,
  );
  const dialog = page.getByRole("dialog");
  const select = page.getByRole("combobox", { name: "AI model", exact: true });
  if ((await select.count()) && !(await dialog.count())) {
    await select.scrollIntoViewIfNeeded();
    const rect = await select.boundingBox();
    assert.ok(
      rect.x >= 0 && rect.x + rect.width <= width,
      `model selector overflow at ${width}`,
    );
  }
  if (await dialog.count())
    assert.ok(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth));
  const path = `output/playwright/models-${name}.png`;
  await page.screenshot({ path });
  screenshots.push(path);
}
try {
  await page.goto(base);
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Synthetic Models QA");
  await page
    .getByRole("textbox", { name: "Email or username", exact: true })
    .fill(`models-qa-${Date.now()}`);
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill("Synthetic-models-only-123!");
  await page
    .getByRole("button", { name: "Create local account", exact: true })
    .click();
  await page
    .getByRole("main")
    .getByRole("button", { name: "Record an idea", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Synthetic model workspace");
  await page
    .getByRole("textbox", { name: "Your concept", exact: true })
    .fill("A synthetic concept used only to test model selection.");
  await page
    .getByRole("button", { name: "Preserve & start project", exact: true })
    .click();
  const selector = page.getByRole("combobox", {
    name: "AI model",
    exact: true,
  });
  const composer = page.getByRole("textbox", {
    name: "Message or private note",
    exact: true,
  });
  assert.equal(await selector.inputValue(), "local");
  await composer.fill("A private draft, preserved when changing models.");
  await selector.selectOption(JSON.stringify(["openai", "OFFLINE-ALTERNATE"]));
  assert.equal(
    await composer.inputValue(),
    "A private draft, preserved when changing models.",
  );
  assert.equal(sendCount, 0);
  assert.equal(prepareCount, 0);
  assert.equal(
    await selector
      .locator('option[value=\'["kimi","OFFLINE-KIMI"]\']')
      .evaluate((option) => option.disabled),
    true,
  );
  await screenshot("desktop", 1440, 1050);
  await screenshot("mobile", 390, 844);
  await screenshot("small-mobile", 320, 740);
  await page
    .getByRole("button", { name: "Review disclosure", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByText("OFFLINE-ALTERNATE", { exact: true }).waitFor();
  assert.equal(
    await dialog
      .getByRole("button", { name: "Approve and send", exact: true })
      .isDisabled(),
    true,
  );
  await screenshot("review-mobile", 390, 844);
  await dialog
    .getByRole("button", { name: "Keep private", exact: true })
    .click();
  assert.equal(sendCount, 0);
  assert.equal(
    await composer.inputValue(),
    "A private draft, preserved when changing models.",
  );
  await selector.selectOption(JSON.stringify(["gemini", "OFFLINE-GEMINI"]));
  await page
    .getByRole("button", { name: "Review disclosure", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByText("OFFLINE-GEMINI", { exact: true }).waitFor();
  await dialog
    .getByText(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      { exact: true },
    )
    .waitFor();
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Approve and send", exact: true })
    .click();
  await page
    .getByText("SYNTHETIC GEMINI RESPONSE. No model was contacted.", {
      exact: true,
    })
    .waitFor();
  assert.equal(sendCount, 1);
  assert.equal(await composer.inputValue(), "");
  await selector.selectOption("local");
  await composer.fill("A note that stays local.");
  delayNextList = true;
  await page
    .getByRole("button", { name: "Save private note", exact: true })
    .click();
  await listHeld;
  await page
    .locator(".message-body")
    .getByText("A note that stays local.", { exact: true })
    .waitFor();
  assert.equal(sendCount, 1);
  await composer.fill("Keep this draft while I inspect connections.");
  assert.ok(releaseList, "save is awaiting the delayed list refresh");
  releaseList();
  await page
    .locator(".model-toolbar")
    .getByRole("button", { name: "Model connections", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Model connections", exact: true })
    .waitFor();
  assert.equal(await page.locator(".provider-entry").count(), 4);
  assert.equal(await page.locator(".configured-models li").count(), 4);
  await page
    .getByText("API credential required", { exact: true })
    .first()
    .waitFor();
  await screenshot("connections-mobile", 390, 844);
  await screenshot("connections-desktop", 1440, 1050);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  assert.equal(
    await composer.inputValue(),
    "Keep this draft while I inspect connections.",
  );
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    exactModelReview: true,
    draftPreserved: true,
    privateNotesMakeNoCalls: true,
    providers: 4,
    prepareCount,
    sendCount,
    syntheticOnly: true,
    externalRequests: 0,
    screenshots,
    errors,
  };
  writeFileSync(
    "output/playwright/models-result.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  releaseList?.();
  await browser.close();
}
