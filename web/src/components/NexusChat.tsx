"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HoloPipeline } from "@/components/HoloPipeline";
import { ModePopover } from "@/components/ModePopover";
import { HistorySidebar } from "@/components/HistorySidebar";
import { ChatMessage } from "@/components/ChatMessage";
import { TypingIndicator } from "@/components/TypingIndicator";
import { FileUpload } from "@/components/FileUpload";
import { ChatSearch } from "@/components/ChatSearch";
import { LiveSuggestions } from "@/components/LiveSuggestions";
import { LinkPreview } from "@/components/LinkPreview";
import { ChatSummary } from "@/components/ChatSummary";
import { AboutModal } from "@/components/AboutModal";
import { hasUrls, extractUrls } from "@/lib/linkPreview";
import { useNexusStore, type NexusMode, type PipelineStageStatus } from "@/state/nexusStore";
import { useShallow } from "zustand/react/shallow";
import type { ChatAttachment } from "@/types/chat";
import { useHasMounted, useLanguage } from "@/hooks/useHasMounted";
import { STANDARD_AGENTS, THINKING_AGENTS, SUPER_THINKING_AGENTS } from "@/lib/nexusMeta";
import { normalizeRegistryMode, sanitizeModelNameForUI } from "@/lib/modelRegistry";
import { PieChart as PieChartIcon } from "lucide-react";
import html2canvas from "html2canvas";
import { AnalyticsCard, type AnalyticsData } from "@/components/AnalyticsCard";
import { createPortal } from "react-dom";

type AgentMeta = { agent: string; agentName: string; model: string };

const FALLBACK_STANDARD_AGENTS: AgentMeta[] = STANDARD_AGENTS;
const FALLBACK_THINKING_AGENTS: AgentMeta[] = THINKING_AGENTS;
const FALLBACK_SUPER_THINKING_AGENTS: AgentMeta[] = SUPER_THINKING_AGENTS;


// Mode-based validation constants
const MIN_LENGTH_SUPER_CODER = 50;

function isValidInput(input: string, mode: NexusMode): boolean {
  const text = input.trim();

  if (mode === "APEX") {
    return text.length >= MIN_LENGTH_SUPER_CODER;
  }

  // Standard and Thinking modes: just need 1 character
  return text.length >= 1;
}

const PIPELINE_STATUSES = new Set<PipelineStageStatus>([
  "idle",
  "running",
  "success",
  "failed",
  "skipped",
  "timeout",
]);

function coercePipelineStatus(value: unknown): PipelineStageStatus {
  if (typeof value === "string" && PIPELINE_STATUSES.has(value as PipelineStageStatus)) {
    return value as PipelineStageStatus;
  }
  return "idle";
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

export const MarkdownView = React.memo(function MarkdownView({ markdown }: { markdown: string }) {
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
        // TABLE RENDERING - Enhanced Neon Glassmorphic style
        if (b.type === "table") {
          return (
            <div key={idx} className="my-6 overflow-x-auto rounded-2xl border-2 border-cyan-400/40 bg-black/60 backdrop-blur-xl shadow-[0_0_40px_rgba(34,211,238,0.25)] ring-1 ring-cyan-400/20">
              <table className="min-w-full divide-y divide-cyan-400/20">
                <thead>
                  <tr className="bg-gradient-to-r from-cyan-500/20 via-fuchsia-500/15 to-cyan-500/20 border-b-2 border-cyan-400/40">
                    {b.headers.map((header, hIdx) => (
                      <th
                        key={hIdx}
                        className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-cyan-200 border-r border-cyan-400/30 last:border-r-0"
                      >
                        <span className="flex items-center gap-2">
                          <span className="h-1 w-1 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
                          {renderInlineImpl(header)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-400/15">
                  {b.rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className="transition-all duration-200 hover:bg-gradient-to-r hover:from-cyan-500/10 hover:to-fuchsia-500/5 hover:shadow-[0_0_20px_rgba(34,211,238,0.15)]"
                    >
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          className="px-5 py-3 text-sm text-white/85 whitespace-nowrap border-r border-cyan-400/10 last:border-r-0"
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

const ChatSkeleton = () => (
  <div className="space-y-8 p-6 w-full max-w-4xl mx-auto opacity-50">
    {[1, 2, 3].map((i) => (
      <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
        <div className={`space-y-2 max-w-[80%] ${i % 2 === 0 ? 'items-end flex flex-col' : ''}`}>
          <div className={`h-24 w-64 rounded-2xl animate-pulse ${i % 2 === 0 ? 'bg-cyan-500/10 rounded-tr-sm' : 'bg-white/5 rounded-tl-sm'}`}></div>
          <div className={`h-3 w-20 rounded-full bg-white/5 animate-pulse`}></div>
        </div>
      </div>
    ))}
  </div>
);

// ========== VISUAL ANALYTICS PRO BUTTON ==========
interface VisualAnalyticsButtonProps {
  messages: Array<{ role: string; content: string }>;
  getActiveSession: () => { summary?: string } | null;
}

function VisualAnalyticsButton({ messages, getActiveSession }: VisualAnalyticsButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [chartData, setChartData] = useState<AnalyticsData | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const handleGenerateChart = async () => {
    if (isGenerating) return;
    setIsGenerating(true);

    try {
      // Build context from messages
      const session = getActiveSession();
      const contextText = messages
        .slice(-20) // Last 20 messages
        .map(m => `${m.role}: ${m.content}`)
        .join("\n");

      const summaryText = session?.summary || "";

      if (!contextText && !summaryText) {
        alert("No conversation context to analyze. Start a conversation first.");
        setIsGenerating(false);
        return;
      }

      // Call AI to extract chart data
      const response = await fetch("/api/nexus/analyze-chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: contextText,
          summary: summaryText,
        }),
      });

      if (!response.ok) {
        // Fallback to demo data if API fails
        console.warn("Chart API failed, using demo data");
        const demoData: AnalyticsData = {
          type: "area",
          title: "Conversation Analytics",
          labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
          data: [420, 380, 510, 620, 580, 450, 720],
          insight: "Your conversations show peak engagement mid-week with a strong upward trend toward the weekend. Consider leveraging this pattern for important discussions.",
        };
        setChartData(demoData);
      } else {
        const data = await response.json();
        setChartData(data as AnalyticsData);
      }
    } catch (err) {
      console.error("Chart generation error:", err);
      // Use demo data on error
      const demoData: AnalyticsData = {
        type: "bar",
        title: "Topic Distribution",
        labels: ["Tech", "Business", "Creative", "Research", "Planning"],
        data: [35, 28, 18, 12, 7],
        insight: "Technology topics dominate your conversations, followed by business discussions. This suggests a strong focus on technical solutions.",
      };
      setChartData(demoData);
    }
  };

  const captureAndDownload = async () => {
    if (!chartRef.current) return;

    try {
      // Wait for chart animation
      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = await html2canvas(chartRef.current, {
        scale: 3, // HD quality
        backgroundColor: "#0f172a", // Dark slate background for consistent output
        useCORS: true,
        logging: false,
      } as Parameters<typeof html2canvas>[1]);

      // Convert to JPG
      const jpgUrl = canvas.toDataURL("image/jpeg", 0.95);
      const link = document.createElement("a");
      link.href = jpgUrl;
      link.download = `Nexus_Chart_${new Date().toISOString().split("T")[0]}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Reset state
      setChartData(null);
      setIsGenerating(false);
    } catch (err) {
      console.error("Canvas capture failed:", err);
      alert("Failed to capture chart. Please try again.");
      setChartData(null);
      setIsGenerating(false);
    }
  };

  // Auto-capture when chart data is ready
  React.useEffect(() => {
    if (chartData && chartRef.current) {
      captureAndDownload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartData]);

  return (
    <>
      <div className="relative group">
        <button
          type="button"
          onClick={handleGenerateChart}
          disabled={isGenerating}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] sm:text-xs font-medium transition-all ${isGenerating
            ? "bg-cyan-500/20 border-cyan-500/30 text-cyan-300 cursor-wait"
            : "bg-cyan-500/10 border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-400/40"
            }`}
          title="Generate Visual Analytics (JPG Chart)"
        >
          {isGenerating ? (
            <div className="h-3.5 w-3.5 border-2 border-cyan-300/30 border-t-cyan-300 rounded-full animate-spin" />
          ) : (
            <PieChartIcon className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">{isGenerating ? "Generating..." : "Charts"}</span>
        </button>
        <span className="absolute -top-2 -right-2 px-1.5 py-0.5 bg-gradient-to-r from-cyan-400 via-emerald-400 to-cyan-400 text-[8px] font-bold text-black rounded-full shadow-lg group-hover:animate-pulse">
          PRO
        </span>
      </div>

      {/* Hidden chart renderer portal */}
      {chartData && typeof window !== "undefined" && createPortal(
        <div className="fixed top-0 left-0 -z-50 opacity-0 pointer-events-none">
          <AnalyticsCard ref={chartRef} data={chartData} />
        </div>,
        document.body
      )}
    </>
  );
}

export function NexusChat() {
  const {
    pipeline,
    agents,
    connection,
    errorMessage,
    reset,
    startRun,
    finishRun,
    setConnection,
    setError,
    setAnswer,
    appendToAnswer,
    answer,
    appendToThinking,
    mergeThinkingHighlights,
    clearThinkingArtifacts,
    upsertReasoningPath,
    upsertModelScore,
    setPipelineStages,
    updatePipelineStage,
    setAgents,
    markAgentStart,
    markAgentFinish,
    markAgentCancelled,
    appendLiveLog,
    // V5 Chat Session Actions
    initFromStorage,
    newChat,
    appendChatMessage,
    editChatMessage,
    deleteChatMessage,
    setTyping,
    setAITyping,
    isAITyping,
    getActiveSession,
    getMessagesForContext,
  } = useNexusStore(
    useShallow((s) => ({
      pipeline: s.pipeline,
      agents: s.agents,
      connection: s.connection,
      errorMessage: s.errorMessage,
      reset: s.reset,
      startRun: s.startRun,
      finishRun: s.finishRun,
      setConnection: s.setConnection,
      setError: s.setError,
      setAnswer: s.setAnswer,
      appendToAnswer: s.appendToAnswer,
      answer: s.answer,
      appendToThinking: s.appendToThinking,
      mergeThinkingHighlights: s.mergeThinkingHighlights,
      clearThinkingArtifacts: s.clearThinkingArtifacts,
      upsertReasoningPath: s.upsertReasoningPath,
      upsertModelScore: s.upsertModelScore,
      setPipelineStages: s.setPipelineStages,
      updatePipelineStage: s.updatePipelineStage,
      setAgents: s.setAgents,
      markAgentStart: s.markAgentStart,
      markAgentFinish: s.markAgentFinish,
      markAgentCancelled: s.markAgentCancelled,
      appendLiveLog: s.appendLiveLog,
      // V5 Chat Session
      initFromStorage: s.initFromStorage,
      newChat: s.newChat,
      appendChatMessage: s.appendChatMessage,
      editChatMessage: s.editChatMessage,
      deleteChatMessage: s.deleteChatMessage,
      setTyping: s.setTyping,
      setAITyping: s.setAITyping,
      isAITyping: s.isAITyping,
      getActiveSession: s.getActiveSession,
      getMessagesForContext: s.getMessagesForContext,
    }))
  );

  const [input, setInput] = useState("");
  const [showTooltip, setShowTooltip] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [mode, setMode] = useState<NexusMode>("FLASH");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [isChartMode, setIsChartMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [agentMeta, setAgentMeta] = useState<{ standard: AgentMeta[]; thinking: AgentMeta[]; super_thinking: AgentMeta[] }>(() => ({
    standard: FALLBACK_STANDARD_AGENTS,
    thinking: FALLBACK_THINKING_AGENTS,
    super_thinking: FALLBACK_SUPER_THINKING_AGENTS,
  }));
  const abortRef = useRef<AbortController | null>(null);
  const requestStartedAtRef = useRef<number | null>(null);
  // High-frequency SSE chunks can arrive faster than React can comfortably re-render.
  // Buffer and flush them on rAF to avoid excessive updates and prevent cascading renders.
  const answerChunkBufferRef = useRef<string>("");
  const thinkingChunkBufferRef = useRef<string>("");
  const flushRafRef = useRef<number | null>(null);
  const hasMounted = useHasMounted();
  const { language, toggleLanguage, t } = useLanguage();
  const languageLabel = hasMounted ? (language === "ar" ? t("header.language") : "EN") : "EN";

  const flushBufferedChunks = useCallback(() => {
    if (typeof window === "undefined") return;
    if (flushRafRef.current !== null) {
      window.cancelAnimationFrame(flushRafRef.current);
      flushRafRef.current = null;
    }

    const answerChunk = answerChunkBufferRef.current;
    const thinkingChunk = thinkingChunkBufferRef.current;
    answerChunkBufferRef.current = "";
    thinkingChunkBufferRef.current = "";

    if (answerChunk) appendToAnswer(answerChunk);
    if (thinkingChunk) appendToThinking(thinkingChunk);
  }, [appendToAnswer, appendToThinking]);

  const scheduleFlushBufferedChunks = useCallback(() => {
    if (typeof window === "undefined") return;
    if (flushRafRef.current !== null) return;
    flushRafRef.current = window.requestAnimationFrame(() => {
      flushRafRef.current = null;
      const answerChunk = answerChunkBufferRef.current;
      const thinkingChunk = thinkingChunkBufferRef.current;
      answerChunkBufferRef.current = "";
      thinkingChunkBufferRef.current = "";
      if (answerChunk) appendToAnswer(answerChunk);
      if (thinkingChunk) appendToThinking(thinkingChunk);
    });
  }, [appendToAnswer, appendToThinking]);

  const canSubmit = useMemo(() => isValidInput(input, mode), [input, mode]);

  // Liquid glow intensity based on input length
  const glowIntensity = useMemo(() => {
    const trimmed = input.trim();
    return Math.min(1, trimmed.length / 240);
  }, [input]);

  // Hydration guard - only access store after mount
  // Get active session messages (only after mount to prevent hydration mismatch)
  const activeSession = hasMounted ? getActiveSession() : null;
  const messages = hasMounted && activeSession
    ? activeSession.messages.filter((m) => !m.meta?.isDeleted)
    : [];

  // Initialize storage on mount
  useEffect(() => {
    initFromStorage();
  }, [initFromStorage]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Typing detection
  useEffect(() => {
    if (!input.trim()) {
      setTyping(false);
      return;
    }
    const timer = setTimeout(() => {
      setTyping(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, [input, setTyping]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    setTyping(true);
  }, [setTyping]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
      if (typeof window !== "undefined" && flushRafRef.current !== null) {
        window.cancelAnimationFrame(flushRafRef.current);
        flushRafRef.current = null;
      }
      answerChunkBufferRef.current = "";
      thinkingChunkBufferRef.current = "";
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


  // Toggle sidebar
  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  // Handle new chat
  const handleNewChat = useCallback(() => {
    newChat();
    setSidebarOpen(false);
  }, [newChat]);

  // Regenerate response for a message
  const regenerateResponse = useCallback(async (messageId: string) => {
    const session = getActiveSession();
    if (!session) return;

    // Find the user message
    const userMessage = session.messages.find((m) => m.id === messageId && m.role === "user");
    if (!userMessage) return;

    // Find and delete the old assistant response (next message after user message)
    const userMessageIndex = session.messages.findIndex((m) => m.id === messageId);
    if (userMessageIndex >= 0 && userMessageIndex < session.messages.length - 1) {
      const nextMessage = session.messages[userMessageIndex + 1];
      if (nextMessage.role === "assistant") {
        deleteChatMessage(nextMessage.id);
      }
    }

    // Get context up to (but not including) the edited message
    const contextMessages = session.messages
      .slice(0, userMessageIndex)
      .filter((m) => !m.meta?.isDeleted);

    const historyForAPI = contextMessages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    // Add the edited message to history
    historyForAPI.push({ role: "user", content: userMessage.content });

    // Reset state
    reset();
    clearThinkingArtifacts();

    const metaList = mode === "DEEP_THINKING" ? agentMeta.thinking : mode === "APEX" ? agentMeta.super_thinking : agentMeta.standard;
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

    // Use the session settings for DRP/WEB
    // const sessionSettings = session.settings || {};
    const useDRP = false; // Feature disabled
    const useWebMax = false; // Feature disabled

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const resp = await fetch("/api/nexus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: userMessage.content,
          mode,
          history: historyForAPI,
          deepResearchPlus: useDRP,
          webMax: useWebMax,
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

      requestStartedAtRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
      setConnection("streaming");
      setAITyping(true);
      clearThinkingArtifacts();
      answerChunkBufferRef.current = "";
      thinkingChunkBufferRef.current = "";
      if (typeof window !== "undefined" && flushRafRef.current !== null) {
        window.cancelAnimationFrame(flushRafRef.current);
        flushRafRef.current = null;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullAnswer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) continue;

          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            if (!dataStr.trim()) continue;

            try {
              const payload = JSON.parse(dataStr);
              const at = typeof payload.at === "number" ? payload.at : Date.now();

              if (Array.isArray(payload.pipeline)) {
                const stages = payload.pipeline
                  .filter((s: unknown) => s && typeof s === "object")
                  .map((s: Record<string, unknown>) => ({
                    id: typeof s.id === "string" ? s.id : "",
                    name: typeof s.name === "string" ? s.name : "Stage",
                    status: coercePipelineStatus(s.status),
                    startedAt: typeof s.startedAt === "number" ? s.startedAt : null,
                    finishedAt: typeof s.finishedAt === "number" ? s.finishedAt : null,
                    latencyMs: typeof s.latencyMs === "number" ? s.latencyMs : null,
                    detail: typeof s.detail === "string" ? s.detail : undefined,
                  }))
                  .filter((s: { id: string }) => s.id.length > 0);
                if (stages.length > 0) {
                  setPipelineStages(stages);
                }
              }

              if (payload.queryLength !== undefined && payload.step === undefined && payload.agent === undefined) {
                startRun({ runId: payload.runId, mode: normalizeRegistryMode(payload.mode), at });
              } else if (payload.status !== undefined && payload.step === undefined && payload.agent === undefined && payload.answer === undefined) {
                finishRun({ status: payload.status, message: payload.message, at });
              } else if (Array.isArray(payload.stages)) {
                const stages = payload.stages
                  .filter((s: unknown) => s && typeof s === "object")
                  .map((s: Record<string, unknown>) => ({
                    id: typeof s.id === "string" ? s.id : "",
                    name: typeof s.name === "string" ? s.name : "Stage",
                    status: coercePipelineStatus(s.status),
                    startedAt: typeof s.startedAt === "number" ? s.startedAt : null,
                    finishedAt: typeof s.finishedAt === "number" ? s.finishedAt : null,
                    latencyMs: typeof s.latencyMs === "number" ? s.latencyMs : null,
                    detail: typeof s.detail === "string" ? s.detail : undefined,
                  }))
                  .filter((s: { id: string }) => s.id.length > 0);
                if (stages.length > 0) {
                  setPipelineStages(stages);
                }
              } else if (payload.stage && typeof payload.stage === "object") {
                const s = payload.stage as Record<string, unknown>;
                if (typeof s.id === "string") {
                  updatePipelineStage({
                    id: s.id,
                    name: typeof s.name === "string" ? s.name : "Stage",
                    status: coercePipelineStatus(s.status),
                    startedAt: typeof s.startedAt === "number" ? s.startedAt : null,
                    finishedAt: typeof s.finishedAt === "number" ? s.finishedAt : null,
                    latencyMs: typeof s.latencyMs === "number" ? s.latencyMs : null,
                    detail: typeof s.detail === "string" ? s.detail : undefined,
                  });
                }
              } else if (Array.isArray(payload.nodes) && typeof payload.pathId === "string" && typeof payload.agent === "string") {
                const nodes = payload.nodes
                  .filter((n: unknown) => n && typeof n === "object")
                  .map((n: Record<string, unknown>) => ({
                    id: typeof n.id === "string" ? n.id : `${payload.agent}-${Math.random().toString(16).slice(2)}`,
                    label: typeof n.label === "string" ? n.label : "",
                    kind: typeof n.kind === "string" ? n.kind : "note",
                    at: typeof n.at === "number" ? n.at : undefined,
                  }))
                  .filter((n: { label: string }) => n.label.length > 0);

                if (nodes.length > 0) {
                  upsertReasoningPath({
                    agent: payload.agent,
                    agentName: typeof payload.agentName === "string" ? payload.agentName : payload.agent,
                    model: typeof payload.model === "string" ? payload.model : "",
                    pathId: payload.pathId,
                    nodes,
                    at,
                  });
                }
              } else if (payload.signals && typeof payload.agent === "string" && payload.status === undefined) {
                const signals: Record<string, number> = {};
                if (payload.signals && typeof payload.signals === "object") {
                  for (const [k, v] of Object.entries(payload.signals as Record<string, unknown>)) {
                    if (typeof v === "number" && Number.isFinite(v)) {
                      signals[k] = v;
                    }
                  }
                }
                upsertModelScore({
                  agent: payload.agent,
                  agentName: typeof payload.agentName === "string" ? payload.agentName : payload.agent,
                  model: typeof payload.model === "string" ? payload.model : "",
                  signals,
                  at,
                });
              } else if (payload.modelSlot !== undefined && Array.isArray(payload.highlights)) {
                mergeThinkingHighlights(payload.modelSlot as string, payload.highlights as string[]);
              } else if (payload.message !== undefined && typeof payload.message === "string" && payload.step === undefined && payload.agent === undefined) {
                appendLiveLog(payload.message);
              } else if (payload.agent !== undefined && payload.status === undefined && payload.signals === undefined && payload.nodes === undefined) {
                markAgentStart(payload.agent, at);
              } else if (payload.agent !== undefined && payload.status !== undefined) {
                markAgentFinish({
                  agent: payload.agent,
                  model: payload.model,
                  status: payload.status,
                  at,
                  duration: typeof payload.duration === "string" ? payload.duration : null,
                  durationMs: typeof payload.durationMs === "number" ? payload.durationMs : null,
                  outputSnippet: typeof payload.output_snippet === "string" ? payload.output_snippet : "",
                  error: typeof payload.error === "string" ? payload.error : null,
                });
              } else if (payload.content !== undefined) {
                fullAnswer += payload.content;
                answerChunkBufferRef.current += String(payload.content || "");
                scheduleFlushBufferedChunks();
              } else if (payload.chunk !== undefined) {
                thinkingChunkBufferRef.current += String(payload.chunk || "");
                scheduleFlushBufferedChunks();
              } else if (payload.answer !== undefined) {
                if (typeof payload.answer === "string" && payload.answer.length > 0) {
                  fullAnswer = payload.answer;
                  setAnswer(payload.answer);
                }
                setConnection("done");
                setAITyping(false);
                const computedMs = requestStartedAtRef.current !== null && typeof performance !== "undefined"
                  ? performance.now() - requestStartedAtRef.current
                  : undefined;
                const realResponseTimeMs = typeof computedMs === "number"
                  ? computedMs
                  : typeof payload.realResponseTimeMs === "number"
                    ? payload.realResponseTimeMs
                    : typeof payload.responseTimeMs === "number"
                      ? payload.responseTimeMs
                      : undefined;
                const rawModelName = typeof payload.modelName === "string"
                  ? payload.modelName
                  : typeof payload.model === "string"
                    ? payload.model
                    : undefined;
                const modelName = sanitizeModelNameForUI(rawModelName);
                const finalAnswerSummary = typeof payload.finalAnswerSummary === "string"
                  ? payload.finalAnswerSummary
                  : typeof payload.coreSynthesisSummary === "string"
                    ? payload.coreSynthesisSummary
                    : undefined;
                appendChatMessage("assistant", fullAnswer, {
                  modelName,
                  realResponseTimeMs,
                  finalAnswerSummary,
                });
                setAnswer("");
              }
            } catch {
              // Ignore JSON parse errors
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return;
      }
      flushBufferedChunks();
      const message = err instanceof Error ? err.message : "Stream error";
      setError(message);
    } finally {
      abortRef.current = null;
    }
  }, [
    getActiveSession,
    deleteChatMessage,
    reset,
    startRun,
    finishRun,
    clearThinkingArtifacts,
    flushBufferedChunks,
    scheduleFlushBufferedChunks,
    mergeThinkingHighlights,
    upsertReasoningPath,
    upsertModelScore,
    setAgents,
    setConnection,
    mode,
    agentMeta,
    setPipelineStages,
    updatePipelineStage,
    markAgentStart,
    markAgentFinish,
    appendLiveLog,
    setAnswer,
    setAITyping,
    appendChatMessage,
    setError,
  ]);

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

    // ============ SILENT CHART MODE INTERCEPT ============
    if (isChartMode) {
      setConnection("streaming");
      // Add user message to chat
      appendChatMessage("user", query);
      setInput("");

      try {
        // Call the AI for chart data extraction
        const response = await fetch("/api/nexus/analyze-chart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userPrompt: query }),
        });

        if (!response.ok) {
          throw new Error("Chart API failed");
        }

        const chartData = await response.json();

        // CHECK FOR API ERROR FLAG (Phase 2 Fix)
        if (chartData.error) {
          throw new Error(chartData.details || "AI Analysis Failed");
        }

        // Create a temporary container for the chart
        const container = document.createElement("div");
        container.style.position = "fixed";
        container.style.top = "-9999px";
        container.style.left = "-9999px";
        document.body.appendChild(container);

        // Dynamically import and render the chart
        const { createRoot } = await import("react-dom/client");
        const { AnalyticsCard: ChartComponent } = await import("@/components/AnalyticsCard");

        // Create a promise that resolves when chart is rendered and captured
        const chartImageUrl = await new Promise<string>((resolve, reject) => {
          const chartElement = document.createElement("div");
          container.appendChild(chartElement);

          const chartRoot = createRoot(chartElement);

          // Use a ref callback that captures when the element is ready
          let capturedRef: HTMLDivElement | null = null;

          const refCallback = (el: HTMLDivElement | null) => {
            if (el && !capturedRef) {
              capturedRef = el;
              // Wait for chart to render & animate (Phase 2 Fix: 1500ms)
              setTimeout(async () => {
                try {
                  const canvas = await html2canvas(el, {
                    scale: 3,
                    backgroundColor: "#0f172a",
                    useCORS: true,
                    logging: false,
                  } as Parameters<typeof html2canvas>[1]);

                  const jpgUrl = canvas.toDataURL("image/jpeg", 0.95);
                  chartRoot.unmount();
                  resolve(jpgUrl);
                } catch (err) {
                  chartRoot.unmount();
                  reject(err);
                }
              }, 1500); // Increased from 600ms to 1500ms
            }
          };

          // Render using createElement to avoid JSX issues in async context
          chartRoot.render(
            React.createElement(ChartComponent, { data: chartData, ref: refCallback })
          );
        });

        // Clean up
        document.body.removeChild(container);

        // Add chart as assistant message with image
        appendChatMessage("assistant", `📊 **${chartData.title}**\n\n${chartData.insight}`, {
          attachments: [{
            id: `chart-${Date.now()}`,
            type: "image",
            url: chartImageUrl,
            name: `Nexus_Chart_${new Date().toISOString().split("T")[0]}.jpg`,
            size: chartImageUrl.length, // Approximate size from data URL
            mimeType: "image/jpeg",
          }],
        });

        // Auto-download the chart
        const link = document.createElement("a");
        link.href = chartImageUrl;
        link.download = `Nexus_Chart_${new Date().toISOString().split("T")[0]}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

      } catch (err) {
        console.error("Chart generation failed:", err);
        appendChatMessage("assistant", "❌ Chart generation failed. Please try again with a different query.");
      }

      setConnection("done");
      setIsChartMode(false); // Auto-disable after generating
      return; // STOP - do not continue to normal text flow
    }
    // ============ END CHART MODE INTERCEPT ============

    // V5: Get message history for context BEFORE resetting state
    // This ensures we capture the current conversation context
    const contextMessages = getMessagesForContext();

    // If replying to a message, include it in context
    const historyForAPI = contextMessages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    // If replying, add context about the replied message
    if (replyToId) {
      const repliedMessage = contextMessages.find((m) => m.id === replyToId);
      if (repliedMessage) {
        // Add a system-like context message about the reply
        const replyContext = `[Replying to ${repliedMessage.role === "user" ? "user" : "assistant"} message: "${repliedMessage.content.substring(0, 200)}${repliedMessage.content.length > 200 ? "..." : ""}"]`;
        historyForAPI.push({ role: "system", content: replyContext });
      }
    }

    reset();
    setInput("");
    clearThinkingArtifacts();
    setSelectedFiles([]);
    setReplyToId(null);

    // Handle file uploads if any
    let attachments: ChatAttachment[] = [];
    if (selectedFiles.length > 0) {
      // For now, we'll create placeholder attachments
      // In production, files should be uploaded to server first
      attachments = selectedFiles.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type: file.type.startsWith("image/") ? "image" : file.type === "application/pdf" ? "document" : "file",
        url: URL.createObjectURL(file), // Temporary local URL
        name: file.name,
        size: file.size,
        mimeType: file.type,
        thumbnailUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      }));
    }

    // V5: Append user message to chat history (after getting context)
    appendChatMessage("user", query, {
      attachments: attachments.length > 0 ? attachments : undefined,
      replyTo: replyToId || undefined,
    });

    const isFlashMode = mode === "FLASH";

    const metaList = mode === "DEEP_THINKING" ? agentMeta.thinking : mode === "APEX" ? agentMeta.super_thinking : agentMeta.standard;
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

    if (isFlashMode) {
      setConnection("ready"); // Instant ready state
    } else {
      setConnection("connecting");
    }

    // Convert images to base64 for API
    const imageAttachments: Array<{ data: string; mimeType: string }> = [];
    if (attachments.length > 0) {
      for (const attachment of attachments) {
        if (attachment.type === "image") {
          // Find the corresponding File object
          const file = selectedFiles.find(f => f.name === attachment.name);
          if (file) {
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result as string;
                resolve(result);
              };
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
            imageAttachments.push({
              data: base64,
              mimeType: file.type,
            });
          }
        }
      }
    }

    // Use POST with fetch for SSE (EventSource only supports GET)
    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      requestStartedAtRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
      const resp = await fetch("/api/nexus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          mode,
          flashMode: isFlashMode,
          history: historyForAPI, // Send full history (user message in query param)
          images: imageAttachments.length > 0 ? imageAttachments : undefined,
          deepResearchPlus: false, // Feature disabled
          webMax: false, // Feature disabled
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
      setAITyping(true);
      answerChunkBufferRef.current = "";
      thinkingChunkBufferRef.current = "";
      if (typeof window !== "undefined" && flushRafRef.current !== null) {
        window.cancelAnimationFrame(flushRafRef.current);
        flushRafRef.current = null;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullAnswer = "";

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
              const at = typeof payload.at === "number" ? payload.at : Date.now();

              if (payload.queryLength !== undefined && payload.step === undefined && payload.agent === undefined) {
                startRun({ runId: payload.runId, mode: normalizeRegistryMode(payload.mode), at });
              } else if (payload.status !== undefined && payload.step === undefined && payload.agent === undefined && payload.answer === undefined) {
                finishRun({ status: payload.status, message: payload.message, at });
              } else if (Array.isArray(payload.stages)) {
                const stages = payload.stages
                  .filter((s: unknown) => s && typeof s === "object")
                  .map((s: Record<string, unknown>) => ({
                    id: typeof s.id === "string" ? s.id : "",
                    name: typeof s.name === "string" ? s.name : "Stage",
                    status: coercePipelineStatus(s.status),
                    startedAt: typeof s.startedAt === "number" ? s.startedAt : null,
                    finishedAt: typeof s.finishedAt === "number" ? s.finishedAt : null,
                    latencyMs: typeof s.latencyMs === "number" ? s.latencyMs : null,
                    detail: typeof s.detail === "string" ? s.detail : undefined,
                  }))
                  .filter((s: { id: string }) => s.id.length > 0);
                if (stages.length > 0) {
                  setPipelineStages(stages);
                }
              } else if (payload.stage && typeof payload.stage === "object") {
                const s = payload.stage as Record<string, unknown>;
                if (typeof s.id === "string") {
                  updatePipelineStage({
                    id: s.id,
                    name: typeof s.name === "string" ? s.name : "Stage",
                    status: coercePipelineStatus(s.status),
                    startedAt: typeof s.startedAt === "number" ? s.startedAt : null,
                    finishedAt: typeof s.finishedAt === "number" ? s.finishedAt : null,
                    latencyMs: typeof s.latencyMs === "number" ? s.latencyMs : null,
                    detail: typeof s.detail === "string" ? s.detail : undefined,
                  });
                }
              } else if (Array.isArray(payload.nodes) && typeof payload.pathId === "string" && typeof payload.agent === "string") {
                const nodes = payload.nodes
                  .filter((n: unknown) => n && typeof n === "object")
                  .map((n: Record<string, unknown>) => ({
                    id: typeof n.id === "string" ? n.id : `${payload.agent}-${Math.random().toString(16).slice(2)}`,
                    label: typeof n.label === "string" ? n.label : "",
                    kind: typeof n.kind === "string" ? n.kind : "note",
                    at: typeof n.at === "number" ? n.at : undefined,
                  }))
                  .filter((n: { label: string }) => n.label.length > 0);

                if (nodes.length > 0) {
                  upsertReasoningPath({
                    agent: payload.agent,
                    agentName: typeof payload.agentName === "string" ? payload.agentName : payload.agent,
                    model: typeof payload.model === "string" ? payload.model : "",
                    pathId: payload.pathId,
                    nodes,
                    at,
                  });
                }
              } else if (payload.signals && typeof payload.agent === "string" && payload.status === undefined) {
                const signals: Record<string, number> = {};
                if (payload.signals && typeof payload.signals === "object") {
                  for (const [k, v] of Object.entries(payload.signals as Record<string, unknown>)) {
                    if (typeof v === "number" && Number.isFinite(v)) {
                      signals[k] = v;
                    }
                  }
                }
                upsertModelScore({
                  agent: payload.agent,
                  agentName: typeof payload.agentName === "string" ? payload.agentName : payload.agent,
                  model: typeof payload.model === "string" ? payload.model : "",
                  signals,
                  at,
                });
              } else if (payload.modelSlot !== undefined && Array.isArray(payload.highlights)) {
                mergeThinkingHighlights(payload.modelSlot as string, payload.highlights as string[]);
              } else if (payload.message !== undefined && typeof payload.message === "string" && payload.step === undefined && payload.agent === undefined) {
                appendLiveLog(payload.message);
              } else if (payload.agent !== undefined && payload.status === undefined && payload.signals === undefined && payload.nodes === undefined) {
                // agent_start
                markAgentStart(payload.agent, at);
              } else if (payload.agent !== undefined && payload.status !== undefined) {
                // agent_finish
                markAgentFinish({
                  agent: payload.agent,
                  model: payload.model,
                  status: payload.status,
                  at,
                  duration: typeof payload.duration === "string" ? payload.duration : null,
                  durationMs: typeof payload.durationMs === "number" ? payload.durationMs : null,
                  outputSnippet: typeof payload.output_snippet === "string" ? payload.output_snippet : "",
                  error: typeof payload.error === "string" ? payload.error : null,
                });
              } else if (payload.agent !== undefined && payload.reason !== undefined) {
                // agent_cancelled
                markAgentCancelled(
                  payload.agent as string,
                  typeof payload.reason === "string" ? payload.reason : "Early exit",
                  at
                );
              } else if (payload.content !== undefined) {
                // chunk
                fullAnswer += payload.content;
                answerChunkBufferRef.current += String(payload.content || "");
                scheduleFlushBufferedChunks();
              } else if (payload.chunk !== undefined) {
                // thinking
                thinkingChunkBufferRef.current += String(payload.chunk || "");
                scheduleFlushBufferedChunks();
              } else if (payload.answer !== undefined) {
                // done
                flushBufferedChunks();
                if (typeof payload.answer === "string" && payload.answer.length > 0) {
                  fullAnswer = payload.answer;
                  setAnswer(payload.answer);
                }
                if (Array.isArray(payload.pipeline)) {
                  const stages = payload.pipeline
                    .filter((s: unknown) => s && typeof s === "object")
                    .map((s: Record<string, unknown>) => ({
                      id: typeof s.id === "string" ? s.id : "",
                      name: typeof s.name === "string" ? s.name : "Stage",
                      status: coercePipelineStatus(s.status),
                      startedAt: typeof s.startedAt === "number" ? s.startedAt : null,
                      finishedAt: typeof s.finishedAt === "number" ? s.finishedAt : null,
                      latencyMs: typeof s.latencyMs === "number" ? s.latencyMs : null,
                      detail: typeof s.detail === "string" ? s.detail : undefined,
                    }))
                    .filter((s: { id: string }) => s.id.length > 0);
                  if (stages.length > 0) {
                    setPipelineStages(stages);
                  }
                }
                setConnection("done");
                // V5: Append assistant message to chat history (merged with chat)
                setAITyping(false);
                const computedMs = requestStartedAtRef.current !== null && typeof performance !== "undefined"
                  ? performance.now() - requestStartedAtRef.current
                  : undefined;
                const realResponseTimeMs = typeof computedMs === "number"
                  ? computedMs
                  : typeof payload.realResponseTimeMs === "number"
                    ? payload.realResponseTimeMs
                    : typeof payload.responseTimeMs === "number"
                      ? payload.responseTimeMs
                      : undefined;
                const rawModelName = typeof payload.modelName === "string"
                  ? payload.modelName
                  : typeof payload.model === "string"
                    ? payload.model
                    : undefined;
                const modelName = sanitizeModelNameForUI(rawModelName);
                const finalAnswerSummary = typeof payload.finalAnswerSummary === "string"
                  ? payload.finalAnswerSummary
                  : typeof payload.coreSynthesisSummary === "string"
                    ? payload.coreSynthesisSummary
                    : undefined;
                appendChatMessage("assistant", fullAnswer, {
                  modelName,
                  realResponseTimeMs,
                  finalAnswerSummary,
                });
                // Clear answer state after adding to chat
                setAnswer("");
              }
            } catch {
              // Ignore JSON parse errors for malformed SSE
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return;
      }
      flushBufferedChunks();
      const message = err instanceof Error ? err.message : "Stream error";
      setError(message);
    } finally {
      abortRef.current = null;
    }
  }

  return (
    <div className="relative h-screen bg-black text-white flex flex-col overflow-hidden">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.08),transparent_45%),radial-gradient(circle_at_80%_35%,rgba(232,121,249,0.08),transparent_45%),radial-gradient(circle_at_50%_90%,rgba(255,255,255,0.03),transparent_55%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.04),transparent_18%,transparent_82%,rgba(255,255,255,0.03))]" />
      </div>

      {/* Header - Fixed at top - EXPANDED for mobile */}
      <div className="relative flex-shrink-0 flex flex-wrap items-start justify-between gap-3 sm:gap-4 px-4 sm:px-4 py-3 sm:py-3 border-b border-white/5 bg-black/40 backdrop-blur-xl z-10">
        <div className="min-w-0 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setShowAbout(true)}>
          <div className="text-[10px] sm:text-xs tracking-[0.28em] text-white/60">{t("header.apexOmni")}</div>
          <div className="mt-0.5 text-lg sm:text-2xl font-semibold truncate">{t("app.subtitle")}</div>
          <div className="mt-1 text-[10px] sm:text-xs text-white/45 hidden sm:block">{t("app.description")}</div>
        </div>
        {/* V5: History + New Chat Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-1.5 sm:gap-2 rounded-xl border border-white/10 bg-white/5 px-2 sm:px-4 py-1.5 sm:py-2 text-xs font-medium text-white/70 transition-all hover:bg-white/10 hover:text-white transform-gpu will-change-transform"
            aria-label="Search chat"
          >
            <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="hidden sm:inline">Search</span>
          </button>
          <button
            type="button"
            onClick={toggleSidebar}
            className="flex items-center gap-1.5 sm:gap-2 rounded-xl border border-white/10 bg-white/5 px-2 sm:px-4 py-1.5 sm:py-2 text-xs font-medium text-white/70 transition-all hover:bg-white/10 hover:text-white transform-gpu will-change-transform"
            aria-label={t("header.history")}
          >
            <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="hidden sm:inline">{t("header.history")}</span>
          </button>
          <button
            type="button"
            onClick={handleNewChat}
            className="flex items-center gap-1.5 sm:gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-2 sm:px-4 py-1.5 sm:py-2 text-xs font-medium text-cyan-300 transition-all hover:bg-cyan-500/20 hover:border-cyan-400/50 transform-gpu will-change-transform"
            aria-label={t("header.newChat")}
          >
            <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">{t("header.newChat")}</span>
          </button>
          <button
            type="button"
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 sm:gap-2 rounded-xl border border-white/10 bg-white/5 px-2 sm:px-3 py-1.5 sm:py-2 text-xs font-semibold text-white/70 transition-all hover:bg-white/10 hover:text-white transform-gpu will-change-transform"
            aria-label={t("accessibility.toggleLanguage")}
            title={t("accessibility.toggleLanguage")}
            suppressHydrationWarning
          >
            <span className="text-[10px] sm:text-xs tracking-[0.2em]">{languageLabel}</span>
          </button>
        </div>
      </div>

      {/* Main Content Area - Chat + Pipeline */}
      <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden px-2 sm:px-4 py-2 sm:py-3">

        {/* Pipeline Component - Handles its own floating button */}
        <HoloPipeline stages={pipeline} agents={agents} />

        {/* Chat Area - Full width */}
        <div className="flex-1 flex flex-col gap-2 sm:gap-3 min-h-0 overflow-hidden">

          {/* Chat Messages Display - Scrollable */}
          <div className="relative flex-1 flex flex-col min-h-0 bg-black/40 backdrop-blur-xl rounded-2xl sm:rounded-3xl border border-white/10 overflow-hidden">
            <div className="flex-shrink-0 flex items-center justify-between gap-4 border-b border-white/5 px-3 sm:px-6 py-2 sm:py-3">
              <div className="text-[10px] sm:text-xs tracking-[0.2em] sm:tracking-[0.28em] text-white/60">CHAT</div>
              <div className="text-[10px] sm:text-xs text-white/40" suppressHydrationWarning>
                {hasMounted ? `${messages.length} messages` : "0 messages"}
              </div>
            </div>
            <div
              className="flex-1 overflow-y-auto px-4 sm:px-5 lg:px-6 py-5 sm:py-4 space-y-4 sm:space-y-5 min-h-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarGutter: "stable" }}
            >
              {!hasMounted ? (
                <ChatSkeleton />
              ) : messages.length === 0 ? (
                <div className="text-center py-12 text-white/40">
                  <p>Start a conversation...</p>
                </div>
              ) : (
                <>
                  {/* Conversation Summary */}
                  {activeSession && messages.length >= 2 && (
                    <ChatSummary
                      messages={messages}
                      sessionId={activeSession.id}
                      onSummaryGenerated={(summary) => {
                        // Summary is automatically saved by ChatSummary component
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const _summary = summary;
                      }}
                      onAddToChat={(summaryText) => {
                        // Don't add as message if already showing in chat
                        // The summary is displayed inline by ChatSummary component
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const _summaryText = summaryText;
                      }}
                    />
                  )}

                  {messages.map((message) => {
                    const replyToMessage = message.meta?.replyTo
                      ? messages.find((m) => m.id === message.meta?.replyTo)
                      : null;

                    return (
                      <div key={message.id}>
                        <ChatMessage
                          message={message}
                          isUser={message.role === "user"}
                          onEdit={(messageId, newContent) => {
                            editChatMessage(messageId, newContent);
                            // Auto-regenerate response
                            regenerateResponse(messageId);
                          }}
                          onDelete={deleteChatMessage}
                          onReply={(id) => setReplyToId(id)}
                          replyToMessage={replyToMessage}
                        />
                        {/* Link Previews */}
                        {message.role === "user" && hasUrls(message.content) && (
                          <div className="ml-11">
                            {extractUrls(message.content).map((url, idx) => (
                              <LinkPreview key={idx} url={url} />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Show streaming answer with typing animation */}
                  {connection === "streaming" && answer && (
                    <div className="mb-4">
                      <ChatMessage
                        message={{
                          id: "streaming-answer",
                          role: "assistant",
                          content: answer,
                          createdAt: Date.now(),
                        }}
                        isUser={false}
                      />
                    </div>
                  )}

                  {isAITyping && !answer && (
                    <TypingIndicator label={mode === "FLASH" ? t("chat.flashReady") : t("chat.aiThinking")} />
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Command Input - Fixed at bottom */}
      <div className="relative flex-shrink-0 bg-black/60 backdrop-blur-xl border-t border-white/10 px-3 sm:px-4 py-3 sm:py-4 z-20" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto w-full max-w-6xl">
          <div className="bg-black/40 backdrop-blur-xl rounded-2xl sm:rounded-3xl border border-white/10 p-3 sm:p-4 lg:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
              <div className="text-[10px] sm:text-xs tracking-[0.28em] text-white/60">COMMAND INPUT</div>
              <div className="text-[10px] sm:text-xs text-white/40">
                {t(`modes.${mode}.label`)}
              </div>
            </div>
            <div>
              <div
                className={
                  `rounded-2xl border bg-black/40 p-4 sm:p-3 backdrop-blur-xl ring-offset-0 ${errorMessage
                    ? "border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.15)]"
                    : !canSubmit && mode === "APEX"
                      ? "border-amber-400/30 ring-2 ring-amber-300/20 shadow-[0_0_20px_rgba(251,191,36,0.12)]"
                      : "border-white/10 focus-within:ring-2 focus-within:ring-cyan-400/50 focus-within:border-cyan-400/30"
                  }`
                }
              >
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    mode === "APEX"
                      ? "Enter a detailed prompt (50+ chars required for APEX)..."
                      : "Issue your directive..."
                  }
                  rows={3}
                  aria-label="Command input"
                  className="w-full resize-none bg-transparent text-sm leading-6 text-white/90 outline-none placeholder:text-white/30 min-h-[60px] sm:min-h-[50px] max-h-[120px] sm:max-h-[100px]"
                />


                {/* Selected Files Preview */}
                {selectedFiles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-xs text-white/70"
                      >
                        <span className="truncate max-w-[150px]">{file.name}</span>
                        <button
                          onClick={() => setSelectedFiles((prev) => prev.filter((_, i) => i !== index))}
                          className="text-red-400 hover:text-red-300"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Helper text */}
                <div className="mt-2 flex items-center gap-2 text-[10px] text-white/40">
                  {mode === "APEX" && input.trim().length < MIN_LENGTH_SUPER_CODER && input.trim().length > 0 ? (
                    <span className="text-amber-300/80">
                      💡 Detailed prompt required ({input.trim().length}/{MIN_LENGTH_SUPER_CODER} chars)
                    </span>
                  ) : (
                    <span>Enter to send • Shift+Enter for new line</span>
                  )}
                </div>

                {/* Live Suggestions - Inline above textarea */}
                {(connection === "idle" || connection === "ready") && (
                  <LiveSuggestions
                    input={input}
                    messages={messages}
                    onSelect={(suggestion) => {
                      setInput(suggestion);
                      textareaRef.current?.focus();
                    }}
                    textareaRef={textareaRef}
                  />
                )}

                {/* CONTROL HUB: Unified Mode + Complexity + Action */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    <ModePopover value={mode} onChange={setMode} />
                    {/* File Upload - Emoji Button (integrated into control hub) */}
                    <FileUpload
                      onFilesSelected={setSelectedFiles}
                      maxSize={10 * 1024 * 1024}
                    />
                    {/* Chart Mode Toggle - Pre-send visual analytics */}
                    <button
                      type="button"
                      onClick={() => setIsChartMode(!isChartMode)}
                      className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] sm:text-xs font-medium transition-all ${isChartMode
                        ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                        : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70"
                        }`}
                      title={isChartMode ? "Chart Mode ON - Send message to generate chart" : "Enable Visual Analytics"}
                    >
                      <svg
                        className={`h-3.5 w-3.5 transition-all ${isChartMode ? "text-emerald-300" : ""
                          }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      <span className="hidden sm:inline">{isChartMode ? "Chart ON" : "Charts"}</span>
                      {isChartMode && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                      )}
                    </button>
                    {/* Deep Research PLUS Toggle - Coming Soon */}
                    <div className="relative">
                      <button
                        type="button"
                        disabled
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] sm:text-xs font-medium transition-all bg-white/5 border-white/10 text-white/30 cursor-not-allowed opacity-60"
                        title={t("features.drp.comingSoon")}
                      >
                        <span>🔬</span>
                        <span className="hidden sm:inline">{t("features.drp.label")}</span>
                      </button>
                      <span className="absolute -top-2 -right-2 px-1.5 py-0.5 bg-gradient-to-r from-amber-500 to-orange-500 text-[8px] font-bold text-white rounded-full shadow-lg">
                        SOON
                      </span>
                    </div>
                    {/* WEB MAX Toggle - Coming Soon */}
                    <div className="relative">
                      <button
                        type="button"
                        disabled
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] sm:text-xs font-medium transition-all bg-white/5 border-white/10 text-white/30 cursor-not-allowed opacity-60"
                        title={t("features.web.comingSoon")}
                      >
                        <span>🌐</span>
                        <span className="hidden sm:inline">{t("features.web.label")}</span>
                      </button>
                      <span className="absolute -top-2 -right-2 px-1.5 py-0.5 bg-gradient-to-r from-amber-500 to-orange-500 text-[8px] font-bold text-white rounded-full shadow-lg">
                        SOON
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Animated Status Indicator */}
                      {connection === "streaming" || connection === "connecting" ? (
                        <>
                          <div className="h-4 w-4 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin" />
                          <span className="text-xs font-medium text-cyan-300">PROCESSING...</span>
                        </>
                      ) : connection === "ready" && mode === "FLASH" ? (
                        <>
                          <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span className="text-xs font-medium text-cyan-300">{t("chat.flashReady")}</span>
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
                        ? t("chat.synthesizing")
                        : t("chat.runPipeline")}
                    </span>
                  </motion.button>
                </div>
              </div>
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
                    APEX requires a challenge. Elaborate.
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
        </div>
      </div>

      {/* V5: History Sidebar */}
      <HistorySidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={handleNewChat}
      />

      {/* Chat Search */}
      <ChatSearch
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectMessage={() => {
          // Scroll to message (implementation can be enhanced)
          setSearchOpen(false);
        }}
      />

      {/* About Modal */}
      <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />
    </div>
  );
}
