/**
 * NEXUS OPS UTILITIES - TypeScript Edition
 * Core utility functions for Nexus operations
 */

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randInt(min: number, max: number): number {
  const a = Math.ceil(min);
  const b = Math.floor(max);
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

export type EmitFunction = (payload: any) => void;

export function emitLog(emit: EmitFunction | undefined, payload: Record<string, any>): void {
  if (typeof emit !== "function") return;
  emit({
    type: "log",
    at: Date.now(),
    ...payload,
  });
}

export async function pause(
  emit: EmitFunction | undefined,
  payload: Record<string, any>,
  minMs = 50,
  maxMs = 160
): Promise<void> {
  emitLog(emit, payload);
  await sleep(randInt(minMs, maxMs));
}

