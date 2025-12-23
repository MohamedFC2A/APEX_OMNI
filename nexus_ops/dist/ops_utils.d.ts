/**
 * NEXUS OPS UTILITIES - TypeScript Edition
 * Core utility functions for Nexus operations
 */
export declare function sleep(ms: number): Promise<void>;
export declare function randInt(min: number, max: number): number;
export type EmitFunction = (payload: any) => void;
export declare function emitLog(emit: EmitFunction | undefined, payload: Record<string, any>): void;
export declare function pause(emit: EmitFunction | undefined, payload: Record<string, any>, minMs?: number, maxMs?: number): Promise<void>;
//# sourceMappingURL=ops_utils.d.ts.map