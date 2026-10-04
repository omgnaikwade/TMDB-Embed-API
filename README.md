# TMDB Embed API — Cloudflare Workers Fixed Build

This is a Cloudflare Workers version of the project.

## What changed

- No Express server / `listen()` — uses the Cloudflare Workers `fetch()` runtime.
- One-time TMDB key setup page at `/`.
- The TMDB key is validated and stored in **Cloudflare KV**.
- After the first successful save, the setup endpoint is locked and the key is never returned.
- Removed the old username/password admin login and filesystem-based config.
- Replaced the provider Axios calls used by this build with a tiny Workers-compatible `fetch` shim.
- Replaced `node-fetch` usage with the native Workers `fetch`.
- In-memory response caching is enabled for faster repeated requests.
- CORS is enabled for API clients.
- Providers that depend on a persistent local filesystem or Node HTTP server APIs are intentionally excluded from the Worker bundle:
  - `showbox`
  - `4khdhub`
- Bundled providers:
  - `castletv`
  - `streamflix`
  - `vaplayer`
  - `vidlink`
  - `vixsrc`
  - `zxcstreams`
  - `netmirror`
  - `onetouchtv`
  - `hdghartv`

## Deploy — easiest way

### 1. Install

```bash
npm install
```

### 2. Login to Cloudflare

```bash
npx wrangler login
```

### 3. Create the KV namespace automatically

```bash
npm run setup:kv
```

That command creates `TMDB_CONFIG` and writes its namespace ID into `wrangler.toml`.

### 4. Deploy

```bash
npm run deploy
```

Wrangler will print your `workers.dev` URL.

### 5. One-time setup

Open the deployed URL.

Paste your TMDB **v3 API key** and press **Save key & start API**.

The server validates the key against TMDB and stores it in KV. After that, you do not have to enter it again.

## API

Movie:

```text
GET /api/streams/movie/{tmdbId}
```

Example:

```text
GET /api/streams/movie/550
```

Series:

```text
GET /api/streams/series/{tmdbId}?season=1&episode=1
```

Provider-specific:

```text
GET /api/streams/vidlink/movie/550
GET /api/streams/vixsrc/movie/550
```

Health:

```text
GET /api/health
```

Providers:

```text
GET /api/providers
```

## Important

The old project used local files such as `utils/user-config.json` and `utils/auth-users.json`. Those are not suitable for persistent Cloudflare Worker storage, so this build replaces them with KV-backed one-time setup.

The TMDB key is not exposed through `/api/setup/status`, `/api/providers`, or any normal response.

## Local development

After `npm run setup:kv`, you can run:

```bash
npm run dev
```

For local Wrangler development, KV data is isolated from production unless you explicitly use a remote binding. This is normal.

## API usage from an app

Your app can call:

```text
https://YOUR-WORKER.workers.dev/api/streams/movie/550
```

No TMDB key needs to be placed in your Android app. The Worker handles TMDB authentication server-side.

## Performance notes

The Worker runs providers in parallel for aggregate requests and caches successful aggregate responses in memory for a short TTL. Cloudflare may create multiple isolates, so the cache is an optimization rather than permanent storage.

## License

This build retains the licensing terms of the original project. Check the original `LICENSE.md` before redistributing it.
