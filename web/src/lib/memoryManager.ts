/**
 * Memory Manager - Smart context building and message relationship tracking
 */

import type { ChatMessage, ChatSession } from "@/types/chat";

export interface MessageRelationship {
  messageId: string;
  replyTo?: string;
  replies?: string[];
  relatedMessages?: string[];
}

export interface ContextOptions {
  includeDeleted?: boolean;
  maxMessages?: number;
  includeReplies?: boolean;
}

/**
 * Build smart context from messages
 * Filters deleted messages, includes reply relationships
 */
export function buildSmartContext(
  messages: ChatMessage[],
  options: ContextOptions = {}
): ChatMessage[] {
  const {
    includeDeleted = false,
    maxMessages,
    includeReplies = true,
  } = options;

  // Filter deleted messages
  let activeMessages = includeDeleted
    ? messages
    : messages.filter((m) => !m.meta?.isDeleted);

  // If replying, include the replied message even if it's far back
  if (includeReplies) {
    const replyIds = new Set<string>();
    activeMessages.forEach((msg) => {
      if (msg.meta?.replyTo) {
        replyIds.add(msg.meta.replyTo);
      }
    });

    // Add replied messages if not already in context
    messages.forEach((msg) => {
      if (replyIds.has(msg.id) && !activeMessages.find((m) => m.id === msg.id)) {
        activeMessages = [msg, ...activeMessages];
      }
    });
  }

  // Apply max messages limit (keep most recent)
  if (maxMessages && activeMessages.length > maxMessages) {
    activeMessages = activeMessages.slice(-maxMessages);
  }

  return activeMessages;
}

/**
 * Build message relationships map
 */
export function buildMessageRelationships(
  messages: ChatMessage[]
): Map<string, MessageRelationship> {
  const relationships = new Map<string, MessageRelationship>();

  messages.forEach((msg) => {
    if (!relationships.has(msg.id)) {
      relationships.set(msg.id, {
        messageId: msg.id,
        replyTo: msg.meta?.replyTo,
        replies: [],
        relatedMessages: [],
      });
    }

    const rel = relationships.get(msg.id)!;
    if (msg.meta?.replyTo) {
      rel.replyTo = msg.meta.replyTo;
      
      // Add to parent's replies
      if (!relationships.has(msg.meta.replyTo)) {
        relationships.set(msg.meta.replyTo, {
          messageId: msg.meta.replyTo,
          replies: [],
          relatedMessages: [],
        });
      }
      relationships.get(msg.meta.replyTo)!.replies!.push(msg.id);
    }
  });

  return relationships;
}

/**
 * Get all messages in a reply chain
 */
export function getReplyChain(
  messageId: string,
  relationships: Map<string, MessageRelationship>
): string[] {
  const chain: string[] = [messageId];
  const visited = new Set<string>();

  const traverse = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);

    const rel = relationships.get(id);
    if (rel?.replyTo && !chain.includes(rel.replyTo)) {
      chain.unshift(rel.replyTo);
      traverse(rel.replyTo);
    }

    if (rel?.replies) {
      rel.replies.forEach((replyId) => {
        if (!chain.includes(replyId)) {
          chain.push(replyId);
          traverse(replyId);
        }
      });
    }
  };

  traverse(messageId);
  return chain;
}

/**
 * Optimize context for model
 * Removes redundant information, keeps important context
 */
export function optimizeContextForModel(
  messages: ChatMessage[],
  maxTokens: number = 4000
): ChatMessage[] {
  // Simple optimization: keep system messages, recent messages, and important context
  const optimized: ChatMessage[] = [];
  let estimatedTokens = 0;

  // Always include system messages
  const systemMessages = messages.filter((m) => m.role === "system");
  optimized.push(...systemMessages);
  estimatedTokens += systemMessages.reduce((sum, m) => sum + m.content.length / 4, 0);

  // Add messages in reverse order (most recent first) until token limit
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "system") continue; // Already added

    const msgTokens = msg.content.length / 4; // Rough estimate: 4 chars per token
    if (estimatedTokens + msgTokens > maxTokens) break;

    optimized.unshift(msg);
    estimatedTokens += msgTokens;
  }

  return optimized;
}

/**
 * Validate message integrity
 */
export function validateMessageIntegrity(
  session: ChatSession
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for orphaned replies
  const messageIds = new Set(session.messages.map((m) => m.id));
  session.messages.forEach((msg) => {
    if (msg.meta?.replyTo && !messageIds.has(msg.meta.replyTo)) {
      errors.push(`Message ${msg.id} references non-existent replyTo: ${msg.meta.replyTo}`);
    }
  });

  // Check for circular references
  const visited = new Set<string>();
  const checkCircular = (msgId: string, path: string[] = []): boolean => {
    if (path.includes(msgId)) {
      errors.push(`Circular reference detected: ${path.join(" -> ")} -> ${msgId}`);
      return true;
    }
    if (visited.has(msgId)) return false;
    visited.add(msgId);

    const msg = session.messages.find((m) => m.id === msgId);
    if (msg?.meta?.replyTo) {
      return checkCircular(msg.meta.replyTo, [...path, msgId]);
    }
    return false;
  };

  session.messages.forEach((msg) => {
    if (msg.meta?.replyTo) {
      checkCircular(msg.id);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

