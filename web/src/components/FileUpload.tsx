"use client";

import React, { useCallback, useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  maxSize?: number; // in bytes
  acceptedTypes?: string[];
  multiple?: boolean;
}

export function FileUpload({
  onFilesSelected,
  maxSize = 10 * 1024 * 1024, // 10MB default
  multiple = true,
}: FileUploadProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRefAll = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const validateFile = (file: File): string | null => {
    // Only allow images
    if (!file.type.startsWith("image/")) {
      return "تتوفر قريبا"; // Coming soon for non-image files
    }
    if (file.size > maxSize) {
      return `File "${file.name}" exceeds maximum size of ${(maxSize / 1024 / 1024).toFixed(1)}MB`;
    }
    return null;
  };

  const processFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const fileArray = Array.from(files);
      const validFiles: File[] = [];

      fileArray.forEach((file) => {
        const error = validateFile(file);
        if (error) {
          if (error === "تتوفر قريبا") {
            alert("تتوفر قريبا"); // Coming soon message
          } else {
            alert(error);
          }
          return;
        }

        validFiles.push(file);
      });

      if (validFiles.length > 0) {
        onFilesSelected(validFiles);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onFilesSelected]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      processFiles(e.target.files);
      // Reset input to allow selecting same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [processFiles]
  );

  // Set portal container
  useEffect(() => {
    setPortalContainer(document.body);
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setMenuOpen(false);
    };

    const timer = setTimeout(() => {
      document.addEventListener("click", handleClick);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handleClick);
    };
  }, [menuOpen]);

  // Calculate menu position
  const getMenuPosition = useCallback(() => {
    if (!buttonRef.current) return { top: 100, left: 20 };
    const rect = buttonRef.current.getBoundingClientRect();
    return {
      top: rect.bottom + 4,
      left: rect.left,
    };
  }, []);

  const handleUploadImages = () => {
    fileInputRef.current?.click();
    setMenuOpen(false);
  };

  const handleUploadFile = () => {
    alert("سيتوفر قريبا"); // Coming soon
    setMenuOpen(false);
  };

  const pos = getMenuPosition();

  return (
    <div className="relative">
      {/* Emoji Upload Button - Enhanced design to match control hub */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setMenuOpen((prev) => !prev)}
        className="flex items-center justify-center w-8 h-8 rounded-lg border border-white/10 bg-white/5 text-lg transition-all hover:bg-white/10 hover:border-cyan-400/30 hover:shadow-[0_0_15px_rgba(34,211,238,0.3)] group"
        aria-label="Upload files"
        title="Upload files (images only)"
      >
        <span className="group-hover:scale-110 transition-transform">📎</span>
      </button>

      {/* Hidden Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple={multiple}
        accept="image/*"
        onChange={handleFileInput}
        className="hidden"
      />
      <input
        ref={fileInputRefAll}
        type="file"
        multiple={multiple}
        onChange={(e) => {
          if (e.target.files) {
            alert("سيتوفر قريبا"); // Coming soon
          }
        }}
        className="hidden"
      />

      {/* Upload Menu */}
      {portalContainer && createPortal(
        <AnimatePresence>
          {menuOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[999998]"
                onClick={() => setMenuOpen(false)}
                aria-hidden="true"
              />
              {/* Menu */}
              <motion.div
                ref={menuRef}
                initial={{ opacity: 0, y: -5, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -5, scale: 0.95 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="fixed z-[999999] w-48 rounded-xl border border-white/20 bg-black/90 backdrop-blur-2xl shadow-2xl shadow-black/50 overflow-hidden"
                style={{
                  top: `${pos.top}px`,
                  left: `${pos.left}px`,
                }}
              >
                <button
                  onClick={handleUploadImages}
                  className="w-full px-4 py-2.5 text-left text-sm text-white/90 hover:bg-white/10 transition-colors flex items-center gap-2"
                >
                  <span>🖼️</span>
                  <span>Upload Images</span>
                </button>
                <button
                  onClick={handleUploadFile}
                  className="w-full px-4 py-2.5 text-left text-sm text-white/50 hover:bg-white/5 transition-colors flex items-center gap-2 border-t border-white/10"
                  disabled
                >
                  <span>📄</span>
                  <span className="flex-1">Upload File</span>
                  <span className="text-[10px] text-white/30">قريبا</span>
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        portalContainer
      )}
    </div>
  );
}
