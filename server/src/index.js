require("dotenv").config({ path: require("path").join(__dirname, "..", "..", ".env"), override: true });

const express = require("express");
const cors = require("cors");
const { runNexusChain } = require("./nexusChain");
const step1Swarm = require("../../nexus_ops/step1_swarm");

function parseBool(value) {
  const v = String(value || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
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
  if (!userQuery.trim()) {
    res.status(400).json({ error: "Missing 'query'" });
    return;
  }

  try {
    const result = await runNexusChain({ userQuery, thinkingNexus });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: redactSecrets(error instanceof Error ? error.message : "Unknown error"),
    });
  }
});

app.get("/api/nexus/meta", (_req, res) => {
  const standardAgents = Array.isArray(step1Swarm?.AGENTS?.standard) ? step1Swarm.AGENTS.standard : [];
  const thinkingAgents = Array.isArray(step1Swarm?.AGENTS?.thinking) ? step1Swarm.AGENTS.thinking : [];
  res.status(200).json({
    standardAgents,
    thinkingAgents,
  });
});

app.get("/api/nexus/stream", async (req, res) => {
  const userQuery = typeof req.query?.query === "string" ? req.query.query : "";
  const thinkingNexus = parseBool(req.query?.thinkingNexus);
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
