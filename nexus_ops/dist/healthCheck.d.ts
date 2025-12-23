/**
 * NEXUS PRO V4 - Health Check
 * System health verification utility
 */
declare const OFFICIAL_MODELS: {
    "deepseek-chat": string;
    "deepseek-reasoner": string;
};
declare const STEPS: {
    id: number;
    name: string;
}[];
export interface HealthCheckResult {
    models: boolean;
    api: boolean;
    steps: boolean;
    animations: boolean;
    sse: boolean;
}
/**
 * Run a full system health check
 */
export declare function nexusHealthCheck(): Promise<HealthCheckResult>;
export { OFFICIAL_MODELS, STEPS };
export default nexusHealthCheck;
//# sourceMappingURL=healthCheck.d.ts.map