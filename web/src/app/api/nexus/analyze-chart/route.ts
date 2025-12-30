import { NextResponse } from 'next/server';

/**
 * 🛠️ UTILITY: Aggressive JSON Extractor
 * Finds the first valid JSON object in a string, ignoring all text around it.
 */
function extractJSON(text: string): any {
    try {
        // 1. Try standard parse first (fast path)
        return JSON.parse(text);
    } catch (e) {
        // 2. Remove Markdown wrappers
        let clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();

        // 3. Find the first '{' and the LAST '}'
        const firstOpen = clean.indexOf('{');
        const lastClose = clean.lastIndexOf('}');

        if (firstOpen !== -1 && lastClose !== -1) {
            const jsonCandidate = clean.substring(firstOpen, lastClose + 1);
            try {
                return JSON.parse(jsonCandidate); // Try parsing the extracted block
            } catch (innerError) {
                console.warn("⚠️ JSON Extraction Warning:", innerError);
                return null;
            }
        }
        return null;
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const message = body.message || body.userPrompt;

        if (!process.env.OPENROUTER_API_KEY) {
            // Return 200 with error flag to prevent frontend crash
            return NextResponse.json({ error: true, details: "Server API Key Missing" }, { status: 200 });
        }

        console.log("⚡ [API] Calling Model for Chart:", message);

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://nexus-cc.vercel.app",
                "X-Title": "Nexus CC",
            },
            body: JSON.stringify({
                model: "xiaomi/mimo-v2-flash:free", // <--- KEEPING USER CHOICE
                messages: [
                    {
                        role: "system",
                        content: `You are a strict JSON Data Engine. 
RULES:
1. Output ONLY valid JSON.
2. DO NOT write "Here is the JSON" or use Markdown backticks.
3. Use REAL DATA for the user's request. Do not use "Category A" or generic placeholders.
4. Schema: { "title": "string", "type": "bar|line|pie", "labels": ["string"], "datasets": [{ "label": "string", "data": [number] }], "insight": "string" }
5. If the user asks for a comparison, make sure to provide distinct data points.`
                    },
                    { role: "user", content: `Generate a chart for: ${message}` }
                ],
                temperature: 0.2, // Low temp for stability
                max_tokens: 1000,
            })
        });

        if (!response.ok) {
            console.error("❌ [API] Provider Error:", response.statusText);
            return NextResponse.json({ error: true, details: `Provider Error: ${response.statusText}` }, { status: 200 });
        }

        const data = await response.json();
        const rawContent = data.choices?.[0]?.message?.content || "";

        // LOG IT! Mandatory.
        console.log("� [API] RAW MODEL OUTPUT:", rawContent);

        // 🔥 THE CRITICAL STEP: Extract JSON safely
        const finalData = extractJSON(rawContent);

        if (!finalData) {
            console.error("❌ [API] JSON Extraction Failed");
            return NextResponse.json({ error: true, details: "Failed to extract valid JSON from AI response" }, { status: 200 });
        }

        // Force-Fix Type if Mimo forgets
        if (!finalData.type) finalData.type = 'bar';

        // ✨ DATA NORMALIZATION (Bridge Mimo Schema -> AnalyticsCard Schema)
        // AnalyticsCard expects 'data: number[]' but Mimo schema produces 'datasets: [...]'
        if (!finalData.data && finalData.datasets && finalData.datasets.length > 0) {
            finalData.data = finalData.datasets[0].data;
        }
        // Fallback if data is missing
        if (!finalData.data) {
            finalData.data = [];
        }

        // Auto-detect comparison to hide total (Frontend compatibility)
        const isComparison = /vs|compare|versus|height|taller|shorter|goal/i.test(message);
        if (finalData.showTotal === undefined) {
            finalData.showTotal = !isComparison;
        }

        return NextResponse.json(finalData);

    } catch (error: any) {
        console.error("🔥 [API] SERVER ERROR:", error);
        // Return 200 with error flag to prevent frontend crash
        return NextResponse.json(
            { error: true, details: error.message || "Internal Server Error" },
            { status: 200 }
        );
    }
}
