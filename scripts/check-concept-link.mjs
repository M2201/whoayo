import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { verifySnapshot, timestampPayload } from "../server/evidence.mjs";
import { hash } from "../server/crypto.mjs";

// Explicit private paths only; read-only and never prints concept text or identifiers.
const [packagePath, payloadPath, proofPath, completionPath, pythonPath] =
  process.argv.slice(2);
if (
  ![packagePath, payloadPath, proofPath, completionPath, pythonPath].every(
    Boolean,
  )
)
  throw new Error(
    "Usage: node scripts/check-concept-link.mjs PACKAGE PAYLOAD COMPLETED_PROOF COMPLETION_RESULT OTS_PYTHON",
  );
const root = fileURLToPath(new URL("../", import.meta.url));
const record = JSON.parse(
  readFileSync(resolve(root, "src/concept-evidence.json"), "utf8"),
);
const snapshot = JSON.parse(readFileSync(packagePath, "utf8"));
verifySnapshot(snapshot);
assert.equal(timestampPayload(snapshot), readFileSync(payloadPath, "utf8"));
assert.equal(hash(timestampPayload(snapshot)), record.payloadSha256);
const parsed = JSON.parse(
  execFileSync(
    pythonPath,
    [resolve(root, "scripts/inspect-timestamp.py"), proofPath],
    { encoding: "utf8", timeout: 10000, maxBuffer: 65536 },
  ),
);
const result = JSON.parse(readFileSync(completionPath, "utf8"));
assert.equal(parsed.payloadSha256, record.payloadSha256);
assert.equal(parsed.proofSha256, record.completedProofSha256);
assert.equal(hash(readFileSync(proofPath)), record.completedProofSha256);
assert.equal(result.payloadSha256, record.payloadSha256);
assert.equal(result.proofSha256, record.completedProofSha256);
assert.equal(result.snapshotId, snapshot.manifest.id);
assert.equal(result.status, "bitcoin-proof-complete");
assert.equal(snapshot.manifest.revision, 2);
assert.deepEqual(parsed.bitcoinHeights, record.blockHeights);
assert.equal(result.localNodeVerified, false);
assert.equal(result.verificationMethod, record.method);
assert.equal(result.checkedAt, record.explorerCheckedAt);
assert.deepEqual(
  result.anchors.map((a) => a.height).sort(),
  [...record.blockHeights].sort(),
);
assert.equal(
  new Date(
    Math.min(...result.anchors.map((a) => Date.parse(a.blockTime))),
  ).toISOString(),
  new Date(record.attestedAt).toISOString(),
);
assert.match(snapshot.package.project.description, /Origin Studio/);
console.log(
  JSON.stringify({
    passed: true,
    privatePackageAndProofMatchPublicMetadata: true,
    readOnly: true,
    networkRequests: 0,
    freshBitcoinVerification: false,
    contentMappingRequiresHumanReview: true,
  }),
);
