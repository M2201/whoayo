import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  createSnapshot,
  verifySnapshot,
  timestampPayload,
} from "./evidence.mjs";
import {
  canonical,
  hash,
  seal,
  unseal,
  token,
  receipt,
  verifyReceipt,
} from "./crypto.mjs";

const derive = promisify(scrypt);
const iso = () => new Date().toISOString();
export class InputError extends Error {
  constructor(message, status = 400, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}
export function ensure(test, message, status) {
  if (!test) throw new InputError(message, status);
}
export function str(value, max, label, empty = false) {
  ensure(
    typeof value === "string" && value.length <= max && (empty || value.trim()),
    `Check ${label}.`,
  );
  return value;
}

export const BUSINESS_RECORD_TYPES = Object.freeze([
  "assumption",
  "experiment",
  "metric",
  "decision",
  "action",
  "milestone",
]);

const BUSINESS_CLASSIFICATIONS = Object.freeze([
  "supplied-fact",
  "estimate",
  "unverified-assumption",
  "observed-result",
  "decision",
  "planned-action",
]);

const BUSINESS_STATUSES = Object.freeze([
  "open",
  "planned",
  "in-progress",
  "testing",
  "supported",
  "weakened",
  "invalidated",
  "completed",
  "blocked",
  "stopped",
  "decided",
]);

const businessState = (project) => {
  project.business ||= { profile: null, records: [], scenarios: [] };
  project.business.records ||= [];
  project.business.scenarios ||= [];
  return project.business;
};

const optionalText = (value, max, label) =>
  str(value ?? "", max, label, true).trim();

const contribution = (value) => {
  ensure(
    ["human", "ai-assisted"].includes(value),
    "Declare human or AI-assisted authorship.",
  );
  return value;
};

const financialCents = (value, label) => {
  const text = String(value ?? "").trim();
  ensure(/^\d{1,12}(?:\.\d{1,2})?$/.test(text), `Check ${label}.`);
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
};

const formatCents = (value) => {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
};

const formatBasisPoints = (value) => {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
};

export function calculateFinancialScenario(input) {
  const currency = String(input.currency ?? "USD")
    .trim()
    .toUpperCase();
  ensure(/^[A-Z]{3}$/.test(currency), "Use a three-letter currency code.");
  const unitsText = String(input.unitsPerMonth ?? "").trim();
  ensure(/^\d{1,10}$/.test(unitsText), "Check monthly units.");
  const units = BigInt(unitsText);
  const price = financialCents(input.pricePerUnit, "price per unit");
  const variable = financialCents(
    input.variableCostPerUnit,
    "variable cost per unit",
  );
  const fixed = financialCents(input.fixedMonthlyCost, "fixed monthly cost");
  const revenue = price * units;
  const variableCost = variable * units;
  const contributionValue = revenue - variableCost;
  const operatingResult = contributionValue - fixed;
  const unitContribution = price - variable;
  const breakEvenUnits =
    unitContribution > 0n
      ? (fixed + unitContribution - 1n) / unitContribution
      : null;
  const marginBasisPoints =
    revenue > 0n ? (contributionValue * 10000n) / revenue : null;
  return {
    currency,
    inputs: {
      pricePerUnit: formatCents(price),
      unitsPerMonth: units.toString(),
      variableCostPerUnit: formatCents(variable),
      fixedMonthlyCost: formatCents(fixed),
    },
    outputs: {
      monthlyRevenue: formatCents(revenue),
      monthlyVariableCost: formatCents(variableCost),
      monthlyContribution: formatCents(contributionValue),
      monthlyOperatingResult: formatCents(operatingResult),
      contributionMarginPercent:
        marginBasisPoints === null
          ? null
          : formatBasisPoints(marginBasisPoints),
      breakEvenUnits: breakEvenUnits?.toString() ?? null,
    },
  };
}
function accountText(value, max, field, label = field) {
  if (typeof value !== "string" || value.length > max || !value.trim())
    throw new InputError(`Check ${label}.`, 400, field);
  return value;
}
function validLoginName(value) {
  if (/^[a-z0-9][a-z0-9._-]{2,59}$/.test(value)) return true;
  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  const labels = domain.split(".");
  // This validates an email-shaped login ID, not ownership or deliverability.
  return (
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}$/.test(local) &&
    !local.startsWith(".") &&
    !local.endsWith(".") &&
    !local.includes("..") &&
    labels.length >= 2 &&
    labels.every((label) =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
    )
  );
}
export class Store {
  constructor(path, masterKey) {
    ensure(
      Buffer.isBuffer(masterKey) && masterKey.length === 32,
      "A 32-byte encryption key is required.",
    );
    this.masterKey = masterKey;
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db
      .exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, salt TEXT NOT NULL, password TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS managed_identities(identity_key TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL REFERENCES users(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), wrapped_key TEXT NOT NULL, data TEXT NOT NULL, revision INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS events(project_id TEXT NOT NULL REFERENCES projects(id), seq INTEGER NOT NULL, at TEXT NOT NULL, previous TEXT, data TEXT NOT NULL, hash TEXT NOT NULL, PRIMARY KEY(project_id,seq));
      CREATE TABLE IF NOT EXISTS usage(user_id TEXT NOT NULL, day TEXT NOT NULL, calls INTEGER NOT NULL, PRIMARY KEY(user_id,day));
      CREATE TABLE IF NOT EXISTS spend_reservations(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), project_id TEXT NOT NULL REFERENCES projects(id), period TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, catalog_version TEXT NOT NULL, reserved_microusd INTEGER NOT NULL, estimated_microusd INTEGER, status TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER, created_at TEXT NOT NULL, settled_at TEXT, CHECK(status IN ('reserved','estimated','outcome-unknown','released')));
      CREATE INDEX IF NOT EXISTS spend_reservations_account_period ON spend_reservations(user_id,period,status);
      CREATE INDEX IF NOT EXISTS spend_reservations_platform_period ON spend_reservations(period,status);
      CREATE TABLE IF NOT EXISTS billing_customers(user_id TEXT PRIMARY KEY REFERENCES users(id), stripe_customer_id TEXT UNIQUE NOT NULL, mode TEXT NOT NULL, created_at TEXT NOT NULL, CHECK(mode IN ('test','live')));
      CREATE TABLE IF NOT EXISTS billing_checkouts(user_id TEXT PRIMARY KEY REFERENCES users(id), request_id TEXT UNIQUE NOT NULL, tier TEXT NOT NULL, session_id TEXT UNIQUE, expires_at INTEGER, status TEXT NOT NULL, created_at TEXT NOT NULL, CHECK(status IN ('pending','open','outcome-unknown','closed')));
      CREATE TABLE IF NOT EXISTS billing_subscriptions(subscription_id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), stripe_customer_id TEXT NOT NULL, price_id TEXT NOT NULL, tier TEXT, status TEXT NOT NULL, current_period_end INTEGER, cancel_at_period_end INTEGER NOT NULL, last_event_created INTEGER NOT NULL, last_event_id TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(stripe_customer_id) REFERENCES billing_customers(stripe_customer_id));
      CREATE INDEX IF NOT EXISTS billing_subscriptions_user ON billing_subscriptions(user_id,status,last_event_created);
      CREATE TABLE IF NOT EXISTS billing_events(event_id TEXT PRIMARY KEY, event_created INTEGER NOT NULL, event_type TEXT NOT NULL, received_at TEXT NOT NULL, applied INTEGER NOT NULL, user_id TEXT REFERENCES users(id), object_id TEXT, data_hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS snapshots(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), revision INTEGER NOT NULL, data TEXT NOT NULL, UNIQUE(project_id,revision));
      CREATE TABLE IF NOT EXISTS timestamp_submissions(snapshot_id TEXT PRIMARY KEY REFERENCES snapshots(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS timestamp_completions(snapshot_id TEXT PRIMARY KEY REFERENCES timestamp_submissions(snapshot_id), data TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS immutable_timestamp_update BEFORE UPDATE ON timestamp_submissions BEGIN SELECT RAISE(ABORT, 'Timestamp submissions are append only'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_timestamp_delete BEFORE DELETE ON timestamp_submissions BEGIN SELECT RAISE(ABORT, 'Timestamp submissions are append only'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_timestamp_completion_update BEFORE UPDATE ON timestamp_completions BEGIN SELECT RAISE(ABORT, 'Timestamp completions are append only'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_timestamp_completion_delete BEFORE DELETE ON timestamp_completions BEGIN SELECT RAISE(ABORT, 'Timestamp completions are append only'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_snapshots_update BEFORE UPDATE ON snapshots BEGIN SELECT RAISE(ABORT, 'Snapshots are append only'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_snapshots_delete BEFORE DELETE ON snapshots BEGIN SELECT RAISE(ABORT, 'Snapshots are append only'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_events_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'Events are append only'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_events_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'Events are append only'); END;`);
  }
  close() {
    this.db.close();
  }
  async credentials(password, salt) {
    return derive(password, salt, 64, {
      N: 32768,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    });
  }
  async register(input) {
    const username = accountText(
      input.username,
      254,
      "username",
      "email or username",
    )
      .trim()
      .toLowerCase();
    if (!validLoginName(username))
      throw new InputError(
        "Enter an email address, or a 3-60 character username starting with a letter or number and using only letters, numbers, dots, underscores or dashes.",
        400,
        "username",
      );
    const name = accountText(input.name, 100, "name", "your name").trim();
    const password = accountText(input.password, 256, "password");
    if (password.length < 12)
      throw new InputError(
        "Use at least 12 characters for your password.",
        400,
        "password",
      );
    const salt = token(),
      id = randomUUID();
    const derived = await this.credentials(password, salt);
    try {
      this.db
        .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
        .run(
          id,
          username,
          seal(this.masterKey, name, id),
          salt,
          derived.toString("hex"),
        );
    } catch {
      throw new InputError(
        "That email or username is unavailable. Try signing in instead.",
        409,
        "username",
      );
    }
    return this.user(id);
  }
  user(id) {
    const u = this.db
      .prepare("SELECT id,username,name FROM users WHERE id=?")
      .get(id);
    ensure(u, "Sign in to continue.", 401);
    const managed = this.db
      .prepare(
        "SELECT identity_key,data FROM managed_identities WHERE user_id=?",
      )
      .get(id);
    if (managed) {
      const identity = unseal(
        this.masterKey,
        managed.data,
        `managed-identity:${managed.identity_key}:${id}`,
      );
      return {
        id: u.id,
        username: identity.email,
        name: identity.name,
        authentication: "managed",
        emailVerified: true,
      };
    }
    return {
      id: u.id,
      username: u.username,
      name: unseal(this.masterKey, u.name, u.id),
      authentication: "local",
    };
  }
  managedAccount(input) {
    const issuer = str(input?.issuer, 500, "identity issuer");
    const subject = str(input?.subject, 128, "identity subject");
    const email = str(input?.email, 254, "verified email").trim().toLowerCase();
    ensure(
      input?.emailVerified === true && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      "Managed sign-in did not provide a verified email.",
      401,
    );
    const identityKey = hash(`${issuer}\0${subject}`);
    ensure(
      input.identityKey === identityKey,
      "Managed sign-in identity did not match.",
      401,
    );
    const name = str(input.name || email, 100, "identity name").trim();
    const existing = this.db
      .prepare(
        "SELECT user_id,data FROM managed_identities WHERE identity_key=?",
      )
      .get(identityKey);
    const data = {
      issuer,
      subject,
      email,
      name,
      emailVerified: true,
    };
    if (existing) {
      const prior = unseal(
        this.masterKey,
        existing.data,
        `managed-identity:${identityKey}:${existing.user_id}`,
      );
      ensure(
        prior.issuer === issuer && prior.subject === subject,
        "Managed sign-in identity did not match.",
        401,
      );
      this.db
        .prepare("UPDATE managed_identities SET data=? WHERE identity_key=?")
        .run(
          seal(
            this.masterKey,
            data,
            `managed-identity:${identityKey}:${existing.user_id}`,
          ),
          identityKey,
        );
      return this.user(existing.user_id);
    }
    const id = randomUUID();
    const internalUsername = `managed-${identityKey.slice(0, 52)}`;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
        .run(
          id,
          internalUsername,
          seal(this.masterKey, name, id),
          token(),
          randomBytes(64).toString("hex"),
        );
      this.db
        .prepare("INSERT INTO managed_identities VALUES(?,?,?)")
        .run(
          identityKey,
          id,
          seal(this.masterKey, data, `managed-identity:${identityKey}:${id}`),
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.user(id);
  }
  async login(input) {
    const username = accountText(
      input.username,
      254,
      "username",
      "email or username",
    )
      .trim()
      .toLowerCase();
    const password = accountText(input.password, 256, "password");
    const u = this.db
      .prepare("SELECT * FROM users WHERE username=?")
      .get(username);
    const candidate = await this.credentials(password, u?.salt || "not-a-user");
    ensure(
      u && timingSafeEqual(candidate, Buffer.from(u.password, "hex")),
      "Email, username or password is incorrect.",
      401,
    );
    return this.user(u.id);
  }
  session(id) {
    this.db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    const raw = token(),
      csrf = token();
    this.db
      .prepare("INSERT INTO sessions VALUES(?,?,?,?)")
      .run(hash(raw), id, csrf, Date.now() + 8 * 3600000);
    return { raw, csrf };
  }
  auth(raw) {
    if (typeof raw !== "string" || !/^[0-9a-f]{64}$/.test(raw)) return null;
    const s = this.db
      .prepare("SELECT * FROM sessions WHERE hash=? AND expires>?")
      .get(hash(raw), Date.now());
    return s ? { user: this.user(s.user_id), csrf: s.csrf } : null;
  }
  logout(raw) {
    this.db.prepare("DELETE FROM sessions WHERE hash=?").run(hash(raw));
  }
  async revokeSessions(raw, password) {
    const session = this.auth(raw);
    ensure(session, "Sign in to continue.", 401);
    const user = this.db
      .prepare("SELECT * FROM users WHERE id=?")
      .get(session.user.id);
    const candidate = await this.credentials(
      str(password, 256, "current password"),
      user.salt,
    );
    // Authentication can change while scrypt yields to another request.
    ensure(this.auth(raw)?.user.id === user.id, "Sign in to continue.", 401);
    ensure(
      timingSafeEqual(candidate, Buffer.from(user.password, "hex")),
      "Current password is incorrect.",
      401,
    );
    return Number(
      this.db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id)
        .changes,
    );
  }
  revokeManagedSessions(raw) {
    const session = this.auth(raw);
    ensure(session, "Sign in to continue.", 401);
    ensure(
      session.user.authentication === "managed",
      "Current-password confirmation is required.",
      403,
    );
    return Number(
      this.db
        .prepare("DELETE FROM sessions WHERE user_id=?")
        .run(session.user.id).changes,
    );
  }
  row(uid, id) {
    const row = this.db
      .prepare("SELECT * FROM projects WHERE id=? AND user_id=?")
      .get(id, uid);
    ensure(row, "Project not found.", 404);
    return row;
  }
  key(row) {
    return Buffer.from(
      unseal(
        this.masterKey,
        row.wrapped_key,
        `project-key:${row.id}:${row.user_id}`,
      ),
      "hex",
    );
  }
  decode(row) {
    return unseal(this.key(row), row.data, `project:${row.id}:${row.user_id}`);
  }
  project(uid, id) {
    const row = this.row(uid, id);
    return { ...this.decode(row), revision: row.revision };
  }
  list(uid) {
    return this.db
      .prepare("SELECT * FROM projects WHERE user_id=? ORDER BY rowid DESC")
      .all(uid)
      .map((r) => {
        const p = this.decode(r);
        return {
          id: p.id,
          title: p.title,
          description: p.description,
          archived: p.archived,
          updated: p.updated,
          ideas: p.ideas.length,
          artifacts: p.artifacts.length,
          businessRecords:
            (p.business?.profile?.versions?.length ? 1 : 0) +
            (p.business?.records?.length || 0) +
            (p.business?.scenarios?.length || 0),
          sample: !!p.sample,
          folder: p.folder || "",
        };
      });
  }
  create(uid, input) {
    ensure(
      this.list(uid).length < 100,
      "This local release supports 100 projects per account.",
    );
    const id = randomUUID(),
      key = randomBytes(32);
    const state = {
      id,
      title: str(input.title, 120, "project name").trim(),
      description: str(input.description ?? "", 1200, "description", true),
      created: iso(),
      updated: iso(),
      archived: false,
      sample: input.sample === true,
      ideas: [],
      artifacts: [],
      references: [],
      business: { profile: null, records: [], scenarios: [] },
      threads: [
        { id: randomUUID(), title: "First conversation", messages: [] },
      ],
      disclosures: [],
      pending: null,
    };
    this.db
      .prepare("INSERT INTO projects VALUES(?,?,?,?,?)")
      .run(
        id,
        uid,
        seal(this.masterKey, key.toString("hex"), `project-key:${id}:${uid}`),
        seal(key, state, `project:${id}:${uid}`),
        0,
      );
    return this.mutate(uid, id, 0, "project.created", {}, () => {});
  }
  createFromIdea(uid, input) {
    // Project creation, exact idea receipt and immutable snapshot succeed together.
    this.db.exec("SAVEPOINT new_idea_project");
    try {
      const project = this.create(uid, { title: input.title });
      const recorded = this.action(uid, project.id, {
        action: "idea.record",
        title: input.title,
        content: input.content,
        origin: input.origin,
        revision: project.revision,
      });
      this.db.exec("RELEASE new_idea_project");
      return recorded;
    } catch (error) {
      this.db.exec("ROLLBACK TO new_idea_project; RELEASE new_idea_project");
      throw error;
    }
  }
  mutate(uid, id, revision, type, detail, fn) {
    this.db.exec("SAVEPOINT project_mutation");
    try {
      const row = this.row(uid, id);
      ensure(
        row.revision === revision,
        "This project changed. Refresh before saving.",
        409,
      );
      const p = this.decode(row),
        key = this.key(row);
      fn(p);
      p.updated = iso();
      ensure(
        Buffer.byteLength(canonical(p)) <= 12 * 1024 * 1024,
        "Project exceeds this local release's 12 MB limit.",
      );
      const prev = this.db
        .prepare(
          "SELECT * FROM events WHERE project_id=? ORDER BY seq DESC LIMIT 1",
        )
        .get(id);
      const event = {
        projectId: id,
        seq: (prev?.seq || 0) + 1,
        at: iso(),
        previous: prev?.hash || null,
        data: seal(
          key,
          { type, detail, stateHash: hash(canonical(p)) },
          `event:${id}:${(prev?.seq || 0) + 1}`,
        ),
      };
      const digest = hash(canonical(event));
      this.db
        .prepare("INSERT INTO events VALUES(?,?,?,?,?,?)")
        .run(id, event.seq, event.at, event.previous, event.data, digest);
      this.db
        .prepare(
          "UPDATE projects SET data=?,revision=? WHERE id=? AND user_id=?",
        )
        .run(seal(key, p, `project:${id}:${uid}`), row.revision + 1, id, uid);
      if (
        [
          "idea.record",
          "artifact.save",
          "note.add",
          "reference.add",
          "business.profile.save",
          "business.record.save",
          "business.scenario.save",
          "disclosure.attempted",
          "disclosure.completed",
          "disclosure.incomplete",
        ].includes(type)
      )
        this.preserveInTransaction(uid, id);
      this.db.exec("RELEASE project_mutation");
      return { ...p, revision: row.revision + 1 };
    } catch (e) {
      this.db.exec("ROLLBACK TO project_mutation; RELEASE project_mutation");
      throw e;
    }
  }
  action(uid, id, input) {
    const user = this.user(uid),
      kind = input.action;
    const allowed = [
      "idea.record",
      "artifact.save",
      "reference.add",
      "business.profile.save",
      "business.record.save",
      "business.scenario.save",
      "thread.create",
      "note.add",
      "project.archive",
      "project.organize",
    ];
    ensure(allowed.includes(kind), "Unknown project action.");
    return this.mutate(uid, id, input.revision, kind, {}, (p) => {
      if (kind === "project.archive") {
        p.archived = !!input.archived;
        return;
      }
      ensure(!p.archived, "Restore this project before making changes.", 409);
      if (kind === "project.organize") {
        const folder = str(input.folder, 80, "folder", true).trim();
        ensure(
          !/[\x00-\x1f\x7f]/.test(folder),
          "Use a folder name without control characters.",
        );
        p.folder = folder;
        return;
      }
      if (kind === "idea.record") {
        const content = str(input.content, 100000, "idea");
        const origin = input.origin;
        ensure(
          ["human", "ai-assisted"].includes(origin),
          "Declare human or AI-assisted authorship.",
        );
        const rec = receipt({
          projectId: id,
          recordId: randomUUID(),
          content,
          origin,
          previous: p.ideas.at(-1)?.receipt.commitment || null,
          actor: user.username,
        });
        p.ideas.push({
          id: rec.manifest.recordId,
          title: str(input.title, 160, "idea title"),
          content,
          receipt: rec,
        });
      }
      if (kind === "business.profile.save") {
        const business = businessState(p);
        const stage = String(input.stage || "idea");
        ensure(
          ["idea", "discovery", "validation", "building", "operating"].includes(
            stage,
          ),
          "Choose a business stage.",
        );
        const fields = {
          name: str(input.name, 160, "business or initiative name").trim(),
          stage,
          summary: optionalText(input.summary, 4000, "business summary"),
          targetCustomers: optionalText(
            input.targetCustomers,
            4000,
            "target customers",
          ),
          knownFacts: optionalText(input.knownFacts, 8000, "known facts"),
          assumptions: optionalText(input.assumptions, 8000, "assumptions"),
          constraints: optionalText(input.constraints, 8000, "constraints"),
        };
        const origin = contribution(input.origin || "human");
        const profile = business.profile || {
          id: randomUUID(),
          versions: [],
        };
        const content = canonical({ type: "business-profile", ...fields });
        const rec = receipt({
          projectId: id,
          recordId: randomUUID(),
          content,
          origin,
          previous: profile.versions.at(-1)?.receipt.commitment || null,
          actor: user.username,
        });
        profile.versions.push({
          id: rec.manifest.recordId,
          ...fields,
          content,
          receipt: rec,
        });
        business.profile = profile;
      }
      if (kind === "business.record.save") {
        const business = businessState(p);
        const type = String(input.type || "");
        ensure(BUSINESS_RECORD_TYPES.includes(type), "Choose a record type.");
        const classification = String(input.classification || "");
        ensure(
          BUSINESS_CLASSIFICATIONS.includes(classification),
          "Classify this as a supplied fact, estimate, assumption, result, decision or planned action.",
        );
        const status = String(input.status || "open");
        ensure(BUSINESS_STATUSES.includes(status), "Choose a record status.");
        const dueDate = optionalText(input.dueDate, 10, "due date");
        ensure(
          !dueDate || /^\d{4}-\d{2}-\d{2}$/.test(dueDate),
          "Check due date.",
        );
        const fields = {
          type,
          title: str(input.title, 200, "record title").trim(),
          classification,
          status,
          statement: str(input.statement, 12000, "record statement"),
          evidence: optionalText(input.evidence, 12000, "supporting evidence"),
          outcome: optionalText(input.outcome, 12000, "observed outcome"),
          measure: optionalText(input.measure, 2000, "measure or threshold"),
          owner: optionalText(input.owner, 200, "owner"),
          dueDate,
        };
        let record = input.id
          ? business.records.find((item) => item.id === input.id)
          : null;
        ensure(!input.id || record, "Business record not found.", 404);
        ensure(
          !record || record.type === type,
          "Record type cannot be changed.",
        );
        if (!record) {
          record = { id: randomUUID(), type, versions: [] };
          business.records.push(record);
        }
        const origin = contribution(input.origin || "human");
        const content = canonical({ type: "business-record", ...fields });
        const rec = receipt({
          projectId: id,
          recordId: randomUUID(),
          content,
          origin,
          previous: record.versions.at(-1)?.receipt.commitment || null,
          actor: user.username,
        });
        record.versions.push({
          id: rec.manifest.recordId,
          ...fields,
          content,
          receipt: rec,
        });
      }
      if (kind === "business.scenario.save") {
        const business = businessState(p);
        const calculation = calculateFinancialScenario(input);
        const fields = {
          title: str(input.title, 200, "scenario title").trim(),
          classification: (() => {
            const value = String(input.classification || "estimate");
            ensure(
              ["supplied-fact", "estimate", "unverified-assumption"].includes(
                value,
              ),
              "Classify the scenario inputs.",
            );
            return value;
          })(),
          notes: optionalText(input.notes, 8000, "scenario notes"),
          ...calculation,
        };
        let scenario = input.id
          ? business.scenarios.find((item) => item.id === input.id)
          : null;
        ensure(!input.id || scenario, "Financial scenario not found.", 404);
        if (!scenario) {
          scenario = { id: randomUUID(), versions: [] };
          business.scenarios.push(scenario);
        }
        const origin = contribution(input.origin || "human");
        const content = canonical({ type: "financial-scenario", ...fields });
        const rec = receipt({
          projectId: id,
          recordId: randomUUID(),
          content,
          origin,
          previous: scenario.versions.at(-1)?.receipt.commitment || null,
          actor: user.username,
        });
        scenario.versions.push({
          id: rec.manifest.recordId,
          ...fields,
          content,
          receipt: rec,
        });
      }
      if (kind === "artifact.save") {
        const content = str(input.content, 500000, "file content", true),
          name = str(input.name, 160, "filename");
        ensure(
          !/[\\/\x00-\x1f]/.test(name) && !name.startsWith("."),
          "Use a simple filename without folders or leading dots.",
        );
        let a = input.id ? p.artifacts.find((x) => x.id === input.id) : null;
        ensure(!input.id || a, "File not found.", 404);
        if (!a) {
          a = { id: randomUUID(), name, versions: [] };
          p.artifacts.push(a);
        }
        const source = input.messageId
          ? p.threads
              .flatMap((t) => t.messages)
              .find((m) => m.id === input.messageId && m.role === "assistant")
          : null;
        ensure(!input.messageId || source, "AI source message not found.");
        const origin =
          source ||
          a.versions.some((v) => v.receipt.manifest.origin !== "human")
            ? "ai-assisted"
            : input.origin || "human";
        ensure(
          ["human", "ai-assisted"].includes(origin),
          "Invalid contribution declaration.",
        );
        const rec = receipt({
          projectId: id,
          recordId: randomUUID(),
          content,
          origin,
          previous: a.versions.at(-1)?.receipt.commitment || null,
          actor: user.username,
        });
        a.name = name;
        a.versions.push({
          id: rec.manifest.recordId,
          content,
          receipt: rec,
          sourceMessageId: source?.id || null,
        });
      }
      if (kind === "reference.add") {
        let url;
        try {
          url = new URL(str(input.url, 2000, "reference URL"));
        } catch {
          throw new InputError("Use a valid web URL.");
        }
        ensure(
          ["https:", "http:"].includes(url.protocol) &&
            !url.username &&
            !url.password,
          "Use a web URL without embedded credentials.",
        );
        p.references.push({
          id: randomUUID(),
          title: str(input.title, 200, "reference title"),
          url: url.href,
          notes: str(input.notes ?? "", 20000, "reference notes", true),
          added: iso(),
          status: "user-supplied",
        });
      }
      if (kind === "thread.create")
        p.threads.push({
          id: randomUUID(),
          title: str(input.title, 120, "conversation title"),
          messages: [],
        });
      if (kind === "note.add") {
        const thread = p.threads.find((t) => t.id === input.threadId);
        ensure(thread, "Conversation not found.", 404);
        const content = str(input.content, 40000, "note"),
          mid = randomUUID();
        const origin = input.origin || "human";
        ensure(
          ["human", "ai-assisted"].includes(origin),
          "Invalid contribution declaration.",
        );
        const rec = receipt({
          projectId: id,
          recordId: mid,
          content,
          origin,
          actor: user.username,
        });
        thread.messages.push({
          id: mid,
          role: "user",
          content,
          created: iso(),
          local: true,
          receipt: rec,
        });
      }
      ensure(
        p.ideas.length <= 200 &&
          p.artifacts.length <= 200 &&
          p.references.length <= 200 &&
          (p.business?.records?.length || 0) <= 500 &&
          (p.business?.scenarios?.length || 0) <= 100 &&
          p.threads.length <= 100,
        "Project size limit reached.",
      );
      ensure(
        Buffer.byteLength(canonical(p)) <= 8 * 1024 * 1024,
        "Project exceeds this release's 8 MB limit.",
      );
    });
  }
  events(uid, id) {
    const row = this.row(uid, id),
      key = this.key(row);
    return this.db
      .prepare("SELECT * FROM events WHERE project_id=? ORDER BY seq")
      .all(id)
      .map((e) => ({
        seq: e.seq,
        at: e.at,
        hash: e.hash,
        previous: e.previous,
        ...unseal(key, e.data, `event:${id}:${e.seq}`),
      }));
  }
  verify(uid, id) {
    const row = this.row(uid, id),
      state = this.decode(row),
      key = this.key(row);
    const events = this.db
      .prepare("SELECT * FROM events WHERE project_id=? ORDER BY seq")
      .all(id);
    let prev = null,
      last;
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      ensure(
        e.seq === i + 1 &&
          e.previous === prev &&
          e.hash ===
            hash(
              canonical({
                projectId: id,
                seq: e.seq,
                at: e.at,
                previous: e.previous,
                data: e.data,
              }),
            ),
        "Evidence chain integrity failed.",
        409,
      );
      last = unseal(key, e.data, `event:${id}:${e.seq}`);
      prev = e.hash;
    }
    ensure(
      last?.stateHash === hash(canonical(state)) &&
        events.length === row.revision,
      "Stored project integrity failed.",
      409,
    );
    const records = [
      ...state.ideas,
      ...state.artifacts.flatMap((a) => a.versions),
      ...state.threads.flatMap((t) => t.messages).filter((m) => m.receipt),
      ...(state.business?.profile?.versions || []),
      ...(state.business?.records || []).flatMap((r) => r.versions),
      ...(state.business?.scenarios || []).flatMap((s) => s.versions),
    ];
    ensure(
      records.every((r) => verifyReceipt(r.receipt, r.content)),
      "A content receipt failed verification.",
      409,
    );
    return {
      ok: true,
      events: events.length,
      records: records.length,
      head: prev,
      checkedAt: iso(),
      anchor: "local-only",
    };
  }
  export(uid, id) {
    const integrity = this.verify(uid, id);
    const p = this.project(uid, id);
    delete p.pending;
    return {
      schema: "origin-export/1",
      exportedAt: iso(),
      project: p,
      events: this.events(uid, id),
      integrity,
    };
  }
  readSnapshot(uid, id, snapshotId) {
    const row = this.row(uid, id);
    const saved = this.db
      .prepare("SELECT * FROM snapshots WHERE id=? AND project_id=?")
      .get(snapshotId, id);
    ensure(saved, "Preserved package not found.", 404);
    const snapshot = unseal(
      this.key(row),
      saved.data,
      `snapshot:${id}:${uid}:${saved.id}:${saved.revision}`,
    );
    verifySnapshot(snapshot);
    ensure(
      snapshot.manifest.id === saved.id &&
        snapshot.manifest.projectId === id &&
        snapshot.manifest.revision === saved.revision,
      "Preserved package identity mismatch.",
      409,
    );
    return snapshot;
  }
  snapshots(uid, id) {
    this.row(uid, id);
    let previous = null;
    const records = this.db
      .prepare("SELECT id FROM snapshots WHERE project_id=? ORDER BY revision")
      .all(id)
      .map((r) => {
        const snapshot = this.readSnapshot(uid, id, r.id);
        ensure(
          snapshot.manifest.previous === previous,
          "Preserved package lineage failed.",
          409,
        );
        previous = snapshot.commitment;
        const completion = this.timestampCompletion(uid, id, r.id);
        return {
          ...snapshot.manifest,
          commitment: snapshot.commitment,
          timestampStatus:
            completion?.status ||
            this.timestampSubmission(uid, id, r.id)?.status ||
            "not-submitted",
        };
      });
    return records.reverse();
  }
  preserveInTransaction(uid, id) {
    const row = this.row(uid, id);
    const existing = this.db
      .prepare("SELECT id FROM snapshots WHERE project_id=? AND revision=?")
      .get(id, row.revision);
    if (existing) return this.readSnapshot(uid, id, existing.id);
    const last = this.db
      .prepare(
        "SELECT id FROM snapshots WHERE project_id=? ORDER BY revision DESC LIMIT 1",
      )
      .get(id);
    const previous = last
      ? this.readSnapshot(uid, id, last.id).commitment
      : null;
    const snapshot = createSnapshot(this.export(uid, id), previous);
    this.db
      .prepare("INSERT INTO snapshots VALUES(?,?,?,?)")
      .run(
        snapshot.manifest.id,
        id,
        row.revision,
        seal(
          this.key(row),
          snapshot,
          `snapshot:${id}:${uid}:${snapshot.manifest.id}:${row.revision}`,
        ),
      );
    return snapshot;
  }
  preserve(uid, id, revision) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      ensure(
        this.row(uid, id).revision === revision,
        "This project changed. Refresh before preserving.",
        409,
      );
      const snapshot = this.preserveInTransaction(uid, id);
      this.db.exec("COMMIT");
      return snapshot;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  timestampPreparation(uid, id, snapshotId) {
    const snapshot = this.readSnapshot(uid, id, snapshotId);
    const payload = timestampPayload(snapshot);
    const submission = this.timestampSubmission(uid, id, snapshotId);
    const completion = this.timestampCompletion(uid, id, snapshotId);
    return {
      snapshotId,
      revision: snapshot.manifest.revision,
      status: completion?.status || submission?.status || "not-submitted",
      submission: submission
        ? {
            recordedAt: submission.recordedAt,
            calendars: submission.pendingCalendars,
            proofSha256: submission.proofSha256,
          }
        : null,
      completion: completion
        ? {
            completedAt: completion.completedAt,
            proofSha256: completion.proofSha256,
            bitcoinHeights: completion.bitcoinHeights,
            earliestBlockTime: completion.earliestBlockTime,
            verificationMethod: completion.verificationMethod,
            verificationSource: completion.verificationSource,
            checkedAt: completion.checkedAt,
            localNodeVerified: completion.localNodeVerified,
            anchors: completion.anchors,
          }
        : null,
      filename: `origin-fingerprint-${snapshotId}.txt`,
      payload,
      payloadSha256: hash(payload),
      destination: "https://opentimestamps.org/",
      network: "Bitcoin via OpenTimestamps calendars",
      feeUsd: 0,
      disclosure:
        "Only the fingerprint file is intended for timestamping. Keep the JSON package and nonce private.",
    };
  }
  timestampSubmission(uid, id, snapshotId) {
    const row = this.row(uid, id);
    this.readSnapshot(uid, id, snapshotId);
    const receipt = this.db
      .prepare("SELECT data FROM timestamp_submissions WHERE snapshot_id=?")
      .get(snapshotId);
    if (!receipt) return null;
    const result = unseal(
      this.key(row),
      receipt.data,
      `timestamp:${id}:${uid}:${snapshotId}`,
    );
    ensure(
      result.snapshotId === snapshotId &&
        result.status === "pending-bitcoin-confirmation",
      "Invalid timestamp submission state.",
      409,
    );
    ensure(
      hash(Buffer.from(result.proofBase64, "base64")) === result.proofSha256,
      "Timestamp proof integrity failed.",
      409,
    );
    return result;
  }
  timestampCompletion(uid, id, snapshotId) {
    const row = this.row(uid, id);
    this.readSnapshot(uid, id, snapshotId);
    const saved = this.db
      .prepare("SELECT data FROM timestamp_completions WHERE snapshot_id=?")
      .get(snapshotId);
    if (!saved) return null;
    const result = unseal(
      this.key(row),
      saved.data,
      `timestamp-completion:${id}:${uid}:${snapshotId}`,
    );
    ensure(
      result.snapshotId === snapshotId &&
        result.status === "bitcoin-proof-complete" &&
        result.bitcoinVerified === false &&
        result.localNodeVerified === false,
      "Invalid timestamp completion state.",
      409,
    );
    ensure(
      hash(Buffer.from(result.proofBase64, "base64")) === result.proofSha256,
      "Completed timestamp proof integrity failed.",
      409,
    );
    return result;
  }
  // Local operator import only: no HTTP endpoint accepts timestamp status or proofs.
  // The official OTS parser must validate the detached proof before this import.
  recordTimestampSubmission(uid, id, snapshotId, input) {
    const snapshot = this.readSnapshot(uid, id, snapshotId);
    const expected = hash(timestampPayload(snapshot));
    const allowed = [
      "https://alice.btc.calendar.opentimestamps.org",
      "https://bob.btc.calendar.opentimestamps.org",
    ];
    ensure(
      input.status === "pending-bitcoin-confirmation" &&
        input.payloadSha256 === expected &&
        input.snapshotId === snapshotId,
      "Timestamp submission does not match this snapshot.",
      409,
    );
    ensure(
      typeof input.proofBase64 === "string" &&
        input.proofBase64.length <= 1400000 &&
        /^[A-Za-z0-9+/]+={0,2}$/.test(input.proofBase64) &&
        hash(Buffer.from(input.proofBase64, "base64")) === input.proofSha256,
      "Invalid timestamp proof.",
    );
    ensure(
      Array.isArray(input.pendingCalendars) &&
        input.pendingCalendars.length > 0 &&
        input.pendingCalendars.every((c) => allowed.includes(c)),
      "Unapproved timestamp calendar.",
    );
    ensure(
      typeof input.recordedAt === "string" &&
        Number.isFinite(Date.parse(input.recordedAt)),
      "Invalid receipt time.",
    );
    const result = {
      snapshotId,
      payloadSha256: expected,
      proofBase64: input.proofBase64,
      proofSha256: input.proofSha256,
      pendingCalendars: [...new Set(input.pendingCalendars)],
      recordedAt: input.recordedAt,
      status: "pending-bitcoin-confirmation",
      bitcoinVerified: false,
      feeUsd: 0,
    };
    const existing = this.timestampSubmission(uid, id, snapshotId);
    if (existing) {
      ensure(
        existing.proofSha256 === result.proofSha256,
        "A different proof is already recorded. Preserve both for review.",
        409,
      );
      return existing;
    }
    const row = this.row(uid, id);
    this.db
      .prepare("INSERT INTO timestamp_submissions VALUES(?,?)")
      .run(
        snapshotId,
        seal(this.key(row), result, `timestamp:${id}:${uid}:${snapshotId}`),
      );
    return result;
  }
  // Local operator import only: the official OTS parser must first confirm that
  // the completed detached proof binds the original fingerprint and contains
  // the recorded Bitcoin heights. Explorer checks are evidence, not local-node
  // consensus verification, so bitcoinVerified/localNodeVerified stay false.
  recordTimestampCompletion(uid, id, snapshotId, input) {
    const snapshot = this.readSnapshot(uid, id, snapshotId);
    const submission = this.timestampSubmission(uid, id, snapshotId);
    const expected = hash(timestampPayload(snapshot));
    const hex64 = /^[a-f0-9]{64}$/;
    ensure(
      submission,
      "The original pending receipt must be preserved first.",
      409,
    );
    ensure(
      input.status === "bitcoin-proof-complete" &&
        input.payloadSha256 === expected &&
        input.payloadSha256 === submission.payloadSha256 &&
        input.originalPendingProofSha256 === submission.proofSha256 &&
        input.snapshotId === snapshotId &&
        input.bitcoinVerified === false &&
        input.localNodeVerified === false,
      "Timestamp completion does not match the preserved submission.",
      409,
    );
    ensure(
      typeof input.proofBase64 === "string" &&
        input.proofBase64.length <= 1400000 &&
        /^[A-Za-z0-9+/]+={0,2}$/.test(input.proofBase64) &&
        hash(Buffer.from(input.proofBase64, "base64")) === input.proofSha256,
      "Invalid completed timestamp proof.",
    );
    const heights = Array.isArray(input.bitcoinHeights)
      ? [...new Set(input.bitcoinHeights)].sort((a, b) => a - b)
      : [];
    ensure(
      heights.length > 0 &&
        heights.length <= 8 &&
        heights.every((height) => Number.isInteger(height) && height > 0),
      "Completed proof requires valid Bitcoin block heights.",
    );
    ensure(
      input.verificationMethod === "public-explorer-cross-check" &&
        input.verificationSource === "https://blockstream.info/" &&
        typeof input.checkedAt === "string" &&
        Number.isFinite(Date.parse(input.checkedAt)) &&
        typeof input.completedAt === "string" &&
        Number.isFinite(Date.parse(input.completedAt)),
      "Invalid timestamp completion verification record.",
    );
    ensure(
      Array.isArray(input.anchors) && input.anchors.length === heights.length,
      "Timestamp completion anchors do not match the proof.",
    );
    const anchors = input.anchors.map((anchor) => {
      ensure(
        anchor &&
          Number.isInteger(anchor.height) &&
          heights.includes(anchor.height) &&
          hex64.test(anchor.blockHash) &&
          hex64.test(anchor.merkleRoot) &&
          hex64.test(anchor.transactionId) &&
          typeof anchor.blockTime === "string" &&
          Number.isFinite(Date.parse(anchor.blockTime)),
        "Invalid Bitcoin anchor record.",
      );
      return {
        height: anchor.height,
        blockHash: anchor.blockHash,
        merkleRoot: anchor.merkleRoot,
        transactionId: anchor.transactionId,
        blockTime: anchor.blockTime,
        blockUrl: `https://blockstream.info/block/${anchor.blockHash}`,
        transactionUrl: `https://blockstream.info/tx/${anchor.transactionId}`,
      };
    });
    ensure(
      new Set(anchors.map((anchor) => anchor.height)).size === heights.length,
      "Timestamp completion anchors must cover each Bitcoin height once.",
    );
    anchors.sort((a, b) => a.height - b.height);
    const result = {
      snapshotId,
      payloadSha256: expected,
      proofBase64: input.proofBase64,
      proofSha256: input.proofSha256,
      originalPendingProofSha256: submission.proofSha256,
      bitcoinHeights: heights,
      anchors,
      earliestBlockTime: anchors
        .map((anchor) => anchor.blockTime)
        .sort((a, b) => Date.parse(a) - Date.parse(b))[0],
      completedAt: input.completedAt,
      checkedAt: input.checkedAt,
      verificationMethod: "public-explorer-cross-check",
      verificationSource: "https://blockstream.info/",
      status: "bitcoin-proof-complete",
      bitcoinVerified: false,
      localNodeVerified: false,
      feeUsd: 0,
    };
    const existing = this.timestampCompletion(uid, id, snapshotId);
    if (existing) {
      ensure(
        existing.proofSha256 === result.proofSha256,
        "A different completed proof is already recorded. Preserve both for review.",
        409,
      );
      return existing;
    }
    const row = this.row(uid, id);
    this.db
      .prepare("INSERT INTO timestamp_completions VALUES(?,?)")
      .run(
        snapshotId,
        seal(
          this.key(row),
          result,
          `timestamp-completion:${id}:${uid}:${snapshotId}`,
        ),
      );
    return result;
  }
  useBudget(uid, limit) {
    const day = iso().slice(0, 10);
    this.db.prepare("INSERT OR IGNORE INTO usage VALUES(?,?,0)").run(uid, day);
    const result = this.db
      .prepare(
        "UPDATE usage SET calls=calls+1 WHERE user_id=? AND day=? AND calls<?",
      )
      .run(uid, day, limit);
    ensure(result.changes === 1, "Daily model request limit reached.", 429);
  }
  usage(uid) {
    return (
      this.db
        .prepare("SELECT calls FROM usage WHERE user_id=? AND day=?")
        .get(uid, iso().slice(0, 10))?.calls || 0
    );
  }
  reserveSpend(reservation, accountLimit, platformLimit) {
    const integer = (value) => Number.isSafeInteger(value) && value >= 0;
    ensure(
      reservation &&
        typeof reservation.id === "string" &&
        reservation.id.length <= 64 &&
        reservation.uid &&
        reservation.projectId &&
        /^\d{4}-\d{2}$/.test(reservation.period) &&
        typeof reservation.provider === "string" &&
        reservation.provider.length <= 160 &&
        typeof reservation.model === "string" &&
        reservation.model.length <= 160 &&
        typeof reservation.catalogVersion === "string" &&
        reservation.catalogVersion.length <= 64 &&
        integer(reservation.reservedMicroUsd) &&
        reservation.reservedMicroUsd > 0 &&
        integer(accountLimit) &&
        accountLimit > 0 &&
        integer(platformLimit) &&
        platformLimit >= accountLimit,
      "Invalid spend reservation.",
    );
    this.db.exec("BEGIN IMMEDIATE");
    try {
      ensure(
        this.db
          .prepare("SELECT 1 FROM projects WHERE id=? AND user_id=?")
          .get(reservation.projectId, reservation.uid),
        "Project not found.",
        404,
      );
      const counted = (where, ...values) =>
        this.db
          .prepare(
            `SELECT COALESCE(SUM(CASE WHEN status='estimated' THEN estimated_microusd ELSE reserved_microusd END),0) AS amount FROM spend_reservations WHERE period=? AND status!='released' ${where}`,
          )
          .get(reservation.period, ...values).amount;
      const account = counted("AND user_id=?", reservation.uid);
      const platform = counted("");
      ensure(
        account + reservation.reservedMicroUsd <= accountLimit,
        "Monthly account AI budget reached.",
        429,
      );
      ensure(
        platform + reservation.reservedMicroUsd <= platformLimit,
        "Monthly platform AI budget reached.",
        429,
      );
      this.db
        .prepare(
          "INSERT INTO spend_reservations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          reservation.id,
          reservation.uid,
          reservation.projectId,
          reservation.period,
          reservation.provider,
          reservation.model,
          reservation.catalogVersion,
          reservation.reservedMicroUsd,
          null,
          "reserved",
          null,
          null,
          iso(),
          null,
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  completeSpend(id, uid, estimatedMicroUsd, inputTokens, outputTokens) {
    ensure(
      [estimatedMicroUsd, inputTokens, outputTokens].every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      ),
      "Invalid spend reconciliation.",
    );
    const result = this.db
      .prepare(
        "UPDATE spend_reservations SET estimated_microusd=?,status='estimated',input_tokens=?,output_tokens=?,settled_at=? WHERE id=? AND user_id=? AND status='reserved'",
      )
      .run(estimatedMicroUsd, inputTokens, outputTokens, iso(), id, uid);
    ensure(
      result.changes === 1,
      "Spend reservation could not be reconciled.",
      409,
    );
  }
  markSpendUnknown(id, uid) {
    const row = this.db
      .prepare("SELECT status FROM spend_reservations WHERE id=? AND user_id=?")
      .get(id, uid);
    ensure(row, "Spend reservation not found.", 409);
    if (row.status !== "reserved") return;
    this.db
      .prepare(
        "UPDATE spend_reservations SET status='outcome-unknown',settled_at=? WHERE id=? AND user_id=? AND status='reserved'",
      )
      .run(iso(), id, uid);
  }
  releaseSpend(id, uid) {
    const result = this.db
      .prepare(
        "UPDATE spend_reservations SET status='released',settled_at=? WHERE id=? AND user_id=? AND status='reserved'",
      )
      .run(iso(), id, uid);
    ensure(
      result.changes === 1,
      "Spend reservation could not be released.",
      409,
    );
  }
  spendUsage(uid, period) {
    ensure(/^\d{4}-\d{2}$/.test(period), "Invalid spend period.");
    const query = (where, ...values) =>
      this.db
        .prepare(
          `SELECT COALESCE(SUM(CASE WHEN status='estimated' THEN estimated_microusd ELSE reserved_microusd END),0) AS amount, COALESCE(SUM(CASE WHEN status='outcome-unknown' THEN 1 ELSE 0 END),0) AS uncertain FROM spend_reservations WHERE period=? AND status!='released' ${where}`,
        )
        .get(period, ...values);
    const account = query("AND user_id=?", uid);
    const platform = query("");
    return {
      accountMicroUsd: account.amount,
      accountUncertain: account.uncertain,
      platformMicroUsd: platform.amount,
      platformUncertain: platform.uncertain,
    };
  }
  reconcileInterruptedSpend() {
    return this.db
      .prepare(
        "UPDATE spend_reservations SET status='outcome-unknown',settled_at=? WHERE status='reserved'",
      )
      .run(iso()).changes;
  }
  billingCustomer(uid) {
    const row = this.db
      .prepare(
        "SELECT stripe_customer_id,mode FROM billing_customers WHERE user_id=?",
      )
      .get(uid);
    return row ? { customerId: row.stripe_customer_id, mode: row.mode } : null;
  }
  billingHasOpenSubscription(uid) {
    return Boolean(
      this.db
        .prepare(
          "SELECT 1 FROM billing_subscriptions WHERE user_id=? AND status NOT IN ('canceled','incomplete_expired') LIMIT 1",
        )
        .get(uid),
    );
  }
  checkout(uid) {
    return this.db
      .prepare("SELECT * FROM billing_checkouts WHERE user_id=?")
      .get(uid);
  }
  beginCheckout(uid, requestId, tier) {
    const result = this.db
      .prepare(
        `
      INSERT INTO billing_checkouts(user_id,request_id,tier,status,created_at)
      VALUES(?,?,?,'pending',?)
      ON CONFLICT(user_id) DO UPDATE SET request_id=excluded.request_id,
        tier=excluded.tier,session_id=NULL,expires_at=NULL,status='pending',created_at=excluded.created_at
      WHERE billing_checkouts.status='closed'
    `,
      )
      .run(uid, requestId, tier, iso());
    ensure(
      result.changes === 1,
      "A checkout is already pending. Refresh billing status or contact support before retrying.",
      409,
    );
  }
  completeCheckout(uid, requestId, sessionId, expiresAt) {
    const result = this.db
      .prepare(
        "UPDATE billing_checkouts SET session_id=?,expires_at=?,status='open' WHERE user_id=? AND request_id=? AND status='pending'",
      )
      .run(sessionId, expiresAt, uid, requestId);
    ensure(
      result.changes === 1,
      "Checkout state changed. Refresh billing status.",
      409,
    );
  }
  markCheckoutUnknown(uid, requestId) {
    this.db
      .prepare(
        "UPDATE billing_checkouts SET status='outcome-unknown' WHERE user_id=? AND request_id=? AND status='pending'",
      )
      .run(uid, requestId);
  }
  billingUserForCustomer(customerId) {
    if (typeof customerId !== "string") return null;
    return (
      this.db
        .prepare(
          "SELECT user_id FROM billing_customers WHERE stripe_customer_id=?",
        )
        .get(customerId)?.user_id || null
    );
  }
  linkBillingCustomer(uid, customerId, mode) {
    ensure(
      /^cus_[A-Za-z0-9_]{6,200}$/.test(customerId || "") &&
        ["test", "live"].includes(mode) &&
        this.db.prepare("SELECT 1 FROM users WHERE id=?").get(uid),
      "Invalid billing customer mapping.",
    );
    const current = this.billingCustomer(uid);
    if (current) {
      ensure(
        current.customerId === customerId && current.mode === mode,
        "A different billing account is already linked.",
        409,
      );
      return current;
    }
    try {
      this.db
        .prepare("INSERT INTO billing_customers VALUES(?,?,?,?)")
        .run(uid, customerId, mode, iso());
    } catch {
      throw new InputError("Billing account mapping could not be saved.", 409);
    }
    return this.billingCustomer(uid);
  }
  billingEvent(eventId) {
    if (typeof eventId !== "string") return null;
    return this.db
      .prepare("SELECT * FROM billing_events WHERE event_id=?")
      .get(eventId);
  }
  applyBillingEvent(event, state = null) {
    ensure(
      event &&
        /^evt_[A-Za-z0-9_]{6,200}$/.test(event.id || "") &&
        Number.isSafeInteger(event.created) &&
        event.created > 0 &&
        typeof event.type === "string" &&
        event.type.length <= 120 &&
        /^[a-f0-9]{64}$/.test(event.dataHash || ""),
      "Invalid billing event.",
    );
    if (state)
      ensure(
        /^sub_[A-Za-z0-9_]{6,200}$/.test(state.subscriptionId || "") &&
          /^cus_[A-Za-z0-9_]{6,200}$/.test(state.customerId || "") &&
          /^price_[A-Za-z0-9_]{6,200}$/.test(state.priceId || "") &&
          (!state.tier ||
            /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(state.tier)) &&
          typeof state.status === "string" &&
          state.status.length <= 80 &&
          (state.currentPeriodEnd === null ||
            (Number.isSafeInteger(state.currentPeriodEnd) &&
              state.currentPeriodEnd > 0)) &&
          typeof state.cancelAtPeriodEnd === "boolean" &&
          state.eventCreated === event.created &&
          state.eventId === event.id &&
          this.billingUserForCustomer(state.customerId) === state.uid,
        "Invalid billing subscription state.",
      );
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const priorEvent = this.billingEvent(event.id);
      if (priorEvent) {
        this.db.exec("COMMIT");
        return {
          received: true,
          duplicate: true,
          applied: Boolean(priorEvent.applied),
        };
      }
      let applied = false;
      if (state) {
        const prior = this.db
          .prepare(
            "SELECT user_id,stripe_customer_id FROM billing_subscriptions WHERE subscription_id=?",
          )
          .get(state.subscriptionId);
        ensure(
          !prior ||
            (prior.user_id === state.uid &&
              prior.stripe_customer_id === state.customerId),
          "A subscription cannot move to another account.",
          409,
        );
        // The caller fetched current provider state while holding its single
        // reconciliation lock. Event timestamps/IDs are not ordering authority.
        {
          this.db
            .prepare(
              `INSERT INTO billing_subscriptions(subscription_id,user_id,stripe_customer_id,price_id,tier,status,current_period_end,cancel_at_period_end,last_event_created,last_event_id,updated_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(subscription_id) DO UPDATE SET
                 user_id=excluded.user_id,
                 stripe_customer_id=excluded.stripe_customer_id,
                 price_id=excluded.price_id,
                 tier=excluded.tier,
                 status=excluded.status,
                 current_period_end=excluded.current_period_end,
                 cancel_at_period_end=excluded.cancel_at_period_end,
                 last_event_created=excluded.last_event_created,
                 last_event_id=excluded.last_event_id,
                 updated_at=excluded.updated_at`,
            )
            .run(
              state.subscriptionId,
              state.uid,
              state.customerId,
              state.priceId,
              state.tier,
              state.status,
              state.currentPeriodEnd,
              state.cancelAtPeriodEnd ? 1 : 0,
              state.eventCreated,
              state.eventId,
              iso(),
            );
          applied = true;
          if (state.checkoutRequestId)
            this.db
              .prepare(
                "UPDATE billing_checkouts SET status='closed' WHERE user_id=? AND request_id=?",
              )
              .run(state.uid, state.checkoutRequestId);
        }
      }
      this.db
        .prepare("INSERT INTO billing_events VALUES(?,?,?,?,?,?,?,?)")
        .run(
          event.id,
          event.created,
          event.type,
          iso(),
          applied ? 1 : 0,
          state?.uid || null,
          state?.subscriptionId || null,
          event.dataHash,
        );
      this.db.exec("COMMIT");
      return { received: true, duplicate: false, applied };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  billingEntitlement(uid) {
    const customer = this.billingCustomer(uid);
    const rows = this.db
      .prepare(
        "SELECT * FROM billing_subscriptions WHERE user_id=? ORDER BY last_event_created DESC,last_event_id DESC",
      )
      .all(uid);
    const now = Math.floor(Date.now() / 1000);
    const active = rows.filter((row) =>
      ["active", "trialing"].includes(row.status),
    );
    const eligible = active.filter(
      (row) =>
        row.tier &&
        row.updated_at !== "1970-01-01T00:00:00.000Z" &&
        Number.isSafeInteger(row.current_period_end) &&
        row.current_period_end > now,
    );
    if (active.length > 1)
      return {
        entitled: false,
        conflict: true,
        status: "multiple-active-subscriptions",
        tier: null,
        priceId: null,
        customerId: customer?.customerId || null,
      };
    const row = active[0] || rows[0];
    if (!row)
      return customer
        ? {
            entitled: false,
            conflict: false,
            status: "no-subscription",
            tier: null,
            priceId: null,
            customerId: customer.customerId,
          }
        : null;
    return {
      entitled: eligible.length === 1,
      conflict: false,
      status:
        row.updated_at === "1970-01-01T00:00:00.000Z"
          ? "reconciliation-required"
          : !row.tier && active.length
            ? "unknown-price"
            : eligible.length === 1
              ? row.status
              : ["active", "trialing"].includes(row.status) &&
                  row.current_period_end <= now
                ? "period-expired"
                : row.status,
      tier: row.tier || null,
      priceId: row.price_id,
      customerId: customer?.customerId || null,
      currentPeriodEnd: row.current_period_end
        ? new Date(row.current_period_end * 1000).toISOString()
        : null,
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    };
  }
}
