/*
  Proxy untuk API skip URL (Vercel Serverless Function).

  Browser memanggil:  GET /api/skip?endpoint=ouo&url=https://ouo.io/xxxx
  Fungsi ini meneruskan ke API asli dengan API key dari environment variable,
  sehingga key tidak pernah dikirim ke browser dan tidak ada masalah CORS.

  Environment variable (set di dashboard Vercel):
    FGSI_API_KEY      wajib   API key dari fgsi.dpdns.org
    FGSI_BASE_URL     opsional, default https://fgsi.dpdns.org/api/tools/skip/
    ALLOWED_ORIGINS   opsional, daftar origin tambahan dipisah koma
                      (contoh: https://skip.domainanda.com)
*/

const ENDPOINTS = new Set([
  "adlinks", "adlinksumo", "linkvertise", "ouo", "pastesites", "tutwuri",
  "shorteners", "shortig", "shortxlinks", "socialunlocks", "sub4unlock"
]);

const DEFAULT_BASE = "https://fgsi.dpdns.org/api/tools/skip/";
const TIMEOUT_MS = 25000;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // permintaan same-origin GET biasanya tanpa header Origin
  let host;
  try { host = new URL(origin).host; } catch (e) { return false; }
  if (host === req.headers.host) return true;
  const extra = (process.env.ALLOWED_ORIGINS || "")
    .split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  return extra.indexOf(origin) !== -1;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { success: false, message: "Metode tidak diizinkan" });
  }
  if (!originAllowed(req)) {
    return send(res, 403, { success: false, message: "Origin tidak diizinkan" });
  }

  const apiKey = process.env.FGSI_API_KEY;
  if (!apiKey) {
    return send(res, 500, { success: false, message: "FGSI_API_KEY belum diatur di server" });
  }

  const q = req.query || {};
  const endpoint = String(q.endpoint || "");
  const target = String(q.url || "");

  if (!ENDPOINTS.has(endpoint)) {
    return send(res, 400, { success: false, message: "Endpoint tidak dikenal" });
  }

  let parsed;
  try { parsed = new URL(target); } catch (e) { parsed = null; }
  if (!parsed || !/^https?:$/.test(parsed.protocol) || target.length > 2048) {
    return send(res, 400, { success: false, message: "URL tidak valid" });
  }

  const base = process.env.FGSI_BASE_URL || DEFAULT_BASE;
  const upstream = base + endpoint +
    "?apikey=" + encodeURIComponent(apiKey) +
    "&url=" + encodeURIComponent(target);

  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);

  try {
    const r = await fetch(upstream, { signal: ctrl.signal, headers: { Accept: "application/json, text/plain, */*" } });
    const text = await r.text();
    res.statusCode = r.status;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", r.headers.get("content-type") || "application/json; charset=utf-8");
    return res.end(text);
  } catch (e) {
    const timeout = e && e.name === "AbortError";
    return send(res, timeout ? 504 : 502, {
      success: false,
      message: timeout ? "API tidak merespons tepat waktu" : "Tidak bisa menghubungi API"
    });
  } finally {
    clearTimeout(timer);
  }
};
