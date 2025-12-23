"use strict";
/**
 * NEXUS OPS UTILITIES - TypeScript Edition
 * Core utility functions for Nexus operations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sleep = sleep;
exports.randInt = randInt;
exports.emitLog = emitLog;
exports.pause = pause;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function randInt(min, max) {
    const a = Math.ceil(min);
    const b = Math.floor(max);
    return Math.floor(Math.random() * (b - a + 1)) + a;
}
function emitLog(emit, payload) {
    if (typeof emit !== "function")
        return;
    emit({
        type: "log",
        at: Date.now(),
        ...payload,
    });
}
async function pause(emit, payload, minMs = 50, maxMs = 160) {
    emitLog(emit, payload);
    await sleep(randInt(minMs, maxMs));
}
//# sourceMappingURL=ops_utils.js.map