/* Halaman domain: daftar layanan dan domain, dengan pencarian. */
(function () {
  const C = window.SkipCommon;
  const SERVICES = window.SERVICES;
  const $ = function (id) { return document.getElementById(id); };

  const list = $("list"), search = $("search"), summary = $("summary");

  const total = SERVICES.reduce(function (n, s) { return n + s.domains.length; }, 0);

  function render() {
    let q = search.value.trim().toLowerCase();
    // jika yang diketik berupa link, ambil domainnya saja
    const asUrl = C.extractUrl(q);
    if (asUrl && /^https?:\/\//i.test(q)) q = C.hostOf(asUrl);

    list.innerHTML = "";
    let shownServices = 0, shownDomains = 0;

    SERVICES.forEach(function (s) {
      const nameHit = q && (s.name.toLowerCase().includes(q) || s.endpoint.includes(q));
      const domains = q && !nameHit
        ? s.domains.filter(function (d) { return d.includes(q) || (q.endsWith("." + d)) || q === d; })
        : s.domains;
      if (!domains.length) return;

      shownServices++;
      shownDomains += domains.length;

      const chips = C.el("div", { class: "doms" });
      domains.forEach(function (d) {
        const hit = q && (d.includes(q) || q === d);
        chips.append(C.el("span", { class: hit ? "hit" : "", text: d }));
      });

      const det = C.el("details", { class: "svc" }, [
        C.el("summary", {}, [
          C.el("span", {}, [document.createTextNode(s.name + " "), C.el("small", { text: s.endpoint })]),
          C.el("span", { class: "count", text: domains.length + " domain" })
        ]),
        chips
      ]);
      if (q) det.open = true;
      list.append(det);
    });

    if (!shownServices) {
      list.append(C.el("div", { class: "empty" }, [
        C.el("p", { text: "Domain tidak ditemukan." }),
        C.el("p", { class: "note", text: "Layanan ini belum didukung. Coba kata kunci lain, atau cek ejaan domainnya." })
      ]));
      summary.textContent = "0 hasil";
    } else {
      summary.textContent = q
        ? shownDomains + " domain di " + shownServices + " layanan"
        : total + " domain di " + SERVICES.length + " layanan";
    }
  }

  search.addEventListener("input", render);
  render();
})();
