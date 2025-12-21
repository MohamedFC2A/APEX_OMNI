const { pause } = require("./ops_utils");
const { createRequire } = require("module");
const { pathToFileURL } = require("url");

const CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1";
const BLACKBOX_BASE_URL = "https://api.blackbox.ai/v1";

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

function redactSecrets(s) {
  return String(s || "")
    .replace(/\b(bb_[a-zA-Z0-9_\-]{10,})\b/g, "[REDACTED]")
    .replace(/\b(sk-[a-zA-Z0-9_\-]{10,})\b/g, "[REDACTED]")
    .replace(/\b(csk-[a-zA-Z0-9_\-]{10,})\b/g, "[REDACTED]")
    .replace(/BLACKBOX_API_KEY\s*=\s*[^\n]+/gi, "BLACKBOX_API_KEY=[REDACTED]")
    .replace(/CEREBRAS_API_KEY\s*=\s*[^\n]+/gi, "CEREBRAS_API_KEY=[REDACTED]");
}

function chunkText(text, maxChunkSize) {
  const chunks = [];
  let cursor = 0;
  while (cursor < text.length) {
    const next = Math.min(text.length, cursor + maxChunkSize);
    chunks.push(text.slice(cursor, next));
    cursor = next;
  }
  return chunks;
}

async function step10Truth(ctx) {
  const emit = ctx?.emit;
  const { swarm, facts, logic, critique, verified, formatted, guard } = ctx;
  const thinkingNexus = Boolean(ctx?.thinkingNexus);

  await pause(emit, { step: 10, message: thinkingNexus ? "Absolute Truth engaged. Spawning Omni-Writer (Blackbox)." : "Absolute Truth engaged. Spawning Omni-Writer (Cerebras)." });

  const contextData = {
    userQuery: ctx.userQuery,
    swarmResults: swarm?.selectedAgents || [],
    keyFacts: facts?.slice(0, 10) || [],
    logicConflicts: logic?.conflicts || [],
    critiqueAttacks: critique?.attacks || [],
    verifiedDraft: typeof verified === "string" ? verified : "",
    guardFlags: guard?.flags || [],
    guardSafeOutput: typeof guard?.safeOutput === "string" ? guard.safeOutput : "",
    formattedDraft: typeof guard?.safeOutput === "string" ? guard.safeOutput : typeof formatted === "string" ? formatted : "",
  };

  const cerebrasApiKey = process.env.CEREBRAS_API_KEY || "";
  const blackboxApiKey = process.env.BLACKBOX_API_KEY || "";
  const apiKey = thinkingNexus ? blackboxApiKey : cerebrasApiKey;
  const baseURL = thinkingNexus ? BLACKBOX_BASE_URL : CEREBRAS_BASE_URL;
  const model = thinkingNexus ? "blackboxai/openai/gpt-4o" : "llama-3.3-70b";
  const maxTokens = thinkingNexus ? 1800 : 1600;

  if (!apiKey) {
    throw new Error(thinkingNexus ? "[APEX SECURITY]: BLACKBOX_API_KEY missing in .env file." : "[APEX SECURITY]: CEREBRAS_API_KEY missing in .env file.");
  }

  const OpenAI = await loadOpenAI();
  const client = new OpenAI({ apiKey, baseURL });

  let finalReport = "";

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { 
            role: "system", 
            content: "You are the Omni-Writer. Use Context Data to write a detailed, technical Markdown report with actionable sections and clear structure. Output JSON ONLY. No <thinking>, no extra keys. Return format: { \"report\": \"...markdown...\" }" 
        },
        { role: "user", content: `Context Data:\n${JSON.stringify(contextData, null, 2)}` }
      ],
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    try {
      const parsed = JSON.parse(content);
      finalReport = typeof parsed?.report === "string" ? parsed.report : content;
    } catch {
      finalReport = content;
    }

  } catch (error) {
    console.error("Step 10 Truth Error:", sanitizeErrorMessage(error instanceof Error ? error.message : String(error)));
    finalReport = formatted || "Error generating final report. Using formatted draft.";
  }

  finalReport = redactSecrets(finalReport);

  await pause(emit, { step: 10, message: "Packaging final byte-stream and typing envelope." });

  const chunkSize = 8;
  const intervalMs = 15;

  return {
    answer: finalReport,
    presentation: {
      typing: {
        chunkSize,
        intervalMs,
        chunks: chunkText(finalReport, chunkSize),
      },
    },
  };
}

module.exports = step10Truth;
