# react-frontend

Small React page that talks to the Django API in `../django-backend`.

Start Django first, on port 8000. Then use one of the two runs below.

## How a click reaches Django

1. The page calls `/api/message/` and `/api/items/` (`src/api.js`).
2. That request hits this app, not Django.
3. This app forwards `/api` to `BACKEND_URL` in `.env` (`http://localhost:8000`).
4. Django answers with JSON. The page draws the message and the item list.
5. Add an item and the page sends `POST /api/items/` along the same path.

Django also allows these pages in `CORS_ALLOWED_ORIGINS`:

- `http://localhost:5173` — learning run
- `http://localhost:3000` — local deploy run

Leave `VITE_API_BASE_URL` empty. The browser then stays on this app, and this app is the piece that knows where Django is.

## Learning run (use this while coding)

Terminal 1 is Django. Terminal 2:

```bash
cd react-frontend
npm install
npm run dev
```

Open http://localhost:5173

You should see **Hello from Django backend!** and two starter items. Type a name, click Add, and the new item comes back from Django.

Vite reads `BACKEND_URL` from `.env`. Restart `npm run dev` after you change `.env`.

## Local deploy run (built files)

Same idea, with a built page served by `server.js` on port 3000.

Terminal 1 is still Django on port 8000. Terminal 2:

```bash
cd react-frontend
npm install
npm run build
npm start
```

Open http://localhost:3000

`npm start` runs `server.js`. It serves the built page and forwards `/api` to `BACKEND_URL`.

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

## Environment variables

| Variable | Default | Used by |
|---|---|---|
| `BACKEND_URL` | `http://localhost:8000` | Vite and `server.js`, the forward address |
| `VITE_API_BASE_URL` | empty | The browser. Leave empty for this lesson |
| `PORT` | `3000` | `server.js` only |

`VITE_API_BASE_URL` is read when Vite starts or when you run `npm run build`. Restart or rebuild after changing it.
