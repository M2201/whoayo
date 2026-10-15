import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.env.ORIGIN_QA_URL;
assert.equal(base, "http://127.0.0.1:4362");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext();
let externalRequests = 0;
await context.route("**/*", (route) => {
  if (route.request().url().startsWith(`${base}/`)) return route.continue();
  externalRequests++;
  return route.abort();
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [],
  requests = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (r.url().includes("/api/"))
    requests.push({ path: new URL(r.url()).pathname, method: r.method() });
});
mkdirSync("output/playwright", { recursive: true });
let featured = true;
const panel = () =>
  page.getByRole("region", {
    name: featured
      ? "Completed timestamp evidence"
      : "WHOAYO concept provenance",
  });
async function checkPanel(prefix) {
  await panel().waitFor();
  if (!featured)
    await panel()
      .getByText("Concept linked to proof", { exact: true })
      .waitFor();
  const before = requests.length;
  const summary = panel().locator("summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  assert.equal(await panel().locator("details").getAttribute("open"), "");
  if (featured) {
    assert.match(
      await panel().innerText(),
      /preserved package explicitly names Origin Studio/,
    );
    assert.match(
      await panel().innerText(),
      /No concept text, nonce, private package or account identifier/,
    );
    assert.equal(
      await panel().locator("time").getAttribute("datetime"),
      "2026-10-05T04:52:27Z",
    );
  } else {
    assert.match(await panel().innerText(), /October 5, 2026 at 04:52:27 UTC/);
    assert.match(await panel().innerText(), /revision 2/);
    assert.match(await panel().innerText(), /are not published here/);
    assert.equal(await panel().locator("time").count(), 0);
  }
  assert.equal(await panel().locator("a, button").count(), 0);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1050 : 844 });
    await panel().scrollIntoViewIfNeeded();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `page overflow at ${width}`,
    );
    assert.ok(
      await panel().evaluate((el) => el.scrollWidth <= el.clientWidth),
      `provenance overflow at ${width}`,
    );
    await page.screenshot({
      path: `output/playwright/${prefix}-${width}.png`,
    });
  }
  await summary.focus();
  await page.keyboard.press("Enter");
  assert.equal(await panel().locator("details").getAttribute("open"), null);
  assert.equal(requests.length, before, "Viewing status must make no request");
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({
    path: `output/playwright/${prefix}-collapsed.png`,
  });
}
try {
  await page.goto(base + "/?timestampStatus=verified&timestamp=2000-01-01");
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Synthetic provenance owner");
  await page
    .getByRole("textbox", { name: "Email or username", exact: true })
    .fill(`provenance-qa-${Date.now()}`);
  const password = page.getByRole("textbox", { name: "Password", exact: true });
  await password.fill("Synthetic-provenance-only-42!");
  await checkPanel("provenance-signup");
  assert.equal(await password.inputValue(), "Synthetic-provenance-only-42!");
  assert.equal(await password.getAttribute("type"), "password");
  assert.equal(
    await page
      .locator(".join-form")
      .evaluate((el) => getComputedStyle(el).transform),
    "none",
    "Account form cannot move on focus",
  );
  await page
    .getByRole("button", { name: "Create local account", exact: true })
    .click();
  await page.getByRole("button", { name: "Security", exact: true }).waitFor();
  featured = false;
  await checkPanel("provenance-workspace");
  const projects = await (
    await context.request.get(`${base}/api/projects`)
  ).json();
  assert.deepEqual(projects, []);
  assert.ok(
    !requests.some((r) =>
      /timestamp|snapshot|export|prepare|send/.test(r.path),
    ),
  );
  assert.deepEqual(errors, []);
  assert.equal(externalRequests, 0);
  const result = {
    passed: true,
    syntheticOnly: true,
    platformConceptLinkedWithExactVersionAndLimits: true,
    noProofOrPrivateRecordFetch: true,
    statusIgnoresQueryParameters: true,
    keyboardToggle: true,
    preservedAuthDraft: true,
    widths: [1440, 390, 320],
    externalRequests,
    pageErrors: errors,
  };
  writeFileSync(
    "output/playwright/provenance-result.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} catch (error) {
  await page.screenshot({ path: "output/playwright/provenance-failure.png" });
  console.error(await page.locator("body").innerText());
  throw error;
} finally {
  await browser.close();
}
