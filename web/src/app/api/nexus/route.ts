import OpenAI from "openai";
import { NextRequest } from "next/server";
import {
  resolveModelId,
  getModelsForMode,
  normalizeRegistryMode,
  sanitizeModelNameForUI,
  type NexusMode as RegistryNexusMode,
} from "@/lib/modelRegistry";
import { getAgentIdForModel, getAggregatorAgentId, getFallbackAgentId } from "@/lib/agentRegistry";

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
});

const deepseek = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY || "",
});

type NexusMode = RegistryNexusMode;

type StageStatus = "idle" | "running" | "success" | "failed" | "skipped" | "timeout";

type PipelineStage = {
  id: string;
  name: string;
  status: StageStatus;
  startedAt: number | null;
  finishedAt: number | null;
  latencyMs: number | null;
  detail?: string;
};

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  reasoning_content?: string;
};

const FLASH_FIRST_TOKEN_TIMEOUT_MS = 1200;
const FLASH_MAX_STREAM_MS = 2000;
const FLASH_MAX_TOKENS = 320;
const THINKING_MAX_TOKENS = 2200;
const APEX_MAX_TOKENS = 3200;
const AGGREGATOR_MAX_TOKENS = 4200;

const FLASH_SYSTEM_PROMPT =
  "You are NEXUS Flash. Respond fast, direct, and correct. End with a section titled \"Core Synthesis Assembling\" containing exactly 2 bullet lines.";

const DEEP_SYSTEM_PROMPT =
  "You are NEXUS Deep Thinking. Provide structured reasoning and a clear answer. End with a section titled \"Core Synthesis Assembling\" containing exactly 2 bullet lines. Add a short [REASONING_PATH] list of 3 steps at the end.";

const APEX_SYSTEM_PROMPT =
  "You are NEXUS Apex. Deliver production-grade answers with structure. End with a section titled \"Core Synthesis Assembling\" containing exactly 2 bullet lines. Add a short [REASONING_PATH] list of 3 steps at the end.";

const CORE_SYNTHESIS_TITLE = "Core Synthesis Assembling";

const flashPool = {
  warmed: false,
  inflight: null as Promise<boolean> | null,
};

function normalizeMode(rawMode: string | null | undefined): NexusMode {
  return normalizeRegistryMode(rawMode);
}

function redactSecrets(input: string): string {
  return String(input || "")
    .replace(/\b(sk-[a-zA-Z0-9_\-]{10,})\b/g, "[REDACTED]")
    .replace(/\b(csk-[a-zA-Z0-9_\-]{10,})\b/g, "[REDACTED]")
    .replace(/\b(bb_[a-zA-Z0-9_\-]{10,})\b/g, "[REDACTED]")
    .replace(/Bearer\s+[a-zA-Z0-9_-]{20,}/gi, "Bearer [REDACTED]")
    .replace(/DEEPSEEK_API_KEY\s*=\s*[^\n]+/gi, "DEEPSEEK_API_KEY=[REDACTED]")
    .replace(/OPENROUTER_API_KEY\s*=\s*[^\n]+/gi, "OPENROUTER_API_KEY=[REDACTED]");
}

function detectLanguage(text: string): "ar" | "en" {
  if (!text || text.trim().length === 0) return "en";
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  let arabicCount = 0;
  let totalChars = 0;
  for (const char of text) {
    if (/\S/.test(char)) {
      totalChars += 1;
      if (arabicRegex.test(char)) arabicCount += 1;
    }
  }
  if (totalChars > 0 && arabicCount / totalChars > 0.3) return "ar";
  return "en";
}

function getLanguageInstruction(lang: "ar" | "en"): string {
  return lang === "ar"
    ? "Respond only in Arabic."
    : "Respond only in English.";
}

function parseReasoningPath(content: string): Array<{ id: string; label: string; kind: "step" }> {
  const match = content.match(/\[REASONING_PATH\]([\s\S]*?)\[\/REASONING_PATH\]/);
  if (!match) return [];
  const lines = match[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && /^[\d\-*]/.test(l))
    .map((l) => l.replace(/^[\d\-*]\s*/, ""))
    .slice(0, 3);
  return lines.map((label, idx) => ({ id: String(idx + 1), label, kind: "step" as const }));
}

function computeModelScore(content: string): { coverage: number; consistency: number; novelty: number } {
  const normalized = String(content || "").replace(/\s+/g, " ").trim();
  const length = normalized.length;
  const words = normalized.toLowerCase().match(/[a-z0-9]+/g) || [];
  const uniqueCount = new Set(words).size;
  const uniqueRatio = words.length > 0 ? uniqueCount / words.length : 0;
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
  return {
    coverage: clamp01(length / 2500),
    consistency: clamp01(0.35 + clamp01(length / 3500) * 0.65),
    novelty: clamp01(uniqueRatio),
  };
}

function parseCoreSynthesisLines(blockBody: string): string[] {
  return String(blockBody || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => l.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, ""))
    .slice(0, 2);
}

function deriveCoreSynthesisLinesFromAnswer(answer: string): string[] {
  const withoutCode = String(answer || "").replace(/```[\s\S]*?```/g, "");
  const linesFromText = withoutCode
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !/^#{1,6}\s+/.test(l))
    .map((l) => l.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, ""))
    .slice(0, 8);
  const sentences = withoutCode
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 10);
  const combined: string[] = [];
  for (const l of linesFromText) {
    if (combined.length >= 2) break;
    combined.push(l);
  }
  for (const s of sentences) {
    if (combined.length >= 2) break;
    if (combined.some((x) => x === s)) continue;
    combined.push(s);
  }
  const normalized = combined.map((l) => (l.length > 160 ? `${l.slice(0, 157)}...` : l)).slice(0, 2);
  while (normalized.length < 2) normalized.push("Summary unavailable.");
  return normalized.slice(0, 2);
}

function finalizeAnswerWithCoreSynthesis(answer: string): { answer: string; summary: string } {
  const raw = String(answer || "");
  const headingRegex = new RegExp(`(^|\\n)##\\s*${CORE_SYNTHESIS_TITLE}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|\\n#\\s|$)`, "gi");
  const matches = Array.from(raw.matchAll(headingRegex));
  const lastMatch = matches.length > 0 ? matches[matches.length - 1] : null;
  const existingBody = lastMatch?.[2] || "";
  const existingLines = parseCoreSynthesisLines(existingBody);
  const lines = (existingLines.length > 0 ? existingLines : deriveCoreSynthesisLinesFromAnswer(raw)).slice(0, 2);
  const cleaned = raw.replace(headingRegex, "").trimEnd();
  const block = `\n\n## ${CORE_SYNTHESIS_TITLE}\n${lines.map((l) => `- ${l}`).join("\n")}`;
  return { answer: `${cleaned}${block}`, summary: lines.join("\n") };
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function isTimeoutError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  return msg.toLowerCase().includes("timeout");
}

function getStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const anyErr = error as { status?: number; response?: { status?: number } };
  if (typeof anyErr.status === "number") return anyErr.status;
  if (anyErr.response && typeof anyErr.response.status === "number") return anyErr.response.status;
  return null;
}

function formatError(error: unknown, context: string): string {
  const status = getStatusCode(error);
  const raw = error instanceof Error ? error.message : String(error || "Unknown error");
  const message = redactSecrets(raw);
  if (status) return `${context} failed (HTTP ${status}): ${message}`;
  return `${context} failed: ${message}`;
}

function buildStages(hasImages: boolean): PipelineStage[] {
  const base: PipelineStage[] = [
    { id: "boot", name: "Request Intake", status: "idle", startedAt: null, finishedAt: null, latencyMs: null },
    { id: "prewarm", name: "Warm Token Cache", status: "idle", startedAt: null, finishedAt: null, latencyMs: null },
    { id: "prompt", name: "Prompt Assembly", status: "idle", startedAt: null, finishedAt: null, latencyMs: null },
  ];
  if (hasImages) {
    base.push({ id: "vision", name: "Image Decode", status: "idle", startedAt: null, finishedAt: null, latencyMs: null });
  }
  base.push(
    { id: "primary", name: "Primary Execution", status: "idle", startedAt: null, finishedAt: null, latencyMs: null },
    { id: "fallback", name: "Fallback Execution", status: "idle", startedAt: null, finishedAt: null, latencyMs: null },
    { id: "aggregate", name: "Aggregation", status: "idle", startedAt: null, finishedAt: null, latencyMs: null },
    { id: "response", name: "Response Stream", status: "idle", startedAt: null, finishedAt: null, latencyMs: null },
    { id: "finalize", name: "Finalize Output", status: "idle", startedAt: null, finishedAt: null, latencyMs: null }
  );
  return base;
}

class PipelineTracker {
  private stages: Map<string, PipelineStage>;
  private emit: (event: string, data: Record<string, unknown>) => void;

  constructor(stages: PipelineStage[], emit: (event: string, data: Record<string, unknown>) => void) {
    this.stages = new Map(stages.map((s) => [s.id, s]));
    this.emit = emit;
  }

  init(): void {
    this.emit("pipeline_init", { stages: Array.from(this.stages.values()) });
  }

  start(id: string, detail?: string): void {
    const stage = this.stages.get(id);
    if (!stage) return;
    if (stage.status === "running") return;
    stage.status = "running";
    stage.startedAt = stage.startedAt ?? Date.now();
    stage.detail = detail;
    this.emit("pipeline_stage", { stage });
  }

  finish(id: string, status: StageStatus, detail?: string): void {
    const stage = this.stages.get(id);
    if (!stage) return;
    if (stage.status === "success" || stage.status === "failed" || stage.status === "skipped" || stage.status === "timeout") return;
    const end = Date.now();
    stage.status = status;
    stage.finishedAt = end;
    stage.latencyMs = stage.startedAt ? end - stage.startedAt : null;
    stage.detail = detail;
    this.emit("pipeline_stage", { stage });
  }

  skip(id: string, detail?: string): void {
    const stage = this.stages.get(id);
    if (!stage) return;
    if (stage.status !== "idle") return;
    stage.status = "skipped";
    stage.startedAt = stage.startedAt ?? Date.now();
    stage.finishedAt = stage.startedAt;
    stage.latencyMs = 0;
    stage.detail = detail;
    this.emit("pipeline_stage", { stage });
  }

  snapshot(): PipelineStage[] {
    return Array.from(this.stages.values());
  }
}

async function preWarmFlashPool(): Promise<boolean> {
  if (flashPool.warmed) return true;
  if (flashPool.inflight) return flashPool.inflight;
  const flashModel = resolveModelId("NEXUS_FLASH_PRO");
  const warmPromise = openrouter.chat.completions
    .create({
      model: flashModel,
      messages: [{ role: "user", content: "ping" }],
      stream: false,
      max_tokens: 8,
    })
    .then(() => {
      flashPool.warmed = true;
      return true;
    })
    .catch(() => false)
    .finally(() => {
      flashPool.inflight = null;
    });
  flashPool.inflight = warmPromise;
  return warmPromise;
}

function sanitizeAgentLabel(agentId: string, mode: NexusMode): string {
  if (agentId === "NEXUS_AGGREGATOR") return "Aggregator";
  if (agentId === "NEXUS_FALLBACK") return "Fallback";
  if (mode === "FLASH") return "Flash Lane";
  if (mode === "DEEP_THINKING") return "Reasoning Lane";
  if (mode === "APEX") return "Specialist Lane";
  return "NEXUS Lane";
}

function sanitizeModelLabel(mode: NexusMode): string {
  return sanitizeModelNameForUI(mode, mode);
}

async function runVisionStage(
  images: Array<{ data: string; mimeType: string }>,
  sendEvent: (event: string, data: Record<string, unknown>) => void,
  pipeline: PipelineTracker
): Promise<string> {
  pipeline.start("vision", "Decoding images");
  if (!images.length) {
    pipeline.skip("vision", "No images provided");
    return "";
  }

  try {
    const visionMessages: Array<{ role: "system" | "user"; content: string | Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }> }> = [
      {
        role: "system",
        content: "Describe the images in detail. Focus on visible text, diagrams, and technical content.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Describe this image." },
          ...images.map((img) => ({ type: "image_url" as const, image_url: { url: img.data } })),
        ],
      },
    ];

    sendEvent("agent_start", {
      agent: "NEXUS_VISION",
      agentName: "Vision Lane",
      model: "NEXUS_VISION",
      at: Date.now(),
    });

    const visionResponse = await openrouter.chat.completions.create({
      model: "nvidia/nemotron-nano-12b-v2-vl:free",
      messages: visionMessages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      stream: false,
      max_tokens: 500,
    });

    sendEvent("agent_finish", {
      agent: "NEXUS_VISION",
      agentName: "Vision Lane",
      model: "NEXUS_VISION",
      status: "completed",
      at: Date.now(),
    });

    const description = visionResponse.choices[0]?.message?.content || "";
    pipeline.finish("vision", "success", "Image decoded");
    return description;
  } catch (error) {
    sendEvent("agent_finish", {
      agent: "NEXUS_VISION",
      agentName: "Vision Lane",
      model: "NEXUS_VISION",
      status: "failed",
      error: formatError(error, "Vision decode"),
      at: Date.now(),
    });
    pipeline.finish("vision", isTimeoutError(error) ? "timeout" : "failed", formatError(error, "Vision decode"));
    return "";
  }
}

async function streamCompletion(
  response: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
  sendEvent: (event: string, data: Record<string, unknown>) => void,
  pipeline: PipelineTracker,
  options: { firstTokenTimeoutMs: number; maxStreamMs?: number; markStageId?: string }
): Promise<{ content: string; reasoning: string }> {
  pipeline.start("response", "Streaming response");
  let fullContent = "";
  let fullReasoning = "";
  let firstTokenAt: number | null = null;
  let lastChunkAt = Date.now();

  const iterator = response[Symbol.asyncIterator]();
  const first = await withTimeout(iterator.next(), options.firstTokenTimeoutMs, "timeout waiting for first token");

  if (!first.done) {
    const delta = (first.value.choices[0]?.delta ?? {}) as { reasoning_content?: string; content?: string };
    if (delta?.reasoning_content) {
      fullReasoning += delta.reasoning_content;
      sendEvent("thinking", { chunk: delta.reasoning_content, at: Date.now() });
    }
    if (delta?.content) {
      fullContent += delta.content;
      sendEvent("chunk", { content: delta.content, at: Date.now() });
    }
    firstTokenAt = Date.now();
    if (options.markStageId) {
      pipeline.finish(options.markStageId, "success", "First token received");
    }
  }

  while (true) {
    const next = await iterator.next();
    if (next.done) break;
    const delta = (next.value.choices[0]?.delta ?? {}) as { reasoning_content?: string; content?: string };
    if (delta?.reasoning_content) {
      fullReasoning += delta.reasoning_content;
      sendEvent("thinking", { chunk: delta.reasoning_content, at: Date.now() });
    }
    if (delta?.content) {
      fullContent += delta.content;
      sendEvent("chunk", { content: delta.content, at: Date.now() });
    }
    lastChunkAt = Date.now();
    if (next.value.choices[0]?.finish_reason) {
      sendEvent("finish", { reason: next.value.choices[0].finish_reason, at: Date.now() });
    }
  }

  const streamDuration = lastChunkAt - (firstTokenAt ?? lastChunkAt);
  if (typeof options.maxStreamMs === "number" && streamDuration > options.maxStreamMs) {
    pipeline.finish("response", "timeout", `Stream exceeded ${options.maxStreamMs}ms`);
  } else {
    pipeline.finish("response", "success", "Stream completed");
  }

  return { content: fullContent, reasoning: fullReasoning };
}

async function runFlashMode(
  query: string,
  baseMessages: ChatMessage[],
  languageInstruction: string,
  sendEvent: (event: string, data: Record<string, unknown>) => void,
  pipeline: PipelineTracker
): Promise<{ response: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>; modelName: NexusMode }> {
  pipeline.start("primary", "Flash primary call");
  pipeline.skip("aggregate", "Flash mode does not aggregate");
  pipeline.skip("fallback", "Flash mode uses primary model only");

  preWarmFlashPool().then((ok) => {
    if (ok) {
      pipeline.finish("prewarm", "success", "Flash pool warmed");
    } else {
      pipeline.finish("prewarm", "failed", "Flash pool warm failed");
    }
  });

  const providerModel = resolveModelId("NEXUS_FLASH_PRO");
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: `${FLASH_SYSTEM_PROMPT} ${languageInstruction}` },
    ...baseMessages.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: query },
  ];

  const agentId = getAgentIdForModel("NEXUS_FLASH_PRO", "FLASH");
  sendEvent("agent_start", {
    agent: agentId,
    agentName: sanitizeAgentLabel(agentId, "FLASH"),
    model: sanitizeModelLabel("FLASH"),
    at: Date.now(),
  });

  try {
    const response = await openrouter.chat.completions.create({
      model: providerModel,
      messages,
      stream: true,
      max_tokens: FLASH_MAX_TOKENS,
      temperature: 0.6,
    });

    sendEvent("agent_finish", {
      agent: agentId,
      agentName: sanitizeAgentLabel(agentId, "FLASH"),
      model: sanitizeModelLabel("FLASH"),
      status: "completed",
      at: Date.now(),
    });

    return { response, modelName: "FLASH" };
  } catch (error) {
    const errorMessage = formatError(error, "Flash model");
    sendEvent("agent_finish", {
      agent: agentId,
      agentName: sanitizeAgentLabel(agentId, "FLASH"),
      model: sanitizeModelLabel("FLASH"),
      status: "failed",
      error: errorMessage,
      at: Date.now(),
    });
    pipeline.finish("primary", isTimeoutError(error) ? "timeout" : "failed", errorMessage);
    throw new Error(errorMessage);
  }
}

async function runParallelModels(
  mode: NexusMode,
  query: string,
  baseMessages: ChatMessage[],
  languageInstruction: string,
  sendEvent: (event: string, data: Record<string, unknown>) => void,
  pipeline: PipelineTracker
): Promise<Array<{ id: string; agentId: string; agentLabel: string; content: string }>> {
  pipeline.start("primary", "Parallel execution");
  const modelDefs = getModelsForMode(mode);
  const tasks = modelDefs.map((modelDef, index) => {
    const agentId = getAgentIdForModel(modelDef.id, mode, index);
    const agentLabel = sanitizeAgentLabel(agentId, mode);
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `${mode === "APEX" ? APEX_SYSTEM_PROMPT : DEEP_SYSTEM_PROMPT} ${languageInstruction}`,
      },
      ...baseMessages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: query },
    ];

    return (async () => {
      sendEvent("agent_start", {
        agent: agentId,
        agentName: agentLabel,
        model: sanitizeModelLabel(mode),
        at: Date.now(),
      });

      const started = Date.now();
      try {
        const response = await withTimeout(
          openrouter.chat.completions.create({
            model: modelDef.model,
            messages,
            stream: false,
            max_tokens: mode === "APEX" ? APEX_MAX_TOKENS : THINKING_MAX_TOKENS,
            temperature: 0.7,
          }),
          modelDef.timeoutMs,
          "timeout"
        );

        const content = response.choices[0]?.message?.content || "";
        if (!content) throw new Error("Model returned empty content");

        const reasoningPath = parseReasoningPath(content);
        if (reasoningPath.length > 0) {
          sendEvent("reasoning_path", {
            agent: agentId,
            agentName: agentLabel,
            model: sanitizeModelLabel(mode),
            pathId: `${agentId}-path`,
            nodes: reasoningPath,
            at: Date.now(),
          });
        }
        sendEvent("model_score", {
          agent: agentId,
          agentName: agentLabel,
          model: sanitizeModelLabel(mode),
          signals: computeModelScore(content),
          at: Date.now(),
        });

        sendEvent("agent_finish", {
          agent: agentId,
          agentName: agentLabel,
          model: sanitizeModelLabel(mode),
          status: "completed",
          durationMs: Date.now() - started,
          at: Date.now(),
        });

        return { id: modelDef.id, agentId, agentLabel, content };
      } catch (error) {
        const errorMessage = formatError(error, "Model execution");
        sendEvent("agent_finish", {
          agent: agentId,
          agentName: agentLabel,
          model: sanitizeModelLabel(mode),
          status: "failed",
          error: errorMessage,
          durationMs: Date.now() - started,
          at: Date.now(),
        });
        return { id: modelDef.id, agentId, agentLabel, content: "" };
      }
    })();
  });

  const results = await Promise.all(tasks);
  const valid = results.filter((r) => r.content && r.content.length > 0);
  if (valid.length > 0) {
    pipeline.finish("primary", "success", `${valid.length}/${results.length} models succeeded`);
  } else {
    pipeline.finish("primary", "failed", "All primary models failed");
  }
  return valid;
}

async function runAggregator(
  mode: NexusMode,
  query: string,
  responses: Array<{ agentLabel: string; content: string }>,
  languageInstruction: string,
  sendEvent: (event: string, data: Record<string, unknown>) => void,
  pipeline: PipelineTracker,
  deepResearchPlus: boolean,
  webMax: boolean
): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
  pipeline.start("aggregate", "Aggregating responses");

  const aggregatorPrompt = [
    "You are the final aggregator. Synthesize the best possible answer by:",
    "1. Combining the strongest reasoning",
    "2. Removing contradictions",
    "3. Returning a clean, structured response",
    `4. End with a section titled \"${CORE_SYNTHESIS_TITLE}\" containing exactly 2 bullet lines.`,
    "",
    `User Question: ${query}`,
    "",
    "Model Responses:",
    ...responses.map((r, i) => `\n[Agent ${i + 1}: ${r.agentLabel}]\n${r.content}`),
  ].join("\n");

  const useDeepSeek = Boolean(deepResearchPlus || webMax);
  const aggregatorAgentId = getAggregatorAgentId();
  sendEvent("agent_start", {
    agent: aggregatorAgentId,
    agentName: "Aggregator",
    model: sanitizeModelLabel(mode),
    at: Date.now(),
  });

  try {
    const response = useDeepSeek
      ? await deepseek.chat.completions.create({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: `You are the final aggregator. ${languageInstruction}` },
            { role: "user", content: aggregatorPrompt },
          ],
          stream: true,
          max_tokens: AGGREGATOR_MAX_TOKENS,
          temperature: 0.5,
        })
      : await openrouter.chat.completions.create({
          model: resolveModelId("NEXUS_FLASH_PRO"),
          messages: [
            { role: "system", content: `You are the final aggregator. ${languageInstruction}` },
            { role: "user", content: aggregatorPrompt },
          ],
          stream: true,
          max_tokens: AGGREGATOR_MAX_TOKENS,
          temperature: 0.5,
        });

    sendEvent("agent_finish", {
      agent: aggregatorAgentId,
      agentName: "Aggregator",
      model: sanitizeModelLabel(mode),
      status: "completed",
      at: Date.now(),
    });

    pipeline.finish("aggregate", "success", "Aggregation streaming");
    return response;
  } catch (error) {
    const errorMessage = formatError(error, "Aggregator");
    sendEvent("agent_finish", {
      agent: aggregatorAgentId,
      agentName: "Aggregator",
      model: sanitizeModelLabel(mode),
      status: "failed",
      error: errorMessage,
      at: Date.now(),
    });
    pipeline.finish("aggregate", isTimeoutError(error) ? "timeout" : "failed", errorMessage);
    throw error;
  }
}

async function runFallback(
  mode: NexusMode,
  query: string,
  baseMessages: ChatMessage[],
  languageInstruction: string,
  sendEvent: (event: string, data: Record<string, unknown>) => void,
  pipeline: PipelineTracker
): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
  pipeline.start("fallback", "Fallback execution");

  const fallbackAgentId = getFallbackAgentId();
  sendEvent("agent_start", {
    agent: fallbackAgentId,
    agentName: "Fallback",
    model: sanitizeModelLabel(mode),
    at: Date.now(),
  });

  try {
    const response = await openrouter.chat.completions.create({
      model: resolveModelId("NEXUS_FLASH_PRO"),
      messages: [
        { role: "system", content: `${FLASH_SYSTEM_PROMPT} ${languageInstruction}` },
        ...baseMessages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: query },
      ],
      stream: true,
      max_tokens: FLASH_MAX_TOKENS,
      temperature: 0.6,
    });

    sendEvent("agent_finish", {
      agent: fallbackAgentId,
      agentName: "Fallback",
      model: sanitizeModelLabel(mode),
      status: "completed",
      at: Date.now(),
    });

    pipeline.finish("fallback", "success", "Fallback streaming");
    return response;
  } catch (error) {
    const errorMessage = formatError(error, "Fallback model");
    sendEvent("agent_finish", {
      agent: fallbackAgentId,
      agentName: "Fallback",
      model: sanitizeModelLabel(mode),
      status: "failed",
      error: errorMessage,
      at: Date.now(),
    });
    pipeline.finish("fallback", isTimeoutError(error) ? "timeout" : "failed", errorMessage);
    throw new Error(errorMessage);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      query,
      mode: rawMode,
      history = [],
      images = [],
      deepResearchPlus = false,
      webMax = false,
    } = body;

    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "Missing or invalid 'query' field" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    if ((deepResearchPlus || webMax) && !process.env.DEEPSEEK_API_KEY) {
      return new Response(JSON.stringify({ error: "DEEPSEEK_API_KEY not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const mode = normalizeMode(rawMode);
    const hasImages = Array.isArray(images) && images.length > 0;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const runId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

        const sendEvent = (event: string, data: Record<string, unknown>) => {
          const at = typeof data.at === "number" ? (data.at as number) : Date.now();
          const payload = { ...data, runId, mode, at };
          const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        const pipeline = new PipelineTracker(buildStages(hasImages), sendEvent);
        pipeline.init();

        sendEvent("run_start", {
          queryLength: query.length,
          hasImages,
          mode,
          at: Date.now(),
        });

        pipeline.start("boot", "Request accepted");
        pipeline.finish("boot", "success", "Intake complete");
        if (mode === "FLASH") {
          pipeline.start("prewarm", "Warm cache");
        } else {
          pipeline.skip("prewarm", "Prewarm not required");
        }

        const userLanguage = detectLanguage(query);
        const languageInstruction = getLanguageInstruction(userLanguage);

        pipeline.start("prompt", "Building messages");
        const trimmedHistory = Array.isArray(history)
          ? history.slice(-6).map((h: { role: string; content: string }) => ({
              role: h.role as ChatMessage["role"],
              content: String(h.content || ""),
            }))
          : [];
        pipeline.finish("prompt", "success", "Prompt ready");

        let textQuery = query;
        if (hasImages) {
          const description = await runVisionStage(images, sendEvent, pipeline);
          if (description) {
            textQuery = `${query}\n\n[Image Description]\n${description}`;
          }
        }

        try {
          let response: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk> | null = null;
          let modelName: NexusMode = mode;

          if (mode === "FLASH") {
            const flash = await runFlashMode(textQuery, trimmedHistory, languageInstruction, sendEvent, pipeline);
            response = flash.response;
            modelName = flash.modelName;
          } else {
            const results = await runParallelModels(mode, textQuery, trimmedHistory, languageInstruction, sendEvent, pipeline);
            if (results.length === 0) {
              sendEvent("log", { message: "All primary models failed. Using fallback.", at: Date.now() });
              response = await runFallback(mode, textQuery, trimmedHistory, languageInstruction, sendEvent, pipeline);
              pipeline.skip("aggregate", "No aggregation due to fallback");
            } else {
              try {
                response = await runAggregator(
                  mode,
                  textQuery,
                  results.map((r) => ({ agentLabel: r.agentLabel, content: r.content })),
                  languageInstruction,
                  sendEvent,
                  pipeline,
                  deepResearchPlus,
                  webMax
                );
              } catch {
                sendEvent("log", { message: "Aggregator failed. Using fallback.", at: Date.now() });
                response = await runFallback(mode, textQuery, trimmedHistory, languageInstruction, sendEvent, pipeline);
              }
            }
          }

          if (!response) {
            const finalError = "No response stream produced after pipeline execution.";
            pipeline.finish("finalize", "failed", finalError);
            sendEvent("error", { message: finalError, at: Date.now() });
            sendEvent("run_finish", { status: "error", message: finalError, pipeline: pipeline.snapshot(), at: Date.now() });
            controller.close();
            return;
          }

          const streamOptions =
            mode === "FLASH"
              ? { firstTokenTimeoutMs: FLASH_FIRST_TOKEN_TIMEOUT_MS, maxStreamMs: FLASH_MAX_STREAM_MS, markStageId: "primary" }
              : { firstTokenTimeoutMs: 4000 };
          const streamed = await streamCompletion(response, sendEvent, pipeline, streamOptions);
          pipeline.start("finalize", "Finalizing answer");
          const core = finalizeAnswerWithCoreSynthesis(streamed.content);
          pipeline.finish("finalize", "success", "Answer finalized");

          sendEvent("done", {
            answer: core.answer,
            reasoning: streamed.reasoning || undefined,
            modelName: sanitizeModelNameForUI(modelName, mode),
            finalAnswerSummary: core.summary,
            pipeline: pipeline.snapshot(),
            at: Date.now(),
          });
          sendEvent("run_finish", { status: "ok", pipeline: pipeline.snapshot(), at: Date.now() });
          controller.close();
        } catch (error) {
          const errorMessage = redactSecrets(error instanceof Error ? error.message : "Unknown error");
          pipeline.finish("finalize", isTimeoutError(error) ? "timeout" : "failed", errorMessage);
          sendEvent("error", { message: errorMessage, pipeline: pipeline.snapshot(), at: Date.now() });
          sendEvent("run_finish", { status: "error", message: errorMessage, pipeline: pipeline.snapshot(), at: Date.now() });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: redactSecrets(error instanceof Error ? error.message : "Internal server error") }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
