// Isolated browser-QA server. Never contacts a real model provider.
import { randomBytes } from "node:crypto";
import { Store } from "../server/store.mjs";
import { ProviderTestGateway as Gateway } from "./provider-gateway.mjs";
import { Gateway as RealGateway } from "../server/gateway.mjs";
import { Timestamps } from "../server/timestamps.mjs";
import { TimestampVerifier } from "../server/timestamp-verifier.mjs";
import { syntheticAuthority } from "./timestamp-authority.mjs";
import { createServer } from "../server/http.mjs";

const store = new Store(":memory:", randomBytes(32));
const multiModels = process.env.ORIGIN_QA_MULTI_MODELS === "1";
const timestampMode = process.env.ORIGIN_QA_TIMESTAMPS;
const authority =
  timestampMode && timestampMode !== "unavailable"
    ? syntheticAuthority()
    : null;
process.once("exit", () => authority?.close());
const timestampOptions = timestampMode
  ? {
      timestamps: new Timestamps(store, {
        verifier: authority ? new TimestampVerifier(authority.profile) : null,
        fetcher: async (url, input) => {
          if (url !== authority.profile.endpoint)
            throw Error("Unexpected synthetic authority destination");
          return new Response(
            timestampMode === "malformed"
              ? "invalid proof"
              : authority.respond(input.body),
          );
        },
      }),
    }
  : {};
const FixtureGateway = timestampMode ? RealGateway : Gateway;
const gateway = new FixtureGateway(store, {
  ...timestampOptions,
  env: {
    ORIGIN_EXTERNAL_AI: "1",
    ORIGIN_OPENAI_KEY: "synthetic-fixture-not-a-key",
    ORIGIN_OPENAI_MODEL: "OFFLINE-FIXTURE",
    ...(multiModels
      ? {
          ORIGIN_OPENAI_MODELS: '["OFFLINE-FIXTURE","OFFLINE-ALTERNATE"]',
          ORIGIN_GEMINI_KEY: "synthetic-fixture-not-a-key",
          ORIGIN_GEMINI_MODELS: '["OFFLINE-GEMINI"]',
          ORIGIN_GEMINI_POLICY_REVIEWED: "1",
          ORIGIN_KIMI_MODEL: "OFFLINE-KIMI",
        }
      : {}),
  },
  fetcher: async (url) =>
    new Response(
      JSON.stringify(
        url.includes("/chat/completions")
          ? {
              model: "OFFLINE-GEMINI",
              choices: [
                {
                  message: {
                    role: "assistant",
                    content:
                      "SYNTHETIC GEMINI RESPONSE. No model was contacted.",
                  },
                  finish_reason: "stop",
                },
              ],
              usage: { prompt_tokens: 0, completion_tokens: 0 },
            }
          : {
              model: "OFFLINE-FIXTURE",
              output: [
                {
                  type: "message",
                  content: [
                    {
                      type: "output_text",
                      text: "SYNTHETIC TEST RESPONSE. No model was contacted.\n\n```ts\nexport const fixture = true;\n```\n\nThis verifies disclosure approval and artifact attribution only.",
                    },
                  ],
                },
              ],
              usage: { input_tokens: 0, output_tokens: 0 },
            },
      ),
    ),
});
gateway.providers[0].name = "Synthetic test adapter";
gateway.providers[0].retention =
  "OFFLINE TEST ONLY. No external provider receives this request.";
const server = createServer({ store, gateway });
server.listen(4362, "127.0.0.1", () =>
  console.log("Offline UI fixture: http://127.0.0.1:4362"),
);
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, () =>
    server.close(() => {
      store.close();
      authority?.close();
      process.exit(0);
    }),
  );
