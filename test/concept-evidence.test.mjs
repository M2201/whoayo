import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("public concept evidence is an explicit safe metadata allowlist", () => {
  const r = JSON.parse(
    readFileSync(new URL("../src/concept-evidence.json", import.meta.url)),
  );
  assert.deepEqual(
    Object.keys(r).sort(),
    [
      "schema",
      "title",
      "coveredVersion",
      "attestedAt",
      "mappingCheckedOn",
      "explorerCheckedAt",
      "method",
      "localNodeVerified",
      "payloadSha256",
      "completedProofSha256",
      "blockHeights",
    ].sort(),
  );
  assert.equal(r.localNodeVerified, false);
  assert.equal(r.method, "public-explorer-cross-check");
  assert.match(r.payloadSha256, /^[a-f0-9]{64}$/);
  assert.match(r.completedProofSha256, /^[a-f0-9]{64}$/);
  assert.equal(r.attestedAt, "2026-10-05T04:52:27Z");
  assert.deepEqual(r.blockHeights, [969956, 969961]);
});
