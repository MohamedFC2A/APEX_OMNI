"use strict";
/**
 * NEXUS PRO V4 - Step 2: Deconstruct
 * Breaks down agent responses into atomic facts using advanced NLP heuristics
 */
Object.defineProperty(exports, "__esModule", { value: true });
const ops_utils_1 = require("./ops_utils");
function extractTextFromExecution(execution) {
    if (!execution)
        return "";
    const result = execution.result;
    const raw = typeof result === "string"
        ? result
        : typeof result?.output === "string"
            ? result.output
            : typeof result?.text === "string"
                ? result.text
                : typeof result?.message === "string"
                    ? result.message
                    : typeof result?.content === "string"
                        ? result.content
                        : "";
    const trimmed = String(raw || "").trim();
    if (!trimmed)
        return "";
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
            const parsed = JSON.parse(trimmed);
            const answer = typeof parsed?.answer === "string" ? parsed.answer.trim() : "";
            const reasoning = typeof parsed?.reasoning_summary === "string" ? parsed.reasoning_summary.trim() : "";
            const combined = [answer, reasoning].filter(Boolean).join("\n\n");
            return combined || trimmed;
        }
        catch {
            return trimmed;
        }
    }
    return trimmed;
}
function normalizeText(s) {
    return String(s || "")
        .replace(/\r\n/g, "\n")
        .replace(/\t/g, " ")
        .replace(/[ ]{2,}/g, " ")
        .trim();
}
function tokenizeWords(s) {
    return normalizeText(s)
        .toLowerCase()
        .replace(/[`*_#>]/g, " ")
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/g)
        .filter(Boolean)
        .filter((w) => w.length >= 3);
}
function splitIntoFacts(text) {
    const normalized = normalizeText(text);
    if (!normalized)
        return [];
    const blocks = normalized.split(/```[\s\S]*?```/g);
    const claims = [];
    for (const block of blocks) {
        if (!block.trim())
            continue;
        const parts = block
            .split(/(?:\r?\n)+|(?<=[.!?])\s+(?=[A-Z])/g)
            .map((s) => s.trim())
            .filter((s) => s.length > 10);
        for (const part of parts) {
            if (part.length > 200) {
                const subParts = part.split(/;\s+|,\s+(?:however|therefore|thus|moreover)\s+/i);
                for (const sp of subParts) {
                    const cleaned = sp.replace(/^[-*•\d.)\s]+/, "").trim();
                    if (cleaned.length > 10)
                        claims.push(cleaned);
                }
            }
            else {
                const cleaned = part.replace(/^[-*•\d.)\s]+/, "").trim();
                if (cleaned.length > 10)
                    claims.push(cleaned);
            }
        }
    }
    return claims;
}
async function step2Deconstruct(ctx) {
    const emit = ctx?.emit;
    const executions = ctx?.swarm?.agentExecutions;
    if (!Array.isArray(executions) || executions.length === 0) {
        throw new Error("Step 2 failed: no swarm executions to deconstruct");
    }
    await (0, ops_utils_1.pause)(emit, { step: 2, message: "Omni-Deconstruct engaged. Running heavy NLP regex heuristics." });
    const perAgentFacts = [];
    let totalFacts = 0;
    for (const exec of executions) {
        const text = extractTextFromExecution(exec);
        const facts = splitIntoFacts(text);
        totalFacts += facts.length;
        perAgentFacts.push({
            exec,
            facts: facts.map((f) => ({
                fact: f,
                words: tokenizeWords(f),
            })),
        });
    }
    const allFacts = [];
    for (const item of perAgentFacts) {
        const agent = item.exec?.agent || "unknown";
        const model = item.exec?.model || "unknown";
        for (const f of item.facts) {
            allFacts.push({
                fact: f.fact,
                tokens: f.words,
                source: { agent, model },
                confidence: 0.8,
            });
        }
    }
    await (0, ops_utils_1.pause)(emit, { step: 2, message: `Deconstruction complete. Extracted ${totalFacts} atomic claims.` });
    return allFacts;
}
exports.default = step2Deconstruct;
//# sourceMappingURL=step2_deconstruct.js.map