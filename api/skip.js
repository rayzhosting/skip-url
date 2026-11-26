/*
  Proxy bypass multi-provider (Vercel Serverless Function).

  Browser memanggil:  GET /api/skip?service=sfl&url=https://sfl.gl/xxxx
  Server mencoba provider sesuai urutan, memakai API key dari environment
  variable, lalu meneruskan hasilnya. Provider pertama yang berhasil dipakai.
  Jika sebuah provider error (misalnya Bad Gateway), otomatis lanjut ke berikutnya.

  Environment variable (set di dashboard Vercel atau lewat `vercel env add`):
    THERESAV_API_KEY      key untuk api.theresav.com (provider "theresav")
    THERESAV_EU_API_KEY   key untuk api.theresav.eu (provider "theresav_eu"); jika kosong memakai THERESAV_API_KEY
    FGSI_API_KEY          key untuk fgsi.dpdns.org (provider "fgsi", opsional)
    PROVIDER_ORDER        urutan provider, default "theresav,theresav_eu,fgsi"
                          Nama yang tersedia: theresav, theresav_eu, fgsi, bypassvip (tidak dipakai)
                          Provider yang tidak ada di daftar ini TIDAK dipakai.
    THERESAV_BASE_URL     opsional, ganti alamat api.theresav.com
    THERESAV_EU_BASE_URL  opsional, ganti alamat api.theresav.eu
    FGSI_BASE_URL         opsional, ganti alamat FGSI
    ALLOWED_ORIGINS       opsional, origin tambahan dipisah koma

  Menambah provider baru: tambahkan satu objek di PROVIDERS di bawah.
*/

const R = require("./_redis");

const LOG_MAX = 1000;                     // jumlah log terbaru yang disimpan
const STAT_TTL = 60 * 60 * 24 * 90;       // statistik harian disimpan 90 hari

// ---- Info pengunjung untuk pemantauan pemilik ----
// Nama perangkat TIDAK bisa didapat dari IP. IP hanya memberi perkiraan lokasi (header geo Vercel).
// Model perangkat dibaca dari header User-Agent / Client Hints (Accept-CH di vercel.json).
function parseDevice(h) {
  const ua = String(h["user-agent"] || "");
  const hint = function (n) { return String(h[n] || "").replace(/^"|"$/g, "").trim(); };
  if (!ua) return "Tidak diketahui";
  if (/bot|crawl|spider|curl|wget|python|node-fetch|axios|okhttp|postman|httpclient|go-http|java\//i.test(ua)) {
    return "Skrip/bot (" + ua.slice(0, 40) + ")";
  }
  let dev = "", os = "", model = hint("sec-ch-ua-model");
  if (/Android/i.test(ua)) {
    os = "Android " + (hint("sec-ch-ua-platform-version") || (ua.match(/Android ([\d.]+)/) || [])[1] || "");
    if (!model) {
      const m = ua.match(/Android [\d.]+; ([^;)]+)/);
      if (m && !/^(K|Mobile|wv|Android)$/i.test(m[1].trim())) model = m[1].replace(/\s*Build\/.*/, "").trim();
    }
    dev = model || "Android";
  } else if (/iPhone|iPad|iPod/.test(ua)) {
    dev = ua.match(/iPhone|iPad|iPod/)[0];
    os = "iOS " + ((ua.match(/OS ([\d_]+)/) || [])[1] || "").replace(/_/g, ".");
  } else if (/Windows NT/.test(ua)) { dev = "PC"; os = "Windows"; }
  else if (/Mac OS X/.test(ua)) { dev = "Mac"; os = "macOS"; }
  else if (/CrOS/.test(ua)) { dev = "Chromebook"; os = "ChromeOS"; }
  else if (/Linux/.test(ua)) { dev = "PC"; os = "Linux"; }
  let br = "";
  // Urutan penting: Edge dan Opera juga mengandung kata "Chrome" di User-Agent-nya
  const known = [["Edg", "Edge"], ["OPR", "Opera"], ["SamsungBrowser", "Samsung Internet"], ["FxiOS", "Firefox"], ["Firefox", "Firefox"], ["CriOS", "Chrome"], ["Chrome", "Chrome"]];
  for (let i = 0; i < known.length && !br; i++) {
    const m = ua.match(new RegExp(known[i][0] + "\\/(\\d+)"));
    if (m) br = known[i][1] + " " + m[1];
  }
  if (!br && /Safari/.test(ua)) br = "Safari";
  return [dev, os.trim(), br].filter(Boolean).join(" · ");
}

function clientInfo(req) {
  const h = req.headers || {};
  const ip = String(h["x-vercel-forwarded-for"] || h["x-forwarded-for"] || h["x-real-ip"] || "").split(",")[0].trim().slice(0, 64);
  const dec = function (s) { try { return decodeURIComponent(s || ""); } catch (e) { return s || ""; } };
  const g = [dec(h["x-vercel-ip-city"]), h["x-vercel-ip-country-region"], h["x-vercel-ip-country"]].filter(Boolean).join(", ");
  return { ip: ip, g: g, d: parseDevice(h) };
}

// Ambil link hasil dari respons provider (untuk dicatat). Aturan sama dengan js/app.js:
// buang link asal, dahulukan link berdomain beda dari link asal, lalu urutan kunci.
function pickLink(text, input) {
  const isUrl = function (s) { return typeof s === "string" && /^https?:\/\/\S+$/i.test(s.trim()); };
  let obj;
  try { obj = JSON.parse(text); } catch (e) { const t = String(text || "").trim(); return isUrl(t) ? t : ""; }
  const KEYS = ["bypassed_url", "bypassedUrl", "bypass_url", "bypassed", "bypass", "result_url", "result",
    "destination_url", "destination", "final_url", "final", "original", "linkGo", "linkgo", "target", "redirect", "link", "data", "url"];
  const hostOf = function (u) { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch (e) { return ""; } };
  const norm = function (u) { try { const x = new URL(u); return hostOf(u) + x.pathname.replace(/\/+$/, "") + x.search; } catch (e) { return String(u || "").trim(); } };
  const rank = function (k) { const i = KEYS.indexOf(k); return i === -1 ? KEYS.length : i; };
  const all = [];
  (function walk(o, k, d) {
    if (o == null || d > 4) return;
    if (typeof o === "string") { if (isUrl(o)) all.push({ k: k, u: o.trim(), d: d }); return; }
    if (Array.isArray(o)) { o.forEach(function (v) { walk(v, k, d + 1); }); return; }
    if (typeof o === "object") {
      Object.keys(o).forEach(function (key) { if (!/^(socialactions|social_actions|actions|steps|tasks)$/i.test(key)) walk(o[key], key, d + 1); });
    }
  })(obj, "", 0);
  const inN = norm(input), inH = hostOf(input);
  const cand = all.filter(function (c) { return norm(c.u) !== inN; }).sort(function (a, b) {
    const ah = hostOf(a.u) !== inH ? 0 : 1, bh = hostOf(b.u) !== inH ? 0 : 1;
    return ah - bh || rank(a.k) - rank(b.k) || a.d - b.d;
  });
  return cand.length ? cand[0].u : "";
}

// Catat satu percobaan untuk pemantauan pemilik situs (lihat api/admin.js).
// Dicatat: waktu, layanan, link asal dan hasil, hasil proses, server, durasi, IP + perkiraan lokasi, jenis perangkat.
// Pengaturan di Vercel: LOG_URLS=0 (hanya host, tanpa link asal), LOG_RESULT=0 (tanpa link hasil), LOG_IP=0 (tanpa IP dan lokasi).
async function logEvent(ev) {
  if (!R.cfg()) return;
  try {
    const day = new Date(ev.t + 7 * 3600e3).toISOString().slice(0, 10); // hari WIB
    const sk = "skip:stat:" + day;
    const entry = { t: ev.t, s: ev.service, h: ev.host, ok: ev.ok, p: ev.provider || "", ms: ev.ms };
    if (process.env.LOG_URLS !== "0") entry.u = ev.url.slice(0, 300);
    if (ev.err) entry.e = String(ev.err).slice(0, 120);
    if (ev.link && process.env.LOG_RESULT !== "0") entry.r = String(ev.link).slice(0, 300);
    if (ev.who) {
      if (ev.who.d) entry.d = ev.who.d;
      if (process.env.LOG_IP !== "0") { if (ev.who.ip) entry.ip = ev.who.ip; if (ev.who.g) entry.g = ev.who.g; }
    }
    const cmds = [
      ["LPUSH", "skip:log", JSON.stringify(entry)],
      ["LTRIM", "skip:log", 0, LOG_MAX - 1],
      ["HINCRBY", sk, "all", 1],
      ["HINCRBY", sk, "s:" + ev.service, 1],
      ["EXPIRE", sk, STAT_TTL]
    ];
    if (ev.ok) {
      cmds.push(["HINCRBY", sk, "ok", 1], ["HINCRBY", sk, "so:" + ev.service, 1], ["HINCRBY", sk, "p:" + ev.provider, 1]);
    }
    await Promise.race([R.redis(cmds), new Promise(function (r) { setTimeout(r, 1500); })]);
  } catch (e) { /* pencatatan tidak boleh mengganggu hasil */ }
}

// Peta layanan Theresav: id layanan -> nama endpoint (nama sama). Dipakai bersama oleh .com dan .eu.
const THERESAV_MAP = [
  "adlinksumo", "adsafe", "bicolink", "biplab", "cutwin", "delta", "droplink",
  "earnlinks", "izen", "linkpays", "linkpoi", "linkvertise", "moneyblink",
  "move2link", "ouo", "sfl", "sub2unlock", "sub4unlock", "vplink", "pndk",
  "shrinkme", "tpi", "universal"
].reduce(function (m, k) { m[k] = k; return m; }, {});

const PROVIDERS = {
  theresav: {
    name: "Theresav",
    keyEnv: "THERESAV_API_KEY",
    baseEnv: "THERESAV_BASE_URL",
    base: "https://api.theresav.com/api/bypass/",
    auth: { type: "header", name: "x-api-key" },
    map: THERESAV_MAP
  },
  // Provider terpisah untuk alamat .eu (aktif jika "theresav_eu" ada di PROVIDER_ORDER)
  theresaveu: {
    name: "Theresav EU",
    keyEnv: "THERESAVEU_API_KEY",
    keyEnvAlt: "THERESAV_API_KEY", // bila key khusus .eu kosong, pakai key Theresav utama
    baseEnv: "THERESAVEU_BASE_URL",
    base: "https://api.theresav.eu/api/bypass/",
    auth: { type: "header", name: "x-apikey" },
    map: THERESAV_MAP
  },
  fgsi: {
    name: "FGSI",
    keyEnv: "FGSI_API_KEY",
    baseEnv: "FGSI_BASE_URL",
    base: "https://fgsi.dpdns.org/api/tools/skip/",
    auth: { type: "query", name: "apikey" },
    // satu id layanan boleh punya beberapa endpoint, dicoba berurutan
    map: {
      adlinks: "adlinks",
      adlinksumo: "adlinksumo",
      linkvertise: "linkvertise",
      ouo: "ouo",
      pastesites: "pastesites",
      sfl: ["tutwuri", "adlinks"],
      adsafe: "tutwuri",
      shorteners: "shorteners",
      shortig: "shortig",
      shortxlinks: "shortxlinks",
      socialunlocks: "socialunlocks",
      sub2unlock: "sub4unlock",
      sub4unlock: "sub4unlock",
      tpi: "adlinks"
    }
  },
  bypassvip: {
    name: "Bypass.vip",
    keyEnv: null, // tanpa API key (API gratis, jumlah request dibatasi)
    baseEnv: "BYPASSVIP_BASE_URL",
    base: "https://api.bypass.vip/",
    auth: { type: "none" },
    // satu endpoint untuk semua layanan; Bypass.vip mengenali link sendiri
    map: {
      linkvertise: "bypass", adlinks: "bypass", pastesites: "bypass", shorteners: "bypass",
      socialunlocks: "bypass", sub2unlock: "bypass", sub4unlock: "bypass", universal: "bypass"
    }
  }
};

function keyOf(p) { return (p.keyEnv && process.env[p.keyEnv]) || (p.keyEnvAlt && process.env[p.keyEnvAlt]) || ""; }
function isReady(p) { return !p.keyEnv || Boolean(keyOf(p)); }

// Sebagian layanan lambat (mis. bicolink bisa ±10 detik), jadi batasnya longgar.
const ATTEMPT_TIMEOUT_MS = 230000; // batas waktu per percobaan
const TOTAL_BUDGET_MS = 250000;    // batas total (maxDuration fungsi = 60 detik di vercel.json)

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // GET same-origin biasanya tanpa header Origin
  let host;
  try { host = new URL(origin).host; } catch (e) { return false; }
  if (host === req.headers.host) return true;
  const extra = (process.env.ALLOWED_ORIGINS || "")
    .split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  return extra.indexOf(origin) !== -1;
}

function providerOrder() {
  const raw = process.env.PROVIDER_ORDER || "theresav,theresav_eu,fgsi";
  const seen = {};
  return raw.split(",").map(function (s) { return s.trim().toLowerCase(); })
    .filter(function (id) {
      if (!PROVIDERS[id] || seen[id]) return false;
      seen[id] = true; return true;
    });
}

function allServices() {
  const set = {};
  Object.keys(PROVIDERS).forEach(function (id) {
    Object.keys(PROVIDERS[id].map).forEach(function (k) { set[k] = true; });
  });
  return set;
}

// Satu alamat per provider (bisa diganti lewat env baseEnv).
function baseOf(p) {
  const b = String((p.baseEnv && process.env[p.baseEnv]) || p.base).split(",")[0].trim();
  return b.slice(-1) === "/" ? b : b + "/";
}

function buildRequest(p, remote, target, key, baseUrl) {
  let base = baseUrl;
  if (base.slice(-1) !== "/") base += "/";
  const u = base + encodeURIComponent(remote) + "?";
  if (p.auth.type === "none") {
    return { url: u + "url=" + encodeURIComponent(target), headers: { Accept: "application/json, text/plain, */*" } };
  }
  if (p.auth.type === "header") {
    const headers = { Accept: "application/json, text/plain, */*" };
    headers[p.auth.name] = key;
    return { url: u + "url=" + encodeURIComponent(target), headers: headers };
  }
  return {
    url: u + p.auth.name + "=" + encodeURIComponent(key) + "&url=" + encodeURIComponent(target),
    headers: { Accept: "application/json, text/plain, */*" }
  };
}

function snippet(text) {
  return String(text || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

// Satu percobaan ke satu endpoint satu provider.
async function attempt(p, remote, target, key, timeoutMs, baseUrl) {
  const rq = buildRequest(p, remote, target, key, baseUrl);
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, timeoutMs);
  try {
    const r = await fetch(rq.url, { signal: ctrl.signal, headers: rq.headers });
    const text = await r.text();
    const type = r.headers.get("content-type") || "application/json; charset=utf-8";

    if (!r.ok) {
      return { ok: false, status: r.status, message: "HTTP " + r.status + (snippet(text) ? ": " + snippet(text) : "") };
    }
    if (!text.trim()) return { ok: false, status: r.status, message: "Respons kosong" };

    let json = null;
    try { json = JSON.parse(text); } catch (e) {}
    if (json && typeof json === "object" &&
        (json.success === false || json.status === false || json.ok === false ||
         (typeof json.status === "string" && /^(fail|error)/i.test(json.status)) ||
         (typeof json.error === "string" && json.error))) {
      return { ok: false, status: r.status, message: String(json.message || json.error || "Layanan menolak link").slice(0, 160) };
    }
    return { ok: true, status: r.status, text: text, type: type };
  } catch (e) {
    const timeout = Boolean(e && e.name === "AbortError");
    return { ok: false, status: 0, timeout: timeout, message: timeout ? "Timeout" : "Tidak bisa terhubung" };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { success: false, message: "Metode tidak diizinkan" });
  }
  if (!originAllowed(req)) {
    return send(res, 403, { success: false, message: "Origin tidak diizinkan" });
  }

  const q = req.query || {};

  // Cek konfigurasi: /api/skip?health=1 (hanya menampilkan ada/tidaknya key, bukan isinya)
  if (q.health) {
    const ord = providerOrder();
    return send(res, 200, {
      success: true,
      order: ord,
      providers: Object.keys(PROVIDERS).map(function (id) {
        return {
          id: id,
          inOrder: ord.indexOf(id) !== -1,
          keyEnv: PROVIDERS[id].keyEnv,
          keySet: isReady(PROVIDERS[id]),
          host: (function () { try { return new URL(baseOf(PROVIDERS[id])).host; } catch (e) { return ""; } })()
        };
      })
    });
  }

  const service = String(q.service || q.endpoint || "");
  const target = String(q.url || "");

  if (!allServices()[service]) {
    return send(res, 400, { success: false, message: "Layanan tidak dikenal" });
  }
  let parsed;
  try { parsed = new URL(target); } catch (e) { parsed = null; }
  if (!parsed || !/^https?:$/.test(parsed.protocol) || target.length > 2048) {
    return send(res, 400, { success: false, message: "URL tidak valid" });
  }

  const who = clientInfo(req);
  const order = providerOrder();
  const configured = order.filter(function (id) { return isReady(PROVIDERS[id]); });
  if (!configured.length) {
    return send(res, 500, {
      success: false,
      message: "Belum ada API key yang diatur di server (" +
        order.map(function (id) { return PROVIDERS[id].keyEnv; }).filter(Boolean).join(" / ") + ")"
    });
  }

  const started = Date.now();
  const attempts = [];

  for (let i = 0; i < configured.length; i++) {
    const id = configured[i];
    const p = PROVIDERS[id];
    const m = p.map[service];
    const remotes = m ? [].concat(m) : [];
    if (!remotes.length) {
      attempts.push({ provider: p.name, message: "Layanan ini tidak ada di provider ini" });
      continue;
    }
    const key = keyOf(p);

    for (let j = 0; j < remotes.length; j++) {
      const left = TOTAL_BUDGET_MS - (Date.now() - started);
      if (left < 1500) {
        attempts.push({ provider: p.name, endpoint: remotes[j], message: "Waktu habis" });
        await logEvent({ t: Date.now(), who: who, service: service, host: parsed.hostname.replace(/^www\./, ""), url: target, ok: false, ms: Date.now() - started, err: "Waktu habis" });
        return send(res, 504, { success: false, message: "Semua provider terlalu lama merespons", attempts: attempts });
      }
      const r = await attempt(p, remotes[j], target, key, Math.min(ATTEMPT_TIMEOUT_MS, left), baseOf(p));
      if (!r.ok) attempts.push({ provider: p.name, endpoint: remotes[j], status: r.status, message: r.message });
      if (r.ok) {
        await logEvent({ t: Date.now(), who: who, service: service, host: parsed.hostname.replace(/^www\./, ""), url: target, ok: true, link: pickLink(r.text, target), provider: p.name, ms: Date.now() - started });
        res.statusCode = 200;
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", r.type);
        res.setHeader("X-Provider", p.name);
        res.setHeader("X-Remote-Endpoint", remotes[j]);
        res.setHeader("Access-Control-Expose-Headers", "X-Provider, X-Remote-Endpoint");
        return res.end(r.text);
      }
    }
  }

  await logEvent({ t: Date.now(), who: who, service: service, host: parsed.hostname.replace(/^www\./, ""), url: target, ok: false, ms: Date.now() - started,
    err: attempts.map(function (a) { return a.provider + ": " + a.message; }).join("; ") });
  return send(res, 502, {
    success: false,
    message: "Semua provider gagal memproses link ini",
    attempts: attempts
  });
};
