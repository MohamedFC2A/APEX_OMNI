/**
 * NEXUS PRO V4 - Step 5: Synthesis
 * Core synthesis with weighted fact aggregation
 */

import { pause } from "./ops_utils";
import { StepContext, Fact } from "./types";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function agentWeight(agent: string): number {
  if (agent === "reasoner") return 1.15;
  if (agent === "math_code_wizard") return 1.12;
  if (agent === "context_king") return 1.05;
  if (agent === "generalist") return 1.0;
  if (agent === "efficient_backup") return 0.9;
  return 1.0;
}

function normalizeKey(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[`*_#>]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function clusterKey(fact: string): string {
  const words = normalizeKey(fact).split(" ").filter(Boolean);
  return words.slice(0, 7).join(" ");
}

interface ScoredFact extends Fact {
  weight: number;
  score: number;
}

function summarizeFacts(facts: ScoredFact[], maxChars: number): string {
  const lines: string[] = [];
  let used = 0;
  for (const f of facts) {
    const s = String(f.fact || "").trim();
    if (!s) continue;
    if (used + s.length > maxChars) break;
    lines.push(s.endsWith(".") ? s : `${s}.`);
    used += s.length;
  }
  return lines.join(" ");
}

async function step5Synthesis(ctx: StepContext): Promise<string> {
  const emit = ctx?.emit;
  const accepted = Array.isArray(ctx?.logic?.accepted) ? ctx.logic.accepted : [];
  if (accepted.length === 0) throw new Error("Step 5 failed: no accepted facts");

  await pause(emit, { step: 5, message: "Core synthesis engaged. Weighting facts by model specialty." });

  const scored: ScoredFact[] = accepted
    .map((f) => {
      const w = agentWeight(f?.source?.agent);
      const c = typeof f.confidence === "number" ? f.confidence : 0.5;
      return {
        ...f,
        weight: w,
        score: clamp01(c * w),
      };
    })
    .sort((a, b) => b.score - a.score);

  await pause(emit, { step: 5, message: "Clustering high-score facts to reduce redundancy." });

  const clusters = new Map<string, ScoredFact[]>();
  for (const f of scored) {
    const k = clusterKey(f.fact);
    const arr = clusters.get(k) || [];
    arr.push(f);
    clusters.set(k, arr);
  }

  const merged: ScoredFact[] = [];
  for (const arr of clusters.values()) {
    const best = arr.slice().sort((a, b) => b.score - a.score)[0];
    merged.push(best);
  }

  const top = merged.slice().sort((a, b) => b.score - a.score).slice(0, 22);
  const shortAnswer = summarizeFacts(top.slice(0, 8), 650);

  await pause(emit, { step: 5, message: "Synthesizing consensus narrative and action-oriented output." });

  const conflicts = Array.isArray(ctx?.logic?.conflicts) ? ctx.logic.conflicts : [];
  const attacks = Array.isArray(ctx?.critique?.attacks) ? ctx.critique.attacks : [];

  const draft = [
    "# Apex OMNI (NEXUS) — Hyper-Complexity Output",
    "",
    "## Core Answer",
    shortAnswer || "No summary could be synthesized.",
    "",
    "## Weighted Findings",
    ...top.map((f) => {
      const agent = f?.source?.agent || "unknown";
      const model = f?.source?.model || "unknown";
      const conf = typeof f.confidence === "number" ? f.confidence.toFixed(2) : "0.50";
      const score = typeof f.score === "number" ? f.score.toFixed(2) : "0.50";
      return `- (${agent} | ${conf} | score ${score}) ${f.fact} [${model}]`;
    }),
    "",
    "## Conflict Resolution",
    conflicts.length
      ? conflicts.slice(0, 6).map((c) => `- Topic: ${c.topic}\n  - A: ${c.a}\n  - B: ${c.b}\n  - Tie-breaker: ${c.tieBreaker}`).join("\n")
      : "- No direct contradictions detected by heuristic scan.",
    "",
    "## Adversarial Critique",
    attacks.length
      ? attacks.map((a, i) => `- Attack ${i + 1}: ${a.counter}\n  - Target: ${a.targetFact}\n  - Support score: ${(a.supportScore || 0).toFixed(2)}`).join("\n")
      : "- No adversarial counters generated.",
  ].join("\n");

  return draft;
}

export default step5Synthesis;

