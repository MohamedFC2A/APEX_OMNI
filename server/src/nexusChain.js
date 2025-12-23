// Import from compiled nexus_ops dist folder
const step1Swarm = require("../../nexus_ops/dist/step1_swarm").default;
const step2Deconstruct = require("../../nexus_ops/dist/step2_deconstruct").default;
const step3Logic = require("../../nexus_ops/dist/step3_logic").default;
const step4Critique = require("../../nexus_ops/dist/step4_critique").default;
const step5Synthesis = require("../../nexus_ops/dist/step5_synthesis").default;
const step6Verify = require("../../nexus_ops/dist/step6_verify").default;
const step7Refine = require("../../nexus_ops/dist/step7_refine").default;
const step8Format = require("../../nexus_ops/dist/step8_format").default;
const step9Guard = require("../../nexus_ops/dist/step9_guard").default;
const step10Truth = require("../../nexus_ops/dist/step10_truth").default;

function normalizeMode(mode, thinkingNexus) {
  const m = typeof mode === "string" ? mode.trim().toLowerCase() : "";
  if (m === "standard" || m === "deep" || m === "coder") return m;
  if (m === "thinking") return "deep";
  if (m === "deep-scan" || m === "deepscan" || m === "deep_scan") return "deep";
  if (m === "coder-mode" || m === "coder_mode" || m === "code") return "coder";
  return thinkingNexus ? "deep" : "standard";
}

function redactSecrets(input) {
  return String(input || "")
    .replace(/\b(bb_[a-zA-Z0-9_\-]{10,})\b/g, "[REDACTED]")
    .replace(/\b(sk-[a-zA-Z0-9_\-]{10,})\b/g, "[REDACTED]")
    .replace(/\b(csk-[a-zA-Z0-9_\-]{10,})\b/g, "[REDACTED]")
    .replace(/BLACKBOX_API_KEY\s*=\s*[^\n]+/gi, "BLACKBOX_API_KEY=[REDACTED]")
    .replace(/CEREBRAS_API_KEY\s*=\s*[^\n]+/gi, "CEREBRAS_API_KEY=[REDACTED]");
}

const steps = [
  {
    id: 1,
    name: "Swarm Gathering",
    run: async (ctx) => {
      const swarm = await step1Swarm(ctx.userQuery, { emit: ctx.emit, thinkingNexus: ctx.thinkingNexus, mode: ctx.mode });
      return { ...ctx, swarm };
    },
  },
  {
    id: 2,
    name: "Omni_Deconstruct",
    run: async (ctx) => {
      const facts = await step2Deconstruct(ctx);
      return { ...ctx, facts };
    },
  },
  {
    id: 3,
    name: "Apex_Logic",
    run: async (ctx) => {
      const logic = await step3Logic(ctx);
      return { ...ctx, logic };
    },
  },
  {
    id: 4,
    name: "Titan_Critique",
    run: async (ctx) => {
      const critique = await step4Critique(ctx);
      return { ...ctx, critique };
    },
  },
  {
    id: 5,
    name: "Core_Synthesis",
    run: async (ctx) => {
      const draft = await step5Synthesis(ctx);
      return { ...ctx, draft };
    },
  },
  {
    id: 6,
    name: "Deep_Verify",
    run: async (ctx) => {
      const verified = await step6Verify(ctx);
      return { ...ctx, verified };
    },
  },
  {
    id: 7,
    name: "Quantum_Refine",
    run: async (ctx) => {
      const refined = await step7Refine(ctx);
      return { ...ctx, refined };
    },
  },
  {
    id: 8,
    name: "Matrix_Format",
    run: async (ctx) => {
      const formatted = await step8Format(ctx);
      return { ...ctx, formatted };
    },
  },
  {
    id: 9,
    name: "Final_Guard",
    run: async (ctx) => {
      const guard = await step9Guard(ctx);
      return { ...ctx, guard };
    },
  },
  {
    id: 10,
    name: "Absolute_Truth",
    run: async (ctx) => {
      const presentation = await step10Truth(ctx);
      return { ...ctx, presentation };
    },
  },
];

async function runNexusChain({ userQuery, emit, thinkingNexus, mode } = {}) {
  const startedAt = Date.now();
  const normalizedMode = normalizeMode(mode, thinkingNexus);

  let ctx = {
    userQuery,
    mode: normalizedMode,
    thinkingNexus: normalizedMode === "deep",
    emit,
    swarm: null,
    facts: [],
    logic: null,
    critique: null,
    draft: null,
    verified: null,
    refined: null,
    formatted: null,
    guard: null,
    presentation: null,
  };

  for (const step of steps) {
    const stepStartedAt = Date.now();
    emit?.({ type: "step_start", step: step.id, name: step.name, at: stepStartedAt });
    emit?.({ type: "step_progress", step: step.id, percent: 0, at: stepStartedAt });

    try {
      ctx = await step.run(ctx);
    } catch (error) {
      const at = Date.now();
      emit?.({
        type: "step_finish",
        step: step.id,
        name: step.name,
        status: "error",
        at,
        durationMs: at - stepStartedAt,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }

    const at = Date.now();
    emit?.({ type: "step_progress", step: step.id, percent: 100, at });
    emit?.({
      type: "step_finish",
      step: step.id,
      name: step.name,
      status: "completed",
      at,
      durationMs: at - stepStartedAt,
    });
  }

  const rawAnswer =
    typeof ctx.presentation?.answer === "string"
      ? ctx.presentation.answer
      : typeof ctx.formatted === "string"
        ? ctx.formatted
        : typeof ctx.refined === "string"
          ? ctx.refined
          : typeof ctx.verified === "string"
            ? ctx.verified
            : typeof ctx.draft === "string"
              ? ctx.draft
              : "";

  const safeAnswer = redactSecrets(rawAnswer);
  const guardSafe = typeof ctx.guard?.safeOutput === "string" ? ctx.guard.safeOutput : "";

  return {
    startedAt,
    finishedAt: Date.now(),
    answer: safeAnswer.trim() ? safeAnswer : guardSafe,
    steps: {
      swarm: ctx.swarm,
      facts: ctx.facts,
      logic: ctx.logic,
      critique: ctx.critique,
      draft: ctx.draft,
      verified: ctx.verified,
      refined: ctx.refined,
      formatted: ctx.formatted,
      guard: ctx.guard,
      presentation: ctx.presentation,
    },
  };
}

module.exports = { runNexusChain };
