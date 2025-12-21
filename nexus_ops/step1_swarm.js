const { createRequire } = require("module");
const { pathToFileURL } = require("url");

const CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1";
const BLACKBOX_BASE_URL = "https://api.blackbox.ai/v1";

const CEREBRAS_MODELS = [
  {
    agent: "cerebras_llama_70b",
    agentName: "Cerebras Llama 3.3 70B",
    model: "llama-3.3-70b",
  },
  {
    agent: "cerebras_llama_8b",
    agentName: "Cerebras Llama 3.1 8B",
    model: "llama3.1-8b",
  },
  {
    agent: "cerebras_llama_70b_backup",
    agentName: "Cerebras Llama 3.3 70B (Backup)",
    model: "llama-3.3-70b",
  },
];

const BLACKBOX_MODELS = [
  {
    agent: "deepseek_v3",
    agentName: "DeepSeek V3",
    model: "blackboxai/deepseek/deepseek-chat",
  },
  {
    agent: "gpt_4o",
    agentName: "GPT-4o",
    model: "blackboxai/openai/gpt-4o",
  },
  {
    agent: "claude_sonnet",
    agentName: "Claude 3.5 Sonnet",
    model: "blackboxai/anthropic/claude-3-5-sonnet",
  },
];

async function loadOpenAI() {
  const req = createRequire(__filename);
  const openaiPath = req.resolve("openai", { paths: [process.cwd()] });
  const mod = await import(pathToFileURL(openaiPath).href);
  return mod?.default ?? mod?.OpenAI ?? mod;
}

function sanitizeErrorMessage(message) {
  if (!message) return message;
  let out = String(message);
  out = out.replace(/\b(bb_[a-zA-Z0-9_-]{10,})\b/g, "[REDACTED]");
  out = out.replace(/\b(sk-[a-zA-Z0-9_-]{10,})\b/g, "[REDACTED]");
  out = out.replace(/\b(csk-[a-zA-Z0-9_-]{10,})\b/g, "[REDACTED]");
  return out;
}

function formatDurationMs(ms) {
  const s = Math.max(0, ms) / 1000;
  return `${s.toFixed(1)}s`;
}

async function step1Swarm(userQuery, options = {}) {
  const emit = options.emit;
  const thinkingNexus = Boolean(options.thinkingNexus);

  // 1. Validate Query
  if (!String(userQuery || "").trim()) {
    throw new Error("Step 1 failed: missing user query");
  }

  // 2. Load API Keys
  const cerebrasApiKey = process.env.CEREBRAS_API_KEY || "";
  const blackboxApiKey = process.env.BLACKBOX_API_KEY || "";

  if (!thinkingNexus && !cerebrasApiKey) {
    throw new Error("[APEX SECURITY]: CEREBRAS_API_KEY missing in .env file.");
  }
  if (thinkingNexus && !blackboxApiKey) {
    throw new Error("[APEX SECURITY]: BLACKBOX_API_KEY missing in .env file.");
  }

  // 3. Initialize SDK
  const OpenAI = await loadOpenAI();

  // 4. Select Mode & Client
  let client;
  let models = [];
  let modeName = "";

  if (thinkingNexus) {
    modeName = "Thinking Nexus (Blackbox)";
    models = BLACKBOX_MODELS;
    client = new OpenAI({
      baseURL: BLACKBOX_BASE_URL,
      apiKey: blackboxApiKey,
    });
  } else {
    modeName = "Standard Mode (Cerebras)";
    models = CEREBRAS_MODELS;
    client = new OpenAI({
      baseURL: CEREBRAS_BASE_URL,
      apiKey: cerebrasApiKey,
    });
  }

  // 5. Emit Start Events
  const startedAt = Date.now();
  emit?.({ type: "step_progress", step: 1, percent: 0, at: startedAt });
  emit?.({
    type: "log",
    step: 1,
    at: startedAt,
    message: `${modeName} engaged. Spawning ${models.length} agents.`,
  });

  for (const m of models) {
    emit?.({ type: "agent_start", step: 1, at: Date.now(), agent: m.agent, agentName: m.agentName, model: m.model });
  }

  // 6. Execute Swarm
  const systemPrompt = [
    "You are a backend processor. Output JSON ONLY. No <thinking> tags. No conversational filler.",
    "You are an elite reasoning model in a multi-agent swarm.",
    "Return: { \"reasoning_summary\": \"...\", \"answer\": \"...\" }",
  ].join("\n");

  const tasks = models.map(async (m) => {
    const agentStart = Date.now();
    try {
      const completion = await client.chat.completions.create({
        model: m.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userQuery },
        ],
        max_tokens: thinkingNexus ? 900 : 700,
        response_format: { type: "json_object" },
      });

      const content = completion.choices[0].message.content;
      const durationMs = Date.now() - agentStart;
      
      // Attempt to parse JSON to ensure validity, but return string content
      try {
        JSON.parse(content);
      } catch (e) {
        // If not valid JSON, we might want to flag it, but for now we just return it
        // The instructions say "If you write anything outside the JSON, the system fails."
        // We could enforce it here.
      }

      emit?.({
        type: "agent_finish",
        step: 1,
        at: Date.now(),
        agent: m.agent,
        agentName: m.agentName,
        model: m.model,
        status: "completed",
        duration: formatDurationMs(durationMs),
        durationMs,
        output_snippet: content.slice(0, 100) + "...",
      });

      return {
        agent: m.agent,
        model: m.model,
        status: "completed",
        result: { content },
        error: null,
      };

    } catch (err) {
      const durationMs = Date.now() - agentStart;
      const msg = sanitizeErrorMessage(err instanceof Error ? err.message : String(err));
      
      emit?.({
        type: "agent_finish",
        step: 1,
        at: Date.now(),
        agent: m.agent,
        agentName: m.agentName,
        model: m.model,
        status: "failed",
        duration: formatDurationMs(durationMs),
        durationMs,
        error: msg,
      });

      return {
        agent: m.agent,
        model: m.model,
        status: "failed",
        result: { content: "" },
        error: msg,
      };
    }
  });

  const executions = await Promise.all(tasks);
  const successful = executions.filter((e) => e.status === "completed");

  if (successful.length === 0) {
    throw new Error(`Swarm failed for all models in ${modeName}.`);
  }

  const finishedAt = Date.now();
  emit?.({
    type: "log",
    step: 1,
    at: finishedAt,
    message: `Swarm completed. ${successful.length}/${models.length} agents successful.`,
  });

  return {
    taskId: null,
    status: "completed",
    selectedAgents: executions.map(e => ({ agent: e.agent, model: e.model })),
    agentExecutions: executions,
    simulated: false,
  };
}

step1Swarm.AGENTS = {
  standard: CEREBRAS_MODELS,
  thinking: BLACKBOX_MODELS,
};

module.exports = step1Swarm;
