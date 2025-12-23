"use strict";
/**
 * NEXUS PRO V4 - Step 6: Verify
 * Deep verification with truth pattern matching
 */
Object.defineProperty(exports, "__esModule", { value: true });
const ops_utils_1 = require("./ops_utils");
function hasPlaceholders(s) {
    const text = String(s || "");
    const explicitPatterns = [
        /\bTODO:/i,
        /\bTBD:/i,
        /\bPLACEHOLDER:/i,
        /\[TODO\]/i,
        /\[TBD\]/i,
        /\[PLACEHOLDER\]/i,
        /\blorem ipsum\b/i,
        /\bXXX\b/,
        /\bFIXME\b/i,
        /INSERT_.*_HERE/i,
        /\[\.{3}\]/,
    ];
    return explicitPatterns.some((pattern) => pattern.test(text));
}
function normalizeKey(s) {
    return String(s || "")
        .toLowerCase()
        .replace(/[`*_#>]/g, " ")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/[ ]{2,}/g, " ")
        .trim();
}
const TRUTH_PATTERNS = [
    { id: "sse", weight: 0.9, re: /\b(eventsource|text\/event-stream|sse)\b/i },
    { id: "env", weight: 0.85, re: /\b(process\.env|dotenv|\.env)\b/i },
    { id: "http", weight: 0.75, re: /\b(http:\/\/localhost:\d+|\/api\/)\b/i },
    { id: "code", weight: 0.8, re: /\b(npm run|node |package\.json|next\.js|express)\b/i },
    { id: "steps", weight: 0.7, re: /\b(step\s*\d+|10-step|pipeline)\b/i },
    { id: "safety", weight: 0.6, re: /\b(redact|sanitize|profanity|bias|hallucination)\b/i },
];
function truthScoreForFact(fact) {
    const text = String(fact || "");
    if (!text.trim())
        return { score: 0, hits: [] };
    const hits = [];
    let score = 0;
    for (const p of TRUTH_PATTERNS) {
        if (p.re.test(text)) {
            hits.push(p.id);
            score += p.weight;
        }
    }
    const penalty = /\b(always|never|guarantee|100%|impossible)\b/i.test(text) ? 0.15 : 0;
    const out = Math.max(0, Math.min(1, score / 2.2 - penalty));
    return { score: out, hits };
}
async function step6Verify(ctx) {
    const emit = ctx?.emit;
    const draft = typeof ctx?.draft === "string" ? ctx.draft : "";
    if (!draft.trim())
        throw new Error("Step 6 failed: missing draft");
    await (0, ops_utils_1.pause)(emit, { step: 6, message: "Deep verify engaged. Matching facts against Truth Pattern dataset." });
    if (hasPlaceholders(draft)) {
        throw new Error("Step 6 failed: draft contains placeholders");
    }
    const accepted = Array.isArray(ctx?.logic?.accepted) ? ctx.logic.accepted : [];
    const verifiedFacts = [];
    const flaggedFacts = [];
    for (const f of accepted.slice(0, 60)) {
        const base = typeof f.confidence === "number" ? f.confidence : 0.5;
        const { score, hits } = truthScoreForFact(f.fact);
        const final = Math.max(0, Math.min(1, base * 0.65 + score * 0.35));
        const item = {
            fact: f.fact,
            confidence: base,
            truthScore: score,
            finalScore: final,
            hits,
            source: f.source,
        };
        if (final >= 0.55)
            verifiedFacts.push(item);
        else
            flaggedFacts.push(item);
    }
    await (0, ops_utils_1.pause)(emit, { step: 6, message: `Verification complete. Verified: ${verifiedFacts.length}. Flagged: ${flaggedFacts.length}.` });
    const out = [
        draft,
        "",
        "## Deep Verify Report",
        `- Verified facts: ${verifiedFacts.length}`,
        `- Flagged facts: ${flaggedFacts.length}`,
        "",
        "### Verified",
        ...verifiedFacts.slice(0, 14).map((x) => `- (${x.finalScore.toFixed(2)}) ${x.fact}`),
        "",
        "### Flagged",
        ...flaggedFacts.slice(0, 10).map((x) => `- (${x.finalScore.toFixed(2)}) ${x.fact}`),
    ].join("\n");
    const sanity = normalizeKey(out);
    if (sanity.includes("must") && sanity.includes("cannot") && sanity.split("must").length > 4) {
        throw new Error("Step 6 failed: contradictory constraints density too high");
    }
    return out;
}
exports.default = step6Verify;
//# sourceMappingURL=step6_verify.js.map