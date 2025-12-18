const { pathToFileURL } = require("url");
const { createRequire } = require("module");

const FALLBACK_MODELS = [
  "blackboxai/openai/gpt-4o-mini",
  "blackboxai/meta-llama/llama-3.3-70b-instruct",
];

const STANDARD_MODELS = [
  {
    agent: "efficient_backup",
    agentName: "GPT-4o Mini",
    primary: "blackboxai/openai/gpt-4o-mini",
    fallbacks: [],
  },
  {
    agent: "generalist",
    agentName: "Llama 3.3",
    primary: "blackboxai/meta-llama/llama-3.3-70b-instruct",
    fallbacks: [],
  },
  {
    agent: "context_king",
    agentName: "GPT-4o",
    primary: "blackboxai/openai/gpt-4o",
    fallbacks: FALLBACK_MODELS,
  },
  {
    agent: "reasoner",
    agentName: "DeepSeek V3",
    primary: "blackboxai/deepseek/deepseek-chat",
    fallbacks: FALLBACK_MODELS,
  },
  {
    agent: "math_code_wizard",
    agentName: "Claude 3 Haiku",
    primary: "blackboxai/anthropic/claude-3-haiku",
    fallbacks: FALLBACK_MODELS,
  },
];

const THINKING_NEXUS_MODELS = [
  {
    agent: "god_tier_hermes",
    agentName: "Hermes 3 405B",
    primary: "blackboxai/nousresearch/hermes-3-llama-3.1-405b",
    fallbacks: FALLBACK_MODELS,
  },
  {
    agent: "god_tier_gpt4o",
    agentName: "GPT-4o",
    primary: "blackboxai/openai/gpt-4o",
    fallbacks: FALLBACK_MODELS,
  },
  {
    agent: "god_tier_haiku",
    agentName: "Claude 3 Haiku",
    primary: "blackboxai/anthropic/claude-3-haiku",
    fallbacks: FALLBACK_MODELS,
  },
  {
    agent: "god_tier_gpt4o_2",
    agentName: "GPT-4o",
    primary: "blackboxai/openai/gpt-4o",
    fallbacks: FALLBACK_MODELS,
  },
  {
    agent: "god_tier_haiku_2",
    agentName: "Claude 3 Haiku",
    primary: "blackboxai/anthropic/claude-3-haiku",
    fallbacks: FALLBACK_MODELS,
  },
];

function sanitizeErrorMessage(message) {
  if (!message) return message;

  let out = String(message);

  out = out.replace(/\b(bb_[a-zA-Z0-9_-]{10,})\b/g, "[REDACTED]");
  out = out.replace(/\b(sk-[a-zA-Z0-9_-]{10,})\b/g, "[REDACTED]");
  out = out.replace(/Received API Key\s*=\s*[^,]+/gi, "Received API Key = [REDACTED]");
  out = out.replace(/Key Hash\s*\(Token\)\s*=\s*[a-f0-9]{16,}/gi, "Key Hash (Token) = [REDACTED]");

  return out;
}

function maskKey(key) {
  const s = String(key || "");
  if (!s) return "";
  if (s.length <= 8) return "[REDACTED]";
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

async function loadOpenAI() {
  const req = createRequire(__filename);
  const openaiPath = req.resolve("openai", { paths: [process.cwd()] });
  const mod = await import(pathToFileURL(openaiPath).href);
  return mod?.default ?? mod?.OpenAI ?? mod;
}

async function createClient(apiKey) {
  const OpenAI = await loadOpenAI();
  return new OpenAI({
    apiKey,
    baseURL: "https://api.blackbox.ai",
  });
}

function extractChatText(response) {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  return "";
}

function normalizeSnippet(text, limit = 220) {
  const t = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (t.length <= limit) return t;
  return t.slice(0, limit).trimEnd() + "…";
}

function formatDurationMs(ms) {
  const s = Math.max(0, ms) / 1000;
  return `${s.toFixed(1)}s`;
}

function isTimeoutLike(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return msg.includes("timeout") || msg.includes("timed out") || msg.includes("aborted") || msg.includes("abort");
}

function isTransientLike(err) {
  const status = typeof err?.status === "number" ? err.status : null;
  if (status && [404, 408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    isRateLimitLike(err) ||
    isTimeoutLike(err) ||
    msg.includes("overloaded") ||
    msg.includes("busy") ||
    msg.includes("temporarily") ||
    msg.includes("try again")
  );
}

function isUsableContent(text) {
  const t = String(text || "").trim();
  if (t.length < 24) return false;
  const lower = t.toLowerCase();
  if (lower.includes("simulation mode:")) return false;
  return true;
}

function safeAgentText(text) {
  const t = String(text || "");
  return t
    .replace(/^\s*(chain[- ]of[- ]thought|step[- ]by[- ]step|reasoning)\s*:\s*/gim, "")
    .replace(/^\s*let'?s\s+think\s+step\s+by\s+step\s*[:.-]?\s*$/gim, "")
    .trim();
}

async function chatCompletionWithTimeout(client, params, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    return await client.chat.completions.create({ ...params, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isRateLimitLike(err) {
  const status = typeof err?.status === "number" ? err.status : null;
  if (status === 429) return true;
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("overloaded") ||
    msg.includes("busy") ||
    msg.includes("try again")
  );
}

function toExecution({ agent, model, completion, content, error }) {
  if (error) {
    return {
      agent,
      model,
      status: "failed",
      executionId: null,
      result: { content: content || "" },
      error: sanitizeErrorMessage(error),
    };
  }

  return {
    agent,
    model,
    status: "completed",
    executionId: completion?.id || null,
    result: { content: content || "" },
    error: null,
  };
}

async function step1Swarm(userQuery, options = {}) {
  const apiKey = options.apiKey || process.env.BLACKBOX_API_KEY || "";
  const emit = options.emit;
  const thinkingNexus = Boolean(options.thinkingNexus);
  const models = thinkingNexus ? THINKING_NEXUS_MODELS : STANDARD_MODELS;
  const selectedAgents = models.map((m) => ({ agent: m.agent, model: m.primary }));

  if (!String(userQuery || "").trim()) {
    throw new Error("Step 1 failed: missing user query");
  }

  if (
    !apiKey ||
    apiKey === "PLACEHOLDER_KEY_HERE" ||
    apiKey === "PASTE_YOUR_KEY_HERE"
  ) {
    throw new Error("[APEX SECURITY]: API Key missing in .env file.");
  }

  if (!Array.isArray(selectedAgents) || selectedAgents.length !== models.length) {
    throw new Error("Step 1 failed: selectedAgents mismatch");
  }

  const query = String(userQuery || "").trim();

  try {
    const startedAt = Date.now();
    emit?.({ type: "step_progress", step: 1, percent: 0, at: startedAt });
    emit?.({
      type: "log",
      step: 1,
      at: startedAt,
      message: thinkingNexus ? "Thinking Nexus engaged. Spawning Power 5." : "Standard Mode engaged. Spawning Elite 5.",
    });

    for (const m of models) {
      emit?.({ type: "agent_start", step: 1, at: Date.now(), agent: m.agent, agentName: m.agentName, model: m.primary });
      emit?.({ type: "log", step: 1, at: Date.now(), message: `${m.agentName} connected...` });
    }

    const client = await createClient(apiKey);
    const timeoutMs = thinkingNexus ? 90000 : 45000;

    const system = thinkingNexus
      ? [
          "You are an elite reasoning model in a multi-agent swarm.",
          "Think deeply and use internal reasoning before answering.",
          "Do not reveal hidden chain-of-thought.",
          "Return: (1) a short reasoning summary (max 6 bullets), (2) a direct answer.",
        ].join("\n")
      : [
          "You are a specialist agent in a multi-agent swarm.",
          "Be precise and actionable.",
          "Do not reveal hidden chain-of-thought.",
          "Return a clear answer with key bullets.",
        ].join("\n");

    const request = {
      messages: [
        { role: "system", content: system },
        { role: "user", content: query },
      ],
    };

    let finished = 0;
    const total = models.length;

    const executions = new Array(models.length);

    const tasks = models.map((m, idx) => {
      const agentStartedAt = Date.now();

      const task = (async () => {
        const attemptModels = [m.primary, ...(Array.isArray(m.fallbacks) ? m.fallbacks : [])]
          .filter(Boolean)
          .filter((x, i, arr) => arr.indexOf(x) === i);

        let usedModel = m.primary;
        let completion = null;
        let content = "";
        let error = null;

        for (let attemptIndex = 0; attemptIndex < attemptModels.length; attemptIndex += 1) {
          const model = attemptModels[attemptIndex];
          usedModel = model;
          const attemptStartedAt = Date.now();

          try {
            const res = await chatCompletionWithTimeout(
              client,
              {
                ...request,
                model,
              },
              timeoutMs
            );

            completion = res;
            const raw = extractChatText(res);
            const safe = safeAgentText(raw);
            if (!isUsableContent(safe)) {
              throw new Error("Malformed or empty model output");
            }

            content = safe;
            error = null;
            break;
          } catch (err) {
            const msg = sanitizeErrorMessage(err instanceof Error ? err.message : String(err));
            const isMalformed = msg.toLowerCase().includes("malformed") || msg.toLowerCase().includes("empty model output");
            const canRetry = attemptIndex < attemptModels.length - 1 && (isTransientLike(err) || isMalformed);
            const attemptDurationMs = Date.now() - attemptStartedAt;
            if (canRetry) {
              emit?.({
                type: "agent_finish",
                step: 1,
                at: Date.now(),
                agent: m.agent,
                agentName: m.agentName,
                model,
                status: "failed",
                duration: formatDurationMs(attemptDurationMs),
                durationMs: attemptDurationMs,
                output_snippet: "",
                error: msg,
              });

              const nextModel = attemptModels[attemptIndex + 1];
              emit?.({ type: "log", step: 1, at: Date.now(), message: `${m.agentName} replaced (${model} → ${nextModel}).` });
              emit?.({ type: "agent_start", step: 1, at: Date.now(), agent: m.agent, agentName: m.agentName, model: nextModel });
              continue;
            }

            completion = null;
            content = "";
            error = msg;
            break;
          }
        }

        return { usedModel, completion, content, error };
      })();

      task.then(({ usedModel, completion, content, error }) => {
        const finishedAt = Date.now();
        const durationMs = finishedAt - agentStartedAt;
        const snippet = normalizeSnippet(content);
        const status = error ? "failed" : "completed";

        emit?.({
          type: "agent_finish",
          step: 1,
          at: finishedAt,
          agent: m.agent,
          agentName: m.agentName,
          model: usedModel,
          status,
          duration: formatDurationMs(durationMs),
          durationMs,
          output_snippet: snippet,
          error: error ? sanitizeErrorMessage(error) : null,
        });

        finished += 1;
        const percent = Math.max(0, Math.min(100, Math.round((finished / Math.max(1, total)) * 100)));
        emit?.({ type: "step_progress", step: 1, percent, at: finishedAt });

        if (error) {
          emit?.({ type: "log", step: 1, at: finishedAt, message: `${m.agentName} failed: ${sanitizeErrorMessage(error)}` });
        } else {
          emit?.({ type: "log", step: 1, at: finishedAt, message: `${m.agentName} finished in ${formatDurationMs(durationMs)}` });
        }

        executions[idx] = toExecution({
          agent: m.agent,
          model: usedModel,
          completion,
          content,
          error,
        });
      });

      return task;
    });

    await Promise.all(tasks);

    const usable = executions.filter((e) => String(e?.result?.content || "").trim());
    if (usable.length === 0) {
      throw new Error(`Swarm failed for all models (${models.length}) (key ${maskKey(apiKey)})`);
    }

    const finishedAt = Date.now();
    emit?.({ type: "log", step: 1, at: finishedAt, message: `Swarm completed with ${usable.length}/${models.length} usable outputs.` });

    return {
      taskId: null,
      status: "completed",
      selectedAgents: executions.map((e, i) => ({ agent: models[i]?.agent, model: e?.model || models[i]?.primary })),
      agentExecutions: executions,
      simulated: false,
    };
  } catch (error) {
    const message = sanitizeErrorMessage(error instanceof Error ? error.message : String(error));
    const at = Date.now();
    emit?.({ type: "log", step: 1, at, message: `Step 1 failed: ${message}` });
    throw new Error(`Step 1 failed: ${message}`);
  }
}

module.exports = step1Swarm;
