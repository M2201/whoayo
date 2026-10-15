import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Store } from "../server/store.mjs";
import { hash } from "../server/crypto.mjs";
import { Gateway } from "../server/gateway.mjs";
import { Timestamps } from "../server/timestamps.mjs";
import { TimestampVerifier } from "../server/timestamp-verifier.mjs";
import { syntheticAuthority } from "./timestamp-authority.mjs";

test("synthetic invited pilot completes identity, timestamp, AI, artifact and evidence journey", async (t) => {
  const store = new Store(":memory:", randomBytes(32));
  const authority = syntheticAuthority();
  t.after(() => {
    authority.close();
    store.close();
  });
  const identity = {
    issuer: "https://issuer.example/invited-pilot",
    subject: "synthetic-pilot-subject",
    email: "pilot@example.invalid",
    emailVerified: true,
    name: "Synthetic pilot member",
    identityKey: hash(
      "https://issuer.example/invited-pilot\0synthetic-pilot-subject",
    ),
  };
  const user = store.managedAccount(identity);
  const firstDevice = store.session(user.id);
  const secondDevice = store.session(store.managedAccount(identity).id);
  assert.equal(store.auth(firstDevice.raw).user.id, user.id);
  assert.equal(store.auth(secondDevice.raw).user.id, user.id);
  assert.equal(store.auth(secondDevice.raw).user.authentication, "managed");

  const privateIdea =
    "SYNTHETIC PRIVATE PILOT IDEA. No customer or production data.";
  let project = store.createFromIdea(user.id, {
    title: "Synthetic invited-pilot concept",
    content: privateIdea,
    origin: "human",
  });
  const calls = { timestamp: 0, model: 0 };
  const timestamps = new Timestamps(store, {
    verifier: new TimestampVerifier(authority.profile),
    fetcher: async (url, request) => {
      calls.timestamp++;
      assert.equal(url, authority.profile.endpoint);
      assert.ok(!request.body.includes(Buffer.from(privateIdea)));
      return new Response(authority.respond(request.body), {
        headers: { "Content-Type": "application/timestamp-reply" },
      });
    },
  });
  const gateway = new Gateway(store, {
    timestamps,
    env: {
      ORIGIN_EXTERNAL_AI: "1",
      ORIGIN_OPENAI_KEY: "synthetic-fixture-not-a-key",
      ORIGIN_OPENAI_MODEL: "OFFLINE-FIXTURE",
    },
    fetcher: async () => {
      calls.model++;
      return new Response(
        JSON.stringify({
          model: "OFFLINE-FIXTURE",
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: "SYNTHETIC PILOT RESPONSE. No model was contacted.",
                },
              ],
            },
          ],
          usage: { input_tokens: 0, output_tokens: 0 },
        }),
      );
    },
  });

  const timestampReview = timestamps.prepare(user.id, project.id, {
    revision: project.revision,
    ideaId: project.ideas[0].id,
    path: "signed-first",
  });
  project = await timestamps.submit(user.id, project.id, {
    id: timestampReview.approval.id,
    approvalToken: timestampReview.approval.approvalToken,
    payloadSha256: timestampReview.approval.payloadSha256,
    approved: true,
    revision: timestampReview.project.revision,
  });
  assert.equal(timestamps.status(user.id, project.id).ready, true);

  const disclosure = gateway.prepare(user.id, project.id, {
    revision: project.revision,
    threadId: project.threads[0].id,
    content: "Develop a small validation plan for this synthetic concept.",
    mode: "plan",
    provider: "openai",
    model: "OFFLINE-FIXTURE",
    ideaId: project.ideas[0].id,
    artifactIds: [],
    includeHistory: false,
  });
  project = await gateway.send(user.id, project.id, {
    revision: disclosure.project.revision,
    approvalToken: disclosure.preview.approvalToken,
    digest: disclosure.preview.digest,
    approved: true,
  });
  const assistant = project.threads[0].messages.at(-1);
  assert.equal(assistant.role, "assistant");
  assert.match(assistant.content, /SYNTHETIC PILOT RESPONSE/);

  project = store.action(user.id, project.id, {
    revision: project.revision,
    action: "artifact.save",
    name: "validation-plan.md",
    content: assistant.content,
    messageId: assistant.id,
  });
  assert.equal(
    project.artifacts[0].versions[0].receipt.manifest.origin,
    "ai-assisted",
  );
  assert.equal(project.artifacts[0].versions[0].sourceMessageId, assistant.id);
  assert.equal(store.verify(user.id, project.id).ok, true);
  const evidence = store.export(user.id, project.id);
  assert.equal(evidence.project.id, project.id);
  assert.equal(evidence.project.artifacts[0].name, "validation-plan.md");
  assert.deepEqual(calls, { timestamp: 1, model: 1 });

  assert.equal(store.revokeManagedSessions(secondDevice.raw), 2);
  assert.equal(store.auth(firstDevice.raw), null);
  assert.equal(store.auth(secondDevice.raw), null);
});
