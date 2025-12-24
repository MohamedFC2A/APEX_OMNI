"use client";

import React, { useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { searchChatHistory, highlightSearchTerms, type SearchResult } from "@/lib/search";
import { useNexusStore } from "@/state/nexusStore";
import { useShallow } from "zustand/react/shallow";

interface ChatSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMessage?: (sessionId: string, messageId: string) => void;
}

export function ChatSearch({ isOpen, onClose, onSelectMessage }: ChatSearchProps) {
  const [query, setQuery] = useState("");
  
  const { sessions, selectSession } = useNexusStore(
    useShallow((s) => ({
      sessions: s.sessions ?? {},
      selectSession: s.selectSession,
    }))
  );

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return searchChatHistory({
      query,
      sessions,
      limit: 20,
      fuzzy: true,
    });
  }, [query, sessions]);

  const handleSelectResult = useCallback(
    (result: SearchResult) => {
      selectSession(result.sessionId);
      onSelectMessage?.(result.sessionId, result.messageId);
      onClose();
      setQuery("");
    }, [selectSession, onSelectMessage, onClose]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Search Panel */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-2xl bg-black/90 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-white/10 p-4">
          <svg className="w-5 h-5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chat history..."
            className="flex-1 bg-transparent text-white/90 placeholder:text-white/40 outline-none"
            autoFocus
          />
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto p-2">
          {query.trim() && results.length === 0 ? (
            <div className="text-center py-12 text-white/40">
              <p>No results found</p>
            </div>
          ) : query.trim() ? (
            <div className="space-y-1">
              {results.map((result) => (
                <motion.button
                  key={`${result.sessionId}-${result.messageId}`}
                  onClick={() => handleSelectResult(result)}
                  className="w-full text-left p-3 rounded-lg hover:bg-white/5 transition-colors group"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-cyan-400/80 mb-1 truncate">
                        {result.sessionTitle}
                      </div>
                      <div
                        className="text-sm text-white/80 line-clamp-2"
                        dangerouslySetInnerHTML={{
                          __html: highlightSearchTerms(result.snippet, query),
                        }}
                      />
                      <div className="text-[10px] text-white/40 mt-1">
                        {new Date(result.message.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-xs text-white/30">
                      {Math.round(result.matchScore)}%
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-white/40">
              <p>Start typing to search...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 px-4 py-2 text-xs text-white/40">
          {query.trim() && (
            <span>{results.length} result{results.length !== 1 ? "s" : ""} found</span>
          )}
        </div>
      </motion.div>
    </div>
  );
}

