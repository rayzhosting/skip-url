/*
  Pemantauan khusus pemilik situs (dilindungi ADMIN_KEY).

    GET    /api/admin?days=7&limit=100   ringkasan statistik + aktivitas terbaru
    DELETE /api/admin                    hapus log dan statistik

  Header: X-Admin-Key: <ADMIN_KEY>
  Environment variable: ADMIN_KEY (minimal 12 karakter, makin panjang makin aman).
  Data diisi oleh api/skip.js: waktu, layanan, link asal dan hasil, berhasil atau tidak,
  server yang dipakai, durasi, IP + perkiraan lokasi, dan jenis perangkat (lihat LOG_* di api/skip.js).
*/
const crypto = require("crypto");
const R = require("./_redis");

const LOG_KEY = "skip:log";
const MAX_DAYS = 30;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}
function digest(s) { return crypto.createHash("sha256").update(String(s)).digest(); }
function parse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
// Hari menurut WIB (UTC+7), offset = berapa hari ke belakang
function dayKey(offset) { return new Date(Date.now() + 7 * 3600e3 - offset * 86400e3).toISOString().slice(0, 10); }
function toObj(flat) {
  const o = {};
  if (Array.isArray(flat)) { for (let i = 0; i + 1 < flat.length; i += 2) o[flat[i]] = Number(flat[i + 1]); }
  else if (flat && typeof flat === "object") { Object.keys(flat).forEach(function (k) { o[k] = Number(flat[k]); }); }
  return o;
}

module.exports = async function handler(req, res) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || adminKey.length < 12) return send(res, 503, { success: false, message: "ADMIN_KEY belum diatur (minimal 12 karakter)" });
  if (!R.cfg()) return send(res, 503, { success: false, message: "Backend belum dikonfigurasi" });

  try {
    // Batasi percobaan menebak kunci: 8 kali salah per 15 menit per alamat (hanya hash yang disimpan)
    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "x";
    const failKey = "skip:adm:f:" + crypto.createHash("sha256").update(ip + adminKey).digest("hex").slice(0, 24);
    const fails = Number((await R.redis([["GET", failKey]]))[0] || 0);
    if (fails >= 8) return send(res, 429, { success: false, message: "Terlalu banyak percobaan, coba lagi nanti" });

    const given = String(req.headers["x-admin-key"] || "");
    if (!crypto.timingSafeEqual(digest(given), digest(adminKey))) {
      await R.redis([["INCR", failKey], ["EXPIRE", failKey, 900]]);
      return send(res, 401, { success: false, message: "Kunci admin salah" });
    }

    const q = req.query || {};

    if (req.method === "GET") {
      const days = Math.min(Math.max(parseInt(q.days, 10) || 7, 1), MAX_DAYS);
      const limit = Math.min(Math.max(parseInt(q.limit, 10) || 100, 1), 300);
      const cmds = [["LRANGE", LOG_KEY, 0, limit - 1]];
      for (let i = 0; i < days; i++) cmds.push(["HGETALL", "skip:stat:" + dayKey(i)]);
      const r = await R.redis(cmds);
      const daysOut = [];
      for (let i = 0; i < days; i++) daysOut.push(Object.assign({ d: dayKey(i) }, toObj(r[i + 1])));
      return send(res, 200, { success: true, days: daysOut, log: (r[0] || []).map(parse).filter(Boolean) });
    }

    if (req.method === "DELETE") {
      const cmds = [["DEL", LOG_KEY]];
      for (let i = 0; i < 90; i++) cmds.push(["DEL", "skip:stat:" + dayKey(i)]);
      await R.redis(cmds);
      return send(res, 200, { success: true });
    }

    res.setHeader("Allow", "GET, DELETE");
    return send(res, 405, { success: false, message: "Metode tidak diizinkan" });
  } catch (e) {
    return send(res, 502, { success: false, message: "Backend sedang bermasalah" });
  }
};
