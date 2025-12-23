/**
 * NEXUS PRO V5 - Chat Session Types
 * Long-term memory via LocalStorage
 */

export type ChatRole = "user" | "assistant" | "system";

export type NexusMode = "standard" | "thinking" | "super_thinking";

export interface ChatMessageMeta {
  mode?: NexusMode;
  model?: string;
  stepInfo?: {
    totalSteps: number;
    completedSteps: number;
  };
  reasoningContent?: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number; // Unix timestamp ms
  meta?: ChatMessageMeta;
}

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: number; // Unix timestamp ms
  createdAt: number;
  messages: ChatMessage[];
}

/**
 * Generate a unique ID for sessions/messages
 */
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Generate a title from the first user message
 */
export function generateSessionTitle(messages: ChatMessage[]): string {
  const firstUserMsg = messages.find((m) => m.role === "user");
  if (!firstUserMsg) return "New Chat";
  const text = firstUserMsg.content.trim();
  if (text.length <= 40) return text;
  return text.slice(0, 37) + "...";
}

