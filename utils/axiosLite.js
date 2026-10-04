// Tiny Axios-compatible GET/HEAD/POST subset for Cloudflare Workers.
// Only implements the features used by the bundled providers.
function normalizeHeaders(headers) {
  const out = {};
  if (!headers) return out;
  if (typeof headers.forEach === 'function') headers.forEach((v,k)=>{out[k]=v;});
  else Object.assign(out, headers);
  return out;
}
function timeoutSignal(ms) {
  if (!ms) return undefined;
  return AbortSignal.timeout(Number(ms));
}
async function request(method, url, options={}) {
  const headers = options.headers || {};
  const controller = new AbortController();
  let timer = null;
  if (options.timeout) timer = setTimeout(()=>controller.abort(), Number(options.timeout));
  try {
    const init = { method, headers, signal: controller.signal };
    if (options.body !== undefined) init.body = options.body;
    const res = await fetch(url, init);
    const text = await res.text();
    let data = text;
    const ct = res.headers.get('content-type') || '';
    if (options.responseType === 'text') data = text;
    else if (ct.includes('application/json')) {
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    } else {
      try { data = text ? JSON.parse(text) : text; } catch {}
    }
    return { data, status: res.status, statusText: res.statusText, headers: normalizeHeaders(res.headers), ok: res.ok };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
module.exports = {
  get: (url, options={}) => request('GET', url, options),
  head: (url, options={}) => request('HEAD', url, options),
  post: (url, data, options={}) => request('POST', url, { ...options, body: data })
};
