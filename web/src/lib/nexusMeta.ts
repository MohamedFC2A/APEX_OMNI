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
 * STANDARD MODE - Multiple OpenRouter models
 */
export const STANDARD_AGENTS: AgentMeta[] = [
  {
    agent: "mimo_v2",
    agentName: "Mimo V2 Flash",
    model: "xiaomi/mimo-v2-flash:free"
  },
  {
    agent: "devstral",
    agentName: "Devstral 2512",
    model: "mistralai/devstral-2512:free"
  },
  {
    agent: "deepseek_nex",
    agentName: "DeepSeek V3.1 NEX",
    model: "nex-agi/deepseek-v3.1-nex-n1:free"
  },
  {
    agent: "olmo_think",
    agentName: "OLMo 3.1 32B Think",
    model: "allenai/olmo-3.1-32b-think:free"
  },
  {
    agent: "gpt_oss_20b",
    agentName: "GPT-OSS 20B",
    model: "openai/gpt-oss-20b:free"
  },
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
 * SUPER THINKING MODE (SUPER CODER) - Ultimate reasoning with DeepSeek R1 + Coding models
 */
export const SUPER_THINKING_AGENTS: AgentMeta[] = [
  {
    agent: "deepseek_reasoner",
    agentName: "DeepSeek Reasoner",
    model: "deepseek-reasoner"
  },
  {
    agent: "qwen_coder",
    agentName: "Qwen3 Coder",
    model: "qwen/qwen3-coder:free"
  },
  {
    agent: "kat_coder",
    agentName: "Kat Coder Pro",
    model: "kwaipilot/kat-coder-pro:free"
  },
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

