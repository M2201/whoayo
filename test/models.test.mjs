import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Store } from "../server/store.mjs";
import {
  providerConfig,
  SYSTEM,
  secretFindings,
} from "../server/gateway.mjs";
import { ProviderTestGateway as Gateway } from "./provider-gateway.mjs";
import { verifyPackage } from "../scripts/verify-package.mjs";

const config = (provider, extra = {}) => ({
  ORIGIN_EXTERNAL_AI: "1",
  [`ORIGIN_${provider.toUpperCase()}_KEY`]: "synthetic-not-a-credential",
  [`ORIGIN_${provider.toUpperCase()}_MODELS`]:
    '["fixture-small","fixture-large"]',
  [`ORIGIN_${provider.toUpperCase()}_POLICY_REVIEWED`]: "1",
  ...extra,
});
async function fixture(t) {
  const store = new Store(":memory:", randomBytes(32));
  t.after(() => store.close());
  const user = await store.register({
    username: "model-test",
    name: "Synthetic tester",
    password: "Synthetic model testing 123!",
  });
  const project = store.create(user.id, {
    title: "Synthetic model selection",
    description: "Offline only",
  });
  return { store, user, project };
}
function prepare(gateway, user, project, provider, extra = {}) {
  return gateway.prepare(user.id, project.id, {
    revision: project.revision,
    threadId: project.threads[0].id,
    provider,
    model: "fixture-large",
    mode: "build",
    artifactIds: [],
    includeHistory: false,
    content: "A synthetic notebook design.",
    ...extra,
  });
}
const approve = (prepared) => ({
  revision: prepared.project.revision,
  approvalToken: prepared.preview.approvalToken,
  digest: prepared.preview.digest,
  approved: true,
});
const chatResponse = (extra = {}) => ({
  model: "fixture-returned-version",
  choices: [
    {
      message: { role: "assistant", content: "Synthetic answer." },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 25, completion_tokens: 8 },
  ...extra,
});

test("catalog supports four providers, exact multi-model lists and legacy single-model configuration", () => {
  const list = providerConfig({
    ...config("openai"),
    ORIGIN_OPENAI_MODELS: '["a","b","a"]',
    ORIGIN_ANTHROPIC_KEY: "synthetic",
    ORIGIN_ANTHROPIC_MODEL: "legacy",
  });
  assert.deepEqual(
    list.map((p) => p.id),
    ["openai", "anthropic", "gemini", "kimi"],
  );
  assert.deepEqual(list[0].models, ["a", "b"]);
  assert.deepEqual(list[1].models, ["legacy"]);
  assert.equal(list[2].enabled, false);
});

for (const models of [
  "not-json",
  "{}",
  '["okay",null]',
  '["../?bad"]',
  '["okay", ""]',
  JSON.stringify(Array(65).fill("m")),
]) {
  test(`invalid model configuration fails closed (${models.slice(0, 18)})`, () => {
    const provider = providerConfig(
      config("openai", { ORIGIN_OPENAI_MODELS: models }),
    )[0];
    assert.equal(provider.enabled, false);
    assert.equal(provider.disabledReason, "Invalid model configuration");
    assert.deepEqual(provider.models, []);
  });
}
test("explicit empty catalog revokes legacy model instead of silently falling back", () => {
  const p = providerConfig(
    config("openai", {
      ORIGIN_OPENAI_MODELS: "[]",
      ORIGIN_OPENAI_MODEL: "old",
    }),
  )[0];
  assert.equal(p.enabled, false);
  assert.deepEqual(p.models, []);
});

test("a credential pasted into the model list is not exposed through the catalog", () => {
  const gateway = new Gateway(null, {
    env: config("openai", {
      ORIGIN_OPENAI_MODELS: JSON.stringify([`sk-${"x".repeat(30)}`]),
    }),
  });
  assert.deepEqual(gateway.catalog()[0].models, []);
  assert.equal(gateway.catalog()[0].enabled, false);
  assert.ok(!JSON.stringify(gateway.catalog()).includes("x".repeat(30)));
});

for (const provider of ["openai", "anthropic", "gemini", "kimi"]) {
  test(`${provider}: unknown model and missing explicit multi-model selection make zero calls`, async (t) => {
    const { store, user, project } = await fixture(t);
    let calls = 0;
    const gateway = new Gateway(store, {
      env: config(provider),
      fetcher: () => {
        calls++;
      },
    });
    for (const model of ["unlisted", undefined, "", {}, null])
      assert.throws(
        () => prepare(gateway, user, project, provider, { model }),
        /Choose an enabled model/,
      );
    assert.equal(calls, 0);
    assert.equal(store.project(user.id, project.id).revision, project.revision);
    const catalog = JSON.stringify(gateway.catalog());
    assert.ok(!catalog.includes("synthetic-not-a-credential"));
    assert.ok(
      gateway.catalog().every((p) => !("key" in p) && !("endpoint" in p)),
    );
  });
  test(`${provider}: global and provider disable switches prevent preparation without sending`, async (t) => {
    const { store, user, project } = await fixture(t);
    for (const extra of [
      { ORIGIN_EXTERNAL_AI: "0" },
      { [`ORIGIN_${provider.toUpperCase()}_ENABLED`]: "0" },
      { [`ORIGIN_${provider.toUpperCase()}_KEY`]: "" },
    ]) {
      const gateway = new Gateway(store, {
        env: config(provider, extra),
        fetcher: () => assert.fail("unexpected network call"),
      });
      assert.throws(
        () => prepare(gateway, user, project, provider),
        /Connect and enable/,
      );
    }
  });
}

for (const provider of ["gemini", "kimi"]) {
  test(`${provider}: policy review is a separate enablement prerequisite`, () => {
    const p = providerConfig(
      config(provider, {
        [`ORIGIN_${provider.toUpperCase()}_POLICY_REVIEWED`]: "0",
      }),
    ).find((p) => p.id === provider);
    assert.equal(p.enabled, false);
    assert.equal(p.disabledReason, "Data-policy review required");
  });
  test(`${provider}: reviewed request, model attribution, usage and immutable evidence round-trip`, async (t) => {
    const { store, user, project } = await fixture(t);
    let calls = 0,
      sent;
    const gateway = new Gateway(store, {
      env: config(provider),
      fetcher: async (url, options) => {
        calls++;
        assert.equal(
          url,
          provider === "gemini"
            ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
            : "https://api.moonshot.ai/v1/chat/completions",
        );
        assert.equal(options.redirect, "error");
        assert.equal(
          options.headers.Authorization,
          "Bearer synthetic-not-a-credential",
        );
        assert.ok(!url.includes("credential"));
        sent = JSON.parse(options.body);
        assert.equal(sent.model, "fixture-large");
        assert.equal(sent.max_completion_tokens, 4096);
        assert.equal(sent.messages[0].content, SYSTEM);
        assert.equal(sent.messages.length, 2);
        assert.ok(!sent.tools && !sent.tool_choice);
        assert.equal(
          store.project(user.id, project.id).disclosures.at(-1).status,
          "attempted",
        );
        return new Response(JSON.stringify(chatResponse()));
      },
    });
    const prepared = prepare(gateway, user, project, provider);
    assert.equal(calls, 0);
    assert.equal(prepared.preview.model, "fixture-large");
    const result = await gateway.send(user.id, project.id, approve(prepared));
    assert.deepEqual(sent, prepared.preview.request);
    assert.equal(calls, 1);
    assert.equal(result.disclosures.at(-1).model, "fixture-large");
    assert.equal(
      result.disclosures.at(-1).returnedModel,
      "fixture-returned-version",
    );
    assert.deepEqual(result.disclosures.at(-1).usage, {
      inputTokens: 25,
      outputTokens: 8,
    });
    assert.equal(
      result.threads[0].messages.at(-1).model,
      "fixture-returned-version",
    );
    assert.ok(verifyPackage(store.export(user.id, project.id)).records >= 2);
    await assert.rejects(
      gateway.send(user.id, project.id, approve(prepared)),
      /approval expired or changed/,
    );
    assert.equal(calls, 1);
  });
}

test("removing a model after review prevents the send without consuming budget", async (t) => {
  const { store, user, project } = await fixture(t);
  const gateway = new Gateway(store, {
    env: config("openai"),
    fetcher: () => assert.fail("network call"),
  });
  const prepared = prepare(gateway, user, project, "openai");
  gateway.providers[0].models = ["fixture-small"];
  await assert.rejects(
    gateway.send(user.id, project.id, approve(prepared)),
    /configuration changed/,
  );
  assert.equal(store.usage(user.id), 0);
});

test("model selection remains tenant-scoped", async (t) => {
  const { store, user, project } = await fixture(t);
  const other = await store.register({
    username: "another-account",
    name: "Synthetic other",
    password: "Synthetic testing 123!",
  });
  const gateway = new Gateway(store, {
    env: config("gemini"),
    fetcher: () => assert.fail("network call"),
  });
  const prepared = prepare(gateway, user, project, "gemini");
  assert.throws(
    () => prepare(gateway, other, project, "gemini"),
    (error) => error.status === 404,
  );
  await assert.rejects(
    gateway.send(other.id, project.id, approve(prepared)),
    (error) => error.status === 404,
  );
});

for (const [name, response] of [
  ["rate limit", () => new Response("{}", { status: 429 })],
  ["invalid JSON", () => new Response("invalid")],
  [
    "empty output",
    () => new Response(JSON.stringify(chatResponse({ choices: [] }))),
  ],
  [
    "tool request",
    () =>
      new Response(
        JSON.stringify(
          chatResponse({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "ignored",
                  tool_calls: [{ id: "tool" }],
                },
              },
            ],
          }),
        ),
      ),
  ],
  [
    "invalid usage",
    () =>
      new Response(
        JSON.stringify(chatResponse({ usage: { prompt_tokens: -1 } })),
      ),
  ],
  [
    "invalid model",
    () => new Response(JSON.stringify(chatResponse({ model: {} }))),
  ],
  [
    "timeout",
    () => {
      throw new DOMException("deadline", "TimeoutError");
    },
  ],
]) {
  test(`chat adapter ${name}: retains draft evidence, records uncertain outcome, no retry or fallback`, async (t) => {
    const { store, user, project } = await fixture(t);
    let calls = 0;
    const gateway = new Gateway(store, {
      env: { ...config("kimi"), ...config("gemini") },
      fetcher: async () => {
        calls++;
        return response();
      },
    });
    const prepared = prepare(gateway, user, project, "gemini");
    await assert.rejects(
      gateway.send(user.id, project.id, approve(prepared)),
      /No automatic retry/,
    );
    assert.equal(calls, 1);
    const after = store.project(user.id, project.id);
    assert.equal(after.disclosures.at(-1).status, "outcome-unknown");
    assert.equal(
      after.threads[0].messages.at(-1).content,
      "A synthetic notebook design.",
    );
    assert.equal(after.threads[0].messages.length, 1);
    assert.equal(gateway.inflight.size, 0);
  });
}

test("truncated responses are labeled, not silently treated as complete", async (t) => {
  const { store, user, project } = await fixture(t);
  const gateway = new Gateway(store, {
    env: config("kimi"),
    fetcher: async () =>
      new Response(
        JSON.stringify(
          chatResponse({
            choices: [
              {
                message: { role: "assistant", content: "Partial response" },
                finish_reason: "length",
              },
            ],
          }),
        ),
      ),
  });
  const result = await gateway.send(
    user.id,
    project.id,
    approve(prepare(gateway, user, project, "kimi")),
  );
  assert.equal(result.threads[0].messages.at(-1).truncated, true);
  assert.equal(result.disclosures.at(-1).finishReason, "length");
});

test("Google credential patterns cannot be disclosed as project content", () => {
  assert.ok(secretFindings(`AIza${"x".repeat(35)}`).includes("api-key"));
});
