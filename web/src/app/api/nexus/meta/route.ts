import { NextResponse } from "next/server";
import { getAllAgentMeta } from "@/lib/nexusMeta";

/**
 * GET /api/nexus/meta
 * 
 * Returns agent metadata for all Nexus modes.
 * All agents now use official DeepSeek models exclusively.
 */
export async function GET() {
  try {
    const meta = getAllAgentMeta();
    
    return NextResponse.json(meta, {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=600",
      },
    });
  } catch (error) {
    console.error("[NEXUS META ERROR]", error);
    
    return NextResponse.json(
      { error: "Failed to load agent metadata" },
      { status: 500 }
    );
  }
}

