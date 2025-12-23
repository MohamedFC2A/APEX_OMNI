"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { NexusAgent, NexusStep } from "@/state/nexusStore";

function rowClasses(status: NexusStep["status"]) {
  if (status === "running") return "border-cyan-400/60 bg-cyan-500/5 shadow-[0_0_30px_rgba(34,211,238,0.35)]";
  if (status === "completed") return "border-emerald-400/60 bg-emerald-500/5 shadow-[0_0_28px_rgba(52,211,153,0.25)]";
  if (status === "error") return "border-red-500/60 bg-red-500/5 shadow-[0_0_28px_rgba(239,68,68,0.25)]";
  return "border-white/10 bg-white/[0.02]";
}

function ringClasses(status: NexusStep["status"]) {
  if (status === "running") return "stroke-cyan-300";
  if (status === "completed") return "stroke-emerald-300";
  if (status === "error") return "stroke-red-400";
  return "stroke-white/20";
}

function glowClasses(status: NexusStep["status"]) {
  if (status === "running") return "ring-cyan-400/35 shadow-[0_0_40px_rgba(34,211,238,0.22)]";
  if (status === "completed") return "ring-emerald-400/35 shadow-[0_0_36px_rgba(52,211,153,0.18)]";
  if (status === "error") return "ring-red-500/35 shadow-[0_0_36px_rgba(239,68,68,0.18)]";
  return "ring-white/10";
}

function dotColor(status: NexusStep["status"]) {
  if (status === "running") return "bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.6)]";
  if (status === "completed") return "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.6)]";
  if (status === "error") return "bg-red-400 shadow-[0_0_10px_rgba(239,68,68,0.6)]";
  return "bg-white/20";
}

function ProgressRing({ status, percent, size = 30 }: { status: NexusStep["status"]; percent: number; size?: number }) {
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));
  const dash = (p / 100) * c;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        className={"transition-all duration-300 " + ringClasses(status)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

const SwarmDetails = React.memo(function SwarmDetails({ agents }: { agents: NexusAgent[] }) {
  const counts = useMemo(() => {
    let completed = 0;
    let failed = 0;
    let running = 0;
    for (const a of agents) {
      if (a.status === "completed") completed += 1;
      else if (a.status === "failed") failed += 1;
      else if (a.status === "running") running += 1;
    }
    return { completed, failed, running, total: agents.length };
  }, [agents]);

  const finishedCount = counts.completed + counts.failed;
  const percent = counts.total ? (finishedCount / counts.total) * 100 : 0;

  return (
    <div className="mt-3">
      <details className="rounded-xl border border-cyan-400/20 bg-black/55 backdrop-blur-xl">
        <summary className="cursor-pointer list-none px-3 py-2 text-xs text-white/80">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-white/90">Swarm Details</span>
              <span className="text-white/45">
                {counts.completed}/{counts.total} OK{counts.failed ? ` • ${counts.failed} ERR` : ""}
              </span>
            </div>
            <span className="text-white/40">{Math.round(percent)}%</span>
          </div>

          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-fuchsia-300 to-cyan-200 transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
            />
          </div>
        </summary>

        <div className="max-h-56 overflow-auto">
          {agents.map((a) => (
            <div
              key={a.agent}
              className={
                "flex items-start justify-between gap-3 border-t border-white/5 px-3 py-2 " +
                (a.status === "completed"
                  ? "bg-emerald-500/10"
                  : a.status === "failed"
                    ? "bg-red-500/10"
                    : a.status === "running"
                      ? "bg-cyan-500/10"
                      : "")
              }
            >
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-white/90">{a.agentName}</div>
                <div className="mt-0.5 truncate text-[11px] text-white/45">
                  {a.model === "deepseek-reasoner"
                    ? "DeepSeek R1"
                    : a.model === "deepseek-chat"
                      ? "DeepSeek V3"
                      : "DeepSeek"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {a.status === "running" ? (
                  <div
                    className="h-4 w-4 rounded-full border border-white/15 border-t-cyan-300"
                    style={{ animation: "spin 1s linear infinite" }}
                  />
                ) : a.status === "completed" ? (
                  <span className="text-emerald-300">✓</span>
                ) : a.status === "failed" ? (
                  <span className="text-red-300">✕</span>
                ) : (
                  <span className="text-white/25">•</span>
                )}
                <div className="w-12 text-right text-[11px] text-white/40">{a.duration || ""}</div>
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
});

// Mobile Active Step Card - Shows only the currently active step
const MobileActiveStepCard = React.memo(function MobileActiveStepCard({
  step,
  now,
  agents,
}: {
  step: NexusStep | null;
  now: number;
  agents: NexusAgent[];
}) {
  if (!step) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/40 p-6 text-center backdrop-blur-xl">
        <div className="flex justify-center mb-3">
          <div className="relative h-3 w-3">
            <div className="absolute inset-0 rounded-full bg-cyan-400 animate-ping opacity-75" />
            <div className="relative h-3 w-3 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)]" />
          </div>
        </div>
        <div className="text-sm font-medium text-cyan-200">SYSTEM READY</div>
        <div className="mt-1 text-xs text-white/40">Awaiting input...</div>
      </div>
    );
  }

  const percent =
    step.status === "completed"
      ? 100
      : step.status !== "running"
        ? 0
        : typeof step.percent === "number" && step.percent > 0
          ? step.percent
          : typeof step.startedAt === "number"
            ? Math.min(92, Math.max(0, ((now - step.startedAt) / 1500) * 92))
            : 0;

  // Status badge text and color
  const statusBadge = step.status === "running" 
    ? { text: "ACTIVE", color: "bg-cyan-500/20 text-cyan-300 border-cyan-400/30" }
    : step.status === "completed"
      ? { text: "DONE", color: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30" }
      : step.status === "error"
        ? { text: "ERROR", color: "bg-red-500/20 text-red-300 border-red-400/30" }
        : { text: "QUEUED", color: "bg-white/5 text-white/50 border-white/10" };

  return (
    <div
      className={
        "relative overflow-hidden rounded-2xl border p-4 transition-all duration-200 transform-gpu " + rowClasses(step.status)
      }
    >
      <div className={"pointer-events-none absolute inset-0 rounded-2xl ring-1 " + glowClasses(step.status)} />

      <div className="flex items-center gap-3">
        {/* Large Progress Ring */}
        <div className="relative h-14 w-14 flex-shrink-0">
          <ProgressRing status={step.status} percent={percent} size={56} />
          <div className="absolute inset-0 flex items-center justify-center text-base font-bold text-white/90">
            {step.status === "completed" ? (
              <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            ) : step.status === "error" ? (
              <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              step.id
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] text-white/50">Step {step.id}/10</div>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusBadge.color}`}>
              {statusBadge.text}
            </span>
          </div>
          <div className="mt-0.5 truncate text-sm font-semibold text-white/95">{step.label}</div>

          {step.status === "running" && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-cyan-200 transition-all duration-300"
                style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {step.id === 1 && agents.length > 0 && <SwarmDetails agents={agents} />}
    </div>
  );
});

// Mobile Dot Rail - Horizontal progress indicator with enhanced contrast
const MobileDotRail = React.memo(function MobileDotRail({
  steps,
  activeIndex,
}: {
  steps: NexusStep[];
  activeIndex: number;
}) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-3 px-2">
      {steps.map((s, i) => (
        <div
          key={s.id}
          className={`flex items-center justify-center rounded-full transition-all duration-300 transform-gpu ${
            i === activeIndex 
              ? "h-7 w-7 ring-2 ring-offset-1 ring-offset-black " + 
                (s.status === "running" ? "ring-cyan-400/70" : 
                 s.status === "completed" ? "ring-emerald-400/70" : 
                 s.status === "error" ? "ring-red-400/70" : "ring-white/30")
              : "h-3 w-3"
          } ${dotColor(s.status)}`}
        >
          {/* Show icon for active dot */}
          {i === activeIndex && (
            <span className="text-[10px] font-bold text-black">
              {s.status === "completed" ? "✓" : 
               s.status === "error" ? "!" : 
               s.status === "running" ? "" : s.id}
            </span>
          )}
        </div>
      ))}
    </div>
  );
});

// Desktop Full Pipeline View
const DesktopPipelineView = React.memo(function DesktopPipelineView({
  steps,
  agents,
  now,
}: {
  steps: NexusStep[];
  agents: NexusAgent[];
  now: number;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl"
      style={{ transform: "perspective(1000px) rotateX(2deg)" }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(circle at 10% 20%,rgba(34,211,238,0.12),transparent 45%),radial-gradient(circle at 80% 30%,rgba(232,121,249,0.10),transparent 50%)",
        }}
      />
      <div className="flex items-center justify-between gap-4">
        <div className="text-xs tracking-[0.28em] text-white/60">PIPELINE</div>
        <div className="text-xs text-white/40">Steps 1–10</div>
      </div>

      <div className="mt-5 grid gap-2">
        {steps.map((s) => (
          <div
            key={s.id}
            className={
              "relative overflow-hidden rounded-2xl border px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 " +
              rowClasses(s.status)
            }
            style={{ transform: "perspective(1000px) rotateX(3deg)" }}
          >
            <div className={"pointer-events-none absolute inset-0 rounded-2xl ring-1 " + glowClasses(s.status)} />
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-[30px] w-[30px] items-center justify-center">
                <div className="relative h-[30px] w-[30px]">
                  <ProgressRing
                    status={s.status}
                    percent={
                      s.status === "completed"
                        ? 100
                        : s.status !== "running"
                          ? 0
                          : typeof s.percent === "number" && s.percent > 0
                            ? s.percent
                            : typeof s.startedAt === "number"
                              ? Math.min(92, Math.max(0, ((now - s.startedAt) / 1500) * 92))
                              : 0
                    }
                  />
                  <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-white/85">
                    {s.status === "completed" ? "✓" : s.id}
                  </div>
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-[11px] text-white/45">Step {s.id}</div>
                      <div className="truncate text-sm font-medium text-white/90">{s.label}</div>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-white/40">{s.name}</div>
                  </div>
                  <div className="text-[11px] text-white/35">
                    {s.status === "running"
                      ? `${Math.round(s.percent || 0)}%`
                      : s.status === "idle"
                        ? "queued"
                        : s.status}
                  </div>
                </div>

                {s.status === "running" ? (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-cyan-200"
                      style={{ width: `${Math.max(0, Math.min(100, s.percent || 0))}%` }}
                    />
                  </div>
                ) : null}

                {s.id === 1 && agents.length ? <SwarmDetails agents={agents} /> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export function HoloPipeline({ steps, agents }: { steps: NexusStep[]; agents: NexusAgent[] }) {
  const anyRunning = useMemo(() => steps.some((s) => s.status === "running"), [steps]);
  const [now, setNow] = useState(() => Date.now());

  // Find active step (running, or last completed, or first idle)
  const { activeStep, activeIndex } = useMemo(() => {
    const runningIdx = steps.findIndex((s) => s.status === "running");
    if (runningIdx !== -1) return { activeStep: steps[runningIdx], activeIndex: runningIdx };

    // Find last completed
    let lastCompletedIdx = -1;
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].status === "completed") {
        lastCompletedIdx = i;
        break;
      }
    }
    if (lastCompletedIdx !== -1) return { activeStep: steps[lastCompletedIdx], activeIndex: lastCompletedIdx };

    // Find first step with error or first idle
    const errorIdx = steps.findIndex((s) => s.status === "error");
    if (errorIdx !== -1) return { activeStep: steps[errorIdx], activeIndex: errorIdx };

    return { activeStep: steps[0] || null, activeIndex: 0 };
  }, [steps]);

  useEffect(() => {
    if (!anyRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 80);
    return () => window.clearInterval(id);
  }, [anyRunning]);

  return (
    <div className="w-full">
      {/* Mobile View (hidden on lg+) */}
      <div className="block lg:hidden">
        <div className="rounded-3xl border border-white/10 bg-black/40 p-4 backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs tracking-[0.2em] text-white/60">PIPELINE</div>
            <div className="text-xs text-white/40">
              {activeIndex + 1}/10
            </div>
          </div>

          <MobileActiveStepCard step={activeStep} now={now} agents={agents} />
          <MobileDotRail steps={steps} activeIndex={activeIndex} />
        </div>
      </div>

      {/* Desktop View (hidden on mobile) */}
      <div className="hidden lg:block">
        <DesktopPipelineView steps={steps} agents={agents} now={now} />
      </div>
    </div>
  );
}
