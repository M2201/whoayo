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
    "Usage: node scripts/import-timestamp-completion.mjs SNAPSHOT_ID COMPLETED_PROOF_PATH RESULT_PATH",
  );
if (statSync(proofPath).size > 1024 * 1024 || statSync(resultPath).size > 65536)
  throw new Error("Timestamp completion input exceeds size limit");

const parsed = JSON.parse(
  execFileSync(
    resolve(root, "output/tooling/ots-venv/bin/python"),
    [resolve(root, "scripts/inspect-timestamp.py"), resolve(proofPath)],
    { encoding: "utf8", timeout: 10000, maxBuffer: 65536 },
  ),
);
const result = JSON.parse(readFileSync(resultPath, "utf8"));
const bytes = readFileSync(proofPath);
const parsedHeights = [...new Set(parsed.bitcoinHeights)].sort((a, b) => a - b);
const resultHeights = Array.isArray(result.bitcoinHeights)
  ? [...new Set(result.bitcoinHeights)].sort((a, b) => a - b)
  : [];

if (
  !parsedHeights.length ||
  parsed.proofSha256 !== hash(bytes) ||
  result.snapshotId !== snapshotId ||
  result.status !== "bitcoin-proof-complete" ||
  result.payloadSha256 !== parsed.payloadSha256 ||
  result.proofSha256 !== parsed.proofSha256 ||
  result.bitcoinVerified !== false ||
  result.localNodeVerified !== false ||
  JSON.stringify(resultHeights) !== JSON.stringify(parsedHeights)
)
  throw new Error(
    "Completed proof/result mismatch or Bitcoin attestation missing; import refused",
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
    throw new Error("Completed proof belongs to another fingerprint");
  const saved = store.recordTimestampCompletion(
    row.user_id,
    row.id,
    snapshotId,
    {
      ...result,
      bitcoinHeights: parsedHeights,
      proofBase64: bytes.toString("base64"),
    },
  );
  console.log(
    JSON.stringify({
      imported: true,
      status: saved.status,
      attestations: saved.bitcoinHeights.length,
      verificationMethod: saved.verificationMethod,
      localNodeVerified: false,
    }),
  );
} finally {
  store.close();
}
