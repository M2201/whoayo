import http from "node:http";
import { randomBytes } from "node:crypto";
import { writeFileSync, lstatSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function configuration(key, model) {
  if (!/^sk-[A-Za-z0-9_-]{20,512}$/.test(key))
    throw new Error("Enter a valid OpenAI secret key.");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,100}$/.test(model))
    throw new Error("Enter a valid model identifier.");
  return `ORIGIN_EXTERNAL_AI=1\nORIGIN_OPENAI_KEY=${key}\nORIGIN_OPENAI_MODEL=${model}\nORIGIN_DAILY_REQUEST_LIMIT=20\n`;
}

export function createSetup({ destination, lifetimeMs = 15 * 60 * 1000 }) {
  const nonce = randomBytes(32).toString("hex");
  const path = `/setup/${nonce}`;
  let saved = false;
  const server = http.createServer(async (req, res) => {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const scriptNonce = randomBytes(24).toString("base64");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      `default-src 'none'; script-src 'nonce-${scriptNonce}'; connect-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
    );
    const reply = (status, text) => {
      res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(text);
    };
    if (
      req.headers.host !== `127.0.0.1:${server.address().port}` ||
      req.url !== path ||
      (req.headers.origin && req.headers.origin !== origin) ||
      (req.headers["sec-fetch-site"] &&
        !["none", "same-origin"].includes(req.headers["sec-fetch-site"]))
    )
      return reply(403, "Local setup access denied.");
    if (saved) return reply(409, "Configuration already saved.");
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WHOAYO connection setup</title>
        <style>body{font:16px system-ui;color:#193d32;max-width:560px;margin:64px auto;padding:24px}label{display:block;margin:24px 0}input,button{box-sizing:border-box;width:100%;padding:14px;font:inherit;border:1px solid #aabbb4;border-radius:6px}input{margin-top:8px}button{background:#195843;color:white}p{line-height:1.6;color:#52645c}</style>
        <h1>Connect OpenAI</h1><p>WHOAYO Development</p>
        <form method="post" action="${path}" autocomplete="off">
        <input type="hidden" name="nonce" value="${nonce}">
        <label>API key<input name="key" type="password" autocomplete="new-password" required maxlength="515"></label>
        <label>Model<input name="model" value="gpt-6-astra" required maxlength="101"></label>
        <button type="submit">Save local connection</button></form>
        <p id="status" role="status" aria-live="polite"></p>
        <noscript>JavaScript is unavailable. Enable it to see the save result in this page.</noscript>
        <p>Stored in a private local server configuration file, not in your project records. Saving does not call the model. This setup expires after 15 minutes.</p>
        <script nonce="${scriptNonce}">
          const form = document.querySelector('form');
          const button = form.querySelector('button');
          const status = document.querySelector('#status');
          form.addEventListener('invalid', () => {
            status.textContent = 'Enter both the API key and model before saving.';
          }, true);
          form.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (button.disabled) return;
            button.disabled = true;
            button.textContent = 'Saving...';
            status.textContent = 'Saving on this Mac. No request is sent to OpenAI.';
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 12000);
            try {
              const response = await fetch(form.action, {
                method: 'POST',
                body: new URLSearchParams(new FormData(form)),
                credentials: 'omit',
                redirect: 'error',
                signal: controller.signal,
              });
              const message = await response.text();
              status.textContent = message;
              if (response.ok) {
                form.reset();
                for (const input of form.querySelectorAll('input')) input.disabled = true;
                button.textContent = 'Connection saved';
              } else {
                button.disabled = false;
                button.textContent = 'Save local connection';
              }
            } catch {
              status.textContent = 'No save confirmation received. The local setup may have expired. Ask for a configuration check before retrying.';
              button.textContent = 'Save not confirmed';
            } finally {
              clearTimeout(timer);
            }
          });
        </script></html>`);
      return;
    }
    if (
      req.method !== "POST" ||
      req.headers.origin !== origin ||
      !req.headers["content-type"]?.startsWith(
        "application/x-www-form-urlencoded",
      )
    )
      return reply(403, "Invalid setup request.");
    try {
      let size = 0;
      const chunks = [];
      for await (const part of req) {
        size += part.length;
        if (size > 4096) throw new Error("limit");
        chunks.push(part);
      }
      const fields = new URLSearchParams(
        Buffer.concat(chunks).toString("utf8"),
      );
      if (fields.get("nonce") !== nonce)
        return reply(403, "Invalid setup request.");
      const content = configuration(
        fields.get("key")?.trim() || "",
        fields.get("model")?.trim() || "",
      );
      // Exclusive creation refuses both overwrites and existing symlinks.
      writeFileSync(destination, content, { flag: "wx", mode: 0o600 });
      saved = true;
      reply(
        200,
        "WHOAYO connection saved locally. No provider request was made. You may close this tab.",
      );
      server.close();
    } catch {
      reply(
        400,
        "Could not save. Check the key/model format and whether a configuration file already exists. Secret values were not logged.",
      );
    }
  });
  const timer = setTimeout(() => {
    server.close();
    server.closeAllConnections();
  }, lifetimeMs);
  timer.unref();
  server.on("close", () => clearTimeout(timer));
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return {
    server,
    path,
    get saved() {
      return saved;
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const destination = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../.env.local",
  );
  let exists = false;
  try {
    lstatSync(destination);
    exists = true;
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (exists)
    throw new Error("Configuration already exists; refusing to overwrite it.");
  const setup = createSetup({ destination });
  setup.server.listen(0, "127.0.0.1", () =>
    console.log(
      `Local setup: http://127.0.0.1:${setup.server.address().port}${setup.path}`,
    ),
  );
}
