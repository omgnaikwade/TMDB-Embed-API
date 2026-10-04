// Cloudflare-safe TMDB key holder.
// The key is loaded from KV once per request. It is never sent in API responses.
let currentKey = null;
function setTmdbApiKey(key) {
  currentKey = typeof key === 'string' && key.trim() ? key.trim() : null;
}
function getTmdbApiKey() {
  return currentKey;
}
module.exports = { getTmdbApiKey, setTmdbApiKey };
