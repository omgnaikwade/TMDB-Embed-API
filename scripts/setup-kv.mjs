import { execFileSync } from "node:child_process";
import fs from "node:fs";

console.log("Creating Cloudflare KV namespace: TMDB_CONFIG...");
const raw = execFileSync("npx", ["wrangler","kv","namespace","create","TMDB_CONFIG","--json"], {encoding:"utf8",stdio:["inherit","pipe","pipe"]});
let data;
try { data = JSON.parse(raw); } catch {
  const match = raw.match(/"id"\s*:\s*"([^"]+)"/);
  if (!match) throw new Error("Could not read KV namespace ID from Wrangler output:\n"+raw);
  data = {id:match[1]};
}
const id = data.id || data.result?.id;
if (!id) throw new Error("KV namespace ID missing from Wrangler output:\n"+raw);
let cfg = fs.readFileSync("wrangler.toml","utf8");
cfg = cfg.replace("REPLACE_WITH_KV_NAMESPACE_ID", id);
fs.writeFileSync("wrangler.toml", cfg);
console.log("KV namespace created and wrangler.toml updated.");
console.log("Next: npm run deploy");
