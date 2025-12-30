/**
 * NEXUS PRO V8 - Search Functionality
 * Full-text search across chat history
 */

import type { ChatSession, ChatMessage } from "@/types/chat";

export type SearchResult = {
  sessionId: string;
  sessionTitle: string;
  snippet: string;
  matchScore: number;
  timestamp: number;
} & (
  | { type: "message"; messageId: string; message: ChatMessage }
  | { type: "summary" }
);

export interface SearchOptions {
  query: string;
  sessions?: Record<string, ChatSession>;
  sessionId?: string; // Search in specific session only
  limit?: number;
  fuzzy?: boolean;
}

/**
 * Simple fuzzy match - checks if query is similar to text
 */
function fuzzyMatch(query: string, text: string): boolean {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  
  // Exact match
  if (textLower.includes(queryLower)) return true;
  
  // Fuzzy: check if all query characters appear in order
  let queryIndex = 0;
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      queryIndex++;
    }
  }
  
  return queryIndex === queryLower.length;
}

/**
 * Extract snippet around match
 */
function extractSnippet(text: string, query: string, contextLength = 50): string {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  const matchIndex = textLower.indexOf(queryLower);
  
  if (matchIndex === -1) {
    return text.substring(0, contextLength * 2) + (text.length > contextLength * 2 ? "..." : "");
  }
  
  const start = Math.max(0, matchIndex - contextLength);
  const end = Math.min(text.length, matchIndex + query.length + contextLength);
  
  let snippet = text.substring(start, end);
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";
  
  return snippet;
}

/**
 * Calculate match score (higher = better match)
 */
function calculateScore(text: string, query: string): number {
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  
  // Exact match gets highest score
  if (textLower === queryLower) return 100;
  
  // Starts with query
  if (textLower.startsWith(queryLower)) return 80;
  
  // Contains query
  if (textLower.includes(queryLower)) return 60;
  
  // Fuzzy match
  if (fuzzyMatch(query, text)) return 40;
  
  // Word matches
  const queryWords = queryLower.split(/\s+/);
  const textWords = textLower.split(/\s+/);
  let wordMatches = 0;
  for (const qWord of queryWords) {
    if (textWords.some((tWord) => tWord.includes(qWord) || qWord.includes(tWord))) {
      wordMatches++;
    }
  }
  
  return (wordMatches / queryWords.length) * 30;
}

/**
 * Search across all sessions
 */
export function searchChatHistory(options: SearchOptions): SearchResult[] {
  const { query, sessions = {}, sessionId, limit = 50, fuzzy = true } = options;
  
  if (!query.trim()) return [];
  
  const results: SearchResult[] = [];
  const sessionsToSearch = sessionId
    ? { [sessionId]: sessions[sessionId] }
    : sessions;
  
  for (const [sid, session] of Object.entries(sessionsToSearch)) {
    if (!session) continue;
    
    // Search messages
    for (const message of session.messages) {
      // Skip deleted messages
      if (message.meta?.isDeleted) continue;
      
      const content = message.content.toLowerCase();
      const queryLower = query.toLowerCase();
      
      let matches = false;
      if (fuzzy) {
        matches = fuzzyMatch(query, message.content);
      } else {
        matches = content.includes(queryLower);
      }
      
      if (matches) {
        const score = calculateScore(message.content, query);
        const snippet = extractSnippet(message.content, query);
        
        results.push({
          sessionId: sid,
          sessionTitle: session.title,
          type: "message",
          messageId: message.id,
          message,
          snippet,
          matchScore: score,
          timestamp: message.createdAt
        });
      }
    }

    // Search summary
    if (session.summary) {
      try {
        const summaryData = JSON.parse(session.summary);
        // Concatenate all text to search
        const summaryText = [
            summaryData.quickLook, 
            ...(summaryData.keyTopics || []), 
            ...(summaryData.actionItems || []), 
            ...(summaryData.userPreferences || []), 
            summaryData.fullSummary
        ].join(" ");

        let matches = false;
        if (fuzzy) {
          matches = fuzzyMatch(query, summaryText);
        } else {
          matches = summaryText.toLowerCase().includes(query.toLowerCase());
        }

        if (matches) {
          const score = calculateScore(summaryText, query);
          const snippet = extractSnippet(summaryText, query);
          
          results.push({
            sessionId: sid,
            sessionTitle: session.title,
            type: "summary",
            snippet,
            matchScore: score,
            timestamp: session.updatedAt
          });
        }
      } catch {}
    }
  }
  
  // Sort by score (highest first)
  results.sort((a, b) => b.matchScore - a.matchScore);
  
  // Limit results
  return results.slice(0, limit);
}

/**
 * Highlight search terms in text
 */
export function highlightSearchTerms(text: string, query: string): string {
  if (!query.trim()) return text;
  
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  return text.replace(regex, '<mark class="bg-cyan-500/30 text-cyan-200">$1</mark>');
}

