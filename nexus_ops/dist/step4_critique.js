"use strict";
/**
 * NEXUS PRO V4 - Step 4: Critique
 * Red Team adversarial analysis with strict TypeScript
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
function sanitizeErrorMessage(message) {
    if (!message)
        return message;
    let out = String(message);
    out = out.replace(/\b(bb_[a-zA-Z0-9_-]{10,})\b/g, "[REDACTED]");
    out = out.replace(/\b(sk-[a-zA-Z0-9_-]{10,})\b/g, "[REDACTED]");
    out = out.replace(/\b(csk-[a-zA-Z0-9_-]{10,})\b/g, "[REDACTED]");
    return out;
}
function normalizeAttacks(value) {
    const arr = Array.isArray(value) ? value : [];
    const out = [];
    for (const item of arr) {
        if (typeof item === "string") {
            const counter = item.trim();
            if (!counter)
                continue;
            out.push({ counter, targetFact: "", supportScore: 0.55 });
            continue;
        }
        if (item && typeof item === "object") {
            const raw = item;
            const counter = typeof raw.counter === "string" ? raw.counter.trim() : "";
            const targetFact = typeof raw.targetFact === "string" ? raw.targetFact.trim() : "";
            const supportScoreRaw = typeof raw.supportScore === "number" ? raw.supportScore : 0.55;
            const supportScore = Math.max(0, Math.min(1, supportScoreRaw));
            if (!counter)
                continue;
            out.push({ counter, targetFact, supportScore });
        }
    }
    return out;
}
async function step4Critique(ctx) {
    const emit = ctx?.emit;
    const accepted = Array.isArray(ctx?.logic?.accepted) ? ctx.logic.accepted : [];
    await (0, ops_utils_1.pause)(emit, { step: 4, message: "Titan Critique engaged. Spawning Red Team analysis." });
    if (accepted.length === 0) {
        return { attacks: normalizeAttacks(["No facts to critique."]) };
    }
    const factsText = accepted.slice(0, 36).map((f, i) => `${i + 1}. ${f.fact}`).join("\n");
    const modeRaw = typeof ctx?.mode === "string" ? ctx.mode : "";
    const mode = modeRaw.trim().toLowerCase() || (ctx?.thinkingNexus ? "deep" : "standard");
    const cerebrasApiKey = process.env.CEREBRAS_API_KEY || "";
    const blackboxApiKey = process.env.BLACKBOX_API_KEY || "";
    let apiKey = "";
    let baseURL = "";
    let model = "";
    if (mode === "deep") {
        apiKey = blackboxApiKey;
        baseURL = BLACKBOX_BASE_URL;
        model = "blackboxai/deepseek/deepseek-r1-0528:free";
    }
    else if (mode === "coder") {
        if (blackboxApiKey) {
            apiKey = blackboxApiKey;
            baseURL = BLACKBOX_BASE_URL;
            model = "blackboxai/x-ai/grok-code-fast-1:free";
        }
        else {
            apiKey = cerebrasApiKey;
            baseURL = CEREBRAS_BASE_URL;
            model = "gpt-oss-120b";
        }
    }
    else {
        apiKey = cerebrasApiKey;
        baseURL = CEREBRAS_BASE_URL;
        model = "llama3.1-8b";
    }
    if (!apiKey) {
        throw new Error(baseURL === BLACKBOX_BASE_URL
            ? "[APEX SECURITY]: BLACKBOX_API_KEY missing in .env file."
            : "[APEX SECURITY]: CEREBRAS_API_KEY missing in .env file.");
    }
    const OpenAI = await loadOpenAI();
    const client = new OpenAI({ apiKey, baseURL });
    try {
        const completion = await client.chat.completions.create({
            model,
            messages: [
                {
                    role: "system",
                    content: 'You are a Red Team attacker. Critique the following facts. Be harsh and practical. Output JSON ONLY with: { "attacks": [{ "counter": "...", "targetFact": "...", "supportScore": 0.0 }] }. supportScore is 0..1.',
                },
                { role: "user", content: `Facts:\n${factsText}` },
            ],
            max_tokens: 650,
            response_format: { type: "json_object" },
        });
        const content = completion.choices[0].message.content;
        let attacks = [];
        try {
            const parsed = JSON.parse(content);
            attacks = normalizeAttacks(parsed?.attacks);
            if (attacks.length === 0)
                attacks = normalizeAttacks([content]);
        }
        catch {
            attacks = normalizeAttacks([content]);
        }
        await (0, ops_utils_1.pause)(emit, { step: 4, message: `Critique complete. Generated ${attacks.length} adversarial vectors.` });
        return { attacks };
    }
    catch (error) {
        console.error("Step 4 Critique Error:", sanitizeErrorMessage(error instanceof Error ? error.message : String(error)));
        await (0, ops_utils_1.pause)(emit, { step: 4, message: "Critique fallback: Using heuristic analysis due to API error." });
        return { attacks: normalizeAttacks(["API Error: defaulting to heuristic critique."]) };
    }
}
exports.default = step4Critique;
//# sourceMappingURL=step4_critique.js.map