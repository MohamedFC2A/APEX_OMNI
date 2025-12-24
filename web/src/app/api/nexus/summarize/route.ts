import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// Initialize OpenRouter client for Gemini 2.0 Flash Experimental
const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
});

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface SummaryResponse {
  quickLook: string;
  keyTopics: string[];
  actionItems: string[];
  userPreferences: string[];
  fullSummary: string;
}

/**
 * Generate a comprehensive summary of a conversation using Gemini 2.0 Flash Experimental
 */
export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json() as { messages: ChatMessage[] };

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Messages array is required" }, { status: 400 });
    }

    const conversationText = messages
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");

    const prompt = `Analyze the following conversation and provide a comprehensive summary in JSON format. Use Gemini 2.0's 1M context window to analyze the entire history perfectly.

Your response MUST be valid JSON with this exact structure:
{
  "quickLook": "A 2-3 sentence overview of the conversation",
  "keyTopics": ["Topic 1", "Topic 2", "Topic 3"],
  "actionItems": ["Action item 1", "Action item 2"],
  "userPreferences": ["Preference 1", "Preference 2"],
  "fullSummary": "A detailed summary highlighting key topics, action items, and user preferences"
}

Focus on:
- Key Topics: Main subjects discussed
- Action Items: Tasks, decisions, or next steps mentioned
- User Preferences: Stated preferences, requirements, or constraints
- Full Summary: Deep analysis, not just a recap

Conversation:
${conversationText}

Provide the JSON response:`;

    const response = await openrouter.chat.completions.create({
      model: "google/gemini-2.0-flash-exp:free",
      messages: [
        {
          role: "system",
          content: "You are an expert conversation analyst. You analyze conversations and provide structured summaries in JSON format. Always respond with valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content || "{}";
    let summaryData: SummaryResponse;
    
    try {
      summaryData = JSON.parse(content) as SummaryResponse;
    } catch (parseError) {
      // Fallback if JSON parsing fails
      summaryData = {
        quickLook: content.substring(0, 200),
        keyTopics: [],
        actionItems: [],
        userPreferences: [],
        fullSummary: content,
      };
    }

    return NextResponse.json(summaryData);
  } catch (error) {
    console.error("[summarize] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate summary" },
      { status: 500 }
    );
  }
}

