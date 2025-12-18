const { pause } = require("./ops_utils");

function normalizeWhitespace(s) {
  return String(s || "")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function strengthenVerbs(s) {
  const map = [
    [/\buse\b/gi, "apply"],
    [/\bmake\b/gi, "construct"],
    [/\bdo\b/gi, "execute"],
    [/\bget\b/gi, "derive"],
    [/\bhelp\b/gi, "enable"],
    [/\btry\b/gi, "attempt"],
    [/\bvery\b/gi, ""],
  ];
  let out = String(s || "");
  for (const [re, rep] of map) out = out.replace(re, rep);
  return out;
}

function enforceActiveVoice(s) {
  return String(s || "")
    .replace(/\bit is recommended to\b/gi, "You should")
    .replace(/\bshould be\b/gi, "must be")
    .replace(/\bis being\b/gi, "is")
    .replace(/\bwas done\b/gi, "executed");
}

function adjustTone(s, userQuery) {
  const q = String(userQuery || "").toLowerCase();
  const urgent = q.includes("critical") || q.includes("urgent") || q.includes("overhaul") || q.includes("immediately");
  if (!urgent) return s;
  return String(s || "").replace(/\bshould\b/gi, "must");
}

async function step7Refine(ctx) {
  const emit = ctx?.emit;
  const verified = typeof ctx?.verified === "string" ? ctx.verified : "";
  if (!verified.trim()) throw new Error("Step 7 failed: missing verified draft");

  await pause(emit, { step: 7, message: "Quantum refine engaged. Strengthening verbs and enforcing active voice." });
  let out = strengthenVerbs(verified);
  await pause(emit, { step: 7, message: "Running tone calibration and whitespace normalization." });
  out = enforceActiveVoice(out);
  out = adjustTone(out, ctx?.userQuery);
  out = normalizeWhitespace(out);
  return out;
}

module.exports = step7Refine;
