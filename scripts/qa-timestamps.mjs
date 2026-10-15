import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const base = process.env.ORIGIN_QA_URL;
assert.equal(base, "http://127.0.0.1:4362");
const mode = process.env.ORIGIN_QA_TIMESTAMPS;
assert.ok(["enabled", "unavailable", "malformed"].includes(mode));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
});
const external = [];
await context.route("**/*", (route) => {
  if (route.request().url().startsWith(`${base}/`)) return route.continue();
  external.push(route.request().url());
  return route.abort();
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let submissions = 0,
  sends = 0;
page.on("request", (r) => {
  if (r.url().endsWith("/timestamp-submit")) submissions++;
  if (r.url().endsWith("/send")) sends++;
});
const button = (name) => page.getByRole("button", { name, exact: true });
const textbox = (name) => page.getByRole("textbox", { name, exact: true });
const get = async (path) =>
  (await context.request.get(`${base}/api${path}`)).json();
mkdirSync("output/playwright", { recursive: true });
async function screens(stage) {
  if (await page.locator(".timestamp-dialog").count())
    await page.locator('.timestamp-dialog[aria-busy="false"]').waitFor();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1050 : 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `page overflow ${stage} ${width}`,
    );
    const dialog = page.getByRole("dialog");
    if (await dialog.count())
      assert.ok(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
        `dialog overflow ${stage} ${width}`,
      );
    await page.screenshot({
      path: `output/playwright/timestamp-${mode}-${stage}-${width}.png`,
    });
  }
}
try {
  await page.goto(base);
  await textbox("Your name").fill("Synthetic Timestamp QA");
  await textbox("Email or username").fill(`timestamp-qa-${Date.now()}`);
  await textbox("Password").fill("Synthetic-timestamp-QA-42!");
  await button("Create local account").click();
  await page
    .getByRole("main")
    .getByRole("button", { name: "Record an idea", exact: true })
    .click();
  await textbox("Title").fill("Synthetic irrigation idea");
  await textbox("Your concept").fill(
    "Invented test only: route recycled water to thirsty plants.",
  );
  await button("Preserve & start project").click();
  await button("Timestamp setup").waitFor();
  const projectId = (await get("/projects"))[0].id;
  const original = (await get(`/projects/${projectId}`)).ideas[0];
  const composer = textbox("Message or private note");
  await composer.fill("Local note while proof is unavailable.");
  await button("Save private note").click();
  await page
    .getByText("Local note while proof is unavailable.", { exact: true })
    .waitFor();
  const draft = "Develop a synthetic experiment. Keep this unsent draft.";
  await composer.fill(draft);
  await page
    .getByRole("combobox", { name: "AI model", exact: true })
    .selectOption(JSON.stringify(["openai", "OFFLINE-FIXTURE"]));
  assert.equal(await button("Review disclosure").isEnabled(), false);
  await screens("blocked");
  await button("Timestamp setup").click();
  const bitcoin = page.getByRole("radio", {
    name: /Bitcoin verification first/,
  });
  assert.equal(await bitcoin.isEnabled(), false);
  assert.equal(await button("Review fingerprint").isEnabled(), false);
  if (mode === "unavailable") {
    assert.equal(
      await page
        .getByRole("radio", { name: /Signed timestamp first/ })
        .isEnabled(),
      false,
    );
    await screens("unavailable");
    await button("Close dialog").click();
    assert.equal(await composer.inputValue(), draft);
  } else {
    await page.getByRole("radio", { name: /Signed timestamp first/ }).check();
    await button("Review fingerprint").click();
    await button("Submit approved fingerprint").waitFor();
    assert.equal(submissions, 0);
    assert.equal(
      await button("Submit approved fingerprint").isEnabled(),
      false,
    );
    await screens("approval");
    await page
      .getByRole("checkbox", { name: "I approve this fingerprint submission." })
      .check();
    let releaseSubmission;
    const submissionGate = new Promise((resolve) => {
      releaseSubmission = resolve;
    });
    await page.route("**/timestamp-submit", async (route) => {
      await submissionGate;
      await route.continue();
    });
    await button("Submit approved fingerprint").click();
    await page.locator('.timestamp-dialog[aria-busy="true"]').waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").isVisible(), true);
    releaseSubmission();
    if (mode === "malformed") {
      await page
        .getByRole("alert")
        .filter({ hasText: /could not be verified/ })
        .waitFor();
      await screens("failure");
      await button("Close dialog").click();
      assert.equal(await button("Review disclosure").isEnabled(), false);
      assert.equal(await composer.inputValue(), draft);
    } else {
      await page
        .getByRole("heading", { name: "Synthetic test receipt verified" })
        .waitFor();
      await screens("verified");
      const download = page.waitForEvent("download");
      await button("Download receipt and private package").click();
      assert.match(
        (await download).suggestedFilename(),
        /origin-timestamp-v1.json/,
      );
      await button("Close dialog").click();
      assert.equal(await composer.inputValue(), draft);
      await button("Review disclosure").click();
      await page.getByRole("dialog").getByRole("checkbox").check();
      await button("Approve and send").click();
      await page
        .getByText("SYNTHETIC TEST RESPONSE. No model was contacted.", {
          exact: true,
        })
        .waitFor();
      assert.equal(sends, 1);
      await screens("complete");
      await page.reload();
      await page
        .locator(".project-row")
        .filter({ hasText: "Synthetic irrigation idea" })
        .click();
      await button("View timestamp receipt").waitFor();
      await button("Evidence").click();
      await button("View timestamp receipt").click();
      await page
        .getByRole("heading", { name: "Synthetic test receipt verified" })
        .waitFor();
      await button("Done").click();
    }
    assert.equal(submissions, 1);
  }
  assert.deepEqual((await get(`/projects/${projectId}`)).ideas[0], original);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  assert.equal(sends, mode === "enabled" ? 1 : 0);
  const result = {
    passed: true,
    mode,
    syntheticOnly: true,
    realOfflineSignatureVerification: mode !== "unavailable",
    widths: [1440, 390, 320],
    timestampSubmissions: submissions,
    modelSends: sends,
    externalRequests: external.length,
    pageErrors: errors,
  };
  writeFileSync(
    `output/playwright/timestamp-${mode}-result.json`,
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} catch (error) {
  await page.screenshot({
    path: `output/playwright/timestamp-${mode}-failure.png`,
  });
  throw error;
} finally {
  await browser.close();
}
