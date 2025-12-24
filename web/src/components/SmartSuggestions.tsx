"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import type { ChatMessage } from "@/types/chat";

interface SmartSuggestionsProps {
  messages: ChatMessage[];
  onSelect: (suggestion: string) => void;
}

export function SmartSuggestions({ messages, onSelect }: SmartSuggestionsProps) {
  const suggestions = useMemo(() => {
    if (messages.length === 0) return [];
    
    const lastMessage = messages[messages.length - 1];
    const isUserMessage = lastMessage?.role === "user";
    
    if (!isUserMessage) return [];
    
    const content = lastMessage.content.toLowerCase();
    
    // Generate context-aware suggestions based on conversation
    const suggestions: string[] = [];
    
    // Code-related suggestions
    if (content.includes("code") || content.includes("function") || content.includes("class")) {
      suggestions.push("Can you explain this code in more detail?");
      suggestions.push("Show me an example of how to use this");
      suggestions.push("What are the best practices for this?");
    }
    
    // Question-related suggestions
    if (content.includes("?") || content.includes("how") || content.includes("what")) {
      suggestions.push("Can you provide more examples?");
      suggestions.push("What are the alternatives?");
      suggestions.push("Show me step-by-step instructions");
    }
    
    // Debugging-related suggestions
    if (content.includes("error") || content.includes("bug") || content.includes("fix")) {
      suggestions.push("What could be causing this issue?");
      suggestions.push("How can I prevent this in the future?");
      suggestions.push("Show me the complete solution");
    }
    
    // Default suggestions
    if (suggestions.length === 0) {
      suggestions.push("Tell me more about this");
      suggestions.push("Can you provide examples?");
      suggestions.push("What are the next steps?");
    }
    
    return suggestions.slice(0, 3);
  }, [messages]);

  if (suggestions.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      <div className="text-xs text-white/50 px-1">Suggestions:</div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion, index) => (
          <motion.button
            key={index}
            onClick={() => onSelect(suggestion)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-3 py-1.5 text-xs bg-white/5 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-400/30 rounded-lg text-white/70 hover:text-cyan-200 transition-all"
          >
            {suggestion}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

