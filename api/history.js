/*
  Backend riwayat per pengguna (Vercel Serverless Function + Upstash Redis lewat REST).
  Tidak butuh paket npm. Identitas pengguna = "kunci akun" acak yang dibuat server
  dan disimpan di browser; di database hanya disimpan hash-nya.

    POST   /api/history?action=new     buat kunci akun baru
    GET    /api/history                ambil riwayat
    POST   /api/history                tambah riwayat, body: { entries: [...] }
    DELETE /api/history?id=ID          hapus satu
    DELETE /api/history?all=1          hapus semua

  Semua (selain action=new) memakai header X-User-Key.

  Environment variable (otomatis ada setelah database Upstash Redis
  dihubungkan lewat tab Storage di Vercel):
    KV_REST_API_URL + KV_REST_API_TOKEN, atau
    UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
    ALLOWED_ORIGINS   opsional, origin tambahan dipisah koma
*/
const crypto = require("crypto");

const MAX_ITEMS = 200;
const TTL_SECONDS = 60 * 60 * 24 * 180; // riwayat tak aktif dihapus setelah 180 hari
const KEY_RE = /^u_[a-f0-9]{48}$/;

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

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  let host;
  try { host = new URL(origin).host; } catch (e) { return false; }
  if (host === req.headers.host) return true;
  const extra = (process.env.ALLOWED_ORIGINS || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  return extra.indexOf(origin) !== -1;
}

function str(v, max) { return typeof v === "string" ? v.slice(0, max) : ""; }

// Hanya field yang dikenal yang disimpan, dengan batas panjang.
function clean(e) {
  if (!e || typeof e !== "object") return null;
  const id = str(e.id, 40);
  const url = str(e.url, 2048);
  const time = Number(e.time);
  if (!/^[a-z0-9]{6,40}$/.test(id) || !url || !isFinite(time)) return null;
  const o = { id: id, time: time, url: url, host: str(e.host, 253), endpoint: str(e.endpoint, 40),
    service: str(e.service, 80), result: str(e.result, 2048), provider: str(e.provider, 30), ok: Boolean(e.ok) };
  if (e.error) o.error = str(e.error, 200);
  return o;
}

function parse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

module.exports = async function handler(req, res) {
  if (!cfg()) return send(res, 503, { success: false, message: "Backend belum dikonfigurasi" });
  if (req.method !== "GET" && !originAllowed(req)) return send(res, 403, { success: false, message: "Origin tidak diizinkan" });

  const q = req.query || {};

  try {
    if (req.method === "POST" && q.action === "new") {
      return send(res, 200, { success: true, uid: "u_" + crypto.randomBytes(24).toString("hex") });
    }

    const uid = String(req.headers["x-user-key"] || "");
    if (!KEY_RE.test(uid)) return send(res, 401, { success: false, message: "Kunci akun tidak valid" });
    const key = "skip:h:" + crypto.createHash("sha256").update(uid).digest("hex");

    if (req.method === "GET") {
      const r = await redis([["LRANGE", key, 0, MAX_ITEMS - 1]]);
      return send(res, 200, { success: true, items: (r[0] || []).map(parse).filter(Boolean) });
    }

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") body = parse(body);
      const incoming = (body && Array.isArray(body.entries) ? body.entries : []).slice(0, MAX_ITEMS).map(clean).filter(Boolean);
      if (!incoming.length) return send(res, 400, { success: false, message: "Tidak ada entri valid" });

      const cur = (await redis([["LRANGE", key, 0, MAX_ITEMS - 1]]))[0] || [];
      const ids = {};
      cur.forEach(function (s) { const o = parse(s); if (o && o.id) ids[o.id] = true; });
      const fresh = incoming.filter(function (e) { return !ids[e.id]; }).sort(function (a, b) { return a.time - b.time; });
      if (fresh.length) {
        await redis([
          ["LPUSH", key].concat(fresh.map(function (e) { return JSON.stringify(e); })),
          ["LTRIM", key, 0, MAX_ITEMS - 1],
          ["EXPIRE", key, TTL_SECONDS]
        ]);
      }
      return send(res, 200, { success: true, added: fresh.length });
    }

    if (req.method === "DELETE") {
      if (q.all) {
        await redis([["DEL", key]]);
        return send(res, 200, { success: true });
      }
      const id = String(q.id || "");
      if (!id) return send(res, 400, { success: false, message: "id kosong" });
      const cur = (await redis([["LRANGE", key, 0, MAX_ITEMS - 1]]))[0] || [];
      const raw = cur.find(function (s) { const o = parse(s); return o && o.id === id; });
      if (raw) await redis([["LREM", key, 1, raw]]);
      return send(res, 200, { success: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return send(res, 405, { success: false, message: "Metode tidak diizinkan" });
  } catch (e) {
    return send(res, 502, { success: false, message: "Backend sedang bermasalah" });
  }
};
