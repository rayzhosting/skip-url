/*
  Proxy bypass multi-provider (Vercel Serverless Function).

  Browser memanggil:  GET /api/skip?service=sfl&url=https://sfl.gl/xxxx
  Server mencoba provider sesuai urutan, memakai API key dari environment
  variable, lalu meneruskan hasilnya. Provider pertama yang berhasil dipakai.
  Jika sebuah provider error (misalnya Bad Gateway), otomatis lanjut ke berikutnya.

  Environment variable (set di dashboard Vercel atau lewat `vercel env add`):
    THERESAV_API_KEY   key untuk api.theresav.com
    FGSI_API_KEY       key untuk fgsi.dpdns.org (opsional)
    PROVIDER_ORDER     urutan provider, default "theresav,fgsi"
                       contoh hanya theresav: theresav
    THERESAV_BASE_URL  opsional, ganti base URL Theresav
    FGSI_BASE_URL      opsional, ganti base URL FGSI
    ALLOWED_ORIGINS    opsional, origin tambahan dipisah koma

  Menambah provider baru: tambahkan satu objek di PROVIDERS di bawah.
*/

const PROVIDERS = {
  theresav: {
    name: "Theresav",
    keyEnv: "THERESAV_API_KEY",
    baseEnv: "THERESAV_BASE_URL",
    base: "https://api.theresav.com/api/bypass/",
    auth: { type: "header", name: "x-api-key" },
    // id layanan -> nama endpoint di provider (nama sama)
    map: [
      "adlinksumo", "adsafe", "bicolink", "biplab", "cutwin", "delta", "droplink",
      "earnlinks", "izen", "linkpays", "linkpoi", "linkvertise", "moneyblink",
      "move2link", "ouo", "sfl", "sub2unlock", "sub4unlock", "vplink", "pndk",
      "shrinkme", "tpi", "universal"
    ].reduce(function (m, k) { m[k] = k; return m; }, {})
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
  }
};

const ATTEMPT_TIMEOUT_MS = 10000; // batas waktu per percobaan
const TOTAL_BUDGET_MS = 27000;    // batas total (maxDuration fungsi = 30 detik)

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
  const raw = process.env.PROVIDER_ORDER || "theresav,fgsi";
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

function buildRequest(p, remote, target, key) {
  let base = process.env[p.baseEnv] || p.base;
  if (base.slice(-1) !== "/") base += "/";
  const u = base + encodeURIComponent(remote) + "?";
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
async function attempt(p, remote, target, key, timeoutMs) {
  const rq = buildRequest(p, remote, target, key);
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
         (typeof json.error === "string" && json.error))) {
      return { ok: false, status: r.status, message: String(json.message || json.error || "Layanan menolak link").slice(0, 160) };
    }
    return { ok: true, status: r.status, text: text, type: type };
  } catch (e) {
    return { ok: false, status: 0, message: e && e.name === "AbortError" ? "Timeout" : "Tidak bisa terhubung" };
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
          keySet: Boolean(process.env[PROVIDERS[id].keyEnv])
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

  const order = providerOrder();
  const configured = order.filter(function (id) { return process.env[PROVIDERS[id].keyEnv]; });
  if (!configured.length) {
    return send(res, 500, {
      success: false,
      message: "Belum ada API key yang diatur di server (" +
        order.map(function (id) { return PROVIDERS[id].keyEnv; }).join(" / ") + ")"
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
    const key = process.env[p.keyEnv];

    for (let j = 0; j < remotes.length; j++) {
      const left = TOTAL_BUDGET_MS - (Date.now() - started);
      if (left < 1500) {
        attempts.push({ provider: p.name, endpoint: remotes[j], message: "Waktu habis" });
        return send(res, 504, { success: false, message: "Semua provider terlalu lama merespons", attempts: attempts });
      }
      const r = await attempt(p, remotes[j], target, key, Math.min(ATTEMPT_TIMEOUT_MS, left));
      if (r.ok) {
        res.statusCode = 200;
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", r.type);
        res.setHeader("X-Provider", p.name);
        res.setHeader("X-Remote-Endpoint", remotes[j]);
        res.setHeader("Access-Control-Expose-Headers", "X-Provider, X-Remote-Endpoint");
        return res.end(r.text);
      }
      attempts.push({ provider: p.name, endpoint: remotes[j], status: r.status, message: r.message });
    }
  }

  return send(res, 502, {
    success: false,
    message: "Semua provider gagal memproses link ini",
    attempts: attempts
  });
};
