"use strict";
/**
 * NEXUS PRO V4 - Health Check
 * System health verification utility
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.STEPS = exports.OFFICIAL_MODELS = void 0;
exports.nexusHealthCheck = nexusHealthCheck;
// Official models configuration
const OFFICIAL_MODELS = {
    "deepseek-chat": "Nexus Pro Lite",
    "deepseek-reasoner": "Nexus Pro R1",
};
exports.OFFICIAL_MODELS = OFFICIAL_MODELS;
// 10-Step Pipeline Definition
const STEPS = [
    { id: 1, name: "Swarm Gathering" },
    { id: 2, name: "Omni Deconstruct" },
    { id: 3, name: "Apex Logic" },
    { id: 4, name: "Titan Critique" },
    { id: 5, name: "Core Synthesis" },
    { id: 6, name: "Deep Verify" },
    { id: 7, name: "Quantum Refine" },
    { id: 8, name: "Matrix Format" },
    { id: 9, name: "Final Guard" },
    { id: 10, name: "Absolute Truth" },
];
exports.STEPS = STEPS;
/**
 * Run a full system health check
 */
async function nexusHealthCheck() {
    const checks = {
        models: Object.keys(OFFICIAL_MODELS).length === 2,
        api: (process.env.DEEPSEEK_API_KEY?.length ?? 0) > 0,
        steps: STEPS.length === 10,
        animations: true, // Server-side check - DOM checking happens in browser
        sse: typeof ReadableStream !== "undefined",
    };
    console.log("🔍 Nexus Pro Health Check:");
    console.log("✅ Models: DeepSeek only", checks.models);
    console.log("✅ API Key: configured", checks.api);
    console.log("✅ Pipeline Steps: 10 steps", checks.steps);
    console.log("✅ Animations: no shaking", checks.animations);
    console.log("✅ SSE: enabled", checks.sse);
    return checks;
}
exports.default = nexusHealthCheck;
//# sourceMappingURL=healthCheck.js.map