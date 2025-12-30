export type NexusMode = "FLASH" | "DEEP_THINKING" | "APEX";

export interface ModelDefinition {
  id: string;
  name: string; // User-facing display name (SANITIZED - no provider/model IDs)
  model: string; // Internal backend model ID (NEVER exposed to UI)
  provider: "openrouter";
  reasoningEffort?: "Low" | "Medium" | "High" | "XHigh";
  timeoutMs: number;
  skipThreshold?: number;
}

/**
 * CRITICAL: Sanitize model names for UI display
 * MUST return ONLY: "FLASH", "DEEP_THINKING", or "APEX"
 * NEVER expose provider names, model IDs, or vendor identifiers
 */
export function sanitizeModelNameForUI(input: string | null | undefined, mode?: NexusMode): string {
  const raw = String(input || "").trim();
  if (!raw) return "FLASH"; // Default fallback

  // Check mode-based mapping first
  if (mode) {
    return mode; // Return the mode directly (already sanitized)
  }

  // Normalize input to uppercase for comparison
  const normalized = raw.toUpperCase();

  // Direct mode match
  if (normalized === "FLASH" || normalized === "DEEP_THINKING" || normalized === "APEX") {
    return normalized as NexusMode;
  }

  // Legacy internal model ID mapping
  if (normalized === "NEXUS_FLASH_PRO" || normalized === "MIMO_V2") {
    return "FLASH";
  }
  if (normalized === "NEXUS_THINKING_PRO" || normalized === "NEXUS_DEEP_THINKING") {
    return "DEEP_THINKING";
  }
  if (normalized === "NEXUS_APEX_OMNI" || normalized === "NEXUS_APEX_OMENI" || normalized === "SUPER_THINKING") {
    return "APEX";
  }

  // Check if it's a provider model ID (contains "/" or ":")
  if (raw.includes("/") || raw.includes(":")) {
    // Lookup in registry to determine mode
    const def = getModelDefinition(raw);
    if (def) {
      // Determine mode based on model presence in mode collections
      if (MODE_MODELS.FLASH.includes(def.id)) return "FLASH";
      if (MODE_MODELS.DEEP_THINKING.includes(def.id)) return "DEEP_THINKING";
      if (MODE_MODELS.APEX.includes(def.id)) return "APEX";
    }
    // Fallback for unknown provider models
    return "DEEP_THINKING";
  }

  // Check if it's an internal model ID from registry
  const modelDef = MODEL_REGISTRY[raw as keyof typeof MODEL_REGISTRY];
  if (modelDef) {
    if (MODE_MODELS.FLASH.includes(modelDef.id)) return "FLASH";
    if (MODE_MODELS.DEEP_THINKING.includes(modelDef.id)) return "DEEP_THINKING";
    if (MODE_MODELS.APEX.includes(modelDef.id)) return "APEX";
  }

  // Ultimate fallback
  return "FLASH";
}

const MODEL_REGISTRY: Record<string, ModelDefinition> = {
  // ============================================================================
  // FLASH MODE - Single ultra-fast model
  // ============================================================================
  "NEXUS_FLASH_PRO": {
    id: "mimo_v2",
    name: "FLASH", // SANITIZED: User sees only mode name
    model: "xiaomi/mimo-v2-flash:free", // INTERNAL: Never exposed to UI
    provider: "openrouter",
    reasoningEffort: undefined,
    timeoutMs: 2500,
  },

  // ============================================================================
  // DEEP_THINKING MODE - 7 parallel reasoning models
  // ============================================================================
  "olmo_think": {
    id: "olmo_think",
    name: "Reasoning Agent", // SANITIZED: Generic agent name
    model: "allenai/olmo-3.1-32b-think:free", // INTERNAL: Never exposed to UI
    provider: "openrouter",
    reasoningEffort: "High",
    timeoutMs: 10000,
    skipThreshold: 0.05,
  },
  "nemotron_nano": {
    id: "nemotron_nano",
    name: "Reasoning Agent", // SANITIZED: Generic agent name
    model: "nvidia/nemotron-3-nano-30b-a3b:free", // INTERNAL: Never exposed to UI
    provider: "openrouter",
    reasoningEffort: "High",
    timeoutMs: 10000,
    skipThreshold: 0.05,
  },
  "llama_70b": {
    id: "llama_70b",
    name: "Reasoning Agent", // SANITIZED: Generic agent name
    model: "meta-llama/llama-3.3-70b-instruct:free", // INTERNAL: Never exposed to UI
    provider: "openrouter",
    reasoningEffort: "High",
    timeoutMs: 10000,
    skipThreshold: 0.05,
  },
  "devstral": {
    id: "devstral",
    name: "Reasoning Agent", // SANITIZED: Generic agent name
    model: "mistralai/devstral-2512:free", // INTERNAL: Never exposed to UI
    provider: "openrouter",
    reasoningEffort: "High",
    timeoutMs: 10000,
    skipThreshold: 0.05,
  },
  "deepseek_r1t2": {
    id: "deepseek_r1t2",
    name: "Reasoning Agent", // SANITIZED: Generic agent name
    model: "tngtech/deepseek-r1t2-chimera:free", // INTERNAL: Never exposed to UI
    provider: "openrouter",
    reasoningEffort: "High",
    timeoutMs: 10000,
    skipThreshold: 0.05,
  },
  "deepseek_nex": {
    id: "deepseek_nex",
    name: "Reasoning Agent", // SANITIZED: Generic agent name
    model: "nex-agi/deepseek-v3.1-nex-n1:free", // INTERNAL: Never exposed to UI
    provider: "openrouter",
    reasoningEffort: "High",
    timeoutMs: 10000,
    skipThreshold: 0.05,
  },
  "gpt_oss_20b": {
    id: "gpt_oss_20b",
    name: "Reasoning Agent", // SANITIZED: Generic agent name
    model: "openai/gpt-oss-20b:free", // INTERNAL: Never exposed to UI
    provider: "openrouter",
    reasoningEffort: "High",
    timeoutMs: 10000,
    skipThreshold: 0.05,
  },

  // ============================================================================
  // APEX MODE - Extended specialist models (5 additional experts)
  // ============================================================================
  "gpt_oss_120b": {
    id: "gpt_oss_120b",
    name: "Specialist Agent", // SANITIZED: Generic agent name
    model: "openai/gpt-oss-120b:free", // INTERNAL: Never exposed to UI
    provider: "openrouter",
    reasoningEffort: "XHigh",
    timeoutMs: 15000,
    skipThreshold: 0.05,
  },
  "kat_coder_pro": {
    id: "kat_coder_pro",
    name: "Specialist Agent", // SANITIZED: Generic agent name
    model: "kwaipilot/kat-coder-pro:free", // INTERNAL: Never exposed to UI
    provider: "openrouter",
    reasoningEffort: "XHigh",
    timeoutMs: 15000,
    skipThreshold: 0.05,
  },
  "deepseek_r1": {
    id: "deepseek_r1",
    name: "Specialist Agent", // SANITIZED: Generic agent name
    model: "tngtech/deepseek-r1t-chimera:free", // INTERNAL: Never exposed to UI
    provider: "openrouter",
    reasoningEffort: "XHigh",
    timeoutMs: 15000,
    skipThreshold: 0.05,
  },
  "qwen_coder": {
    id: "qwen_coder",
    name: "Specialist Agent", // SANITIZED: Generic agent name
    model: "qwen/qwen3-coder:free", // INTERNAL: Never exposed to UI
    provider: "openrouter",
    reasoningEffort: "XHigh",
    timeoutMs: 15000,
    skipThreshold: 0.05,
  },
  "hermes_405b": {
    id: "hermes_405b",
    name: "Specialist Agent", // SANITIZED: Generic agent name
    model: "nousresearch/hermes-3-llama-3.1-405b:free", // INTERNAL: Never exposed to UI
    provider: "openrouter",
    reasoningEffort: "XHigh",
    timeoutMs: 15000,
    skipThreshold: 0.05,
  },
};

// ============================================================================
// MODE COLLECTIONS BY MODE
// ============================================================================
const MODE_MODELS: Record<NexusMode, string[]> = {
  FLASH: ["NEXUS_FLASH_PRO"],
  DEEP_THINKING: [
    "olmo_think",
    "nemotron_nano",
    "llama_70b",
    "devstral",
    "deepseek_r1t2",
    "deepseek_nex",
    "gpt_oss_20b",
  ],
  APEX: [
    // All DEEP_THINKING models (7 models)
    "olmo_think",
    "nemotron_nano",
    "llama_70b",
    "devstral",
    "deepseek_r1t2",
    "deepseek_nex",
    "gpt_oss_20b",
    // Extended APEX models (5 expert models)
    "gpt_oss_120b",
    "kat_coder_pro",
    "deepseek_r1",
    "qwen_coder",
    "hermes_405b",
  ],
};

const MODE_ALIASES: Record<string, NexusMode> = {
  FLASH: "FLASH",
  STANDARD: "FLASH",
  "NEXUS_FLASH_PRO": "FLASH",
  DEEP_THINKING: "DEEP_THINKING",
  DEEP: "DEEP_THINKING",
  "DEEP-SCAN": "DEEP_THINKING",
  DEEP_SCAN: "DEEP_THINKING",
  THINKING: "DEEP_THINKING",
  "DEEP-THINKING": "DEEP_THINKING",
  "SUPER_THINKING": "APEX",
  "SUPER-THINKING": "APEX",
  SUPERTHINKING: "APEX",
  CODER: "APEX",
  APEX: "APEX",
  APEX_OMENI: "APEX",
  APEX_OMNI: "APEX",
};

export type InternalModelName = keyof typeof MODEL_REGISTRY;
export type NexusModeInput = NexusMode | string;
type ModeInput = NexusModeInput | null | undefined;

export function normalizeRegistryMode(mode: ModeInput): NexusMode {
  const key = String(mode || "").trim().toUpperCase();
  return MODE_ALIASES[key] ?? "FLASH";
}

// ============================================================================
// PUBLIC API
// ============================================================================
export function resolveModelId(internalNameOrId: string): string {
  const key = Object.keys(MODEL_REGISTRY).find(k =>
    k === internalNameOrId || MODEL_REGISTRY[k].id === internalNameOrId
  );
  if (!key) {
    return internalNameOrId;
  }
  return MODEL_REGISTRY[key].model;
}

export function getModelsForMode(mode: ModeInput): ModelDefinition[] {
  const normalized = normalizeRegistryMode(mode);
  const modelKeys = MODE_MODELS[normalized] || [];
  return modelKeys.map(key => MODEL_REGISTRY[key]).filter(Boolean);
}

export function getModelDefinition(modelId: string): ModelDefinition | undefined {
  return Object.values(MODEL_REGISTRY).find(m => m.id === modelId || m.model === modelId);
}

export function shouldSkipModel(
  modelId: string,
  error: Error | null,
  latencyMs: number
): boolean {
  const def = getModelDefinition(modelId);
  if (!def) return false;

  // Skip on any error
  if (error) return true;

  // Skip if latency exceeds timeout
  if (latencyMs > def.timeoutMs) return true;

  // Skip if random threshold exceeded (for probabilistic skipping)
  if (def.skipThreshold && Math.random() < def.skipThreshold) {
    return true;
  }

  return false;
}

export function getAggregatorModels(): ModelDefinition[] {
  return [
    MODEL_REGISTRY["NEXUS_FLASH_PRO"],
    MODEL_REGISTRY["deepseek_nex"],
  ].filter(Boolean);
}

export function getAllInternalNames(): InternalModelName[] {
  return Object.keys(MODEL_REGISTRY) as InternalModelName[];
}
