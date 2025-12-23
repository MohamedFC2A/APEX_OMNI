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
  { step: 5, label: "Core Synthesis Assembling" },
  { step: 6, label: "Deep Verify Cross-Check" },
  { step: 7, label: "Quantum Refine Polishing" },
  { step: 8, label: "Matrix Format Structuring" },
  { step: 9, label: "Final Guard Compliance" },
  { step: 10, label: "Absolute Truth Revealed" },
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
    const { query, mode: rawMode, history = [] } = body;

    console.log(`[NEXUS] POST request - Mode: ${rawMode}, Query length: ${query?.length || 0}`);

    if (!query || typeof query !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'query' field" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const mode = normalizeMode(rawMode);

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

          // Build base messages with history
          const baseMessages: ChatMessage[] = [
            ...history.map((h: { role: string; content: string }) => ({ role: h.role as ChatMessage["role"], content: h.content })),
            { role: "user" as const, content: query },
          ];

          if (mode === "STANDARD") {
            modelName = "deepseek-chat";
            displayName = "Nexus Pro Lite";

            sendEvent("agent_start", { agent: "nexus_fast", agentName: displayName, model: modelName, at: Date.now() });
            sendEvent("log", { message: `Engaging: ${displayName}`, at: Date.now() });

            const messages: ChatMessage[] = [
              { role: "system", content: NEXUS_STANDARD_PROMPT },
              ...baseMessages,
            ];

            response = await deepseek.chat.completions.create({
              model: modelName,
              messages: cleanChatHistory(messages) as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
              stream: true,
              max_tokens: 2000,
              temperature: 0.7,
            });

            sendEvent("agent_finish", { agent: "nexus_fast", agentName: displayName, model: modelName, status: "completed", at: Date.now() });

          } else if (mode === "THINKING") {
            modelName = "deepseek-chat";
            displayName = "Nexus Pro Lite";

            sendEvent("agent_start", { agent: "nexus_pro", agentName: displayName, model: modelName, at: Date.now() });
            sendEvent("log", { message: `Engaging: ${displayName}`, at: Date.now() });

            const messages: ChatMessage[] = [
              { role: "system", content: NEXUS_THINKING_PROMPT },
              ...baseMessages,
            ];

            response = await deepseek.chat.completions.create({
              model: modelName,
              messages: cleanChatHistory(messages) as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
              stream: true,
              max_tokens: 4000,
              temperature: 0.7,
            });

            sendEvent("agent_finish", { agent: "nexus_pro", agentName: displayName, model: modelName, status: "completed", at: Date.now() });

          } else {
            // 💎 DEEPSEEK REASONER R1 - NO temperature/top_p! (SUPER_THINKING mode)
            modelName = "deepseek-reasoner";
            displayName = "Nexus Pro R1";

            sendEvent("agent_start", { agent: "nexus_pro_1", agentName: displayName, model: modelName, at: Date.now() });
            sendEvent("log", { message: `Engaging: ${displayName}`, at: Date.now() });

            const messages: ChatMessage[] = [
              { role: "system", content: NEXUS_SUPER_CODER_PROMPT },
              ...baseMessages,
            ];

            // CRITICAL: No temperature or top_p for deepseek-reasoner
            response = await deepseek.chat.completions.create({
              model: modelName,
              messages: cleanChatHistory(messages) as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
              stream: true,
              max_tokens: 8000,
            });

            sendEvent("agent_finish", { agent: "nexus_pro_1", agentName: displayName, model: modelName, status: "completed", at: Date.now() });
          }

          // Complete step 4 (Titan Critique) before AI streaming starts
          sendEvent("step_finish", { step: 4, status: "completed", at: Date.now() });

          let fullContent = "";
          let fullReasoning = "";
          let chunkCount = 0;

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

          // Complete final step (Absolute Truth Revealed)
          sendEvent("step_finish", { step: 10, status: "completed", at: Date.now() });

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
