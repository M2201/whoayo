// Public read-only deployment boundary. Never import the private app, Store,
// provider adapters, identity, or payments here. This is not an app proxy.
import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const marker = '<meta name="whoayo-preview" content="read-only-pilot"';
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};
const revisionPattern = /^[a-f0-9]{40}$/;

export function previewConfiguration(env) {
  if (env.WHOAYO_DEPLOYMENT_MODE !== "read-only-pilot")
    throw Error("Read-only pilot mode must be explicitly selected.");
  if (
    Object.keys(env).some(
      (key) =>
        env[key] &&
        (key.startsWith("ORIGIN_") ||
          /^(OPENAI_API_KEY|ANTHROPIC_API_KEY|STRIPE_SECRET_KEY|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)$/.test(
            key,
          )),
    )
  ) {
    throw Error(
      "Private application configuration is not allowed in the read-only pilot.",
    );
  }
  const hosted = env.RENDER === "true";
  const origin = env.RENDER_EXTERNAL_URL || env.WHOAYO_PREVIEW_ORIGIN;
  let url;
  try {
    url = new URL(origin);
  } catch {
    throw Error("An exact preview origin is required.");
  }
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (hosted
      ? url.protocol !== "https:" ||
        !/^[a-z0-9-]+\.onrender\.com$/.test(url.hostname) ||
        url.port
      : url.protocol !== "http:" || url.hostname !== "127.0.0.1")
  ) {
    throw Error("Preview origin is not permitted.");
  }
  const dataDir = env.WHOAYO_PILOT_DATA_DIR;
  if (
    !dataDir ||
    !isAbsolute(dataDir) ||
    (hosted && dataDir !== "/var/data/whoayo-readonly-pilot")
  )
    throw Error("A dedicated pilot data directory is required.");
  const port = Number(env.PORT || 10000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("Invalid listening port.");
  return {
    origin,
    dataDir,
    port,
    host: hosted ? "0.0.0.0" : "127.0.0.1",
    revision: revisionPattern.test(env.RENDER_GIT_COMMIT || "")
      ? env.RENDER_GIT_COMMIT
      : null,
  };
}

export function openPilotStorage(dataDir) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  if (realpathSync(dataDir) !== resolve(dataDir))
    throw Error("Pilot storage must not contain symbolic links.");
  // This directory may contain only this synthetic probe, never a private vault.
  const allowed = new Set([
    "pilot-health.sqlite",
    "pilot-health.sqlite-wal",
    "pilot-health.sqlite-shm",
  ]);
  for (const name of readdirSync(dataDir)) {
    if (!allowed.has(name) || !lstatSync(join(dataDir, name)).isFile())
      throw Error("Pilot storage is not an isolated probe directory.");
  }
  chmodSync(dataDir, 0o700);
  const path = join(dataDir, "pilot-health.sqlite");
  const reopened = existsSync(path);
  const db = new DatabaseSync(path);
  try {
    chmodSync(path, 0o600);
    db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS probe (id INTEGER PRIMARY KEY CHECK(id=1), token TEXT NOT NULL, boots INTEGER NOT NULL)",
    );
    db.prepare("INSERT OR IGNORE INTO probe VALUES (1, ?, 0)").run(
      randomUUID(),
    );
    db.exec("UPDATE probe SET boots = boots + 1 WHERE id = 1");
    const receipt = db
      .prepare("SELECT token, boots FROM probe WHERE id = 1")
      .get();
    if (
      !receipt ||
      typeof receipt.token !== "string" ||
      !Number.isSafeInteger(receipt.boots)
    )
      throw Error("Invalid pilot storage.");
    return {
      receipt: {
        storage: reopened ? "reopened" : "created",
        probe: receipt.token,
        boots: receipt.boots,
      },
      healthy: () =>
        db.prepare("SELECT token FROM probe WHERE id = 1").get()?.token ===
        receipt.token,
      close: () => db.close(),
    };
  } catch (error) {
    db.close();
    throw error;
  }
}

export function loadPreviewAssets(directory) {
  if (realpathSync(directory) !== resolve(directory))
    throw Error("Preview assets must be regular build files.");
  const assets = new Map();
  let total = 0;
  const walk = (relative = "") => {
    for (const name of readdirSync(join(directory, relative))) {
      const file = join(relative, name);
      const path = join(directory, file);
      const stat = lstatSync(path);
      if (stat.isDirectory()) {
        walk(file);
        continue;
      }
      if (
        !stat.isFile() ||
        !types[extname(file)] ||
        stat.size > 2 * 1024 * 1024 ||
        (total += stat.size) > 12 * 1024 * 1024
      )
        throw Error("Unexpected preview build contents.");
      assets.set(`/${file}`, {
        type: types[extname(file)],
        bytes: readFileSync(path),
      });
    }
  };
  walk();
  const entry = assets.get("/render-preview.html");
  if (!entry?.bytes.toString("utf8").includes(marker))
    throw Error("A dedicated read-only preview build is required.");
  assets.delete("/render-preview.html");
  assets.set("/", entry);
  return assets;
}

export function createPreviewServer({
  origin,
  assets,
  storage,
  revision = null,
}) {
  const expectedHost = new URL(origin).host;
  const server = http.createServer({ maxHeaderSize: 8192 }, (req, res) => {
    const send = (status, value, type = "application/json; charset=utf-8") => {
      const bytes = Buffer.isBuffer(value)
        ? value
        : Buffer.from(JSON.stringify(value));
      res.writeHead(status, {
        "Content-Type": type,
        "Content-Length": bytes.length,
      });
      res.end(req.method === "HEAD" ? undefined : bytes);
    };
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    );
    if (origin.startsWith("https:"))
      res.setHeader("Strict-Transport-Security", "max-age=86400");
    // No cookies, bodies, request paths, headers or addresses are logged.
    if (
      req.headers.host !== expectedHost ||
      (req.headers.origin && req.headers.origin !== origin)
    )
      return send(403, { error: "Address not allowed." });
    if (!["GET", "HEAD"].includes(req.method)) {
      res.setHeader("Allow", "GET, HEAD");
      res.setHeader("Connection", "close");
      return send(405, { error: "This pilot is read-only." });
    }
    if (
      !/^\/[A-Za-z0-9._/-]*$/.test(req.url) ||
      req.url.startsWith("//") ||
      req.url.split("/").some((part) => part === "." || part === "..")
    )
      return send(400, { error: "Invalid path." });
    if (req.url === "/api" || req.url.startsWith("/api/"))
      return send(503, {
        error:
          "Customer accounts and private application functions are not enabled.",
      });
    if (req.url === "/healthz") {
      let healthy = false;
      try {
        healthy = storage.healthy();
      } catch {
        /* Fail closed without diagnostic contents. */
      }
      return send(healthy ? 200 : 503, {
        status: healthy ? "ok" : "unavailable",
        mode: "read-only-pilot",
        accountsEnabled: false,
        revision,
      });
    }
    const asset = assets.get(req.url);
    if (!asset) return send(404, { error: "Not found." });
    send(200, asset.bytes, asset.type);
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 5000;
  server.maxRequestsPerSocket = 100;
  server.maxConnections = 128;
  return server;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.umask(0o077);
    const config = previewConfiguration(process.env);
    const assets = loadPreviewAssets(resolve(root, "dist-render"));
    const storage = openPilotStorage(config.dataDir);
    const server = createPreviewServer({ ...config, assets, storage });
    server.on("error", () => {
      console.error("Preview listener failed.");
      storage.close();
      process.exit(1);
    });
    server.listen(config.port, config.host, () =>
      console.log(
        JSON.stringify({
          event: "readonly-pilot-started",
          revision: config.revision,
          ...storage.receipt,
        }),
      ),
    );
    for (const signal of ["SIGINT", "SIGTERM"])
      process.once(signal, () => {
        const deadline = setTimeout(() => process.exit(1), 8000);
        deadline.unref();
        server.close(() => {
          storage.close();
          clearTimeout(deadline);
          process.exit(0);
        });
        server.closeIdleConnections();
      });
  } catch {
    console.error(
      "Read-only pilot startup refused. Check the reviewed deployment configuration, build and isolated disk.",
    );
    process.exitCode = 1;
  }
}
