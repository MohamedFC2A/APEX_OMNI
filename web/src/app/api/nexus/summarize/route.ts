import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
});

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

import { resolveModelId } from "@/lib/modelRegistry";

// Retry configuration for FLASH-powered summarization
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;
const SUMMARY_TIMEOUT_MS = 10000;

// User-facing error message
const FALLBACK_ERROR_MESSAGE = "AI failed to generate response. Please try again.";

/**
 * Timeout wrapper for promises
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface SummaryData {
  quickLook: string;
  keyTopics: string[];
  actionItems: string[];
  userPreferences: string[];
  fullSummary: string;
}

/**
 * Attempt to generate summary with the FLASH model
 */
async function attemptSummaryGeneration(
  modelId: string,
  isArabic: boolean,
  prompt: string
): Promise<SummaryData> {
  const response = await withTimeout(
    openrouter.chat.completions.create({
      model: modelId,
      messages: [
        {
          role: "system",
          content: isArabic
            ? "أنت خبير في تلخيص المحادثات واستخراج المعلومات بتنسيق JSON."
            : "You are an expert in summarizing conversations and extracting information in JSON format.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: "json_object" },
    }),
    SUMMARY_TIMEOUT_MS
  );

  const content = response.choices?.[0]?.message?.content?.trim() || "{}";

  // Null safety check
  if (!content || typeof content !== "string" || content.length === 0) {
    throw new Error("Summary generation returned empty content");
  }

  let summaryData: SummaryData;

  try {
    summaryData = JSON.parse(content);

    // Validate required fields
    if (!summaryData.quickLook || typeof summaryData.quickLook !== "string") {
      summaryData.quickLook = "Summary available";
    }
    if (!Array.isArray(summaryData.keyTopics)) {
      summaryData.keyTopics = [];
    }
    if (!Array.isArray(summaryData.actionItems)) {
      summaryData.actionItems = [];
    }
    if (!Array.isArray(summaryData.userPreferences)) {
      summaryData.userPreferences = [];
    }
    if (!summaryData.fullSummary || typeof summaryData.fullSummary !== "string") {
      summaryData.fullSummary = content;
    }
  } catch {
    console.error("[summarize] Failed to parse summary JSON");
    // Fallback structure
    summaryData = {
      quickLook: "Summary available",
      keyTopics: [],
      actionItems: [],
      userPreferences: [],
      fullSummary: content,
    };
  }

  return summaryData;
}

export async function POST(request: NextRequest) {
  try {
    const { messages } = (await request.json()) as { messages: ChatMessage[] };

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Messages array is required" }, { status: 400 });
    }

    const conversationText = messages
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");

    const hasArabic = /[\u0600-\u06FF]/.test(conversationText);
    const isArabic = hasArabic;

    const prompt = isArabic
      ? `قم بتحليل المحادثة واستخرج ملخصاً شاملاً بتنسيق JSON يحتوي على الحقول التالية:
{
  "quickLook": "ملخص سريع جداً في جملة واحدة",
  "keyTopics": ["موضوع 1", "موضوع 2"],
  "actionItems": ["مهمة 1", "مهمة 2"],
  "userPreferences": ["تفضيل 1", "تفضيل 2"],
  "fullSummary": "ملخص كامل ومفصل للمحادثة"
}
تأكد من أن المخرجات هي JSON صالح فقط بدون أي نصوص إضافية.

المحادثة:
${conversationText}`
      : `Analyze the conversation and extract a comprehensive summary in JSON format with the following fields:
{
  "quickLook": "Very quick one-sentence summary",
  "keyTopics": ["Topic 1", "Topic 2"],
  "actionItems": ["Action 1", "Action 2"],
  "userPreferences": ["Pref 1", "Pref 2"],
  "fullSummary": "Detailed full summary of the conversation"
}
Ensure the output is valid JSON only without any additional text.

Conversation:
${conversationText}`;

    const modelId = resolveModelId("NEXUS_FLASH_PRO");

    // Use ONLY NEXUS_FLASH_PRO (xiaomi/mimo-v2-flash:free) for summarization
    console.log(`[summarize] Using FLASH model: ${modelId}`);

    // Retry loop with exponential backoff
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const summaryData = await attemptSummaryGeneration(modelId, isArabic, prompt);
        return NextResponse.json(summaryData);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`[summarize] Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`, lastError.message);

        if (attempt < MAX_RETRIES) {
          // Wait before retrying with exponential backoff
          await sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
          continue;
        }
      }
    }

    // All retries exhausted
    console.error("[summarize] All retry attempts exhausted:", lastError?.message);
    const errorMsg = lastError?.message || "Unknown error";
    const isTimeout = errorMsg.toLowerCase().includes("timeout");

    return NextResponse.json(
      {
        error: isTimeout
          ? "Summary generation timed out. Please try again."
          : FALLBACK_ERROR_MESSAGE,
      },
      { status: 500 }
    );
  } catch (error) {
    console.error("[summarize] Unhandled error:", error);
    return NextResponse.json(
      { error: FALLBACK_ERROR_MESSAGE },
      { status: 500 }
    );
  }
}
