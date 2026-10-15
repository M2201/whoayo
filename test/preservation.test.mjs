import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.mjs";
import { canonical, hash } from "../server/crypto.mjs";
import {
  createSnapshot,
  verifyPackage,
  timestampPayload,
} from "../server/evidence.mjs";
import { createServer } from "../server/http.mjs";

async function fixture(t) {
  const store = new Store(":memory:", randomBytes(32));
  t.after(() => store.close());
  const user = await store.register({
    username: "preservation-test",
    name: "Synthetic researcher",
    password: "Synthetic-only-preservation-42!",
  });
  const project = store.create(user.id, { title: "Private synthetic title" });
  return { store, user, project };
}
const record = (store, user, project, content = "Private synthetic idea") =>
  store.action(user.id, project.id, {
    revision: project.revision,
    action: "idea.record",
    title: "Human source",
    content,
    origin: "human",
  });

test("operator-imported pending and completed timestamp records remain separate, immutable, owner-scoped, and conservatively labeled", async (t) => {
  const { store, user, project } = await fixture(t);
  const p = record(store, user, project);
  const snapshot = store.preserve(user.id, p.id, p.revision);
  // Parser validation is tested separately using the official OTS library.
  const bytes = Buffer.from(
    "synthetic storage-boundary fixture, not a blockchain proof",
  );
  const input = {
    snapshotId: snapshot.manifest.id,
    payloadSha256: hash(timestampPayload(snapshot)),
    proofBase64: bytes.toString("base64"),
    proofSha256: hash(bytes),
    recordedAt: new Date().toISOString(),
    pendingCalendars: ["https://alice.btc.calendar.opentimestamps.org"],
    status: "pending-bitcoin-confirmation",
  };
  assert.throws(() =>
    store.recordTimestampSubmission(user.id, p.id, input.snapshotId, {
      ...input,
      status: "verified",
    }),
  );
  assert.throws(() =>
    store.recordTimestampSubmission(user.id, p.id, input.snapshotId, {
      ...input,
      payloadSha256: "0".repeat(64),
    }),
  );
  assert.throws(() =>
    store.recordTimestampSubmission(user.id, p.id, input.snapshotId, {
      ...input,
      pendingCalendars: ["https://unapproved.example"],
    }),
  );
  const saved = store.recordTimestampSubmission(
    user.id,
    p.id,
    input.snapshotId,
    input,
  );
  assert.equal(saved.bitcoinVerified, false);
  assert.deepEqual(
    store.recordTimestampSubmission(user.id, p.id, input.snapshotId, input),
    saved,
  );
  assert.equal(
    store.snapshots(user.id, p.id)[0].timestampStatus,
    "pending-bitcoin-confirmation",
  );
  assert.equal(
    store.timestampPreparation(user.id, p.id, input.snapshotId).status,
    "pending-bitcoin-confirmation",
  );
  assert.deepEqual(
    store.readSnapshot(user.id, p.id, input.snapshotId),
    snapshot,
  );
  assert.ok(
    !store.db
      .prepare("SELECT data FROM timestamp_submissions")
      .get()
      .data.includes("pending"),
  );
  assert.throws(
    () => store.db.exec("DELETE FROM timestamp_submissions"),
    /append only/,
  );
  assert.throws(
    () => store.timestampSubmission("foreign-account", p.id, input.snapshotId),
    (e) => e.status === 404,
  );
  const pendingRow = store.db
    .prepare("SELECT * FROM timestamp_submissions WHERE snapshot_id=?")
    .get(input.snapshotId);
  const completedBytes = Buffer.from(
    "synthetic completed-proof storage fixture; not a blockchain proof",
  );
  const completion = {
    snapshotId: input.snapshotId,
    payloadSha256: input.payloadSha256,
    proofBase64: completedBytes.toString("base64"),
    proofSha256: hash(completedBytes),
    originalPendingProofSha256: input.proofSha256,
    bitcoinHeights: [900001],
    anchors: [
      {
        height: 900001,
        blockHash: "1".repeat(64),
        merkleRoot: "2".repeat(64),
        transactionId: "3".repeat(64),
        blockTime: "2026-01-02T03:04:05.000Z",
      },
    ],
    completedAt: "2026-01-03T03:04:05.000Z",
    checkedAt: "2026-01-03T03:05:05.000Z",
    verificationMethod: "public-explorer-cross-check",
    verificationSource: "https://blockstream.info/",
    status: "bitcoin-proof-complete",
    bitcoinVerified: false,
    localNodeVerified: false,
  };
  assert.throws(() =>
    store.recordTimestampCompletion(user.id, p.id, input.snapshotId, {
      ...completion,
      localNodeVerified: true,
    }),
  );
  assert.throws(() =>
    store.recordTimestampCompletion(user.id, p.id, input.snapshotId, {
      ...completion,
      bitcoinHeights: [900002],
    }),
  );
  const completed = store.recordTimestampCompletion(
    user.id,
    p.id,
    input.snapshotId,
    completion,
  );
  assert.equal(completed.status, "bitcoin-proof-complete");
  assert.equal(completed.bitcoinVerified, false);
  assert.equal(completed.localNodeVerified, false);
  assert.deepEqual(
    store.recordTimestampCompletion(
      user.id,
      p.id,
      input.snapshotId,
      completion,
    ),
    completed,
  );
  assert.deepEqual(
    store.db
      .prepare("SELECT * FROM timestamp_submissions WHERE snapshot_id=?")
      .get(input.snapshotId),
    pendingRow,
  );
  assert.equal(
    store.timestampSubmission(user.id, p.id, input.snapshotId).proofSha256,
    input.proofSha256,
  );
  assert.equal(
    store.timestampPreparation(user.id, p.id, input.snapshotId).status,
    "bitcoin-proof-complete",
  );
  assert.equal(
    store.snapshots(user.id, p.id)[0].timestampStatus,
    "bitcoin-proof-complete",
  );
  assert.ok(
    !store.db
      .prepare("SELECT data FROM timestamp_completions")
      .get()
      .data.includes("public-explorer"),
  );
  assert.throws(
    () => store.db.exec("UPDATE timestamp_completions SET data=data"),
    /append only/,
  );
  assert.throws(
    () => store.db.exec("DELETE FROM timestamp_completions"),
    /append only/,
  );
  assert.throws(
    () => store.timestampCompletion("foreign-account", p.id, input.snapshotId),
    (e) => e.status === 404,
  );
});

test("idea saves create encrypted immutable snapshots in the same transaction", async (t) => {
  const { store, user, project } = await fixture(t);
  const p = record(store, user, project);
  const [first] = store.snapshots(user.id, p.id);
  assert.equal(first.revision, p.revision);
  assert.equal(first.timestampStatus, "not-submitted");
  const saved = store.readSnapshot(user.id, p.id, first.id);
  assert.equal(verifyPackage(saved).records, 1);
  assert.equal(saved.package.project.pending, undefined);
  assert.equal(
    store.preserve(user.id, p.id, p.revision).commitment,
    first.commitment,
  );
  assert.equal(store.snapshots(user.id, p.id).length, 1);
  assert.ok(
    !store.db
      .prepare("SELECT data FROM snapshots")
      .get()
      .data.includes("Private synthetic"),
  );
  assert.throws(
    () => store.db.prepare("UPDATE snapshots SET revision=99").run(),
    /append only/,
  );
  assert.throws(
    () => store.db.prepare("DELETE FROM snapshots").run(),
    /append only/,
  );
});

test("later revisions link to earlier packages without changing their content or identity", async (t) => {
  const { store, user, project } = await fixture(t);
  let p = record(store, user, project);
  const [first] = store.snapshots(user.id, p.id);
  const before = canonical(store.readSnapshot(user.id, p.id, first.id));
  p = record(store, user, p, "A revised synthetic concept");
  const [second] = store.snapshots(user.id, p.id);
  assert.equal(second.previous, first.commitment);
  assert.equal(canonical(store.readSnapshot(user.id, p.id, first.id)), before);
  assert.equal(
    verifyPackage(store.readSnapshot(user.id, p.id, second.id)).records,
    2,
  );
  assert.throws(
    () => store.preserve(user.id, p.id, first.revision),
    (e) => e.status === 409,
  );
});

test("failed snapshot writes roll back the entire content save", async (t) => {
  const { store, user, project } = await fixture(t);
  store.db.exec(
    "CREATE TRIGGER fail_snapshot BEFORE INSERT ON snapshots BEGIN SELECT RAISE(ABORT, 'synthetic disk failure'); END;",
  );
  assert.throws(() => record(store, user, project), /synthetic disk failure/);
  assert.equal(store.project(user.id, project.id).revision, project.revision);
  assert.equal(store.project(user.id, project.id).ideas.length, 0);
  assert.equal(store.events(user.id, project.id).length, 1);
});

test("fingerprint preparation is content-free, randomized, deterministic for a saved package, and makes zero network calls", async (t) => {
  const { store, user, project } = await fixture(t);
  const p = record(store, user, project);
  const [s] = store.snapshots(user.id, p.id);
  const oldFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("Unexpected network call");
  };
  t.after(() => {
    globalThis.fetch = oldFetch;
  });
  const prep = store.timestampPreparation(user.id, p.id, s.id);
  assert.match(prep.payload, /^origin-studio-evidence-v1:[a-f0-9]{64}\n$/);
  assert.equal(prep.status, "not-submitted");
  assert.equal(prep.payloadSha256, hash(prep.payload));
  assert.equal(
    prep.payload,
    store.timestampPreparation(user.id, p.id, s.id).payload,
  );
  assert.ok(!prep.payload.includes(user.username));
  assert.ok(!prep.payload.includes(p.id));
  const pkg = store.readSnapshot(user.id, p.id, s.id).package;
  assert.notEqual(
    createSnapshot(pkg).commitment,
    createSnapshot(pkg).commitment,
  );
});

test("tampering with idea, project metadata, events, nonce, or preserved manifest fails verification", async (t) => {
  const { store, user, project } = await fixture(t);
  const p = record(store, user, project);
  const s = store.preserve(user.id, p.id, p.revision);
  for (const alter of [
    (x) => {
      x.package.project.ideas[0].content += " changed";
    },
    (x) => {
      x.package.project.title += " changed";
    },
    (x) => {
      x.package.events[0].at = "invented earlier time";
    },
    (x) => {
      x.nonce = "0".repeat(64);
    },
    (x) => {
      x.manifest.createdAt = "invented earlier time";
    },
    (x) => {
      x.manifest.previous = "f".repeat(64);
    },
  ]) {
    const changed = structuredClone(s);
    alter(changed);
    assert.throws(() => verifyPackage(changed), /integrity failed/);
    assert.throws(() => timestampPayload(changed));
  }
  assert.equal(verifyPackage(s).externalTimestamp, "not-verified");
});

test("snapshots cannot be read, preserved, or prepared across accounts or projects", async (t) => {
  const { store, user, project } = await fixture(t);
  const p = record(store, user, project);
  const [s] = store.snapshots(user.id, p.id);
  const other = await store.register({
    username: "another-test",
    name: "Other",
    password: "Other synthetic password!",
  });
  const otherProject = store.create(user.id, { title: "Different project" });
  for (const op of [
    () => store.snapshots(other.id, p.id),
    () => store.readSnapshot(other.id, p.id, s.id),
    () => store.preserve(other.id, p.id, p.revision),
    () => store.timestampPreparation(other.id, p.id, s.id),
    () => store.readSnapshot(user.id, otherProject.id, s.id),
  ])
    assert.throws(op, (e) => e.status === 404);
});

test("existing projects can be preserved without rewriting original receipts; snapshots survive restart", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "origin-preservation-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const key = randomBytes(32),
    path = join(dir, "store.sqlite");
  let store = new Store(path, key);
  const user = await store.register({
    username: "migration-test",
    name: "Synthetic",
    password: "Synthetic migration password!",
  });
  const project = store.create(user.id, { title: "Existing project" });
  const prior = canonical(store.project(user.id, project.id));
  const saved = store.preserve(user.id, project.id, project.revision);
  assert.equal(canonical(store.project(user.id, project.id)), prior);
  store.close();
  store = new Store(path, key);
  t.after(() => store.close());
  assert.equal(
    canonical(store.readSnapshot(user.id, project.id, saved.manifest.id)),
    canonical(saved),
  );
  assert.equal(canonical(store.project(user.id, project.id)), prior);
});

test("preservation HTTP routes require owner session and CSRF on writes", async (t) => {
  const { store, user, project } = await fixture(t);
  const server = createServer({ store });
  t.after(() => {
    server.close();
    server.closeAllConnections();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const base = `${origin}/api/projects/${project.id}`;
  const session = store.session(user.id);
  const headers = {
    Cookie: `origin_session=${session.raw}`,
    Origin: origin,
    "Content-Type": "application/json",
    "X-CSRF-Token": session.csrf,
  };
  assert.equal((await fetch(base + "/snapshots")).status, 401);
  assert.equal(
    (
      await fetch(base + "/preserve", {
        method: "POST",
        headers: { ...headers, "X-CSRF-Token": "wrong" },
        body: JSON.stringify({ revision: project.revision }),
      })
    ).status,
    403,
  );
  const result = await fetch(base + "/preserve", {
    method: "POST",
    headers,
    body: JSON.stringify({ revision: project.revision }),
  });
  assert.equal(result.status, 200);
  const saved = await result.json();
  const pendingBytes = Buffer.from("synthetic pending HTTP receipt");
  store.recordTimestampSubmission(user.id, project.id, saved.manifest.id, {
    snapshotId: saved.manifest.id,
    payloadSha256: hash(timestampPayload(saved)),
    proofBase64: pendingBytes.toString("base64"),
    proofSha256: hash(pendingBytes),
    pendingCalendars: ["https://bob.btc.calendar.opentimestamps.org"],
    recordedAt: "2026-01-01T00:00:00.000Z",
    status: "pending-bitcoin-confirmation",
  });
  const completeBytes = Buffer.from("synthetic completed HTTP proof");
  store.recordTimestampCompletion(user.id, project.id, saved.manifest.id, {
    snapshotId: saved.manifest.id,
    payloadSha256: hash(timestampPayload(saved)),
    proofBase64: completeBytes.toString("base64"),
    proofSha256: hash(completeBytes),
    originalPendingProofSha256: hash(pendingBytes),
    bitcoinHeights: [900002],
    anchors: [
      {
        height: 900002,
        blockHash: "4".repeat(64),
        merkleRoot: "5".repeat(64),
        transactionId: "6".repeat(64),
        blockTime: "2026-01-02T00:00:00.000Z",
      },
    ],
    completedAt: "2026-01-03T00:00:00.000Z",
    checkedAt: "2026-01-03T00:01:00.000Z",
    verificationMethod: "public-explorer-cross-check",
    verificationSource: "https://blockstream.info/",
    status: "bitcoin-proof-complete",
    bitcoinVerified: false,
    localNodeVerified: false,
  });
  const again = await fetch(base + `/snapshot?snapshot=${saved.manifest.id}`, {
    headers,
  });
  assert.deepEqual(await again.json(), saved);
  assert.equal(again.headers.get("cache-control"), "no-store");
  const prep = await fetch(
    base + `/timestamp-preparation?snapshot=${saved.manifest.id}`,
    { headers },
  );
  assert.equal((await prep.json()).status, "bitcoin-proof-complete");
  const completion = await fetch(
    base + `/timestamp-completion-receipt?snapshot=${saved.manifest.id}`,
    { headers },
  );
  assert.equal(completion.status, 200);
  assert.equal((await completion.json()).proofSha256, hash(completeBytes));
  assert.equal(completion.headers.get("cache-control"), "no-store");
  assert.equal(
    (
      await fetch(
        base + `/timestamp-completion-receipt?snapshot=${saved.manifest.id}`,
      )
    ).status,
    401,
  );
  assert.equal(
    (await fetch(base + "/snapshots", { method: "POST", headers, body: "{}" }))
      .status,
    405,
  );
});
