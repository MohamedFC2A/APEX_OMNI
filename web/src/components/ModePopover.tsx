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
}

const MODES: ModeOption[] = [
  {
    value: "standard",
    icon: "⚡",
    label: "STANDARD",
    sublabel: "DeepSeek-V3.2 (Fast)",
    description: "Instant responses for quick tasks",
    accentColor: "cyan",
  },
  {
    value: "thinking",
    icon: "🧠",
    label: "NEXUS THINKING PRO",
    sublabel: "DeepSeek-V3.2 (Reasoning)",
    description: "Displays intermediate thoughts",
    accentColor: "purple",
  },
  {
    value: "super_thinking",
    icon: "⚛️",
    label: "NEXUS_PRO_1",
    sublabel: "DeepSeek-V3.2 (Coding Master)",
    description: "Full system-wide logic & code",
    accentColor: "emerald",
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

  // Get accent colors for mode
  const getAccentClasses = (mode: ModeOption, isActive: boolean, isFocused: boolean) => {
    if (isActive) {
      return mode.accentColor === "cyan"
        ? "bg-cyan-500/10 border-l-2 border-l-cyan-400"
        : mode.accentColor === "purple"
          ? "bg-purple-500/10 border-l-2 border-l-purple-400"
          : "bg-emerald-500/10 border-l-2 border-l-emerald-400";
    }
    if (isFocused) {
      return "bg-white/5 border-l-2 border-l-white/20";
    }
    return "border-l-2 border-l-transparent";
  };

  const getActiveBadgeClasses = (mode: ModeOption) => {
    return mode.accentColor === "cyan"
      ? "bg-cyan-500/20 text-cyan-300"
      : mode.accentColor === "purple"
        ? "bg-purple-500/20 text-purple-300"
        : "bg-emerald-500/20 text-emerald-300";
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
            className="overflow-hidden rounded-2xl border border-cyan-500/20 bg-black/80 shadow-2xl shadow-black/50 backdrop-blur-xl"
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
                        <span className="text-sm font-semibold text-white/90 truncate">
                          {mode.label}
                        </span>
                        {isActive && (
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${getActiveBadgeClasses(mode)}`}>
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-white/40 truncate">
                        {mode.sublabel}
                      </div>
                      <div className="mt-0.5 text-[10px] text-white/30 truncate">
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
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className={`group relative flex items-center gap-2.5 rounded-xl border bg-black/60 px-3.5 py-2 backdrop-blur-xl transition-all duration-200 ${
          isOpen
            ? "border-white/20 shadow-lg shadow-black/20"
            : "border-white/10 hover:border-white/15"
        }`}
      >
        <span className="text-base">{selectedMode.icon}</span>
        <div className="text-left">
          <div className="text-[11px] font-semibold tracking-wide text-white/90">
            {selectedMode.label}
          </div>
          <div className="text-[9px] text-white/40">{selectedMode.sublabel}</div>
        </div>
        <svg
          className={`ml-1 h-3.5 w-3.5 text-white/40 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
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
