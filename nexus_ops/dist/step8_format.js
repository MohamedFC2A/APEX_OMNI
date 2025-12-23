"use strict";
/**
 * NEXUS PRO V4 - Step 8: Format
 * Matrix format with tabular structure detection
 */
Object.defineProperty(exports, "__esModule", { value: true });
const ops_utils_1 = require("./ops_utils");
function detectTabularIntent(text, acceptedFacts) {
    const t = String(text || "").toLowerCase();
    if (t.includes("|"))
        return true;
    if (t.includes("table") || t.includes("tabular") || t.includes("matrix"))
        return true;
    if (Array.isArray(acceptedFacts) && acceptedFacts.length >= 10)
        return true;
    return false;
}
function toMarkdownTable(rows) {
    const header = "| Fact | Confidence | Agent | Model |";
    const sep = "|---|---:|---|---|";
    const body = rows.map((r) => {
        const fact = String(r.fact || "").replace(/\|/g, "\\|");
        const conf = typeof r.confidence === "number" ? r.confidence.toFixed(2) : "0.50";
        const agent = String(r.source?.agent || "unknown");
        const model = String(r.source?.model || "unknown");
        return `| ${fact} | ${conf} | ${agent} | ${model} |`;
    });
    return [header, sep, ...body].join("\n");
}
function normalizeWhitespace(s) {
    return String(s || "").replace(/\n{3,}/g, "\n\n").trim();
}
async function step8Format(ctx) {
    const emit = ctx?.emit;
    const refined = typeof ctx?.refined === "string" ? ctx.refined : "";
    if (!refined.trim())
        throw new Error("Step 8 failed: missing refined draft");
    const accepted = Array.isArray(ctx?.logic?.accepted) ? ctx.logic.accepted : [];
    await (0, ops_utils_1.pause)(emit, { step: 8, message: "Matrix format engaged. Detecting tabular structures and enforcing Markdown compliance." });
    const wantTable = detectTabularIntent(ctx?.userQuery, accepted);
    let out = normalizeWhitespace(refined);
    if (wantTable) {
        await (0, ops_utils_1.pause)(emit, { step: 8, message: "Tabular signal detected. Converting top facts into a Markdown table." });
        const top = accepted.slice(0, 16);
        const table = toMarkdownTable(top);
        out = [out, "", "## Fact Matrix", table].join("\n");
    }
    return out;
}
exports.default = step8Format;
//# sourceMappingURL=step8_format.js.map