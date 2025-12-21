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

function normalizeAttacks(value) {
  const arr = Array.isArray(value) ? value : [];
  const out = [];
  for (const item of arr) {
    if (typeof item === "string") {
      const counter = item.trim();
      if (!counter) continue;
      out.push({ counter, targetFact: "", supportScore: 0.55 });
      continue;
    }
    if (item && typeof item === "object") {
      const counter = typeof item.counter === "string" ? item.counter.trim() : "";
      const targetFact = typeof item.targetFact === "string" ? item.targetFact.trim() : "";
      const supportScoreRaw = typeof item.supportScore === "number" ? item.supportScore : 0.55;
      const supportScore = Math.max(0, Math.min(1, supportScoreRaw));
      if (!counter) continue;
      out.push({ counter, targetFact, supportScore });
    }
  }
  return out;
}

async function step4Critique(ctx) {
  const emit = ctx?.emit;
  const accepted = Array.isArray(ctx?.logic?.accepted) ? ctx.logic.accepted : [];
  
  await pause(emit, { step: 4, message: "Titan Critique engaged. Spawning Red Team analysis." });

  if (accepted.length === 0) {
    return { attacks: normalizeAttacks(["No facts to critique."]) };
  }

  const factsText = accepted.slice(0, 36).map((f, i) => `${i + 1}. ${f.fact}`).join("\n");

  const thinkingNexus = Boolean(ctx?.thinkingNexus);
  const cerebrasApiKey = process.env.CEREBRAS_API_KEY || "";
  const blackboxApiKey = process.env.BLACKBOX_API_KEY || "";
  const apiKey = thinkingNexus ? blackboxApiKey : cerebrasApiKey;
  const baseURL = thinkingNexus ? BLACKBOX_BASE_URL : CEREBRAS_BASE_URL;
  const model = thinkingNexus ? "blackboxai/deepseek/deepseek-chat" : "llama3.1-8b";

  if (!apiKey) {
    throw new Error(thinkingNexus ? "[APEX SECURITY]: BLACKBOX_API_KEY missing in .env file." : "[APEX SECURITY]: CEREBRAS_API_KEY missing in .env file.");
  }

  const OpenAI = await loadOpenAI();
  const client = new OpenAI({ apiKey, baseURL });

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a Red Team attacker. Critique the following facts. Be harsh and practical. Output JSON ONLY with: { \"attacks\": [{ \"counter\": \"...\", \"targetFact\": \"...\", \"supportScore\": 0.0 }] }. supportScore is 0..1.",
        },
        { role: "user", content: `Facts:\n${factsText}` },
      ],
      max_tokens: 650,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    let attacks = [];
    try {
      const parsed = JSON.parse(content);
      attacks = normalizeAttacks(parsed?.attacks);
      if (attacks.length === 0) attacks = normalizeAttacks([content]);
    } catch {
      attacks = normalizeAttacks([content]);
    }

    await pause(emit, { step: 4, message: `Critique complete. Generated ${attacks.length} adversarial vectors.` });
    
    return { attacks };

  } catch (error) {
    console.error("Step 4 Critique Error:", sanitizeErrorMessage(error instanceof Error ? error.message : String(error)));
    await pause(emit, { step: 4, message: "Critique fallback: Using heuristic analysis due to API error." });
    return { attacks: normalizeAttacks(["API Error: defaulting to heuristic critique."]) };
  }
}

module.exports = step4Critique;
