"use client";

import { useEffect, useMemo, useState } from "react";
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
  if (status === "running") return "ring-cyan-400/35 shadow-[0_0_40px_rgba(34,211,238,0.22)] animate-pulse";
  if (status === "completed") return "ring-emerald-400/35 shadow-[0_0_36px_rgba(52,211,153,0.18)]";
  if (status === "error") return "ring-red-500/35 shadow-[0_0_36px_rgba(239,68,68,0.18)]";
  return "ring-white/10";
}

function ProgressRing({ status, percent }: { status: NexusStep["status"]; percent: number }) {
  const size = 30;
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

function SwarmDetails({ agents }: { agents: NexusAgent[] }) {
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
                <div className="mt-0.5 truncate text-[11px] text-white/45">{a.model}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {a.status === "running" ? (
                  <div className="h-4 w-4 animate-spin rounded-full border border-white/15 border-t-cyan-300" />
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
}

export function HoloPipeline({ steps, agents }: { steps: NexusStep[]; agents: NexusAgent[] }) {
  const anyRunning = useMemo(() => steps.some((s) => s.status === "running"), [steps]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!anyRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 80);
    return () => window.clearInterval(id);
  }, [anyRunning]);

  return (
    <div className="w-full">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl [transform:perspective(1000px)_rotateX(4deg)]">
        <div className="pointer-events-none absolute inset-0 opacity-80 [background:radial-gradient(circle_at_10%_20%,rgba(34,211,238,0.12),transparent_45%),radial-gradient(circle_at_80%_30%,rgba(232,121,249,0.10),transparent_50%)]" />
        <div className="flex items-center justify-between gap-4">
          <div className="text-xs tracking-[0.28em] text-white/60">PIPELINE</div>
          <div className="text-xs text-white/40">Steps 1–10</div>
        </div>

        <div className="mt-5 grid gap-2">
          {steps.map((s) => (
            <div
              key={s.id}
              className={
                "relative overflow-hidden rounded-2xl border px-4 py-3 transition-transform duration-300 hover:-translate-y-0.5 " +
                rowClasses(s.status) +
                " [transform:perspective(1000px)_rotateX(6deg)]"
              }
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
                      {s.status === "running" ? `${Math.round(s.percent || 0)}%` : s.status === "idle" ? "queued" : s.status}
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
    </div>
  );
}
