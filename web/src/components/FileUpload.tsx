"use client";

import React, { useCallback, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  maxSize?: number; // in bytes
  acceptedTypes?: string[];
  multiple?: boolean;
}

export function FileUpload({
  onFilesSelected,
  maxSize = 10 * 1024 * 1024, // 10MB default
  acceptedTypes = ["image/*"],
  multiple = true,
}: FileUploadProps) {
  const [previews, setPreviews] = useState<Array<{ file: File; preview: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const newPreviews: Array<{ file: File; preview: string }> = [];

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

        // Generate preview for images
        if (file.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const preview = e.target?.result as string;
            newPreviews.push({ file, preview });
            setPreviews((prev) => [...prev, ...newPreviews]);
          };
          reader.readAsDataURL(file);
        }
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

  const removePreview = useCallback((index: number) => {
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <div className="space-y-2">
      {/* Simple Upload Button */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white/70 transition-all hover:bg-white/10 hover:border-cyan-400/30 hover:text-cyan-300"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <span>Upload Images</span>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        multiple={multiple}
        accept={acceptedTypes.join(",")}
        onChange={handleFileInput}
        className="hidden"
      />

      {/* Image Previews */}
      <AnimatePresence>
        {previews.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {previews.map((preview, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative group"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview.preview}
                  alt={preview.file.name}
                  className="w-full h-20 object-cover rounded-lg border border-white/10"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removePreview(index);
                  }}
                  className="absolute top-1 right-1 p-1 bg-red-500/80 hover:bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
