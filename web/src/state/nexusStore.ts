import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  ChatSession,
  ChatMessage,
  ChatRole,
  NexusMode,
  generateId,
  generateSessionTitle,
} from "@/types/chat";
import {
  upsertSession,
  deleteSessionById,
  newSession as createNewSession,
} from "@/lib/storage";

// ============================================================================
// PIPELINE STAGE TYPES
// ============================================================================
export type PipelineStageStatus = "idle" | "running" | "success" | "failed" | "skipped" | "timeout";
export type PipelineStage = {
  id: string;
  name: string;
  status: PipelineStageStatus;
  startedAt: number | null;
  finishedAt: number | null;
  latencyMs: number | null;
  detail?: string;
};
export type NexusAgentStatus = "idle" | "running" | "completed" | "failed";
export type NexusAgent = {
  agent: string;
  agentName: string;
  model: string;
  status: NexusAgentStatus;
  startedAt: number | null;
  finishedAt: number | null;
  duration: string | null;
  durationMs: number | null;
  outputSnippet: string;
  error: string | null;
};
export type NexusConnectionStatus =
  | "idle"
  | "ready"
  | "connecting"
  | "streaming"
  | "done"
  | "error";

export type ReasoningNodeKind = "hypothesis" | "validation" | "synthesis" | "conclusion" | "note";
export type ReasoningNode = {
  id: string;
  label: string;
  kind: ReasoningNodeKind;
  at?: number;
};

export type AgentReasoningPath = {
  agent: string;
  agentName: string;
  model: string;
  pathId: string;
  nodes: ReasoningNode[];
  at: number;
};

export type AgentModelScore = {
  agent: string;
  agentName: string;
  model: string;
  signals: Record<string, number>;
  at: number;
};

const INTERNAL_MODEL_IDS = new Set([
  "NEXUS_FLASH_PRO",
  "NEXUS_THINKING_PRO",
  "NEXUS_APEX_OMNI",
  "NEXUS_APEX_OMENI",
  "FLASH",
  "DEEP_THINKING",
  "APEX",
  "NEXUS_VISION",
]);

function sanitizeModelIdentifier(input: unknown): string {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return "";
  if (raw === "NEXUS_APEX_OMNI") return "NEXUS_APEX_OMENI";
  if (raw === "FLASH" || raw === "DEEP_THINKING" || raw === "APEX" || raw === "NEXUS_VISION") return raw;
  if (INTERNAL_MODEL_IDS.has(raw)) return raw;
  if (raw.toLowerCase() === "mimo-v2-flash") return "NEXUS_FLASH_PRO";
  if (raw.includes("/") || raw.includes(":")) return "NEXUS_THINKING_PRO";
  return "NEXUS_THINKING_PRO";
}

function sanitizeAgentName(input: unknown, fallback: string): string {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return fallback;
  if (raw.startsWith("NEXUS_")) return raw;
  return fallback;
}

function sanitizeUserFacingText(input: string): string {
  const raw = String(input || "");
  const normalizedFlash = raw
    .replace(/\bmimo-v2-flash\b/gi, "NEXUS_FLASH_PRO")
    .replace(/\bmimo\s*v2\s*flash\b/gi, "NEXUS_FLASH_PRO")
    .replace(/\bNEXUS_APEX_OMNI\b/gi, "NEXUS_APEX_OMENI");
  return normalizedFlash.replace(
    /\b[a-z0-9._-]+\/[a-z0-9._-]+(?::[a-z0-9._-]+)?\b/gi,
    "NEXUS_THINKING_PRO"
  );
}

// ============================================================================
// NEXUS STATE (Extended with Chat Sessions)
// ============================================================================
type NexusState = {
  pipeline: PipelineStage[];
  agents: NexusAgent[];
  liveLog: string[];
  connection: NexusConnectionStatus;
  errorMessage: string | null;
  runId: string | null;
  runMode: string | null;
  runStartedAt: number | null;
  runFinishedAt: number | null;
  runStatus: "idle" | "running" | "done" | "error";
  answer: string;
  thinkingStream: string;
  thinkingHighlights: Record<string, string[]>;
  reasoningPaths: Record<string, AgentReasoningPath>;
  modelScores: Record<string, AgentModelScore>;
  planLiveCollapsed: boolean;
  planLiveInitialized: boolean;
  primaryPipelineCollapsed: boolean;
  primaryPipelineInitialized: boolean;
  typingChunks: string[];
  typingIntervalMs: number;
  sessions: Record<string, ChatSession>;
  activeSessionId: string;
  contextWindow: number;
  storageInitialized: boolean;
  _hasHydrated: boolean;
  isTyping: boolean;
  isAITyping: boolean;
  reset: () => void;
  startRun: (payload: { runId?: string; mode?: string; at: number }) => void;
  finishRun: (payload: { status?: string; message?: string; at: number }) => void;
  setConnection: (connection: NexusConnectionStatus) => void;
  setError: (message: string) => void;
  setAnswer: (answer: string) => void;
  appendToAnswer: (chunk: string) => void;
  setThinkingStream: (thinking: string) => void;
  appendToThinking: (chunk: string) => void;
  mergeThinkingHighlights: (modelSlot: string, highlights: string[]) => void;
  clearThinkingArtifacts: () => void;
  upsertReasoningPath: (payload: AgentReasoningPath) => void;
  upsertModelScore: (payload: AgentModelScore) => void;
  setPlanLiveCollapsed: (collapsed: boolean) => void;
  initPlanLiveCollapsed: (collapsed: boolean) => void;
  setPrimaryPipelineCollapsed: (collapsed: boolean) => void;
  initPrimaryPipelineCollapsed: (collapsed: boolean) => void;
  setTypingChunks: (chunks: string[], intervalMs?: number) => void;
  setPipelineStages: (stages: PipelineStage[]) => void;
  updatePipelineStage: (stage: PipelineStage) => void;
  setAgents: (agents: NexusAgent[]) => void;
  markAgentStart: (agent: string, at: number) => void;
  markAgentFinish: (payload: {
    agent: string;
    model: string;
    status: NexusAgentStatus;
    at: number;
    duration?: string | null;
    durationMs?: number | null;
    outputSnippet?: string;
    error?: string | null;
  }) => void;
  markAgentCancelled: (agent: string, reason: string, at: number) => void;
  appendLiveLog: (line: string) => void;
  initFromStorage: () => void;
  newChat: () => void;
  selectSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  appendChatMessage: (role: ChatRole, content: string, meta?: ChatMessage["meta"]) => void;
  editChatMessage: (messageId: string, newContent: string) => void;
  deleteChatMessage: (messageId: string) => void;
  setTyping: (isTyping: boolean) => void;
  setAITyping: (isTyping: boolean) => void;
  getActiveSession: () => ChatSession | null;
  getMessagesForContext: () => ChatMessage[];
  updateSessionSummary: (summary: string) => void;
  updateSessionSettings: (settings: { deepResearchPlus?: boolean; webMax?: boolean }) => void;
  regenerateResponse: (messageId: string) => Promise<void>;
};

// ============================================================================
// DEFAULT PIPELINE
// ============================================================================
const defaultPipeline: PipelineStage[] = [];

function cloneDefaultPipeline(): PipelineStage[] {
  return defaultPipeline.map((s) => ({ ...s }));
}

function shallowEqualStringArray(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// Avoid unnecessary store updates during high-frequency SSE events.
function shallowEqualNumberRecord(a: Record<string, number>, b: Record<string, number>): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

// Prevent re-renders when agent lists are re-derived but semantically identical.
function shallowEqualAgents(a: NexusAgent[], b: NexusAgent[]): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.agent !== y.agent ||
      x.agentName !== y.agentName ||
      x.model !== y.model ||
      x.status !== y.status ||
      x.startedAt !== y.startedAt ||
      x.finishedAt !== y.finishedAt ||
      x.duration !== y.duration ||
      x.durationMs !== y.durationMs ||
      x.outputSnippet !== y.outputSnippet ||
      x.error !== y.error
    ) {
      return false;
    }
  }
  return true;
}

function sanitizeSessionsForPersist(sessions: Record<string, ChatSession>): Record<string, ChatSession> {
  const out: Record<string, ChatSession> = {};
  for (const [id, session] of Object.entries(sessions || {})) {
    out[id] = {
      ...session,
      messages: (session.messages || [])
        .filter((m) => !m.meta?.isDeleted)
        .map((m) => {
          const meta = m.meta as unknown as Record<string, unknown> | undefined;
          if (m.role !== "assistant") return { ...m, meta: undefined };

          const modelName =
            (typeof meta?.modelName === "string" ? meta.modelName : undefined) ??
            (typeof meta?.model === "string" ? meta.model : undefined);
          const realResponseTimeMs =
            (typeof meta?.realResponseTimeMs === "number" ? meta.realResponseTimeMs : undefined) ??
            (typeof meta?.responseTimeMs === "number" ? meta.responseTimeMs : undefined);
          const finalAnswerSummary =
            (typeof meta?.finalAnswerSummary === "string" ? meta.finalAnswerSummary : undefined) ??
            (typeof meta?.coreSynthesisSummary === "string" ? meta.coreSynthesisSummary : undefined);

          const safeModelName = sanitizeModelIdentifier(modelName);
          const safeFinalAnswerSummary =
            typeof finalAnswerSummary === "string" ? sanitizeUserFacingText(finalAnswerSummary) : undefined;

          const nextMeta =
            safeModelName || typeof realResponseTimeMs === "number" || safeFinalAnswerSummary
              ? { modelName: safeModelName || undefined, realResponseTimeMs, finalAnswerSummary: safeFinalAnswerSummary }
              : undefined;

          return { ...m, meta: nextMeta };
        }),
    };
  }
  return out;
}

// ============================================================================
// STORE
// ============================================================================
export const useNexusStore = create<NexusState>()(
  persist(
    (set, get) => ({
  pipeline: cloneDefaultPipeline(),
  agents: [],
  liveLog: [],
  connection: "idle",
  errorMessage: null,
  runId: null,
  runMode: null,
  runStartedAt: null,
  runFinishedAt: null,
  runStatus: "idle",
  answer: "",
  thinkingStream: "",
  thinkingHighlights: {},
  reasoningPaths: {},
  modelScores: {},
  planLiveCollapsed: true,
  planLiveInitialized: false,
  primaryPipelineCollapsed: true,
  primaryPipelineInitialized: false,
  typingChunks: [],
  typingIntervalMs: 22,
  sessions: {},
  activeSessionId: "",
  contextWindow: 10,
  storageInitialized: false,
  _hasHydrated: false,
  isTyping: false,
  isAITyping: false,
  reset: () => set({
    pipeline: cloneDefaultPipeline(),
    agents: [],
    liveLog: [],
    connection: "idle",
    errorMessage: null,
    runId: null,
    runMode: null,
    runStartedAt: null,
    runFinishedAt: null,
    runStatus: "idle",
    answer: "",
    thinkingStream: "",
    thinkingHighlights: {},
    reasoningPaths: {},
    modelScores: {},
    typingChunks: [],
    typingIntervalMs: 22,
  }),
  startRun: ({ runId, mode, at }) => set((state) => ({
    runId: typeof runId === "string" ? runId : state.runId,
    runMode: typeof mode === "string" ? mode : state.runMode,
    runStartedAt: at,
    runFinishedAt: null,
    runStatus: "running",
    errorMessage: null,
    reasoningPaths: {},
    modelScores: {},
    thinkingHighlights: {},
    thinkingStream: "",
    pipeline: cloneDefaultPipeline(),
  })),
  finishRun: ({ status, message, at }) => set((state) => {
    const nextStatus = status === "error" ? "error" : status ? "done" : state.runStatus;
    const nextError = status === "error" ? (typeof message === "string" ? message : state.errorMessage) : state.errorMessage;
    return {
      runFinishedAt: at,
      runStatus: nextStatus,
      errorMessage: nextError,
      connection: status === "error" ? "error" : state.connection,
    };
  }),
  setConnection: (connection) => set((state) => (state.connection === connection ? state : { connection })),
  setError: (message) => set((state) => state.connection === "error" && state.errorMessage === message ? state : { errorMessage: message, connection: "error" }),
  setAnswer: (answer) => set((state) => (state.answer === answer ? state : { answer })),
  appendToAnswer: (chunk) => set((state) => {
    if (!chunk) return state;
    return { answer: state.answer + chunk };
  }),
  setThinkingStream: (thinking) => set((state) => (state.thinkingStream === thinking ? state : { thinkingStream: thinking })),
  appendToThinking: (chunk) => set((state) => {
    if (!chunk) return state;
    return { thinkingStream: state.thinkingStream + chunk };
  }),
  mergeThinkingHighlights: (modelSlot, highlights) => set((state) => {
    const safeSlot = sanitizeModelIdentifier(modelSlot);
    const prev = state.thinkingHighlights[safeSlot];
    if (Array.isArray(prev) && shallowEqualStringArray(prev, highlights)) return state;
    return { thinkingHighlights: { ...state.thinkingHighlights, [safeSlot]: highlights } };
  }),
  clearThinkingArtifacts: () => set({ thinkingStream: "", thinkingHighlights: {}, reasoningPaths: {}, modelScores: {} }),
  upsertReasoningPath: (payload) => set((state) => {
    const nextPayload: AgentReasoningPath = {
      ...payload,
      agentName: sanitizeAgentName(payload.agentName, payload.agent),
      model: sanitizeModelIdentifier(payload.model),
    };
    const prev = state.reasoningPaths[nextPayload.agent];
    if (prev && prev.pathId === payload.pathId) {
      const prevNodes = prev.nodes || [];
      const nextNodes = payload.nodes || [];
      const prevLast = prevNodes[prevNodes.length - 1];
      const nextLast = nextNodes[nextNodes.length - 1];
      if (
        prevNodes.length === nextNodes.length &&
        prevLast?.id === nextLast?.id &&
        prevLast?.label === nextLast?.label &&
        prevLast?.kind === nextLast?.kind
      ) {
        return state;
      }
    }
    return { reasoningPaths: { ...state.reasoningPaths, [nextPayload.agent]: nextPayload } };
  }),
  upsertModelScore: (payload) => set((state) => {
    const nextPayload: AgentModelScore = {
      ...payload,
      agentName: sanitizeAgentName(payload.agentName, payload.agent),
      model: sanitizeModelIdentifier(payload.model),
    };
    const prev = state.modelScores[nextPayload.agent];
    if (prev && prev.model === nextPayload.model && shallowEqualNumberRecord(prev.signals || {}, nextPayload.signals || {})) {
      return state;
    }
    return { modelScores: { ...state.modelScores, [nextPayload.agent]: nextPayload } };
  }),
  setPlanLiveCollapsed: (collapsed: boolean) => set((state) => (state.planLiveCollapsed === collapsed ? state : { planLiveCollapsed: collapsed })),
  initPlanLiveCollapsed: (collapsed: boolean) => set((state) => (state.planLiveInitialized ? state : { planLiveCollapsed: collapsed, planLiveInitialized: true })),
  setPrimaryPipelineCollapsed: (collapsed: boolean) => set((state) => (state.primaryPipelineCollapsed === collapsed ? state : { primaryPipelineCollapsed: collapsed })),
  initPrimaryPipelineCollapsed: (collapsed: boolean) => set((state) => (state.primaryPipelineInitialized ? state : { primaryPipelineCollapsed: collapsed, primaryPipelineInitialized: true })),
  setTypingChunks: (chunks, intervalMs) => set((state) => {
    const nextInterval = typeof intervalMs === "number" ? intervalMs : 22;
    if (state.typingIntervalMs === nextInterval && shallowEqualStringArray(state.typingChunks, chunks)) return state;
    return { typingChunks: chunks, typingIntervalMs: nextInterval };
  }),
  setPipelineStages: (stages) => set((state) => {
    if (state.pipeline.length === stages.length) {
      let same = true;
      for (let i = 0; i < stages.length; i++) {
        const a = state.pipeline[i];
        const b = stages[i];
        if (
          a.id !== b.id ||
          a.status !== b.status ||
          a.startedAt !== b.startedAt ||
          a.finishedAt !== b.finishedAt ||
          a.latencyMs !== b.latencyMs ||
          a.detail !== b.detail
        ) {
          same = false;
          break;
        }
      }
      if (same) return state;
    }
    return { pipeline: stages };
  }),
  updatePipelineStage: (stage) => set((state) => {
    const idx = state.pipeline.findIndex((s) => s.id === stage.id);
    if (idx === -1) return { pipeline: [...state.pipeline, stage] };
    const curr = state.pipeline[idx];
    if (
      curr.status === stage.status &&
      curr.startedAt === stage.startedAt &&
      curr.finishedAt === stage.finishedAt &&
      curr.latencyMs === stage.latencyMs &&
      curr.detail === stage.detail &&
      curr.name === stage.name
    ) {
      return state;
    }
    const next = [...state.pipeline];
    next[idx] = stage;
    return { pipeline: next };
  }),
  setAgents: (agents) => set((state) => (shallowEqualAgents(state.agents, agents) ? state : { agents })),
  markAgentStart: (agent, at) => set((state) => {
    const curr = state.agents.find((a) => a.agent === agent);
    if (!curr) return state;
    if (curr.status === "running" && typeof curr.startedAt === "number" && curr.startedAt) return state;
    return {
      agents: state.agents.map((a) => (a.agent === agent ? { ...a, status: "running", startedAt: a.startedAt ?? at } : a)),
    };
  }),
  markAgentFinish: ({ agent, model, status, at, duration, durationMs, outputSnippet, error }) =>
    set((state) => {
      const curr = state.agents.find((a) => a.agent === agent);
      if (!curr) return state;

      const nextModel = sanitizeModelIdentifier(model || curr.model) || curr.model;
      const nextDuration = typeof duration === "string" ? duration : curr.duration;
      const nextDurationMs = typeof durationMs === "number" ? durationMs : curr.durationMs;
      const nextSnippet = typeof outputSnippet === "string" ? outputSnippet : curr.outputSnippet;
      const nextError = error === null ? null : typeof error === "string" ? error : curr.error;

      if (
        curr.status === status &&
        curr.model === nextModel &&
        curr.finishedAt === at &&
        curr.duration === nextDuration &&
        curr.durationMs === nextDurationMs &&
        curr.outputSnippet === nextSnippet &&
        curr.error === nextError
      ) {
        return state;
      }

      return {
        agents: state.agents.map((a) =>
          a.agent === agent
            ? {
                ...a,
                status,
                model: nextModel,
                finishedAt: at,
                duration: nextDuration,
                durationMs: nextDurationMs,
                outputSnippet: nextSnippet,
                error: nextError,
              }
            : a
        ),
      };
    }),
  markAgentCancelled: (agent, reason, at) =>
    set((state) => {
      const curr = state.agents.find((a) => a.agent === agent);
      if (!curr) return state;
      // Mark as idle (cancelled) - will be shown as cancelled in UI
      return {
        agents: state.agents.map((a) =>
          a.agent === agent
            ? {
                ...a,
                status: "idle" as NexusAgentStatus,
                finishedAt: at,
                error: reason,
              }
            : a
        ),
      };
    }),
  appendLiveLog: (line) => set((state) => ({ liveLog: [...state.liveLog, sanitizeUserFacingText(line)].slice(-220) })),
  initFromStorage: () => {
    // Persist middleware handles hydration automatically
    // This function is kept for backward compatibility but is now a no-op
    const state = get();
    if (!state.storageInitialized && state.sessions && Object.keys(state.sessions).length > 0) {
      set({ storageInitialized: true });
    }
  },
  newChat: () => {
    const state = get();
    const session = createNewSession();
    const nextSessions = upsertSession(state.sessions, session);
    // Persist middleware will automatically save
    set({
      sessions: nextSessions,
      activeSessionId: session.id,
      pipeline: cloneDefaultPipeline(),
      agents: [],
      liveLog: [],
      connection: "idle",
      errorMessage: null,
      runId: null,
      runMode: null,
      runStartedAt: null,
      runFinishedAt: null,
      runStatus: "idle",
      answer: "",
      thinkingStream: "",
      thinkingHighlights: {},
      reasoningPaths: {},
      modelScores: {},
      typingChunks: [],
    });
  },
  selectSession: (sessionId) => {
    const state = get();
    if (!state.sessions[sessionId]) return;
    set({
      activeSessionId: sessionId,
      pipeline: cloneDefaultPipeline(),
      agents: [],
      liveLog: [],
      connection: "idle",
      errorMessage: null,
      runId: null,
      runMode: null,
      runStartedAt: null,
      runFinishedAt: null,
      runStatus: "idle",
      answer: "",
      thinkingStream: "",
      thinkingHighlights: {},
      reasoningPaths: {},
      modelScores: {},
      typingChunks: [],
    });
  },
  deleteSession: (sessionId) => {
    const state = get();
    const nextSessions = deleteSessionById(state.sessions, sessionId);
    // Persist middleware will automatically save
    let nextActiveId = state.activeSessionId;
    if (sessionId === state.activeSessionId) {
      const remaining = Object.values(nextSessions);
      if (remaining.length === 0) {
        const newSess = createNewSession();
        nextSessions[newSess.id] = newSess;
        nextActiveId = newSess.id;
      } else {
        remaining.sort((a, b) => (b?.updatedAt ?? 0) - (a?.updatedAt ?? 0));
        nextActiveId = remaining[0]?.id ?? "";
      }
    }
    set({ sessions: nextSessions, activeSessionId: nextActiveId });
  },
  appendChatMessage: (role, content, meta) => {
    const state = get();
    const session = state.sessions[state.activeSessionId];
    if (!session) return;
    const message: ChatMessage = { id: generateId(), role, content, createdAt: Date.now(), meta };
    const updatedMessages = [...session.messages, message];
    const updatedSession: ChatSession = { ...session, messages: updatedMessages, title: session.messages.length === 0 ? generateSessionTitle(updatedMessages) : session.title, updatedAt: Date.now() };
    const nextSessions = upsertSession(state.sessions, updatedSession);
    // Persist middleware will automatically save
    set({ sessions: nextSessions });
  },
  editChatMessage: (messageId, newContent) => {
    const state = get();
    const session = state.sessions[state.activeSessionId];
    if (!session) return;
    const updatedMessages = session.messages.map((msg) => {
      if (msg.id === messageId && msg.role === "user") {
        return {
          ...msg,
          content: newContent,
          meta: { ...msg.meta, editedAt: Date.now() },
        };
      }
      return msg;
    });
    const updatedSession: ChatSession = { ...session, messages: updatedMessages, updatedAt: Date.now() };
    const nextSessions = upsertSession(state.sessions, updatedSession);
    set({ sessions: nextSessions });
  },
  deleteChatMessage: (messageId) => {
    const state = get();
    const session = state.sessions[state.activeSessionId];
    if (!session) return;
    
    // Find the message to delete
    const messageIndex = session.messages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;
    
    const messageToDelete = session.messages[messageIndex];
    
    // Delete cascade: find all replies to this message
    const repliesToDelete = new Set<string>();
    const findReplies = (targetId: string) => {
      session.messages.forEach((msg) => {
        if (msg.meta?.replyTo === targetId) {
          repliesToDelete.add(msg.id);
          findReplies(msg.id); // Recursive for nested replies
        }
      });
    };
    findReplies(messageId);
    
    // Also delete the next assistant message if this is a user message
    if (messageToDelete.role === "user" && messageIndex < session.messages.length - 1) {
      const nextMessage = session.messages[messageIndex + 1];
      if (nextMessage.role === "assistant") {
        repliesToDelete.add(nextMessage.id);
      }
    }
    
    // Mark all messages as deleted
    const updatedMessages = session.messages.map((msg) => {
      if (msg.id === messageId || repliesToDelete.has(msg.id)) {
        return {
          ...msg,
          meta: { ...msg.meta, isDeleted: true },
        };
      }
      return msg;
    });
    
    const updatedSession: ChatSession = { ...session, messages: updatedMessages, updatedAt: Date.now() };
    const nextSessions = upsertSession(state.sessions, updatedSession);
    set({ sessions: nextSessions });
  },
  setTyping: (isTyping) => set({ isTyping }),
  setAITyping: (isTyping) => set({ isAITyping: isTyping }),
  getActiveSession: () => {
    const state = get();
    return state.sessions[state.activeSessionId] || null;
  },
  getMessagesForContext: () => {
    const state = get();
    const session = state.sessions?.[state.activeSessionId];
    if (!session) return [];
    // Filter out deleted messages
    const activeMessages = (session.messages ?? []).filter((m) => !m.meta?.isDeleted);
    if (activeMessages.length <= state.contextWindow) return activeMessages;
    return activeMessages.slice(-state.contextWindow);
  },
  updateSessionSummary: (summary) => {
    const state = get();
    const session = state.sessions[state.activeSessionId];
    if (!session) return;
    const updatedSession: ChatSession = { ...session, summary, updatedAt: Date.now() };
    const nextSessions = upsertSession(state.sessions, updatedSession);
    set({ sessions: nextSessions });
  },
  updateSessionSettings: (settings) => {
    const state = get();
    const session = state.sessions[state.activeSessionId];
    if (!session) return;
    const updatedSession: ChatSession = {
      ...session,
      settings: { ...session.settings, ...settings },
      updatedAt: Date.now(),
    };
    const nextSessions = upsertSession(state.sessions, updatedSession);
    set({ sessions: nextSessions });
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  regenerateResponse: async (messageId: string) => {
    // This will be called from component with proper context
    // Store just provides the interface
    return Promise.resolve();
  },
    }),
    {
      name: "nexus-chat-v1",
      storage: createJSONStorage(() => {
        if (typeof window !== "undefined") {
          return localStorage;
        }
        // SSR fallback - return a no-op storage
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
      }),
      partialize: (state) => ({
        sessions: sanitizeSessionsForPersist(state.sessions),
        activeSessionId: state.activeSessionId,
        contextWindow: state.contextWindow,
        storageInitialized: state.storageInitialized,
        planLiveCollapsed: state.planLiveCollapsed,
        planLiveInitialized: state.planLiveInitialized,
      }),
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) {
            console.error("[nexusStore] Rehydration error:", error);
            return;
          }
          if (!state) return;
          
          // Migration: Import old nexus:v5:sessions if exists
          if (typeof window !== "undefined") {
            try {
              const oldData = window.localStorage.getItem("nexus:v5:sessions");
              if (oldData && (!state.sessions || Object.keys(state.sessions).length === 0)) {
                const parsed = JSON.parse(oldData) as Record<string, ChatSession>;
                if (parsed && typeof parsed === "object") {
                  state.sessions = parsed;
                  const sessionList = Object.values(parsed);
                  if (sessionList.length > 0) {
                    sessionList.sort((a, b) => (b?.updatedAt ?? 0) - (a?.updatedAt ?? 0));
                    state.activeSessionId = sessionList[0]?.id ?? "";
                  }
                  // Clean up old storage
                  window.localStorage.removeItem("nexus:v5:sessions");
                }
              }
            } catch (e) {
              console.error("[nexusStore] Migration error:", e);
            }
          }
          
          // Initialize first session if none exist
          if (!state.sessions || Object.keys(state.sessions).length === 0) {
            const first = createNewSession();
            state.sessions = { [first.id]: first };
            state.activeSessionId = first.id;
            state.storageInitialized = true;
          } else {
            state.storageInitialized = true;
          }
          state._hasHydrated = true;
        };
      },
    }
  )
);

export type { ChatSession, ChatMessage, ChatRole, NexusMode };
