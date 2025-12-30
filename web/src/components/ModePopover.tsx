"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useHasMounted, useLanguage } from "@/hooks/useHasMounted";
import type { NexusMode } from "@/types/chat";

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
    value: "FLASH",
    icon: "⚡",
    label: "NEXUS_FLASH_PRO",
    sublabel: "Single model • ultra-fast",
    description: "Fastest response with minimal overhead",
    accentColor: "purple",
    gradient: "from-purple-500 via-fuchsia-500 to-purple-600",
  },
  {
    value: "DEEP_THINKING",
    icon: "🧠",
    label: "NEXUS_DEEP_THINKING_PRO",
    sublabel: "Parallel reasoning ensemble",
    description: "Multi-model analysis with aggregated output",
    accentColor: "gold",
    gradient: "from-yellow-400 via-amber-500 to-yellow-600",
  },
  {
    value: "APEX",
    icon: "🔥",
    label: "NEXUS_APEX_OMENI",
    sublabel: "Extended specialist swarm",
    description: "Specialists + final aggregator synthesis",
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
  const [infoOpen, setInfoOpen] = useState<NexusMode | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasMounted = useHasMounted();
  const { t } = useLanguage();

  const selectedMode = MODES.find((m) => m.value === value) || MODES[0]!;

  // Set portal container on mount (client-side only)
  useEffect(() => {
    setPortalContainer(document.body);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Calculate menu position (with smart direction detection)
  const getMenuPosition = useCallback(() => {
    if (typeof window === "undefined" || !triggerRef.current) {
      return { top: 100, left: 20, direction: "down" as const };
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = 300;
    const menuHeight = 200; // Approximate height
    let left = rect.left;
    let top = rect.bottom + 8;
    let direction: "up" | "down" = "down";

    // Check if there's enough space below
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // If not enough space below but enough above, open upward
    if (spaceBelow < menuHeight + 16 && spaceAbove > menuHeight + 16) {
      direction = "up";
      top = rect.top - menuHeight - 8;
    }

    // Keep within viewport horizontally
    if (left + menuWidth > window.innerWidth - 16) {
      left = window.innerWidth - menuWidth - 16;
    }
    if (left < 16) left = 16;

    return {
      top,
      left,
      direction,
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

  const pos = useMemo(() => (hasMounted ? getMenuPosition() : null), [getMenuPosition, hasMounted]);

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

  // Removed getModelsForInfo - no longer showing model names to users

  return (
    <div className="relative">
      {/* Trigger Button with Shiny Gradient */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className={`group relative flex items-center gap-2.5 rounded-xl border px-3.5 py-2 backdrop-blur-xl transition-all duration-200 overflow-hidden ${isOpen
          ? `${getTriggerGradient(selectedMode)} border-${selectedMode.accentColor}-500/40`
          : `bg-black/40 border-white/10 hover:border-${selectedMode.accentColor}-500/30 hover:bg-black/60`
          }`}
      >
        {/* Shine effect */}
        <div className={`absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 transition-transform duration-1000 ${isOpen ? "translate-x-full" : "-translate-x-full group-hover:translate-x-full"
          }`} />
        <span className="text-base relative z-10">{selectedMode.icon}</span>
        <div className="text-left relative z-10">
          <div className={`text-[11px] font-semibold tracking-wide ${isOpen ? "text-white" : "text-white/90"
            }`}>
            {t(`modes.${selectedMode.value}.label`)}
          </div>
          <div className={`text-[9px] ${isOpen ? "text-white/90" : "text-white/60"
            }`}>{t(`modes.${selectedMode.value}.sublabel`)}</div>
        </div>
        <svg
          className={`ml-1 h-3.5 w-3.5 relative z-10 transition-transform duration-200 ${isOpen ? "rotate-180 text-white" : "text-white/70"
            }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Portal the menu to body */}
      {hasMounted && portalContainer && createPortal(
        <AnimatePresence>
          {isOpen && (isMobile || pos) && (
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
                initial={{
                  opacity: 0,
                  y: isMobile ? 18 : (pos?.direction === "up" ? 10 : -10),
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                exit={{
                  opacity: 0,
                  y: isMobile ? 18 : (pos?.direction === "up" ? 10 : -10),
                }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                style={{
                  position: "fixed",
                  ...(isMobile
                    ? { left: 0, right: 0, bottom: 0, width: "100%" }
                    : { top: pos!.top, left: pos!.left, width: 300 }),
                  zIndex: 999999,
                  transformOrigin: "center",
                }}
                className={
                  "overflow-hidden border border-white/10 bg-black/60 shadow-2xl shadow-black/50 backdrop-blur-2xl " +
                  (isMobile ? "rounded-t-2xl" : "rounded-2xl")
                }
              >
                {/* Header */}
                <div className="border-b border-white/5 bg-white/[0.02] px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
                    {t("modes.selectEngine")}
                  </div>
                </div>

                {/* Options */}
                <div className="py-1">
                  {MODES.map((mode, index) => {
                    const isActive = value === mode.value;
                    const isFocused = focusedIndex === index;

                    return (
                      <div
                        key={mode.value}
                        className="flex w-full items-center gap-2 px-3 py-2"
                      >
                        <button
                          type="button"
                          onClick={() => handleSelect(mode.value)}
                          onMouseEnter={() => setFocusedIndex(index)}
                          className={`flex flex-1 items-center gap-3 rounded-xl px-3 py-2 text-left transition-all duration-150 cursor-pointer ${getAccentClasses(mode, isActive, isFocused)}`}
                          aria-pressed={isActive}
                        >
                          <span className="text-xl">{mode.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-white/95">
                                {t(`modes.${mode.value}.label`)}
                              </span>
                              {isActive && (
                                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${getActiveBadgeClasses(mode)}`}>
                                  {t("modes.active")}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 text-[11px] text-white/60">
                              {t(`modes.${mode.value}.sublabel`)}
                            </div>
                            <div className="mt-1 text-[10px] text-white/70 whitespace-pre-line">
                              {t(`modes.${mode.value}.description`)}
                            </div>
                            {/* Model count only - no names */}
                            <div className="mt-2">
                              <div className="text-[9px] text-white/50">
                                {mode.value === "FLASH" && "1 execution lane"}
                                {mode.value === "DEEP_THINKING" && "7 parallel models"}
                                {mode.value === "APEX" && "12 specialist models"}
                              </div>
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setInfoOpen(mode.value)}
                          onFocus={() => setFocusedIndex(index)}
                          className="shrink-0 rounded-lg p-1.5 text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
                          aria-label={`Show ${mode.label} info`}
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        portalContainer
      )}

      {/* Info Dialog */}
      {hasMounted && portalContainer && createPortal(
        <AnimatePresence>
          {infoOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[999998] bg-black/60 backdrop-blur-sm"
                onClick={() => setInfoOpen(null)}
                aria-hidden="true"
              />
              {/* Dialog */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="fixed left-1/2 top-1/2 z-[999999] w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/20 bg-black/80 backdrop-blur-2xl shadow-2xl shadow-black/50"
                role="dialog"
                aria-modal="true"
                aria-label="Mode Information"
              >
                <div className="border-b border-white/10 bg-black/40 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white/90">
                      {t(`modes.${infoOpen}.label`)}
                    </h3>
                    <button
                      onClick={() => setInfoOpen(null)}
                      className="rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                      aria-label="Close"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
                  {infoOpen && (
                    <>
                      <div>
                        <h4 className="text-sm font-semibold text-cyan-300 mb-2">What it does:</h4>
                        <p className="text-sm text-white/80">{t(`modes.${infoOpen}.what`)}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-purple-300 mb-2">When to use:</h4>
                        <p className="text-sm text-white/80">{t(`modes.${infoOpen}.when`)}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-emerald-300 mb-2">Impact:</h4>
                        <p className="text-sm text-white/80">{t(`modes.${infoOpen}.impact`)}</p>
                      </div>

                      {/* Model count only - no names */}
                      <div>
                        <h4 className="text-sm font-semibold text-white/60 mb-2 mt-4 uppercase tracking-wider">Configuration</h4>
                        <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                          <div className="text-xs text-white/70">
                            {infoOpen === "FLASH" && "Single ultra-fast execution lane"}
                            {infoOpen === "DEEP_THINKING" && "7 parallel reasoning models with aggregation"}
                            {infoOpen === "APEX" && "12 specialist models (7 reasoning + 5 experts) with final synthesis"}
                          </div>
                        </div>
                      </div>

                      {/* Developer attribution */}
                      <div className="pt-4 border-t border-white/10 mt-4">
                        <div className="text-[10px] text-white/40 text-center tracking-wide">
                          Developed by Mohamed Matany
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        portalContainer
      )}
    </div>
  );
}
