import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
  realpathSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  previewConfiguration,
  openPilotStorage,
  loadPreviewAssets,
  createPreviewServer,
} from "../server/render-preview.mjs";

const origin = "https://synthetic-pilot.onrender.com";
const base = {
  RENDER: "true",
  RENDER_EXTERNAL_URL: origin,
  WHOAYO_DEPLOYMENT_MODE: "read-only-pilot",
  WHOAYO_PILOT_DATA_DIR: "/var/data/whoayo-readonly-pilot",
  PORT: "10000",
};
function fixture(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "whoayo-preview-test-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function buildFixture(dir) {
  mkdirSync(join(dir, "assets"));
  writeFileSync(
    join(dir, "render-preview.html"),
    '<html><head><meta name="whoayo-preview" content="read-only-pilot" /></head><body>Read-only pilot</body></html>',
  );
  writeFileSync(
    join(dir, "assets", "preview.js"),
    "// synthetic public fixture",
  );
}
async function request(server, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: server.address().port,
        path,
        method: options.method || "GET",
        headers: { Host: new URL(origin).host, ...options.headers },
      },
      (res) => {
        const chunks = [];
        res.on("data", (b) => chunks.push(b));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end(options.body);
  });
}

test("Render preview requires explicit isolation and exact origin", () => {
  assert.equal(previewConfiguration(base).host, "0.0.0.0");
  assert.equal(previewConfiguration(base).revision, null);
  for (const overrides of [
    { WHOAYO_DEPLOYMENT_MODE: "customer" },
    { WHOAYO_DEPLOYMENT_MODE: undefined },
    { RENDER_EXTERNAL_URL: "http://synthetic-pilot.onrender.com" },
    { RENDER_EXTERNAL_URL: origin + "/" },
    { RENDER_EXTERNAL_URL: "https://evil.example" },
    {
      RENDER_EXTERNAL_URL: "https://user:password@synthetic-pilot.onrender.com",
    },
    { RENDER_EXTERNAL_URL: origin + "?code=synthetic" },
    { WHOAYO_PILOT_DATA_DIR: "/var/data" },
    { PORT: "0" },
    { PORT: "NaN" },
    { ORIGIN_DATA_DIR: "/private-vault" },
    { ORIGIN_EXTERNAL_AI: "1" },
    { OPENAI_API_KEY: "synthetic-fixture" },
    { STRIPE_SECRET_KEY: "synthetic-fixture" },
  ])
    assert.throws(() => previewConfiguration({ ...base, ...overrides }));
  assert.equal(
    previewConfiguration({
      ...base,
      RENDER: "",
      RENDER_EXTERNAL_URL: "http://127.0.0.1:10000",
    }).host,
    "127.0.0.1",
  );
});

test("synthetic SQLite probe survives reopening without touching application storage", (t) => {
  const dir = fixture(t);
  const first = openPilotStorage(dir);
  const initial = first.receipt;
  assert.equal(initial.storage, "created");
  assert.equal(initial.boots, 1);
  assert.equal(first.healthy(), true);
  first.close();
  const second = openPilotStorage(dir);
  assert.equal(second.receipt.probe, initial.probe);
  assert.equal(second.receipt.boots, 2);
  assert.equal(second.receipt.storage, "reopened");
  second.close();
  assert.deepEqual(readdirSync(dir), ["pilot-health.sqlite"]);
});

test("pilot refuses a directory containing private records or symlinked storage", (t) => {
  const dir = fixture(t);
  writeFileSync(join(dir, "vault.sqlite"), "synthetic original evidence");
  assert.throws(() => openPilotStorage(dir));
  assert.equal(
    readFileSync(join(dir, "vault.sqlite"), "utf8"),
    "synthetic original evidence",
  );
  assert.deepEqual(readdirSync(dir), ["vault.sqlite"]);
  const parent = fixture(t);
  symlinkSync(dir, join(parent, "link"));
  assert.throws(() => openPilotStorage(join(parent, "link")));
});

test("asset loader rejects ordinary app build, links and unexpected private files", (t) => {
  const dir = fixture(t);
  writeFileSync(join(dir, "index.html"), "ordinary app");
  assert.throws(() => loadPreviewAssets(dir));
  rmSync(join(dir, "index.html"));
  buildFixture(dir);
  assert.ok(loadPreviewAssets(dir).has("/"));
  writeFileSync(join(dir, ".env"), "synthetic-private-config");
  assert.throws(() => loadPreviewAssets(dir));
  rmSync(join(dir, ".env"));
  symlinkSync(join(dir, "assets", "preview.js"), join(dir, "link.js"));
  assert.throws(() => loadPreviewAssets(dir));
});

test("preview serves public assets but rejects accounts, writes, secrets and unsafe paths", async (t) => {
  const dir = fixture(t);
  buildFixture(dir);
  const storage = openPilotStorage(join(dir, "probe"));
  const assetsDir = fixture(t);
  buildFixture(assetsDir);
  const server = createPreviewServer({
    origin,
    assets: loadPreviewAssets(assetsDir),
    storage,
  });
  t.after(() => {
    server.close();
    server.closeAllConnections();
    storage.close();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const page = await request(server, "/");
  assert.equal(page.status, 200);
  assert.match(page.body, /Read-only pilot/);
  assert.match(page.headers["content-security-policy"], /connect-src 'none'/);
  assert.match(page.headers["content-security-policy"], /form-action 'none'/);
  assert.equal(page.headers["set-cookie"], undefined);
  assert.equal(page.headers["x-robots-tag"], "noindex, nofollow");
  assert.equal((await request(server, "/assets/preview.js")).status, 200);
  const head = await request(server, "/", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.body, "");
  for (const path of [
    "/api",
    "/api/session",
    "/api/register",
    "/api/payments/webhook",
    "/api/projects",
    "/api/identity/start",
  ])
    assert.equal((await request(server, path)).status, 503);
  for (const method of ["POST", "PUT", "DELETE", "OPTIONS"])
    assert.equal(
      (
        await request(server, "/api/register", {
          method,
          body: "synthetic-do-not-save",
        })
      ).status,
      405,
    );
  for (const path of [
    "/.env",
    "/.git/config",
    "/pilot-health.sqlite",
    "/server/http.mjs",
    "/render-preview.html",
    "/unknown",
  ])
    assert.equal((await request(server, path)).status, 404);
  for (const path of [
    "/../server/http.mjs",
    "/%2e%2e/server/http.mjs",
    "/?token=synthetic",
    "//evil.example/",
  ])
    assert.equal((await request(server, path)).status, 400);
  assert.equal(
    (
      await request(server, "/healthz", {
        headers: {
          Host: "evil.example",
          "X-Forwarded-Host": new URL(origin).host,
        },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(server, "/", {
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  const health = await request(server, "/healthz");
  assert.equal(health.status, 200);
  assert.deepEqual(JSON.parse(health.body), {
    status: "ok",
    mode: "read-only-pilot",
    accountsEnabled: false,
    revision: null,
  });
  assert.ok(!health.body.includes(storage.receipt.probe));
});

test("health fails closed without exposing storage errors", async (t) => {
  const server = createPreviewServer({
    origin,
    assets: new Map(),
    storage: {
      healthy() {
        throw Error("synthetic-private-path");
      },
    },
  });
  t.after(() => {
    server.close();
    server.closeAllConnections();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const response = await request(server, "/healthz");
  assert.equal(response.status, 503);
  assert.ok(!response.body.includes("synthetic-private-path"));
});
