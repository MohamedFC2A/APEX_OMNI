import { create } from "zustand";

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

type NexusState = {
  steps: NexusStep[];
  agents: NexusAgent[];
  liveLog: string[];
  connection: NexusConnectionStatus;
  errorMessage: string | null;
  answer: string;
  typingChunks: string[];
  typingIntervalMs: number;
  reset: () => void;
  setConnection: (connection: NexusConnectionStatus) => void;
  setError: (message: string) => void;
  setAnswer: (answer: string) => void;
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
};

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

function cloneDefaultSteps() {
  return defaultSteps.map((s) => ({ ...s }));
}

export const useNexusStore = create<NexusState>((set) => ({
  steps: cloneDefaultSteps(),
  agents: [],
  liveLog: [],
  connection: "idle",
  errorMessage: null,
  answer: "",
  typingChunks: [],
  typingIntervalMs: 22,
  reset: () =>
    set({
      steps: cloneDefaultSteps(),
      agents: [],
      liveLog: [],
      connection: "idle",
      errorMessage: null,
      answer: "",
      typingChunks: [],
      typingIntervalMs: 22,
    }),
  setConnection: (connection) => set({ connection }),
  setError: (message) => set({ errorMessage: message, connection: "error" }),
  setAnswer: (answer) => set({ answer }),
  setTypingChunks: (chunks, intervalMs) =>
    set({ typingChunks: chunks, typingIntervalMs: typeof intervalMs === "number" ? intervalMs : 22 }),
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
  setAgents: (agents) => set({ agents }),
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
}));
