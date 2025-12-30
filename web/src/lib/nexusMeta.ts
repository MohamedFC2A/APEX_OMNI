import {
  getModelsForMode,
  normalizeRegistryMode,
  resolveModelId,
  sanitizeModelNameForUI,
  type ModelDefinition,
  type NexusMode,
} from "./modelRegistry";

export type AgentMeta = {
  agent: string;
  agentName: string;
  model: string;
  reasoningEffort?: "Low" | "Medium" | "High" | "XHigh";
  initialMessage?: string;
};

// ============================================================================
// AGENT COLLECTIONS (Derived from Model Registry)
// ============================================================================

function buildAgentMetaFromModels(models: ModelDefinition[], mode: NexusMode): AgentMeta[] {
  return models.map(def => ({
    agent: def.id,
    agentName: def.name,
    model: sanitizeModelNameForUI(def.model, mode),
    reasoningEffort: def.reasoningEffort,
    initialMessage: def.id === "mimo_v2" ? "Flash ready" : undefined,
  }));
}

// FLASH MODE: Single ultra-fast model
export const STANDARD_AGENTS: AgentMeta[] = buildAgentMetaFromModels(
  getModelsForMode("FLASH"),
  "FLASH"
);

// DEEP_THINKING MODE: 7 parallel reasoning models
export const THINKING_AGENTS: AgentMeta[] = buildAgentMetaFromModels(
  getModelsForMode("DEEP_THINKING"),
  "DEEP_THINKING"
);

// APEX MODE: Extended specialist models
export const SUPER_THINKING_AGENTS: AgentMeta[] = buildAgentMetaFromModels(
  getModelsForMode("APEX"),
  "APEX"
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function resolveAgentModel(agentMeta: AgentMeta): string {
  return resolveModelId(agentMeta.model);
}

export function getAgentMetaForMode(mode: NexusMode | string): AgentMeta[] {
  const normalized = normalizeRegistryMode(mode);
  if (normalized === "DEEP_THINKING") return THINKING_AGENTS;
  if (normalized === "APEX") return SUPER_THINKING_AGENTS;
  return STANDARD_AGENTS;
}

export function getAllAgentMeta() {
  return {
    standardAgents: STANDARD_AGENTS,
    thinkingAgents: THINKING_AGENTS,
    superThinkingAgents: SUPER_THINKING_AGENTS,
  };
}
