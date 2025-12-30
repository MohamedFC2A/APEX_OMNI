/**
 * NEXUS Agent Registry
 * Maps models to unique agent IDs for pipeline execution
 * Never expose backend model IDs to frontend
 */

import type { NexusMode } from "./modelRegistry";
import { getModelsForMode, type ModelDefinition } from "./modelRegistry";

export type AgentId = 
  | "NEXUS_FLASH_A"
  | "NEXUS_THINKER_A" | "NEXUS_THINKER_B" | "NEXUS_THINKER_C" | "NEXUS_THINKER_D" | "NEXUS_THINKER_E" | "NEXUS_THINKER_F" | "NEXUS_THINKER_G"
  | "NEXUS_APEX_A" | "NEXUS_APEX_B" | "NEXUS_APEX_C" | "NEXUS_APEX_D" | "NEXUS_APEX_E"
  | "NEXUS_AGGREGATOR" | "NEXUS_FALLBACK";

/**
 * Agent ID mapping for FLASH mode
 */
const FLASH_AGENT_MAP: Record<string, AgentId> = {
  "NEXUS_FLASH_PRO": "NEXUS_FLASH_A",
  "mimo_v2": "NEXUS_FLASH_A",
};

/**
 * Agent ID mapping for DEEP_THINKING mode (7 models)
 */
const DEEP_THINKING_AGENT_MAP: Record<string, AgentId> = {
  "olmo_think": "NEXUS_THINKER_A",
  "nemotron_nano": "NEXUS_THINKER_B",
  "llama_70b": "NEXUS_THINKER_C",
  "devstral": "NEXUS_THINKER_D",
  "deepseek_r1t2": "NEXUS_THINKER_E",
  "deepseek_nex": "NEXUS_THINKER_F",
  "gpt_oss_20b": "NEXUS_THINKER_G",
};

/**
 * Agent ID mapping for APEX mode (5 additional specialists)
 */
const APEX_AGENT_MAP: Record<string, AgentId> = {
  "gpt_oss_120b": "NEXUS_APEX_A",
  "kat_coder_pro": "NEXUS_APEX_B",
  "deepseek_r1": "NEXUS_APEX_C",
  "qwen_coder": "NEXUS_APEX_D",
  "hermes_405b": "NEXUS_APEX_E",
};

/**
 * Get unique agent ID for a model based on mode and model ID
 */
export function getAgentIdForModel(
  modelId: string,
  mode: NexusMode,
  index?: number
): AgentId {
  // FLASH mode
  if (mode === "FLASH") {
    return FLASH_AGENT_MAP[modelId] || "NEXUS_FLASH_A";
  }

  // DEEP_THINKING mode
  if (mode === "DEEP_THINKING") {
    const agentId = DEEP_THINKING_AGENT_MAP[modelId];
    if (agentId) return agentId;
    
    // Fallback to indexed agent if not in map
    const thinkerAgents: AgentId[] = [
      "NEXUS_THINKER_A", "NEXUS_THINKER_B", "NEXUS_THINKER_C",
      "NEXUS_THINKER_D", "NEXUS_THINKER_E", "NEXUS_THINKER_F", "NEXUS_THINKER_G"
    ];
    return thinkerAgents[index ?? 0] || "NEXUS_THINKER_A";
  }

  // APEX mode
  if (mode === "APEX") {
    // Check if it's a DEEP_THINKING model first
    const thinkerAgentId = DEEP_THINKING_AGENT_MAP[modelId];
    if (thinkerAgentId) return thinkerAgentId;

    // Check if it's an APEX specialist
    const apexAgentId = APEX_AGENT_MAP[modelId];
    if (apexAgentId) return apexAgentId;

    // Fallback to indexed agent
    const apexAgents: AgentId[] = [
      "NEXUS_APEX_A", "NEXUS_APEX_B", "NEXUS_APEX_C", "NEXUS_APEX_D", "NEXUS_APEX_E"
    ];
    return apexAgents[index ?? 0] || "NEXUS_APEX_A";
  }

  // Default fallback
  return "NEXUS_FLASH_A";
}

/**
 * Get agent ID for aggregator
 */
export function getAggregatorAgentId(): AgentId {
  return "NEXUS_AGGREGATOR";
}

/**
 * Get agent ID for fallback
 */
export function getFallbackAgentId(): AgentId {
  return "NEXUS_FALLBACK";
}

/**
 * Get all agent IDs for a mode
 */
export function getAgentIdsForMode(mode: NexusMode): AgentId[] {
  const models = getModelsForMode(mode);
  return models.map((model, index) => 
    getAgentIdForModel(model.id, mode, index)
  );
}

/**
 * Get user-friendly display name for agent ID
 * Never expose backend model IDs
 */
export function getAgentDisplayName(agentId: AgentId, modelDef?: ModelDefinition): string {
  // Use model definition name if available
  if (modelDef?.name) {
    return modelDef.name;
  }

  // Fallback to agent ID mapping
  const displayNames: Record<AgentId, string> = {
    "NEXUS_FLASH_A": "NEXUS_FLASH_PRO",
    "NEXUS_THINKER_A": "Reasoning Agent A",
    "NEXUS_THINKER_B": "Reasoning Agent B",
    "NEXUS_THINKER_C": "Reasoning Agent C",
    "NEXUS_THINKER_D": "Reasoning Agent D",
    "NEXUS_THINKER_E": "Reasoning Agent E",
    "NEXUS_THINKER_F": "Reasoning Agent F",
    "NEXUS_THINKER_G": "Reasoning Agent G",
    "NEXUS_APEX_A": "Specialist Agent A",
    "NEXUS_APEX_B": "Specialist Agent B",
    "NEXUS_APEX_C": "Specialist Agent C",
    "NEXUS_APEX_D": "Specialist Agent D",
    "NEXUS_APEX_E": "Specialist Agent E",
    "NEXUS_AGGREGATOR": "Aggregator",
    "NEXUS_FALLBACK": "Fallback",
  };

  return displayNames[agentId] || "NEXUS Agent";
}

/**
 * Verify agent ID is unique (never reused)
 */
export function validateAgentIdUniqueness(): boolean {
  const allAgentIds = new Set<AgentId>();
  
  // Collect all agent IDs
  Object.values(FLASH_AGENT_MAP).forEach(id => allAgentIds.add(id));
  Object.values(DEEP_THINKING_AGENT_MAP).forEach(id => allAgentIds.add(id));
  Object.values(APEX_AGENT_MAP).forEach(id => allAgentIds.add(id));
  
  // Check for duplicates
  const uniqueCount = allAgentIds.size;
  const totalCount = 
    Object.keys(FLASH_AGENT_MAP).length +
    Object.keys(DEEP_THINKING_AGENT_MAP).length +
    Object.keys(APEX_AGENT_MAP).length;
  
  return uniqueCount === totalCount;
}
