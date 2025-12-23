import { create } from "zustand";
import {
  ChatSession,
  ChatMessage,
  ChatRole,
  NexusMode,
  generateId,
  generateSessionTitle,
} from "@/types/chat";
import {
  loadSessions,
  saveSessions,
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

export type NexusConnectionStatus = "idle" | "connecting" | "streaming" | "done" | "error";

// ============================================================================
// NEXUS STATE (Extended with Chat Sessions)
// ============================================================================

type NexusState = {
  // Pipeline state
  steps: NexusStep[];
  agents: NexusAgent[];
  liveLog: string[];
  connection: NexusConnectionStatus;
  errorMessage: string | null;
  answer: string;
  thinkingStream: string;
  typingChunks: string[];
  typingIntervalMs: number;

  // Chat session state (V5)
  sessions: Record<string, ChatSession>;
  activeSessionId: string;
  contextWindow: number; // How many messages to send to API
  storageInitialized: boolean;

  // Pipeline actions
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

  // Chat session actions (V5)
  initFromStorage: () => void;
  newChat: () => void;
  selectSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  appendChatMessage: (role: ChatRole, content: string, meta?: ChatMessage["meta"]) => void;
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

<<<<<<< HEAD
function shallowEqualStringArray(a: string[], b: string[]): boolean {
=======
function shallowEqualStringArray(a: string[], b: string[]) {
>>>>>>> 23fb81c777f6c794958b1aa5da88a6d72667c7fd
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

<<<<<<< HEAD
// ============================================================================
// STORE
// ============================================================================

export const useNexusStore = create<NexusState>((set, get) => ({
  // Pipeline state
=======
export const useNexusStore = create<NexusState>((set) => ({
>>>>>>> 23fb81c777f6c794958b1aa5da88a6d72667c7fd
  steps: cloneDefaultSteps(),
  agents: [],
  liveLog: [],
  connection: "idle",
  errorMessage: null,
  answer: "",
  thinkingStream: "",
  typingChunks: [],
  typingIntervalMs: 22,

  // Chat session state (V5)
  sessions: {},
  activeSessionId: "",
  contextWindow: 20,
  storageInitialized: false,

  // Pipeline actions
  reset: () =>
    set({
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
<<<<<<< HEAD

  setConnection: (connection) =>
    set((state) => (state.connection === connection ? state : { connection })),

  setError: (message) =>
    set((state) =>
      state.connection === "error" && state.errorMessage === message
        ? state
        : { errorMessage: message, connection: "error" }
    ),

  setAnswer: (answer) => set({ answer }),

  appendToAnswer: (chunk) => set((state) => ({ answer: state.answer + chunk })),

  setThinkingStream: (thinking) => set({ thinkingStream: thinking }),

  appendToThinking: (chunk) =>
    set((state) => ({ thinkingStream: state.thinkingStream + chunk })),

  setTypingChunks: (chunks, intervalMs) =>
    set((state) => {
      const nextInterval = typeof intervalMs === "number" ? intervalMs : 22;
      if (
        state.typingIntervalMs === nextInterval &&
        shallowEqualStringArray(state.typingChunks, chunks)
      )
        return state;
      return { typingChunks: chunks, typingIntervalMs: nextInterval };
    }),

=======
  setConnection: (connection) => set((state) => (state.connection === connection ? state : { connection })),
  setError: (message) =>
    set((state) =>
      state.connection === "error" && state.errorMessage === message ? state : { errorMessage: message, connection: "error" }
    ),
  setAnswer: (answer) => set((state) => (state.answer === answer ? state : { answer })),
  setTypingChunks: (chunks, intervalMs) =>
    set((state) => {
      const nextInterval = typeof intervalMs === "number" ? intervalMs : 22;
      if (state.typingIntervalMs === nextInterval && shallowEqualStringArray(state.typingChunks, chunks)) return state;
      return { typingChunks: chunks, typingIntervalMs: nextInterval };
    }),
>>>>>>> 23fb81c777f6c794958b1aa5da88a6d72667c7fd
  markStepStarted: (stepId, at) =>
    set((state) => ({
      steps: state.steps.map((s) =>
        s.id === stepId
          ? {
              ...s,
              status: "running",
              percent: s.percent || 0,
              startedAt: s.startedAt ?? at,
            }
          : s
      ),
    })),

  markStepCompleted: (stepId, at) =>
    set((state) => ({
      steps: state.steps.map((s) =>
        s.id === stepId
          ? {
              ...s,
              status: "completed",
              percent: 100,
              startedAt: s.startedAt ?? at,
              completedAt: at,
            }
          : s
      ),
    })),

  markStepError: (stepId, at) =>
    set((state) => ({
      steps: state.steps.map((s) =>
        s.id === stepId
          ? {
              ...s,
              status: "error",
              percent: s.percent || 0,
              startedAt: s.startedAt ?? at,
              completedAt: at,
            }
          : s
      ),
    })),

  setStepProgress: (stepId, percent, at) =>
    set((state) => ({
      steps: state.steps.map((s) =>
        s.id === stepId
          ? {
              ...s,
              percent: Math.max(0, Math.min(100, percent)),
              status: s.status === "idle" && percent > 0 ? "running" : s.status,
              startedAt: s.startedAt ?? (percent > 0 ? at : null),
              completedAt: percent >= 100 ? at : s.completedAt,
            }
          : s
      ),
    })),

  appendStepLog: (stepId, message) =>
    set((state) => ({
      steps: state.steps.map((s) => {
        if (s.id !== stepId) return s;
        const nextLogs = [...s.logs, message].slice(-16);
        return {
          ...s,
          logs: nextLogs,
          lastLog: message,
        };
      }),
    })),
<<<<<<< HEAD

  setAgents: (agents) => set((state) => (state.agents === agents ? state : { agents })),

=======
  setAgents: (agents) => set((state) => (state.agents === agents ? state : { agents })),
>>>>>>> 23fb81c777f6c794958b1aa5da88a6d72667c7fd
  markAgentStart: (agent, at) =>
    set((state) => ({
      agents: state.agents.map((a) =>
        a.agent === agent
          ? {
              ...a,
              status: "running",
              startedAt: a.startedAt ?? at,
            }
          : a
      ),
    })),

  markAgentFinish: ({ agent, model, status, at, duration, durationMs, outputSnippet, error }) =>
    set((state) => ({
      agents: state.agents.map((a) =>
        a.agent === agent
          ? {
              ...a,
              status,
              model: model || a.model,
              finishedAt: at,
              duration: typeof duration === "string" ? duration : a.duration,
              durationMs: typeof durationMs === "number" ? durationMs : a.durationMs,
              outputSnippet: typeof outputSnippet === "string" ? outputSnippet : a.outputSnippet,
              error: error === null ? null : typeof error === "string" ? error : a.error,
            }
          : a
      ),
    })),

  appendLiveLog: (line) =>
    set((state) => ({
      liveLog: [...state.liveLog, line].slice(-220),
    })),

  // ============================================================================
  // CHAT SESSION ACTIONS (V5)
  // ============================================================================

  initFromStorage: () => {
    // SSR guard - only run on client
    if (typeof window === "undefined") return;
    
    const state = get();
    if (state.storageInitialized) return;

    try {
      const sessions = loadSessions();
      const sessionList = Object.values(sessions || {});

      let activeSessionId = "";
      let finalSessions = sessions || {};

      if (sessionList.length === 0) {
        // Create first session
        const first = createNewSession();
        finalSessions = { [first.id]: first };
        activeSessionId = first.id;
        saveSessions(finalSessions);
      } else {
        // Pick most recent
        sessionList.sort((a, b) => (b?.updatedAt ?? 0) - (a?.updatedAt ?? 0));
        activeSessionId = sessionList[0]?.id ?? "";
      }

      set({
        sessions: finalSessions,
        activeSessionId,
        storageInitialized: true,
      });
    } catch (e) {
      console.error("[nexusStore] Failed to load sessions from storage:", e);
      // Initialize with empty session on error
      const first = createNewSession();
      set({
        sessions: { [first.id]: first },
        activeSessionId: first.id,
        storageInitialized: true,
      });
    }
  },

  newChat: () => {
    const state = get();
    const session = createNewSession();
    const nextSessions = upsertSession(state.sessions, session);
    saveSessions(nextSessions);

    set({
      sessions: nextSessions,
      activeSessionId: session.id,
      // Reset pipeline for new chat
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
      // Reset pipeline when switching
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
    saveSessions(nextSessions);

    // If we deleted the active session, switch to another or create new
    let nextActiveId = state.activeSessionId;
    if (sessionId === state.activeSessionId) {
      const remaining = Object.values(nextSessions);
      if (remaining.length === 0) {
        const newSess = createNewSession();
        nextSessions[newSess.id] = newSess;
        nextActiveId = newSess.id;
        saveSessions(nextSessions);
      } else {
        remaining.sort((a, b) => (b?.updatedAt ?? 0) - (a?.updatedAt ?? 0));
        nextActiveId = remaining[0]?.id ?? "";
      }
    }

    set({
      sessions: nextSessions,
      activeSessionId: nextActiveId,
      // Reset pipeline if switched
      ...(sessionId === state.activeSessionId
        ? {
            steps: cloneDefaultSteps(),
            agents: [],
            liveLog: [],
            connection: "idle",
            errorMessage: null,
            answer: "",
            thinkingStream: "",
            typingChunks: [],
          }
        : {}),
    });
  },

  appendChatMessage: (role, content, meta) => {
    const state = get();
    const session = state.sessions[state.activeSessionId];
    if (!session) return;

    const message: ChatMessage = {
      id: generateId(),
      role,
      content,
      createdAt: Date.now(),
      meta,
    };

    const updatedMessages = [...session.messages, message];
    const updatedSession: ChatSession = {
      ...session,
      messages: updatedMessages,
      title: session.messages.length === 0 ? generateSessionTitle(updatedMessages) : session.title,
      updatedAt: Date.now(),
    };

    const nextSessions = upsertSession(state.sessions, updatedSession);
    saveSessions(nextSessions);

    set({ sessions: nextSessions });
  },

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

    // Return last N messages
    return messages.slice(-state.contextWindow);
  },
}));

// Re-export types for convenience
export type { ChatSession, ChatMessage, ChatRole, NexusMode };
