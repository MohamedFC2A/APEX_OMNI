"use strict";
/**
 * NEXUS PRO V4 - Step 1: Swarm
 * Multi-agent orchestration layer with strict TypeScript
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENTS = void 0;
const module_1 = require("module");
const url_1 = require("url");
const ops_utils_1 = require("./ops_utils");
const types_1 = require("./types");
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
const STANDARD_MODELS = [
    { provider: "cerebras", agent: "cerebras_llama_70b", agentName: "Llama 3.3 70B", model: "llama-3.3-70b" },
    { provider: "cerebras", agent: "cerebras_llama_8b", agentName: "Llama 3.1 8B", model: "llama3.1-8b" },
    { provider: "cerebras", agent: "cerebras_qwen_32b", agentName: "Qwen 3 32B", model: "qwen-3-32b" },
];
const DEEP_SCAN_MODELS = [
    { provider: "cerebras", agent: "cerebras_llama_70b_deep", agentName: "Llama 3.3 70B (Deep)", model: "llama-3.3-70b" },
    { provider: "cerebras", agent: "cerebras_llama_8b_deep", agentName: "Llama 3.1 8B (Deep)", model: "llama3.1-8b" },
    { provider: "cerebras", agent: "cerebras_qwen_32b_deep", agentName: "Qwen 3 32B (Deep)", model: "qwen-3-32b" },
];
const CODER_MODELS_CEREBRAS = [
    { provider: "cerebras", agent: "cerebras_llama_70b_coder", agentName: "Llama 3.3 70B (Coder)", model: "llama-3.3-70b" },
    { provider: "cerebras", agent: "cerebras_llama_8b_coder", agentName: "Llama 3.1 8B (Coder)", model: "llama3.1-8b" },
    { provider: "cerebras", agent: "cerebras_qwen_32b_coder", agentName: "Qwen 3 32B (Coder)", model: "qwen-3-32b" },
];
const CODER_MODELS_BLACKBOX = [];
const FALLBACK_MODELS = {
    blackbox: [],
    cerebras: [
        { provider: "cerebras", agent: "cerebras_fallback_llama70b", agentName: "Llama 3.3 70B (Fallback)", model: "llama-3.3-70b" },
        { provider: "cerebras", agent: "cerebras_fallback_llama8b", agentName: "Llama 3.1 8B (Fallback)", model: "llama3.1-8b" },
    ],
};
const CEREBRAS_MODELS = STANDARD_MODELS;
const BLACKBOX_MODELS = DEEP_SCAN_MODELS;
const modelStatusCache = new Map();
function getCachedModelStatus(model) {
    const entry = modelStatusCache.get(model);
    if (!entry)
        return null;
    if (Date.now() - entry.checkedAt > CACHE_TTL_MS) {
        modelStatusCache.delete(model);
        return null;
    }
    return entry;
}
function setCachedModelStatus(model, status, errorType) {
    modelStatusCache.set(model, { status, checkedAt: Date.now(), errorType });
}
// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
async function loadOpenAI() {
    const req = (0, module_1.createRequire)(__filename);
    const openaiPath = req.resolve("openai", { paths: [process.cwd()] });
    const mod = await Promise.resolve(`${(0, url_1.pathToFileURL)(openaiPath).href}`).then(s => __importStar(require(s)));
    return mod?.default ?? mod?.OpenAI ?? mod;
}
function redactApiKey(text) {
    if (!text)
        return text;
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
function formatDurationMs(ms) {
    const s = Math.max(0, ms) / 1000;
    return `${s.toFixed(1)}s`;
}
function extractJsonObject(text) {
    const raw = String(text || "").trim();
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        if (start === -1 || end === -1 || end <= start)
            return null;
        const slice = raw.slice(start, end + 1);
        try {
            return JSON.parse(slice);
        }
        catch {
            return null;
        }
    }
}
function getStatusCode(err) {
    if (!err || (typeof err !== "object" && typeof err !== "function"))
        return null;
    const anyErr = err;
    if (typeof anyErr.status === "number")
        return anyErr.status;
    if (typeof anyErr.statusCode === "number")
        return anyErr.statusCode;
    if (anyErr.response && typeof anyErr.response.status === "number") {
        return anyErr.response.status;
    }
    if (typeof anyErr.code === "string") {
        if (anyErr.code === "ECONNREFUSED" || anyErr.code === "ETIMEDOUT" || anyErr.code === "ENOTFOUND") {
            return -1;
        }
    }
    return null;
}
function getRetryAfterMs(err) {
    if (!err || (typeof err !== "object" && typeof err !== "function"))
        return null;
    const anyErr = err;
    const headers = anyErr.headers;
    const responseHeaders = anyErr.response?.headers;
    let raw;
    if (headers && typeof headers.get === "function") {
        raw = headers.get("retry-after");
    }
    else if (responseHeaders && typeof responseHeaders.get === "function") {
        raw = responseHeaders.get("retry-after");
    }
    else if (headers && typeof headers["retry-after"] === "string") {
        raw = headers["retry-after"];
    }
    else if (responseHeaders && typeof responseHeaders["retry-after"] === "string") {
        raw = responseHeaders["retry-after"];
    }
    if (raw == null)
        return null;
    const text = String(raw).trim();
    if (!text)
        return null;
    const seconds = Number(text);
    if (Number.isFinite(seconds) && seconds > 0)
        return Math.min(60000, seconds * 1000);
    return null;
}
function getRequestId(err) {
    if (!err || typeof err !== "object")
        return null;
    const anyErr = err;
    const headers = anyErr.headers;
    const responseHeaders = anyErr.response?.headers;
    if (headers && typeof headers.get === "function") {
        const id = headers.get("x-request-id");
        if (id)
            return id;
    }
    if (responseHeaders && typeof responseHeaders.get === "function") {
        const id = responseHeaders.get("x-request-id");
        if (id)
            return id;
    }
    if (headers && typeof headers["x-request-id"] === "string")
        return headers["x-request-id"];
    if (responseHeaders && typeof responseHeaders["x-request-id"] === "string")
        return responseHeaders["x-request-id"];
    if (typeof anyErr.requestId === "string")
        return anyErr.requestId;
    return null;
}
// ============================================================================
// ERROR CLASSIFICATION
// ============================================================================
function classifyError(err) {
    const status = getStatusCode(err);
    const msg = String(err instanceof Error ? err.message : err || "").toLowerCase();
    if (status === -1 || msg.includes("econnrefused") || msg.includes("etimedout") || msg.includes("enotfound") || msg.includes("fetch failed")) {
        return types_1.ERROR_TYPES.NETWORK_ERROR;
    }
    if (status === 404) {
        return types_1.ERROR_TYPES.MODEL_NOT_FOUND;
    }
    if (status === 429)
        return types_1.ERROR_TYPES.RATE_LIMITED;
    if (status === 401 || status === 403)
        return types_1.ERROR_TYPES.UNAUTHORIZED;
    if (status === 400) {
        if (msg.includes("response_format") || msg.includes("json_object") || msg.includes("json mode") || msg.includes("unsupported")) {
            return types_1.ERROR_TYPES.UNSUPPORTED_FEATURE;
        }
        return types_1.ERROR_TYPES.BAD_REQUEST;
    }
    if (typeof status === "number" && status >= 500)
        return types_1.ERROR_TYPES.SERVER_ERROR;
    if (msg.includes("timeout") || msg.includes("timed out"))
        return types_1.ERROR_TYPES.TIMEOUT;
    if (msg.includes("invalid json") || msg.includes("json parse"))
        return types_1.ERROR_TYPES.JSON_INVALID;
    if (msg.includes("response_format") || msg.includes("json_object"))
        return types_1.ERROR_TYPES.UNSUPPORTED_FEATURE;
    return types_1.ERROR_TYPES.UNKNOWN;
}
function isRetryable(errorType, status) {
    if (errorType === types_1.ERROR_TYPES.RATE_LIMITED)
        return true;
    if (errorType === types_1.ERROR_TYPES.SERVER_ERROR)
        return true;
    if (errorType === types_1.ERROR_TYPES.NETWORK_ERROR)
        return true;
    if (errorType === types_1.ERROR_TYPES.TIMEOUT)
        return true;
    if (status === null || status === undefined)
        return true;
    return false;
}
function buildDetailedError(err, provider, model, baseURL, retryCount = 0, retryDelayMs = 0) {
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
function formatErrorForLog(detail) {
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
async function withRetries(fn, options = {}) {
    const attempts = Math.max(1, Number(options.maxAttempts || 1));
    const base = Math.max(50, Number(options.baseDelayMs || 350));
    const emit = options.emit;
    let totalRetryDelayMs = 0;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return { result: await fn(attempt), retryCount: attempt - 1, totalRetryDelayMs };
        }
        catch (err) {
            const errorType = classifyError(err);
            const status = getStatusCode(err);
            const retryable = isRetryable(errorType, status);
            const shouldRetry = retryable && attempt < attempts;
            if (!shouldRetry) {
                throw { error: err, retryCount: attempt - 1, totalRetryDelayMs };
            }
            const retryAfterMs = getRetryAfterMs(err);
            const delayMs = retryAfterMs ?? Math.min(20000, base * 2 ** (attempt - 1) + (0, ops_utils_1.randInt)(0, 380));
            totalRetryDelayMs += delayMs;
            emit?.({
                type: "log",
                step: 1,
                at: Date.now(),
                message: `${options.agentLabel} retrying after ${Math.round(delayMs)}ms (attempt ${attempt + 1}/${attempts}, reason: ${errorType})`,
            });
            await (0, ops_utils_1.sleep)(delayMs);
        }
    }
    throw { error: new Error("Max retries exceeded"), retryCount: attempts - 1, totalRetryDelayMs };
}
// ============================================================================
// CONCURRENCY RUNNER
// ============================================================================
async function runWithConcurrency(items, limit, worker) {
    const max = Math.max(1, Number(limit || 1));
    const results = new Array(items.length);
    let nextIndex = 0;
    async function runner() {
        while (true) {
            const i = nextIndex;
            nextIndex += 1;
            if (i >= items.length)
                return;
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
async function step1Swarm(userQuery, options = {}) {
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
        }
        else {
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
    let models = [];
    let modeName = "";
    if (mode === "deep") {
        modeName = "Deep Scan (Blackbox)";
        if (blackboxClient) {
            models = BLACKBOX_MODELS;
        }
        else if (cerebrasClient) {
            modeName = "Deep Scan (Cerebras Fallback)";
            models = CEREBRAS_MODELS;
        }
    }
    else if (mode === "coder") {
        modeName = "Coder Mode";
        models = [...CODER_MODELS_CEREBRAS, ...CODER_MODELS_BLACKBOX];
    }
    else {
        modeName = "Standard Mode (Cerebras)";
        models = CEREBRAS_MODELS;
    }
    if (mode === "coder") {
        models = models.filter((m) => {
            const provider = m.provider || (String(m.model || "").startsWith("blackboxai/") || String(m.model || "").includes(":free") ? "blackbox" : "cerebras");
            if (provider === "blackbox")
                return Boolean(blackboxClient);
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
    const failureDetails = [];
    async function runAgent(m) {
        const agentStart = Date.now();
        const provider = m.provider || (String(m.model || "").startsWith("blackboxai/") || String(m.model || "").includes(":free") ? "blackbox" : "cerebras");
        const client = provider === "blackbox" ? blackboxClient : cerebrasClient;
        const baseURL = provider === "blackbox" ? BLACKBOX_BASE_URL : CEREBRAS_BASE_URL;
        if (!client) {
            const msg = provider === "blackbox"
                ? "[APEX SECURITY]: BLACKBOX_API_KEY missing in .env file."
                : "[APEX SECURITY]: CEREBRAS_API_KEY missing in .env file.";
            const durationMs = Date.now() - agentStart;
            const detail = {
                provider,
                model: m.model,
                httpStatus: null,
                errorType: types_1.ERROR_TYPES.UNAUTHORIZED,
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
            const detail = {
                provider,
                model: m.model,
                httpStatus: 404,
                errorType: types_1.ERROR_TYPES.MODEL_NOT_FOUND,
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
                    let completion;
                    let retryInfo = { retryCount: 0, totalRetryDelayMs: 0 };
                    try {
                        const wrapped = await withRetries(() => client.chat.completions.create(payload), {
                            maxAttempts: provider === "blackbox" ? 4 : 3,
                            baseDelayMs: provider === "blackbox" ? 1200 : 450,
                            emit,
                            agentLabel: m.agentName || m.agent || "agent",
                            provider,
                            model: candidateModel,
                            baseURL,
                        });
                        completion = wrapped.result;
                        retryInfo = { retryCount: wrapped.retryCount, totalRetryDelayMs: wrapped.totalRetryDelayMs };
                    }
                    catch (retryErr) {
                        const re = retryErr;
                        const err = re.error;
                        const errorType = classifyError(err);
                        if (errorType === types_1.ERROR_TYPES.UNSUPPORTED_FEATURE || errorType === types_1.ERROR_TYPES.BAD_REQUEST) {
                            emit?.({ type: "log", step: 1, at: Date.now(), message: `${m.agentName || m.agent}: response_format unsupported, retrying without it` });
                            const payloadNoFormat = {
                                model: candidateModel,
                                messages: payload.messages,
                                max_tokens: payload.max_tokens,
                            };
                            const wrapped = await withRetries(() => client.chat.completions.create(payloadNoFormat), {
                                maxAttempts: provider === "blackbox" ? 4 : 3,
                                baseDelayMs: provider === "blackbox" ? 1200 : 450,
                                emit,
                                agentLabel: m.agentName || m.agent || "agent",
                                provider,
                                model: candidateModel,
                                baseURL,
                            });
                            completion = wrapped.result;
                            retryInfo = { retryCount: wrapped.retryCount + (re.retryCount || 0), totalRetryDelayMs: wrapped.totalRetryDelayMs + (re.totalRetryDelayMs || 0) };
                        }
                        else {
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
                }
                catch (errWrapper) {
                    const ew = errWrapper;
                    const err = "error" in ew ? ew.error : ew;
                    const errorType = classifyError(err);
                    const retryCount = "retryCount" in ew ? ew.retryCount : 0;
                    const retryDelayMs = "totalRetryDelayMs" in ew ? ew.totalRetryDelayMs : 0;
                    if (errorType === types_1.ERROR_TYPES.MODEL_NOT_FOUND) {
                        setCachedModelStatus(candidateModel, "not_found", errorType);
                    }
                    if (i < candidates.length - 1 && errorType === types_1.ERROR_TYPES.MODEL_NOT_FOUND) {
                        emit?.({ type: "log", step: 1, at: Date.now(), message: `${m.agentName || m.agent} model ${candidateModel} not found, trying fallback` });
                        continue;
                    }
                    throw { error: err, retryCount, totalRetryDelayMs: retryDelayMs };
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
        }
        catch (errWrapper) {
            const ew = errWrapper;
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
    let executions = [...blackboxExecs, ...cerebrasExecs];
    let successful = executions.filter((e) => e.status === "completed");
    if (successful.length === 0) {
        emit?.({ type: "log", step: 1, at: Date.now(), message: `[APEX FALLBACK]: All ${models.length} primary models failed. Attempting fallback recovery...` });
        const fallbacksToTry = [];
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
        const byType = {};
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
exports.AGENTS = {
    standard: STANDARD_MODELS,
    deep: DEEP_SCAN_MODELS,
    thinking: DEEP_SCAN_MODELS,
    coder: [...CODER_MODELS_CEREBRAS, ...CODER_MODELS_BLACKBOX],
};
exports.default = step1Swarm;
//# sourceMappingURL=step1_swarm.js.map