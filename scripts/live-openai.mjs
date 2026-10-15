import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "../server/store.mjs";
import { Gateway } from "../server/gateway.mjs";
import { canonical } from "../server/crypto.mjs";
import { verifyPackage } from "./verify-package.mjs";

if (!process.argv.includes("--run-live"))
  throw new Error("Explicit --run-live is required.");
if (
  process.env.ORIGIN_EXTERNAL_AI !== "1" ||
  !process.env.ORIGIN_OPENAI_KEY ||
  process.env.ORIGIN_OPENAI_MODEL !== "gpt-6-astra"
)
  throw new Error("Configure the dedicated OpenAI key and gpt-6-astra first.");

const output = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../output/live-openai",
);
mkdirSync(output, { recursive: true, mode: 0o700 });
const ledgerPath = resolve(output, "run.json");
// A completed or interrupted run must be reviewed before another paid run.
writeFileSync(
  ledgerPath,
  JSON.stringify(
    {
      started: new Date().toISOString(),
      authorizedCeilingUsd: 1,
      reservedUsd: 0,
      attempts: [],
    },
    null,
    2,
  ),
  { flag: "wx", mode: 0o600 },
);
const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
const persist = () =>
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2), { mode: 0o600 });
const store = new Store(":memory:", randomBytes(32));
const u = await store.register({
  name: "Synthetic Connection Test",
  username: "synthetic-live-test",
  password: randomBytes(32).toString("hex"),
});
let p = store.create(u.id, {
  title: "Synthetic provider connection test",
  description: "No customer or private concept data.",
});
const gateway = new Gateway(store, {
  env: { ...process.env, ORIGIN_DAILY_REQUEST_LIMIT: "2" },
});
const cases = [
  {
    id: "connection",
    mode: "plan",
    content:
      "This is a synthetic connectivity test with no private data. Reply exactly: ORIGIN_CONNECTION_OK",
    check: (text) => text.trim() === "ORIGIN_CONNECTION_OK",
  },
  {
    id: "coding",
    mode: "build",
    content:
      "Synthetic coding test. Return a JavaScript function named add that returns a + b, then exactly one example call. No explanation. Do not run anything.",
    check: (text) =>
      /function\s+add\s*\(/.test(text) && /return\s+a\s*\+\s*b/.test(text),
  },
];
try {
  for (const c of cases) {
    const r = gateway.prepare(u.id, p.id, {
      revision: p.revision,
      provider: "openai",
      threadId: p.threads[0].id,
      content: c.content,
      mode: c.mode,
      artifactIds: [],
      includeHistory: false,
    });
    // Conservative reservation exceeds current standard rates and includes all output tokens.
    const reservation =
      Math.ceil(
        (((Buffer.byteLength(canonical(r.preview.request)) + 256) * 25) / 1e6 +
          (4096 * 100) / 1e6) *
          10000,
      ) / 10000;
    if (ledger.reservedUsd + reservation > 1)
      throw new Error("Test spending reservation would exceed authorization.");
    ledger.reservedUsd += reservation;
    const attempt = {
      case: c.id,
      status: "attempting",
      reservationUsd: reservation,
    };
    ledger.attempts.push(attempt);
    persist();
    try {
      p = await gateway.send(u.id, p.id, {
        revision: r.project.revision,
        approvalToken: r.preview.approvalToken,
        digest: r.preview.digest,
        approved: true,
      });
      const d = p.disclosures.at(-1);
      const response = p.threads[0].messages.at(-1);
      Object.assign(attempt, {
        status: "completed",
        accepted: c.check(response.content),
        returnedModel: response.model,
        usage: d.usage,
        durationMs: d.durationMs,
        estimatedCostUsd:
          ((d.usage.inputTokens ?? 0) * 12.5 +
            (d.usage.outputTokens ?? 0) * 50) /
          1e6,
        costBasis:
          "Estimated upper input rate (cache write) plus standard output; not invoiced cost.",
      });
      persist();
      console.log(JSON.stringify(attempt));
      if (!attempt.accepted) break;
    } catch {
      p = store.project(u.id, p.id);
      Object.assign(attempt, {
        status: "failed-or-uncertain",
        reason: p.disclosures.at(-1)?.reason || "request-not-completed",
      });
      persist();
      console.log(JSON.stringify(attempt));
      break;
    }
  }
  const bundle = store.export(u.id, p.id);
  writeFileSync(
    resolve(output, "synthetic-evidence.json"),
    JSON.stringify(bundle, null, 2),
    { mode: 0o600 },
  );
  ledger.verification = verifyPackage(bundle);
  ledger.finished = new Date().toISOString();
  ledger.passed =
    ledger.attempts.length === 2 &&
    ledger.attempts.every((x) => x.status === "completed" && x.accepted);
  persist();
  console.log(
    JSON.stringify({
      passed: ledger.passed,
      attempts: ledger.attempts.length,
      reservedUsd: ledger.reservedUsd,
      report: "output/live-openai/run.json",
    }),
  );
  if (!ledger.passed) process.exitCode = 1;
} finally {
  store.close();
}
