"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Image from "next/image";

interface LinkPreviewData {
  title?: string;
  description?: string;
  image?: string;
  url: string;
}

interface LinkPreviewProps {
  url: string;
}

export function LinkPreview({ url }: LinkPreviewProps) {
  const [preview, setPreview] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchPreview = async () => {
      try {
        setLoading(true);
        setError(false);
        
        // Call API to fetch Open Graph data
        const response = await fetch(`/api/nexus/preview?url=${encodeURIComponent(url)}`);
        
        if (cancelled) return;
        
        if (!response.ok) {
          throw new Error("Failed to fetch preview");
        }
        
        const data = await response.json();
        setPreview(data);
      } catch {
        if (!cancelled) {
          setError(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchPreview();

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (loading) {
    return (
      <div className="mt-2 p-3 bg-white/5 border border-white/10 rounded-lg">
        <div className="flex items-center gap-2 text-xs text-white/40">
          <div className="h-4 w-4 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
          Loading preview...
        </div>
      </div>
    );
  }

  if (error || !preview) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-2 text-xs text-cyan-400 hover:text-cyan-300 underline"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        {url}
      </a>
    );
  }

  return (
    <motion.a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-2 block overflow-hidden rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group"
    >
      {preview.image && (
        <div className="relative h-40 w-full overflow-hidden">
          <Image
            src={preview.image}
            alt={preview.title || "Preview"}
            width={800}
            height={400}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        </div>
      )}
      <div className="p-3">
        {preview.title && (
          <div className="text-sm font-semibold text-white/90 mb-1 line-clamp-2">
            {preview.title}
          </div>
        )}
        {preview.description && (
          <div className="text-xs text-white/60 line-clamp-2 mb-2">
            {preview.description}
          </div>
        )}
        <div className="text-[10px] text-cyan-400/60 truncate">
          {new URL(url).hostname}
        </div>
      </div>
    </motion.a>
  );
}

