import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

// Run only against an isolated in-memory QA server, never the user's account.
const base = process.env.ORIGIN_QA_URL;
assert.equal(base, "http://127.0.0.1:4362");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
mkdirSync("output/playwright", { recursive: true });
try {
  await page.goto(base);
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Synthetic Review QA");
  await page
    .getByRole("textbox", { name: "Email or username", exact: true })
    .fill(`review-qa-${Date.now()}`);
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill("Synthetic-review-only-123!");
  await page
    .getByRole("button", { name: "Create local account", exact: true })
    .click();
  await page
    .getByRole("main")
    .getByRole("button", { name: "Record an idea", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Synthetic description review");
  await page
    .getByRole("textbox", { name: "Your concept", exact: true })
    .fill("Initial synthetic concept, before a description-review amendment.");
  await page
    .getByRole("button", { name: "Preserve & start project", exact: true })
    .click();
  await page.getByRole("button", { name: "Ideas", exact: true }).click();
  await page
    .getByRole("button", { name: "New version", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Private tool concept");
  await dialog
    .getByRole("textbox", { name: "Your concept", exact: true })
    .fill("A tool that helps people.");
  await dialog
    .getByRole("button", { name: "Check description", exact: true })
    .click();
  await dialog
    .getByText("Problem and intended users", { exact: true })
    .waitFor();
  assert.equal(await dialog.locator(".review-findings li").count(), 6);
  assert.equal(
    await dialog
      .getByRole("button", { name: "Review with local model" })
      .isEnabled(),
    false,
  );
  await dialog
    .getByText("What the evidence does and does not establish", { exact: true })
    .click();
  await dialog
    .getByText("Download review", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "output/playwright/description-review-desktop.png",
  });
  const downloadPromise = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Download review", exact: true })
    .click();
  const downloaded = await downloadPromise;
  await downloaded.saveAs(
    "output/playwright/description-review-synthetic.json",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.locator(".description-review").scrollIntoViewIfNeeded();
  assert.ok(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth));
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await page.screenshot({
    path: "output/playwright/description-review-mobile.png",
  });
  await dialog
    .getByRole("textbox", { name: "Your concept", exact: true })
    .fill("A changed draft with a concrete example.");
  assert.equal(await dialog.locator(".review-findings").count(), 0);
  await dialog
    .getByRole("button", { name: "Record version", exact: true })
    .click();
  await page
    .getByText("A changed draft with a concrete example.", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Evidence", exact: true }).click();
  await page
    .getByText("What the evidence does and does not establish", { exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      checklistCriteria: 6,
      disabledModel: true,
      draftEditInvalidatesReview: true,
      saveWorks: true,
      evidenceDistinction: true,
      mobileOverflow: false,
      consoleErrors: errors,
    }),
  );
} catch (e) {
  console.error(await page.locator("body").innerText());
  throw e;
} finally {
  await browser.close();
}
