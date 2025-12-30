"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ChatMessage } from "@/types/chat";

interface LiveSuggestionsProps {
  input: string;
  messages: ChatMessage[];
  onSelect: (suggestion: string) => void;
  lang?: "ar" | "en";
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
}

export function LiveSuggestions({ input, messages, onSelect, lang = "en", textareaRef }: LiveSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchSuggestions = useCallback(
    async (text: string) => {
      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Don't fetch if input is too short or empty
      if (!text || text.trim().length < 2) {
        setSuggestions([]);
        return;
      }

      // Create new abort controller
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);

      try {
        const history = messages
          .slice(-5) // Last 5 messages for context
          .map((m) => ({ role: m.role, content: m.content }));

        const response = await fetch("/api/nexus/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: text,
            history,
            lang,
          }),
          signal: controller.signal,
        });

        if (!response.ok) throw new Error("Failed to fetch suggestions");

        const data = (await response.json()) as { suggestions: string[] };
        if (!controller.signal.aborted) {
          setSuggestions(data.suggestions || []);
        }
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          console.error("Failed to fetch suggestions:", error);
        }
        if (!controller.signal.aborted) {
          setSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [messages, lang]
  );

  useEffect(() => {
    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce: wait 200ms after user stops typing (faster)
    debounceTimerRef.current = setTimeout(() => {
      fetchSuggestions(input);
    }, 200);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [input, fetchSuggestions]);

  // Calculate position above textarea cursor
  useEffect(() => {
    if (!textareaRef?.current || (suggestions.length === 0 && !isLoading)) {
      setPosition(null);
      return;
    }

    const textarea = textareaRef.current;
    const updatePosition = () => {
      const rect = textarea.getBoundingClientRect();
      // Position above textarea, aligned to left
      setPosition({
        top: rect.top - 8, // 8px above
        left: rect.left + 12, // 12px from left edge
      });
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [textareaRef, suggestions.length, isLoading]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  if ((suggestions.length === 0 && !isLoading) || !position) return null;

  return (
    <AnimatePresence>
      {(suggestions.length > 0 || isLoading) && (
        <motion.div
          initial={{ opacity: 0, y: 5, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 5, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="fixed z-50 max-w-[calc(100vw-2rem)]"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            transform: "translateY(-100%)",
          }}
        >
          <div className="flex items-center gap-1.5 bg-black/90 backdrop-blur-xl border border-cyan-500/30 rounded-xl px-2 py-1.5 shadow-2xl shadow-black/50">
            {isLoading ? (
              <div className="flex items-center gap-2 px-2 py-1 text-[11px] text-white/60">
                <div className="h-2.5 w-2.5 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                <span>{lang === "ar" ? "..." : "..."}</span>
              </div>
            ) : (
              suggestions.map((suggestion, index) => (
                <motion.button
                  key={index}
                  onClick={() => onSelect(suggestion)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-2.5 py-1 text-[11px] bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-400/20 hover:border-cyan-400/40 rounded-lg text-cyan-200/90 hover:text-cyan-100 transition-all whitespace-nowrap"
                >
                  {suggestion}
                </motion.button>
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

