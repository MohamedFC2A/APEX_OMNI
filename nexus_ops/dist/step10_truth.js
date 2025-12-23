"use strict";
/**
 * NEXUS PRO V4 - Step 10: Truth
 * Absolute Truth with final report generation
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
const module_1 = require("module");
const url_1 = require("url");
const ops_utils_1 = require("./ops_utils");
const CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1";
const BLACKBOX_BASE_URL = "https://api.blackbox.ai";
async function loadOpenAI() {
    const req = (0, module_1.createRequire)(__filename);
    const openaiPath = req.resolve("openai", { paths: [process.cwd()] });
    const mod = await Promise.resolve(`${(0, url_1.pathToFileURL)(openaiPath).href}`).then(s => __importStar(require(s)));
    return mod?.default ?? mod?.OpenAI ?? mod;
}
function redactSecrets(s) {
    return String(s || "")
        .replace(/\b(bb_[a-zA-Z0-9_-]{10,})\b/g, "[REDACTED]")
        .replace(/\b(sk-[a-zA-Z0-9_-]{10,})\b/g, "[REDACTED]")
        .replace(/\b(csk-[a-zA-Z0-9_-]{10,})\b/g, "[REDACTED]")
        .replace(/BLACKBOX_API_KEY\s*=\s*[^\n]+/gi, "BLACKBOX_API_KEY=[REDACTED]")
        .replace(/CEREBRAS_API_KEY\s*=\s*[^\n]+/gi, "CEREBRAS_API_KEY=[REDACTED]");
}
function chunkText(text, maxChunkSize) {
    const chunks = [];
    let cursor = 0;
    while (cursor < text.length) {
        const next = Math.min(text.length, cursor + maxChunkSize);
        chunks.push(text.slice(cursor, next));
        cursor = next;
    }
    return chunks;
}
function extractCodeFromSwarm(swarm) {
    if (!swarm || !Array.isArray(swarm.agentExecutions))
        return null;
    const successfulExecs = swarm.agentExecutions.filter((e) => e.status === "completed" && e.result?.content);
    if (successfulExecs.length === 0)
        return null;
    for (const exec of successfulExecs) {
        try {
            const content = exec.result.content;
            const parsed = JSON.parse(content);
            if (parsed && typeof parsed === "object") {
                const fileKeys = Object.keys(parsed).filter((k) => k.endsWith(".html") ||
                    k.endsWith(".css") ||
                    k.endsWith(".js") ||
                    k.endsWith(".ts") ||
                    k.endsWith(".tsx") ||
                    k.endsWith(".json") ||
                    k.endsWith(".py") ||
                    k.endsWith(".java") ||
                    k.endsWith(".go"));
                if (fileKeys.length > 0) {
                    return { type: "files", data: parsed, source: exec.model };
                }
                if (typeof parsed.answer === "string") {
                    const answer = parsed.answer;
                    if (answer.includes("```") ||
                        answer.includes("<!DOCTYPE") ||
                        answer.includes("function ") ||
                        answer.includes("const ")) {
                        return { type: "answer", data: parsed.answer, source: exec.model };
                    }
                }
            }
        }
        catch {
            const content = exec.result.content;
            if (content && (content.includes("```") || content.includes("<!DOCTYPE"))) {
                return { type: "raw", data: content, source: exec.model };
            }
        }
    }
    const first = successfulExecs[0];
    try {
        const parsed = JSON.parse(first.result.content);
        return { type: "json", data: parsed, source: first.model };
    }
    catch {
        return { type: "raw", data: first.result.content, source: first.model };
    }
}
function formatCodeOutput(extracted) {
    if (!extracted)
        return null;
    let output = "";
    if (extracted.type === "files") {
        output += `# Code Output\n\n`;
        output += `> Generated by: \`${extracted.source}\`\n\n`;
        const files = extracted.data;
        for (const [filename, content] of Object.entries(files)) {
            if (typeof content !== "string")
                continue;
            let lang = "text";
            if (filename.endsWith(".html"))
                lang = "html";
            else if (filename.endsWith(".css"))
                lang = "css";
            else if (filename.endsWith(".js"))
                lang = "javascript";
            else if (filename.endsWith(".ts"))
                lang = "typescript";
            else if (filename.endsWith(".tsx"))
                lang = "tsx";
            else if (filename.endsWith(".json"))
                lang = "json";
            else if (filename.endsWith(".py"))
                lang = "python";
            else if (filename.endsWith(".java"))
                lang = "java";
            else if (filename.endsWith(".go"))
                lang = "go";
            output += `## 📄 ${filename}\n\n`;
            output += `\`\`\`${lang}\n`;
            output += content.trim();
            output += `\n\`\`\`\n\n`;
        }
        return output;
    }
    if (extracted.type === "answer") {
        output += `# Code Output\n\n`;
        output += `> Generated by: \`${extracted.source}\`\n\n`;
        output += extracted.data;
        return output;
    }
    if (extracted.type === "raw") {
        output += `# Code Output\n\n`;
        output += `> Generated by: \`${extracted.source}\`\n\n`;
        output += extracted.data;
        return output;
    }
    if (extracted.type === "json") {
        const data = extracted.data;
        output += `# Code Output\n\n`;
        output += `> Generated by: \`${extracted.source}\`\n\n`;
        if (data.reasoning_summary) {
            output += `## Summary\n\n${data.reasoning_summary}\n\n`;
        }
        if (data.answer) {
            output += `## Implementation\n\n${data.answer}\n\n`;
        }
        return output;
    }
    return null;
}
async function step10Truth(ctx) {
    const emit = ctx?.emit;
    const { swarm, facts, logic, critique, verified, formatted, guard } = ctx;
    const modeRaw = typeof ctx?.mode === "string" ? ctx.mode : "";
    const mode = modeRaw.trim().toLowerCase() || (ctx?.thinkingNexus ? "deep" : "standard");
    await (0, ops_utils_1.pause)(emit, {
        step: 10,
        message: mode === "deep"
            ? "Absolute Truth engaged. Spawning Omni-Writer (Deep Mode)."
            : mode === "coder"
                ? "Absolute Truth engaged. Spawning Omni-Writer (Coder Mode)."
                : "Absolute Truth engaged. Spawning Omni-Writer (Standard Mode).",
    });
    if (mode === "coder") {
        const extracted = extractCodeFromSwarm(swarm);
        if (extracted) {
            const codeOutput = formatCodeOutput(extracted);
            if (codeOutput) {
                await (0, ops_utils_1.pause)(emit, { step: 10, message: "Code extracted and formatted from successful agents." });
                const finalReport = redactSecrets(codeOutput);
                const chunkSize = 12;
                const intervalMs = 8;
                return {
                    answer: finalReport,
                    presentation: {
                        typing: {
                            chunkSize,
                            intervalMs,
                            chunks: chunkText(finalReport, chunkSize),
                        },
                    },
                };
            }
        }
    }
    const contextData = {
        userQuery: ctx.userQuery,
        mode,
        swarmResults: swarm?.selectedAgents || [],
        keyFacts: facts?.slice(0, 10) || [],
        logicConflicts: logic?.conflicts || [],
        critiqueAttacks: critique?.attacks || [],
        verifiedDraft: typeof verified === "string" ? verified : "",
        guardFlags: guard?.flags || [],
        guardSafeOutput: typeof guard?.safeOutput === "string" ? guard.safeOutput : "",
        formattedDraft: typeof guard?.safeOutput === "string" ? guard.safeOutput : typeof formatted === "string" ? formatted : "",
    };
    const cerebrasApiKey = process.env.CEREBRAS_API_KEY || "";
    const blackboxApiKey = process.env.BLACKBOX_API_KEY || "";
    let apiKey = "";
    let baseURL = "";
    let model = "";
    let maxTokens = 1600;
    if (cerebrasApiKey) {
        apiKey = cerebrasApiKey;
        baseURL = CEREBRAS_BASE_URL;
        model = "llama-3.3-70b";
        maxTokens = mode === "coder" ? 2200 : 1600;
    }
    else if (blackboxApiKey) {
        apiKey = blackboxApiKey;
        baseURL = BLACKBOX_BASE_URL;
        model = "meta-llama/llama-3.1-70b-instruct";
        maxTokens = mode === "coder" ? 2200 : 1600;
    }
    else {
        throw new Error("[APEX SECURITY]: No API keys available for final report generation.");
    }
    const OpenAI = await loadOpenAI();
    const client = new OpenAI({ apiKey, baseURL });
    let finalReport = "";
    try {
        const systemPrompt = mode === "coder"
            ? [
                "You are an AI coding assistant. Generate a comprehensive Markdown report.",
                'Output JSON ONLY: { "report": "...markdown..." }',
                "The report MUST include:",
                "## Summary - Brief overview of what needs to be done",
                "## Files - List of files to create/modify",
                "## Code - Complete code with language-tagged fenced blocks",
                "## Commands - Any terminal commands needed",
                "Be implementation-oriented with complete, working code.",
            ].join("\n")
            : 'You are the Omni-Writer. Generate a detailed technical Markdown report. Output JSON ONLY: { "report": "...markdown..." }';
        const completion = await client.chat.completions.create({
            model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Context Data:\n${JSON.stringify(contextData, null, 2)}` },
            ],
            max_tokens: maxTokens,
        });
        const content = completion.choices[0].message.content;
        try {
            const parsed = JSON.parse(content);
            finalReport = typeof parsed?.report === "string" ? parsed.report : "";
        }
        catch {
            const jsonMatch = content.match(/\{[\s\S]*"report"[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    const parsed = JSON.parse(jsonMatch[0]);
                    finalReport = typeof parsed?.report === "string" ? parsed.report : "";
                }
                catch {
                    finalReport = content;
                }
            }
            else {
                finalReport = content;
            }
        }
        if (!finalReport) {
            throw new Error("Empty report generated");
        }
    }
    catch (error) {
        console.error("Step 10 Truth Error:", error instanceof Error ? error.message : String(error));
        finalReport = formatted || guard?.safeOutput || "Error generating final report.";
    }
    finalReport = redactSecrets(finalReport);
    await (0, ops_utils_1.pause)(emit, { step: 10, message: "Packaging final byte-stream and typing envelope." });
    const chunkSize = 8;
    const intervalMs = 15;
    return {
        answer: finalReport,
        presentation: {
            typing: {
                chunkSize,
                intervalMs,
                chunks: chunkText(finalReport, chunkSize),
            },
        },
    };
}
exports.default = step10Truth;
//# sourceMappingURL=step10_truth.js.map