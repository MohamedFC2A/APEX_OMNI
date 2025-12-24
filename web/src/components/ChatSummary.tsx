"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import type { ChatMessage } from "@/types/chat";
import jsPDF from "jspdf";

interface ChatSummaryProps {
  messages: ChatMessage[];
  sessionId: string;
  onSummaryGenerated?: (summary: string) => void;
}

interface SummaryData {
  quickLook: string;
  keyTopics: string[];
  actionItems: string[];
  userPreferences: string[];
  fullSummary: string;
}

export function ChatSummary({ messages, onSummaryGenerated }: ChatSummaryProps) {
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateSummary = async () => {
    if (messages.length < 3) {
      alert("Need at least 3 messages to generate a summary");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/nexus/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) throw new Error("Failed to generate summary");

      const data = await response.json() as SummaryData;
      setSummaryData(data);
      setIsPopupOpen(true);
      onSummaryGenerated?.(data.fullSummary);
    } catch (error) {
      console.error("Failed to generate summary:", error);
      alert("Failed to generate summary. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const copySummary = async () => {
    if (!summaryData) return;
    
    const textToCopy = `QUICK LOOK\n${summaryData.quickLook}\n\nKEY TOPICS\n${summaryData.keyTopics.join("\n")}\n\nACTION ITEMS\n${summaryData.actionItems.join("\n")}\n\nUSER PREFERENCES\n${summaryData.userPreferences.join("\n")}\n\nFULL SUMMARY\n${summaryData.fullSummary}`;
    
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const exportToPDF = () => {
    if (!summaryData) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let yPos = margin;

    // Title
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Conversation Summary", pageWidth / 2, yPos, { align: "center" });
    yPos += 15;

    // Quick Look
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Quick Look", margin, yPos);
    yPos += 8;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    const quickLookLines = doc.splitTextToSize(summaryData.quickLook, pageWidth - 2 * margin);
    doc.text(quickLookLines, margin, yPos);
    yPos += quickLookLines.length * 6 + 10;

    // Key Topics
    if (summaryData.keyTopics.length > 0) {
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Key Topics", margin, yPos);
      yPos += 8;
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      summaryData.keyTopics.forEach((topic) => {
        doc.text(`• ${topic}`, margin + 5, yPos);
        yPos += 6;
      });
      yPos += 5;
    }

    // Action Items
    if (summaryData.actionItems.length > 0) {
      if (yPos > 250) {
        doc.addPage();
        yPos = margin;
      }
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Action Items", margin, yPos);
      yPos += 8;
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      summaryData.actionItems.forEach((item) => {
        doc.text(`• ${item}`, margin + 5, yPos);
        yPos += 6;
      });
      yPos += 5;
    }

    // User Preferences
    if (summaryData.userPreferences.length > 0) {
      if (yPos > 250) {
        doc.addPage();
        yPos = margin;
      }
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("User Preferences", margin, yPos);
      yPos += 8;
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      summaryData.userPreferences.forEach((pref) => {
        doc.text(`• ${pref}`, margin + 5, yPos);
        yPos += 6;
      });
      yPos += 5;
    }

    // Full Summary
    if (yPos > 250) {
      doc.addPage();
      yPos = margin;
    }
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Full Summary", margin, yPos);
    yPos += 8;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    const summaryLines = doc.splitTextToSize(summaryData.fullSummary, pageWidth - 2 * margin);
    doc.text(summaryLines, margin, yPos);

    doc.save("conversation-summary.pdf");
  };

  if (messages.length < 3) return null;

  return (
    <>
      <div className="mb-4 rounded-xl border border-purple-500/20 bg-purple-500/5 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-xs font-semibold text-purple-300">Conversation Summary</span>
          </div>
          <button
            onClick={generateSummary}
            disabled={isLoading}
            className="px-3 py-1 text-xs bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded-lg transition-colors disabled:opacity-50 transform-gpu will-change-transform"
          >
            {isLoading ? "Generating..." : "Generate"}
          </button>
        </div>
      </div>

      {/* Glassmorphism Popup */}
      {typeof window !== "undefined" && createPortal(
        <AnimatePresence>
          {isPopupOpen && summaryData && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[99998] bg-black/60 backdrop-blur-sm"
                onClick={() => setIsPopupOpen(false)}
                aria-hidden="true"
              />

              {/* Popup */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="fixed left-1/2 top-1/2 z-[99999] w-[90vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/20 bg-black/80 backdrop-blur-2xl shadow-2xl shadow-black/50 transform-gpu will-change-transform"
                role="dialog"
                aria-modal="true"
                aria-label="Conversation Summary"
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-white/10 bg-black/40 p-5">
                  <h2 className="text-lg font-bold tracking-wide text-white/90">Conversation Summary</h2>
                  <button
                    onClick={() => setIsPopupOpen(false)}
                    className="rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                    aria-label="Close"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Content */}
                <div className="max-h-[70vh] overflow-y-auto p-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  {/* Quick Look Card */}
                  <div className="mb-6 rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 to-purple-500/10 p-4 backdrop-blur-xl">
                    <div className="mb-2 flex items-center gap-2">
                      <svg className="h-5 w-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-300">Quick Look</h3>
                    </div>
                    <p className="text-sm leading-relaxed text-white/90">{summaryData.quickLook}</p>
                  </div>

                  {/* Key Topics */}
                  {summaryData.keyTopics.length > 0 && (
                    <div className="mb-6">
                      <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-purple-300">Key Topics</h3>
                      <div className="space-y-2">
                        {summaryData.keyTopics.map((topic, idx) => (
                          <div key={idx} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">
                            • {topic}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action Items */}
                  {summaryData.actionItems.length > 0 && (
                    <div className="mb-6">
                      <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-emerald-300">Action Items</h3>
                      <div className="space-y-2">
                        {summaryData.actionItems.map((item, idx) => (
                          <div key={idx} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-2 text-sm text-white/80">
                            ✓ {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* User Preferences */}
                  {summaryData.userPreferences.length > 0 && (
                    <div className="mb-6">
                      <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-fuchsia-300">User Preferences</h3>
                      <div className="space-y-2">
                        {summaryData.userPreferences.map((pref, idx) => (
                          <div key={idx} className="rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/5 px-4 py-2 text-sm text-white/80">
                            ⭐ {pref}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Full Summary */}
                  <div>
                    <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-white/70">Full Summary</h3>
                    <p className="text-sm leading-relaxed text-white/80 whitespace-pre-wrap">{summaryData.fullSummary}</p>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between border-t border-white/10 bg-black/40 p-5">
                  <div className="text-xs text-white/40">
                    Generated with Gemini 2.0 Flash Experimental
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={copySummary}
                      className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 transition-all hover:bg-cyan-500/20"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      {copied ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onClick={exportToPDF}
                      className="flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm font-medium text-purple-300 transition-all hover:bg-purple-500/20"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Export PDF
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
