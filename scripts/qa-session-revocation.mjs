import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.env.ORIGIN_QA_URL;
assert.equal(base, "http://127.0.0.1:4362");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
// Fresh browser contexts, not the owner's profile; server holds synthetic data only.
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const errors = [];
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
});
const otherSession = await browser.newContext();
const otherAccount = await browser.newContext();
for (const c of [context, otherSession, otherAccount])
  await c.route("**/*", (route) =>
    route.request().url().startsWith(`${base}/`)
      ? route.continue()
      : route.abort(),
  );
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
const username = `sessions-qa-${Date.now()}`,
  password = "Synthetic-sessions-QA-42!";
const account = { username, password, name: "Synthetic session owner" };
const post = (c, path, data) =>
  c.request.post(`${base}/api${path}`, { headers: { Origin: base }, data });
mkdirSync("output/playwright", { recursive: true });
try {
  await page.goto(base);
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill(account.name);
  await page
    .getByRole("textbox", { name: "Email or username", exact: true })
    .fill(username);
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill(password);
  await page
    .getByRole("button", { name: "Create local account", exact: true })
    .click();
  await page.getByRole("button", { name: "Security", exact: true }).click();
  assert.equal((await post(otherSession, "/login", account)).status(), 200);
  assert.equal(
    (
      await post(otherAccount, "/register", {
        ...account,
        username: `${username}-other`,
      })
    ).status(),
    200,
  );
  const secondBefore = await (
    await otherSession.request.get(`${base}/api/session`)
  ).json();
  const otherBefore = await (
    await otherAccount.request.get(`${base}/api/session`)
  ).json();
  await page
    .getByRole("button", { name: "Sign out everywhere", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Current password").waitFor();
  assert.equal(
    await dialog.getByLabel("Current password").getAttribute("type"),
    "password",
  );
  assert.equal(
    await dialog.getByLabel("Current password").getAttribute("autocomplete"),
    "current-password",
  );
  await page.keyboard.press("Escape");
  assert.equal(await dialog.count(), 0);
  assert.equal(
    (await (await otherSession.request.get(`${base}/api/session`)).json()).user
      .id,
    secondBefore.user.id,
  );
  await page
    .getByRole("button", { name: "Sign out everywhere", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Current password").fill("wrong-password");
  await dialog
    .getByRole("button", { name: "Confirm sign out everywhere", exact: true })
    .click();
  await dialog.getByRole("alert").waitFor();
  assert.match(
    await dialog.getByRole("alert").innerText(),
    /Current password is incorrect/,
  );
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1050 : 844 });
    assert.ok(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth));
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    await page.screenshot({
      path: `output/playwright/session-revocation-${width}.png`,
    });
  }
  await dialog.getByLabel("Current password").fill(password);
  await dialog
    .getByRole("button", { name: "Confirm sign out everywhere", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "All your sessions have ended" })
    .waitFor();
  await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  assert.equal(
    (await (await context.request.get(`${base}/api/session`)).json()).user,
    null,
  );
  assert.equal(
    (await (await otherSession.request.get(`${base}/api/session`)).json()).user,
    null,
  );
  assert.equal(
    (await (await otherAccount.request.get(`${base}/api/session`)).json()).user
      .id,
    otherBefore.user.id,
  );
  assert.equal(
    (await otherSession.request.get(`${base}/api/projects`)).status(),
    401,
  );
  assert.equal(
    (await otherAccount.request.get(`${base}/api/projects`)).status(),
    200,
  );
  await page.screenshot({
    path: "output/playwright/session-revocation-signed-out.png",
  });
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    syntheticOnly: true,
    isolatedProfiles: true,
    cancelPreservesSessions: true,
    passwordMasked: true,
    wrongPasswordKeepsSession: true,
    sameAccountRevoked: true,
    otherAccountUnaffected: true,
    widths: [1440, 390, 320],
    horizontalOverflow: false,
    pageErrors: errors,
  };
  writeFileSync(
    "output/playwright/session-revocation-result.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
