import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  statSync,
  rmSync,
  existsSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configuration, createSetup } from "../scripts/configure-openai.mjs";

test("configuration rejects environment injection and never echoes a key", () => {
  assert.throws(() =>
    configuration("sk-" + "x".repeat(30) + "\nINJECT=1", "gpt-6-astra"),
  );
  assert.throws(() => configuration("sk-" + "x".repeat(30), "model\nINJECT=1"));
});

test("one-time setup enforces Origin, saves privately, and returns no credential", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "origin-setup-test-"));
  const destination = join(dir, "secret.env");
  const s = createSetup({ destination });
  t.after(() => {
    s.server.close();
    s.server.closeAllConnections();
    rmSync(dir, { recursive: true, force: true });
  });
  await new Promise((r) => s.server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${s.server.address().port}`;
  const url = origin + s.path;
  const page = await fetch(url);
  const markup = await page.text();
  const scriptNonce = markup.match(/<script nonce="([^"]+)"/)[1];
  assert.ok(
    page.headers
      .get("content-security-policy")
      .includes(`script-src 'nonce-${scriptNonce}'`),
  );
  assert.ok(
    page.headers.get("content-security-policy").includes("connect-src 'self'"),
  );
  assert.ok(markup.includes('role="status"'));
  assert.ok(markup.includes("event.preventDefault()"));
  assert.ok(markup.includes("controller.abort()"));
  assert.equal(page.headers.get("cache-control"), "no-store");
  const key = "sk-" + "x".repeat(30);
  const body = new URLSearchParams({
    key,
    model: "gpt-6-astra",
    nonce: s.path.split("/").at(-1),
  });
  const wrong = await fetch(url, {
    method: "POST",
    headers: { Origin: "https://example.com" },
    body,
  });
  assert.equal(wrong.status, 403);
  assert.equal(existsSync(destination), false);
  const invalid = await fetch(url, {
    method: "POST",
    headers: { Origin: origin },
    body: new URLSearchParams({
      key: "invalid-synthetic-key",
      model: "gpt-6-astra",
      nonce: s.path.split("/").at(-1),
    }),
  });
  assert.equal(invalid.status, 400);
  assert.ok(!(await invalid.text()).includes("invalid-synthetic-key"));
  assert.equal(existsSync(destination), false);
  const saved = await fetch(url, {
    method: "POST",
    headers: { Origin: origin },
    body,
  });
  assert.equal(saved.status, 200);
  assert.ok(!(await saved.text()).includes(key));
  assert.equal(statSync(destination).mode & 0o777, 0o600);
  assert.ok(readFileSync(destination, "utf8").includes(key));
  assert.equal(s.saved, true);
});

test("setup refuses to overwrite existing configuration", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "origin-setup-test-"));
  const destination = join(dir, "secret.env");
  writeFileSync(destination, "preserve");
  const s = createSetup({ destination });
  t.after(() => {
    s.server.close();
    s.server.closeAllConnections();
    rmSync(dir, { recursive: true, force: true });
  });
  await new Promise((r) => s.server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${s.server.address().port}`;
  const body = new URLSearchParams({
    key: "sk-" + "x".repeat(30),
    model: "gpt-6-astra",
    nonce: s.path.split("/").at(-1),
  });
  const result = await fetch(origin + s.path, {
    method: "POST",
    headers: { Origin: origin },
    body,
  });
  assert.equal(result.status, 400);
  assert.equal(readFileSync(destination, "utf8"), "preserve");
});
