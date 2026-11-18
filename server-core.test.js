import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHandler } from "./server-core.js";

let dist, backend, app, appUrl, backendHits;

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

before(async () => {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), "fe-dist-"));
  fs.mkdirSync(path.join(dist, "assets"));
  fs.writeFileSync(path.join(dist, "index.html"), "<html>app</html>");
  fs.writeFileSync(path.join(dist, "assets", "app-abc123.js"), "console.log(1)");

  backendHits = [];
  backend = http.createServer((req, res) => {
    backendHits.push({ url: req.url, host: req.headers.host });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ from: "backend", url: req.url }));
  });
  const backendPort = await listen(backend);

  app = http.createServer(createHandler({ dist, backendUrl: new URL(`http://127.0.0.1:${backendPort}`) }));
  appUrl = `http://127.0.0.1:${await listen(app)}`;
});

after(() => {
  backend.close();
  app.close();
  fs.rmSync(dist, { recursive: true, force: true });
});

test("/healthz is ok without touching the backend", async () => {
  const before = backendHits.length;
  const res = await fetch(`${appUrl}/healthz`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok" });
  assert.equal(backendHits.length, before);
});

test("/readyz is ready when dist/index.html exists", async () => {
  const res = await fetch(`${appUrl}/readyz`);
  assert.equal(res.status, 200);
});

test("serves index.html with no-cache", async () => {
  const res = await fetch(`${appUrl}/`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "<html>app</html>");
  assert.equal(res.headers.get("cache-control"), "no-cache");
});

test("unknown page route falls back to index.html (SPA)", async () => {
  const res = await fetch(`${appUrl}/some/page`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "<html>app</html>");
});

test("built assets are cached as immutable", async () => {
  const res = await fetch(`${appUrl}/assets/app-abc123.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("cache-control"), /immutable/);
});

test("missing file with an extension is 404, not index.html", async () => {
  const res = await fetch(`${appUrl}/assets/missing.js`);
  assert.equal(res.status, 404);
});

test("path traversal is blocked", async () => {
  const res = await new Promise((resolve) =>
    http.get(`${appUrl}/..%2f..%2fetc/passwd`, resolve)
  );
  assert.ok([403, 404].includes(res.statusCode), `got ${res.statusCode}`);
  res.resume();
});

test("/api is forwarded to the backend with the backend host header", async () => {
  const res = await fetch(`${appUrl}/api/message/?x=1`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { from: "backend", url: "/api/message/?x=1" });
  const hit = backendHits.at(-1);
  assert.equal(hit.url, "/api/message/?x=1");
  assert.match(hit.host, /^127\.0\.0\.1:/);
});

test("non-GET on a static path is 405", async () => {
  const res = await fetch(`${appUrl}/`, { method: "POST" });
  assert.equal(res.status, 405);
});

test("unreachable backend gives 502 JSON", async () => {
  const dead = http.createServer();
  const port = await listen(dead);
  dead.close();
  const broken = http.createServer(createHandler({ dist, backendUrl: new URL(`http://127.0.0.1:${port}`) }));
  const url = `http://127.0.0.1:${await listen(broken)}`;
  const res = await fetch(`${url}/api/items/`);
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error, "backend unreachable");
  broken.close();
});

test("/readyz is 503 and pages are 503 when dist is missing", async () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "fe-empty-"));
  const bare = http.createServer(createHandler({ dist: empty, backendUrl: new URL("http://127.0.0.1:9") }));
  const url = `http://127.0.0.1:${await listen(bare)}`;
  assert.equal((await fetch(`${url}/readyz`)).status, 503);
  assert.equal((await fetch(`${url}/`)).status, 503);
  bare.close();
  fs.rmSync(empty, { recursive: true, force: true });
});
