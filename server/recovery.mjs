import { backup, DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { hash, seal, unseal } from "./crypto.mjs";
import { Store, ensure } from "./store.mjs";

const CONTEXT = "origin-recovery-archive-v1";
const MAX_DATABASE = 64 * 1024 * 1024;
const MAX_ARCHIVE = 120 * 1024 * 1024;
export const INCOMPLETE = ".restore-incomplete";

function lstatExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function privateDirectory(path) {
  const actual = realpathSync(resolve(path));
  const stat = lstatSync(actual);
  ensure(
    stat.isDirectory() && !(stat.mode & 0o077) && stat.uid === process.getuid(),
    "Use an owner-only directory (mode 0700).",
  );
  return actual;
}
function newPath(path) {
  ensure(
    typeof path === "string" && path.length > 0,
    "An explicit destination is required.",
  );
  const full = join(privateDirectory(dirname(resolve(path))), basename(path));
  try {
    lstatSync(full);
  } catch (error) {
    if (error.code === "ENOENT") return full;
    throw error;
  }
  throw new Error("Destination already exists; nothing was overwritten.");
}
function readPrivate(path, limit) {
  privateDirectory(dirname(resolve(path)));
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    ensure(
      stat.isFile() &&
        stat.nlink === 1 &&
        stat.uid === process.getuid() &&
        !(stat.mode & 0o077),
      "Use a private, owner-only regular file (mode 0600), not a link.",
    );
    ensure(
      stat.size > 0 && stat.size <= limit,
      "Recovery file is empty or exceeds the size limit.",
    );
    const bytes = readFileSync(fd);
    ensure(bytes.length <= limit, "Recovery file exceeds the size limit.");
    return bytes;
  } finally {
    closeSync(fd);
  }
}
function keyAt(path) {
  const key = readPrivate(path, 32);
  ensure(key.length === 32, "Use a 32-byte binary key file.");
  return key;
}
function encodedBytes(value, length) {
  if (typeof value !== "string") return false;
  const bytes = Buffer.from(value, "base64");
  return bytes.length === length && bytes.toString("base64") === value;
}
function syncDirectory(path) {
  const fd = openSync(path, constants.O_RDONLY);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function writeNew(path, bytes) {
  const fd = openSync(path, "wx", 0o600);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } catch (error) {
    unlinkSync(path);
    throw error;
  } finally {
    closeSync(fd);
  }
  syncDirectory(dirname(path));
}
function separateKey(keyFile, ...directories) {
  const key = realpathSync(keyFile);
  for (const directory of directories) {
    ensure(
      !key.startsWith(`${directory}${sep}`),
      "Keep the recovery key outside the data and archive directories.",
    );
  }
}
function verifyStore(store) {
  const checks = store.db.prepare("PRAGMA integrity_check").all();
  ensure(
    checks.length === 1 && checks[0].integrity_check === "ok",
    "Database integrity check failed.",
  );
  ensure(
    !store.db.prepare("PRAGMA foreign_key_check").all().length,
    "Database references failed verification.",
  );
  let users = 0,
    projects = 0,
    snapshots = 0;
  for (const { id } of store.db.prepare("SELECT id FROM users").all()) {
    store.user(id);
    users++;
  }
  for (const row of store.db.prepare("SELECT id,user_id FROM projects").all()) {
    store.verify(row.user_id, row.id);
    snapshots += store.snapshots(row.user_id, row.id).length;
    projects++;
  }
  return { users, projects, snapshots };
}
function checkSchema(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((row) => row.name);
    ensure(
      JSON.stringify(tables) ===
        JSON.stringify([
          "billing_checkouts",
          "billing_customers",
          "billing_events",
          "billing_subscriptions",
          "events",
          "managed_identities",
          "projects",
          "sessions",
          "snapshots",
          "spend_reservations",
          "timestamp_completions",
          "timestamp_submissions",
          "usage",
          "users",
        ]),
      "Unsupported database schema; use the matching application version.",
    );
  } finally {
    db.close();
  }
}
export function generateRecoveryKey(destination) {
  writeNew(newPath(destination), randomBytes(32));
  return { ok: true, keyCreated: true };
}

export async function createBackup({
  dataDirectory,
  masterKeyFile,
  recoveryKeyFile,
  archiveFile,
}) {
  const sourceDirectory = privateDirectory(dataDirectory);
  ensure(
    !lstatExists(join(sourceDirectory, INCOMPLETE)),
    "Cannot back up an incomplete restore.",
  );
  const destination = newPath(archiveFile);
  separateKey(recoveryKeyFile, sourceDirectory, dirname(destination));
  const recoveryKey = keyAt(recoveryKeyFile);
  const masterKey = keyAt(masterKeyFile);
  ensure(
    !masterKey.equals(recoveryKey),
    "Use a separate recovery key, not the master key.",
  );
  const sourcePath = join(sourceDirectory, "vault.sqlite");
  const stat = lstatSync(sourcePath);
  ensure(
    stat.isFile() && stat.nlink === 1 && stat.size <= MAX_DATABASE,
    "Use a regular database within the 64 MiB recovery limit.",
  );
  const temp = mkdtempSync(join(tmpdir(), "origin-recovery-"));
  let source, snapshot;
  try {
    const snapshotPath = join(temp, "vault.sqlite");
    // The SQLite backup API includes committed WAL pages; a main-file copy does not.
    source = new DatabaseSync(sourcePath, { readOnly: true, timeout: 5000 });
    await backup(source, snapshotPath);
    source.close();
    source = null;
    ensure(
      lstatSync(snapshotPath).size <= MAX_DATABASE,
      "Snapshot exceeds the 64 MiB recovery limit.",
    );
    checkSchema(snapshotPath);
    snapshot = new Store(snapshotPath, masterKey);
    const counts = verifyStore(snapshot);
    snapshot.close();
    snapshot = null;
    const database = readPrivate(snapshotPath, MAX_DATABASE);
    const createdAt = new Date().toISOString();
    const archive = seal(
      recoveryKey,
      {
        schema: "origin-recovery/1",
        createdAt,
        database: database.toString("base64"),
        databaseSha256: hash(database),
        masterKey: masterKey.toString("hex"),
      },
      CONTEXT,
    );
    ensure(
      Buffer.byteLength(archive) <= MAX_ARCHIVE,
      "Encrypted archive exceeds the recovery size limit.",
    );
    writeNew(destination, archive);
    return {
      ok: true,
      schema: "origin-recovery/1",
      createdAt,
      archiveSha256: hash(archive),
      ...counts,
    };
  } finally {
    snapshot?.close();
    source?.close();
    masterKey.fill(0);
    recoveryKey.fill(0);
    rmSync(temp, { recursive: true, force: true });
  }
}

export function restoreBackup({ archiveFile, recoveryKeyFile, destination }) {
  const target = newPath(destination);
  separateKey(recoveryKeyFile, dirname(realpathSync(archiveFile)), target);
  const archive = readPrivate(archiveFile, MAX_ARCHIVE);
  const key = keyAt(recoveryKeyFile);
  let payload;
  try {
    const box = JSON.parse(archive.toString("utf8"));
    ensure(
      box &&
        box.v === 1 &&
        encodedBytes(box.iv, 12) &&
        encodedBytes(box.tag, 16) &&
        typeof box.data === "string" &&
        box.data.length > 0 &&
        Buffer.from(box.data, "base64").toString("base64") === box.data,
      "Malformed archive encryption envelope.",
    );
    payload = unseal(key, archive.toString("utf8"), CONTEXT);
  } catch {
    throw new Error(
      "Archive authentication failed: wrong recovery key or damaged archive.",
    );
  } finally {
    key.fill(0);
  }
  ensure(
    payload?.schema === "origin-recovery/1" &&
      /^[0-9a-f]{64}$/.test(payload.masterKey) &&
      typeof payload.database === "string" &&
      payload.database.length <= Math.ceil(MAX_DATABASE / 3) * 4,
    "Unsupported or malformed recovery archive.",
  );
  const database = Buffer.from(payload.database, "base64");
  ensure(
    database.length > 0 &&
      database.length <= MAX_DATABASE &&
      database.toString("base64") === payload.database &&
      hash(database) === payload.databaseSha256,
    "Database payload verification failed.",
  );
  const masterKey = Buffer.from(payload.masterKey, "hex");
  let store,
    created = false,
    complete = false;
  try {
    mkdirSync(target, { mode: 0o700 });
    created = true;
    // A crash leaves a marker that prevents the normal server from opening this copy.
    writeNew(
      join(target, INCOMPLETE),
      "Restore has not completed. Do not start this copy.\n",
    );
    writeNew(join(target, "vault.sqlite"), database);
    writeNew(join(target, "master.key"), masterKey);
    checkSchema(join(target, "vault.sqlite"));
    store = new Store(join(target, "vault.sqlite"), masterKey);
    const counts = verifyStore(store);
    const sessionsInvalidated = Number(
      store.db.prepare("DELETE FROM sessions").run().changes,
    );
    // An old archive cannot establish current subscription access. A fresh
    // provider reconciliation is required before these records can grant access.
    store.db
      .prepare("UPDATE billing_subscriptions SET updated_at=?")
      .run("1970-01-01T00:00:00.000Z");
    store.db
      .prepare(
        "UPDATE billing_checkouts SET status='outcome-unknown' WHERE status='pending'",
      )
      .run();
    let approvalsInvalidated = 0,
      uncertainRequests = 0;
    for (const row of store.db
      .prepare("SELECT id,user_id FROM projects")
      .all()) {
      const project = store.project(row.user_id, row.id);
      if (
        !project.pending &&
        !project.timestampApproval &&
        !project.disclosures.some((d) => d.status === "attempted")
      )
        continue;
      // Append a recovery event; earlier receipts, snapshots and proofs stay exact.
      store.mutate(
        row.user_id,
        row.id,
        project.revision,
        "recovery.restored",
        {
          archiveSha256: hash(archive),
        },
        (p) => {
          if (p.pending) approvalsInvalidated++;
          p.pending = null;
          if (p.timestampApproval) {
            approvalsInvalidated++;
            p.timestampApproval = null;
          }
          for (const disclosure of p.disclosures)
            if (disclosure.status === "attempted") {
              disclosure.status = "outcome-unknown";
              disclosure.reason = "backup-restore";
              uncertainRequests++;
            }
        },
      );
    }
    verifyStore(store);
    store.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    store.close();
    store = null;
    const fd = openSync(join(target, "vault.sqlite"), constants.O_RDONLY);
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    unlinkSync(join(target, INCOMPLETE));
    syncDirectory(target);
    syncDirectory(dirname(target));
    complete = true;
    return {
      ok: true,
      restoredAt: new Date().toISOString(),
      archiveSha256: hash(archive),
      ...counts,
      sessionsInvalidated,
      approvalsInvalidated,
      uncertainRequests,
    };
  } finally {
    store?.close();
    masterKey.fill(0);
    if (created && !complete) rmSync(target, { recursive: true, force: true });
  }
}
