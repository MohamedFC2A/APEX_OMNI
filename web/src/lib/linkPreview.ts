/**
 * NEXUS PRO V8 - Link Preview Utilities
 * Extract URLs from text and generate previews
 */

/**
 * Extract URLs from text
 */
export function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex);
  return matches || [];
}

/**
 * Check if text contains URLs
 */
export function hasUrls(text: string): boolean {
  return extractUrls(text).length > 0;
}

