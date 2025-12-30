/**
 * Recovery Manager - Auto-recovery mechanisms
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { categorizeError, logError, type ErrorInfo } from "./errorHandler";
import type { ChatSession, ChatMessage } from "@/types/chat";

export interface RecoveryOptions {
  maxRetries?: number;
  retryDelay?: number;
  exponentialBackoff?: boolean;
}

const DEFAULT_OPTIONS: RecoveryOptions = {
  maxRetries: 3,
  retryDelay: 1000,
  exponentialBackoff: true,
};

/**
 * Auto-retry failed requests
 */
export async function retryRequest<T>(
  requestFn: () => Promise<T>,
  options: RecoveryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries!; attempt++) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error;
      const errorInfo = categorizeError(error);
      logError(errorInfo);

      if (!errorInfo.recoverable || attempt >= opts.maxRetries!) {
        throw error;
      }

      // Calculate delay
      const delay = opts.exponentialBackoff
        ? opts.retryDelay! * Math.pow(2, attempt)
        : opts.retryDelay!;

      console.log(
        `[RecoveryManager] Retry attempt ${attempt + 1}/${opts.maxRetries} after ${delay}ms`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Recover state from localStorage
 */
export function recoverStateFromStorage(
  storageKey: string = "nexus-chat-v1"
): ChatSession[] | null {
  try {
    if (typeof window === "undefined") return null;

    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return null;

    const parsed = JSON.parse(stored);
    
    // Check if it has sessions
    if (parsed?.state?.sessions) {
      return Object.values(parsed.state.sessions) as ChatSession[];
    }

    return null;
  } catch (error) {
    console.error("[RecoveryManager] Failed to recover from storage:", error);
    return null;
  }
}

/**
 * Reconstruct context from messages
 */
export function reconstructContext(
  messages: ChatMessage[],
  targetMessageId: string
): ChatMessage[] {
  const context: ChatMessage[] = [];
  const messageMap = new Map(messages.map((m) => [m.id, m]));

  // Find target message
  const target = messageMap.get(targetMessageId);
  if (!target) return context;

  // Add all messages before target
  const targetIndex = messages.findIndex((m) => m.id === targetMessageId);
  if (targetIndex > 0) {
    context.push(...messages.slice(0, targetIndex));
  }

  // Add target message
  context.push(target);

  // Add reply chain if exists
  if (target.meta?.replyTo) {
    const replyChain = getReplyChain(target.meta.replyTo, messageMap);
    replyChain.forEach((id) => {
      const msg = messageMap.get(id);
      if (msg && !context.find((m) => m.id === id)) {
        context.push(msg);
      }
    });
  }

  return context;
}

function getReplyChain(
  messageId: string,
  messageMap: Map<string, ChatMessage>
): string[] {
  const chain: string[] = [];
  let currentId: string | undefined = messageId;

  while (currentId) {
    chain.push(currentId);
    const msg = messageMap.get(currentId);
    currentId = msg?.meta?.replyTo;
    
    // Prevent infinite loops
    if (chain.length > 100) break;
  }

  return chain;
}

/**
 * Validate and fix session data
 */
export function validateAndFixSession(session: ChatSession): ChatSession {
  // Remove deleted messages from active view
  const fixedMessages = session.messages.filter((m) => !m.meta?.isDeleted);

  // Fix orphaned replies
  const messageIds = new Set(fixedMessages.map((m) => m.id));
  const fixedMessages2 = fixedMessages.map((msg) => {
    if (msg.meta?.replyTo && !messageIds.has(msg.meta.replyTo)) {
      // Remove invalid reply reference
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { replyTo, ...restMeta } = msg.meta;
      return { ...msg, meta: restMeta };
    }
    return msg;
  });

  return {
    ...session,
    messages: fixedMessages2,
    updatedAt: Date.now(),
  };
}

/**
 * Backup current state
 */
export function backupState(
  sessions: Record<string, ChatSession>,
  storageKey: string = "nexus-chat-backup"
): void {
  try {
    if (typeof window === "undefined") return;

    const backup = {
      timestamp: Date.now(),
      sessions,
    };

    window.localStorage.setItem(storageKey, JSON.stringify(backup));
    console.log("[RecoveryManager] State backed up");
  } catch (error) {
    console.error("[RecoveryManager] Failed to backup state:", error);
  }
}

/**
 * Restore from backup
 */
export function restoreFromBackup(
  storageKey: string = "nexus-chat-backup"
): Record<string, ChatSession> | null {
  try {
    if (typeof window === "undefined") return null;

    const backupStr = window.localStorage.getItem(storageKey);
    if (!backupStr) return null;

    const backup = JSON.parse(backupStr);
    if (backup?.sessions) {
      console.log("[RecoveryManager] State restored from backup");
      return backup.sessions;
    }

    return null;
  } catch (error) {
    console.error("[RecoveryManager] Failed to restore from backup:", error);
    return null;
  }
}

