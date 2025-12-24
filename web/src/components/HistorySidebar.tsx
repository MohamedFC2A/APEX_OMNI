"use client";

import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useNexusStore, type ChatSession } from "@/state/nexusStore";
import { useShallow } from "zustand/react/shallow";

interface HistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onNewChat: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 7) {
    return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

export function HistorySidebar({ isOpen, onClose, onNewChat }: HistorySidebarProps) {
  // Hydration-safe mounting state
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  const { sessions, activeSessionId, selectSession, deleteSession } = useNexusStore(
    useShallow((s) => ({
      sessions: s.sessions ?? {},
      activeSessionId: s.activeSessionId ?? "",
      selectSession: s.selectSession,
      deleteSession: s.deleteSession,
    }))
  );

  const panelRef = useRef<HTMLDivElement>(null);
  
  // Safe session sorting - guard against undefined
  const sortedSessions = useMemo(() => {
    if (!sessions || typeof sessions !== "object") return [];
    return Object.values(sessions).sort((a, b) => (b?.updatedAt ?? 0) - (a?.updatedAt ?? 0));
  }, [sessions]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Handle session select
  const handleSelectSession = useCallback(
    (sessionId: string) => {
      selectSession(sessionId);
      onClose();
    },
    [selectSession, onClose]
  );

  // Handle session delete
  const handleDeleteSession = useCallback(
    (e: React.MouseEvent, sessionId: string) => {
      e.stopPropagation();
      deleteSession(sessionId);
    },
    [deleteSession]
  );

  // Don't render until mounted (SSR/hydration safe)
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[99998] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Sidebar Panel */}
          <motion.div
            ref={panelRef}
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed left-0 top-0 z-[99999] h-full w-[320px] max-w-[85vw] bg-black/80 backdrop-blur-xl border-r border-white/10 shadow-2xl shadow-black/50 transform-gpu will-change-transform"
            role="dialog"
            aria-modal="true"
            aria-label="Chat History"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 bg-black/40 p-4">
              <h2 className="text-xs font-bold tracking-[0.2em] text-white/70 uppercase">
                PAST CONVERSATIONS
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onNewChat}
                  className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300 transition-all hover:bg-cyan-500/20"
                  aria-label="New Chat"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="Close sidebar"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Session List */}
            <div className="flex-1 overflow-y-auto p-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {sortedSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-3 rounded-full bg-white/5 p-4">
                    <svg className="h-8 w-8 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <p className="text-sm text-white/40">No chat history yet</p>
                  <p className="mt-1 text-xs text-white/30">Start a conversation to see it here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedSessions.map((session: ChatSession) => (
                    <motion.button
                      key={session.id}
                      type="button"
                      onClick={() => handleSelectSession(session.id)}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className={`group relative w-full rounded-xl p-3 text-left transition-all transform-gpu ${
                        session.id === activeSessionId
                          ? "bg-gradient-to-r from-cyan-500/20 to-fuchsia-500/10 border border-cyan-400/30 shadow-lg shadow-cyan-500/10"
                          : "bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/15"
                      }`}
                    >
                      {/* Title */}
                      <div className="pr-8">
                        <p className={`text-sm font-medium truncate ${
                          session.id === activeSessionId ? "text-cyan-200" : "text-white/80"
                        }`}>
                          {session.title || "New Chat"}
                        </p>
                        <p className="mt-1 text-xs text-white/40" suppressHydrationWarning>
                          {session.messages?.length || 0} messages • {formatRelativeTime(session.updatedAt)}
                        </p>
                      </div>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteSession(e, session.id)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-white/30 opacity-0 transition-all hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
                        aria-label={`Delete ${session.title || "chat"}`}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>

                      {/* Active Indicator */}
                      {session.id === activeSessionId && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 rounded-r-full bg-gradient-to-b from-cyan-400 to-fuchsia-400" />
                      )}
                    </motion.button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-white/10 bg-black/40 p-4">
              <p className="text-center text-[10px] text-white/40">
                Sessions stored locally in your browser
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

