# test-fe

Small React page that talks to the Django API in `../test-django`.

Start Django first, on port 8000. Then use one of the two runs below.

## How a click reaches Django

1. The page calls `/api/message/` and `/api/items/` (`src/api.js`).
2. That request hits this app, not Django.
3. This app forwards `/api` to `BACKEND_URL` (`http://localhost:8000`).
4. Django answers with JSON. The page draws the message and the item list.
5. Add an item and the page sends `POST /api/items/` along the same path.

Django also allows these pages in `CORS_ALLOWED_ORIGINS`:

- `http://localhost:5173` — learning run
- `http://localhost:3000` — local deploy run

Leave `VITE_API_BASE_URL` empty. The browser then stays on this app, and this app is the piece that knows where Django is.

## Learning run (use this while coding)

Terminal 1 is Django. Terminal 2:

```bash
cd test-fe
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:5173

You should see **Hello from Django backend!** and two starter items. Type a name, click Add, and the new item comes back from Django.

Vite reads `BACKEND_URL` from `.env`. Restart `npm run dev` after you change `.env`.

## Local deploy run (built files)

Same idea, with a built page served by `server.js` on port 3000.

Terminal 1 is still Django on port 8000. Terminal 2:

```bash
cd test-fe
npm install
npm run build
npm start
```

Open http://localhost:3000

`npm start` runs `server.js`. It serves the built page and forwards `/api` to `BACKEND_URL`. It has no dependencies of its own beyond Node.

To keep that process running with PM2:

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
```

`ecosystem.config.cjs` sets `BACKEND_URL` to `http://localhost:8000`. Change that file if Django is on another address, then run `pm2 restart react-frontend`.

After code changes:

```bash
npm install
npm run build
pm2 restart react-frontend
```

Useful commands: `pm2 status`, `pm2 logs react-frontend`.

## Health checks

`server.js` answers two paths of its own. They never go to Django.

| Path | Meaning |
|---|---|
| `/healthz` | The process is alive. Always `200` |
| `/readyz` | `200` when `dist/index.html` exists, `503` if you forgot `npm run build` |

## Run the tests

```bash
npm test
```

They start `server.js`'s handler against a fake backend and check routing, caching, the `/api` forwarding and error cases.

## Environment variables

Configuration comes from environment variables. A `.env` file is read for local runs. See `.env.example`.

| Variable | Default | Used by |
|---|---|---|
| `BACKEND_URL` | `http://localhost:8000` | Vite and `server.js`, the forward address. `http://` or `https://` |
| `VITE_API_BASE_URL` | empty | The browser. Leave empty for this lesson |
| `PORT` | `3000` | `server.js` only |

`VITE_API_BASE_URL` is read when Vite starts or when you run `npm run build`. Restart or rebuild after changing it. `server.js` stops with an error if `BACKEND_URL` is not a valid URL, and it shuts down cleanly on `SIGTERM` or `Ctrl+C`.

---

# Deployment guide (for DevOps)

This section is for whoever deploys the app. It says what the service needs. How to package and run it (Dockerfile, Kubernetes files) is your task to design.

## The whole system

There are two apps. Deploy both.

```
Browser ──► test-fe (Node, port 3000) ──/api──► test-django (gunicorn, port 8000)
            serves the built page               returns JSON
            forwards every /api request
```

- Users only ever talk to **test-fe**. This is the one that must be reachable from outside.
- test-fe forwards `/api/...` to Django using `BACKEND_URL`, so the browser never needs Django's address.
- Deploy **test-django first**, then test-fe. See `../test-django/README.md` for the backend.

## What this service needs

There are two stages: build the page once, then run a tiny server.

| Item | Value |
|---|---|
| Language | Node.js 18 or newer. Use a current LTS |
| Build | `npm ci` then `npm run build`. This writes the page to `dist/` |
| Start command | `node server.js` |
| Port | `3000` (from the `PORT` variable) |
| Needs at runtime | `server.js`, `server-core.js` and the `dist/` folder |
| Health checks | `GET /healthz` (alive) and `GET /readyz` (ready) |
| Logs | stdout |
| Stopping | exits cleanly on `SIGTERM` |

`server.js` uses only Node's built-in modules. At runtime it does **not** need `node_modules`, Vite or React. Only the build step needs them. This matters for how small and clean your image can be.

## Settings to provide when deployed

| Variable | When it is read | In deployment | Secret? |
|---|---|---|---|
| `BACKEND_URL` | When the server **starts** | The in-cluster address of test-django, for example `http://<django-service>:8000` | No |
| `PORT` | When the server **starts** | `3000` | No |
| `VITE_API_BASE_URL` | When you run `npm run build` | Leave **empty** | No |

- `BACKEND_URL` is read at start, not at build. So the same image can talk to different backends in different environments.
- Leave `VITE_API_BASE_URL` empty. If you set it, the browser would call that address itself and skip this server's forwarding.
- Whatever name you put in `BACKEND_URL` must be allowed by test-django's `DJANGO_ALLOWED_HOSTS`. Otherwise Django returns `400` and the page shows "Cannot reach backend".

## Health checks

| Path | Use it for | Answer |
|---|---|---|
| `/healthz` | Liveness | `200` as long as the process runs. Never calls Django |
| `/readyz` | Readiness | `200` when `dist/index.html` exists, otherwise `503` |

Neither one checks the backend. If Django is down, the page loads but shows an error message, and `/api/...` returns `502`.

## Your tasks

### 1. Containerize it

Write a `Dockerfile` for this service. It should:

- Build the page in one stage and run it in a smaller stage that holds only what the runtime needs (see the table above).
- Use version-pinned base images, not `latest`.
- Run as a non-root user.
- Not contain `.env`, `node_modules` copied from your laptop, or `.git`. Add a `.dockerignore`.
- Take `BACKEND_URL` and `PORT` from environment variables at start.
- Use layer order so a code change does not re-download every dependency.

### 2. Deploy it to Kubernetes

Write the manifests. At a minimum you need:

- A **Deployment** for test-fe.
- A **Service** for it, plus a way to open it from outside the cluster (Ingress, NodePort or LoadBalancer, whichever your cluster supports).
- A **ConfigMap** that holds `BACKEND_URL` (pointing to the test-django Service).
- **Liveness probe** on `/healthz` and **readiness probe** on `/readyz`.
- CPU and memory requests and limits.

### 3. Prove it works

From a browser or with `curl` against the address users will use:

```bash
curl http://<frontend>/healthz              # {"status":"ok"}
curl http://<frontend>/readyz               # {"status":"ready"}
curl http://<frontend>/api/message/         # JSON that came from Django
curl -s http://<frontend>/ | head           # the page HTML
```

Then open the page in a browser. You should see **Hello from Django backend!** and the item list. Add an item and confirm it appears.

## Done means

- The image builds from a clean checkout and the final image has no `node_modules`.
- The pod becomes Ready with the probes above.
- The four `curl` checks work, and the page works in a browser.
- Changing `BACKEND_URL` and restarting the pod is enough to point it to another backend. No rebuild.
- If the backend pod is stopped, the page loads but shows an error, and `/api/...` returns `502`. When the backend is back, the page works again without restarting test-fe.
- You can explain why `BACKEND_URL` is a runtime setting and `VITE_API_BASE_URL` is a build-time one.

## Common problems

| Symptom | Likely cause |
|---|---|
| `/readyz` returns `503`, pages return `503` | `dist/` is not in the image. The build step was skipped or its output was not copied |
| Page loads but says "Cannot reach backend" | `BACKEND_URL` is wrong, the backend is down, or Django's `DJANGO_ALLOWED_HOSTS` does not include the name used |
| `/api/...` returns `502` | Frontend cannot connect to the backend address. Check the Service name and port |
| `/api/...` returns `504` | The backend did not answer within 30 seconds |
| Container exits with `Invalid BACKEND_URL` | The value has no `http://` or `https://`, or is misspelled. An empty value does not fail, it falls back to `http://localhost:8000`, which is wrong inside a cluster |
| Old page after a new deploy | Browser or proxy caching. `index.html` is sent with `no-cache`, so check anything in front of the app |
