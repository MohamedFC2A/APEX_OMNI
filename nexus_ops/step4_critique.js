const { pause } = require("./ops_utils");

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function toNumber(x, fallback) {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(s) {
  return String(s || "")
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function normalizeKey(s) {
  return normalizeText(s)
    .toLowerCase()
    .replace(/[`*_#>]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function tokenizeKey(s) {
  return normalizeKey(s)
    .split(/\s+/g)
    .filter(Boolean)
    .filter((w) => w.length >= 4);
}

function jaccardTokens(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function issueSignals(text) {
  const t = String(text || "");
  const issues = [];
  if (/\b(stuff|things|some|various|many|a lot|fast|slow|better|best)\b/i.test(t)) issues.push("vagueness");
  if (/\b(should|maybe|might|could|possibly|seems|i think|i believe)\b/i.test(t)) issues.push("hedging");
  if (/\b(always|never|guarantee|ensures|must)\b/i.test(t)) issues.push("absolute_language");
  if (/\b(secure|security|encrypt|auth|token|key|secret)\b/i.test(t)) issues.push("security_claim");
  if (/\b(performance|latency|throughput|optimi[sz]e)\b/i.test(t)) issues.push("performance_claim");
  if (/\b(add|create|implement|wire|integrate|refactor|deploy)\b/i.test(t) && !/\b(file|route|endpoint|script|env|variable)\b/i.test(t)) {
    issues.push("missing_operational_detail");
  }
  return issues;
}

function buildCounter(fact, mode) {
  const clean = normalizeText(fact);
  const n = normalizeKey(clean);

  if (!n) {
    return {
      mode,
      counter: "Counter: No claim detected.",
      prompts: ["State a falsifiable claim and its success metric."],
    };
  }

  const hasAbsolute = /\b(always|never|guarantee|ensures)\b/.test(n);
  const hasMust = /\b(must|require)\b/.test(n);
  const hasSecurity = /\b(secure|security|encrypt|auth|token|key|secret)\b/.test(n);
  const hasPerformance = /\b(performance|latency|throughput|optimi[sz]e|fast|slow)\b/.test(n);
  const hasAction = /\b(add|create|implement|wire|integrate|refactor|deploy|start)\b/.test(n);

  if (mode === "devils_advocate") {
    if (hasSecurity) {
      return {
        mode,
        counter: "Counter: Security claims require a threat model, trust boundaries, and secret-handling guarantees.",
        prompts: [
          "Define the threat model and assumptions.",
          "List secrets, storage locations, and redaction points.",
          "Prove the claim under realistic attacker capabilities.",
        ],
      };
    }

    if (hasPerformance) {
      return {
        mode,
        counter: "Counter: Performance claims must specify workload, measurement method, and worst-case behavior.",
        prompts: [
          "Define workload and target metrics.",
          "State worst-case and tail behavior expectations.",
          "Show how bottlenecks are detected and mitigated.",
        ],
      };
    }

    if (hasAbsolute) {
      return {
        mode,
        counter: "Counter: Absolute claims fail under adversarial inputs, partial outages, or inconsistent state.",
        prompts: [
          "Provide a concrete counterexample scenario.",
          "Define boundary conditions and recovery behavior.",
          "Downgrade absolutes into measurable SLAs.",
        ],
      };
    }

    return {
      mode,
      counter: "Counter: The claim may not hold across edge cases and environment-specific constraints.",
      prompts: [
        "List environment assumptions.",
        "List edge cases that could falsify the claim.",
        "State what evidence would change your conclusion.",
      ],
    };
  }

  if (mode === "evidence_gap") {
    return {
      mode,
      counter: "Counter: The claim lacks evidence or falsifiability in the current deduction.",
      prompts: [
        "State the evidence that supports this claim.",
        "State what observation would falsify it.",
        "Attach metrics, logs, or tests to support it.",
      ],
    };
  }

  const prompts = [
    "Enumerate edge cases (timeouts, retries, empty inputs, schema drift).",
    "Name exact integration surfaces (routes, env vars, scripts).",
    "Define rollback or fallback behavior.",
  ];

  const counter = hasAction || hasMust
    ? "Counter: Implementation claims often miss contract mismatches and failure-handling in real integration."
    : "Counter: Integration can break due to mismatched contracts and missing operational details.";

  return {
    mode: "integration_risk",
    counter,
    prompts,
  };
}

function bestCoverage(targetTokens, accepted, targetFact) {
  let best = 0;
  for (const f of accepted) {
    if (!f || f.fact === targetFact) continue;
    const score = jaccardTokens(targetTokens, tokenizeKey(f.fact));
    if (score > best) best = score;
  }
  return best;
}

function critiqueTarget(target, accepted, mode) {
  const targetFact = normalizeText(target?.fact);
  const tokens = tokenizeKey(targetFact);
  const conf = clamp01(toNumber(target?.confidence, 0.55));
  const issues = issueSignals(targetFact);
  const issuePenalty = clamp01(issues.length / 6);
  const coverage = bestCoverage(tokens, accepted, targetFact);
  const vulnerability = clamp01(0.45 * (1 - conf) + 0.35 * issuePenalty + 0.2 * (1 - coverage));
  const counterStrength = clamp01(0.55 * issuePenalty + 0.45 * (1 - coverage));
  const counter = buildCounter(targetFact, mode);

  return {
    targetFact,
    mode: counter.mode,
    counter: counter.counter,
    prompts: counter.prompts,
    confidence: conf,
    coverage,
    counterStrength,
    vulnerability,
    issues,
  };
}

async function step4Critique(ctx) {
  const emit = ctx?.emit;
  const accepted = Array.isArray(ctx?.logic?.accepted) ? ctx.logic.accepted : [];
  if (accepted.length === 0) throw new Error("Step 4 failed: missing accepted facts");

  await pause(emit, { step: 4, message: "Titan Critique engaged. Generating 3 devil's-advocate counters." });

  const ranked = accepted
    .slice()
    .sort((a, b) => toNumber(b?.confidence, 0) - toNumber(a?.confidence, 0));
  const targets = ranked.slice(0, 3);
  const modes = ["devils_advocate", "evidence_gap", "integration_risk"];

  const counters = targets.map((t, i) => critiqueTarget(t, accepted, modes[i] || "devils_advocate"));

  await pause(emit, { step: 4, message: "Computing Survival Score from confidence, issue signals, and coverage." });

  const avgVulnerability = counters.reduce((acc, c) => acc + toNumber(c.vulnerability, 0), 0) / Math.max(1, counters.length);
  const survivalScore = clamp01(1 - avgVulnerability);

  const issues = [];
  for (const c of counters) {
    for (const tag of c.issues || []) {
      issues.push({ type: tag, fact: c.targetFact });
    }
  }

  return {
    critique: {
      counters,
      survivalScore: Number(survivalScore.toFixed(3)),
      issueCount: issues.length,
      issues,
    },
    survivalScore: Number(survivalScore.toFixed(3)),
  };
}

module.exports = step4Critique;

