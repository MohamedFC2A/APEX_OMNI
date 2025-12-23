"use strict";
/**
 * NEXUS PRO V4 - Operations Pipeline
 * Main entry point for all pipeline operations
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENTS = exports.step10Truth = exports.step9Guard = exports.step8Format = exports.step7Refine = exports.step6Verify = exports.step5Synthesis = exports.step4Critique = exports.step3Logic = exports.step2Deconstruct = exports.step1Swarm = exports.NEXUS_SUPER_CODER_PROMPT = exports.NEXUS_THINKING_PROMPT = exports.NEXUS_STANDARD_PROMPT = exports.NEXUS_SYSTEM_PROMPT = exports.STEPS = exports.OFFICIAL_MODELS = exports.nexusHealthCheck = exports.pause = exports.emitLog = exports.randInt = exports.sleep = void 0;
// Re-export all types
__exportStar(require("./types"), exports);
// Re-export utilities
var ops_utils_1 = require("./ops_utils");
Object.defineProperty(exports, "sleep", { enumerable: true, get: function () { return ops_utils_1.sleep; } });
Object.defineProperty(exports, "randInt", { enumerable: true, get: function () { return ops_utils_1.randInt; } });
Object.defineProperty(exports, "emitLog", { enumerable: true, get: function () { return ops_utils_1.emitLog; } });
Object.defineProperty(exports, "pause", { enumerable: true, get: function () { return ops_utils_1.pause; } });
// Re-export health check and system prompts
var healthCheck_1 = require("./healthCheck");
Object.defineProperty(exports, "nexusHealthCheck", { enumerable: true, get: function () { return healthCheck_1.nexusHealthCheck; } });
Object.defineProperty(exports, "OFFICIAL_MODELS", { enumerable: true, get: function () { return healthCheck_1.OFFICIAL_MODELS; } });
Object.defineProperty(exports, "STEPS", { enumerable: true, get: function () { return healthCheck_1.STEPS; } });
var systemPrompts_1 = require("./systemPrompts");
Object.defineProperty(exports, "NEXUS_SYSTEM_PROMPT", { enumerable: true, get: function () { return systemPrompts_1.NEXUS_SYSTEM_PROMPT; } });
Object.defineProperty(exports, "NEXUS_STANDARD_PROMPT", { enumerable: true, get: function () { return systemPrompts_1.NEXUS_STANDARD_PROMPT; } });
Object.defineProperty(exports, "NEXUS_THINKING_PROMPT", { enumerable: true, get: function () { return systemPrompts_1.NEXUS_THINKING_PROMPT; } });
Object.defineProperty(exports, "NEXUS_SUPER_CODER_PROMPT", { enumerable: true, get: function () { return systemPrompts_1.NEXUS_SUPER_CODER_PROMPT; } });
// Import step functions
const step1_swarm_1 = __importStar(require("./step1_swarm"));
exports.step1Swarm = step1_swarm_1.default;
Object.defineProperty(exports, "AGENTS", { enumerable: true, get: function () { return step1_swarm_1.AGENTS; } });
const step2_deconstruct_1 = __importDefault(require("./step2_deconstruct"));
exports.step2Deconstruct = step2_deconstruct_1.default;
const step3_logic_1 = __importDefault(require("./step3_logic"));
exports.step3Logic = step3_logic_1.default;
const step4_critique_1 = __importDefault(require("./step4_critique"));
exports.step4Critique = step4_critique_1.default;
const step5_synthesis_1 = __importDefault(require("./step5_synthesis"));
exports.step5Synthesis = step5_synthesis_1.default;
const step6_verify_1 = __importDefault(require("./step6_verify"));
exports.step6Verify = step6_verify_1.default;
const step7_refine_1 = __importDefault(require("./step7_refine"));
exports.step7Refine = step7_refine_1.default;
const step8_format_1 = __importDefault(require("./step8_format"));
exports.step8Format = step8_format_1.default;
const step9_guard_1 = __importDefault(require("./step9_guard"));
exports.step9Guard = step9_guard_1.default;
const step10_truth_1 = __importDefault(require("./step10_truth"));
exports.step10Truth = step10_truth_1.default;
// Default export for convenience
exports.default = {
    step1Swarm: step1_swarm_1.default,
    step2Deconstruct: step2_deconstruct_1.default,
    step3Logic: step3_logic_1.default,
    step4Critique: step4_critique_1.default,
    step5Synthesis: step5_synthesis_1.default,
    step6Verify: step6_verify_1.default,
    step7Refine: step7_refine_1.default,
    step8Format: step8_format_1.default,
    step9Guard: step9_guard_1.default,
    step10Truth: step10_truth_1.default,
    AGENTS: step1_swarm_1.AGENTS,
};
//# sourceMappingURL=index.js.map