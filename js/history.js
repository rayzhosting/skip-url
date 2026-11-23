/* Halaman riwayat: daftar skip milik pengguna di browser ini. */
(function () {
  const C = window.SkipCommon;
  const $ = function (id) { return document.getElementById(id); };

  const listEl = $("list"), search = $("search"), summary = $("summary"), clearBtn = $("clear");
  let filter = "all";

  function matches(item, q) {
    if (filter === "ok" && !item.ok) return false;
    if (filter === "fail" && item.ok) return false;
    if (!q) return true;
    return [item.url, item.result, item.host, item.service].some(function (v) {
      return (v || "").toLowerCase().includes(q);
    });
  }

  function row(item) {
    const head = C.el("div", { class: "h-head" }, [
      C.el("span", { class: item.ok ? "chip" : "chip none", text: item.service || item.endpoint }),
      C.el("span", { class: "when", text: C.timeAgo(item.time), title: new Date(item.time).toLocaleString("id-ID") })
    ]);

    const body = [head];

    if (item.ok) {
      const ok = C.isHttp(item.result);
      body.push(C.el("div", { class: "h-line" }, [
        C.el("span", { class: "h-label", text: "Bypass" }),
        ok
          ? C.el("a", { class: "h-text link", href: item.result, target: "_blank", rel: "noopener noreferrer", text: item.result })
          : C.el("span", { class: "h-text", text: item.result })
      ]));
    } else {
      body.push(C.el("div", { class: "h-line" }, [
        C.el("span", { class: "h-label", text: "Gagal" }),
        C.el("span", { class: "h-text bad", text: item.error || "Tidak diketahui" })
      ]));
    }

    body.push(C.el("div", { class: "h-line" }, [
      C.el("span", { class: "h-label", text: "Asli" }),
      C.el("span", { class: "h-text muted", text: item.url })
    ]));

    const act = C.el("div", { class: "actions" });
    if (item.ok) {
      const copy = C.el("button", { class: "ghost", type: "button", text: "Salin hasil" });
      copy.addEventListener("click", function () { C.copyText(item.result, copy, "Salin hasil"); });
      act.append(copy);
    }
    act.append(
      C.el("a", { class: "ghost", href: "index.html?url=" + encodeURIComponent(item.url), text: "Bypass lagi" }),
      C.el("button", { class: "ghost", type: "button", text: "Hapus", onclick: function () {
        C.removeHistory(item.id); render();
      } })
    );
    body.push(act);

    return C.el("article", { class: "card h-item" }, body);
  }

  function render() {
    const all = C.readHistory();
    const q = search.value.trim().toLowerCase();
    const shown = all.filter(function (x) { return matches(x, q); });

    listEl.innerHTML = "";
    clearBtn.hidden = !all.length;

    if (!all.length) {
      summary.textContent = "Belum ada riwayat";
      listEl.append(C.el("div", { class: "empty" }, [
        C.el("p", { text: "Riwayat masih kosong." }),
        C.el("p", { class: "note", text: "Link yang Anda bypass akan muncul di sini." }),
        C.el("a", { class: "ghost solid", href: "index.html", text: "Bypass link pertama" })
      ]));
      return;
    }

    summary.textContent = shown.length === all.length
      ? all.length + " riwayat"
      : shown.length + " dari " + all.length + " riwayat";

    if (!shown.length) {
      listEl.append(C.el("div", { class: "empty" }, [C.el("p", { text: "Tidak ada riwayat yang cocok." })]));
      return;
    }
    shown.forEach(function (x) { listEl.append(row(x)); });
  }

  document.querySelectorAll("[data-filter]").forEach(function (b) {
    b.addEventListener("click", function () {
      filter = b.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach(function (x) {
        x.setAttribute("aria-pressed", String(x === b));
      });
      render();
    });
  });

  clearBtn.addEventListener("click", function () {
    if (confirm("Hapus semua riwayat di browser ini?")) { C.clearHistory(); render(); }
  });
  search.addEventListener("input", render);
  render();

  /* ---------- Sinkron antar perangkat ---------- */
  const syncEl = C.el("div", { class: "card sync" });
  syncEl.hidden = true;
  listEl.before(syncEl);

  let syncOpen = false;
  function paintSync(msg) {
    syncEl.innerHTML = "";
    const keyBtn = C.el("button", { class: "ghost", type: "button", text: "Salin kunci akun" });
    keyBtn.addEventListener("click", function () { C.copyText(C.getUid(), keyBtn, "Salin kunci akun"); });

    const inp = C.el("input", { type: "text", placeholder: "Tempel kunci dari perangkat lain", autocomplete: "off", spellcheck: "false", "aria-label": "Kunci akun dari perangkat lain" });
    const useBtn = C.el("button", { class: "ghost solid", type: "button", text: "Pakai kunci" });
    const note = C.el("p", { class: "note", text: msg || "" });
    useBtn.addEventListener("click", async function () {
      useBtn.disabled = true;
      const r = await C.linkKey(inp.value);
      useBtn.disabled = false;
      if (r.ok) { render(); paintSync("Terhubung. Riwayat dari kunci itu sudah dimuat."); }
      else note.textContent = r.error === "Format kunci tidak valid" ? r.error : "Gagal terhubung, coba lagi.";
    });

    const body = C.el("div", { class: "sync-body" }, [
      C.el("p", { class: "note", text: "Riwayat tersimpan di server dan terhubung ke kunci akun di perangkat ini. Pakai kunci yang sama di perangkat lain untuk melihat riwayat yang sama. Jangan bagikan kunci ini." }),
      C.el("div", { class: "actions" }, [keyBtn]),
      C.el("div", { class: "sync-form" }, [inp, useBtn]),
      note
    ]);
    const det = C.el("details", { class: "syncbox" }, [C.el("summary", {}, [C.el("span", { text: "Sinkron antar perangkat" })]), body]);
    det.open = syncOpen;
    det.addEventListener("toggle", function () { syncOpen = det.open; });
    syncEl.append(det);
    syncEl.hidden = false;
  }

  C.syncFromServer({ create: true }).then(function (r) {
    if (!r.ok) return; // backend belum aktif: tetap pakai riwayat di browser ini
    const sub = document.querySelector(".hero .sub");
    if (sub) sub.textContent = "Daftar link yang pernah Anda bypass. Tersimpan di server dan terhubung ke kunci akun perangkat ini.";
    render();
    paintSync("");
  });
})();
