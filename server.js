// Zero-dependency production server: serves dist/ and proxies /api to Django.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHandler } from "./server-core.js";

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const ROOT = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.join(ROOT, ".env"));

const PORT = Number(process.env.PORT || 3000);

let BACKEND_URL;
try {
  BACKEND_URL = new URL(process.env.BACKEND_URL || "http://localhost:8000");
  if (!["http:", "https:"].includes(BACKEND_URL.protocol)) throw new Error("must start with http:// or https://");
} catch (e) {
  console.error(`Invalid BACKEND_URL "${process.env.BACKEND_URL}": ${e.message}`);
  process.exit(1);
}

const server = http.createServer(
  createHandler({ dist: path.join(ROOT, "dist"), backendUrl: BACKEND_URL })
);

server.listen(PORT, "0.0.0.0", () =>
  console.log(`Frontend on :${PORT}, proxying /api -> ${BACKEND_URL.origin}`)
);

// Stop cleanly when PM2, Docker or Kubernetes asks the process to exit.
function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
