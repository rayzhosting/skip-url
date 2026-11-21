/* Halaman riwayat: statistik, filter, pencarian, ekspor JSON. */
(function () {
  const C = window.SkipCommon;
  const $ = function (id) { return document.getElementById(id); };

  const listEl = $("list"), search = $("search"), summary = $("summary"), clearBtn = $("clear"), exportBtn = $("export"), statsEl = $("stats");
  let filter = "all";

  function matches(item, q) {
    if (filter === "ok" && !item.ok) return false;
    if (filter === "fail" && item.ok) return false;
    if (!q) return true;
    return [item.url, item.result, item.host, item.service].some(function (v) {
      return (v || "").toLowerCase().includes(q);
    });
  }

  function renderStats(all) {
    if (!all.length) { statsEl.hidden = true; return; }
    const ok = all.filter(function (x) { return x.ok; }).length;
    const rate = all.length ? Math.round((ok / all.length) * 100) : 0;
    const today = all.filter(function (x) { return Date.now() - x.time < 86400000; }).length;
    statsEl.hidden = false;
    statsEl.innerHTML = "";
    statsEl.append(
      C.el("div", { class: "stat" }, [C.el("b", { text: String(all.length) }), C.el("span", { text: "Total bypass" })]),
      C.el("div", { class: "stat" }, [C.el("b", { text: String(ok) }), C.el("span", { text: "Berhasil" })]),
      C.el("div", { class: "stat" }, [C.el("b", { text: rate + "%" }), C.el("span", { text: "Tingkat sukses" })]),
      C.el("div", { class: "stat" }, [C.el("b", { text: String(today) }), C.el("span", { text: "24 jam terakhir" })])
    );
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
          ? C.el("a", { class: "h-text link", href: item.result, target: "_blank", rel: "noopener noreferrer", title: item.result, text: C.shortUrl(item.result, 72) })
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
      C.el("span", { class: "h-text muted", title: item.url, text: C.shortUrl(item.url, 60) })
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
        C.removeHistory(item.id); render(); C.toast("Riwayat dihapus");
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
    clearBtn.hidden = exportBtn.hidden = !all.length;
    renderStats(all);

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
    if (confirm("Hapus semua riwayat di browser ini?")) { C.clearHistory(); render(); C.toast("Semua riwayat dihapus"); }
  });
  exportBtn.addEventListener("click", function () {
    C.exportHistory();
    C.toast("File riwayat diunduh", "ok");
    if (window.Sfx) window.Sfx.play("success");
  });
  search.addEventListener("input", render);
  render();
})();
