/**
 * NEXUS PRO V4 - Operations Pipeline
 * Main entry point for all pipeline operations
 */

// Re-export all types
export * from "./types";

// Re-export utilities
export { sleep, randInt, emitLog, pause } from "./ops_utils";

// Re-export health check and system prompts
export { nexusHealthCheck, OFFICIAL_MODELS, STEPS } from "./healthCheck";
export {
  NEXUS_SYSTEM_PROMPT,
  NEXUS_STANDARD_PROMPT,
  NEXUS_THINKING_PROMPT,
  NEXUS_SUPER_CODER_PROMPT,
} from "./systemPrompts";

// Import step functions
import step1Swarm, { AGENTS } from "./step1_swarm";
import step2Deconstruct from "./step2_deconstruct";
import step3Logic from "./step3_logic";
import step4Critique from "./step4_critique";
import step5Synthesis from "./step5_synthesis";
import step6Verify from "./step6_verify";
import step7Refine from "./step7_refine";
import step8Format from "./step8_format";
import step9Guard from "./step9_guard";
import step10Truth from "./step10_truth";

// Export step functions
export {
  step1Swarm,
  step2Deconstruct,
  step3Logic,
  step4Critique,
  step5Synthesis,
  step6Verify,
  step7Refine,
  step8Format,
  step9Guard,
  step10Truth,
  AGENTS,
};

// Default export for convenience
export default {
  step1Swarm,
  step2Deconstruct,
  step3Logic,
  step4Critique,
  step5Synthesis,
  step6Verify,
  step7Refine,
  step8Format,
  step9Guard,
  step10Truth,
  AGENTS,
};

