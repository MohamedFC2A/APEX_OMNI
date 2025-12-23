/**
 * NEXUS PRO 1.0 - DeepSeek-Only Agent Metadata
 * 
 * This module defines strongly-typed agent metadata for all Nexus modes.
 * All agents now use official DeepSeek models exclusively.
 */

export type AgentMeta = {
  agent: string;
  agentName: string;
  model: string;
};

/**
 * STANDARD MODE - Fast, direct answers with DeepSeek V3
 */
export const STANDARD_AGENTS: AgentMeta[] = [
  {
    agent: "nexus_fast",
    agentName: "Nexus Fast (DeepSeek)",
    model: "deepseek-chat"
  }
];

/**
 * THINKING MODE - Deep reasoning with DeepSeek V3
 */
export const THINKING_AGENTS: AgentMeta[] = [
  {
    agent: "nexus_pro",
    agentName: "Nexus Pro Engine",
    model: "deepseek-chat"
  }
];

/**
 * SUPER THINKING MODE (SUPER CODER) - Ultimate reasoning with DeepSeek R1
 * Only uses a single DeepSeek Reasoner model
 */
export const SUPER_THINKING_AGENTS: AgentMeta[] = [
  {
    agent: "nexus_pro_1",
    agentName: "Nexus Pro R1",
    model: "deepseek-reasoner"
  }
];

/**
 * Get agents for a specific mode
 */
export function getAgentsForMode(mode: "standard" | "thinking" | "super_thinking"): AgentMeta[] {
  switch (mode) {
    case "standard":
      return STANDARD_AGENTS;
    case "thinking":
      return THINKING_AGENTS;
    case "super_thinking":
      return SUPER_THINKING_AGENTS;
    default:
      return STANDARD_AGENTS;
  }
}

/**
 * Get all agent metadata (for backwards compatibility with old API)
 */
export function getAllAgentMeta() {
  return {
    standardAgents: STANDARD_AGENTS,
    thinkingAgents: THINKING_AGENTS,
    superThinkingAgents: SUPER_THINKING_AGENTS,
  };
}

