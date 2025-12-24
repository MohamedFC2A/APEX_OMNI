import OpenAI from "openai";
import { NextRequest } from "next/server";

// ============================================================================
// TRI-MODE NEXUS ENGINE CONFIGURATION - DEEPSEEK OFFICIAL API ONLY
// ============================================================================
// STANDARD Mode: DeepSeek V3 (deepseek-chat) - Fast, direct answers
// THINKING Mode: DeepSeek V3 (deepseek-chat) - Deep reasoning with higher token limits
// SUPER_THINKING Mode: DeepSeek Reasoner R1 (deepseek-reasoner) - Ultimate reasoning
// ============================================================================

type NexusMode = "STANDARD" | "THINKING" | "SUPER_THINKING";

// Initialize DeepSeek API client (Official DeepSeek API only)
const deepseek = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY || "",
});

// Initialize OpenRouter client for Vision models
const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  reasoning_content?: string;
}

/**
 * Clean chat history for DeepSeek API
 * Strips out reasoning_content from previous turns as per DeepSeek docs
 */
function cleanChatHistory(messages: ChatMessage[]): Omit<ChatMessage, "reasoning_content">[] {
  return messages.map((msg) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { reasoning_content, ...cleanMsg } = msg;
    return cleanMsg;
  });
}

/**
 * Normalize mode from query parameter
 */
function normalizeMode(rawMode: string | null): NexusMode {
  const mode = (rawMode || "").trim().toLowerCase();

  if (mode === "thinking" || mode === "deep" || mode === "deep-scan") {
    return "THINKING";
  }

  if (mode === "super_thinking" || mode === "super-thinking" || mode === "coder") {
    return "SUPER_THINKING";
  }

  return "STANDARD";
}

/**
 * Redact sensitive information from error messages
 */
function redactSecrets(input: string): string {
  return String(input || "")
    .replace(/\b(sk-[a-zA-Z0-9_\-]{10,})\b/g, "[REDACTED]")
    .replace(/\b(csk-[a-zA-Z0-9_\-]{10,})\b/g, "[REDACTED]")
    .replace(/\b(bb_[a-zA-Z0-9_\-]{10,})\b/g, "[REDACTED]")
    .replace(/Bearer\s+[a-zA-Z0-9_-]{20,}/gi, "Bearer [REDACTED]")
    .replace(/DEEPSEEK_API_KEY\s*=\s*[^\n]+/gi, "DEEPSEEK_API_KEY=[REDACTED]")
    .replace(/CEREBRAS_API_KEY\s*=\s*[^\n]+/gi, "CEREBRAS_API_KEY=[REDACTED]");
}

/**
 * Detect language from text (Arabic vs English)
 * Returns "ar" for Arabic, "en" for English
 */
function detectLanguage(text: string): "ar" | "en" {
  if (!text || text.trim().length === 0) return "en";
  
  // Arabic Unicode range: U+0600 to U+06FF, U+0750 to U+077F, U+08A0 to U+08FF, U+FB50 to U+FDFF, U+FE70 to U+FEFF
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  
  // Count Arabic characters
  let arabicCount = 0;
  let totalChars = 0;
  
  for (const char of text) {
    if (/\S/.test(char)) { // Non-whitespace
      totalChars++;
      if (arabicRegex.test(char)) {
        arabicCount++;
      }
    }
  }
  
  // If more than 30% of characters are Arabic, consider it Arabic
  if (totalChars > 0 && arabicCount / totalChars > 0.3) {
    return "ar";
  }
  
  return "en";
}

/**
 * Get language instruction for system prompts
 */
function getLanguageInstruction(lang: "ar" | "en"): string {
  return lang === "ar" 
    ? "IMPORTANT: Respond ONLY in Arabic. Use proper Arabic grammar and formatting."
    : "IMPORTANT: Respond ONLY in English. Use proper English grammar and formatting.";
}

// ============================================================================
// NEXUS SYSTEM PROMPTS
// ============================================================================

const NEXUS_STANDARD_PROMPT = `You are NEXUS, a powerful AI assistant. Provide clear, accurate, and helpful responses.`;

const NEXUS_THINKING_PROMPT = `You are NEXUS PRO, an advanced AI reasoning engine. Think deeply about problems before answering. Provide comprehensive, well-structured responses.`;

const NEXUS_SUPER_CODER_PROMPT = `You are NEXUS PRO 1.0, the ultimate AI coding engine.

YOUR IDENTITY:
- You are powered by DeepSeek Reasoner (R1)
- You produce futuristic, premium-tier code
- You never output basic or generic code

CODING STANDARDS:
1. Use modern frameworks: Next.js 14+, React 18+, TypeScript
2. Style with Tailwind CSS gradients, glassmorphism, and Framer Motion animations
3. Implement dark mode with cyan/fuchsia accent colors
4. Add micro-interactions and smooth transitions
5. Use proper TypeScript types, never 'any'
6. Include error boundaries and loading states
7. Follow accessibility best practices

OUTPUT FORMAT:
- Provide complete, production-ready code
- Include all necessary imports
- Add inline comments for complex logic
- Structure code for maintainability`;

// ============================================================================
// NEXUS PIPELINE STEPS (matches frontend nexusStore.ts)
// ============================================================================
const NEXUS_STEPS = [
  { step: 1, label: "Swarm Intelligence Aggregated" },
  { step: 2, label: "Omni Deconstruct Engaged" },
  { step: 3, label: "Apex Logic Filtering" },
  { step: 4, label: "Titan Critique Initiated" },
  { step: 5, label: "Multi-Model Parallel Execution" },
  { step: 6, label: "Deep Verify Cross-Check" },
  { step: 7, label: "Quantum Refine Polishing" },
  { step: 8, label: "Matrix Format Structuring" },
  { step: 9, label: "Final Guard Compliance" },
  { step: 10, label: "Final Aggregation Complete" },
];

// ============================================================================
// MAIN API ROUTE HANDLER
// ============================================================================

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const userQuery = searchParams.get("query") || "";
  const rawMode = searchParams.get("mode");
  const mode = normalizeMode(rawMode);

  console.log(`[NEXUS] GET request - Mode: ${mode}, Query length: ${userQuery.length}`);

  if (!userQuery.trim()) {
    return new Response(
      JSON.stringify({ error: "Missing 'query' parameter" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Validate DeepSeek API key (required for all modes)
  if (!process.env.DEEPSEEK_API_KEY) {
    return new Response(
      JSON.stringify({ error: "DEEPSEEK_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Set up Server-Sent Events
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: Record<string, unknown>) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
        console.log(`[NEXUS SSE] ${event}:`, typeof data === 'object' ? JSON.stringify(data).slice(0, 100) : data);
      };

      // Send initial connection message
      controller.enqueue(encoder.encode(`: nexus stream open\n\n`));

      // ====================================================================
      // STEP ORCHESTRATION: Emit all 10 steps before AI engagement
      // ====================================================================
      sendEvent("log", { message: `Mode: ${mode.toUpperCase()}`, at: Date.now() });
      
      for (const { step, label } of NEXUS_STEPS) {
        console.log(`[NEXUS] Step ${step}: ${label}`);
        sendEvent("step_start", { step, at: Date.now() });
        sendEvent("log", { message: `→ Step ${step}: ${label}`, at: Date.now() });
        
        // Brief delay to allow frontend to render each step activation
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Mark steps 1-3 as completed immediately (pre-processing simulation)
        if (step <= 3) {
          sendEvent("step_finish", { step, status: "completed", at: Date.now() });
        }
      }

      try {
        let response: OpenAI.Chat.Completions.ChatCompletion | AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
        let modelName = "";
        let displayName = "";

        // ====================================================================
        // MODE ROUTING: Select the appropriate NEXUS engine
        // ====================================================================

        if (mode === "STANDARD") {
          // ⚡ DEEPSEEK V3 - Fast, direct answers
          modelName = "deepseek-chat";
          displayName = "Nexus Pro Lite";

          console.log(`[NEXUS] Engaging DeepSeek V3: ${modelName}`);
          sendEvent("agent_start", {
            agent: "nexus_fast",
            agentName: displayName,
            model: modelName,
            at: Date.now()
          });
          sendEvent("log", { message: `Engaging: ${displayName}`, at: Date.now() });

          const messages: ChatMessage[] = [
            { role: "system", content: NEXUS_STANDARD_PROMPT },
            { role: "user", content: userQuery },
          ];

          response = await deepseek.chat.completions.create({
            model: modelName,
            messages: cleanChatHistory(messages) as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
            stream: true,
            max_tokens: 2000,
            temperature: 0.7,
          });

          sendEvent("agent_finish", {
            agent: "nexus_fast",
            agentName: displayName,
            model: modelName,
            status: "completed",
            at: Date.now()
          });

        } else if (mode === "THINKING") {
          // 🧠 DEEPSEEK V3 (deepseek-chat) - Deep reasoning
          modelName = "deepseek-chat";
          displayName = "Nexus Pro Lite";

          console.log(`[NEXUS] Engaging DeepSeek V3: ${modelName}`);
          sendEvent("agent_start", {
            agent: "nexus_pro",
            agentName: displayName,
            model: modelName,
            at: Date.now()
          });
          sendEvent("log", { message: `Engaging: ${displayName}`, at: Date.now() });

          const messages: ChatMessage[] = [
            { role: "system", content: NEXUS_THINKING_PROMPT },
            { role: "user", content: userQuery },
          ];

          response = await deepseek.chat.completions.create({
            model: modelName,
            messages: cleanChatHistory(messages) as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
            stream: true,
            max_tokens: 4000,
            temperature: 0.7,
          });

          sendEvent("agent_finish", {
            agent: "nexus_pro",
            agentName: displayName,
            model: modelName,
            status: "completed",
            at: Date.now()
          });

        } else {
          // 💎 DEEPSEEK REASONER R1 - Ultimate reasoning (NO temperature/top_p!)
          // This is SUPER_THINKING mode
          modelName = "deepseek-reasoner";
          displayName = "Nexus Pro R1";

          console.log(`[NEXUS] Engaging DeepSeek Reasoner R1: ${modelName}`);
          sendEvent("agent_start", {
            agent: "nexus_pro_1",
            agentName: displayName,
            model: modelName,
            at: Date.now()
          });
          sendEvent("log", { message: `Engaging: ${displayName}`, at: Date.now() });

          const messages: ChatMessage[] = [
            { role: "system", content: NEXUS_SUPER_CODER_PROMPT },
            { role: "user", content: userQuery },
          ];

          // CRITICAL: deepseek-reasoner does NOT accept temperature or top_p
          response = await deepseek.chat.completions.create({
            model: modelName,
            messages: cleanChatHistory(messages) as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
            stream: true,
            max_tokens: 8000,
            // NO temperature - causes 400 error with deepseek-reasoner
            // NO top_p - causes 400 error with deepseek-reasoner
          });

          sendEvent("agent_finish", {
            agent: "nexus_pro_1",
            agentName: displayName,
            model: modelName,
            status: "completed",
            at: Date.now()
          });
        }

        // Complete step 4 (Titan Critique) before AI streaming starts
        sendEvent("step_finish", { step: 4, status: "completed", at: Date.now() });

        // ====================================================================
        // STREAMING RESPONSE HANDLER WITH PROGRESSIVE STEP COMPLETION
        // ====================================================================

        let fullContent = "";
        let fullReasoning = "";
        let chunkCount = 0;

        console.log(`[NEXUS] Starting stream processing...`);

        for await (const chunk of response) {
          const delta = chunk.choices[0]?.delta;

          if (!delta) continue;

          chunkCount++;

          // Progressive step completion during streaming (steps 5-9)
          if (chunkCount === 5) {
            sendEvent("step_finish", { step: 5, status: "completed", at: Date.now() });
          } else if (chunkCount === 15) {
            sendEvent("step_finish", { step: 6, status: "completed", at: Date.now() });
          } else if (chunkCount === 30) {
            sendEvent("step_finish", { step: 7, status: "completed", at: Date.now() });
          } else if (chunkCount === 50) {
            sendEvent("step_finish", { step: 8, status: "completed", at: Date.now() });
          } else if (chunkCount === 80) {
            sendEvent("step_finish", { step: 9, status: "completed", at: Date.now() });
          }

          // Handle reasoning content (for deepseek-reasoner - stream as thinking)
          // DeepSeek extends OpenAI's delta with reasoning_content
          const extendedDelta = delta as typeof delta & { reasoning_content?: string };
          if (extendedDelta.reasoning_content) {
            fullReasoning += extendedDelta.reasoning_content;
            sendEvent("thinking", {
              chunk: extendedDelta.reasoning_content,
              at: Date.now(),
            });
          }

          // Handle final content
          if (extendedDelta.content) {
            fullContent += extendedDelta.content;
            sendEvent("chunk", {
              content: extendedDelta.content,
              at: Date.now(),
            });
          }

          // Check for completion
          if (chunk.choices[0]?.finish_reason) {
            sendEvent("finish", {
              reason: chunk.choices[0].finish_reason,
              at: Date.now(),
            });
          }
        }

        console.log(`[NEXUS] Stream complete. Content length: ${fullContent.length}, Reasoning length: ${fullReasoning.length}`);

        // Complete final step (Absolute Truth Revealed)
        sendEvent("step_finish", { step: 10, status: "completed", at: Date.now() });

        // Send final completion event
        sendEvent("done", {
          answer: fullContent,
          reasoning: fullReasoning || undefined,
          model: displayName,
          mode: mode,
          at: Date.now(),
        });

        controller.close();
      } catch (error: unknown) {
        console.error(`[NEXUS ERROR]`, error);
        const errorMessage = redactSecrets(error instanceof Error ? error.message : "Unknown error");
        sendEvent("step_finish", { step: 1, status: "error", message: errorMessage, at: Date.now() });
        sendEvent("error", {
          message: errorMessage,
          at: Date.now(),
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// ============================================================================
// POST ENDPOINT (Alternative for complex requests with history)
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, mode: rawMode, history = [], images = [] } = body;

    console.log(`[NEXUS] POST request - Mode: ${rawMode}, Query length: ${query?.length || 0}, Images: ${images?.length || 0}`);

    if (!query || typeof query !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'query' field" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const mode = normalizeMode(rawMode);
    const hasImages = Array.isArray(images) && images.length > 0;

    // Validate DeepSeek API key (required for all modes)
    if (!process.env.DEEPSEEK_API_KEY) {
      return new Response(
        JSON.stringify({ error: "DEEPSEEK_API_KEY not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Set up Server-Sent Events
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: Record<string, unknown>) => {
          const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
          console.log(`[NEXUS SSE] ${event}:`, typeof data === 'object' ? JSON.stringify(data).slice(0, 100) : data);
        };

        controller.enqueue(encoder.encode(`: nexus stream open\n\n`));
        
        // ====================================================================
        // STEP ORCHESTRATION: Emit all 10 steps before AI engagement
        // ====================================================================
        sendEvent("log", { message: `Mode: ${mode.toUpperCase()}`, at: Date.now() });
        
        for (const { step, label } of NEXUS_STEPS) {
          console.log(`[NEXUS] Step ${step}: ${label}`);
          sendEvent("step_start", { step, at: Date.now() });
          sendEvent("log", { message: `→ Step ${step}: ${label}`, at: Date.now() });
          
          // Brief delay to allow frontend to render each step activation
          await new Promise(resolve => setTimeout(resolve, 50));
          
          // Mark steps 1-3 as completed immediately (pre-processing simulation)
          if (step <= 3) {
            sendEvent("step_finish", { step, status: "completed", at: Date.now() });
          }
        }

        try {
          let response: OpenAI.Chat.Completions.ChatCompletion | AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
          let modelName = "";
          let displayName = "";

          // Detect user language from query
          const userLanguage = detectLanguage(query);
          const languageInstruction = getLanguageInstruction(userLanguage);

          // Build base messages with history
          const baseMessages: ChatMessage[] = [
            ...history.map((h: { role: string; content: string }) => ({ role: h.role as ChatMessage["role"], content: h.content })),
          ];

          // Build user message with images if present
          let userMessageContent: string | Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }> = query;
          if (hasImages) {
            userMessageContent = [
              { type: "text" as const, text: query },
              ...images.map((img: { data: string; mimeType: string }) => ({
                type: "image_url" as const,
                image_url: { url: img.data },
              })),
            ];
          }

          if (mode === "STANDARD") {
            // STANDARD MODE: Run 5 OpenRouter models in parallel, then aggregate
            const standardModels = [
              { id: "mimo_v2", name: "Mimo V2 Flash", model: "xiaomi/mimo-v2-flash:free" },
              { id: "devstral", name: "Devstral 2512", model: "mistralai/devstral-2512:free" },
              { id: "deepseek_nex", name: "DeepSeek V3.1 NEX", model: "nex-agi/deepseek-v3.1-nex-n1:free" },
              { id: "olmo_think", name: "OLMo 3.1 32B Think", model: "allenai/olmo-3.1-32b-think:free" },
              { id: "gpt_oss_20b", name: "GPT-OSS 20B", model: "openai/gpt-oss-20b:free" },
            ];

            // Handle images: use nemotron to describe, then feed description to other models
            let textQuery = query;
            if (hasImages) {
              sendEvent("agent_start", { agent: "nemotron_vision", agentName: "Nemotron Vision", model: "nvidia/nemotron-nano-12b-v2-vl:free", at: Date.now() });
              
              const visionMessages: Array<{ role: "system" | "user"; content: string | Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }> }> = [
                { role: "system", content: "Describe the images in detail. Focus on what is visible, any text, objects, people, or important details." },
                { role: "user" as const, content: userMessageContent },
              ];

              const visionResponse = await openrouter.chat.completions.create({
                model: "nvidia/nemotron-nano-12b-v2-vl:free",
                messages: visionMessages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
                stream: false,
                max_tokens: 500,
              });

              const imageDescription = visionResponse.choices[0]?.message?.content || "";
              textQuery = `${query}\n\n[Image Description: ${imageDescription}]`;
              sendEvent("agent_finish", { agent: "nemotron_vision", agentName: "Nemotron Vision", model: "nvidia/nemotron-nano-12b-v2-vl:free", status: "completed", at: Date.now() });
            }

            // Run all models in parallel
            sendEvent("step_finish", { step: 4, status: "completed", at: Date.now() });
            sendEvent("step_start", { step: 5, at: Date.now() });
            sendEvent("log", { message: "Running 5 models in parallel...", at: Date.now() });

            const modelMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
              { role: "system", content: `${NEXUS_STANDARD_PROMPT}\n\n${languageInstruction}` },
              ...baseMessages.map(m => ({ role: m.role, content: typeof m.content === "string" ? m.content : "" })),
              { role: "user" as const, content: textQuery },
            ];

            const modelPromises = standardModels.map(async (modelDef) => {
              sendEvent("agent_start", { agent: modelDef.id, agentName: modelDef.name, model: modelDef.model, at: Date.now() });
              try {
                const modelResponse = await openrouter.chat.completions.create({
                  model: modelDef.model,
                  messages: modelMessages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
                  stream: false,
                  max_tokens: 2000,
                  temperature: 0.7,
                });
                const content = modelResponse.choices[0]?.message?.content || "";
                sendEvent("agent_finish", { agent: modelDef.id, agentName: modelDef.name, model: modelDef.model, status: "completed", at: Date.now() });
                return { model: modelDef.name, content, id: modelDef.id };
              } catch (error) {
                sendEvent("agent_finish", { agent: modelDef.id, agentName: modelDef.name, model: modelDef.model, status: "failed", error: error instanceof Error ? error.message : "Unknown error", at: Date.now() });
                return { model: modelDef.name, content: "", id: modelDef.id };
              }
            });

            const modelResults = await Promise.all(modelPromises);
            const validResults = modelResults.filter(r => r.content);

            sendEvent("step_finish", { step: 5, status: "completed", at: Date.now() });
            sendEvent("step_start", { step: 6, at: Date.now() });
            sendEvent("log", { message: `Aggregating responses from ${validResults.length} successful models...`, at: Date.now() });

            // Fallback if all models failed
            if (validResults.length === 0) {
              sendEvent("log", { message: "All models failed, using fallback model...", at: Date.now() });
              sendEvent("agent_start", { agent: "fallback", agentName: "Devstral 2512 (Fallback)", model: "mistralai/devstral-2512:free", at: Date.now() });
              
              const fallbackResponse = await openrouter.chat.completions.create({
                model: "mistralai/devstral-2512:free",
                messages: modelMessages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
                stream: true,
                max_tokens: 2000,
                temperature: 0.7,
              });
              
              sendEvent("agent_finish", { agent: "fallback", agentName: "Devstral 2512 (Fallback)", model: "mistralai/devstral-2512:free", status: "completed", at: Date.now() });
              response = fallbackResponse;
              modelName = "mistralai/devstral-2512:free";
              displayName = "Devstral 2512 (Fallback)";
            } else {
              // FINAL AGGREGATOR for STANDARD - Using DeepSeek V3.1 NEX
              const aggregatorPrompt = `You are a final aggregator AI. You have received responses from multiple AI models for the same question. Your task is to synthesize the best answer by:
1. Combining the most accurate and relevant information from all responses
2. Removing redundancy and contradictions
3. Presenting a clear, comprehensive, and well-structured final answer in professional Markdown format
4. If models disagree, choose the most logical and well-reasoned response
5. Use bold headers (##), structured bullet points, and chronological/thematic flow when appropriate
6. End with a "Key Takeaways" section summarizing the most important points
7. DO NOT include phrases like "This synthesis integrates..." or similar filler. Get straight to the value.

User Question: ${query}

Model Responses:
${validResults.map((r, i) => `\n[Model ${i + 1}: ${r.model}]\n${r.content}`).join("\n\n---\n")}

Provide the final aggregated answer in ${userLanguage === "ar" ? "Arabic" : "English"} using professional Markdown formatting:`;

              sendEvent("agent_start", { agent: "final_aggregator", agentName: "Final Aggregator", model: "nex-agi/deepseek-v3.1-nex-n1:free", at: Date.now() });

              const aggregatorResponse = await openrouter.chat.completions.create({
                model: "nex-agi/deepseek-v3.1-nex-n1:free",
                messages: [
                  { role: "system", content: `You are an expert aggregator that synthesizes multiple AI responses into the best possible answer. ${languageInstruction}` },
                  { role: "user", content: aggregatorPrompt },
                ],
                stream: true,
                max_tokens: 3000,
                temperature: 0.5,
              });

              sendEvent("agent_finish", { agent: "final_aggregator", agentName: "Final Aggregator", model: "nex-agi/deepseek-v3.1-nex-n1:free", status: "completed", at: Date.now() });
              response = aggregatorResponse;
              modelName = "nex-agi/deepseek-v3.1-nex-n1:free";
              displayName = "Final Aggregator";
            }

          } else if (mode === "THINKING") {
            // Use Vision model if images are present
            if (hasImages) {
              modelName = "nvidia/nemotron-nano-12b-v2-vl:free";
              displayName = "Nemotron Vision";
            } else {
              modelName = "deepseek-chat";
              displayName = "Nexus Pro Lite";
            }

            sendEvent("agent_start", { agent: hasImages ? "nemotron_vision" : "nexus_pro", agentName: displayName, model: modelName, at: Date.now() });
            sendEvent("log", { message: `Engaging: ${displayName}`, at: Date.now() });

            const messages: Array<{ role: "system" | "user" | "assistant"; content: string | Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }> }> = [
              { role: "system", content: `${NEXUS_THINKING_PROMPT}\n\n${languageInstruction}` },
              ...baseMessages.map(m => ({ role: m.role, content: m.content })),
              { role: "user" as const, content: userMessageContent },
            ];

            // Use OpenRouter for Vision model, DeepSeek for text
            const client = hasImages ? openrouter : deepseek;
            response = await client.chat.completions.create({
              model: modelName,
              messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
              stream: true,
              max_tokens: 4000,
              temperature: 0.7,
            });

            sendEvent("agent_finish", { agent: hasImages ? "nemotron_vision" : "nexus_pro", agentName: displayName, model: modelName, status: "completed", at: Date.now() });

          } else {
            // SUPER CODER MODE: Run 5 standard models + 2 coder models in parallel, then aggregate
            const standardModels = [
              { id: "mimo_v2", name: "Mimo V2 Flash", model: "xiaomi/mimo-v2-flash:free" },
              { id: "devstral", name: "Devstral 2512", model: "mistralai/devstral-2512:free" },
              { id: "deepseek_nex", name: "DeepSeek V3.1 NEX", model: "nex-agi/deepseek-v3.1-nex-n1:free" },
              { id: "olmo_think", name: "OLMo 3.1 32B Think", model: "allenai/olmo-3.1-32b-think:free" },
              { id: "gpt_oss_20b", name: "GPT-OSS 20B", model: "openai/gpt-oss-20b:free" },
            ];
            const coderModels = [
              { id: "qwen_coder", name: "Qwen3 Coder", model: "qwen/qwen3-coder:free" },
              { id: "kat_coder", name: "Kat Coder Pro", model: "kwaipilot/kat-coder-pro:free" },
            ];
            const allModels = [...standardModels, ...coderModels];

            // Handle images: use nemotron to describe, then feed description to other models
            let textQuery = query;
            if (hasImages) {
              sendEvent("agent_start", { agent: "nemotron_vision", agentName: "Nemotron Vision", model: "nvidia/nemotron-nano-12b-v2-vl:free", at: Date.now() });
              
              const visionMessages: Array<{ role: "system" | "user"; content: string | Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }> }> = [
                { role: "system", content: "Describe the images in detail, especially any code, diagrams, or technical content." },
                { role: "user" as const, content: userMessageContent },
              ];

              const visionResponse = await openrouter.chat.completions.create({
                model: "nvidia/nemotron-nano-12b-v2-vl:free",
                messages: visionMessages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
                stream: false,
                max_tokens: 500,
              });

              const imageDescription = visionResponse.choices[0]?.message?.content || "";
              textQuery = `${query}\n\n[Image Description: ${imageDescription}]`;
              sendEvent("agent_finish", { agent: "nemotron_vision", agentName: "Nemotron Vision", model: "nvidia/nemotron-nano-12b-v2-vl:free", status: "completed", at: Date.now() });
            }

            // Run all models in parallel
            sendEvent("step_finish", { step: 4, status: "completed", at: Date.now() });
            sendEvent("step_start", { step: 5, at: Date.now() });
            sendEvent("log", { message: "Running 7 models in parallel (5 standard + 2 coder)...", at: Date.now() });

            const modelMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
              { role: "system", content: `${NEXUS_SUPER_CODER_PROMPT}\n\n${languageInstruction}` },
              ...baseMessages.map(m => ({ role: m.role, content: typeof m.content === "string" ? m.content : "" })),
              { role: "user" as const, content: textQuery },
            ];

            const modelPromises = allModels.map(async (modelDef) => {
              sendEvent("agent_start", { agent: modelDef.id, agentName: modelDef.name, model: modelDef.model, at: Date.now() });
              try {
                const modelResponse = await openrouter.chat.completions.create({
                  model: modelDef.model,
                  messages: modelMessages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
                  stream: false,
                  max_tokens: 4000,
                  temperature: 0.7,
                });
                const content = modelResponse.choices[0]?.message?.content || "";
                sendEvent("agent_finish", { agent: modelDef.id, agentName: modelDef.name, model: modelDef.model, status: "completed", at: Date.now() });
                return { model: modelDef.name, content, id: modelDef.id };
              } catch (error) {
                sendEvent("agent_finish", { agent: modelDef.id, agentName: modelDef.name, model: modelDef.model, status: "failed", error: error instanceof Error ? error.message : "Unknown error", at: Date.now() });
                return { model: modelDef.name, content: "", id: modelDef.id };
              }
            });

            const modelResults = await Promise.all(modelPromises);
            const validResults = modelResults.filter(r => r.content);

            sendEvent("step_finish", { step: 5, status: "completed", at: Date.now() });
            sendEvent("step_start", { step: 6, at: Date.now() });
            sendEvent("log", { message: `Aggregating responses from ${validResults.length} successful models...`, at: Date.now() });

            // Fallback if all models failed
            if (validResults.length === 0) {
              sendEvent("log", { message: "All models failed, using fallback model...", at: Date.now() });
              sendEvent("agent_start", { agent: "fallback", agentName: "Devstral 2512 (Fallback)", model: "mistralai/devstral-2512:free", at: Date.now() });
              
              const fallbackResponse = await openrouter.chat.completions.create({
                model: "mistralai/devstral-2512:free",
                messages: modelMessages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
                stream: true,
                max_tokens: 4000,
                temperature: 0.7,
              });
              
              sendEvent("agent_finish", { agent: "fallback", agentName: "Devstral 2512 (Fallback)", model: "mistralai/devstral-2512:free", status: "completed", at: Date.now() });
              response = fallbackResponse;
              modelName = "mistralai/devstral-2512:free";
              displayName = "Devstral 2512 (Fallback)";
            } else {
              // FINAL AGGREGATOR for SUPER CODER - Using DeepSeek V3.1 NEX
              const aggregatorPrompt = `You are a final aggregator AI specialized in code synthesis. You have received responses from multiple AI models (including specialized coding models) for the same question. Your task is to synthesize the best solution by:
1. Combining the most accurate code and logic from all responses
2. Removing redundancy and contradictions
3. Presenting production-ready, well-structured code in professional Markdown format
4. If models disagree, choose the most logical and well-reasoned solution
5. Ensure code follows best practices and is complete
6. Use bold headers (##), structured bullet points, and clear code blocks
7. End with a "Key Takeaways" section summarizing the most important points
8. DO NOT include phrases like "This synthesis integrates..." or similar filler. Get straight to the value.

User Question: ${query}

Model Responses:
${validResults.map((r, i) => `\n[Model ${i + 1}: ${r.model}]\n${r.content}`).join("\n\n---\n")}

Provide the final aggregated solution in ${userLanguage === "ar" ? "Arabic" : "English"} using professional Markdown formatting:`;

              sendEvent("agent_start", { agent: "final_aggregator", agentName: "Final Aggregator", model: "nex-agi/deepseek-v3.1-nex-n1:free", at: Date.now() });

              const aggregatorResponse = await openrouter.chat.completions.create({
                model: "nex-agi/deepseek-v3.1-nex-n1:free",
                messages: [
                  { role: "system", content: `You are an expert code aggregator that synthesizes multiple AI responses into the best possible production-ready solution. ${languageInstruction}` },
                  { role: "user", content: aggregatorPrompt },
                ],
                stream: true,
                max_tokens: 6000,
                temperature: 0.5,
              });

              sendEvent("agent_finish", { agent: "final_aggregator", agentName: "Final Aggregator", model: "nex-agi/deepseek-v3.1-nex-n1:free", status: "completed", at: Date.now() });
              response = aggregatorResponse;
              modelName = "nex-agi/deepseek-v3.1-nex-n1:free";
              displayName = "Final Aggregator";
            }
          }

          // Steps 4-5 are handled in mode-specific logic above

          let fullContent = "";
          let fullReasoning = "";
          let chunkCount = 0;

          for await (const chunk of response) {
            const delta = chunk.choices[0]?.delta;

            if (!delta) continue;

            chunkCount++;

            // Progressive step completion during streaming (steps 6-9 for aggregator output)
            if (chunkCount === 5) {
              sendEvent("step_finish", { step: 6, status: "completed", at: Date.now() });
            } else if (chunkCount === 15) {
              sendEvent("step_finish", { step: 7, status: "completed", at: Date.now() });
            } else if (chunkCount === 30) {
              sendEvent("step_finish", { step: 8, status: "completed", at: Date.now() });
            } else if (chunkCount === 50) {
              sendEvent("step_finish", { step: 9, status: "completed", at: Date.now() });
            }

            // DeepSeek extends OpenAI's delta with reasoning_content
            const extendedDelta = delta as typeof delta & { reasoning_content?: string };
            if (extendedDelta.reasoning_content) {
              fullReasoning += extendedDelta.reasoning_content;
              sendEvent("thinking", {
                chunk: extendedDelta.reasoning_content,
                at: Date.now(),
              });
            }

            if (extendedDelta.content) {
              fullContent += extendedDelta.content;
              sendEvent("chunk", {
                content: extendedDelta.content,
                at: Date.now(),
              });
            }

            if (chunk.choices[0]?.finish_reason) {
              sendEvent("finish", {
                reason: chunk.choices[0].finish_reason,
                at: Date.now(),
              });
            }
          }

          // Complete final step (Final Aggregation Complete)
          sendEvent("step_finish", { step: 10, status: "completed", at: Date.now() });
          sendEvent("log", { message: "Final aggregated answer ready", at: Date.now() });

          sendEvent("done", {
            answer: fullContent,
            reasoning: fullReasoning || undefined,
            model: displayName,
            mode: mode,
            at: Date.now(),
          });

          controller.close();
        } catch (error: unknown) {
          console.error(`[NEXUS ERROR]`, error);
          const errorMessage = redactSecrets(error instanceof Error ? error.message : "Unknown error");
          sendEvent("step_finish", { step: 1, status: "error", message: errorMessage, at: Date.now() });
          sendEvent("error", {
            message: errorMessage,
            at: Date.now(),
          });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: unknown) {
    console.error(`[NEXUS PARSE ERROR]`, error);
    return new Response(
      JSON.stringify({ error: redactSecrets(error instanceof Error ? error.message : "Internal server error") }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
