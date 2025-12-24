"use client";

import React from "react";
import { motion } from "framer-motion";

interface TypingIndicatorProps {
  label?: string;
  className?: string;
}

export function TypingIndicator({ label = "AI is thinking", className = "" }: TypingIndicatorProps) {
  return (
    <div className={`flex items-center gap-2 px-4 py-2 ${className}`}>
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="h-2 w-2 rounded-full bg-cyan-400/80"
            animate={{
              y: [0, -8, 0],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              delay: i * 0.2,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
      <span className="text-xs text-cyan-300/70 font-medium">{label}...</span>
    </div>
  );
}

