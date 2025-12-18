function chunkText(text, maxChunkSize) {
  const chunks = [];
  let cursor = 0;
  while (cursor < text.length) {
    const next = Math.min(text.length, cursor + maxChunkSize);
    chunks.push(text.slice(cursor, next));
    cursor = next;
  }
  return chunks;
}

async function step10Truth(ctx) {
  const emit = ctx?.emit;
  const safeOutput = typeof ctx?.guard?.safeOutput === "string" ? ctx.guard.safeOutput : "";
  if (!safeOutput.trim()) throw new Error("Step 10 failed: missing guarded output");

  const { pause } = require("./ops_utils");
  await pause(emit, { step: 10, message: "Absolute truth engaged. Packaging final byte-stream and typing envelope." });

  const chunkSize = 8;
  const intervalMs = 38;

  return {
    answer: safeOutput,
    presentation: {
      typing: {
        chunkSize,
        intervalMs,
        chunks: chunkText(safeOutput, chunkSize),
      },
    },
  };
}

module.exports = step10Truth;

