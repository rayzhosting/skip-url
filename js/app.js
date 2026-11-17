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

    if (found.length) {
      detectEl.append(
        C.el("span", { text: "Terdeteksi" }),
        C.el("span", { class: "chip", text: found[0].name })
      );
    } else {
      detectEl.append(
        C.el("span", { text: host }),
        C.el("span", { class: "chip none", text: "Dicoba lewat Universal" })
      );
    }

    const sel = C.el("select", { "aria-label": "Pilih layanan manual" });
    sel.append(C.el("option", { value: "", text: "Otomatis" }));
    SERVICES.forEach(function (s) { sel.append(C.el("option", { value: s.endpoint, text: s.name })); });
    sel.value = manualEndpoint;
    sel.addEventListener("change", function () { manualEndpoint = sel.value; });
    detectEl.append(C.el("label", { class: "manual" }, [C.el("span", { text: "Layanan" }), sel]));

    return { url: url, found: found };
  }

  /* ---------- Membaca respons API ---------- */
  // Kunci yang biasa berisi link hasil, urut dari yang paling spesifik.
  const URL_KEYS = ["bypassed_url", "bypassedUrl", "bypass_url", "bypassed", "bypass", "result_url", "result",
    "destination_url", "destination", "final_url", "final", "target", "redirect", "link", "data", "url"];
  const TEXT_KEYS = ["result", "data", "content", "message"];

  // Cari link http(s). Kunci "original_*" dilewati karena itu link asal, bukan hasil.
  function findUrl(obj, depth) {
    if (obj == null || depth > 4) return "";
    if (typeof obj === "string") return C.isHttp(obj) ? obj.trim() : "";
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) { const r = findUrl(obj[i], depth + 1); if (r) return r; }
      return "";
    }
    if (typeof obj === "object") {
      for (let i = 0; i < URL_KEYS.length; i++) {
        if (URL_KEYS[i] in obj) { const r = findUrl(obj[URL_KEYS[i]], depth + 1); if (r) return r; }
      }
      for (const k in obj) {
        if (/^original/i.test(k)) continue;
        const r = findUrl(obj[k], depth + 1);
        if (r) return r;
      }
    }
    return "";
  }

  function pickResult(obj) {
    const u = findUrl(obj, 0);
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
    const picked = json ? pickResult(json) : text.trim();
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
    for (let i = 0; i < endpoints.length; i++) {
      try {
        const r = await callEndpoint(endpoints[i], d.url);
        const svc = SERVICES.find(function (s) { return s.endpoint === r.endpoint; });
        C.addHistory({ url: d.url, host: C.hostOf(d.url), endpoint: r.endpoint, service: svc ? svc.name : r.endpoint, result: r.picked, provider: r.provider, ok: true });
        r.original = d.url;
        showResult(r);
        done();
        return;
      } catch (e) { lastErr = e; }
    }

    const first = SERVICES.find(function (s) { return s.endpoint === endpoints[0]; });
    C.addHistory({ url: d.url, host: C.hostOf(d.url), endpoint: endpoints[0], service: first ? first.name : endpoints[0], result: "", ok: false, error: lastErr ? lastErr.message : "Gagal" });

    const hint = lastErr instanceof TypeError
      ? "Tidak bisa menghubungi server. Periksa koneksi internet Anda lalu coba lagi."
      : "Coba lagi sebentar atau pilih layanan lain secara manual.";
    showError("Link gagal diproses", (lastErr ? lastErr.message : "Terjadi kesalahan") + ". " + hint, lastErr && lastErr.raw);
    done();
  }

  function done() { go.disabled = false; go.textContent = "Bypass"; }

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

  function showError(title, msg, raw) {
    fx("error"); pulse("shake");
    const card = C.el("div", { class: "card err" }, [
      C.el("h2", { text: title }),
      C.el("p", { class: "note", text: msg })
    ]);
    if (raw) appendRaw(card, raw);
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

  // Dukungan ?url= (dipakai tombol "Skip lagi" di halaman riwayat)
  const preset = new URLSearchParams(location.search).get("url");
  if (preset) { input.value = preset; renderDetect(); run(); } else { renderDetect(); }
})();
