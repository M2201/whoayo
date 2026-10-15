import { ensure } from "./store.mjs";

const definitions = [
  {
    id: "openai",
    name: "OpenAI",
    prefix: "ORIGIN_OPENAI",
    protocol: "responses",
    endpoint: "https://api.openai.com/v1/responses",
    policyUrl: "https://developers.openai.com/api/docs/guides/your-data",
    retention:
      "Response storage disabled. Provider abuse-monitoring retention may apply; zero retention is not verified.",
  },
  {
    id: "anthropic",
    name: "Claude / Anthropic",
    prefix: "ORIGIN_ANTHROPIC",
    protocol: "messages",
    endpoint: "https://api.anthropic.com/v1/messages",
    policyUrl:
      "https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training",
    retention:
      "Provider retention applies. Zero retention and account-specific contract settings are not verified.",
  },
  {
    id: "gemini",
    name: "Gemini / Google",
    prefix: "ORIGIN_GEMINI",
    protocol: "chat",
    endpoint:
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    policyUrl: "https://ai.google.dev/gemini-api/terms",
    retention:
      "Google's unpaid and paid API data terms differ. An operator must review the account's applicable terms before enabling private work. Provider retention can still apply.",
    policyGate: true,
  },
  {
    id: "kimi",
    name: "Kimi / Moonshot",
    prefix: "ORIGIN_KIMI",
    protocol: "chat",
    endpoint: "https://api.moonshot.ai/v1/chat/completions",
    policyUrl: "https://platform.kimi.ai/docs/agreement/modeluse",
    retention:
      "External processing under Moonshot's account terms, including possible caching and retention. Operator review is required; private hosting and zero retention are not verified.",
    policyGate: true,
  },
];

export function providerConfig(env = process.env) {
  return definitions.map((definition) => {
    const { prefix } = definition;
    const configNames = {
      key: `${prefix}_KEY`,
      models: `${prefix}_MODELS`,
      model: `${prefix}_MODEL`,
      enabled: `${prefix}_ENABLED`,
      ...(definition.policyGate
        ? { policyReviewed: `${prefix}_POLICY_REVIEWED` }
        : {}),
    };
    const raw = env[configNames.models];
    let models = [],
      invalid = false;
    try {
      // An explicitly supplied plural list is authoritative, including [].
      models =
        raw !== undefined
          ? JSON.parse(raw)
          : env[configNames.model]
            ? [env[configNames.model]]
            : [];
      if (
        !Array.isArray(models) ||
        models.length > 64 ||
        models.some(
          (model) =>
            typeof model !== "string" ||
            !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(model) ||
            /^(?:sk-|AIza|AKIA|gh[pousr]_)/.test(model),
        )
      ) {
        throw new Error("invalid-model-list");
      }
      models = [...new Set(models)];
    } catch {
      models = [];
      invalid = true;
    }
    const key = env[configNames.key];
    const disabledReason = invalid
      ? "Invalid model configuration"
      : env.ORIGIN_EXTERNAL_AI !== "1"
        ? "External AI is off"
        : env[configNames.enabled] === "0"
          ? "Disabled by administrator"
          : !key?.trim()
            ? "API credential required"
            : !models.length
              ? "Model selection required"
              : definition.policyGate && env[configNames.policyReviewed] !== "1"
                ? "Data-policy review required"
                : null;
    return {
      ...definition,
      key,
      models,
      model: models[0] || null,
      configNames,
      enabled: !disabledReason,
      disabledReason,
      accessStatus: "not-live-verified",
    };
  });
}

export function providerRequest(provider, model, messages, system) {
  if (provider.protocol === "responses")
    return {
      model,
      store: false,
      max_output_tokens: 4096,
      instructions: system,
      input: messages,
    };
  if (provider.protocol === "messages")
    return { model, max_tokens: 4096, system, messages };
  return {
    model,
    max_completion_tokens: 4096,
    stream: false,
    messages: [{ role: "system", content: system }, ...messages],
  };
}

export function providerHeaders(provider) {
  return {
    "Content-Type": "application/json",
    ...(provider.protocol === "messages"
      ? { "x-api-key": provider.key, "anthropic-version": "2023-06-01" }
      : { Authorization: `Bearer ${provider.key}` }),
  };
}

export function providerResponse(provider, data) {
  const unsupported = "Provider returned an unsupported response.";
  ensure(
    data && typeof data === "object" && !Array.isArray(data),
    unsupported,
    502,
  );
  let textBlocks,
    finishReason = null;
  if (provider.protocol === "responses") {
    ensure(Array.isArray(data.output), unsupported, 502);
    textBlocks = data.output
      .filter((x) => x?.type === "message")
      .flatMap((x) => x.content ?? [])
      .filter((x) => x?.type === "output_text");
    finishReason = data.status ?? null;
  } else if (provider.protocol === "messages") {
    ensure(Array.isArray(data.content), unsupported, 502);
    textBlocks = data.content.filter((x) => x?.type === "text");
    finishReason = data.stop_reason ?? null;
  } else {
    ensure(
      Array.isArray(data.choices) && data.choices.length === 1,
      unsupported,
      502,
    );
    const choice = data.choices[0];
    ensure(
      choice?.message?.role === "assistant" &&
        !choice.message.tool_calls?.length &&
        !choice.message.function_call,
      unsupported,
      502,
    );
    textBlocks = [{ text: choice.message.content }];
    finishReason = choice.finish_reason ?? null;
  }
  ensure(
    textBlocks.every((x) => typeof x.text === "string"),
    unsupported,
    502,
  );
  const content = textBlocks.map((x) => x.text).join("\n");
  ensure(content.trim() && content.length <= 100000, unsupported, 502);
  ensure(
    data.model == null ||
      (typeof data.model === "string" && data.model.length <= 200),
    unsupported,
    502,
  );
  ensure(
    finishReason === null ||
      (typeof finishReason === "string" && finishReason.length <= 100),
    unsupported,
    502,
  );
  const usage = {
    inputTokens:
      (provider.protocol === "chat"
        ? data.usage?.prompt_tokens
        : data.usage?.input_tokens) ?? null,
    outputTokens:
      (provider.protocol === "chat"
        ? data.usage?.completion_tokens
        : data.usage?.output_tokens) ?? null,
  };
  for (const value of Object.values(usage))
    ensure(
      value === null || (Number.isSafeInteger(value) && value >= 0),
      "Invalid provider usage.",
      502,
    );
  return {
    content,
    usage,
    returnedModel: data.model || null,
    finishReason,
    truncated: ["length", "max_tokens", "incomplete"].includes(finishReason),
  };
}
