/* Fungsi bersama untuk semua halaman: deteksi link dan penyimpanan riwayat. */
(function () {
  const HISTORY_KEY = "skipurl.history.v1";
  const HISTORY_MAX = 200;

  /* ---------- Deteksi link ---------- */
  function extractUrl(text) {
    text = (text || "").trim();
    const m = text.match(/https?:\/\/[^\s"'<>]+/i);
    if (m) return m[0];
    const bare = text.match(/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i);
    return bare ? "https://" + bare[0] : "";
  }

  function hostOf(url) {
    try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); }
    catch (e) { return ""; }
  }

  function matchServices(host) {
    if (!host) return [];
    const scored = [];
    window.SERVICES.forEach(function (s) {
      let score = 0;
      if (s.domains.some(function (d) { return host === d || host.endsWith("." + d); })) score = 2;
      else if ((s.keywords || []).some(function (k) { return host.indexOf(k) !== -1; })) score = 1;
      if (score) scored.push({ s: s, score: score });
    });
    scored.sort(function (a, b) { return b.score - a.score; }); // pencocokan domain didahulukan
    return scored.map(function (x) { return x.s; });
  }

  /* ---------- Riwayat (per pengguna = per browser) ---------- */
  function readHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function writeHistory(list) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX))); return true; }
    catch (e) { return false; }
  }

  /* ---------- Sinkron ke backend (opsional, otomatis jika /api/history aktif) ---------- */
  const UID_KEY = "skipurl.uid";
  const PUSHED_KEY = "skipurl.pushed";
  const KEY_RE = /^u_[a-f0-9]{48}$/;
  let backendOff = false; // true jika backend belum dikonfigurasi atau tidak ada

  function lsGet(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function getUid() { return lsGet(UID_KEY); }

  async function api(method, qs, body) {
    const uid = getUid();
    const headers = { "Content-Type": "application/json" };
    if (uid) headers["X-User-Key"] = uid;
    const r = await fetch("/api/history" + (qs ? "?" + qs : ""), {
      method: method, headers: headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000)
    });
    if (r.status === 503 || r.status === 404) { backendOff = true; throw new Error("backend-off"); }
    const j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(j.message || ("HTTP " + r.status));
    return j;
  }

  async function ensureUid() {
    if (getUid()) return getUid();
    const j = await api("POST", "action=new");
    lsSet(UID_KEY, j.uid);
    return j.uid;
  }

  // Kirim riwayat lokal ke kunci akun ini sekali saja. true jika terkirim.
  async function pushIfNeeded() {
    const uid = getUid();
    if (lsGet(PUSHED_KEY) === uid) return false;
    const local = readHistory().slice(0, 200);
    if (local.length) await api("POST", "", { entries: local });
    lsSet(PUSHED_KEY, uid);
    return true;
  }

  async function remoteAdd(entry) {
    if (backendOff) return;
    try {
      await ensureUid();
      if (!(await pushIfNeeded())) await api("POST", "", { entries: [entry] });
    } catch (e) {}
  }

  // Ambil riwayat dari server (server dianggap sumber utama setelah kunci akun ada).
  async function syncFromServer(opt) {
    if (backendOff) return { ok: false };
    try {
      if (!getUid()) {
        if (!(opt && opt.create)) return { ok: false };
        await ensureUid();
      }
      await pushIfNeeded();
      const j = await api("GET");
      const items = (j.items || []).sort(function (a, b) { return b.time - a.time; });
      writeHistory(items);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // Pakai kunci akun dari perangkat lain.
  async function linkKey(key) {
    key = (key || "").trim();
    if (!KEY_RE.test(key)) return { ok: false, error: "Format kunci tidak valid" };
    lsSet(UID_KEY, key);
    return syncFromServer({ create: false });
  }

  /* ---------- Riwayat ---------- */
  function addHistory(entry) {
    const list = readHistory();
    entry.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    entry.time = Date.now();
    list.unshift(entry);
    writeHistory(list);
    remoteAdd(entry);
    return entry;
  }

  function removeHistory(id) {
    writeHistory(readHistory().filter(function (x) { return x.id !== id; }));
    if (getUid() && !backendOff) api("DELETE", "id=" + encodeURIComponent(id)).catch(function () {});
  }

  function clearHistory() {
    try { localStorage.removeItem(HISTORY_KEY); } catch (e) {}
    if (getUid() && !backendOff) api("DELETE", "all=1").catch(function () {});
  }

  /* ---------- Util tampilan ---------- */
  function el(tag, props, children) {
    const n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === "class") n.className = props[k];
      else if (k === "text") n.textContent = props[k];
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), props[k]);
      else n.setAttribute(k, props[k]);
    });
    (children || []).forEach(function (c) { if (c) n.append(c); });
    return n;
  }

  function isHttp(s) { return /^https?:\/\/\S+$/i.test((s || "").trim()); }

  function timeAgo(ts) {
    const diff = Math.round((ts - Date.now()) / 1000);
    const rtf = new Intl.RelativeTimeFormat("id", { numeric: "auto" });
    const steps = [["day", 86400], ["hour", 3600], ["minute", 60]];
    for (let i = 0; i < steps.length; i++) {
      if (Math.abs(diff) >= steps[i][1]) return rtf.format(Math.round(diff / steps[i][1]), steps[i][0]);
    }
    return "baru saja";
  }

  async function copyText(text, btn, idle) {
    try { await navigator.clipboard.writeText(text); btn.textContent = "Tersalin"; if (window.Sfx) window.Sfx.play("pop"); }
    catch (e) { btn.textContent = "Gagal menyalin"; }
    setTimeout(function () { btn.textContent = idle; }, 1600);
  }

  window.SkipCommon = {
    extractUrl: extractUrl, hostOf: hostOf, matchServices: matchServices,
    readHistory: readHistory, addHistory: addHistory, removeHistory: removeHistory, clearHistory: clearHistory,
    syncFromServer: syncFromServer, linkKey: linkKey, getUid: getUid,
    el: el, isHttp: isHttp, timeAgo: timeAgo, copyText: copyText
  };
})();
