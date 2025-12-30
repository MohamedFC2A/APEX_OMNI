"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { useLanguage } from "@/hooks/useHasMounted";
import { getModelsForMode } from "@/lib/modelRegistry";

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  const { t } = useLanguage();
  const flashModels = getModelsForMode("FLASH");
  const thinkingModels = getModelsForMode("DEEP_THINKING");
  const apexModels = getModelsForMode("APEX");
  const apexExtras = apexModels.filter(
    (model) => !thinkingModels.some((thinking) => thinking.id === model.id)
  );
  
  if (typeof window === "undefined") return null;
  
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm"
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 z-[9999] w-[90vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/20 bg-black/90 backdrop-blur-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
          >
            {/* Header */}
            <div className="border-b border-white/10 bg-gradient-to-r from-cyan-500/10 to-fuchsia-500/10 p-6 shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white">{t("app.title")}</h2>
                  <p className="text-sm text-white/60 mt-1">{t("app.subtitle")}</p>
                </div>
                <button
                  onClick={onClose}
                  className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Content */}
            <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
              {/* Developer Info */}
              <div>
                <h3 className="text-lg font-semibold text-cyan-300 mb-3">Developer</h3>
                <div className="flex items-center gap-3 p-4 bg-white/5 rounded-lg border border-white/10">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center text-white font-bold text-xl">
                    M
                  </div>
                  <div>
                    <p className="text-white font-semibold">Mohamed Matany</p>
                    <p className="text-sm text-white/60">AI Developer & Engineer</p>
                  </div>
                </div>
              </div>
              
              {/* Modes */}
              <div>
                <h3 className="text-lg font-semibold text-purple-300 mb-3">AI Modes & Architectures</h3>
                <div className="space-y-4">
                  {/* FLASH */}
                  <div className="p-4 bg-purple-500/10 rounded-lg border border-purple-400/20">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">⚡</span>
                      <div>
                        <p className="font-semibold text-white">{t("modes.FLASH.label")}</p>
                        <p className="text-xs text-white/50">{t("modes.FLASH.sublabel")}</p>
                      </div>
                    </div>
                    <div className="pl-8 text-xs text-white/70">
                      {flashModels.map((model) => (
                        <div
                          key={model.id}
                          className="font-mono bg-black/20 px-2 py-1 rounded border border-white/5 inline-block text-purple-200/80"
                        >
                          {model.name}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* THINKING */}
                  <div className="p-4 bg-yellow-500/10 rounded-lg border border-yellow-400/20">
                     <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">🧠</span>
                      <div>
                        <p className="font-semibold text-white">{t("modes.DEEP_THINKING.label")}</p>
                        <p className="text-xs text-white/50">{t("modes.DEEP_THINKING.sublabel")}</p>
                      </div>
                    </div>
                    <div className="pl-8 text-xs text-white/70">
                       <div className="grid grid-cols-2 gap-2">
                        {thinkingModels.map((model) => (
                          <div key={model.id} className="font-mono bg-black/20 px-2 py-1 rounded border border-white/5 text-yellow-200/80">
                            {model.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* APEX */}
                  <div className="p-4 bg-emerald-500/10 rounded-lg border border-emerald-400/20">
                     <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">🔥</span>
                      <div>
                        <p className="font-semibold text-white">{t("modes.APEX.label")}</p>
                        <p className="text-xs text-white/50">{t("modes.APEX.sublabel")}</p>
                      </div>
                    </div>
                    <div className="pl-8 text-xs text-white/70">
                       <div className="grid grid-cols-2 gap-2">
                        {apexExtras.map((model) => (
                          <div key={model.id} className="font-mono bg-black/20 px-2 py-1 rounded border border-white/5 text-emerald-200/80">
                            {model.name}
                          </div>
                        ))}
                        <div className="col-span-2 font-mono bg-black/20 px-2 py-1 rounded border border-white/5 text-emerald-200/60 italic text-center">
                          + {t("modes.DEEP_THINKING.label")}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Version */}
              <div className="pt-4 border-t border-white/10 text-center text-sm text-white/50">
                <p>{t("footer.version")} 1.0 • {t("footer.copyright")}</p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
