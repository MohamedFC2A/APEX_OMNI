"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { HoloPipeline } from "@/components/HoloPipeline";
import { useNexusStore } from "@/state/nexusStore";
import { useShallow } from "zustand/react/shallow";

type AgentMeta = { agent: string; agentName: string; model: string };

const FALLBACK_STANDARD_AGENTS: AgentMeta[] = [
  { agent: "cerebras_llama_70b", agentName: "Cerebras Llama 3.3 70B", model: "llama-3.3-70b" },
  { agent: "cerebras_llama_8b", agentName: "Cerebras Llama 3.1 8B", model: "llama3.1-8b" },
  { agent: "cerebras_llama_70b_backup", agentName: "Cerebras Llama 3.3 70B (Backup)", model: "llama-3.3-70b" },
];

const FALLBACK_THINKING_NEXUS_AGENTS: AgentMeta[] = [
  { agent: "deepseek_v3", agentName: "DeepSeek V3", model: "blackboxai/deepseek/deepseek-chat" },
  { agent: "gpt_4o", agentName: "GPT-4o", model: "blackboxai/openai/gpt-4o" },
  { agent: "claude_sonnet", agentName: "Claude 3.5 Sonnet", model: "blackboxai/anthropic/claude-3-5-sonnet" },
];

function AnimatedLogLine({ line }: { line: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="whitespace-pre-wrap"
    >
      {line}
    </motion.div>
  );
}

function isComplexQuery(input: string) {
  const text = input.trim();
  if (text.length > 50) return true;

  const keywords = [
    "implement",
    "architecture",
    "debug",
    "refactor",
    "optimize",
    "design",
    "integrate",
    "pipeline",
    "orchestrate",
    "database",
    "migration",
    "security",
    "performance",
    "next.js",
    "express",
  ];

  const lowered = text.toLowerCase();
  return keywords.some((k) => lowered.includes(k));
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

function useTypingEffect(chunks: string[], enabled: boolean, intervalMs: number) {
  const [text, setText] = useState("");
  const idxRef = useRef(0);

  useEffect(() => {
    idxRef.current = 0;
    setText("");
  }, [chunks]);

  useEffect(() => {
    if (!enabled) return;
    if (chunks.length === 0) return;

    const id = window.setInterval(() => {
      const idx = idxRef.current;
      if (idx >= chunks.length) {
        window.clearInterval(id);
        return;
      }
      setText((prev) => prev + chunks[idx]);
      idxRef.current = idx + 1;
    }, Math.max(10, intervalMs));

    return () => window.clearInterval(id);
  }, [chunks, enabled, intervalMs]);

  return text;
}

function renderInline(text: string): ReactNode[] {
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

function MarkdownView({ markdown }: { markdown: string }) {
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
  > = [];

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
      !/^\d+\.\s+/.test(lines[i] || "")
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
              {renderInline(b.text)}
            </Tag>
          );
        }
        if (b.type === "ul") {
          return (
            <ul key={idx} className="list-disc space-y-1 pl-5">
              {b.items.map((it, i2) => (
                <li key={i2}>{renderInline(it)}</li>
              ))}
            </ul>
          );
        }
        if (b.type === "ol") {
          return (
            <ol key={idx} className="list-decimal space-y-1 pl-5">
              {b.items.map((it, i2) => (
                <li key={i2}>{renderInline(it)}</li>
              ))}
            </ol>
          );
        }
        if (b.type === "code") {
          return (
            <pre
              key={idx}
              className="overflow-auto rounded-2xl border border-white/10 bg-black/70 p-4 text-xs leading-5 text-white/80"
            >
              <code>{b.code}</code>
            </pre>
          );
        }
        return (
          <p key={idx} className="whitespace-pre-wrap">
            {renderInline(b.text)}
          </p>
        );
      })}
    </article>
  );
}

export function NexusChat() {
  const {
    steps,
    agents,
    liveLog,
    connection,
    answer,
    typingChunks,
    typingIntervalMs,
    errorMessage,
    reset,
    setConnection,
    setError,
    setAnswer,
    setTypingChunks,
    markStepStarted,
    markStepCompleted,
    markStepError,
    setStepProgress,
    appendStepLog,
    setAgents,
    markAgentStart,
    markAgentFinish,
    appendLiveLog,
  } = useNexusStore(
    useShallow((s) => ({
      steps: s.steps,
      agents: s.agents,
      liveLog: s.liveLog,
      connection: s.connection,
      answer: s.answer,
      typingChunks: s.typingChunks,
      typingIntervalMs: s.typingIntervalMs,
      errorMessage: s.errorMessage,
      reset: s.reset,
      setConnection: s.setConnection,
      setError: s.setError,
      setAnswer: s.setAnswer,
      setTypingChunks: s.setTypingChunks,
      markStepStarted: s.markStepStarted,
      markStepCompleted: s.markStepCompleted,
      markStepError: s.markStepError,
      setStepProgress: s.setStepProgress,
      appendStepLog: s.appendStepLog,
      setAgents: s.setAgents,
      markAgentStart: s.markAgentStart,
      markAgentFinish: s.markAgentFinish,
      appendLiveLog: s.appendLiveLog,
    }))
  );

  const [input, setInput] = useState("");
  const [invalidPulse, setInvalidPulse] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);
  const [typingEnabled, setTypingEnabled] = useState(true);
  const [thinkingNexus, setThinkingNexus] = useState(false);
  const [agentMeta, setAgentMeta] = useState<{ standard: AgentMeta[]; thinking: AgentMeta[] }>(() => ({
    standard: FALLBACK_STANDARD_AGENTS,
    thinking: FALLBACK_THINKING_NEXUS_AGENTS,
  }));
  const esRef = useRef<EventSource | null>(null);
  const lastCompletedStepRef = useRef<number>(0);
  const logRef = useRef<HTMLDivElement | null>(null);

  const canSubmit = useMemo(() => isComplexQuery(input), [input]);
  const chunksToType = useMemo(() => {
    if (Array.isArray(typingChunks) && typingChunks.length > 0) return typingChunks;
    if (typeof answer === "string" && answer.length > 0) return [answer];
    return [];
  }, [typingChunks, answer]);
  const typedAnswer = useTypingEffect(chunksToType, typingEnabled, typingIntervalMs);

  useEffect(() => {
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch("/api/nexus/meta", { method: "GET" });
        if (!resp.ok) return;
        const json = (await resp.json()) as { standardAgents?: AgentMeta[]; thinkingAgents?: AgentMeta[] };
        if (cancelled) return;
        const standard = Array.isArray(json.standardAgents) ? json.standardAgents : FALLBACK_STANDARD_AGENTS;
        const thinking = Array.isArray(json.thinkingAgents) ? json.thinkingAgents : FALLBACK_THINKING_NEXUS_AGENTS;
        setAgentMeta({ standard, thinking });
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

  async function submit() {
    const query = input.trim();
    if (!isComplexQuery(query)) {
      setInvalidPulse((x) => x + 1);
      setShowTooltip(true);
      window.setTimeout(() => setShowTooltip(false), 1800);
      return;
    }

    esRef.current?.close();
    esRef.current = null;
    lastCompletedStepRef.current = 0;

    reset();
    setTypingEnabled(true);
    setInput("");

    const metaList = thinkingNexus ? agentMeta.thinking : agentMeta.standard;
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

    const url = `/api/nexus/stream?query=${encodeURIComponent(query)}&thinkingNexus=${thinkingNexus ? "true" : "false"}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener("open", () => {
      setConnection("streaming");
      appendLiveLog("> stream connected");
    });

    es.addEventListener("step_progress", (evt) => {
      const payload = JSON.parse((evt as MessageEvent).data) as {
        step: number;
        at: number;
        percent: number;
      };
      if (!payload || typeof payload.step !== "number" || typeof payload.percent !== "number") return;
      setStepProgress(payload.step, payload.percent, payload.at);
    });

    es.addEventListener("step_start", (evt) => {
      const payload = JSON.parse((evt as MessageEvent).data) as {
        step: number;
        at: number;
      };
      if (!payload || typeof payload.step !== "number") return;
      markStepStarted(payload.step, payload.at);
      appendLiveLog(`> step ${payload.step} start`);
    });

    es.addEventListener("step_finish", (evt) => {
      const payload = JSON.parse((evt as MessageEvent).data) as {
        step: number;
        at: number;
        status: "completed" | "error";
        message?: string;
      };
      if (!payload || typeof payload.step !== "number") return;
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
    });

    es.addEventListener("agent_start", (evt) => {
      const payload = JSON.parse((evt as MessageEvent).data) as {
        agent: string;
        agentName: string;
        model: string;
        at: number;
      };
      if (!payload || typeof payload.agent !== "string") return;
      markAgentStart(payload.agent, payload.at);
      appendLiveLog(`- ${payload.agentName} analyzing...`);
    });

    es.addEventListener("agent_finish", (evt) => {
      const payload = JSON.parse((evt as MessageEvent).data) as {
        agent: string;
        agentName: string;
        model: string;
        status: "completed" | "failed";
        duration?: string;
        durationMs?: number;
        output_snippet?: string;
        error?: string | null;
        at: number;
      };
      if (!payload || typeof payload.agent !== "string") return;
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
        appendLiveLog(`- ${payload.agentName} failed (${payload.duration || "?"})`);
      } else {
        appendLiveLog(`- ${payload.agentName} finished (${payload.duration || "?"})`);
      }
    });

    es.addEventListener("log", (evt) => {
      const payload = JSON.parse((evt as MessageEvent).data) as {
        step: number;
        at: number;
        message: string;
      };

      if (typeof payload.step === "number" && typeof payload.message === "string") {
        appendStepLog(payload.step, payload.message);
        appendLiveLog(payload.message);
      }
    });

    es.addEventListener("done", (evt) => {
      const payload = JSON.parse((evt as MessageEvent).data) as {
        answer: string;
        steps?: {
          presentation?: {
            presentation?: {
              typing?: { chunks?: string[]; intervalMs?: number };
            };
          };
        };
      };

      const finalAnswer = payload.answer || "";
      setAnswer(finalAnswer);

      const typing = payload.steps?.presentation?.presentation?.typing;
      const chunks = typing?.chunks;
      const intervalMs = typing?.intervalMs;
      if (Array.isArray(chunks) && chunks.length > 0) {
        setTypingChunks(chunks, typeof intervalMs === "number" ? intervalMs : undefined);
      } else {
        setTypingChunks([]);
      }

      setConnection("done");
      appendLiveLog("> run completed");
      es.close();
      esRef.current = null;
    });

    es.addEventListener("error", (evt) => {
      const raw = (evt as MessageEvent).data;
      const message = typeof raw === "string" && raw.trim().length > 0 ? JSON.parse(raw).message : "Stream error";
      appendLiveLog(`> error: ${message}`);
      setError(message);
      es.close();
      esRef.current = null;
    });
  }

  return (
    <div className="relative min-h-screen bg-black text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.12),transparent_45%),radial-gradient(circle_at_80%_35%,rgba(232,121,249,0.12),transparent_45%),radial-gradient(circle_at_50%_90%,rgba(255,255,255,0.04),transparent_55%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.06),transparent_18%,transparent_82%,rgba(255,255,255,0.05))]" />
      </div>

      <div className="relative mx-auto w-full max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="text-xs tracking-[0.28em] text-white/60">APEX OMNI</div>
            <div className="mt-1 text-2xl font-semibold">THE LIVING NEXUS</div>
            <div className="mt-2 text-xs text-white/45">Granular SSE telemetry • Agent-level updates • 10-step chain</div>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
              {connection === "streaming" ? "streaming" : connection}
            </div>
            <button
              type="button"
              onClick={() => setTypingEnabled((v) => !v)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 hover:bg-white/10"
            >
              {typingEnabled ? "Typing: ON" : "Typing: OFF"}
            </button>
            <button
              type="button"
              onClick={() => setThinkingNexus((v) => !v)}
              className={
                "rounded-full border px-4 py-1 text-xs font-semibold tracking-wide transition " +
                (thinkingNexus
                  ? "border-fuchsia-400/70 bg-fuchsia-500/20 text-fuchsia-100 shadow-[0_0_30px_rgba(232,121,249,0.55)]"
                  : "border-cyan-400/25 bg-cyan-500/10 text-cyan-100/80 shadow-[0_0_18px_rgba(34,211,238,0.18)] hover:bg-cyan-500/15")
              }
            >
              ACTIVATE DEEP SCAN
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="order-2 lg:order-1">
            <HoloPipeline steps={steps} agents={agents} />
          </div>

          <div className="order-1 grid gap-6 lg:order-2">
            <div className="rounded-3xl border border-white/10 bg-black/35 p-5 backdrop-blur-xl">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="text-xs tracking-[0.28em] text-white/60">COMMAND INPUT</div>
                <div className="text-xs text-white/40">{thinkingNexus ? "Deep Scan: ON" : "Standard Mode"}</div>
              </div>
              <div className="mt-4">
                <motion.div
                  key={invalidPulse}
                  animate={showTooltip ? { x: [0, -10, 10, -8, 8, 0] } : { x: 0 }}
                  transition={{ duration: 0.5 }}
                  className={
                    "rounded-2xl border bg-black/40 p-3 backdrop-blur-xl " +
                    (canSubmit ? "border-white/10" : "border-red-500/30")
                  }
                >
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Issue a high-complexity directive."
                    rows={3}
                    className="w-full resize-none bg-transparent text-sm leading-6 text-white/90 outline-none placeholder:text-white/30"
                  />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-white/40">{canSubmit ? "complexity: passed" : "complexity: blocked"}</div>
                    <button
                      type="button"
                      onClick={submit}
                      className={
                        "rounded-full px-5 py-2 text-sm font-medium transition " +
                        (canSubmit
                          ? "bg-gradient-to-r from-cyan-500/80 to-fuchsia-500/80 text-black hover:from-cyan-400 hover:to-fuchsia-400"
                          : "cursor-not-allowed bg-white/5 text-white/40")
                      }
                    >
                      RUN PIPELINE
                    </button>
                  </div>
                </motion.div>
                {showTooltip ? (
                  <div className="mt-2 text-xs text-red-200">Apex requires a challenge. Elaborate.</div>
                ) : null}
                {errorMessage ? (
                  <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-200">
                    {errorMessage}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/35 p-5 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-4">
                <div className="text-xs tracking-[0.28em] text-white/60">FINAL OUTPUT</div>
                <div className="text-xs text-white/40">Markdown-rendered</div>
              </div>
              <div className="mt-4">
                <MarkdownView markdown={typedAnswer} />
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/35 p-5 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-4">
                <div className="text-xs tracking-[0.28em] text-white/60">LIVE LOG</div>
                <div className="text-xs text-white/40">{liveLog.length ? `${liveLog.length} lines` : "empty"}</div>
              </div>
              <div
                ref={logRef}
                className="mt-3 h-56 overflow-auto rounded-2xl border border-white/10 bg-black/60 px-4 py-3 font-mono text-[11px] leading-5 text-white/70"
              >
                {liveLog.map((line, i) => (
                  <AnimatedLogLine key={i} line={line} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
