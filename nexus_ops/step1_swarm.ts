/**
 * NEXUS PRO V4 - Step 1: Swarm
 * Multi-agent orchestration layer with strict TypeScript
 */

import { createRequire } from "module";
import { pathToFileURL } from "url";
import { sleep, randInt } from "./ops_utils";
import {
  EmitFunction,
  AgentMeta,
  AgentExecution,
  SwarmResult,
  SwarmOptions,
  ErrorDetail,
  ERROR_TYPES,
  ErrorType,
  OpenAIConstructor,
} from "./types";

// ============================================================================
// CONFIGURATION
// ============================================================================
const CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1";
const BLACKBOX_BASE_URL = "https://api.blackbox.ai";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const BLACKBOX_CONCURRENCY = 1;
const CEREBRAS_CONCURRENCY = 3;

// ============================================================================
// MODEL DEFINITIONS
// ============================================================================
const STANDARD_MODELS: AgentMeta[] = [
  { provider: "cerebras", agent: "cerebras_llama_70b", agentName: "Llama 3.3 70B", model: "llama-3.3-70b" },
  { provider: "cerebras", agent: "cerebras_llama_8b", agentName: "Llama 3.1 8B", model: "llama3.1-8b" },
  { provider: "cerebras", agent: "cerebras_qwen_32b", agentName: "Qwen 3 32B", model: "qwen-3-32b" },
];

const DEEP_SCAN_MODELS: AgentMeta[] = [
  { provider: "cerebras", agent: "cerebras_llama_70b_deep", agentName: "Llama 3.3 70B (Deep)", model: "llama-3.3-70b" },
  { provider: "cerebras", agent: "cerebras_llama_8b_deep", agentName: "Llama 3.1 8B (Deep)", model: "llama3.1-8b" },
  { provider: "cerebras", agent: "cerebras_qwen_32b_deep", agentName: "Qwen 3 32B (Deep)", model: "qwen-3-32b" },
];

const CODER_MODELS_CEREBRAS: AgentMeta[] = [
  { provider: "cerebras", agent: "cerebras_llama_70b_coder", agentName: "Llama 3.3 70B (Coder)", model: "llama-3.3-70b" },
  { provider: "cerebras", agent: "cerebras_llama_8b_coder", agentName: "Llama 3.1 8B (Coder)", model: "llama3.1-8b" },
  { provider: "cerebras", agent: "cerebras_qwen_32b_coder", agentName: "Qwen 3 32B (Coder)", model: "qwen-3-32b" },
];

const CODER_MODELS_BLACKBOX: AgentMeta[] = [];

const FALLBACK_MODELS: { blackbox: AgentMeta[]; cerebras: AgentMeta[] } = {
  blackbox: [],
  cerebras: [
    { provider: "cerebras", agent: "cerebras_fallback_llama70b", agentName: "Llama 3.3 70B (Fallback)", model: "llama-3.3-70b" },
    { provider: "cerebras", agent: "cerebras_fallback_llama8b", agentName: "Llama 3.1 8B (Fallback)", model: "llama3.1-8b" },
  ],
};

const CEREBRAS_MODELS = STANDARD_MODELS;
const BLACKBOX_MODELS = DEEP_SCAN_MODELS;

// ============================================================================
// MODEL STATUS CACHE
// ============================================================================
interface CacheEntry {
  status: "available" | "not_found" | "rate_limited" | "error";
  checkedAt: number;
  errorType?: ErrorType;
}

const modelStatusCache = new Map<string, CacheEntry>();

function getCachedModelStatus(model: string): CacheEntry | null {
  const entry = modelStatusCache.get(model);
  if (!entry) return null;
  if (Date.now() - entry.checkedAt > CACHE_TTL_MS) {
    modelStatusCache.delete(model);
    return null;
  }
  return entry;
}

function setCachedModelStatus(model: string, status: CacheEntry["status"], errorType?: ErrorType): void {
  modelStatusCache.set(model, { status, checkedAt: Date.now(), errorType });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
async function loadOpenAI(): Promise<OpenAIConstructor> {
  const req = createRequire(__filename);
  const openaiPath = req.resolve("openai", { paths: [process.cwd()] });
  const mod = await import(pathToFileURL(openaiPath).href);
  return mod?.default ?? mod?.OpenAI ?? mod;
}

function redactApiKey(text: string): string {
  if (!text) return text;
  let out = String(text);
  out = out.replace(/\b(bb_[a-zA-Z0-9_-]{10,})\b/g, "[REDACTED_BB_KEY]");
  out = out.replace(/\b(sk-[a-zA-Z0-9_-]{10,})\b/g, "[REDACTED_SK_KEY]");
  out = out.replace(/\b(csk-[a-zA-Z0-9_-]{10,})\b/g, "[REDACTED_CSK_KEY]");
  out = out.replace(/Bearer\s+[a-zA-Z0-9_-]{20,}/gi, "Bearer [REDACTED]");
  out = out.replace(/apiKey["']?\s*[:=]\s*["']?[a-zA-Z0-9_-]{20,}["']?/gi, "apiKey=[REDACTED]");
  out = out.replace(/BLACKBOX_API_KEY\s*=\s*[^\n]+/gi, "BLACKBOX_API_KEY=[REDACTED]");
  out = out.replace(/CEREBRAS_API_KEY\s*=\s*[^\n]+/gi, "CEREBRAS_API_KEY=[REDACTED]");
  return out;
}

function formatDurationMs(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  return `${s.toFixed(1)}s`;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    const slice = raw.slice(start, end + 1);
    try {
      return JSON.parse(slice) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function getStatusCode(err: unknown): number | null {
  if (!err || (typeof err !== "object" && typeof err !== "function")) return null;
  const anyErr = err as Record<string, unknown>;
  if (typeof anyErr.status === "number") return anyErr.status;
  if (typeof anyErr.statusCode === "number") return anyErr.statusCode;
  if (anyErr.response && typeof (anyErr.response as Record<string, unknown>).status === "number") {
    return (anyErr.response as Record<string, unknown>).status as number;
  }
  if (typeof anyErr.code === "string") {
    if (anyErr.code === "ECONNREFUSED" || anyErr.code === "ETIMEDOUT" || anyErr.code === "ENOTFOUND") {
      return -1;
    }
  }
  return null;
}

function getRetryAfterMs(err: unknown): number | null {
  if (!err || (typeof err !== "object" && typeof err !== "function")) return null;
  const anyErr = err as Record<string, unknown>;
  const headers = anyErr.headers as Record<string, unknown> | undefined;
  const responseHeaders = (anyErr.response as Record<string, unknown> | undefined)?.headers as Record<string, unknown> | undefined;
  
  let raw: string | undefined;
  if (headers && typeof (headers as { get?: (k: string) => string }).get === "function") {
    raw = (headers as { get: (k: string) => string }).get("retry-after");
  } else if (responseHeaders && typeof (responseHeaders as { get?: (k: string) => string }).get === "function") {
    raw = (responseHeaders as { get: (k: string) => string }).get("retry-after");
  } else if (headers && typeof headers["retry-after"] === "string") {
    raw = headers["retry-after"];
  } else if (responseHeaders && typeof responseHeaders["retry-after"] === "string") {
    raw = responseHeaders["retry-after"];
  }

  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const seconds = Number(text);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(60_000, seconds * 1000);
  return null;
}

function getRequestId(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const anyErr = err as Record<string, unknown>;
  const headers = anyErr.headers as Record<string, unknown> | undefined;
  const responseHeaders = (anyErr.response as Record<string, unknown> | undefined)?.headers as Record<string, unknown> | undefined;

  if (headers && typeof (headers as { get?: (k: string) => string }).get === "function") {
    const id = (headers as { get: (k: string) => string }).get("x-request-id");
    if (id) return id;
  }
  if (responseHeaders && typeof (responseHeaders as { get?: (k: string) => string }).get === "function") {
    const id = (responseHeaders as { get: (k: string) => string }).get("x-request-id");
    if (id) return id;
  }
  if (headers && typeof headers["x-request-id"] === "string") return headers["x-request-id"];
  if (responseHeaders && typeof responseHeaders["x-request-id"] === "string") return responseHeaders["x-request-id"];
  if (typeof anyErr.requestId === "string") return anyErr.requestId;
  return null;
}

// ============================================================================
// ERROR CLASSIFICATION
// ============================================================================
function classifyError(err: unknown): ErrorType {
  const status = getStatusCode(err);
  const msg = String(err instanceof Error ? err.message : err || "").toLowerCase();

  if (status === -1 || msg.includes("econnrefused") || msg.includes("etimedout") || msg.includes("enotfound") || msg.includes("fetch failed")) {
    return ERROR_TYPES.NETWORK_ERROR;
  }

  if (status === 404) {
    return ERROR_TYPES.MODEL_NOT_FOUND;
  }
  if (status === 429) return ERROR_TYPES.RATE_LIMITED;
  if (status === 401 || status === 403) return ERROR_TYPES.UNAUTHORIZED;
  if (status === 400) {
    if (msg.includes("response_format") || msg.includes("json_object") || msg.includes("json mode") || msg.includes("unsupported")) {
      return ERROR_TYPES.UNSUPPORTED_FEATURE;
    }
    return ERROR_TYPES.BAD_REQUEST;
  }
  if (typeof status === "number" && status >= 500) return ERROR_TYPES.SERVER_ERROR;

  if (msg.includes("timeout") || msg.includes("timed out")) return ERROR_TYPES.TIMEOUT;
  if (msg.includes("invalid json") || msg.includes("json parse")) return ERROR_TYPES.JSON_INVALID;
  if (msg.includes("response_format") || msg.includes("json_object")) return ERROR_TYPES.UNSUPPORTED_FEATURE;

  return ERROR_TYPES.UNKNOWN;
}

function isRetryable(errorType: ErrorType, status: number | null): boolean {
  if (errorType === ERROR_TYPES.RATE_LIMITED) return true;
  if (errorType === ERROR_TYPES.SERVER_ERROR) return true;
  if (errorType === ERROR_TYPES.NETWORK_ERROR) return true;
  if (errorType === ERROR_TYPES.TIMEOUT) return true;
  if (status === null || status === undefined) return true;
  return false;
}

function buildDetailedError(
  err: unknown,
  provider: string,
  model: string,
  baseURL: string,
  retryCount = 0,
  retryDelayMs = 0
): ErrorDetail {
  const status = getStatusCode(err);
  const errorType = classifyError(err);
  const requestId = getRequestId(err);
  const rawMessage = err instanceof Error ? err.message : String(err || "Unknown error");
  const message = redactApiKey(rawMessage);

  return {
    provider,
    model,
    httpStatus: status,
    errorType,
    message,
    retryCount,
    retryDelayMs,
    requestId,
    baseURL,
    endpoint: "/chat/completions",
  };
}

function formatErrorForLog(detail: ErrorDetail): string {
  const parts = [`[${detail.provider}/${detail.model}]`];
  if (detail.httpStatus !== null && detail.httpStatus !== undefined) {
    parts.push(`HTTP ${detail.httpStatus}`);
  }
  parts.push(`${detail.errorType}`);
  parts.push(`- "${detail.message}"`);
  if (detail.retryCount > 0) {
    parts.push(`(${detail.retryCount} retries, delay ${(detail.retryDelayMs / 1000).toFixed(1)}s)`);
  }
  if (detail.requestId) {
    parts.push(`[reqId: ${detail.requestId}]`);
  }
  return parts.join(" ");
}

// ============================================================================
// RETRY WITH BACKOFF
// ============================================================================
interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  emit?: EmitFunction;
  agentLabel?: string;
  provider?: string;
  model?: string;
  baseURL?: string;
}

interface RetryResult<T> {
  result: T;
  retryCount: number;
  totalRetryDelayMs: number;
}

interface RetryError {
  error: unknown;
  retryCount: number;
  totalRetryDelayMs: number;
}

async function withRetries<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<RetryResult<T>> {
  const attempts = Math.max(1, Number(options.maxAttempts || 1));
  const base = Math.max(50, Number(options.baseDelayMs || 350));
  const emit = options.emit;
  let totalRetryDelayMs = 0;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return { result: await fn(attempt), retryCount: attempt - 1, totalRetryDelayMs };
    } catch (err) {
      const errorType = classifyError(err);
      const status = getStatusCode(err);
      const retryable = isRetryable(errorType, status);
      const shouldRetry = retryable && attempt < attempts;

      if (!shouldRetry) {
        throw { error: err, retryCount: attempt - 1, totalRetryDelayMs } as RetryError;
      }

      const retryAfterMs = getRetryAfterMs(err);
      const delayMs = retryAfterMs ?? Math.min(20_000, base * 2 ** (attempt - 1) + randInt(0, 380));
      totalRetryDelayMs += delayMs;

      emit?.({
        type: "log",
        step: 1,
        at: Date.now(),
        message: `${options.agentLabel} retrying after ${Math.round(delayMs)}ms (attempt ${attempt + 1}/${attempts}, reason: ${errorType})`,
      });

      await sleep(delayMs);
    }
  }

  throw { error: new Error("Max retries exceeded"), retryCount: attempts - 1, totalRetryDelayMs } as RetryError;
}

// ============================================================================
// CONCURRENCY RUNNER
// ============================================================================
async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const max = Math.max(1, Number(limit || 1));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runner(): Promise<void> {
    while (true) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }

  const runners = Array.from({ length: Math.min(max, items.length) }, () => runner());
  await Promise.all(runners);
  return results;
}

// ============================================================================
// MAIN SWARM FUNCTION
// ============================================================================
async function step1Swarm(userQuery: string, options: SwarmOptions = {}): Promise<SwarmResult> {
  const emit = options.emit;
  const modeRaw = typeof options.mode === "string" ? options.mode : "";
  const mode = modeRaw.trim().toLowerCase() || (options.thinkingNexus ? "deep" : "standard");

  if (!String(userQuery || "").trim()) {
    throw new Error("Step 1 failed: missing user query");
  }

  const cerebrasApiKey = process.env.CEREBRAS_API_KEY || "";
  const blackboxApiKey = process.env.BLACKBOX_API_KEY || "";

  if (mode === "standard" && !cerebrasApiKey) {
    const errMsg = "[APEX SECURITY]: CEREBRAS_API_KEY missing in .env file. Standard Mode requires Cerebras API key.";
    emit?.({ type: "log", step: 1, at: Date.now(), message: errMsg });
    throw new Error(errMsg);
  }
  if (mode === "deep" && !blackboxApiKey) {
    if (cerebrasApiKey) {
      emit?.({ type: "log", step: 1, at: Date.now(), message: "[APEX FALLBACK]: BLACKBOX_API_KEY missing, falling back to Cerebras models for Deep Mode." });
    } else {
      const errMsg = "[APEX SECURITY]: BLACKBOX_API_KEY missing in .env file. Deep Mode requires Blackbox API key (or Cerebras as fallback).";
      emit?.({ type: "log", step: 1, at: Date.now(), message: errMsg });
      throw new Error(errMsg);
    }
  }
  if (mode === "coder" && !cerebrasApiKey && !blackboxApiKey) {
    const errMsg = "[APEX SECURITY]: Missing API keys. Coder Mode requires at least one of CEREBRAS_API_KEY or BLACKBOX_API_KEY.";
    emit?.({ type: "log", step: 1, at: Date.now(), message: errMsg });
    throw new Error(errMsg);
  }

  const OpenAI = await loadOpenAI();

  const cerebrasClient = cerebrasApiKey ? new OpenAI({ baseURL: CEREBRAS_BASE_URL, apiKey: cerebrasApiKey }) : null;
  const blackboxClient = blackboxApiKey ? new OpenAI({ baseURL: BLACKBOX_BASE_URL, apiKey: blackboxApiKey }) : null;

  let models: AgentMeta[] = [];
  let modeName = "";

  if (mode === "deep") {
    modeName = "Deep Scan (Blackbox)";
    if (blackboxClient) {
      models = BLACKBOX_MODELS;
    } else if (cerebrasClient) {
      modeName = "Deep Scan (Cerebras Fallback)";
      models = CEREBRAS_MODELS;
    }
  } else if (mode === "coder") {
    modeName = "Coder Mode";
    models = [...CODER_MODELS_CEREBRAS, ...CODER_MODELS_BLACKBOX];
  } else {
    modeName = "Standard Mode (Cerebras)";
    models = CEREBRAS_MODELS;
  }

  if (mode === "coder") {
    models = models.filter((m) => {
      const provider = m.provider || (String(m.model || "").startsWith("blackboxai/") || String(m.model || "").includes(":free") ? "blackbox" : "cerebras");
      if (provider === "blackbox") return Boolean(blackboxClient);
      return Boolean(cerebrasClient);
    });
  }

  if (models.length === 0) {
    const errMsg = `[APEX ERROR]: No models available for ${modeName}. Check API keys and model configuration.`;
    emit?.({ type: "log", step: 1, at: Date.now(), message: errMsg });
    throw new Error(errMsg);
  }

  const startedAt = Date.now();
  emit?.({ type: "step_progress", step: 1, percent: 0, at: startedAt });
  emit?.({ type: "log", step: 1, at: startedAt, message: `${modeName} engaged. Spawning ${models.length} agents.` });

  for (const m of models) {
    emit?.({ type: "agent_start", step: 1, at: Date.now(), agent: m.agent, agentName: m.agentName, model: m.model });
  }

  const systemPrompt = mode === "coder"
    ? [
        "You are a backend processor specialized in programming tasks. Output JSON ONLY.",
        "No <thinking> tags. No conversational filler. No markdown fences.",
        'Return: { "reasoning_summary": "...", "answer": "..." }',
        "In answer: be implementation-oriented, include file paths and commands when relevant.",
      ].join("\n")
    : [
        "You are a backend processor. Output JSON ONLY. No <thinking> tags. No conversational filler.",
        "You are an elite reasoning model in a multi-agent swarm.",
        'Return: { "reasoning_summary": "...", "answer": "..." }',
      ].join("\n");

  const failureDetails: ErrorDetail[] = [];

  async function runAgent(m: AgentMeta): Promise<AgentExecution> {
    const agentStart = Date.now();
    const provider = m.provider || (String(m.model || "").startsWith("blackboxai/") || String(m.model || "").includes(":free") ? "blackbox" : "cerebras");
    const client = provider === "blackbox" ? blackboxClient : cerebrasClient;
    const baseURL = provider === "blackbox" ? BLACKBOX_BASE_URL : CEREBRAS_BASE_URL;

    if (!client) {
      const msg = provider === "blackbox"
        ? "[APEX SECURITY]: BLACKBOX_API_KEY missing in .env file."
        : "[APEX SECURITY]: CEREBRAS_API_KEY missing in .env file.";

      const durationMs = Date.now() - agentStart;
      const detail: ErrorDetail = {
        provider,
        model: m.model,
        httpStatus: null,
        errorType: ERROR_TYPES.UNAUTHORIZED,
        message: msg,
        retryCount: 0,
        retryDelayMs: 0,
        requestId: null,
        baseURL,
        endpoint: "/chat/completions",
      };

      failureDetails.push(detail);

      emit?.({
        type: "agent_finish",
        step: 1,
        at: Date.now(),
        agent: m.agent,
        agentName: m.agentName,
        model: m.model,
        status: "failed",
        duration: formatDurationMs(durationMs),
        durationMs,
        error: msg,
        errorDetail: detail,
      });

      emit?.({ type: "log", step: 1, at: Date.now(), message: formatErrorForLog(detail) });

      return { agent: m.agent, model: m.model, status: "failed", result: { content: "" }, error: msg, errorDetail: detail };
    }

    const cached = getCachedModelStatus(m.model);
    if (cached && cached.status === "not_found") {
      const durationMs = Date.now() - agentStart;
      const detail: ErrorDetail = {
        provider,
        model: m.model,
        httpStatus: 404,
        errorType: ERROR_TYPES.MODEL_NOT_FOUND,
        message: "Model cached as unavailable (404)",
        retryCount: 0,
        retryDelayMs: 0,
        requestId: null,
        baseURL,
        endpoint: "/chat/completions",
      };

      failureDetails.push(detail);

      emit?.({
        type: "agent_finish",
        step: 1,
        at: Date.now(),
        agent: m.agent,
        agentName: m.agentName,
        model: m.model,
        status: "failed",
        duration: formatDurationMs(durationMs),
        durationMs,
        error: "Model cached as unavailable",
        errorDetail: detail,
      });

      emit?.({ type: "log", step: 1, at: Date.now(), message: formatErrorForLog(detail) });

      return { agent: m.agent, model: m.model, status: "failed", result: { content: "" }, error: "Model cached as unavailable", errorDetail: detail };
    }

    try {
      const candidates = m.models && m.models.length ? m.models : [m.model];
      let selectedModel = candidates[0];
      let selectedContent = "";

      for (let i = 0; i < candidates.length; i += 1) {
        const candidateModel = candidates[i];

        const candidateCached = getCachedModelStatus(candidateModel);
        if (candidateCached && candidateCached.status === "not_found") {
          if (i < candidates.length - 1) {
            emit?.({ type: "log", step: 1, at: Date.now(), message: `${m.agentName || m.agent || "agent"} skipping cached 404 model: ${candidateModel}` });
            continue;
          }
        }

        try {
          const payload = {
            model: candidateModel,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userQuery },
            ],
            max_tokens: mode === "deep" ? 900 : mode === "coder" ? 1100 : 700,
            response_format: { type: "json_object" },
          };

          let completion: { choices: Array<{ message: { content: string } }> };
          let retryInfo = { retryCount: 0, totalRetryDelayMs: 0 };

          try {
            const wrapped = await withRetries(
              () => client.chat.completions.create(payload),
              {
                maxAttempts: provider === "blackbox" ? 4 : 3,
                baseDelayMs: provider === "blackbox" ? 1200 : 450,
                emit,
                agentLabel: m.agentName || m.agent || "agent",
                provider,
                model: candidateModel,
                baseURL,
              }
            );
            completion = wrapped.result;
            retryInfo = { retryCount: wrapped.retryCount, totalRetryDelayMs: wrapped.totalRetryDelayMs };
          } catch (retryErr) {
            const re = retryErr as RetryError;
            const err = re.error;
            const errorType = classifyError(err);

            if (errorType === ERROR_TYPES.UNSUPPORTED_FEATURE || errorType === ERROR_TYPES.BAD_REQUEST) {
              emit?.({ type: "log", step: 1, at: Date.now(), message: `${m.agentName || m.agent}: response_format unsupported, retrying without it` });

              const payloadNoFormat = {
                model: candidateModel,
                messages: payload.messages,
                max_tokens: payload.max_tokens,
              };
              const wrapped = await withRetries(
                () => client.chat.completions.create(payloadNoFormat),
                {
                  maxAttempts: provider === "blackbox" ? 4 : 3,
                  baseDelayMs: provider === "blackbox" ? 1200 : 450,
                  emit,
                  agentLabel: m.agentName || m.agent || "agent",
                  provider,
                  model: candidateModel,
                  baseURL,
                }
              );
              completion = wrapped.result;
              retryInfo = { retryCount: wrapped.retryCount + (re.retryCount || 0), totalRetryDelayMs: wrapped.totalRetryDelayMs + (re.totalRetryDelayMs || 0) };
            } else {
              throw retryErr;
            }
          }

          // retryInfo captured for potential future logging

          const content = completion.choices[0].message.content;
          let parsed = extractJsonObject(content);

          if (!parsed) {
            emit?.({ type: "log", step: 1, at: Date.now(), message: `${m.agentName || m.agent}: Invalid JSON response, retrying with stronger prompt` });

            const retryPayload = {
              model: candidateModel,
              messages: [
                { role: "system", content: "You MUST respond with valid JSON ONLY. No text before or after. Just a JSON object." },
                { role: "user", content: `Respond in JSON ONLY: ${userQuery}` },
              ],
              max_tokens: mode === "deep" ? 900 : mode === "coder" ? 1100 : 700,
            };

            const retryCompletion = await client.chat.completions.create(retryPayload);
            const retryContent = retryCompletion.choices[0].message.content;
            parsed = extractJsonObject(retryContent);

            if (!parsed) {
              throw new Error("Invalid JSON output after retry");
            }
          }

          setCachedModelStatus(candidateModel, "available");

          selectedModel = candidateModel;
          selectedContent = JSON.stringify(parsed);
          break;
        } catch (errWrapper) {
          const ew = errWrapper as RetryError | Error;
          const err = "error" in ew ? ew.error : ew;
          const errorType = classifyError(err);
          const retryCount = "retryCount" in ew ? ew.retryCount : 0;
          const retryDelayMs = "totalRetryDelayMs" in ew ? ew.totalRetryDelayMs : 0;

          if (errorType === ERROR_TYPES.MODEL_NOT_FOUND) {
            setCachedModelStatus(candidateModel, "not_found", errorType);
          }

          if (i < candidates.length - 1 && errorType === ERROR_TYPES.MODEL_NOT_FOUND) {
            emit?.({ type: "log", step: 1, at: Date.now(), message: `${m.agentName || m.agent} model ${candidateModel} not found, trying fallback` });
            continue;
          }

          throw { error: err, retryCount, totalRetryDelayMs: retryDelayMs } as RetryError;
        }
      }

      const durationMs = Date.now() - agentStart;

      emit?.({
        type: "agent_finish",
        step: 1,
        at: Date.now(),
        agent: m.agent,
        agentName: m.agentName,
        model: selectedModel,
        status: "completed",
        duration: formatDurationMs(durationMs),
        durationMs,
        output_snippet: selectedContent.slice(0, 100) + "...",
      });

      return { agent: m.agent, model: selectedModel, status: "completed", result: { content: selectedContent }, error: null };
    } catch (errWrapper) {
      const ew = errWrapper as RetryError | Error;
      const err = "error" in ew ? ew.error : ew;
      const retryCount = "retryCount" in ew ? ew.retryCount : 0;
      const retryDelayMs = "totalRetryDelayMs" in ew ? ew.totalRetryDelayMs : 0;

      const durationMs = Date.now() - agentStart;
      const detail = buildDetailedError(err, provider, m.model, baseURL, retryCount, retryDelayMs);

      failureDetails.push(detail);

      emit?.({
        type: "agent_finish",
        step: 1,
        at: Date.now(),
        agent: m.agent,
        agentName: m.agentName,
        model: m.model,
        status: "failed",
        duration: formatDurationMs(durationMs),
        durationMs,
        error: detail.message,
        errorDetail: detail,
      });

      emit?.({ type: "log", step: 1, at: Date.now(), message: formatErrorForLog(detail) });

      return { agent: m.agent, model: m.model, status: "failed", result: { content: "" }, error: detail.message, errorDetail: detail };
    }
  }

  const blackboxModels = models.filter((m) => {
    const provider = m.provider || (String(m.model || "").startsWith("blackboxai/") || String(m.model || "").includes(":free") ? "blackbox" : "cerebras");
    return provider === "blackbox";
  });

  const cerebrasModels = models.filter((m) => !blackboxModels.includes(m));

  const [blackboxExecs, cerebrasExecs] = await Promise.all([
    runWithConcurrency(blackboxModels, BLACKBOX_CONCURRENCY, runAgent),
    runWithConcurrency(cerebrasModels, CEREBRAS_CONCURRENCY, runAgent),
  ]);

  let executions: AgentExecution[] = [...blackboxExecs, ...cerebrasExecs];
  let successful = executions.filter((e) => e.status === "completed");

  if (successful.length === 0) {
    emit?.({ type: "log", step: 1, at: Date.now(), message: `[APEX FALLBACK]: All ${models.length} primary models failed. Attempting fallback recovery...` });

    const fallbacksToTry: AgentMeta[] = [];
    if (blackboxClient && (mode === "deep" || mode === "coder")) {
      fallbacksToTry.push(...FALLBACK_MODELS.blackbox);
    }
    if (cerebrasClient && (mode === "standard" || mode === "coder" || (mode === "deep" && !blackboxClient))) {
      fallbacksToTry.push(...FALLBACK_MODELS.cerebras);
    }

    if (mode === "deep" && cerebrasClient && blackboxClient) {
      emit?.({ type: "log", step: 1, at: Date.now(), message: `[APEX FALLBACK]: Attempting cross-provider fallback to Cerebras...` });
      fallbacksToTry.push(...FALLBACK_MODELS.cerebras);
    }

    if (fallbacksToTry.length > 0) {
      for (const fb of fallbacksToTry) {
        emit?.({ type: "agent_start", step: 1, at: Date.now(), agent: fb.agent, agentName: fb.agentName, model: fb.model });
      }

      const fallbackBlackbox = fallbacksToTry.filter((m) => m.provider === "blackbox");
      const fallbackCerebras = fallbacksToTry.filter((m) => m.provider === "cerebras");

      const [fbBlackboxExecs, fbCerebrasExecs] = await Promise.all([
        runWithConcurrency(fallbackBlackbox, BLACKBOX_CONCURRENCY, runAgent),
        runWithConcurrency(fallbackCerebras, CEREBRAS_CONCURRENCY, runAgent),
      ]);

      const fallbackExecs = [...fbBlackboxExecs, ...fbCerebrasExecs];
      executions = [...executions, ...fallbackExecs];
      successful = executions.filter((e) => e.status === "completed");
    }
  }

  if (successful.length === 0) {
    emit?.({ type: "log", step: 1, at: Date.now(), message: `[APEX FAILURE REPORT]: All models failed. Total attempts: ${executions.length}` });

    const byType: Record<string, number> = {};
    for (const detail of failureDetails) {
      byType[detail.errorType] = (byType[detail.errorType] || 0) + 1;
    }

    for (const [type, count] of Object.entries(byType)) {
      emit?.({ type: "log", step: 1, at: Date.now(), message: `  - ${type}: ${count} model(s)` });
    }

    const errorSummary = Object.entries(byType)
      .map(([type, count]) => `${type}(${count})`)
      .join(", ");

    throw new Error(`Swarm failed for all models in ${modeName}. Errors: ${errorSummary}. Check Live Log for details.`);
  }

  const finishedAt = Date.now();
  emit?.({ type: "log", step: 1, at: finishedAt, message: `Swarm completed. ${successful.length}/${executions.length} agents successful.` });

  return {
    taskId: null,
    status: "completed",
    selectedAgents: executions.map((e) => ({ agent: e.agent, model: e.model })),
    agentExecutions: executions,
    simulated: false,
  };
}

export const AGENTS = {
  standard: STANDARD_MODELS,
  deep: DEEP_SCAN_MODELS,
  thinking: DEEP_SCAN_MODELS,
  coder: [...CODER_MODELS_CEREBRAS, ...CODER_MODELS_BLACKBOX],
};

export default step1Swarm;

