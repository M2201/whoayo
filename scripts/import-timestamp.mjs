import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "../server/store.mjs";
import { hash } from "../server/crypto.mjs";
import { timestampPayload } from "../server/evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [snapshotId, proofPath, resultPath] = process.argv.slice(2);
if (!/^[a-f0-9-]{36}$/.test(snapshotId || "") || !proofPath || !resultPath)
  throw new Error(
    "Usage: node scripts/import-timestamp.mjs SNAPSHOT_ID PROOF_PATH RESULT_PATH",
  );
if (statSync(proofPath).size > 1024 * 1024 || statSync(resultPath).size > 65536)
  throw new Error("Timestamp input exceeds size limit");
const parsed = JSON.parse(
  execFileSync(
    resolve(root, "output/tooling/ots-venv/bin/python"),
    [resolve(root, "scripts/inspect-timestamp.py"), resolve(proofPath)],
    { encoding: "utf8", timeout: 10000, maxBuffer: 65536 },
  ),
);
const result = JSON.parse(readFileSync(resultPath, "utf8"));
const bytes = readFileSync(proofPath);
if (
  parsed.bitcoinHeights.length ||
  !parsed.pendingCalendars.length ||
  parsed.proofSha256 !== hash(bytes) ||
  result.snapshotId !== snapshotId ||
  result.status !== "pending-bitcoin-confirmation" ||
  result.payloadSha256 !== parsed.payloadSha256 ||
  result.proofSha256 !== parsed.proofSha256
)
  throw new Error(
    "Proof/result mismatch or block verification required; import refused",
  );
const dataDir = resolve(
  process.env.ORIGIN_DATA_DIR || resolve(root, ".local-data"),
);
const store = new Store(
  resolve(dataDir, "vault.sqlite"),
  readFileSync(resolve(dataDir, "master.key")),
);
try {
  const row = store.db
    .prepare(
      "SELECT p.id,p.user_id FROM snapshots s JOIN projects p ON s.project_id=p.id WHERE s.id=?",
    )
    .get(snapshotId);
  if (!row) throw new Error("Snapshot not found");
  const snapshot = store.readSnapshot(row.user_id, row.id, snapshotId);
  if (hash(timestampPayload(snapshot)) !== parsed.payloadSha256)
    throw new Error("Proof belongs to another fingerprint");
  const saved = store.recordTimestampSubmission(
    row.user_id,
    row.id,
    snapshotId,
    {
      ...result,
      pendingCalendars: parsed.pendingCalendars,
      proofBase64: bytes.toString("base64"),
    },
  );
  console.log(
    JSON.stringify({
      imported: true,
      snapshotId,
      status: saved.status,
      bitcoinVerified: false,
    }),
  );
} finally {
  store.close();
}
