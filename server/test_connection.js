require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), override: true });

const key = process.env.BLACKBOX_API_KEY || "";

function maskKey(value) {
  const v = String(value || "");
  if (v.length <= 8) return "[REDACTED]";
  return `${v.slice(0, 4)}...${v.slice(-4)}`;
}

console.log(`API Key Loaded: ${maskKey(key)}`);
console.log("Ready to launch");
