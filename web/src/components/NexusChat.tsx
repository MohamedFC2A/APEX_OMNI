"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HoloPipeline } from "@/components/HoloPipeline";
import { ModePopover } from "@/components/ModePopover";
import { HistorySidebar } from "@/components/HistorySidebar";
import { useNexusStore, type NexusMode } from "@/state/nexusStore";
import { useShallow } from "zustand/react/shallow";

// Check for reduced motion preference
const prefersReducedMotion = typeof window !== "undefined"
  ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
  : false;

type AgentMeta = { agent: string; agentName: string; model: string };

import { STANDARD_AGENTS, THINKING_AGENTS, SUPER_THINKING_AGENTS } from "@/lib/nexusMeta";

const FALLBACK_STANDARD_AGENTS: AgentMeta[] = STANDARD_AGENTS;
const FALLBACK_THINKING_AGENTS: AgentMeta[] = THINKING_AGENTS;
const FALLBACK_SUPER_THINKING_AGENTS: AgentMeta[] = SUPER_THINKING_AGENTS;

const AnimatedLogLine = React.memo(function AnimatedLogLine({ line }: { line: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -2 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="whitespace-pre-wrap"
    >
      {line}
    </motion.div>
  );
});

// Mode-based validation constants
const MIN_LENGTH_SUPER_CODER = 50;

function isValidInput(input: string, mode: NexusMode): boolean {
  const text = input.trim();
  
  if (mode === "super_thinking") {
    return text.length >= MIN_LENGTH_SUPER_CODER;
  }
  
  // Standard and Thinking modes: just need 1 character
  return text.length >= 1;
}

function playStepTone(frequency: number) {
  if (typeof window === "undefined") return;
  const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;

  const ctx = new AudioContextCtor();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.value = 0.0001;

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

  oscillator.start(now);
  oscillator.stop(now + 0.2);

  setTimeout(() => {
    ctx.close();
  }, 350);
}

// REMOVED: useTypingEffect - was causing severe performance issues and shaking
// Now we display content directly without typing animation for better UX

function renderInlineImpl(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const byCode = String(text || "").split(/(`[^`]+`)/g);

  for (let i = 0; i < byCode.length; i += 1) {
    const seg = byCode[i] || "";
    if (seg.startsWith("`") && seg.endsWith("`") && seg.length >= 2) {
      parts.push(
        <code key={`code-${i}`} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[0.9em] text-white/85">
          {seg.slice(1, -1)}
        </code>
      );
      continue;
    }

    const byBold = seg.split(/(\*\*[^*]+\*\*)/g);
    for (let j = 0; j < byBold.length; j += 1) {
      const b = byBold[j] || "";
      if (b.startsWith("**") && b.endsWith("**") && b.length >= 4) {
        parts.push(
          <strong key={`bold-${i}-${j}`} className="font-semibold text-white/90">
            {b.slice(2, -2)}
          </strong>
        );
        continue;
      }

      const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
      let cursor = 0;
      let match: RegExpExecArray | null;
      while ((match = linkRe.exec(b))) {
        const before = b.slice(cursor, match.index);
        if (before) parts.push(before);
        const label = match[1] || "";
        const href = match[2] || "";
        parts.push(
          <a
            key={`link-${i}-${j}-${match.index}`}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-cyan-200 underline decoration-cyan-400/40 underline-offset-2 hover:text-cyan-100"
          >
            {label}
          </a>
        );
        cursor = match.index + match[0].length;
      }
      const rest = b.slice(cursor);
      if (rest) parts.push(rest);
    }
  }

  return parts;
}

const MarkdownView = React.memo(function MarkdownView({ markdown }: { markdown: string }) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyCode = async (code: string, index: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  const input = String(markdown || "").replace(/\r\n/g, "\n");
  const trimmed = input.trim();
  if (!trimmed) {
    return <div className="text-sm text-white/40">Awaiting output…</div>;
  }

  const lines = input.split("\n");
  const blocks: Array<
    | { type: "h"; level: number; text: string }
    | { type: "p"; text: string }
    | { type: "ul"; items: string[] }
    | { type: "ol"; items: string[] }
    | { type: "code"; lang: string; code: string }
    | { type: "table"; headers: string[]; rows: string[][] }
  > = [];

  // Helper to check if a line is a table separator (e.g., |---|---|)
  const isTableSeparator = (line: string) => /^\|?[\s\-:|]+\|[\s\-:|]+\|?$/.test(line.trim());
  // Helper to check if a line looks like a table row
  const isTableRow = (line: string) => line.trim().startsWith("|") && line.trim().endsWith("|");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] || "";

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] || "").startsWith("```")) {
        codeLines.push(lines[i] || "");
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ type: "code", lang, code: codeLines.join("\n") });
      continue;
    }

    // Table detection: header row, separator, then data rows
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1] || "")) {
      const headerLine = line.trim();
      const headers = headerLine.split("|").filter((c) => c.trim()).map((c) => c.trim());
      i += 2; // Skip header and separator
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i] || "")) {
        const rowLine = (lines[i] || "").trim();
        const cells = rowLine.split("|").filter((c) => c.trim()).map((c) => c.trim());
        rows.push(cells);
        i += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) {
      blocks.push({ type: "h", level: h[1].length, text: h[2] || "" });
      i += 1;
      continue;
    }

    if (/^-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^-\s+/.test(lines[i] || "")) {
        items.push(String(lines[i] || "").replace(/^-\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i] || "")) {
        items.push(String(lines[i] || "").replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      (lines[i] || "").trim() &&
      !(lines[i] || "").startsWith("```") &&
      !/^(#{1,3})\s+/.test(lines[i] || "") &&
      !/^-\s+/.test(lines[i] || "") &&
      !/^\d+\.\s+/.test(lines[i] || "") &&
      !isTableRow(lines[i] || "")
    ) {
      para.push(lines[i] || "");
      i += 1;
    }
    blocks.push({ type: "p", text: para.join(" ") });
  }

  return (
    <article className="space-y-3 text-sm leading-7 text-white/85">
      {blocks.map((b, idx) => {
        if (b.type === "h") {
          const cls =
            b.level === 1
              ? "text-xl font-semibold text-white/95"
              : b.level === 2
                ? "text-lg font-semibold text-white/95"
                : "text-base font-semibold text-white/90";
          const Tag = b.level === 1 ? "h1" : b.level === 2 ? "h2" : "h3";
          return (
            <Tag key={idx} className={cls}>
              {renderInlineImpl(b.text)}
            </Tag>
          );
        }
        if (b.type === "ul") {
          return (
            <ul key={idx} className="list-disc space-y-1 pl-5">
              {b.items.map((it, i2) => (
                <li key={i2}>{renderInlineImpl(it)}</li>
              ))}
            </ul>
          );
        }
        if (b.type === "ol") {
          return (
            <ol key={idx} className="list-decimal space-y-1 pl-5">
              {b.items.map((it, i2) => (
                <li key={i2}>{renderInlineImpl(it)}</li>
              ))}
            </ol>
          );
        }
        if (b.type === "code") {
          return (
            <div key={idx} className="relative group">
              {/* Copy Button - Always visible with enhanced styling */}
              <div className="absolute top-2 right-2 z-20">
                <button
                  onClick={() => copyCode(b.code, idx)}
                  className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-cyan-500/30 text-xs font-medium text-white/90 hover:text-white transition-all duration-200 backdrop-blur-md border border-white/20 hover:border-cyan-400/50 shadow-lg hover:shadow-cyan-500/20 transform-gpu hover:scale-105 focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
                  aria-label="Copy code to clipboard"
                  tabIndex={0}
                >
                  {copiedIndex === idx ? (
                    <span className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-emerald-300">Copied!</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span>Copy</span>
                    </span>
                  )}
                </button>
              </div>
              {/* Language Badge */}
              {b.lang && (
                <div className="absolute top-2 left-3 z-20">
                  <span className="px-2.5 py-1 rounded-md bg-gradient-to-r from-cyan-500/25 to-fuchsia-500/20 text-[10px] font-mono font-medium text-cyan-200 border border-cyan-400/30 shadow-sm">
                    {b.lang.toUpperCase()}
                  </span>
                </div>
              )}
              {/* Code Block */}
              <pre className="overflow-auto rounded-2xl border border-white/10 bg-black/80 p-4 pt-12 text-xs leading-5 text-white/85 hover:border-white/20 transition-colors shadow-inner">
                <code className="font-mono">{b.code}</code>
              </pre>
            </div>
          );
        }
        // TABLE RENDERING - Glassmorphic style
        if (b.type === "table") {
          return (
            <div key={idx} className="my-4 overflow-x-auto rounded-xl border border-cyan-400/20 bg-black/40 backdrop-blur-xl shadow-[0_0_30px_rgba(34,211,238,0.1)]">
              <table className="min-w-full divide-y divide-white/10">
                <thead>
                  <tr className="bg-gradient-to-r from-cyan-500/10 to-fuchsia-500/10">
                    {b.headers.map((header, hIdx) => (
                      <th
                        key={hIdx}
                        className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-cyan-300 border-b border-cyan-400/20"
                      >
                        {renderInlineImpl(header)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {b.rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className="transition-colors hover:bg-white/5"
                    >
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          className="px-4 py-2.5 text-sm text-white/80 whitespace-nowrap"
                        >
                          {renderInlineImpl(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <p key={idx} className="whitespace-pre-wrap">
            {renderInlineImpl(b.text)}
          </p>
        );
      })}
    </article>
  );
});

export function NexusChat() {
  const {
    steps,
    agents,
    liveLog,
    connection,
    errorMessage,
    answer,
    thinkingStream,
    reset,
    setConnection,
    setError,
    setAnswer,
    appendToAnswer,
    setThinkingStream,
    appendToThinking,
    markStepStarted,
    markStepCompleted,
    markStepError,
    setStepProgress,
    appendStepLog,
    setAgents,
    markAgentStart,
    markAgentFinish,
    appendLiveLog,
    // V5 Chat Session Actions
    initFromStorage,
    newChat,
    appendChatMessage,
    getMessagesForContext,
  } = useNexusStore(
    useShallow((s) => ({
      steps: s.steps,
      agents: s.agents,
      liveLog: s.liveLog,
      connection: s.connection,
      answer: s.answer,
      thinkingStream: s.thinkingStream,
      errorMessage: s.errorMessage,
      reset: s.reset,
      setConnection: s.setConnection,
      setError: s.setError,
      setAnswer: s.setAnswer,
      appendToAnswer: s.appendToAnswer,
      setThinkingStream: s.setThinkingStream,
      appendToThinking: s.appendToThinking,
      markStepStarted: s.markStepStarted,
      markStepCompleted: s.markStepCompleted,
      markStepError: s.markStepError,
      setStepProgress: s.setStepProgress,
      appendStepLog: s.appendStepLog,
      setAgents: s.setAgents,
      markAgentStart: s.markAgentStart,
      markAgentFinish: s.markAgentFinish,
      appendLiveLog: s.appendLiveLog,
      // V5 Chat Session
      initFromStorage: s.initFromStorage,
      newChat: s.newChat,
      appendChatMessage: s.appendChatMessage,
      getMessagesForContext: s.getMessagesForContext,
    }))
  );

  const [input, setInput] = useState("");
  const [showTooltip, setShowTooltip] = useState(false);
  const [mode, setMode] = useState<NexusMode>("standard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [agentMeta, setAgentMeta] = useState<{ standard: AgentMeta[]; thinking: AgentMeta[]; super_thinking: AgentMeta[] }>(() => ({
    standard: FALLBACK_STANDARD_AGENTS,
    thinking: FALLBACK_THINKING_AGENTS,
    super_thinking: FALLBACK_SUPER_THINKING_AGENTS,
  }));
  const abortRef = useRef<AbortController | null>(null);
  const lastCompletedStepRef = useRef<number>(0);
  const logRef = useRef<HTMLDivElement | null>(null);

  const canSubmit = useMemo(() => isValidInput(input, mode), [input, mode]);
  
  // Liquid glow intensity based on input length
  const glowIntensity = useMemo(() => {
    const trimmed = input.trim();
    return Math.min(1, trimmed.length / 240);
  }, [input]);

  // Initialize storage on mount
  useEffect(() => {
    initFromStorage();
  }, [initFromStorage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch("/api/nexus/meta", { method: "GET" });
        if (!resp.ok) return;
        const json = (await resp.json()) as {
          standardAgents?: AgentMeta[];
          thinkingAgents?: AgentMeta[];
          superThinkingAgents?: AgentMeta[];
          // Legacy support
          deepAgents?: AgentMeta[];
          coderAgents?: AgentMeta[];
        };
        if (cancelled) return;
        const standard = Array.isArray(json.standardAgents) ? json.standardAgents : FALLBACK_STANDARD_AGENTS;
        const thinking = Array.isArray(json.thinkingAgents)
          ? json.thinkingAgents
          : Array.isArray(json.deepAgents)
            ? json.deepAgents
            : FALLBACK_THINKING_AGENTS;
        const super_thinking = Array.isArray(json.superThinkingAgents)
          ? json.superThinkingAgents
          : Array.isArray(json.coderAgents)
            ? json.coderAgents
            : FALLBACK_SUPER_THINKING_AGENTS;
        setAgentMeta({ standard, thinking, super_thinking });
      } catch {
        if (cancelled) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [liveLog.length]);

  // Toggle sidebar
  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  // Handle new chat
  const handleNewChat = useCallback(() => {
    newChat();
    setSidebarOpen(false);
  }, [newChat]);

  // Handle Enter to send (without Shift)
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit && connection !== "streaming" && connection !== "connecting") {
        submit();
      }
    }
  }

  async function submit() {
    const query = input.trim();
    if (!isValidInput(query, mode)) {
      setShowTooltip(true);
      window.setTimeout(() => setShowTooltip(false), 1800);
      return;
    }

    abortRef.current?.abort();
    abortRef.current = null;
    lastCompletedStepRef.current = 0;

    // V5: Get message history for context BEFORE resetting state
    // This ensures we capture the current conversation context
    const contextMessages = getMessagesForContext();
    const historyForAPI = contextMessages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    reset();
    setInput("");
    setThinkingStream(""); // Clear thinking stream

    // V5: Append user message to chat history (after getting context)
    appendChatMessage("user", query, { mode });

    const metaList = mode === "thinking" ? agentMeta.thinking : mode === "super_thinking" ? agentMeta.super_thinking : agentMeta.standard;
    const nextAgents = metaList.map((a) => ({
      agent: a.agent,
      agentName: a.agentName,
      model: a.model,
      status: "idle" as const,
      startedAt: null,
      finishedAt: null,
      duration: null,
      durationMs: null,
      outputSnippet: "",
      error: null,
    }));
    setAgents(nextAgents);
    setConnection("connecting");

    appendLiveLog(`> query: ${query}`);
    appendLiveLog(`> context: ${historyForAPI.length} messages`);

    // Use POST with fetch for SSE (EventSource only supports GET)
    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const resp = await fetch("/api/nexus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          mode,
          history: historyForAPI, // Send full history (user message in query param)
        }),
        signal: abortController.signal,
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(errorText || `HTTP ${resp.status}`);
      }

      if (!resp.body) {
        throw new Error("No response body");
      }

      setConnection("streaming");
      appendLiveLog("> stream connected");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullAnswer = "";
      let fullReasoning = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          // Skip event type lines (we use data payload structure to determine event type)
          if (line.startsWith("event: ")) {
            continue;
          }

          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            if (!dataStr.trim()) continue;

            try {
              const payload = JSON.parse(dataStr);
              
              // Handle different event types based on payload structure
              if (payload.step !== undefined && payload.status === undefined && payload.percent === undefined) {
                // step_start
                markStepStarted(payload.step, payload.at);
                appendLiveLog(`> step ${payload.step} start`);
              } else if (payload.step !== undefined && payload.percent !== undefined) {
                // step_progress
                setStepProgress(payload.step, payload.percent, payload.at);
              } else if (payload.step !== undefined && payload.status !== undefined) {
                // step_finish
                if (payload.status === "error") {
                  markStepError(payload.step, payload.at);
                  if (payload.message) {
                    appendStepLog(payload.step, payload.message);
                    appendLiveLog(`> step ${payload.step} error: ${payload.message}`);
                  }
                } else {
                  markStepCompleted(payload.step, payload.at);
                  if (payload.step > lastCompletedStepRef.current) {
                    lastCompletedStepRef.current = payload.step;
                    playStepTone(260 + payload.step * 22);
                  }
                  appendLiveLog(`> step ${payload.step} done`);
                }
              } else if (payload.agent !== undefined && payload.status === undefined) {
                // agent_start
                markAgentStart(payload.agent, payload.at);
                appendLiveLog(`- ${payload.agentName} analyzing...`);
              } else if (payload.agent !== undefined && payload.status !== undefined) {
                // agent_finish
                markAgentFinish({
                  agent: payload.agent,
                  model: payload.model,
                  status: payload.status,
                  at: payload.at,
                  duration: typeof payload.duration === "string" ? payload.duration : null,
                  durationMs: typeof payload.durationMs === "number" ? payload.durationMs : null,
                  outputSnippet: typeof payload.output_snippet === "string" ? payload.output_snippet : "",
                  error: typeof payload.error === "string" ? payload.error : null,
                });
                if (payload.status === "failed") {
                  appendLiveLog(`✗ ${payload.agentName} failed - ${payload.error || "Unknown error"}`);
                } else {
                  appendLiveLog(`✓ ${payload.agentName} completed (${payload.duration || "?"})`);
                }
              } else if (payload.message !== undefined) {
                // log
                appendLiveLog(payload.message);
              } else if (payload.content !== undefined) {
                // chunk
                fullAnswer += payload.content;
                appendToAnswer(payload.content);
              } else if (payload.chunk !== undefined) {
                // thinking
                fullReasoning += payload.chunk;
                appendToThinking(payload.chunk);
              } else if (payload.reason !== undefined) {
                // finish
                appendLiveLog(`> finish reason: ${payload.reason}`);
              } else if (payload.answer !== undefined) {
                // done
                if (payload.answer && !fullAnswer) {
                  setAnswer(payload.answer);
                  fullAnswer = payload.answer;
                }
                setConnection("done");
                appendLiveLog("> run completed");
                if (payload.model) {
                  appendLiveLog(`> model: ${payload.model}`);
                }
                // V5: Append assistant message to chat history
                appendChatMessage("assistant", fullAnswer, {
                  mode,
                  model: payload.model,
                  reasoningContent: fullReasoning || undefined,
                });
              }
            } catch {
              // Ignore JSON parse errors for malformed SSE
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        appendLiveLog("> request aborted");
        return;
      }
      const message = err instanceof Error ? err.message : "Stream error";
      appendLiveLog(`> error: ${message}`);
      setError(message);
    } finally {
      abortRef.current = null;
    }
  }

  return (
    <div className="relative min-h-screen bg-black text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.12),transparent_45%),radial-gradient(circle_at_80%_35%,rgba(232,121,249,0.12),transparent_45%),radial-gradient(circle_at_50%_90%,rgba(255,255,255,0.04),transparent_55%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.06),transparent_18%,transparent_82%,rgba(255,255,255,0.05))]" />
      </div>

      <div className="relative mx-auto w-[95%] sm:w-full max-w-7xl px-2 sm:px-6 py-4 sm:py-10">
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-white/5 pb-6">
          <div>
            <div className="text-xs tracking-[0.28em] text-white/60">APEX OMNI</div>
            <div className="mt-1 text-2xl font-semibold">THE LIVING NEXUS</div>
            <div className="mt-2 text-xs text-white/45">Granular SSE telemetry • Agent-level updates • 10-step chain</div>
          </div>
          {/* V5: History + New Chat Controls */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleSidebar}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70 transition-all hover:bg-white/10 hover:text-white transform-gpu will-change-transform"
              aria-label="Open chat history"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="hidden sm:inline">History</span>
            </button>
            <button
              type="button"
              onClick={handleNewChat}
              className="flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-medium text-cyan-300 transition-all hover:bg-cyan-500/20 hover:border-cyan-400/50 transform-gpu will-change-transform"
              aria-label="Start new chat"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">New Chat</span>
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(300px,380px)_1fr]">
          <div className="order-2 lg:order-1">
            <HoloPipeline steps={steps} agents={agents} />
          </div>

          <div className="order-1 grid gap-6 lg:order-2">
            <div className="nexus-panel rounded-3xl p-5 lg:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="text-xs tracking-[0.28em] text-white/60">COMMAND INPUT</div>
                <div className="text-xs text-white/40">
                  {mode === "thinking" ? "NEXUS THINKING PRO" : mode === "super_thinking" ? "NEXUS_PRO_1" : "STANDARD"}
                </div>
              </div>
              <div className="mt-4">
                {/* Input Container - Mode-aware styling with smooth transitions */}
                <motion.div
                  animate={showTooltip
                    ? prefersReducedMotion
                      ? { opacity: 0.95 }
                      : { y: [0, -2, 0], opacity: [1, 0.92, 1] }
                    : { y: 0, opacity: 1 }
                  }
                  transition={{
                    duration: 0.25,
                    ease: [0.25, 0.1, 0.25, 1],
                    type: "tween"
                  }}
                  className={
                    `rounded-2xl border bg-black/40 p-3 backdrop-blur-xl transition-all duration-300 ring-offset-0 ${
                      errorMessage 
                        ? "border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.15)]"
                        : !canSubmit && mode === "super_thinking"
                          ? "border-amber-400/30 ring-2 ring-amber-300/20 shadow-[0_0_20px_rgba(251,191,36,0.12)]"
                          : "border-white/10 focus-within:ring-2 focus-within:ring-cyan-400/50 focus-within:border-cyan-400/30"
                    }`
                  }
                >
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      mode === "super_thinking"
                        ? "Enter a detailed prompt (50+ chars required for Super Coder)..."
                        : "Issue your directive..."
                    }
                    rows={3}
                    className="w-full resize-none bg-transparent text-sm leading-6 text-white/90 outline-none placeholder:text-white/30"
                  />
                  
                  {/* Helper text */}
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-white/40">
                    {mode === "super_thinking" && input.trim().length < MIN_LENGTH_SUPER_CODER && input.trim().length > 0 ? (
                      <span className="text-amber-300/80">
                        💡 Detailed prompt required ({input.trim().length}/{MIN_LENGTH_SUPER_CODER} chars)
                      </span>
                    ) : (
                      <span>Enter to send • Shift+Enter for new line</span>
                    )}
                  </div>
                  
                  {/* CONTROL HUB: Unified Mode + Complexity + Action */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <ModePopover value={mode} onChange={setMode} />
                      <div className="flex items-center gap-2">
                        {/* Animated Status Indicator */}
                        {connection === "streaming" || connection === "connecting" ? (
                          <>
                            <div className="h-4 w-4 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin" />
                            <span className="text-xs font-medium text-cyan-300">PROCESSING...</span>
                          </>
                        ) : connection === "done" ? (
                          <>
                            <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="text-xs font-medium text-emerald-400">OPTIMIZED</span>
                          </>
                        ) : connection === "error" ? (
                          <>
                            <div className="h-2 w-2 rounded-full bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                            <span className="text-xs font-medium text-red-300">ERROR</span>
                          </>
                        ) : canSubmit ? (
                          <>
                            <div className="relative h-3 w-3">
                              <div className="absolute inset-0 rounded-full bg-cyan-400 animate-ping opacity-75" />
                              <div className="relative h-3 w-3 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)]" />
                            </div>
                            <span className="text-xs font-medium text-cyan-300">SYSTEM READY</span>
                          </>
                        ) : (
                          <>
                            <div className="h-2 w-2 rounded-full bg-white/30" />
                            <span className="text-xs font-medium text-white/50">IDLE</span>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Irresistible Submit Button with Animated Glow - STAYS NEON DURING PROCESSING */}
                    <motion.button
                      type="button"
                      onClick={submit}
                      disabled={!canSubmit || connection === "streaming" || connection === "connecting"}
                      animate={{
                        boxShadow: canSubmit || connection === "streaming" || connection === "connecting"
                          ? connection === "streaming" || connection === "connecting"
                            ? [
                                "0 0 20px rgba(16,185,129,0.5), 0 0 40px rgba(34,211,238,0.3)",
                                "0 0 35px rgba(16,185,129,0.7), 0 0 70px rgba(34,211,238,0.4)",
                                "0 0 20px rgba(16,185,129,0.5), 0 0 40px rgba(34,211,238,0.3)",
                              ]
                            : [
                                `0 0 ${20 + glowIntensity * 15}px rgba(16,185,129,${0.4 + glowIntensity * 0.3}), 0 0 ${40 + glowIntensity * 30}px rgba(34,211,238,${0.2 + glowIntensity * 0.2})`,
                                `0 0 ${25 + glowIntensity * 20}px rgba(16,185,129,${0.6 + glowIntensity * 0.3}), 0 0 ${50 + glowIntensity * 40}px rgba(34,211,238,${0.3 + glowIntensity * 0.2})`,
                                `0 0 ${20 + glowIntensity * 15}px rgba(16,185,129,${0.4 + glowIntensity * 0.3}), 0 0 ${40 + glowIntensity * 30}px rgba(34,211,238,${0.2 + glowIntensity * 0.2})`,
                              ]
                          : "0 0 0 transparent",
                      }}
                      transition={{
                        duration: connection === "streaming" || connection === "connecting" ? 1 : 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      whileHover={canSubmit && connection !== "streaming" && connection !== "connecting" ? { scale: 1.03 } : {}}
                      whileTap={canSubmit && connection !== "streaming" && connection !== "connecting" ? { scale: 0.98 } : {}}
                      className={
                        "relative overflow-hidden rounded-full px-6 py-2.5 text-sm font-bold tracking-wide transition-all duration-300 transform-gpu will-change-transform " +
                        (canSubmit || connection === "streaming" || connection === "connecting"
                          ? "bg-gradient-to-r from-emerald-500 via-cyan-500 to-emerald-400 text-black shadow-lg shadow-emerald-500/30"
                          : "cursor-not-allowed bg-white/5 text-white/40")
                      }
                    >
                      {/* Scanning Pulse Effect - Active during processing */}
                      {(connection === "streaming" || connection === "connecting") && (
                        <motion.div
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                          animate={{ x: ["-100%", "200%"] }}
                          transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                        />
                      )}
                      {/* Shine Effect - Idle state */}
                      {canSubmit && connection !== "streaming" && connection !== "connecting" && (
                        <motion.div
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                          animate={{ x: ["-100%", "200%"] }}
                          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", repeatDelay: 1 }}
                        />
                      )}
                      <span className="relative z-10 flex items-center gap-2">
                        {/* Neon Spinner during processing */}
                        {(connection === "streaming" || connection === "connecting") && (
                          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        )}
                        {connection === "streaming" || connection === "connecting" 
                          ? "SYNTHESIZING..." 
                          : "RUN PIPELINE"}
                      </span>
                    </motion.button>
                  </div>
                </motion.div>
                {/* Error Tooltip with AnimatePresence for smooth enter/exit */}
                <AnimatePresence>
                  {showTooltip && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="mt-2 text-xs text-red-300 transform-gpu"
                    >
                      Apex requires a challenge. Elaborate.
                    </motion.div>
                  )}
                </AnimatePresence>
                {errorMessage ? (
                  <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-200">
                    {errorMessage}
                  </div>
                ) : null}
              </div>
            </div>

            {/* NEXUS PLAN LIVE - Blueprint-style thinking visualizer */}
            {(mode === "super_thinking" || mode === "thinking") && thinkingStream && (
              <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-emerald-500/20 bg-black/80 backdrop-blur-xl">
                {/* Blueprint Grid Background */}
                <div 
                  className="pointer-events-none absolute inset-0 opacity-[0.03]"
                  style={{
                    backgroundImage: `
                      linear-gradient(rgba(16,185,129,0.5) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(16,185,129,0.5) 1px, transparent 1px)
                    `,
                    backgroundSize: "20px 20px",
                  }}
                />
                
                {/* Header */}
                <div className="relative flex items-center justify-between border-b border-emerald-500/10 px-4 py-3 sm:px-5">
                  <div className="flex items-center gap-3">
                    <div className="text-[10px] sm:text-xs font-bold tracking-[0.2em] text-emerald-400/90">
                      📐 NEXUS PLAN LIVE
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Live Pulsating Indicator */}
                    <div className="relative flex items-center gap-1.5">
                      <div className="relative h-2 w-2">
                        <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
                        <div className="relative h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                      </div>
                      <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80">
                        Live Planning
                      </span>
                    </div>
                  </div>
                </div>

                {/* Plan Content - Terminal Style with Grid Paper */}
                <div className="relative max-h-72 overflow-auto p-4 sm:p-5 transform-gpu will-change-contents">
                  <div 
                    className="relative font-mono text-[11px] sm:text-xs leading-relaxed text-emerald-100/70 whitespace-pre-wrap"
                    style={{
                      backgroundImage: `
                        linear-gradient(rgba(16,185,129,0.08) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(16,185,129,0.08) 1px, transparent 1px)
                      `,
                      backgroundSize: "16px 16px",
                    }}
                  >
                    {/* Terminal prompt styling */}
                    <span className="text-emerald-500/60 select-none">❯ </span>
                    {thinkingStream}
                    {/* Blinking cursor */}
                    <span className="inline-block w-1.5 h-4 ml-0.5 bg-emerald-400/80 animate-pulse" />
                  </div>
                </div>

                {/* Footer status */}
                <div className="border-t border-emerald-500/10 px-4 py-2 sm:px-5">
                  <div className="flex items-center justify-between text-[9px] text-emerald-500/50">
                    <span>Reasoning in progress...</span>
                    <span className="font-mono">{thinkingStream.length} chars</span>
                  </div>
                </div>
              </div>
            )}

            {/* FINAL OUTPUT - Wide on mobile */}
            <div className="nexus-panel rounded-2xl sm:rounded-3xl p-3 sm:p-5 lg:p-6 will-change-contents transform-gpu w-full">
              <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-3 sm:pb-4">
                <div className="text-[10px] sm:text-xs tracking-[0.2em] sm:tracking-[0.28em] text-white/60">FINAL OUTPUT</div>
                <div className="text-[10px] sm:text-xs text-white/40">Markdown</div>
              </div>
              <div className="mt-3 sm:mt-4 min-h-[80px] sm:min-h-[100px]">
                <MarkdownView markdown={answer} />
              </div>
            </div>

            <div className="nexus-panel rounded-3xl p-5 lg:p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="text-xs tracking-[0.28em] text-white/60">LIVE LOG</div>
                <div className="text-xs text-white/40">{liveLog.length ? `${liveLog.length} lines` : "empty"}</div>
              </div>
              <div
                ref={logRef}
                className="mt-3 h-56 overflow-auto rounded-2xl border border-white/10 bg-black/60 px-4 py-3 font-mono text-[11px] leading-5 text-white/70 transform-gpu will-change-contents"
              >
                <AnimatePresence mode="popLayout">
                  {liveLog.map((line, i) => (
                    <AnimatedLogLine key={`${i}-${line.substring(0, 20)}`} line={line} />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* V5: History Sidebar */}
      <HistorySidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={handleNewChat}
      />
    </div>
  );
}
