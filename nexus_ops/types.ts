/**
 * NEXUS PRO V4 - SHARED TYPES
 * Strict TypeScript interfaces for the complete Nexus pipeline
 */

// ============================================================================
// NEXUS MODES
// ============================================================================

export type NexusMode = "standard" | "thinking" | "super_thinking";
export type InternalMode = "standard" | "deep" | "coder";

// ============================================================================
// EMIT / EVENT SYSTEM
// ============================================================================

export type EmitFunction = (payload: StepEvent | LogEvent | AgentEvent | ProgressEvent) => void;

export interface BaseEvent {
  type: string;
  at: number;
}

export interface StepEvent extends BaseEvent {
  type: "step_start" | "step_finish" | "step_progress";
  step: number;
  status?: "idle" | "processing" | "completed" | "error";
  label?: string;
  percent?: number;
  message?: string;
}

export interface LogEvent extends BaseEvent {
  type: "log";
  step?: number;
  message: string;
}

export interface AgentEvent extends BaseEvent {
  type: "agent_start" | "agent_finish";
  step?: number;
  agent: string;
  agentName: string;
  model: string;
  status?: "idle" | "running" | "completed" | "failed";
  duration?: string;
  durationMs?: number;
  output_snippet?: string;
  error?: string | null;
  errorDetail?: ErrorDetail;
}

export interface ProgressEvent extends BaseEvent {
  type: "step_progress";
  step: number;
  percent: number;
}

// ============================================================================
// AGENT METADATA & EXECUTION
// ============================================================================

export interface AgentMeta {
  agent: string;
  agentName: string;
  model: string;
  provider?: string;
  models?: string[];
}

export interface AgentExecution {
  agent: string;
  model: string;
  status: "completed" | "failed";
  result: {
    content: string;
    output?: string;
    text?: string;
    message?: string;
  };
  error?: string | null;
  errorDetail?: ErrorDetail;
}

export interface ErrorDetail {
  provider: string;
  model: string;
  httpStatus: number | null;
  errorType: string;
  message: string;
  retryCount: number;
  retryDelayMs: number;
  requestId: string | null;
  baseURL: string;
  endpoint: string;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export const ERROR_TYPES = {
  MODEL_NOT_FOUND: "model_not_found",
  RATE_LIMITED: "rate_limited",
  BAD_REQUEST: "bad_request",
  UNAUTHORIZED: "unauthorized",
  SERVER_ERROR: "server_error",
  NETWORK_ERROR: "network_error",
  JSON_INVALID: "json_invalid",
  UNSUPPORTED_FEATURE: "unsupported_feature",
  TIMEOUT: "timeout",
  UNKNOWN: "unknown",
} as const;

export type ErrorType = (typeof ERROR_TYPES)[keyof typeof ERROR_TYPES];

// ============================================================================
// SWARM RESULT
// ============================================================================

export interface SwarmResult {
  taskId: string | null;
  status: "completed" | "error";
  selectedAgents: Array<{ agent: string; model: string }>;
  agentExecutions: AgentExecution[];
  simulated: boolean;
}

// ============================================================================
// STEP-SPECIFIC TYPES
// ============================================================================

export interface Fact {
  fact: string;
  tokens: string[];
  source: {
    agent: string;
    model: string;
  };
  confidence: number;
}

export interface Attack {
  counter: string;
  targetFact: string;
  supportScore: number;
}

export interface Conflict {
  topic: string;
  a: string;
  b: string;
  tieBreaker: string;
}

export interface LogicResult {
  accepted: Fact[];
  rejected: Array<Fact & { reason: string; conflictsWith?: string }>;
  conflicts: Conflict[];
}

export interface CritiqueResult {
  attacks: Attack[];
}

export interface VerifiedFact {
  fact: string;
  confidence: number;
  truthScore: number;
  finalScore: number;
  hits: string[];
  source: { agent: string; model: string };
}

export interface GuardResult {
  safeOutput: string;
  flags: Array<{ type: string; hits?: string[]; score?: number }>;
  risk: number;
}

export interface TruthResult {
  answer: string;
  presentation: {
    typing: {
      chunkSize: number;
      intervalMs: number;
      chunks: string[];
    };
  };
}

// ============================================================================
// PIPELINE CONTEXT
// ============================================================================

export interface StepContext {
  emit?: EmitFunction;
  mode?: InternalMode;
  thinkingNexus?: boolean;
  userQuery?: string;
  swarm?: SwarmResult;
  facts?: Fact[];
  logic?: LogicResult;
  critique?: CritiqueResult;
  draft?: string;
  verified?: string;
  refined?: string;
  formatted?: string;
  guard?: GuardResult;
}

// ============================================================================
// SWARM OPTIONS
// ============================================================================

export interface SwarmOptions {
  emit?: EmitFunction;
  mode?: string;
  thinkingNexus?: boolean;
}

// ============================================================================
// DEEPSEEK API TYPES
// ============================================================================

export interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string;
  reasoning_content?: string;
}

export interface DeepSeekRequest {
  model: "deepseek-chat" | "deepseek-reasoner";
  messages: DeepSeekMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
}

export interface DeepSeekResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
      reasoning_content?: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ============================================================================
// OPENAI CLIENT TYPE (for dynamic import)
// ============================================================================

export interface OpenAIClient {
  chat: {
    completions: {
      create: (params: {
        model: string;
        messages: Array<{ role: string; content: string }>;
        max_tokens?: number;
        response_format?: { type: string };
      }) => Promise<{
        choices: Array<{
          message: {
            content: string;
          };
        }>;
      }>;
    };
  };
}

export type OpenAIConstructor = new (options: { apiKey: string; baseURL: string }) => OpenAIClient;
