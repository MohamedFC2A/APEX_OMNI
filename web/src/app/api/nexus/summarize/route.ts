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

interface SummaryData {
  quickLook: string;
  keyTopics: string[];
  actionItems: string[];
  userPreferences: string[];
  fullSummary: string;
}

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json() as { messages: ChatMessage[] };

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

    // Use ONLY xiaomi/mimo-v2-flash:free for summarization
    if (modelId !== "xiaomi/mimo-v2-flash:free") {
      console.warn(`[summarize] Expected xiaomi/mimo-v2-flash:free, got ${modelId}. Using resolved model.`);
    }

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
      10000 // 10-second timeout to prevent hanging
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
    } catch (e) {
      console.error("[summarize] Failed to parse summary JSON:", e);
      // Fallback
      summaryData = {
        quickLook: "Summary available",
        keyTopics: [],
        actionItems: [],
        userPreferences: [],
        fullSummary: content,
      };
    }

    return NextResponse.json(summaryData);
  } catch (error) {
    console.error("[summarize] Error:", error);
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    const isTimeout = errorMsg.includes("timeout") || errorMsg.toLowerCase().includes("timeout");
    
    const specificError = isTimeout
      ? "Summary generation timed out after 10 seconds. Please try again."
      : `Failed to generate summary: ${errorMsg}`;
    
    return NextResponse.json(
      { error: specificError },
      { status: 500 }
    );
  }
}

