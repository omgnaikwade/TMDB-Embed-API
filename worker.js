const { setTmdbApiKey } = require("./utils/tmdbKey.js");
const { resolveImdbId } = require("./utils/tmdb.js");
const { applyFilters } = require("./utils/streamFilters.js");

const PROVIDER_MODULES = {
  castletv: require("./providers/castletv.js"),
  streamflix: require("./providers/streamflix.js"),
  vaplayer: require("./providers/vaplayer.js"),
  vidlink: require("./providers/vidlink.js"),
  vixsrc: require("./providers/vixsrc.js"),
  zxcstreams: require("./providers/zxcstreams.js"),
  netmirror: require("./providers/netmirror.js"),
  onetouchtv: require("./providers/onetouchtv.js"),
  hdghartv: require("./providers/hdghartv.js"),
};

const PROVIDER_FUNCS = {
  castletv: "getCastletvStreams",
  streamflix: "getStreamflixStreams",
  vaplayer: "getVaplayerStreams",
  vidlink: "getVidlinkStreams",
  vixsrc: "getVixsrcStreams",
  zxcstreams: "getZxcstreamsStreams",
  netmirror: "getNetmirrorStreams",
  onetouchtv: "getOnetouchtvStreams",
  hdghartv: "getHdghartvStreams",
};

// Providers that depend on Node filesystem/network server APIs are intentionally
// not bundled in the Cloudflare build: Showbox, 4KHDHub.
// The remaining providers are Worker-compatible after replacing Axios with fetch.
const PROVIDERS = Object.keys(PROVIDER_MODULES);
const DEFAULT_PROVIDERS = PROVIDERS;
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function json(data, status=200, extra={}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", ...extra }
  });
}
function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
    "access-control-max-age": "86400",
  };
}
function withCors(resp) {
  const h = new Headers(resp.headers);
  Object.entries(corsHeaders()).forEach(([k,v])=>h.set(k,v));
  return new Response(resp.body, {status:resp.status, statusText:resp.statusText, headers:h});
}
async function loadKey(env) {
  const key = await env.TMDB_CONFIG.get("tmdb_api_key");
  if (key) setTmdbApiKey(key);
  return key;
}
async function keyIsValid(key) {
  if (!key) return false;
  try {
    const r = await fetch(`https://api.themoviedb.org/3/movie/550?api_key=${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(8000)
    });
    return r.ok;
  } catch { return false; }
}
function parseType(v) {
  if (v === "movie") return "movie";
  if (v === "series" || v === "tv") return "series";
  return null;
}
function cacheGet(k) {
  const hit = cache.get(k);
  if (hit && Date.now()-hit.ts < CACHE_TTL) return hit.data;
  if (hit) cache.delete(k);
  return null;
}
function cachePut(k, data) {
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  cache.set(k, {data, ts:Date.now()});
}
async function invokeProvider(name, args) {
  const mod = PROVIDER_MODULES[name];
  const fn = mod && mod[PROVIDER_FUNCS[name]];
  if (!fn) return [];
  try {
    const result = await fn(args.tmdbId, args.mediaType, args.season, args.episode);
    return Array.isArray(result) ? result.map(s=>({...s, provider:s.provider||name})) : [];
  } catch (e) {
    console.error(`[provider:${name}] ${e?.message || e}`);
    return [];
  }
}
async function streamResponse(type, tmdbId, url, providerOnly, env) {
  const season = url.searchParams.get("season") ? Number(url.searchParams.get("season")) : null;
  const episode = url.searchParams.get("episode") ? Number(url.searchParams.get("episode")) : null;
  const providers = providerOnly ? [providerOnly] : DEFAULT_PROVIDERS;
  if (providerOnly && !PROVIDERS.includes(providerOnly)) return json({success:false,error:"PROVIDER_NOT_FOUND"},404);

  const key = await loadKey(env);
  if (!key) return json({success:false,error:"TMDB_KEY_REQUIRED",message:"Open the setup page and save your TMDB API key once."},503);

  const cacheKey = `${type}:${tmdbId}:${season||""}:${episode||""}:${providers.join(",")}`;
  const cached = cacheGet(cacheKey);
  if (cached) return json(cached);

  const tmdbType = type === "movie" ? "movie" : "tv";
  const imdbId = await resolveImdbId(tmdbType, tmdbId);
  const args = { tmdbId, mediaType: type === "movie" ? "movie" : "tv", season, episode };
  const timings = {};
  const results = await Promise.all(providers.map(async name=>{
    const t=Date.now();
    const streams = await invokeProvider(name,args);
    timings[name]=Date.now()-t;
    return streams;
  }));
  const streams = applyFilters(results.flat(), "aggregate", null, null);
  const out = {success:true,tmdbId,imdbId,count:streams.length,providerTimings:timings,streams};
  cachePut(cacheKey,out);
  return json(out);
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") return new Response(null,{status:204,headers:corsHeaders()});

  if (path === "/api/setup/status") {
    const key = await env.TMDB_CONFIG.get("tmdb_api_key");
    return json({success:true,configured:!!key},200,corsHeaders());
  }

  if (path === "/api/setup" && request.method === "POST") {
    // First setup only. Once a key exists, the setup endpoint is locked.
    const existing = await env.TMDB_CONFIG.get("tmdb_api_key");
    if (existing) return json({success:false,error:"ALREADY_CONFIGURED",message:"TMDB key is already configured."},409,corsHeaders());
    let body={};
    try { body=await request.json(); } catch {}
    const key=String(body.tmdbApiKey||"").trim();
    if (!key || key.length < 20) return json({success:false,error:"INVALID_KEY"},400,corsHeaders());
    if (!(await keyIsValid(key))) return json({success:false,error:"TMDB_KEY_REJECTED",message:"That TMDB key could not be validated."},400,corsHeaders());
    await env.TMDB_CONFIG.put("tmdb_api_key",key);
    setTmdbApiKey(key);
    return json({success:true,message:"TMDB API key saved. You won't be asked again."},200,corsHeaders());
  }

  if (path === "/api/health") return json({ok:true,service:"tmdb-embed-api-cloudflare",time:new Date().toISOString()},200,corsHeaders());

  if (path === "/api/providers") {
    const configured = !!(await env.TMDB_CONFIG.get("tmdb_api_key"));
    return json({success:true,configured,providers:PROVIDERS.map(name=>({name,enabled:true}))},200,corsHeaders());
  }

  const m = path.match(/^\/api\/streams\/(movie|series)\/([^/]+)$/);
  if (m && request.method === "GET") return withCors(await streamResponse(m[1],m[2],url,null,env));

  const pm = path.match(/^\/api\/streams\/([^/]+)\/(movie|series)\/([^/]+)$/);
  if (pm && request.method === "GET") return withCors(await streamResponse(pm[2],pm[3],url,pm[1].toLowerCase(),env));

  return null;
}

export default {
  async fetch(request, env) {
    try {
      const api = await handleApi(request,env);
      if (api) return api;

      // Static setup page / assets.
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response("TMDB Embed API", {status:200,headers:{"content-type":"text/plain"}});
    } catch (e) {
      console.error(e);
      return withCors(json({success:false,error:"INTERNAL_ERROR",message:e?.message||"Unexpected error"},500));
    }
  }
};
