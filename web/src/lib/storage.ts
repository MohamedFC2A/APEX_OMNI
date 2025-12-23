/**
 * NEXUS PRO V5 - LocalStorage Utilities
 * Persistent chat sessions with SSR guard
 */

import { ChatSession, generateId } from "@/types/chat";

const STORAGE_KEY = "nexus:v5:sessions";
const MAX_SESSIONS = 50; // Limit to prevent bloat

/**
 * Check if we're in browser environment
 */
function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/**
 * Load all sessions from LocalStorage
 */
export function loadSessions(): Record<string, ChatSession> {
  if (!isBrowser()) return {};
  
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ChatSession>;
    return parsed;
  } catch (e) {
    console.error("[storage] Failed to load sessions:", e);
    return {};
  }
}

/**
 * Save all sessions to LocalStorage
 */
export function saveSessions(sessions: Record<string, ChatSession>): void {
  if (!isBrowser()) return;
  
  try {
    // Prune to max sessions (keep most recent)
    const entries = Object.entries(sessions);
    if (entries.length > MAX_SESSIONS) {
      entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
      const pruned = entries.slice(0, MAX_SESSIONS);
      sessions = Object.fromEntries(pruned);
    }
    
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.error("[storage] Failed to save sessions:", e);
  }
}

/**
 * Upsert a single session (add or update)
 */
export function upsertSession(
  sessions: Record<string, ChatSession>,
  session: ChatSession
): Record<string, ChatSession> {
  return {
    ...sessions,
    [session.id]: {
      ...session,
      updatedAt: Date.now(),
    },
  };
}

/**
 * Delete a session by ID
 */
export function deleteSessionById(
  sessions: Record<string, ChatSession>,
  sessionId: string
): Record<string, ChatSession> {
  const next = { ...sessions };
  delete next[sessionId];
  return next;
}

/**
 * Create a new empty session
 */
export function newSession(): ChatSession {
  const now = Date.now();
  return {
    id: generateId(),
    title: "New Chat",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

/**
 * Get sorted sessions (most recent first)
 */
export function getSortedSessions(sessions: Record<string, ChatSession>): ChatSession[] {
  return Object.values(sessions).sort((a, b) => b.updatedAt - a.updatedAt);
}

