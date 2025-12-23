/**
 * NEXUS PRO V4 - Step 1: Swarm
 * Multi-agent orchestration layer with strict TypeScript
 */
import { AgentMeta, SwarmResult, SwarmOptions } from "./types";
declare function step1Swarm(userQuery: string, options?: SwarmOptions): Promise<SwarmResult>;
export declare const AGENTS: {
    standard: AgentMeta[];
    deep: AgentMeta[];
    thinking: AgentMeta[];
    coder: AgentMeta[];
};
export default step1Swarm;
//# sourceMappingURL=step1_swarm.d.ts.map