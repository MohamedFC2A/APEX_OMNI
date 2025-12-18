const { pause } = require("./ops_utils");

function extractTextFromExecution(execution) {
  if (!execution) return "";
  if (typeof execution.result === "string") return execution.result;
  if (typeof execution.result?.output === "string") return execution.result.output;
  if (typeof execution.result?.text === "string") return execution.result.text;
  if (typeof execution.result?.message === "string") return execution.result.message;
  if (typeof execution.result?.content === "string") return execution.result.content;
  return "";
}

function normalizeText(s) {
  return String(s || "")
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function tokenizeWords(s) {
  return normalizeText(s)
    .toLowerCase()
    .replace(/[`*_#>]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/g)
    .filter(Boolean)
    .filter((w) => w.length >= 3);
}

function jaccard(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function splitIntoFacts(text) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const parts = normalized
    .split(/\n|(?<=[.!?])\s+/g)
    .map((s) => s.replace(/^[-*\d.)\s]+/g, "").trim())
    .filter(Boolean);

  const facts = [];
  for (const part of parts) {
    if (part.length < 12) continue;
    if (part.length > 420) {
      const sub = part
        .split(/;\s+|,\s+(?=[A-Z0-9])/g)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const s of sub) {
        if (s.length >= 12 && s.length <= 420) facts.push(s);
      }
      continue;
    }
    facts.push(part);
  }
  return facts;
}

function baseReliability(agent) {
  if (agent === "reasoner") return 0.62;
  if (agent === "generalist") return 0.58;
  if (agent === "context_king") return 0.56;
  if (agent === "math_code_wizard") return 0.6;
  if (agent === "efficient_backup") return 0.52;
  return 0.5;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

async function step2Deconstruct(ctx) {
  const emit = ctx?.emit;
  const executions = ctx?.swarm?.agentExecutions;
  if (!Array.isArray(executions) || executions.length === 0) {
    throw new Error("Step 2 failed: no swarm executions to deconstruct");
  }

  await pause(emit, { step: 2, message: "Semantic tokenizer engaged. Segmenting responses into fact-units." });

  const perAgentFacts = [];
  for (const exec of executions) {
    const text = extractTextFromExecution(exec);
    const facts = splitIntoFacts(text);
    perAgentFacts.push({
      exec,
      facts: facts.map((f) => ({
        fact: f,
        words: tokenizeWords(f),
      })),
    });
  }

  await pause(emit, { step: 2, message: "Computing cross-model agreement matrix (Jaccard similarity)." });

  const all = [];
  for (let i = 0; i < perAgentFacts.length; i += 1) {
    const { exec, facts } = perAgentFacts[i];
    for (const item of facts) {
      all.push({
        fact: item.fact,
        words: item.words,
        source: {
          agent: exec.agent || null,
          model: exec.model || null,
          executionId: exec.executionId || null,
        },
      });
    }
  }

  const threshold = 0.72;
  const enriched = [];
  for (let i = 0; i < all.length; i += 1) {
    const a = all[i];
    let agreements = 0;
    const agreeingAgents = new Set();

    for (let j = 0; j < all.length; j += 1) {
      if (i === j) continue;
      const b = all[j];
      if (!b.source?.agent || b.source.agent === a.source?.agent) continue;
      const sim = jaccard(a.words, b.words);
      if (sim >= threshold) {
        agreements += 1;
        agreeingAgents.add(b.source.agent);
      }
    }

    const lengthFactor = clamp01((a.words.length - 6) / 18);
    const reliability = baseReliability(a.source?.agent);
    const agreementScore = clamp01(agreeingAgents.size / 4);
    const confidence = clamp01(0.15 + reliability * 0.55 + agreementScore * 0.35 + lengthFactor * 0.1);

    enriched.push({
      fact: a.fact,
      confidence,
      agreement: {
        agreeingAgentCount: agreeingAgents.size,
        agreeingAgents: Array.from(agreeingAgents),
      },
      source: a.source,
    });
  }

  const facts = enriched
    .filter((f) => String(f.fact || "").trim())
    .sort((x, y) => y.confidence - x.confidence);

  if (facts.length === 0) {
    throw new Error("Step 2 failed: could not extract any facts");
  }

  await pause(emit, { step: 2, message: `Extracted ${facts.length} facts. Top confidence ${(facts[0].confidence || 0).toFixed(2)}.` });
  return facts;
}

module.exports = step2Deconstruct;
