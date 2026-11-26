/* Logika halaman utama: deteksi otomatis, panggil API, simpan riwayat. */
(function () {
  const C = window.SkipCommon;
  const CFG = window.APP_CONFIG;
  const SERVICES = window.SERVICES;
  const $ = function (id) { return document.getElementById(id); };

  const input = $("url"), go = $("go"), box = $("box"), detectEl = $("detect"), out = $("out");
  let manualEndpoint = "";
  let lastDetected = "";

  function fx(name) { if (window.Sfx) window.Sfx.play(name); }
  function pulse(cls) {
    box.classList.remove("flash", "shake");
    void box.offsetWidth;
    box.classList.add(cls);
    setTimeout(function () { box.classList.remove(cls); }, 1000);
  }

  /* ---------- Tampilan deteksi ---------- */
  function renderDetect() {
    const url = C.extractUrl(input.value);
    const host = C.hostOf(url);
    const found = C.matchServices(host);
    const key = found.length ? found[0].endpoint : "";
    if (key && key !== lastDetected) fx("detect");
    lastDetected = key;
    detectEl.innerHTML = "";
    box.classList.remove("has-error");

    if (!input.value.trim()) {
      detectEl.append(C.el("span", { text: "Menunggu link" }));
      return { url: url, found: found };
    }
    if (!url) {
      detectEl.append(C.el("span", { text: "Belum terbaca sebagai link" }));
      return { url: url, found: found };
    }

    const lbl = C.el("span"), chip = C.el("span");
    function paintChip() {
      const man = manualEndpoint ? SERVICES.find(function (s) { return s.endpoint === manualEndpoint; }) : null;
      if (man) { lbl.textContent = "Dipilih manual"; chip.className = "chip"; chip.textContent = man.name; }
      else if (found.length) { lbl.textContent = "Terdeteksi"; chip.className = "chip"; chip.textContent = found[0].name; }
      else { lbl.textContent = host; chip.className = "chip none"; chip.textContent = "Dicoba lewat Universal"; }
    }
    paintChip();
    detectEl.append(lbl, chip);

    const sel = C.el("select", { "aria-label": "Pilih layanan manual" });
    sel.append(C.el("option", { value: "", text: "Otomatis" }));
    SERVICES.forEach(function (s) { sel.append(C.el("option", { value: s.endpoint, text: s.name })); });
    sel.value = manualEndpoint;
    sel.addEventListener("change", function () { manualEndpoint = sel.value; paintChip(); });
    detectEl.append(C.el("label", { class: "manual" }, [C.el("span", { text: "Layanan" }), sel]));

    return { url: url, found: found };
  }

  /* ---------- Membaca respons API ---------- */
  // Kunci yang biasa berisi link hasil, urut dari yang paling spesifik.
  const URL_KEYS = ["bypassed_url", "bypassedUrl", "bypass_url", "bypassed", "bypass", "result_url", "result",
    "destination_url", "destination", "final_url", "final", "original", "linkGo", "linkgo", "target", "redirect", "link", "data", "url"];
  const TEXT_KEYS = ["result", "data", "content", "message"];
  const SKIP_KEYS = /^(socialactions|social_actions|actions|steps|tasks)$/i;

  function hostOfUrl(u) { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch (e) { return ""; } }
  function normUrl(u) {
    try { const x = new URL(u); return hostOfUrl(u) + x.pathname.replace(/\/+$/, "") + x.search; } catch (e) { return String(u || "").trim(); }
  }
  function rank(k) { const i = URL_KEYS.indexOf(k); return i === -1 ? URL_KEYS.length : i; }

  // Kumpulkan semua link di respons beserta nama kunci dan kedalamannya.
  function walk(obj, key, depth, out) {
    if (obj == null || depth > 4) return;
    if (typeof obj === "string") { if (C.isHttp(obj)) out.push({ k: key, u: obj.trim(), d: depth }); return; }
    if (Array.isArray(obj)) { obj.forEach(function (v) { walk(v, key, depth + 1, out); }); return; }
    if (typeof obj === "object") {
      Object.keys(obj).forEach(function (k) { if (!SKIP_KEYS.test(k)) walk(obj[k], k, depth + 1, out); });
    }
  }

  // Pilih link tujuan: buang link asal yang dikirim pengguna, dahulukan link dengan domain berbeda
  // dari link asal (tujuan sebenarnya, bukan halaman perantara di domain yang sama), lalu urutan kunci.
  function findUrl(obj, input) {
    const all = [];
    walk(obj, "", 0, all);
    const inN = normUrl(input), inH = hostOfUrl(input);
    const cand = all.filter(function (c) { return normUrl(c.u) !== inN; });
    cand.sort(function (a, b) {
      const ah = hostOfUrl(a.u) !== inH ? 0 : 1, bh = hostOfUrl(b.u) !== inH ? 0 : 1;
      return ah - bh || rank(a.k) - rank(b.k) || a.d - b.d;
    });
    return cand.length ? cand[0].u : "";
  }

  function pickResult(obj, input) {
    const u = findUrl(obj, input);
    if (u) return u;
    // Tidak ada link: ambil teks hasil (misalnya isi paste atau kunci), bukan field seperti creator.
    if (obj && typeof obj === "object") {
      for (let i = 0; i < TEXT_KEYS.length; i++) {
        const v = obj[TEXT_KEYS[i]];
        if (typeof v === "string" && v.trim()) return v.trim();
      }
    }
    return "";
  }

  async function callEndpoint(endpoint, target) {
    const api = CFG.PROXY_URL + "?service=" + encodeURIComponent(endpoint) + "&url=" + encodeURIComponent(target);
    const res = await fetch(api);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}

    if (!res.ok) throw Object.assign(new Error((json && json.message) || ("Server membalas " + res.status)), { raw: json || text });
    if (json && (json.success === false || json.status === false || json.error)) {
      throw Object.assign(new Error(json.message || json.error || "Layanan menolak link ini"), { raw: json });
    }
    const picked = json ? pickResult(json, target) : text.trim();
    if (!picked) throw Object.assign(new Error("Respons tidak berisi link tujuan"), { raw: json || text });
    return { picked: picked, raw: json || text, endpoint: endpoint, provider: res.headers.get("X-Provider") || "",
      ms: (json && typeof json.execution_time_ms === "number") ? json.execution_time_ms : null };
  }

  /* ---------- Proses utama ---------- */
  async function run() {
    const d = renderDetect();
    if (!input.value.trim()) {
      showError("Link masih kosong", "Tempel link yang ingin dilewati, lalu tekan Bypass.");
      box.classList.add("has-error");
      return;
    }
    if (!d.url) {
      showError("Link tidak valid", "Pastikan link diawali https:// atau berupa alamat domain yang lengkap.");
      box.classList.add("has-error");
      return;
    }

    const endpoints = manualEndpoint ? [manualEndpoint] : d.found.map(function (s) { return s.endpoint; });
    if (!manualEndpoint && endpoints.indexOf("universal") === -1) endpoints.push("universal");

    go.disabled = true;
    go.replaceChildren(C.el("span", { class: "spin" }), document.createTextNode("Memproses"));
    out.innerHTML = "";

    let lastErr = null;
    const errs = [];
    for (let i = 0; i < endpoints.length; i++) {
      try {
        const r = await callEndpoint(endpoints[i], d.url);
        const svc = SERVICES.find(function (s) { return s.endpoint === r.endpoint; });
        C.addHistory({ url: d.url, host: C.hostOf(d.url), endpoint: r.endpoint, service: svc ? svc.name : r.endpoint, result: r.picked, provider: r.provider, ok: true });
        r.original = d.url;
        showResult(r);
        done();
        return;
      } catch (e) { lastErr = e; errs.push({ layanan: endpoints[i], pesan: e.message, detail: e.raw }); }
    }

    const first = SERVICES.find(function (s) { return s.endpoint === endpoints[0]; });
    C.addHistory({ url: d.url, host: C.hostOf(d.url), endpoint: endpoints[0], service: first ? first.name : endpoints[0], result: "", ok: false, error: errs.length ? errs[0].pesan : "Gagal" });

    const hint = lastErr instanceof TypeError
      ? "Tidak bisa menghubungi server. Periksa koneksi internet Anda lalu coba lagi."
      : "Coba lagi sebentar atau pilih layanan lain secara manual.";
    showError("Link gagal diproses", (errs.length ? errs[0].pesan : "Terjadi kesalahan") + ". " + hint, errs.length ? errs : null);
    done();
  }

  function done() { go.disabled = false; go.textContent = "Bypass"; stats(); }

  /* ---------- Render hasil ---------- */
  function showResult(r) {
    fx("success"); pulse("flash");
    const svc = SERVICES.find(function (s) { return s.endpoint === r.endpoint; });
    const ok = C.isHttp(r.picked);
    const card = C.el("div", { class: "card" });
    card.append(C.el("h2", { text: "Hasil bypass" }));
    if (svc) card.append(C.el("p", { class: "svc-name", text: "Lewat layanan " + svc.name + (r.provider ? " (server " + r.provider + ")" : "") + (r.ms != null ? ", " + r.ms + " ms" : "") }));

    const res = ok
      ? C.el("a", { class: "res", href: r.picked, target: "_blank", rel: "noopener noreferrer", text: r.picked })
      : C.el("div", { class: "res", text: r.picked });
    card.append(
      C.el("div", { class: "lbl", text: "Link bypass" }),
      res,
      C.el("div", { class: "lbl", text: "Link asli" }),
      C.el("div", { class: "orig", text: r.original || "" })
    );

    const act = C.el("div", { class: "actions" });
    if (ok) act.append(C.el("a", { class: "ghost solid", href: r.picked, target: "_blank", rel: "noopener noreferrer", text: "Buka link" }));
    const copy = C.el("button", { class: "ghost", type: "button", text: "Salin" });
    copy.addEventListener("click", function () { C.copyText(r.picked, copy, "Salin"); });
    const again = C.el("button", { class: "ghost", type: "button", text: "Link baru", onclick: function () {
      input.value = ""; out.innerHTML = ""; manualEndpoint = ""; renderDetect(); input.focus();
    } });
    act.append(copy, again);
    card.append(act);

    if (!ok) card.append(C.el("p", { class: "note", text: "Hasilnya bukan link, jadi tidak bisa dibuka langsung. Ini isi yang dikembalikan layanan." }));
    appendRaw(card, r.raw);
    out.innerHTML = "";
    out.append(card);
  }

  // Ubah daftar error percobaan menjadi baris teks yang mudah dibaca.
  function readable(raw) {
    if (!Array.isArray(raw)) return raw;
    const lines = [];
    raw.forEach(function (e) {
      const att = e && e.detail && e.detail.attempts;
      if (att && att.length) {
        att.forEach(function (a) { lines.push(a.provider + (a.endpoint ? " (" + a.endpoint + ")" : "") + ": " + a.message); });
      } else {
        lines.push((e && e.layanan ? e.layanan : "?") + ": " + (e && e.pesan ? e.pesan : "gagal"));
      }
    });
    return lines.filter(function (l, i) { return lines.indexOf(l) === i; }).join("\n");
  }

  function showError(title, msg, raw) {
    fx("error"); pulse("shake");
    const card = C.el("div", { class: "card err" }, [
      C.el("h2", { text: title }),
      C.el("p", { class: "note", text: msg })
    ]);
    if (raw) appendRaw(card, readable(raw));
    out.innerHTML = "";
    out.append(card);
  }

  function appendRaw(card, raw) {
    const pre = C.el("pre", { text: typeof raw === "string" ? raw : JSON.stringify(raw, null, 2) });
    card.append(C.el("details", { class: "raw" }, [C.el("summary", {}, [C.el("span", { text: "Respons mentah" })]), pre]));
  }

  /* ---------- Event ---------- */
  input.addEventListener("input", function () { manualEndpoint = ""; renderDetect(); });
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") run(); });
  input.addEventListener("paste", function () {
    setTimeout(function () { manualEndpoint = ""; const r = renderDetect(); if (r.url) run(); }, 0);
  });
  go.addEventListener("click", run);

  /* ---------- Mode banyak link ---------- */
  const modeBtns = document.querySelectorAll("[data-mode]");
  const singleEl = $("single"), bulkBox = $("bulkbox"), bulkTa = $("bulk"), bulkGo = $("bulkgo");

  function setMode(mode) {
    const bulk = mode === "bulk";
    modeBtns.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.mode === mode)); });
    singleEl.hidden = bulk; bulkBox.hidden = !bulk; detectEl.hidden = bulk;
    out.innerHTML = "";
    (bulk ? bulkTa : input).focus();
  }
  modeBtns.forEach(function (b) { b.addEventListener("click", function () { setMode(b.dataset.mode); }); });

  async function bypassOne(url) {
    const eps = C.matchServices(C.hostOf(url)).map(function (s) { return s.endpoint; });
    if (eps.indexOf("universal") === -1) eps.push("universal");
    let firstErr = null;
    for (let i = 0; i < eps.length; i++) {
      try {
        const r = await callEndpoint(eps[i], url);
        const svc = SERVICES.find(function (s) { return s.endpoint === r.endpoint; });
        C.addHistory({ url: url, host: C.hostOf(url), endpoint: r.endpoint, service: svc ? svc.name : r.endpoint, result: r.picked, provider: r.provider, ok: true });
        return r;
      } catch (e) { firstErr = firstErr || e; }
    }
    const s0 = SERVICES.find(function (s) { return s.endpoint === eps[0]; });
    C.addHistory({ url: url, host: C.hostOf(url), endpoint: eps[0], service: s0 ? s0.name : eps[0], result: "", ok: false, error: firstErr ? firstErr.message : "Gagal" });
    throw firstErr || new Error("Gagal");
  }

  bulkGo.addEventListener("click", async function () {
    const urls = [];
    bulkTa.value.split(/\n+/).forEach(function (line) {
      const u = C.extractUrl(line);
      if (u && urls.indexOf(u) === -1) urls.push(u);
    });
    if (!urls.length) { showError("Belum ada link", "Tempel satu link per baris."); return; }
    const list = urls.slice(0, 20);

    bulkGo.disabled = true; bulkGo.textContent = "Memproses";
    const sub = C.el("p", { class: "svc-name", text: "0 dari " + list.length + " selesai" + (urls.length > 20 ? " (maksimal 20 link)" : "") });
    const wrap = C.el("div", { class: "bl" });
    const rows = list.map(function (u) {
      const res = C.el("div", { class: "bres", text: "Menunggu" });
      const row = C.el("div", { class: "brow" }, [C.el("div", { class: "bsrc", text: u }), res]);
      wrap.append(row);
      return { row: row, res: res };
    });
    const card = C.el("div", { class: "card" }, [C.el("h2", { text: "Hasil bypass" }), sub, wrap]);
    out.innerHTML = ""; out.append(card);

    const results = [];
    let next = 0, finished = 0;
    async function worker() {
      while (next < list.length) {
        const i = next++;
        rows[i].res.textContent = "Memproses";
        try {
          const r = await bypassOne(list[i]);
          results.push(r.picked);
          rows[i].res.replaceChildren(C.isHttp(r.picked)
            ? C.el("a", { class: "h-text link", href: r.picked, target: "_blank", rel: "noopener noreferrer", text: r.picked })
            : C.el("span", { class: "h-text", text: r.picked }));
        } catch (e) {
          rows[i].row.classList.add("failrow");
          rows[i].res.textContent = "Gagal: " + (e && e.message ? e.message : "error");
        }
        finished++;
        sub.textContent = finished + " dari " + list.length + " selesai";
      }
    }
    await worker();

    fx(results.length ? "success" : "error"); pulse(results.length ? "flash" : "shake");
    sub.textContent = results.length + " berhasil dari " + list.length + " link";
    if (results.length) {
      const copy = C.el("button", { class: "ghost", type: "button", text: "Salin semua hasil" });
      copy.addEventListener("click", function () { C.copyText(results.join("\n"), copy, "Salin semua hasil"); });
      card.append(C.el("div", { class: "actions" }, [copy]));
    }
    bulkGo.disabled = false; bulkGo.textContent = "Bypass semua";
    stats();
  });

  /* ---------- Statistik perangkat dan status server ---------- */
  function stats() {
    const el = $("st-ok");
    if (el) el.textContent = C.readHistory().filter(function (x) { return x.ok; }).length;
  }
  (function initInfo() {
    const sv = $("st-svc");
    const total = SERVICES.filter(function (s) { return s.endpoint !== "universal"; }).length;
    if (sv) sv.textContent = total;
    const pl = document.querySelector(".pills span");
    if (pl) pl.textContent = total + " layanan";
    stats();
    C.syncFromServer().then(stats);
    const pill = $("status");
    if (!pill) return;
    function set(cls, text) { pill.className = "status " + cls; pill.querySelector("span").textContent = text; }
    fetch(CFG.PROXY_URL + "?health=1", { signal: AbortSignal.timeout(6000) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        // api/skip.js versi lama tidak punya ?health=1, jadi tidak ada daftar provider
        if (!j || !Array.isArray(j.providers)) { set("warn", "Status tidak tersedia, perbarui api/skip.js"); return; }
        const act = j.providers.filter(function (p) { return p.inOrder; });
        const n = act.filter(function (p) { return p.keySet; }).length;
        const pills = document.querySelectorAll(".pills span"), sb = document.querySelectorAll(".stats b");
        if (n && pills[2]) pills[2].textContent = n + " server otomatis";
        if (n && sb[2]) sb[2].textContent = n;
        if (n) { set("ok", "Operasional (" + n + " server)"); return; }
        const missing = act.filter(function (p) { return p.keyEnv && !p.keySet; }).map(function (p) { return p.keyEnv; });
        set("warn", "Key belum terbaca: " + (missing.join(", ") || "PROVIDER_ORDER kosong"));
      })
      .catch(function () { set("bad", "Server tidak terjangkau"); });
  })();

  // Dukungan ?url= (dipakai tombol "Skip lagi" di halaman riwayat)
  const preset = new URLSearchParams(location.search).get("url");
  if (preset) { input.value = preset; renderDetect(); run(); } else { renderDetect(); }
})();
