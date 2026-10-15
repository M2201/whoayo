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
page.setDefaultTimeout(10000);
const errors = [];
let sends = 0,
  preparations = 0;
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (r.url().endsWith("/send")) sends++;
  if (r.url().endsWith("/prepare")) preparations++;
});
const get = async (path) =>
  (await context.request.get(`${base}/api${path}`)).json();
const button = (name) => page.getByRole("button", { name, exact: true });
const textbox = (name) => page.getByRole("textbox", { name, exact: true });
mkdirSync("output/playwright", { recursive: true });
async function screenshots(prefix) {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1050 : 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `page overflow at ${width}`,
    );
    const dialog = page.getByRole("dialog");
    if (await dialog.count())
      assert.ok(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
        `dialog overflow at ${width}`,
      );
    await page.screenshot({
      path: `output/playwright/${prefix}-${width}.png`,
      fullPage: false,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1050 });
}
try {
  await page.goto(base);
  await textbox("Your name").fill("Synthetic Idea QA");
  await textbox("Email or username").fill(`idea-qa-${Date.now()}`);
  await textbox("Password").fill("Synthetic-idea-QA-42!");
  await button("Create local account").click();
  await page
    .getByRole("main")
    .getByRole("heading", { name: "Your ideas should be yours.", exact: true })
    .waitFor();
  await screenshots("idea-first-home");
  const record = () =>
    page
      .getByRole("main")
      .getByRole("button", { name: "Record an idea", exact: true })
      .click();
  await record();
  await textbox("Title").fill("Do not create this cancelled idea");
  await textbox("Your concept").fill("Cancelled, not saved.");
  await button("Cancel").click();
  assert.deepEqual(await get("/projects"), []);
  await record();
  const title = "Synthetic precision watering concept";
  const content =
    "My exact source: compare soil moisture with plant needs.\n  Keep this whitespace and original attribution.\n";
  await textbox("Title").fill(title);
  await textbox("Your concept").fill(content);
  await page.getByLabel("Contribution", { exact: true }).selectOption("human");
  await screenshots("idea-first-capture");
  assert.equal(preparations, 0);
  assert.equal(sends, 0);
  await button("Preserve & start project").click();
  await page
    .getByRole("heading", { name: title, exact: true, level: 1 })
    .waitFor();
  const list = await get("/projects");
  assert.equal(list.length, 1);
  const id = list[0].id;
  let project = await get(`/projects/${id}`);
  assert.equal(project.ideas[0].content, content);
  assert.equal(project.ideas[0].receipt.manifest.origin, "human");
  const originalIdea = structuredClone(project.ideas[0]);
  const originalSnapshots = await get(`/projects/${id}/snapshots`);
  assert.equal(originalSnapshots.length, 1);
  await screenshots("idea-first-project");

  const composer = textbox("Message or private note");
  await composer.fill("Help me plan one synthetic experiment.");
  await page
    .getByRole("combobox", { name: "Skill", exact: true })
    .selectOption("design-test");
  assert.equal(
    await composer.inputValue(),
    "Help me plan one synthetic experiment.",
  );
  await page
    .getByRole("combobox", { name: "AI model", exact: true })
    .selectOption(JSON.stringify(["openai", "OFFLINE-FIXTURE"]));
  const include = page.getByRole("checkbox", {
    name: "Include recorded idea (version 1) in this AI request",
    exact: true,
  });
  assert.equal(await include.isChecked(), false);
  await include.check();
  await page.locator(".skill-instructions summary").click();
  assert.match(
    await page.locator(".skill-instructions").innerText(),
    /Do not invent sources/,
  );
  assert.equal(preparations, 0);
  assert.equal(sends, 0);
  await button("Review disclosure").click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByText("Skill: Design an experiment v1", { exact: true })
    .waitFor();
  assert.equal(sends, 0);
  await dialog.getByText("Exact request payload", { exact: true }).click();
  assert.match(
    await dialog.locator(".request-preview").innerText(),
    /soil moisture/,
  );
  assert.match(
    await dialog.locator(".request-preview").innerText(),
    /falsifiable hypothesis/,
  );
  assert.equal(await button("Approve and send").isEnabled(), false);
  await screenshots("idea-first-disclosure");
  await dialog.getByRole("checkbox").check();
  await button("Approve and send").click();
  await page
    .getByText("SYNTHETIC TEST RESPONSE. No model was contacted.", {
      exact: true,
    })
    .waitFor();
  assert.equal(sends, 1);
  project = await get(`/projects/${id}`);
  assert.deepEqual(project.ideas[0], originalIdea);
  assert.equal(project.disclosures[0].skill.id, "design-test");
  assert.equal(project.disclosures[0].idea.id, originalIdea.id);

  await page.setViewportSize({ width: 390, height: 844 });
  await button("Move to folder").click();
  await page.getByLabel("Folder", { exact: true }).fill("Research");
  await button("Save folder").click();
  await button("Research").waitFor();
  project = await get(`/projects/${id}`);
  assert.equal(project.folder, "Research");
  assert.deepEqual(project.ideas[0], originalIdea);
  assert.deepEqual(
    (await get(`/projects/${id}/snapshots`)).find(
      (s) => s.id === originalSnapshots[0].id,
    ),
    originalSnapshots[0],
  );
  await screenshots("idea-first-organized");
  await page.getByRole("button", { name: /^Ideas & projects/ }).click();
  await page
    .getByRole("combobox", { name: "Filter by folder", exact: true })
    .selectOption({ label: "Unfiled" });
  assert.equal(await page.locator(".project-row").count(), 0);
  await page
    .getByRole("combobox", { name: "Filter by folder", exact: true })
    .selectOption({ label: "Research" });
  assert.equal(await page.locator(".project-row").count(), 1);
  await screenshots("idea-first-folder-list");
  await page.reload();
  await page.locator(".project-row").filter({ hasText: title }).click();
  await button("Research").waitFor();
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    syntheticOnly: true,
    atomicIdeaToProject: true,
    cancelCreatesNothing: true,
    originalEvidenceRetained: true,
    folderPersists: true,
    skillsReviewedBeforeSend: true,
    explicitIdeaContext: true,
    mockedSends: sends,
    externalProviderRequests: 0,
    widths: [1440, 390, 320],
    pageErrors: errors,
  };
  writeFileSync(
    "output/playwright/idea-first-result.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} catch (error) {
  await page.screenshot({ path: "output/playwright/idea-first-failure.png" });
  throw error;
} finally {
  await browser.close();
}
