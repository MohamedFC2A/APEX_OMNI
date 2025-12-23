require("dotenv").config({ path: require("path").join(__dirname, "..", "..", ".env"), override: true });

const express = require("express");
const cors = require("cors");
const { runNexusChain } = require("./nexusChain");

// Import AGENTS from compiled dist
const nexusOps = require("../../nexus_ops/dist/index");
const AGENTS = nexusOps.AGENTS || {};

function parseBool(value) {
  const v = String(value || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function normalizeMode(mode, thinkingNexus) {
  const m = typeof mode === "string" ? mode.trim().toLowerCase() : "";
  if (m === "standard" || m === "deep" || m === "coder") return m;
  if (m === "thinking") return "deep";
  if (m === "deep-scan" || m === "deepscan" || m === "deep_scan") return "deep";
  if (m === "coder-mode" || m === "coder_mode" || m === "code") return "coder";
  return thinkingNexus ? "deep" : "standard";
}

function redactSecrets(input) {
  return String(input || "")
    .replace(/\b(bb_[a-zA-Z0-9_\-]{10,})\b/g, "[REDACTED]")
    .replace(/\b(sk-[a-zA-Z0-9_\-]{10,})\b/g, "[REDACTED]");
}

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post("/api/nexus/run", async (req, res) => {
  const userQuery = typeof req.body?.query === "string" ? req.body.query : "";
  const thinkingNexus = parseBool(req.body?.thinkingNexus);
  const mode = normalizeMode(req.body?.mode, thinkingNexus);
  if (!userQuery.trim()) {
    res.status(400).json({ error: "Missing 'query'" });
    return;
  }

  try {
    const result = await runNexusChain({ userQuery, thinkingNexus, mode });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: redactSecrets(error instanceof Error ? error.message : "Unknown error"),
    });
  }
});

app.get("/api/nexus/meta", (_req, res) => {
  const standardAgents = Array.isArray(AGENTS?.standard) ? AGENTS.standard : [];
  const deepAgents = Array.isArray(AGENTS?.deep) ? AGENTS.deep : [];
  const thinkingAgents = Array.isArray(AGENTS?.thinking) ? AGENTS.thinking : deepAgents;
  const coderAgents = Array.isArray(AGENTS?.coder) ? AGENTS.coder : [];
  res.status(200).json({
    standardAgents,
    deepAgents,
    thinkingAgents,
    coderAgents,
  });
});

app.get("/api/nexus/stream", async (req, res) => {
  const userQuery = typeof req.query?.query === "string" ? req.query.query : "";
  const thinkingNexus = parseBool(req.query?.thinkingNexus);
  const mode = normalizeMode(req.query?.mode, thinkingNexus);
  if (!userQuery.trim()) {
    res.status(400).json({ error: "Missing 'query'" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    res.flush?.();
  };

  res.write(`: nexus stream open\n\n`);
  res.flush?.();

  const heartbeat = setInterval(() => {
    sendEvent("ping", { t: Date.now() });
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
  });

  try {
    const result = await runNexusChain({
      userQuery,
      thinkingNexus,
      mode,
      emit: (update) => {
        const type = typeof update?.type === "string" ? update.type : "log";
        sendEvent(type, update);
      },
    });
    sendEvent("done", result);
  } catch (error) {
    sendEvent("error", {
      message: redactSecrets(error instanceof Error ? error.message : "Unknown error"),
    });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

const port = Number.parseInt(process.env.PORT || "4001", 10);
app.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`);
});
