"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

export type NexusMode = "standard" | "thinking" | "super_thinking";

interface ModeOption {
  value: NexusMode;
  icon: string;
  label: string;
  sublabel: string;
  description: string;
  accentColor: string;
  gradient: string;
}

const MODES: ModeOption[] = [
  {
    value: "standard",
    icon: "⚡",
    label: "STANDARD",
    sublabel: "NEXUS_PRO_1",
    description: "Multiple models: Mimo, Devstral, DeepSeek NEX, GPT-OSS",
    accentColor: "purple",
    gradient: "from-purple-500 via-fuchsia-500 to-purple-600",
  },
  {
    value: "thinking",
    icon: "🧠",
    label: "NEXUS THINKING PRO",
    sublabel: "DeepSeek-V3.2 (Reasoning)",
    description: "Displays intermediate thoughts",
    accentColor: "gold",
    gradient: "from-yellow-400 via-amber-500 to-yellow-600",
  },
  {
    value: "super_thinking",
    icon: "⚛️",
    label: "NEXUS_PRO_1",
    sublabel: "DeepSeek-V3.2 (Coding Master)",
    description: "Full system-wide logic & code",
    accentColor: "emerald",
    gradient: "from-emerald-400 via-cyan-500 to-emerald-600",
  },
];

interface ModePopoverProps {
  value: NexusMode;
  onChange: (mode: NexusMode) => void;
}

export function ModePopover({ value, onChange }: ModePopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedMode = MODES.find((m) => m.value === value) || MODES[0]!;

  // Set portal container on mount (client-side only)
  useEffect(() => {
    setPortalContainer(document.body);
  }, []);

  // Calculate menu position
  const getMenuPosition = useCallback(() => {
    if (!triggerRef.current) return { top: 100, left: 20 };
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = 300;
    let left = rect.left;
    
    // Keep within viewport
    if (left + menuWidth > window.innerWidth - 16) {
      left = window.innerWidth - menuWidth - 16;
    }
    if (left < 16) left = 16;
    
    return {
      top: rect.bottom + 8,
      left,
    };
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };

    const timer = setTimeout(() => {
      document.addEventListener("click", handleClick);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handleClick);
    };
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % MODES.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + MODES.length) % MODES.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        onChange(MODES[focusedIndex]!.value);
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, focusedIndex, onChange]);

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  const handleSelect = (mode: NexusMode) => {
    onChange(mode);
    setIsOpen(false);
  };

  const pos = getMenuPosition();

  // Get accent colors for mode with glass effect (less vibrant)
  const getAccentClasses = (mode: ModeOption, isActive: boolean, isFocused: boolean) => {
    if (isActive) {
      return `bg-black/30 backdrop-blur-md border-l-2 border-l-${mode.accentColor}-400/40`;
    }
    if (isFocused) {
      return "bg-white/5 border-l-2 border-l-white/20";
    }
    return "border-l-2 border-l-transparent";
  };

  const getActiveBadgeClasses = (mode: ModeOption) => {
    return `bg-${mode.accentColor}-500/20 text-${mode.accentColor}-300 border border-${mode.accentColor}-500/30 backdrop-blur-sm`;
  };

  const getTriggerGradient = (mode: ModeOption) => {
    return `bg-gradient-to-r ${mode.gradient} bg-opacity-60 text-white shadow-lg shadow-${mode.accentColor}-500/20 backdrop-blur-md`;
  };

  // The dropdown menu content
  const menuContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop - subtle dark overlay */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/40"
            style={{ zIndex: 999998 }}
            onClick={() => setIsOpen(false)}
          />

          {/* Menu - Obsidian Glass */}
          <motion.div
            key="menu"
            ref={menuRef}
            id="mode-popover-content"
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: "spring", damping: 20, stiffness: 240 }}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: 300,
              zIndex: 999999,
            }}
            className="overflow-hidden rounded-2xl border border-white/10 bg-black/60 shadow-2xl shadow-black/50 backdrop-blur-2xl"
          >
            {/* Header */}
            <div className="border-b border-white/5 bg-white/[0.02] px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
                Select Engine
              </div>
            </div>

            {/* Options */}
            <div className="py-1">
              {MODES.map((mode, index) => {
                const isActive = value === mode.value;
                const isFocused = focusedIndex === index;

                return (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => handleSelect(mode.value)}
                    onMouseEnter={() => setFocusedIndex(index)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-all duration-150 ${getAccentClasses(mode, isActive, isFocused)}`}
                  >
                    <span className="text-xl">{mode.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white/95 truncate">
                          {mode.label}
                        </span>
                        {isActive && (
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${getActiveBadgeClasses(mode)}`}>
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-white/60 truncate">
                        {mode.sublabel}
                      </div>
                      <div className="mt-0.5 text-[10px] text-white/50 truncate">
                        {mode.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <div className="relative">
      {/* Trigger Button with Shiny Gradient */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className={`group relative flex items-center gap-2.5 rounded-xl border px-3.5 py-2 backdrop-blur-xl transition-all duration-200 overflow-hidden ${
          isOpen
            ? `${getTriggerGradient(selectedMode)} border-${selectedMode.accentColor}-500/40`
            : `bg-black/40 border-white/10 hover:border-${selectedMode.accentColor}-500/30 hover:bg-black/60`
        }`}
      >
        {/* Shine effect */}
        <div className={`absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 transition-transform duration-1000 ${
          isOpen ? "translate-x-full" : "-translate-x-full group-hover:translate-x-full"
        }`} />
        <span className="text-base relative z-10">{selectedMode.icon}</span>
        <div className="text-left relative z-10">
          <div className={`text-[11px] font-semibold tracking-wide ${
            isOpen ? "text-white" : "text-white/90"
          }`}>
            {selectedMode.label}
          </div>
          <div className={`text-[9px] ${
            isOpen ? "text-white/90" : "text-white/60"
          }`}>{selectedMode.sublabel}</div>
        </div>
        <svg
          className={`ml-1 h-3.5 w-3.5 relative z-10 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-white" : "text-white/70"
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Portal the menu to body */}
      {portalContainer && createPortal(menuContent, portalContainer)}
    </div>
  );
}
