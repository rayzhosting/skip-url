/* Helper Redis (Upstash REST) bersama untuk api/skip.js dan api/admin.js.
   Berawalan "_" supaya tidak dijadikan endpoint oleh Vercel. */
function cfg() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token: token } : null;
}

async function redis(cmds) {
  const c = cfg();
  const r = await fetch(c.url + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + c.token, "Content-Type": "application/json" },
    body: JSON.stringify(cmds)
  });
  if (!r.ok) throw new Error("Redis HTTP " + r.status);
  const arr = await r.json();
  const bad = arr.find(function (x) { return x && x.error; });
  if (bad) throw new Error(String(bad.error));
  return arr.map(function (x) { return x.result; });
}

module.exports = { cfg: cfg, redis: redis };
