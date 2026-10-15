import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  statSync,
  chmodSync,
  symlinkSync,
  openSync,
  ftruncateSync,
  closeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Store } from "../server/store.mjs";
import { hash, seal } from "../server/crypto.mjs";
import { timestampPayload } from "../server/evidence.mjs";
import {
  createBackup,
  restoreBackup,
  generateRecoveryKey,
  INCOMPLETE,
} from "../server/recovery.mjs";

const password = "Synthetic-recovery-test-only-42!";
async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "origin-recovery-test-"));
  const dataDirectory = join(root, "source"),
    keys = join(root, "keys"),
    archives = join(root, "archives");
  for (const dir of [dataDirectory, keys, archives])
    mkdirSync(dir, { mode: 0o700 });
  const master = randomBytes(32),
    masterKeyFile = join(dataDirectory, "master.key");
  writeFileSync(masterKeyFile, master, { mode: 0o600 });
  const recoveryKeyFile = join(keys, "recovery.key"),
    archiveFile = join(archives, "backup.enc");
  generateRecoveryKey(recoveryKeyFile);
  const store = new Store(join(dataDirectory, "vault.sqlite"), master);
  t.after(() => {
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  store.db.exec("PRAGMA wal_autocheckpoint=0");
  const user = await store.register({
    username: "recovery-user",
    name: "Synthetic recovery owner",
    password,
  });
  let project = store.create(user.id, { title: "RECOVERY_PRIVATE_SENTINEL" });
  project = store.action(user.id, project.id, {
    revision: project.revision,
    action: "idea.record",
    title: "Synthetic idea",
    content: "SYNTHETIC_PRIVATE_SOURCE",
    origin: "human",
  });
  const snapshot = store.preserve(user.id, project.id, project.revision);
  const proof = Buffer.from(
    "Synthetic storage fixture; not a valid blockchain proof",
  );
  store.recordTimestampSubmission(user.id, project.id, snapshot.manifest.id, {
    snapshotId: snapshot.manifest.id,
    payloadSha256: hash(timestampPayload(snapshot)),
    proofBase64: proof.toString("base64"),
    proofSha256: hash(proof),
    pendingCalendars: ["https://alice.btc.calendar.opentimestamps.org"],
    recordedAt: new Date().toISOString(),
    status: "pending-bitcoin-confirmation",
  });
  const completedProof = Buffer.from(
    "Synthetic completed storage fixture; not a valid blockchain proof",
  );
  store.recordTimestampCompletion(user.id, project.id, snapshot.manifest.id, {
    snapshotId: snapshot.manifest.id,
    payloadSha256: hash(timestampPayload(snapshot)),
    proofBase64: completedProof.toString("base64"),
    proofSha256: hash(completedProof),
    originalPendingProofSha256: hash(proof),
    bitcoinHeights: [900003],
    anchors: [
      {
        height: 900003,
        blockHash: "7".repeat(64),
        merkleRoot: "8".repeat(64),
        transactionId: "9".repeat(64),
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
  });
  const session = store.session(user.id);
  const options = {
    dataDirectory,
    masterKeyFile,
    recoveryKeyFile,
    archiveFile,
  };
  const destination = join(root, "restored");
  const restore = (overrides = {}) =>
    restoreBackup({ archiveFile, recoveryKeyFile, destination, ...overrides });
  return {
    root,
    store,
    user,
    project,
    snapshot,
    session,
    master,
    options,
    destination,
    restore,
  };
}
test("encrypted backup includes live WAL data; restore preserves evidence and invalidates sessions and approvals", async (t) => {
  const f = await fixture(t);
  const otherUser = await f.store.register({
    username: "other-recovery",
    name: "Other synthetic owner",
    password,
  });
  const otherSession = f.store.session(otherUser.id);
  const untouchedProject = f.store.create(otherUser.id, {
    title: "Another account's synthetic project",
  });
  const managedIdentity = {
    issuer: "https://issuer.example/pool",
    subject: "recovery-managed-subject",
    email: "managed-recovery@example.invalid",
    emailVerified: true,
    name: "Managed recovery person",
    identityKey: hash("https://issuer.example/pool\0recovery-managed-subject"),
  };
  const managedUser = f.store.managedAccount(managedIdentity);
  f.store.linkBillingCustomer(managedUser.id, "cus_recovery_123456", "test");
  const billingEvent = {
    id: "evt_recovery_123456",
    created: Math.floor(Date.now() / 1000),
    type: "customer.subscription.updated",
    dataHash: hash("synthetic billing event"),
  };
  f.store.applyBillingEvent(billingEvent, {
    uid: managedUser.id,
    subscriptionId: "sub_recovery_123456",
    customerId: "cus_recovery_123456",
    priceId: "price_recovery_123456",
    tier: "builder",
    status: "active",
    currentPeriodEnd: billingEvent.created + 86400,
    cancelAtPeriodEnd: false,
    eventCreated: billingEvent.created,
    eventId: billingEvent.id,
  });
  f.store.beginCheckout(
    managedUser.id,
    "synthetic-interrupted-checkout",
    "builder",
  );
  assert.equal(f.store.billingEntitlement(managedUser.id).entitled, true);
  const managedProject = f.store.create(managedUser.id, {
    title: "Managed account recovery project",
  });
  f.store.mutate(
    f.user.id,
    f.project.id,
    f.project.revision,
    "test.pending",
    {},
    (p) => {
      p.pending = { syntheticApproval: true };
      p.disclosures.push({ id: "synthetic-inflight", status: "attempted" });
    },
  );
  f.store.useBudget(f.user.id, 20);
  f.store.reserveSpend(
    {
      id: "synthetic-recovery-reservation",
      uid: f.user.id,
      projectId: f.project.id,
      period: "2026-10",
      provider: "synthetic-provider",
      model: "synthetic-model",
      catalogVersion: "synthetic-v1",
      reservedMicroUsd: 12_345,
    },
    100_000,
    1_000_000,
  );
  f.store.markSpendUnknown("synthetic-recovery-reservation", f.user.id);
  const oldProject = f.store.project(f.user.id, f.project.id);
  const originalEvents = f.store.db
    .prepare("SELECT * FROM events WHERE project_id=? ORDER BY seq")
    .all(f.project.id);
  const originalSnapshots = f.store.db.prepare("SELECT * FROM snapshots").all();
  const originalProofs = f.store.db
    .prepare("SELECT * FROM timestamp_submissions")
    .all();
  const originalCompletions = f.store.db
    .prepare("SELECT * FROM timestamp_completions")
    .all();
  const originalSpend = f.store.db
    .prepare("SELECT * FROM spend_reservations")
    .all();
  const dbHash = hash(
    readFileSync(join(f.options.dataDirectory, "vault.sqlite")),
  );
  const walHash = hash(
    readFileSync(join(f.options.dataDirectory, "vault.sqlite-wal")),
  );
  const result = await createBackup(f.options);
  assert.equal(result.ok, true);
  assert.equal(result.snapshots, 1);
  assert.equal(
    hash(readFileSync(join(f.options.dataDirectory, "vault.sqlite"))),
    dbHash,
  );
  assert.equal(
    hash(readFileSync(join(f.options.dataDirectory, "vault.sqlite-wal"))),
    walHash,
  );
  assert.deepEqual(f.store.project(f.user.id, f.project.id), oldProject);
  assert.ok(f.store.auth(f.session.raw));
  const archive = readFileSync(f.options.archiveFile, "utf8");
  for (const secret of [
    "SYNTHETIC_PRIVATE_SOURCE",
    "recovery-user",
    f.master.toString("hex"),
    f.session.raw,
    managedIdentity.subject,
    managedIdentity.email,
  ])
    assert.ok(!archive.includes(secret));
  const restored = f.restore();
  assert.equal(restored.sessionsInvalidated, 2);
  assert.equal(restored.approvalsInvalidated, 1);
  assert.equal(restored.uncertainRequests, 1);
  assert.equal(existsSync(join(f.destination, INCOMPLETE)), false);
  assert.equal(statSync(f.destination).mode & 0o777, 0o700);
  for (const path of [
    f.options.archiveFile,
    f.options.recoveryKeyFile,
    join(f.destination, "master.key"),
    join(f.destination, "vault.sqlite"),
  ])
    assert.equal(statSync(path).mode & 0o777, 0o600);
  const copy = new Store(
    join(f.destination, "vault.sqlite"),
    readFileSync(join(f.destination, "master.key")),
  );
  try {
    assert.equal(copy.auth(f.session.raw), null);
    assert.equal(copy.auth(otherSession.raw), null);
    assert.deepEqual(
      copy.project(otherUser.id, untouchedProject.id),
      untouchedProject,
    );
    assert.equal(copy.managedAccount(managedIdentity).id, managedUser.id);
    assert.deepEqual(
      copy.billingCustomer(managedUser.id),
      f.store.billingCustomer(managedUser.id),
    );
    assert.deepEqual(
      copy.billingEvent(billingEvent.id),
      f.store.billingEvent(billingEvent.id),
    );
    assert.equal(copy.billingEntitlement(managedUser.id).entitled, false);
    assert.equal(
      copy.billingEntitlement(managedUser.id).status,
      "reconciliation-required",
    );
    assert.equal(copy.checkout(managedUser.id).status, "outcome-unknown");
    assert.equal(f.store.billingEntitlement(managedUser.id).entitled, true);
    assert.deepEqual(
      copy.project(managedUser.id, managedProject.id),
      managedProject,
    );
    assert.equal(
      (await copy.login({ username: f.user.username, password })).id,
      f.user.id,
    );
    assert.equal(copy.usage(f.user.id), 1);
    assert.deepEqual(
      copy.db.prepare("SELECT * FROM spend_reservations").all(),
      originalSpend,
    );
    assert.deepEqual(
      copy.db
        .prepare(
          "SELECT * FROM events WHERE project_id=? AND seq<=? ORDER BY seq",
        )
        .all(f.project.id, oldProject.revision),
      originalEvents,
    );
    assert.deepEqual(
      copy.db.prepare("SELECT * FROM snapshots").all(),
      originalSnapshots,
    );
    assert.deepEqual(
      copy.db.prepare("SELECT * FROM timestamp_submissions").all(),
      originalProofs,
    );
    assert.deepEqual(
      copy.db.prepare("SELECT * FROM timestamp_completions").all(),
      originalCompletions,
    );
    assert.deepEqual(
      copy.readSnapshot(f.user.id, f.project.id, f.snapshot.manifest.id),
      f.snapshot,
    );
    const recovered = copy.project(f.user.id, f.project.id);
    assert.equal(recovered.pending, null);
    assert.equal(recovered.disclosures[0].status, "outcome-unknown");
    assert.equal(recovered.revision, oldProject.revision + 1);
    assert.equal(
      copy.events(f.user.id, f.project.id).at(-1).type,
      "recovery.restored",
    );
    assert.equal(copy.verify(f.user.id, f.project.id).ok, true);
  } finally {
    copy.close();
  }
});
test("wrong recovery key, truncation, and ciphertext tampering fail before a destination is created", async (t) => {
  const f = await fixture(t);
  await createBackup(f.options);
  const wrong = join(dirname(f.options.recoveryKeyFile), "wrong.key");
  generateRecoveryKey(wrong);
  assert.throws(
    () => f.restore({ recoveryKeyFile: wrong }),
    /authentication failed/,
  );
  assert.equal(existsSync(f.destination), false);
  const original = readFileSync(f.options.archiveFile, "utf8");
  const box = JSON.parse(original);
  const bytes = Buffer.from(box.data, "base64");
  bytes[15] ^= 1;
  box.data = bytes.toString("base64");
  const shortTag = JSON.parse(original);
  shortTag.tag = Buffer.from(shortTag.tag, "base64")
    .subarray(0, 4)
    .toString("base64");
  for (const damaged of [
    JSON.stringify(box),
    original.slice(0, -20),
    JSON.stringify(shortTag),
  ]) {
    writeFileSync(f.options.archiveFile, damaged);
    assert.throws(() => f.restore(), /authentication failed/);
    assert.equal(existsSync(f.destination), false);
  }
});

test("restore cancels a timestamp approval even without a pending AI approval", async (t) => {
  const f = await fixture(t);
  f.store.mutate(
    f.user.id,
    f.project.id,
    f.project.revision,
    "test.timestamp",
    {},
    (p) => {
      p.timestampApproval = {
        id: "synthetic-approval",
        approvalToken: "synthetic-only",
      };
      p.timestampResults = [
        { id: "preserved-synthetic-marker", status: "unverified" },
      ];
    },
  );
  await createBackup(f.options);
  assert.equal(f.restore().approvalsInvalidated, 1);
  const copy = new Store(
    join(f.destination, "vault.sqlite"),
    readFileSync(join(f.destination, "master.key")),
  );
  try {
    const restored = copy.project(f.user.id, f.project.id);
    assert.equal(restored.timestampApproval, null);
    assert.deepEqual(restored.timestampResults, [
      { id: "preserved-synthetic-marker", status: "unverified" },
    ]);
  } finally {
    copy.close();
  }
});
test("backup rejects a wrong master key and corrupted source evidence without producing an archive", async (t) => {
  const f = await fixture(t);
  writeFileSync(f.options.masterKeyFile, randomBytes(32));
  await assert.rejects(createBackup(f.options));
  assert.equal(existsSync(f.options.archiveFile), false);
  writeFileSync(f.options.masterKeyFile, f.master);
  f.store.db
    .prepare("UPDATE projects SET data=? WHERE id=?")
    .run("damaged", f.project.id);
  await assert.rejects(createBackup(f.options));
  assert.equal(existsSync(f.options.archiveFile), false);
});
test("existing files, directories, symlinks and co-located recovery keys are not overwritten", async (t) => {
  const f = await fixture(t);
  await createBackup(f.options);
  const original = readFileSync(f.options.archiveFile);
  await assert.rejects(createBackup(f.options), /already exists/);
  assert.deepEqual(readFileSync(f.options.archiveFile), original);
  mkdirSync(f.destination, { mode: 0o700 });
  writeFileSync(join(f.destination, "sentinel"), "keep");
  assert.throws(() => f.restore(), /already exists/);
  assert.equal(readFileSync(join(f.destination, "sentinel"), "utf8"), "keep");
  const linked = join(f.root, "linked");
  symlinkSync(f.destination, linked);
  assert.throws(() => f.restore({ destination: linked }), /already exists/);
  const colocated = join(dirname(f.options.archiveFile), "recovery.key");
  writeFileSync(colocated, readFileSync(f.options.recoveryKeyFile), {
    mode: 0o600,
  });
  assert.throws(
    () =>
      f.restore({
        destination: join(f.root, "new"),
        recoveryKeyFile: colocated,
      }),
    /outside/,
  );
  const keyBefore = readFileSync(f.options.recoveryKeyFile);
  assert.throws(
    () => generateRecoveryKey(f.options.recoveryKeyFile),
    /already exists/,
  );
  assert.deepEqual(readFileSync(f.options.recoveryKeyFile), keyBefore);
});
test("recovery rejects exposed keys, linked keys and reuse of the master key", async (t) => {
  const f = await fixture(t);
  chmodSync(f.options.recoveryKeyFile, 0o644);
  await assert.rejects(createBackup(f.options), /owner-only/);
  chmodSync(f.options.recoveryKeyFile, 0o600);
  const link = join(dirname(f.options.recoveryKeyFile), "linked.key");
  symlinkSync(f.options.recoveryKeyFile, link);
  await assert.rejects(createBackup({ ...f.options, recoveryKeyFile: link }));
  writeFileSync(f.options.recoveryKeyFile, f.master);
  await assert.rejects(createBackup(f.options), /separate recovery key/);
  assert.equal(existsSync(f.options.archiveFile), false);
});
test("authenticated but malformed database payloads fail closed and remove only the new restore", async (t) => {
  const f = await fixture(t);
  const key = readFileSync(f.options.recoveryKeyFile),
    data = Buffer.from("not sqlite");
  for (const payload of [
    { schema: "unsupported" },
    {
      schema: "origin-recovery/1",
      database: data.toString("base64"),
      databaseSha256: hash(data),
      masterKey: f.master.toString("hex"),
    },
    {
      schema: "origin-recovery/1",
      database: data.toString("base64"),
      databaseSha256: "wrong",
      masterKey: f.master.toString("hex"),
    },
  ]) {
    writeFileSync(
      f.options.archiveFile,
      seal(key, payload, "origin-recovery-archive-v1"),
      { mode: 0o600 },
    );
    assert.throws(() => f.restore());
    assert.equal(existsSync(f.destination), false);
  }
  assert.equal(f.store.verify(f.user.id, f.project.id).ok, true);
});
test("CLI round trip stays offline and prints no key values; server rejects incomplete restores", async (t) => {
  const f = await fixture(t);
  const cli = (...args) =>
    spawnSync(process.execPath, ["scripts/recovery.mjs", ...args], {
      encoding: "utf8",
    });
  const backup = cli(
    "backup",
    "--data",
    f.options.dataDirectory,
    "--master-key",
    f.options.masterKeyFile,
    "--recovery-key",
    f.options.recoveryKeyFile,
    "--archive",
    f.options.archiveFile,
  );
  assert.equal(backup.status, 0, backup.stderr);
  assert.equal(JSON.parse(backup.stdout).ok, true);
  const restored = cli(
    "restore",
    "--archive",
    f.options.archiveFile,
    "--recovery-key",
    f.options.recoveryKeyFile,
    "--destination",
    f.destination,
  );
  assert.equal(restored.status, 0, restored.stderr);
  for (const output of [
    backup.stdout,
    backup.stderr,
    restored.stdout,
    restored.stderr,
  ]) {
    assert.ok(!output.includes(f.master.toString("hex")));
    assert.ok(!output.includes("SYNTHETIC_PRIVATE_SOURCE"));
  }
  writeFileSync(
    join(f.destination, INCOMPLETE),
    "synthetic interrupted restore",
  );
  const start = spawnSync(process.execPath, ["server/http.mjs"], {
    env: { ...process.env, ORIGIN_DATA_DIR: f.destination },
    encoding: "utf8",
    timeout: 5000,
  });
  assert.notEqual(start.status, 0);
  assert.match(start.stderr, /restore is incomplete/);
});

test("an archive with missing or unknown tables cannot be silently migrated into an empty vault", async (t) => {
  const f = await fixture(t);
  const file = join(f.root, "unsupported.sqlite"),
    db = new DatabaseSync(file);
  db.exec("CREATE TABLE unrelated(value TEXT)");
  db.close();
  const bytes = readFileSync(file);
  const archive = seal(
    readFileSync(f.options.recoveryKeyFile),
    {
      schema: "origin-recovery/1",
      masterKey: f.master.toString("hex"),
      database: bytes.toString("base64"),
      databaseSha256: hash(bytes),
    },
    "origin-recovery-archive-v1",
  );
  writeFileSync(f.options.archiveFile, archive, { mode: 0o600 });
  assert.throws(() => f.restore(), /Unsupported database schema/);
  assert.equal(existsSync(f.destination), false);
});

test("oversized archives and unsafe directories fail before decrypting or creating a restore", async (t) => {
  const f = await fixture(t);
  const fd = openSync(f.options.archiveFile, "wx", 0o600);
  try {
    ftruncateSync(fd, 121 * 1024 * 1024);
  } finally {
    closeSync(fd);
  }
  assert.throws(() => f.restore(), /size limit/);
  assert.equal(existsSync(f.destination), false);
  chmodSync(dirname(f.options.recoveryKeyFile), 0o755);
  await assert.rejects(
    createBackup({
      ...f.options,
      archiveFile: join(dirname(f.options.archiveFile), "new.enc"),
    }),
    /owner-only directory/,
  );
});

test("an incomplete restore cannot be used as a backup source", async (t) => {
  const f = await fixture(t);
  writeFileSync(
    join(f.options.dataDirectory, INCOMPLETE),
    "synthetic incomplete restore",
  );
  await assert.rejects(createBackup(f.options), /incomplete restore/);
  assert.equal(existsSync(f.options.archiveFile), false);
});
