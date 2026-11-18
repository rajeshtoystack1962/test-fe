// Request handling for server.js: serves dist/ and proxies /api to Django.
// Kept separate from server.js so it can be tested without opening a real port.
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".ico": "image/x-icon", ".jpg": "image/jpeg", ".woff2": "font/woff2",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "same-origin",
};

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", ...SECURITY_HEADERS });
  res.end(JSON.stringify(body));
}

export function createHandler({ dist, backendUrl, proxyTimeoutMs = 30000 }) {
  const transport = backendUrl.protocol === "https:" ? https : http;
  const indexFile = path.join(dist, "index.html");

  function proxy(req, res) {
    const upstream = transport.request(
      {
        hostname: backendUrl.hostname,
        port: backendUrl.port || (backendUrl.protocol === "https:" ? 443 : 80),
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          host: backendUrl.host,
          "x-forwarded-for": [req.headers["x-forwarded-for"], req.socket.remoteAddress].filter(Boolean).join(", "),
          "x-forwarded-proto": req.headers["x-forwarded-proto"] || "http",
        },
        timeout: proxyTimeoutMs,
      },
      (up) => {
        res.writeHead(up.statusCode, up.headers);
        up.pipe(res);
      }
    );
    upstream.on("timeout", () => upstream.destroy(new Error("backend timed out")));
    upstream.on("error", (e) => {
      if (res.headersSent) return res.destroy();
      sendJson(res, e.message === "backend timed out" ? 504 : 502, {
        error: e.message === "backend timed out" ? "backend timed out" : "backend unreachable",
        detail: e.message,
      });
    });
    res.on("close", () => upstream.destroy());
    req.pipe(upstream);
  }

  function serveStatic(req, res) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD", ...SECURITY_HEADERS });
      return res.end();
    }
    if (!fs.existsSync(indexFile)) {
      return sendJson(res, 503, { error: "frontend not built", detail: "run npm run build" });
    }

    let urlPath;
    try {
      urlPath = decodeURIComponent(req.url.split("?")[0]);
    } catch {
      res.writeHead(400, SECURITY_HEADERS);
      return res.end();
    }

    let file = path.normalize(path.join(dist, urlPath));
    const relative = path.relative(dist, file);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      res.writeHead(403, SECURITY_HEADERS);
      return res.end();
    }

    const exists = fs.existsSync(file) && fs.statSync(file).isFile();
    if (!exists) {
      // A missing file with an extension is a real 404. Anything else is a page route.
      if (path.extname(urlPath)) {
        res.writeHead(404, SECURITY_HEADERS);
        return res.end();
      }
      file = indexFile;
    }

    const isIndex = file === indexFile;
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
      // Built asset names contain a hash, so they never change. index.html must always be re-checked.
      "Cache-Control": isIndex ? "no-cache" : "public, max-age=31536000, immutable",
      ...SECURITY_HEADERS,
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  }

  return function handler(req, res) {
    const pathname = req.url.split("?")[0];
    if (pathname === "/healthz") return sendJson(res, 200, { status: "ok" }); // process is alive
    if (pathname === "/readyz") {
      return fs.existsSync(indexFile)
        ? sendJson(res, 200, { status: "ready" })
        : sendJson(res, 503, { status: "not ready", detail: "dist/index.html missing" });
    }
    if (pathname === "/api" || pathname.startsWith("/api/")) return proxy(req, res);
    return serveStatic(req, res);
  };
}
