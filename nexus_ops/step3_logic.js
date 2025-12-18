const { pause } = require("./ops_utils");

function normalizeKey(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[`*_#>]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function hasHedging(s) {
  return /\b(maybe|might|could|possibly|i think|i believe|seems|often|usually)\b/i.test(String(s || ""));
}

function negationFlag(s) {
  const t = normalizeKey(s);
  return /\b(no|not|never|cannot|can't|won't|without)\b/.test(t);
}

function topicKey(s) {
  const t = normalizeKey(s);
  return t.split(" ").slice(0, 10).join(" ");
}

function isConflict(a, b) {
  if (!a || !b) return false;
  if (topicKey(a) !== topicKey(b)) return false;
  return negationFlag(a) !== negationFlag(b);
}

function pickWinner(items) {
  const generalist = items.find((x) => x?.source?.agent === "generalist");
  if (generalist) return generalist;
  return items.slice().sort((x, y) => (y.confidence || 0) - (x.confidence || 0))[0];
}

async function step3Logic(ctx) {
  const emit = ctx?.emit;
  const facts = Array.isArray(ctx?.facts) ? ctx.facts : [];
  if (facts.length === 0) throw new Error("Step 3 failed: missing facts");

  await pause(emit, { step: 3, message: "Conflict resolution algorithm engaged. Building topic clusters." });

  const clusters = new Map();
  for (const item of facts) {
    const k = topicKey(item.fact);
    if (!k) continue;
    const arr = clusters.get(k) || [];
    arr.push(item);
    clusters.set(k, arr);
  }

  await pause(emit, { step: 3, message: `Clustered into ${clusters.size} topics. Scanning for contradictions.` });

  const accepted = [];
  const rejected = [];
  const conflicts = [];
  const seen = new Set();

  for (const [k, items] of clusters.entries()) {
    const sorted = items.slice().sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    const usable = sorted.filter((x) => !hasHedging(x.fact));
    if (usable.length === 0) {
      for (const it of sorted) {
        rejected.push({ ...it, reason: "low_confidence_language" });
      }
      continue;
    }

    let hasAnyConflict = false;
    for (let i = 0; i < usable.length; i += 1) {
      for (let j = i + 1; j < usable.length; j += 1) {
        if (isConflict(usable[i].fact, usable[j].fact)) {
          hasAnyConflict = true;
          conflicts.push({
            topic: k,
            a: usable[i].fact,
            b: usable[j].fact,
            tieBreaker: "generalist",
          });
        }
      }
    }

    if (!hasAnyConflict) {
      const winner = usable[0];
      const key = normalizeKey(winner.fact);
      if (!seen.has(key)) {
        seen.add(key);
        accepted.push(winner);
      }
      for (let i = 1; i < usable.length; i += 1) {
        rejected.push({ ...usable[i], reason: "redundant_same_topic" });
      }
      continue;
    }

    const winner = pickWinner(usable);
    const winnerKey = normalizeKey(winner.fact);
    if (!seen.has(winnerKey)) {
      seen.add(winnerKey);
      accepted.push(winner);
    }

    for (const it of usable) {
      if (it === winner) continue;
      rejected.push({
        ...it,
        reason: "conflict_rejected",
        conflictsWith: winner.fact,
      });
    }
  }

  const finalAccepted = accepted
    .slice()
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, 60);

  if (finalAccepted.length === 0) {
    throw new Error("Step 3 failed: all facts rejected");
  }

  await pause(emit, {
    step: 3,
    message: `Accepted ${finalAccepted.length} facts. Conflicts resolved: ${conflicts.length}.`,
  });

  return { accepted: finalAccepted, rejected, conflicts };
}

module.exports = step3Logic;
