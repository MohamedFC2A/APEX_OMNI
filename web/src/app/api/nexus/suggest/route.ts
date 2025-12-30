import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
});

interface SuggestRequest {
  input: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  lang?: "ar" | "en";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SuggestRequest;
    const { input, history = [], lang = "en" } = body;

    if (!input || typeof input !== "string" || input.trim().length === 0) {
      return NextResponse.json({ suggestions: [] }, { status: 200 });
    }

    // Extract last word/phrase from input (for contextual suggestions)
    const extractLastPhrase = (text: string): string => {
      const trimmed = text.trim();
      if (!trimmed) return "";
      
      // Try to extract last meaningful phrase (last 2-5 words)
      const words = trimmed.split(/\s+/);
      if (words.length <= 2) return trimmed;
      
      // Take last 2-4 words as context
      const phraseLength = Math.min(4, Math.max(2, Math.floor(words.length * 0.4)));
      return words.slice(-phraseLength).join(" ");
    };

    const lastPhrase = extractLastPhrase(input);
    
    // Build context from history (last 3 messages)
    const recentHistory = history.slice(-3);
    const contextText = recentHistory
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    const prompt = lang === "ar"
      ? `أنت مساعد ذكي. المستخدم يكتب الآن: "${input}"

المهمة: اقترح 3 اقتراحات سؤالية تبدأ بنفس الكلمات الأخيرة التي كتبها المستخدم ("${lastPhrase}") لإكمال سؤاله.

المحادثة السابقة:
${contextText || "لا توجد محادثة سابقة"}

مثال: إذا كتب المستخدم "من الأفضل..." يجب أن تكون الاقتراحات:
- من الأفضل في كرة القدم؟
- من الأفضل في السباحة؟
- من الأفضل في صناعة الأفلام؟

قدم 3 اقتراحات فقط، كل واحدة تبدأ بـ "${lastPhrase}" وتكون سؤالية، كل واحدة في سطر منفصل، بدون ترقيم أو رموز.`
      : `You are a smart assistant. The user is currently typing: "${input}"

Task: Suggest 3 question-like suggestions that start with the same last words the user typed ("${lastPhrase}") to help complete their question.

Previous conversation:
${contextText || "No previous conversation"}

Example: If user typed "What is the best..." suggestions should be:
- What is the best in football?
- What is the best in swimming?
- What is the best in filmmaking?

Provide exactly 3 suggestions, each starting with "${lastPhrase}" and being question-like, each on a separate line, without numbering or symbols.`;

    const response = await openrouter.chat.completions.create({
      model: process.env.NEXUS_MODEL_FLASH || "",
      messages: [
        {
          role: "system",
          content: lang === "ar"
            ? "أنت مساعد ذكي تقترح اقتراحات مفيدة للمستخدمين بناءً على ما يكتبونه."
            : "You are a smart assistant that suggests helpful suggestions to users based on what they are typing.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 120,
    });

    const content = response.choices[0]?.message?.content || "";
    
    // Parse suggestions (split by newlines, filter empty, take first 3)
    let suggestions = content
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.match(/^[\d\-•\*\.]/)) // Remove numbered/bulleted items
      .slice(0, 3);

    // Ensure suggestions start with lastPhrase (if available)
    if (lastPhrase && suggestions.length > 0) {
      suggestions = suggestions.map(s => {
        // If suggestion doesn't start with lastPhrase, prepend it
        const lowerS = s.toLowerCase();
        const lowerPhrase = lastPhrase.toLowerCase();
        if (!lowerS.startsWith(lowerPhrase)) {
          // Try to find where lastPhrase appears and use it as prefix
          const phraseIndex = lowerS.indexOf(lowerPhrase);
          if (phraseIndex >= 0) {
            return s.substring(phraseIndex);
          }
          return `${lastPhrase} ${s}`;
        }
        return s;
      });
    }

    // If we don't have 3, pad with contextual suggestions
    while (suggestions.length < 3) {
      if (lastPhrase) {
        if (lang === "ar") {
          suggestions.push(`${lastPhrase} في ماذا؟`);
        } else {
          suggestions.push(`${lastPhrase} in what?`);
        }
      } else {
        if (lang === "ar") {
          suggestions.push("أخبرني المزيد عن هذا");
        } else {
          suggestions.push("Tell me more about this");
        }
      }
    }

    return NextResponse.json({ suggestions: suggestions.slice(0, 3) });
  } catch (error) {
    console.error("[suggest] Error:", error);
    // Return empty suggestions on error (non-blocking)
    return NextResponse.json({ suggestions: [] }, { status: 200 });
  }
}

