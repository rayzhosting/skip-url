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
    return window.SERVICES.filter(function (s) {
      return s.domains.some(function (d) { return host === d || host.endsWith("." + d); });
    });
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

  function addHistory(entry) {
    const list = readHistory();
    entry.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    entry.time = Date.now();
    list.unshift(entry);
    writeHistory(list);
    return entry;
  }

  function removeHistory(id) {
    writeHistory(readHistory().filter(function (x) { return x.id !== id; }));
  }

  function clearHistory() {
    try { localStorage.removeItem(HISTORY_KEY); } catch (e) {}
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
    try { await navigator.clipboard.writeText(text); btn.textContent = "Tersalin"; }
    catch (e) { btn.textContent = "Gagal menyalin"; }
    setTimeout(function () { btn.textContent = idle; }, 1600);
  }

  window.SkipCommon = {
    extractUrl: extractUrl, hostOf: hostOf, matchServices: matchServices,
    readHistory: readHistory, addHistory: addHistory, removeHistory: removeHistory, clearHistory: clearHistory,
    el: el, isHttp: isHttp, timeAgo: timeAgo, copyText: copyText
  };
})();
