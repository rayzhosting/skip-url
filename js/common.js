/* Fungsi bersama: deteksi link, riwayat, tema, toast, pengaturan API key, util tampilan. */
(function () {
  const HISTORY_KEY = "skipurl.history.v2";
  const HISTORY_MAX = 500;
  const SETTINGS_KEY = "skipurl.settings.v1";

  /* ---------- Pengaturan (API key opsional, disimpan lokal) ---------- */
  function readSettings() {
    try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); return s && typeof s === "object" ? s : {}; }
    catch (e) { return {}; }
  }
  function saveSettings(patch) {
    const s = Object.assign(readSettings(), patch);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
    return s;
  }

  /* ---------- API base: proxy /api/skip bila ada, atau langsung + apikey ---------- */
  function apiFetch(endpoint, target) {
    const s = readSettings();
    const direct = s.apiBase || "https://fgsi.dpdns.org/api/tools/skip/";
    const withKey = s.apiKey ? direct + endpoint + "?apikey=" + encodeURIComponent(s.apiKey) + "&url=" + encodeURIComponent(target) : null;
    if (s.apiKey && !s.forceProxy) return fetch(withKey, { headers: { Accept: "application/json, text/plain, */*" } });
    // coba proxy lokal dulu; kalau 404/405 (serverless tidak ada), pakai langsung
    return fetch("/api/skip?endpoint=" + encodeURIComponent(endpoint) + "&url=" + encodeURIComponent(target))
      .then(function (r) {
        if (r.status === 404 || r.status === 405) return Promise.reject({ noProxy: true });
        return r;
      })
      .catch(function (e) {
        if (e && e.noProxy) {
          if (!s.apiKey) return Promise.reject(new Error("__NEED_KEY__"));
          return fetch(withKey, { headers: { Accept: "application/json, text/plain, */*" } });
        }
        throw e;
      });
  }

  /* ---------- Toast ---------- */
  let toastWrap = null;
  function ensureToasts() {
    if (!toastWrap) {
      toastWrap = document.createElement("div");
      toastWrap.className = "toasts";
      toastWrap.setAttribute("aria-live", "polite");
      document.body.append(toastWrap);
    }
    return toastWrap;
  }
  function toast(msg, kind) {
    const t = document.createElement("div");
    t.className = "toast" + (kind ? " " + kind : "");
    t.textContent = msg;
    ensureToasts().append(t);
    setTimeout(function () { t.classList.add("out"); setTimeout(function () { t.remove(); }, 260); }, 2600);
  }

  /* ---------- Tema ---------- */
  const THEME_KEY = "skipurl.theme";
  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    const dark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    apply(dark);
    const btn = document.getElementById("theme");
    if (btn) {
      paintTheme(btn, dark);
      btn.addEventListener("click", function () {
        const now = document.documentElement.dataset.theme !== "dark";
        apply(now);
        try { localStorage.setItem(THEME_KEY, now ? "dark" : "light"); } catch (e) {}
        paintTheme(btn, now);
        if (window.Sfx) window.Sfx.play("pop");
      });
    }
  }
  function apply(dark) { document.documentElement.dataset.theme = dark ? "dark" : "light"; }
  function paintTheme(btn, dark) {
    btn.innerHTML = dark
      ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M20 13.2A8.2 8.2 0 1 1 10.8 4a6.6 6.6 0 0 0 9.2 9.2z"/></svg>';
    btn.title = dark ? "Mode terang" : "Mode gelap";
  }

  /* ---------- Dialog pengaturan ---------- */
  function openSettings() {
    let dlg = document.getElementById("settings-dlg");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "settings-dlg";
      dlg.innerHTML =
        '<h2>Pengaturan</h2>' +
        '<p class="hint">API key dari fgsi.dpdns.org disimpan hanya di browser ini dan dipakai untuk memanggil API secara langsung tanpa server.</p>' +
        '<label for="set-key">API key (opsional jika pakai proxy /api/skip)</label>' +
        '<input id="set-key" type="password" placeholder="FGSI API key" autocomplete="off">' +
        '<label for="set-base">Base URL API (opsional)</label>' +
        '<input id="set-base" type="text" placeholder="https://fgsi.dpdns.org/api/tools/skip/">' +
        '<div class="actions"><button class="ghost" type="button" id="set-cancel">Tutup</button>' +
        '<button class="ghost solid" type="button" id="set-save">Simpan</button></div>';
      document.body.append(dlg);
    }
    const s = readSettings();
    dlg.querySelector("#set-key").value = s.apiKey || "";
    dlg.querySelector("#set-base").value = s.apiBase || "";
    dlg.querySelector("#set-cancel").onclick = function () { dlg.close(); };
    dlg.querySelector("#set-save").onclick = function () {
      const key = dlg.querySelector("#set-key").value.trim();
      const base = dlg.querySelector("#set-base").value.trim();
      saveSettings({ apiKey: key || "", apiBase: base || "" });
      dlg.close();
      toast("Pengaturan disimpan", "ok");
      if (window.Sfx) window.Sfx.play("success");
      document.dispatchEvent(new CustomEvent("skipurl:settings"));
    };
    dlg.showModal();
    dlg.querySelector("#set-key").focus();
  }

  /* ---------- Percikan klik & confetti ---------- */
  const SPARK_COLORS = ["#1f4dff", "#5b3df0", "#4ade80", "#ffb020", "#ff5d8f"];
  function sparks(x, y) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (let i = 0; i < 7; i++) {
      const p = document.createElement("span");
      p.className = "spark";
      const size = 4 + Math.random() * 5;
      p.style.width = size + "px"; p.style.height = size + "px";
      p.style.left = x + "px"; p.style.top = y + "px";
      p.style.background = SPARK_COLORS[i % SPARK_COLORS.length];
      p.style.setProperty("--dx", (Math.random() * 90 - 45) + "px");
      p.style.setProperty("--dy", (Math.random() * -70 - 10) + "px");
      document.body.append(p);
      setTimeout(function () { p.remove(); }, 650);
    }
  }
  function confetti() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = ["#1f4dff", "#7d4dff", "#4ade80", "#ffd76a", "#ff5d8f"];
    for (let i = 0; i < 46; i++) {
      const c = document.createElement("span");
      c.className = "confetti";
      const w = 6 + Math.random() * 6;
      c.style.width = w + "px"; c.style.height = (w * 0.45) + "px";
      c.style.left = Math.random() * 100 + "vw";
      c.style.background = colors[i % colors.length];
      c.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
      c.style.animationDuration = (1.4 + Math.random() * 1.2) + "s";
      c.style.animationDelay = (Math.random() * 0.3) + "s";
      document.body.append(c);
      setTimeout(function () { c.remove(); }, 3200);
    }
  }

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

  /* ---------- Riwayat (per browser) ---------- */
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
  function removeHistory(id) { writeHistory(readHistory().filter(function (x) { return x.id !== id; })); }
  function clearHistory() { try { localStorage.removeItem(HISTORY_KEY); } catch (e) {} }
  function exportHistory() {
    const blob = new Blob([JSON.stringify(readHistory(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "skipurl-riwayat.json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
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
    try { await navigator.clipboard.writeText(text); btn.textContent = "Tersalin"; if (window.Sfx) window.Sfx.play("pop"); toast("Berhasil disalin", "ok"); }
    catch (e) { btn.textContent = "Gagal menyalin"; toast("Gagal menyalin", "bad"); }
    setTimeout(function () { btn.textContent = idle; }, 1600);
  }
  async function shareUrl(url, title) {
    try {
      if (navigator.share) { await navigator.share({ title: title || "Link hasil bypass", url: url }); }
      else { await navigator.clipboard.writeText(url); toast("Link disalin (bagikan manual)", "ok"); }
    } catch (e) {}
  }
  function qrUrl(u) { return "https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=" + encodeURIComponent(u); }

  /* ---------- Pangkas URL panjang untuk tampilan ---------- */
  function shortUrl(u, n) {
    n = n || 64;
    return u.length > n ? u.slice(0, n - 1) + "…" : u;
  }

  window.SkipCommon = {
    extractUrl: extractUrl, hostOf: hostOf, matchServices: matchServices,
    readHistory: readHistory, addHistory: addHistory, removeHistory: removeHistory, clearHistory: clearHistory, exportHistory: exportHistory,
    readSettings: readSettings, saveSettings: saveSettings, apiFetch: apiFetch, openSettings: openSettings,
    el: el, isHttp: isHttp, timeAgo: timeAgo, copyText: copyText, shareUrl: shareUrl, qrUrl: qrUrl, shortUrl: shortUrl,
    toast: toast, sparks: sparks, confetti: confetti, initTheme: initTheme
  };
})();
