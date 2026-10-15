import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Store, calculateFinancialScenario } from "../server/store.mjs";
import { SKILLS } from "../server/skills.mjs";
import { ProviderTestGateway as Gateway } from "./provider-gateway.mjs";

async function fixture(t) {
  const store = new Store(":memory:", randomBytes(32));
  t.after(() => store.close());
  const user = await store.register({
    username: "business-owner",
    name: "Synthetic Business Owner",
    password: "Synthetic-business-password-42!",
  });
  const project = store.createFromIdea(user.id, {
    title: "Synthetic service idea",
    content: "A private synthetic idea used only for business workflow tests.",
    origin: "human",
  });
  return { store, user, project };
}

const saveProfile = (store, user, project, extra = {}) =>
  store.action(user.id, project.id, {
    action: "business.profile.save",
    revision: project.revision,
    name: "Synthetic Studio",
    stage: "discovery",
    summary: "A test-only business profile.",
    targetCustomers: "Synthetic operators",
    knownFacts: "One interview was recorded in the fixture.",
    assumptions: "Operators may pay for the service.",
    constraints: "No real customer or market data.",
    origin: "human",
    ...extra,
  });

test("business profile and records are attributed, versioned and preserved", async (t) => {
  const { store, user } = await fixture(t);
  let project = store.list(user.id)[0];
  project = store.project(user.id, project.id);
  project = saveProfile(store, user, project);
  const firstProfile = structuredClone(project.business.profile.versions[0]);
  project = saveProfile(store, user, project, {
    stage: "validation",
    assumptions: "A price test is still required.",
    origin: "ai-assisted",
  });
  assert.equal(project.business.profile.versions.length, 2);
  assert.equal(
    project.business.profile.versions[0].content,
    firstProfile.content,
  );
  assert.equal(
    project.business.profile.versions[1].receipt.manifest.previous,
    firstProfile.receipt.commitment,
  );
  assert.equal(
    project.business.profile.versions[1].receipt.manifest.origin,
    "ai-assisted",
  );

  project = store.action(user.id, project.id, {
    action: "business.record.save",
    revision: project.revision,
    type: "assumption",
    title: "Willingness to pay",
    classification: "unverified-assumption",
    status: "testing",
    statement: "Synthetic operators may pay 20 USD per month.",
    evidence: "No completed price test.",
    outcome: "",
    measure: "Three of five interviews accept a price test.",
    owner: "Fixture owner",
    dueDate: "2026-11-01",
    origin: "human",
  });
  const record = project.business.records[0];
  assert.equal(record.versions.length, 1);
  assert.equal(record.versions[0].classification, "unverified-assumption");
  const snapshots = store.snapshots(user.id, project.id);
  assert.equal(snapshots[0].revision, project.revision);
  assert.equal(store.verify(user.id, project.id).ok, true);

  const before = structuredClone(project.business);
  assert.throws(() =>
    store.action(user.id, project.id, {
      action: "business.record.save",
      revision: project.revision,
      id: record.id,
      type: "metric",
      title: "Changed type",
      classification: "estimate",
      status: "open",
      statement: "This should fail.",
    }),
  );
  assert.deepEqual(store.project(user.id, project.id).business, before);
});

test("financial scenarios use deterministic decimal arithmetic and retain versions", async (t) => {
  assert.deepEqual(
    calculateFinancialScenario({
      currency: "usd",
      pricePerUnit: "25.00",
      unitsPerMonth: "100",
      variableCostPerUnit: "5.50",
      fixedMonthlyCost: "1200.00",
    }),
    {
      currency: "USD",
      inputs: {
        pricePerUnit: "25.00",
        unitsPerMonth: "100",
        variableCostPerUnit: "5.50",
        fixedMonthlyCost: "1200.00",
      },
      outputs: {
        monthlyRevenue: "2500.00",
        monthlyVariableCost: "550.00",
        monthlyContribution: "1950.00",
        monthlyOperatingResult: "750.00",
        contributionMarginPercent: "78.00",
        breakEvenUnits: "62",
      },
    },
  );
  assert.equal(
    calculateFinancialScenario({
      currency: "USD",
      pricePerUnit: "5.00",
      unitsPerMonth: "1",
      variableCostPerUnit: "7.00",
      fixedMonthlyCost: "1.00",
    }).outputs.contributionMarginPercent,
    "-40.00",
  );
  assert.throws(() =>
    calculateFinancialScenario({
      currency: "USD",
      pricePerUnit: "1.999",
      unitsPerMonth: "10",
      variableCostPerUnit: "0",
      fixedMonthlyCost: "0",
    }),
  );

  const { store, user, project: initial } = await fixture(t);
  let project = store.action(user.id, initial.id, {
    action: "business.scenario.save",
    revision: initial.revision,
    title: "Base case",
    classification: "estimate",
    currency: "USD",
    pricePerUnit: "25",
    unitsPerMonth: "100",
    variableCostPerUnit: "5.50",
    fixedMonthlyCost: "1200",
    notes: "All inputs are synthetic estimates.",
    origin: "human",
  });
  const id = project.business.scenarios[0].id;
  project = store.action(user.id, project.id, {
    action: "business.scenario.save",
    revision: project.revision,
    id,
    title: "Base case",
    classification: "unverified-assumption",
    currency: "USD",
    pricePerUnit: "30",
    unitsPerMonth: "100",
    variableCostPerUnit: "5.50",
    fixedMonthlyCost: "1200",
    notes: "Updated synthetic price assumption.",
    origin: "human",
  });
  assert.equal(project.business.scenarios[0].versions.length, 2);
  assert.equal(
    project.business.scenarios[0].versions[1].outputs.monthlyRevenue,
    "3000.00",
  );
  assert.equal(store.verify(user.id, project.id).ok, true);
});

test("business records are opt-in model context and retained in disclosure review", async (t) => {
  const { store, user, project: initial } = await fixture(t);
  let project = saveProfile(store, user, initial);
  project = store.action(user.id, project.id, {
    action: "business.record.save",
    revision: project.revision,
    type: "decision",
    title: "Pilot scope",
    classification: "decision",
    status: "decided",
    statement: "Use a five-person synthetic pilot.",
    evidence: "Owner decision for the fixture.",
    outcome: "",
    measure: "Five participants maximum.",
    owner: "Fixture owner",
    dueDate: "",
    origin: "human",
  });
  const gateway = new Gateway(store, {
    env: {
      ORIGIN_EXTERNAL_AI: "1",
      ORIGIN_OPENAI_KEY: "synthetic-only",
      ORIGIN_OPENAI_MODEL: "fixture",
    },
    fetcher: () => {
      throw new Error("review must not contact the provider");
    },
  });
  const base = {
    revision: project.revision,
    threadId: project.threads[0].id,
    provider: "openai",
    model: "fixture",
    mode: "research",
    content: "Prepare a customer brief.",
    artifactIds: [],
    includeHistory: false,
    skillId: "customer-discovery",
  };
  const privateReview = gateway.prepare(user.id, project.id, {
    ...base,
    businessIds: [],
  });
  assert.equal(privateReview.preview.businessContext.length, 0);
  assert.ok(
    !JSON.stringify(privateReview.preview.request).includes("five-person"),
  );

  const reviewed = gateway.prepare(user.id, project.id, {
    ...base,
    revision: privateReview.project.revision,
    businessIds: ["profile", `record:${project.business.records[0].id}`],
  });
  const payload = JSON.stringify(reviewed.preview.request);
  assert.ok(payload.includes("Synthetic Studio"));
  assert.ok(payload.includes("five-person synthetic pilot"));
  assert.equal(reviewed.preview.businessContext.length, 2);
  assert.equal(reviewed.preview.skill.id, "customer-discovery");
});

test("business-development skills are versioned prompt routines without tools", () => {
  const ids = SKILLS.map((skill) => skill.id);
  assert.equal(SKILLS.length, 8);
  for (const id of [
    "customer-discovery",
    "validate-idea",
    "business-model",
    "financial-scenarios",
    "execution-planner",
  ])
    assert.ok(ids.includes(id));
  assert.ok(SKILLS.every((skill) => skill.version === "1"));
  assert.match(
    SKILLS.find((skill) => skill.id === "financial-scenarios").instructions,
    /without changing their inputs|invented values/,
  );
});
