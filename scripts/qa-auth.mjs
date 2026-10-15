import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.env.ORIGIN_QA_URL;
assert.equal(base, "http://127.0.0.1:4362");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
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
  requests = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => {
  if (request.method() === "POST")
    requests.push(new URL(request.url()).pathname);
});
mkdirSync("output/playwright", { recursive: true });
const password = "Synthetic-auth-QA-only-42!";
const username = `auth.qa+${Date.now()}@example.invalid`;
const field = (name) => page.getByLabel(name, { exact: true });
const submit = () =>
  page
    .getByRole("button", { name: "Create local account", exact: true })
    .click();
async function checkLayout(prefix) {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1050 : 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    const dialog = page.getByRole("dialog");
    if (await dialog.count())
      assert.ok(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      );
    await page.screenshot({
      path: `output/playwright/${prefix}-${width}.png`,
      fullPage: true,
    });
  }
}
try {
  await page.goto(base);
  await field("Your name").fill("Synthetic auth owner");
  await field("Email or username").fill("two words");
  await field("Password").fill(password);
  await submit();
  await page.getByRole("alert").waitFor();
  assert.equal(
    await field("Email or username").getAttribute("aria-invalid"),
    "true",
  );
  assert.equal(await field("Password").getAttribute("aria-invalid"), null);
  assert.ok(
    await field("Email or username").evaluate(
      (el) => el === document.activeElement,
    ),
  );
  assert.equal(await field("Password").inputValue(), password);
  await checkLayout("auth-field-error");
  await field("Email or username").fill(username);
  await field("Password").fill("short");
  await submit();
  await page.getByRole("alert").waitFor();
  assert.equal(await field("Password").getAttribute("aria-invalid"), "true");
  assert.match(await page.getByRole("alert").innerText(), /12 characters/);
  await field("Password").fill(password);
  assert.equal(await field("Password").getAttribute("type"), "password");
  assert.equal(
    await field("Password").getAttribute("autocomplete"),
    "new-password",
  );
  const beforeHelp = requests.length;
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  assert.match(await dialog.innerText(), /No reset email can be sent/);
  await checkLayout("auth-recovery");
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => document.activeElement?.textContent === "Forgot password?",
  );
  assert.equal(await dialog.count(), 0);
  assert.equal(await field("Password").inputValue(), password);
  assert.equal(requests.length, beforeHelp);
  await checkLayout("auth-register");
  await page.setViewportSize({ width: 1440, height: 1050 });
  await submit();
  await page.getByRole("button", { name: "Security", exact: true }).waitFor();
  const registered = await (
    await context.request.get(`${base}/api/session`)
  ).json();
  assert.equal(registered.user.username, username);
  assert.equal(
    (
      await context.request.post(`${base}/api/logout`, {
        headers: { Origin: base, "X-CSRF-Token": registered.csrf },
        data: {},
      })
    ).status(),
    200,
  );
  await page.reload();
  await page
    .getByRole("button", {
      name: "Already have an account? Sign in",
      exact: true,
    })
    .click();
  await field("Email or username").fill(username.toUpperCase());
  await field("Password").fill("wrong");
  assert.equal(
    await field("Password").getAttribute("autocomplete"),
    "current-password",
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.match(
    await page.getByRole("alert").innerText(),
    /Email, username or password is incorrect/,
  );
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Back to account form", exact: true })
    .click();
  assert.equal(
    await field("Email or username").inputValue(),
    username.toUpperCase(),
  );
  await field("Password").fill(password);
  await checkLayout("auth-sign-in");
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Security", exact: true }).waitFor();
  const signedIn = await (
    await context.request.get(`${base}/api/session`)
  ).json();
  assert.equal(signedIn.user.id, registered.user.id);
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    syntheticOnly: true,
    isolatedProfile: true,
    fieldSpecificErrors: true,
    emailRegistrationAndSignIn: true,
    recoveryHelpMakesNoRequest: true,
    passwordStaysMasked: true,
    recoveryPreservesForm: true,
    widths: [1440, 390, 320],
    pageErrors: errors,
  };
  writeFileSync(
    "output/playwright/auth-result.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
