"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useShallow } from "zustand/react/shallow";
import { useLanguage } from "@/hooks/useHasMounted";
import {
  useNexusStore,
  type AgentModelScore,
  type AgentReasoningPath,
  type NexusAgent,
  type PipelineStage,
  type ReasoningNode,
} from "@/state/nexusStore";

function formatLatency(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 10000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function stageStatusLabel(status: PipelineStage["status"]): string {
  if (status === "success") return "SUCCESS";
  if (status === "failed") return "FAILED";
  if (status === "timeout") return "TIMEOUT";
  if (status === "skipped") return "SKIPPED";
  if (status === "running") return "RUNNING";
  return "IDLE";
}

function stageStatusClasses(status: PipelineStage["status"]): string {
  if (status === "running") return "border-cyan-400/40 bg-cyan-500/10 text-cyan-200";
  if (status === "success") return "border-emerald-400/40 bg-emerald-500/10 text-emerald-200";
  if (status === "failed") return "border-red-400/40 bg-red-500/10 text-red-200";
  if (status === "timeout") return "border-amber-400/40 bg-amber-500/10 text-amber-200";
  if (status === "skipped") return "border-white/15 bg-white/5 text-white/60";
  return "border-white/10 bg-white/5 text-white/50";
}

function statusDotClasses(status: PipelineStage["status"]): string {
  if (status === "running") return "bg-cyan-300 animate-pulse";
  if (status === "success") return "bg-emerald-300";
  if (status === "failed") return "bg-red-300";
  if (status === "timeout") return "bg-amber-300";
  if (status === "skipped") return "bg-white/30";
  return "bg-white/15";
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function kindPillClasses(kind: ReasoningNode["kind"]) {
  if (kind === "hypothesis") return "border-cyan-400/25 bg-cyan-500/10 text-cyan-100";
  if (kind === "validation") return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
  if (kind === "synthesis") return "border-fuchsia-400/25 bg-fuchsia-500/10 text-fuchsia-100";
  if (kind === "conclusion") return "border-amber-400/25 bg-amber-500/10 text-amber-100";
  return "border-white/10 bg-white/5 text-white/80";
}

function orderAgentsForLanes(agents: NexusAgent[]) {
  const agg = agents.filter((a) => a.agent === "final_aggregator" || a.agent === "apex_aggregator");
  const rest = agents.filter((a) => !(a.agent === "final_aggregator" || a.agent === "apex_aggregator"));
  rest.sort((a, b) => (a.startedAt ?? Number.MAX_SAFE_INTEGER) - (b.startedAt ?? Number.MAX_SAFE_INTEGER));
  return [...rest, ...agg];
}

const DeepThinkingLanes = React.memo(function DeepThinkingLanes({
  agents,
  reasoningByAgent,
}: {
  agents: NexusAgent[];
  reasoningByAgent: Record<string, AgentReasoningPath>;
}) {
  const [isLanesCollapsed, setIsLanesCollapsed] = useState(false);
  const laneAgents = useMemo(() => orderAgentsForLanes(agents), [agents]);
  const hasAnyNodes = useMemo(
    () => laneAgents.some((a) => (reasoningByAgent[a.agent]?.nodes?.length ?? 0) > 0),
    [laneAgents, reasoningByAgent]
  );

  if (!hasAnyNodes) return null;

  return (
    <details
      className="rounded-2xl border border-white/10 bg-black/45 backdrop-blur-xl overflow-hidden"
      open={!isLanesCollapsed}
      onToggle={(e) => setIsLanesCollapsed(!(e.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer list-none px-3 py-2 text-xs text-white/75 hover:bg-white/5 transition-colors">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-white/90">Thinking Lanes</span>
            <span className="text-white/40">{laneAgents.length}</span>
          </div>
          <span className="text-[10px] text-white/40">{isLanesCollapsed ? "SHOW" : "HIDE"}</span>
        </div>
      </summary>

      <div className="border-t border-white/5 px-3 py-2">
        <div className="space-y-2">
          {laneAgents.map((a) => (
            <LaneRow key={a.agent} agent={a} reasoningByAgent={reasoningByAgent} />
          ))}
        </div>
      </div>
    </details>
  );
});

const LaneRow = React.memo(function LaneRow({
  agent: a,
  reasoningByAgent,
}: {
  agent: NexusAgent;
  reasoningByAgent: Record<string, AgentReasoningPath>;
}) {
  const [isRowCollapsed, setIsRowCollapsed] = useState(false);
  const path = reasoningByAgent[a.agent];
  const nodes = Array.isArray(path?.nodes) ? path.nodes : [];

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2">
      <div
        className="flex items-start justify-between gap-3 cursor-pointer select-none"
        onClick={() => setIsRowCollapsed(!isRowCollapsed)}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className={"h-2 w-2 rounded-full " + (a.status === "running" ? "bg-cyan-400 animate-pulse" : a.status === "completed" ? "bg-emerald-400" : a.status === "failed" ? "bg-red-400" : "bg-white/25")} />
            <div className="truncate text-xs font-medium text-white/90">{a.agentName}</div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] text-white/40">{a.duration || ""}</div>
          <div className="text-[10px] text-white/30">{nodes.length ? `${nodes.length} nodes` : "..."}</div>
        </div>
      </div>

      {!isRowCollapsed && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="mt-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex min-w-max items-center gap-2 pb-1">
            {nodes.length > 0 ? (
              nodes.map((n, idx) => (
                <React.Fragment key={n.id}>
                  <span
                    className={
                      "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] " +
                      kindPillClasses(n.kind)
                    }
                    title={n.kind}
                  >
                    <span className="text-white/70">{n.kind}</span>
                    <span className="text-white/95">{n.label}</span>
                  </span>
                  {idx < nodes.length - 1 && <span className="h-px w-6 bg-gradient-to-r from-white/10 via-white/25 to-white/10" />}
                </React.Fragment>
              ))
            ) : (
              <div className="text-[11px] text-white/35">Waiting for reasoning path...</div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
});

function scoreMean01(s: AgentModelScore | undefined): number {
  if (!s) return 0;
  const vals = Object.values(s.signals || {}).filter((v) => typeof v === "number" && Number.isFinite(v));
  if (vals.length === 0) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return clamp01(mean / 100);
}

const ApexContributionBars = React.memo(function ApexContributionBars({
  agents,
  scoresByAgent,
}: {
  agents: NexusAgent[];
  scoresByAgent: Record<string, AgentModelScore>;
}) {
  const apexAgents = useMemo(() => {
    const baseline = agents.find((a) => a.agent === "mimo_v2");
    const specialists = agents.filter((a) => a.agent.startsWith("apex_") && a.agent !== "apex_aggregator");
    const aggregator = agents.find((a) => a.agent === "apex_aggregator");
    const list: NexusAgent[] = [];
    if (baseline) list.push(baseline);
    list.push(...specialists);
    if (aggregator) list.push(aggregator);
    return list;
  }, [agents]);

  const contributions = useMemo(() => {
    const base: Array<{ agent: NexusAgent; weight: number }> = apexAgents.map((a) => ({
      agent: a,
      weight: scoreMean01(scoresByAgent[a.agent]),
    }));

    let total = base.reduce((acc, x) => acc + x.weight, 0);
    if (total <= 0) {
      const durations = apexAgents
        .map((a) => (typeof a.durationMs === "number" && Number.isFinite(a.durationMs) ? a.durationMs : 0))
        .filter((n) => n > 0);
      const max = durations.length ? Math.max(...durations) : 0;
      const withDuration = base.map((x) => ({
        ...x,
        weight: max > 0 ? clamp01((x.agent.durationMs || 0) / max) : 0,
      }));
      total = withDuration.reduce((acc, x) => acc + x.weight, 0);
      if (total > 0) return withDuration.map((x) => ({ ...x, share: x.weight / total }));
      const equal = apexAgents.length ? 1 / apexAgents.length : 0;
      return base.map((x) => ({ ...x, share: equal }));
    }

    return base.map((x) => ({ ...x, share: x.weight / total }));
  }, [apexAgents, scoresByAgent]);

  if (apexAgents.length === 0) return null;

  return (
    <details className="rounded-2xl border border-white/10 bg-black/45 backdrop-blur-xl">
      <summary className="cursor-pointer list-none px-3 py-2 text-xs text-white/80">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-white/90">Apex Contributions</span>
            <span className="text-white/45">{apexAgents.length}</span>
          </div>
          <span className="text-white/40">Share</span>
        </div>
      </summary>

      <div className="max-h-64 overflow-auto border-t border-white/5">
        {contributions.map((c) => {
          const a = c.agent;
          const pct = Math.round(clamp01(c.share) * 100);
          const barClass = "from-cyan-400 via-fuchsia-300 to-cyan-200";

          return (
            <div key={a.agent} className="border-t border-white/5 px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-xs font-medium text-white/90">{a.agentName}</div>
                  </div>
                </div>
                <div className="shrink-0 text-right text-[11px] font-mono text-white/50">{pct}%</div>
              </div>

              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div className={"h-full rounded-full bg-gradient-to-r transition-all duration-500 " + barClass} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
});

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
      <details className="rounded-2xl border border-white/10 bg-black/45 backdrop-blur-xl">
        <summary className="cursor-pointer list-none px-3 py-2 text-xs text-white/80">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-white/90">Lane Status</span>
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
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {a.status === "running" ? (
                  <div className="h-4 w-4 rounded-full border border-white/15 border-t-cyan-300" style={{ animation: "spin 1s linear infinite" }} />
                ) : a.status === "completed" ? (
                  <span className="text-emerald-300">OK</span>
                ) : a.status === "failed" ? (
                  <span className="text-red-300">ERR</span>
                ) : (
                  <span className="text-white/25">...</span>
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

export function HoloPipeline({ stages, agents }: { stages: PipelineStage[]; agents: NexusAgent[] }) {
  const { t } = useLanguage();
  const {
    primaryPipelineCollapsed,
    primaryPipelineInitialized,
    initPrimaryPipelineCollapsed,
    setPrimaryPipelineCollapsed,
    reasoningPaths,
    modelScores,
    runMode,
    runStartedAt,
    runFinishedAt,
  } = useNexusStore(
    useShallow((s) => ({
      primaryPipelineCollapsed: s.primaryPipelineCollapsed,
      primaryPipelineInitialized: s.primaryPipelineInitialized,
      initPrimaryPipelineCollapsed: s.initPrimaryPipelineCollapsed,
      setPrimaryPipelineCollapsed: s.setPrimaryPipelineCollapsed,
      reasoningPaths: s.reasoningPaths,
      modelScores: s.modelScores,
      runMode: s.runMode,
      runStartedAt: s.runStartedAt,
      runFinishedAt: s.runFinishedAt,
    }))
  );

  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (primaryPipelineInitialized) return;
    initPrimaryPipelineCollapsed(true);
  }, [primaryPipelineInitialized, initPrimaryPipelineCollapsed]);

  useEffect(() => {
    if (primaryPipelineCollapsed) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setPrimaryPipelineCollapsed(true);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [primaryPipelineCollapsed, setPrimaryPipelineCollapsed]);

  const runElapsedMs = useMemo(() => {
    if (typeof runStartedAt === "number" && Number.isFinite(runStartedAt) && runStartedAt > 0) {
      if (typeof runFinishedAt === "number" && Number.isFinite(runFinishedAt) && runFinishedAt >= runStartedAt) {
        return runFinishedAt - runStartedAt;
      }
      return Date.now() - runStartedAt;
    }
    return null;
  }, [runStartedAt, runFinishedAt]);

  const runElapsedLabel = useMemo(() => formatLatency(runElapsedMs), [runElapsedMs]);

  const activeStage = useMemo(() => stages.find((s) => s.status === "running"), [stages]);
  const hasStages = stages.length > 0;
  const currentStatus = useMemo(() => {
    if (activeStage) return "running";
    if (stages.some((s) => s.status === "failed" || s.status === "timeout")) return "failed";
    if (stages.some((s) => s.status === "success")) return "success";
    return "idle";
  }, [stages, activeStage]);

  const modeLabel = String(runMode || "").toUpperCase();
  const isDeepThinking = modeLabel === "DEEP_THINKING";
  const isApex = modeLabel === "APEX";

  return (
    <>
      <motion.button
        ref={buttonRef}
        onClick={() => setPrimaryPipelineCollapsed(!primaryPipelineCollapsed)}
        className={
          "fixed bottom-6 right-5 z-[120] flex items-center gap-3 rounded-full lg-surface lg-depth-1 lg-shine glass-noise px-4 py-2 text-xs text-white/85 shadow-[0_15px_40px_rgba(0,0,0,0.45)] transition-colors " +
          (primaryPipelineCollapsed ? "hover:bg-white/[0.06]" : "bg-white/[0.08]")
        }
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 480, damping: 32, mass: 0.6 }}
        aria-label="Processing Details"
        aria-expanded={!primaryPipelineCollapsed}
        aria-controls="nexus-processing-details"
      >
        <span className={"h-2 w-2 rounded-full " + (currentStatus === "running" ? "bg-cyan-300 animate-pulse" : currentStatus === "failed" ? "bg-red-300" : currentStatus === "success" ? "bg-emerald-300" : "bg-white/20")} />
        <div className="flex flex-col text-left">
          <span className="text-[10px] uppercase tracking-[0.28em] text-white/65">{t("pipeline.title")}</span>
          <span className="text-[11px] text-white/90">
            {modeLabel || "RUN"}{runElapsedLabel ? ` • ${runElapsedLabel}` : ""}
          </span>
        </div>
      </motion.button>

      <AnimatePresence>
        {!primaryPipelineCollapsed && (
          <motion.div
            ref={panelRef}
            id="nexus-processing-details"
            role="dialog"
            aria-label="Processing Details"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 520, damping: 40, mass: 0.7 }}
            className="fixed bottom-20 right-4 z-[110] w-[92vw] max-w-[460px] max-h-[70vh] rounded-3xl lg-surface lg-surface-strong lg-depth-2 glass-noise lg-shine overflow-hidden"
          >
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.28em] text-white/60">{t("pipeline.title")}</div>
                <div className="mt-1 text-sm font-semibold text-white/90">{modeLabel || "NEXUS RUN"}</div>
              </div>
              <div className="flex items-center gap-3">
                {runElapsedLabel && (
                  <div className="text-[11px] font-mono text-white/60">{runElapsedLabel}</div>
                )}
                <div className={"h-2 w-2 rounded-full " + statusDotClasses(activeStage?.status || "idle")} />
                <button
                  onClick={() => setPrimaryPipelineCollapsed(true)}
                  className="rounded-lg p-2 text-white/45 hover:text-white/85 hover:bg-white/5 transition-colors"
                  aria-label="Close processing details"
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 5L5 15M5 5l10 10" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.35)_transparent]">
              <div className="space-y-3">
                {!hasStages && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/60">
                    Pipeline idle. Run a request to see live stages.
                  </div>
                )}
                {stages.map((stage) => (
                  <div
                    key={stage.id}
                    className={
                      "rounded-2xl border px-3 py-3 transition-all " +
                      (stage.status === "running"
                        ? "border-cyan-400/40 bg-cyan-500/10 shadow-[0_0_28px_rgba(34,211,238,0.22)]"
                        : stage.status === "success"
                          ? "border-emerald-400/40 bg-emerald-500/10"
                          : stage.status === "failed"
                            ? "border-red-400/40 bg-red-500/10"
                            : stage.status === "timeout"
                              ? "border-amber-400/40 bg-amber-500/10"
                              : "border-white/10 bg-white/5")
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={"h-2 w-2 rounded-full " + statusDotClasses(stage.status)} />
                          <div className="text-xs font-semibold text-white/90">{stage.name}</div>
                        </div>
                        {stage.detail && (
                          <div className="mt-1 text-[11px] text-white/55">{stage.detail}</div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={"inline-flex rounded-full border px-2 py-0.5 text-[9px] font-semibold " + stageStatusClasses(stage.status)}>
                          {stageStatusLabel(stage.status)}
                        </div>
                        <div className="mt-1 text-[10px] font-mono text-white/45">{formatLatency(stage.latencyMs)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {(isDeepThinking || isApex) && (
                <div className="space-y-3">
                  <DeepThinkingLanes agents={agents} reasoningByAgent={reasoningPaths} />
                  {isApex && <ApexContributionBars agents={agents} scoresByAgent={modelScores} />}
                </div>
              )}

              <SwarmDetails agents={agents} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
