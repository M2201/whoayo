import http from "node:http";
import {
  readFileSync,
  existsSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
} from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { Store, InputError, ensure } from "./store.mjs";
import { INCOMPLETE } from "./recovery.mjs";
import { Gateway } from "./gateway.mjs";
import { Monitor } from "./monitor.mjs";
import { createSample } from "./sample.mjs";
import { SKILLS } from "./skills.mjs";
import { ManagedIdentity } from "./managed-identity.mjs";
import {
  LocalDescriptionReviewer,
  checklistReview,
} from "./description-review.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export function createServer({
  store,
  gateway = new Gateway(store),
  payments = gateway.payments,
  reviewer = new LocalDescriptionReviewer(),
  identity = new ManagedIdentity(),
  publicOrigin = identity.publicOrigin,
  secureCookies = Boolean(publicOrigin),
  staticRoot = resolve(root, "dist"),
}) {
  const buckets = new Map(),
    monitor = new Monitor(store);
  monitor.start();
  function rate(key, limit, window = 60000) {
    const now = Date.now();
    if (buckets.size > 10000)
      for (const [k, v] of buckets) if (v.until < now) buckets.delete(k);
    let b = buckets.get(key);
    if (!b || b.until < now) {
      b = { n: 0, until: now + window };
      buckets.set(key, b);
    }
    ensure(
      ++b.n <= limit,
      "Too many requests. Please wait and try again.",
      429,
    );
  }
  const server = http.createServer(async (req, res) => {
    const appendCookie = (value) => res.appendHeader("Set-Cookie", value);
    const cookieFlags = secureCookies ? "; Secure" : "";
    const sessionCookie = (value, maxAge = 28800) =>
      `origin_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${cookieFlags}`;
    const identityCookie = (value, maxAge = 300) =>
      `origin_identity=${value}; HttpOnly; SameSite=Lax; Path=/api/identity/callback; Max-Age=${maxAge}${cookieFlags}`;
    const loginCsrfCookie = (value, maxAge = 300) =>
      `origin_login_csrf=${value}; SameSite=Strict; Path=/; Max-Age=${maxAge}${cookieFlags}`;
    const cookies = new Map(
      (req.headers.cookie || "")
        .split(";")
        .map((part) => part.trim().split("="))
        .filter(([name, value]) => name && value)
        .map(([name, ...value]) => [name, value.join("=")]),
    );
    const send = (status, value) => {
      if (!res.destroyed) {
        res.writeHead(status, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(JSON.stringify(value));
      }
    };
    const readRaw = async (limit) => {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        ensure(size <= limit, "Request too large.", 413);
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    };
    try {
      const localOrigin = `http://127.0.0.1:${server.address().port}`;
      const origin = publicOrigin || localOrigin;
      const expectedHost = new URL(origin).host;
      const url = new URL(req.url, origin);
      const identityCallback =
        identity.enabled &&
        req.method === "GET" &&
        url.pathname === "/api/identity/callback";
      const safeDocumentNavigation =
        req.method === "GET" && !url.pathname.startsWith("/api/");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      );
      res.setHeader(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=()",
      );
      ensure(
        req.headers.host === expectedHost,
        publicOrigin
          ? "Use the configured application address."
          : "Use the local application address.",
        403,
      );
      ensure(
        !req.headers.origin || req.headers.origin === origin,
        "Cross-origin access denied.",
        403,
      );
      ensure(
        !req.headers["sec-fetch-site"] ||
          ["same-origin", "none"].includes(req.headers["sec-fetch-site"]) ||
          ((identityCallback || safeDocumentNavigation) &&
            req.headers["sec-fetch-site"] === "cross-site"),
        "Cross-site access denied.",
        403,
      );
      rate(req.socket.remoteAddress, 300);
      if (url.pathname === "/api/payments/webhook") {
        ensure(req.method === "POST", "Method not allowed.", 405);
        ensure(payments?.enabled, "Payments are not enabled.", 404);
        ensure(
          req.headers["content-type"]?.startsWith("application/json"),
          "JSON required.",
          415,
        );
        rate(`payment-webhook:${req.socket.remoteAddress}`, 120, 60000);
        send(
          200,
          await payments.webhook(
            await readRaw(256 * 1024),
            req.headers["stripe-signature"],
          ),
        );
        return;
      }
      if (identityCallback) {
        rate(`identity-callback:${req.socket.remoteAddress}`, 12, 60000);
        try {
          const claims = await identity.complete(
            url.href,
            cookies.get("origin_identity"),
          );
          const user = store.managedAccount(claims);
          const managedSession = store.session(user.id);
          appendCookie(sessionCookie(managedSession.raw));
          appendCookie(identityCookie("", 0));
          appendCookie(loginCsrfCookie("", 0));
          res.writeHead(303, { Location: "/" });
          res.end();
        } catch {
          appendCookie(identityCookie("", 0));
          res.writeHead(303, { Location: "/?identity=failed" });
          res.end();
        }
        return;
      }
      if (!url.pathname.startsWith("/api/")) {
        ensure(req.method === "GET", "Method not allowed.", 405);
        let pathname = decodeURIComponent(url.pathname);
        let path = resolve(staticRoot, `.${pathname}`);
        ensure(
          path.startsWith(`${staticRoot}/`) || path === staticRoot,
          "Invalid path.",
          400,
        );
        if (pathname === "/" || !extname(pathname))
          path = resolve(staticRoot, "index.html");
        ensure(existsSync(path), "Not found.", 404);
        const type =
          {
            ".html": "text/html; charset=utf-8",
            ".js": "text/javascript",
            ".css": "text/css",
            ".png": "image/png",
            ".svg": "image/svg+xml",
            ".ico": "image/x-icon",
          }[extname(path)] || "application/octet-stream";
        res.setHeader("Content-Type", type);
        res.end(readFileSync(path));
        return;
      }
      const raw = cookies.get("origin_session");
      let session = store.auth(raw);
      if (req.method === "GET" && url.pathname === "/api/session") {
        let loginCsrf = null;
        if (identity.enabled) {
          loginCsrf = cookies.get("origin_login_csrf");
          if (!/^[0-9a-f]{64}$/.test(loginCsrf || "")) {
            loginCsrf = randomBytes(32).toString("hex");
            appendCookie(loginCsrfCookie(loginCsrf));
          }
        }
        send(200, {
          user: session?.user || null,
          csrf: session?.csrf || null,
          loginCsrf,
          identity: {
            enabled: identity.enabled,
            invitedOnly: identity.enabled,
          },
          localRegistration: !identity.enabled,
          providers: gateway.catalog(),
          payments: payments.publicStatus(session?.user?.id),
          skills: SKILLS,
          deployment: publicOrigin ? "invited-hosted" : "local-development",
        });
        return;
      }
      let input = {};
      if (req.method !== "GET") {
        ensure(req.method === "POST", "Method not allowed.", 405);
        ensure(req.headers.origin === origin, "Origin required.", 403);
        ensure(
          req.headers["content-type"]?.startsWith("application/json"),
          "JSON required.",
          415,
        );
        const body = await readRaw(1200000);
        try {
          input = JSON.parse(body.toString("utf8"));
        } catch {
          throw new InputError("Invalid JSON.");
        }
        ensure(
          input && typeof input === "object" && !Array.isArray(input),
          "Object body required.",
        );
      }
      if (url.pathname === "/api/identity/start" && req.method === "POST") {
        ensure(identity.enabled, "Managed sign-in is not enabled.", 404);
        rate(`identity-start:${req.socket.remoteAddress}`, 8, 60000);
        const loginCsrf = cookies.get("origin_login_csrf");
        ensure(
          /^[0-9a-f]{64}$/.test(loginCsrf || "") &&
            req.headers["x-csrf-token"] === loginCsrf,
          "Refresh before starting managed sign-in.",
          403,
        );
        const started = await identity.begin();
        appendCookie(identityCookie(started.browserToken, started.expiresIn));
        send(200, {
          redirect: started.url,
          expiresIn: started.expiresIn,
        });
        return;
      }
      if (
        ["/api/register", "/api/login"].includes(url.pathname) &&
        req.method === "POST"
      ) {
        ensure(
          url.pathname !== "/api/register" || !identity.enabled,
          "Public registration is closed. Use your invited account.",
          403,
        );
        rate(`auth:${req.socket.remoteAddress}`, 8, 60000);
        const user =
            await store[
              url.pathname.endsWith("register") ? "register" : "login"
            ](input),
          s = store.session(user.id);
        appendCookie(sessionCookie(s.raw));
        send(200, {
          user,
          csrf: s.csrf,
          providers: gateway.catalog(),
          payments: payments.publicStatus(user.id),
          skills: SKILLS,
        });
        return;
      }
      // A slow body must not retain authority revoked by another request.
      session = store.auth(raw);
      ensure(session, "Sign in to continue.", 401);
      const uid = session.user.id;
      if (req.method === "POST")
        ensure(
          req.headers["x-csrf-token"] === session.csrf,
          "Session validation failed. Refresh and try again.",
          403,
        );
      if (url.pathname === "/api/local-review" && req.method === "GET") {
        send(200, reviewer.catalog());
        return;
      }
      if (url.pathname === "/api/logout" && req.method === "POST") {
        store.logout(raw);
        appendCookie(sessionCookie("", 0));
        const redirect =
          session.user.authentication === "managed"
            ? identity.logoutUrl()
            : null;
        send(200, {
          ok: true,
          ...(redirect ? { redirect } : {}),
        });
        return;
      }
      if (
        url.pathname === "/api/sessions/revoke-all" &&
        req.method === "POST"
      ) {
        rate(`reauth:${uid}`, 5);
        const revoked =
          session.user.authentication === "managed"
            ? store.revokeManagedSessions(raw)
            : await store.revokeSessions(raw, input.password);
        appendCookie(sessionCookie("", 0));
        const redirect =
          session.user.authentication === "managed"
            ? identity.logoutUrl()
            : null;
        send(200, {
          ok: true,
          revoked,
          ...(redirect ? { redirect } : {}),
        });
        return;
      }
      if (url.pathname === "/api/projects") {
        if (req.method === "GET") send(200, store.list(uid));
        else send(201, store.create(uid, input));
        return;
      }
      if (url.pathname === "/api/payments") {
        ensure(req.method === "GET", "Method not allowed.", 405);
        send(200, payments.publicStatus(uid));
        return;
      }
      if (url.pathname === "/api/payments/checkout") {
        ensure(req.method === "POST", "Method not allowed.", 405);
        rate(`payment-checkout:${uid}`, 6, 60000);
        send(
          200,
          await payments.createCheckout(uid, input.tier, () =>
            ensure(
              store.auth(raw)?.user.id === uid,
              "Sign in to continue.",
              401,
            ),
          ),
        );
        return;
      }
      if (url.pathname === "/api/payments/portal") {
        ensure(req.method === "POST", "Method not allowed.", 405);
        rate(`payment-portal:${uid}`, 12, 60000);
        send(200, await payments.createPortal(uid));
        return;
      }
      if (url.pathname === "/api/ideas" && req.method === "POST") {
        send(201, store.createFromIdea(uid, input));
        return;
      }
      if (url.pathname === "/api/sample" && req.method === "POST") {
        send(201, createSample(store, uid));
        return;
      }
      if (url.pathname === "/api/security") {
        send(200, {
          ...monitor.scan(uid),
          providers: gateway.catalog(),
          usage: { attempts: store.usage(uid), dailyLimit: gateway.limit },
          spend: gateway.spend.summary(
            uid,
            payments.entitlement(uid)?.monthlyAiBudgetMicroUsd,
          ),
          payments: payments.publicStatus(uid),
          controls: {
            storage: "AES-256-GCM per project",
            authentication:
              session.user.authentication === "managed"
                ? "Verified invited identity + expiring application session"
                : "Local password + expiring session",
            monitoring: "Rule-based, every 60 seconds while server runs",
            keyCustody: "Server-managed; machine administrator can decrypt",
            publicAnchoring: "Not connected",
            execution: "No shell execution",
            paymentAccess: payments.required
              ? "Signed webhook entitlement required"
              : "Not required in this mode",
            deployment: "Loopback only",
          },
        });
        return;
      }
      const match = url.pathname.match(
        /^\/api\/projects\/([a-f0-9-]{36})(?:\/(action|prepare|send|export|verify|events|preserve|snapshots|snapshot|timestamp-preparation|timestamp-receipt|timestamp-completion-receipt|timestamp-status|timestamp-prepare|timestamp-submit|signed-receipt|description-review))?$/,
      );
      ensure(match, "Not found.", 404);
      const [, id, action] = match;
      store.row(uid, id);
      if (req.method === "GET") {
        if (action === "timestamp-status") {
          send(200, gateway.timestamps.status(uid, id));
          return;
        }
        if (action === "signed-receipt") {
          send(
            200,
            gateway.timestamps.receipt(
              uid,
              id,
              url.searchParams.get("receipt"),
            ),
          );
          return;
        }
        if (!action) {
          const p = store.project(uid, id);
          delete p.pending;
          send(200, p);
        } else if (action === "export") {
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="origin-${id}.json"`,
          );
          send(200, store.export(uid, id));
        } else if (action === "verify") send(200, store.verify(uid, id));
        else if (action === "events") send(200, store.events(uid, id));
        else if (action === "snapshots") send(200, store.snapshots(uid, id));
        else if (action === "snapshot")
          send(
            200,
            store.readSnapshot(uid, id, url.searchParams.get("snapshot")),
          );
        else if (action === "timestamp-preparation")
          send(
            200,
            store.timestampPreparation(
              uid,
              id,
              url.searchParams.get("snapshot"),
            ),
          );
        else if (action === "timestamp-receipt") {
          const receipt = store.timestampSubmission(
            uid,
            id,
            url.searchParams.get("snapshot"),
          );
          ensure(receipt, "No timestamp receipt is recorded.", 404);
          send(200, receipt);
        } else if (action === "timestamp-completion-receipt") {
          const receipt = store.timestampCompletion(
            uid,
            id,
            url.searchParams.get("snapshot"),
          );
          ensure(receipt, "No completed timestamp proof is recorded.", 404);
          send(200, receipt);
        } else throw new InputError("Method not allowed.", 405);
        return;
      }
      if (action === "timestamp-prepare") {
        rate(`timestamp:${uid}`, 6);
        send(200, gateway.timestamps.prepare(uid, id, input));
      } else if (action === "timestamp-submit") {
        rate(`timestamp-submit:${uid}`, 6);
        const controller = new AbortController();
        res.on("close", () => {
          if (!res.writableEnded) controller.abort();
        });
        send(
          200,
          await gateway.timestamps.submit(uid, id, input, controller.signal),
        );
      } else if (action === "description-review") {
        rate(`review:${uid}`, 6);
        ensure(
          store.project(uid, id).revision === input.revision,
          "The project changed. Reopen the description before reviewing.",
          409,
        );
        ensure(
          ["checklist", "model"].includes(input.mode),
          "Choose checklist or local model review.",
        );
        const controller = new AbortController();
        res.on("close", () => {
          if (!res.writableEnded) controller.abort();
        });
        const result =
          input.mode === "checklist"
            ? checklistReview(input)
            : await reviewer.review(input, controller.signal);
        ensure(
          store.project(uid, id).revision === input.revision,
          "The project changed during review. Review the current version instead.",
          409,
        );
        send(200, result);
      } else if (action === "action") send(200, store.action(uid, id, input));
      else if (action === "preserve")
        send(200, store.preserve(uid, id, input.revision));
      else if (action === "prepare") send(200, gateway.prepare(uid, id, input));
      else if (action === "send") {
        const controller = new AbortController();
        res.on("close", () => {
          if (!res.writableEnded) controller.abort();
        });
        send(200, await gateway.send(uid, id, input, controller.signal));
      } else throw new InputError("Method not allowed.", 405);
    } catch (e) {
      send(e instanceof InputError ? e.status : 500, {
        ...(e instanceof InputError &&
        ["name", "username", "password"].includes(e.field)
          ? { field: e.field }
          : {}),
        error:
          e instanceof InputError
            ? e.message
            : "The operation could not complete. Your saved work has been preserved.",
      });
    }
  });
  server.on("close", () => monitor.stop());
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = resolve(
    process.env.ORIGIN_DATA_DIR || resolve(root, ".local-data"),
  );
  ensure(
    !existsSync(resolve(dir, INCOMPLETE)),
    "This restore is incomplete. Do not open this data directory.",
  );
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const keyPath = resolve(dir, "master.key");
  let key;
  if (process.env.ORIGIN_MASTER_KEY) {
    ensure(
      /^[0-9a-fA-F]{64}$/.test(process.env.ORIGIN_MASTER_KEY),
      "ORIGIN_MASTER_KEY must be 64 hex characters.",
    );
    key = Buffer.from(process.env.ORIGIN_MASTER_KEY, "hex");
  } else {
    if (!existsSync(keyPath))
      writeFileSync(keyPath, randomBytes(32), { flag: "wx", mode: 0o600 });
    key = readFileSync(keyPath);
  }
  const store = new Store(resolve(dir, "vault.sqlite"), key);
  // A crash can occur after reservation and provider handoff. Fail closed: keep
  // every unsettled amount counted until an operator reconciles provider logs.
  store.reconcileInterruptedSpend();
  // Reconcile interrupted attempts without resending private material.
  for (const u of store.db.prepare("SELECT id FROM users").all())
    for (const p of store.list(u.id)) {
      const project = store.project(u.id, p.id);
      if (project.disclosures.some((d) => d.status === "attempted"))
        store.mutate(
          u.id,
          p.id,
          project.revision,
          "disclosure.interrupted",
          {},
          (s) => {
            for (const d of s.disclosures)
              if (d.status === "attempted") {
                d.status = "outcome-unknown";
                d.reason = "server-restart";
              }
          },
        );
    }
  const identity = new ManagedIdentity(process.env);
  const server = createServer({
    store,
    identity,
    publicOrigin: identity.publicOrigin,
  });
  const port = Number(process.env.PORT || 4360);
  server.listen(port, "127.0.0.1", () =>
    console.log(
      identity.enabled
        ? `WHOAYO invited identity backend: ${identity.publicOrigin}`
        : `WHOAYO: http://127.0.0.1:${server.address().port}`,
    ),
  );
  for (const sig of ["SIGTERM", "SIGINT"])
    process.on(sig, () =>
      server.close(() => {
        store.close();
        process.exit(0);
      }),
    );
}
