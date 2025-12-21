const { pause } = require("./ops_utils");

function extractTextFromExecution(execution) {
  if (!execution) return "";
  const raw =
    typeof execution.result === "string"
      ? execution.result
      : typeof execution.result?.output === "string"
        ? execution.result.output
        : typeof execution.result?.text === "string"
          ? execution.result.text
          : typeof execution.result?.message === "string"
            ? execution.result.message
            : typeof execution.result?.content === "string"
              ? execution.result.content
              : "";

  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      const answer = typeof parsed?.answer === "string" ? parsed.answer.trim() : "";
      const reasoning = typeof parsed?.reasoning_summary === "string" ? parsed.reasoning_summary.trim() : "";
      const combined = [answer, reasoning].filter(Boolean).join("\n\n");
      return combined || trimmed;
    } catch {
      return trimmed;
    }
  }

  return trimmed;
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

function splitIntoFacts(text) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  // Heavy Regex Heuristics for splitting atomic claims
  // 1. Split by newlines or sentence terminators followed by space/uppercase
  // 2. Handle bullet points and numbered lists explicitly
  // 3. Handle code blocks (exclude them from claim splitting)
  
  const blocks = normalized.split(/```[\s\S]*?```/g); // Naive code block exclusion
  const claims = [];

  for (const block of blocks) {
      if (!block.trim()) continue;
      
      const parts = block
        .split(/(?:\r?\n)+|(?<=[.!?])\s+(?=[A-Z])/g) // Split by newlines or sentence boundaries
        .map(s => s.trim())
        .filter(s => s.length > 10);

      for (const part of parts) {
          // Sub-split complex sentences with semicolons or "however" type conjunctions if too long
          if (part.length > 200) {
              const subParts = part.split(/;\s+|,\s+(?:however|therefore|thus|moreover)\s+/i);
              for (const sp of subParts) {
                  const cleaned = sp.replace(/^[-*•\d.)\s]+/, "").trim(); // Remove list markers
                  if (cleaned.length > 10) claims.push(cleaned);
              }
          } else {
              const cleaned = part.replace(/^[-*•\d.)\s]+/, "").trim();
              if (cleaned.length > 10) claims.push(cleaned);
          }
      }
  }

  return claims;
}

async function step2Deconstruct(ctx) {
  const emit = ctx?.emit;
  const executions = ctx?.swarm?.agentExecutions;
  if (!Array.isArray(executions) || executions.length === 0) {
    throw new Error("Step 2 failed: no swarm executions to deconstruct");
  }

  await pause(emit, { step: 2, message: "Omni-Deconstruct engaged. Running heavy NLP regex heuristics." });

  const perAgentFacts = [];
  let totalFacts = 0;

  for (const exec of executions) {
    const text = extractTextFromExecution(exec);
    const facts = splitIntoFacts(text);
    totalFacts += facts.length;
    
    perAgentFacts.push({
      exec,
      facts: facts.map((f) => ({
        fact: f,
        words: tokenizeWords(f),
      })),
    });
  }

  // Flatten for next steps
  const allFacts = [];
  for (const item of perAgentFacts) {
    const agent = item.exec?.agent || "unknown";
    const model = item.exec?.model || "unknown";
    for (const f of item.facts) {
      allFacts.push({
        fact: f.fact,
        tokens: f.words,
        source: { agent, model },
        confidence: 0.8, // Baseline confidence
      });
    }
  }

  await pause(emit, { step: 2, message: `Deconstruction complete. Extracted ${totalFacts} atomic claims.` });

  return allFacts;
}

module.exports = step2Deconstruct;
