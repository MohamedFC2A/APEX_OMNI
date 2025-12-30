"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import type { ChatMessage as ChatMessageType, ChatAttachment } from "@/types/chat";
import { MarkdownView } from "@/components/NexusChat";

// Typing Animation Component for Messages
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TypingTextMessage({ text, speed = 3, isStreaming = false }: { text: string; speed?: number; isStreaming?: boolean }) {
  const [displayedText, setDisplayedText] = useState("");
  const indexRef = useRef(0);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // If streaming, show text immediately
    if (isStreaming) {
      setDisplayedText(text);
      indexRef.current = text.length;
      return;
    }

    // If text is empty, reset
    if (text.length === 0) {
      setDisplayedText("");
      indexRef.current = 0;
      return;
    }

    // On first render, start typing animation
    if (isFirstRender.current && text.length > 0) {
      isFirstRender.current = false;
      indexRef.current = 0;
      setDisplayedText("");
    }

    // If text is shorter than displayed, reset
    if (text.length < displayedText.length) {
      setDisplayedText(text);
      indexRef.current = text.length;
      isFirstRender.current = true;
      return;
    }

    // If we're behind, catch up with typing animation
    if (indexRef.current < text.length) {
      const interval = setInterval(() => {
        if (indexRef.current < text.length) {
          indexRef.current += speed;
          setDisplayedText(text.slice(0, indexRef.current));
        } else {
          clearInterval(interval);
        }
      }, 20); // Smooth typing

      return () => clearInterval(interval);
    }
  }, [text, speed, isStreaming, displayedText.length]);

  return <>{displayedText}</>;
}

interface ChatMessageProps {
  message: ChatMessageType;
  isUser: boolean;
  onEdit?: (messageId: string, newContent: string) => void;
  onDelete?: (messageId: string) => void;
  onReply?: (messageId: string) => void;
  replyToMessage?: ChatMessageType | null;
}

export function ChatMessage({
  message,
  isUser,
  onEdit,
  onDelete,
  onReply,
  replyToMessage,
}: ChatMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showActions, setShowActions] = useState(false);

  const handleSave = useCallback(() => {
    if (editContent.trim() && editContent !== message.content && onEdit) {
      onEdit(message.id, editContent.trim());
    }
    setIsEditing(false);
  }, [editContent, message.content, message.id, onEdit]);

  const handleCancel = useCallback(() => {
    setEditContent(message.content);
    setIsEditing(false);
  }, [message.content]);

  const handleDelete = useCallback(() => {
    if (onDelete && confirm("Are you sure you want to delete this message?")) {
      onDelete(message.id);
    }
  }, [message.id, onDelete]);

  // Don't render deleted messages
  if (message.meta?.isDeleted) {
    return null;
  }

  const isEdited = !!message.meta?.editedAt;
  const hasAttachments = message.meta?.attachments && message.meta.attachments.length > 0;
  const modelName = message.meta?.modelName;
  const realResponseTimeMs = message.meta?.realResponseTimeMs;
  const finalAnswerSummary = message.meta?.finalAnswerSummary;

  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} mb-4 group`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser 
          ? "bg-gradient-to-br from-cyan-500 to-emerald-500" 
          : "bg-gradient-to-br from-purple-500 to-fuchsia-500"
      }`}>
        <span className="text-white text-sm font-bold">
          {isUser ? "U" : "AI"}
        </span>
      </div>

      {/* Message Content */}
      <div className={`flex-1 max-w-[85%] sm:max-w-[75%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
        {/* Reply Preview */}
        {replyToMessage && (
          <div className={`w-full mb-1 px-3 py-2 rounded-lg border-l-2 ${
            isUser ? "border-cyan-400/50 bg-cyan-500/5" : "border-purple-400/50 bg-purple-500/5"
          }`}>
            <div className="text-xs text-white/50 mb-1">
              Replying to {replyToMessage.role === "user" ? "you" : "AI"}
            </div>
            <div className="text-xs text-white/70 line-clamp-2">
              {replyToMessage.content.substring(0, 100)}
              {replyToMessage.content.length > 100 ? "..." : ""}
            </div>
          </div>
        )}

        {/* Message Bubble */}
        <div className={`relative rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-400/30"
            : "bg-black/60 border border-white/10 backdrop-blur-xl"
        }`}>
          {/* Attachments */}
          {hasAttachments && message.meta?.attachments && (
            <div className="mb-2 space-y-2">
              {message.meta.attachments.map((attachment) => (
                <AttachmentDisplay key={attachment.id} attachment={attachment} />
              ))}
            </div>
          )}

          {/* Message Text */}
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-sm text-white/90 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
                rows={3}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="px-3 py-1 text-xs bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded-lg transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={handleCancel}
                  className="px-3 py-1 text-xs bg-white/10 hover:bg-white/20 text-white/70 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-white/90 leading-relaxed">
              {isUser ? (
                <div className="whitespace-pre-wrap">{message.content}</div>
              ) : (
                <MarkdownView markdown={message.content} />
              )}
            </div>
          )}

          {/* Actions (Edit/Delete/Reply) - User messages only */}
          {isUser && !isEditing && showActions && (
            <div className="absolute -top-8 right-0 flex gap-1 bg-black/80 backdrop-blur-xl border border-white/10 rounded-lg px-1 py-1">
              {onReply && (
                <button
                  onClick={() => onReply(message.id)}
                  className="p-1.5 hover:bg-white/10 rounded transition-colors"
                  title="Reply"
                >
                  <svg className="w-3.5 h-3.5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                </button>
              )}
              {onEdit && (
                <button
                  onClick={() => {
                    setIsEditing(true);
                    setEditContent(message.content);
                  }}
                  className="p-1.5 hover:bg-white/10 rounded transition-colors"
                  title="Edit"
                >
                  <svg className="w-3.5 h-3.5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
              {onDelete && (
                <button
                  onClick={handleDelete}
                  className="p-1.5 hover:bg-red-500/20 rounded transition-colors"
                  title="Delete"
                >
                  <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          )}
          {!isUser && (modelName || typeof realResponseTimeMs === "number" || finalAnswerSummary) && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {modelName && (
                <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[9px] font-semibold text-white/60">
                  {modelName}
                </span>
              )}
              {typeof realResponseTimeMs === "number" && (
                <span className={`px-2 py-0.5 rounded-md border text-[9px] font-mono ${
                  // FLASH mode detection: if modelName is FLASH or NEXUS_FLASH_PRO
                  (modelName === "FLASH" || modelName === "NEXUS_FLASH_PRO")
                    ? realResponseTimeMs > 1200
                      ? "bg-red-500/10 border-red-400/30 text-red-400"
                      : realResponseTimeMs > 800
                        ? "bg-amber-500/10 border-amber-400/30 text-amber-400"
                        : "bg-emerald-500/10 border-emerald-400/30 text-emerald-400"
                    : "bg-white/5 border-white/10 text-white/50"
                }`}>
                  {(modelName === "FLASH" || modelName === "NEXUS_FLASH_PRO") 
                    ? `FLASH responded in ${Math.max(0, Math.round(realResponseTimeMs))}ms${realResponseTimeMs > 1200 ? " (SLOW)" : ""}`
                    : `${Math.max(0, Math.round(realResponseTimeMs))}ms`
                  }
                </span>
              )}
              {finalAnswerSummary && (
                <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[9px] text-white/45 truncate max-w-[320px]">
                  {finalAnswerSummary}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Timestamp & Edited Badge */}
        <div className={`flex items-center gap-2 text-[10px] text-white/40 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
          <span>
            {new Date(message.createdAt).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
          {isEdited && (
            <span className="text-white/30 italic">(edited)</span>
          )}
        </div>
      </div>
    </div>
  );
}

function AttachmentDisplay({ attachment }: { attachment: ChatAttachment }) {
  if (attachment.type === "image") {
    return (
      <div className="relative rounded-lg overflow-hidden border border-white/10">
        <Image
          src={attachment.thumbnailUrl || attachment.url}
          alt={attachment.name || "Attachment"}
          width={800}
          height={600}
          className="max-w-full h-auto max-h-64 object-contain"
          loading="lazy"
        />
        <a
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity"
        >
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </a>
      </div>
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
    >
      <div className="flex-shrink-0 w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center">
        <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white/90 truncate">{attachment.name}</div>
        <div className="text-xs text-white/50">
          {(attachment.size / 1024).toFixed(1)} KB
        </div>
      </div>
      <svg className="w-5 h-5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    </a>
  );
}

