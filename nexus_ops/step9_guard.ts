/**
 * NEXUS PRO V4 - Step 9: Guard
 * Final safety guard with profanity, bias, and hallucination heuristics
 */

import { pause } from "./ops_utils";
import { StepContext, GuardResult } from "./types";

function redactSecrets(s: string): string {
  return String(s || "")
    .replace(/\b(bb_[a-zA-Z0-9_-]{10,})\b/g, "[REDACTED]")
    .replace(/\b(sk-[a-zA-Z0-9_-]{10,})\b/g, "[REDACTED]")
    .replace(/BLACKBOX_API_KEY\s*=\s*[^\n]+/gi, "BLACKBOX_API_KEY=[REDACTED]");
}

function profanityHits(s: string): string[] {
  const words = ["fuck", "shit", "bitch", "asshole"];
  const t = String(s || "").toLowerCase();
  return words.filter((w) => t.includes(w));
}

function biasHits(s: string): string[] {
  const words = ["race", "religion", "ethnicity", "gender", "nationality"];
  const t = String(s || "").toLowerCase();
  return words.filter((w) => t.includes(w));
}

function hallucinationRisk(s: string): number {
  const t = String(s || "");
  const hedges = (t.match(/\b(maybe|might|could|possibly|seems|likely)\b/gi) || []).length;
  const absolutes = (t.match(/\b(always|never|guarantee|100%)\b/gi) || []).length;
  const numbers = (t.match(/\b\d{2,}\b/g) || []).length;
  const refs = (t.match(/\b(file|path|endpoint|http:\/\/localhost|npm run|package\.json)\b/gi) || []).length;
  const raw = 0.35 * (hedges / 8) + 0.25 * (absolutes / 6) + 0.25 * (numbers / 10) - 0.25 * (refs / 10);
  return Math.max(0, Math.min(1, raw));
}

interface GuardFlag {
  type: string;
  hits?: string[];
  score?: number;
}

async function step9Guard(ctx: StepContext): Promise<GuardResult> {
  const emit = ctx?.emit;
  const formatted = typeof ctx?.formatted === "string" ? ctx.formatted : "";
  if (!formatted.trim()) throw new Error("Step 9 failed: missing formatted output");

  await pause(emit, { step: 9, message: "Final guard engaged. Running profanity, bias, and hallucination heuristics." });

  const flags: GuardFlag[] = [];
  const prof = profanityHits(formatted);
  if (prof.length) flags.push({ type: "profanity", hits: prof });

  const bias = biasHits(formatted);
  if (bias.length) flags.push({ type: "bias_keywords", hits: bias });

  const risk = hallucinationRisk(formatted);
  if (risk >= 0.55) flags.push({ type: "hallucination_risk", score: risk });

  await pause(emit, { step: 9, message: `Guard analysis complete. Risk ${(risk || 0).toFixed(2)}. Flags ${flags.length}.` });

  const safeOutput = redactSecrets(formatted);
  return {
    safeOutput,
    flags,
    risk,
  };
}

export default step9Guard;

