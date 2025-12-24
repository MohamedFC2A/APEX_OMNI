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
// STEP & AGENT TYPES (Existing)
// ============================================================================
export type NexusStepStatus = "idle" | "running" | "completed" | "error";
export type NexusStep = {
  id: number;
  name: string;
  label: string;
  status: NexusStepStatus;
  percent: number;
  startedAt: number | null;
  completedAt: number | null;
  logs: string[];
  lastLog: string | null;
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
  | "connecting"
  | "streaming"
  | "done"
  | "error";

// ============================================================================
// NEXUS STATE (Extended with Chat Sessions)
// ============================================================================
type NexusState = {
  steps: NexusStep[];
  agents: NexusAgent[];
  liveLog: string[];
  connection: NexusConnectionStatus;
  errorMessage: string | null;
  answer: string;
  thinkingStream: string;
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
  setConnection: (connection: NexusConnectionStatus) => void;
  setError: (message: string) => void;
  setAnswer: (answer: string) => void;
  appendToAnswer: (chunk: string) => void;
  setThinkingStream: (thinking: string) => void;
  appendToThinking: (chunk: string) => void;
  setTypingChunks: (chunks: string[], intervalMs?: number) => void;
  markStepStarted: (stepId: number, at: number) => void;
  markStepCompleted: (stepId: number, at: number) => void;
  markStepError: (stepId: number, at: number) => void;
  setStepProgress: (stepId: number, percent: number, at: number) => void;
  appendStepLog: (stepId: number, message: string) => void;
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
};

// ============================================================================
// DEFAULT STEPS
// ============================================================================
const defaultSteps: NexusStep[] = [
  { id: 1, name: "Swarm Gathering", label: "Swarm Intelligence Aggregated", status: "idle", percent: 0, startedAt: null, completedAt: null, logs: [], lastLog: null },
  { id: 2, name: "Omni_Deconstruct", label: "Omni Deconstruct Engaged", status: "idle", percent: 0, startedAt: null, completedAt: null, logs: [], lastLog: null },
  { id: 3, name: "Apex_Logic", label: "Apex Logic Filtering", status: "idle", percent: 0, startedAt: null, completedAt: null, logs: [], lastLog: null },
  { id: 4, name: "Titan_Critique", label: "Titan Critique Initiated", status: "idle", percent: 0, startedAt: null, completedAt: null, logs: [], lastLog: null },
  { id: 5, name: "Core_Synthesis", label: "Core Synthesis Assembling", status: "idle", percent: 0, startedAt: null, completedAt: null, logs: [], lastLog: null },
  { id: 6, name: "Deep_Verify", label: "Deep Verify Cross-Check", status: "idle", percent: 0, startedAt: null, completedAt: null, logs: [], lastLog: null },
  { id: 7, name: "Quantum_Refine", label: "Quantum Refine Polishing", status: "idle", percent: 0, startedAt: null, completedAt: null, logs: [], lastLog: null },
  { id: 8, name: "Matrix_Format", label: "Matrix Format Structuring", status: "idle", percent: 0, startedAt: null, completedAt: null, logs: [], lastLog: null },
  { id: 9, name: "Final_Guard", label: "Final Guard Compliance", status: "idle", percent: 0, startedAt: null, completedAt: null, logs: [], lastLog: null },
  { id: 10, name: "Absolute_Truth", label: "Absolute Truth Revealed", status: "idle", percent: 0, startedAt: null, completedAt: null, logs: [], lastLog: null },
];

function cloneDefaultSteps(): NexusStep[] {
  return defaultSteps.map((s) => ({ ...s }));
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

// ============================================================================
// STORE
// ============================================================================
export const useNexusStore = create<NexusState>()(
  persist(
    (set, get) => ({
  steps: cloneDefaultSteps(),
  agents: [],
  liveLog: [],
  connection: "idle",
  errorMessage: null,
  answer: "",
  thinkingStream: "",
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
    steps: cloneDefaultSteps(),
    agents: [],
    liveLog: [],
    connection: "idle",
    errorMessage: null,
    answer: "",
    thinkingStream: "",
    typingChunks: [],
    typingIntervalMs: 22,
  }),
  setConnection: (connection) => set((state) => (state.connection === connection ? state : { connection })),
  setError: (message) => set((state) => state.connection === "error" && state.errorMessage === message ? state : { errorMessage: message, connection: "error" }),
  setAnswer: (answer) => set((state) => (state.answer === answer ? state : { answer })),
  appendToAnswer: (chunk) => set((state) => ({ answer: state.answer + chunk })),
  setThinkingStream: (thinking) => set({ thinkingStream: thinking }),
  appendToThinking: (chunk) => set((state) => ({ thinkingStream: state.thinkingStream + chunk })),
  setTypingChunks: (chunks, intervalMs) => set((state) => {
    const nextInterval = typeof intervalMs === "number" ? intervalMs : 22;
    if (state.typingIntervalMs === nextInterval && shallowEqualStringArray(state.typingChunks, chunks)) return state;
    return { typingChunks: chunks, typingIntervalMs: nextInterval };
  }),
  markStepStarted: (stepId, at) => set((state) => ({
    steps: state.steps.map((s) =>
      s.id === stepId ? { ...s, status: "running", percent: s.percent || 0, startedAt: s.startedAt ?? at } : s
    ),
  })),
  markStepCompleted: (stepId, at) => set((state) => ({
    steps: state.steps.map((s) =>
      s.id === stepId ? { ...s, status: "completed", percent: 100, startedAt: s.startedAt ?? at, completedAt: at } : s
    ),
  })),
  markStepError: (stepId, at) => set((state) => ({
    steps: state.steps.map((s) =>
      s.id === stepId ? { ...s, status: "error", percent: s.percent || 0, startedAt: s.startedAt ?? at, completedAt: at } : s
    ),
  })),
  setStepProgress: (stepId, percent, at) => set((state) => ({
    steps: state.steps.map((s) =>
      s.id === stepId ? {
        ...s,
        percent: Math.max(0, Math.min(100, percent)),
        status: s.status === "idle" && percent > 0 ? "running" : s.status,
        startedAt: s.startedAt ?? (percent > 0 ? at : null),
        completedAt: percent >= 100 ? at : s.completedAt,
      } : s
    ),
  })),
  appendStepLog: (stepId, message) => set((state) => ({
    steps: state.steps.map((s) => {
      if (s.id !== stepId) return s;
      const nextLogs = [...s.logs, message].slice(-16);
      return { ...s, logs: nextLogs, lastLog: message };
    }),
  })),
  setAgents: (agents) => set((state) => (state.agents === agents ? state : { agents })),
  markAgentStart: (agent, at) => set((state) => ({
    agents: state.agents.map((a) =>
      a.agent === agent ? { ...a, status: "running", startedAt: a.startedAt ?? at } : a
    ),
  })),
  markAgentFinish: ({ agent, model, status, at, duration, durationMs, outputSnippet, error }) => set((state) => ({
    agents: state.agents.map((a) =>
      a.agent === agent
        ? { ...a, status, model: model || a.model, finishedAt: at, duration: typeof duration === "string" ? duration : a.duration, durationMs: typeof durationMs === "number" ? durationMs : a.durationMs, outputSnippet: typeof outputSnippet === "string" ? outputSnippet : a.outputSnippet, error: error === null ? null : typeof error === "string" ? error : a.error }
        : a
    ),
  })),
  appendLiveLog: (line) => set((state) => ({ liveLog: [...state.liveLog, line].slice(-220) })),
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
      steps: cloneDefaultSteps(),
      agents: [],
      liveLog: [],
      connection: "idle",
      errorMessage: null,
      answer: "",
      thinkingStream: "",
      typingChunks: [],
    });
  },
  selectSession: (sessionId) => {
    const state = get();
    if (!state.sessions[sessionId]) return;
    set({
      activeSessionId: sessionId,
      steps: cloneDefaultSteps(),
      agents: [],
      liveLog: [],
      connection: "idle",
      errorMessage: null,
      answer: "",
      thinkingStream: "",
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
    const updatedMessages = session.messages.map((msg) => {
      if (msg.id === messageId && msg.role === "user") {
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
    const messages = session.messages ?? [];
    if (messages.length <= state.contextWindow) return messages;
    return messages.slice(-state.contextWindow);
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
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
        contextWindow: state.contextWindow,
        storageInitialized: state.storageInitialized,
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