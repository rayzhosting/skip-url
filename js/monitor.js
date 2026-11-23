/* Halaman pemantauan pemilik: membaca /api/admin dengan kunci admin (disimpan di sesi tab saja). */
(function () {
  const C = window.SkipCommon;
  const $ = function (id) { return document.getElementById(id); };
  const KEY = "skipurl.admin";
  const names = {};
  window.SERVICES.forEach(function (s) { names[s.endpoint] = s.name; });

  let data = null, filter = "all", timer = null;

  function adminKey() { try { return sessionStorage.getItem(KEY) || ""; } catch (e) { return ""; } }
  function setKey(v) { try { if (v) sessionStorage.setItem(KEY, v); else sessionStorage.removeItem(KEY); } catch (e) {} }

  async function call(method, qs) {
    const r = await fetch("/api/admin" + (qs ? "?" + qs : ""), { method: method, headers: { "X-Admin-Key": adminKey() }, signal: AbortSignal.timeout(10000) });
    const j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw Object.assign(new Error(j.message || ("HTTP " + r.status)), { status: r.status });
    return j;
  }

  function pct(a, b) { return b ? Math.round((a / b) * 100) + "%" : "-"; }
  function fmt(t) { return new Date(t).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }

  function aggregate(days) {
    const svc = {}, prov = {};
    let all = 0, ok = 0;
    days.forEach(function (d) {
      all += d.all || 0; ok += d.ok || 0;
      Object.keys(d).forEach(function (k) {
        if (k.indexOf("so:") === 0) { const id = k.slice(3); (svc[id] = svc[id] || { a: 0, o: 0 }).o += d[k]; }
        else if (k.indexOf("s:") === 0) { const id = k.slice(2); (svc[id] = svc[id] || { a: 0, o: 0 }).a += d[k]; }
        else if (k.indexOf("p:") === 0) { const p = k.slice(2); prov[p] = (prov[p] || 0) + d[k]; }
      });
    });
    return { svc: svc, prov: prov, all: all, ok: ok };
  }

  function table(head, rows) {
    const t = C.el("table", { class: "tbl" });
    t.append(C.el("tr", {}, head.map(function (h, i) { return C.el("th", { class: i ? "n" : "", text: h }); })));
    rows.forEach(function (r) { t.append(C.el("tr", {}, r.map(function (c, i) { return C.el("td", { class: i ? "n" : "", text: String(c) }); }))); });
    return t;
  }

  function render() {
    if (!data) return;
    const days = data.days || [];
    const g = aggregate(days);
    const today = days[0] || {};

    $("kpis").replaceChildren(
      kpi(today.all || 0, "Percobaan hari ini"),
      kpi(pct(g.ok, g.all), "Berhasil (periode)"),
      kpi(g.all, "Total periode")
    );

    const users = {};
    (data.log || []).forEach(function (e) {
      const k = e.ip || "(IP tidak dicatat)";
      const u = users[k] = users[k] || { n: 0, last: 0, d: "", g: "" };
      u.n++;
      if (e.t > u.last) { u.last = e.t; u.d = e.d || u.d; u.g = e.g || u.g; }
    });
    const userRows = Object.keys(users).sort(function (a, b) { return users[b].last - users[a].last; }).map(function (k) {
      return [k, users[k].d || "-", users[k].g || "-", users[k].n, fmt(users[k].last)];
    });
    $("byuser").replaceChildren(userRows.length ? table(["IP", "Perangkat", "Lokasi", "Coba", "Terakhir"], userRows) : C.el("p", { class: "note", text: "Belum ada data." }));

    const svcRows = Object.keys(g.svc).sort(function (a, b) { return g.svc[b].a - g.svc[a].a; }).map(function (id) {
      return [names[id] || id, g.svc[id].a, g.svc[id].o, pct(g.svc[id].o, g.svc[id].a)];
    });
    $("bysvc").replaceChildren(svcRows.length ? table(["Layanan", "Coba", "Berhasil", "%"], svcRows) : C.el("p", { class: "note", text: "Belum ada data." }));

    const provRows = Object.keys(g.prov).sort(function (a, b) { return g.prov[b] - g.prov[a]; }).map(function (p) { return [p, g.prov[p]]; });
    $("byprov").replaceChildren(provRows.length ? table(["Server", "Berhasil"], provRows) : C.el("p", { class: "note", text: "Belum ada data." }));

    const max = Math.max.apply(null, days.map(function (d) { return d.all || 0; }).concat([1]));
    $("byday").replaceChildren.apply($("byday"), days.map(function (d) {
      const bar = C.el("div", { class: "bar" }, [C.el("i", { style: "width:" + Math.round(((d.all || 0) / max) * 100) + "%" })]);
      return C.el("div", { style: "margin:8px 0" }, [
        C.el("div", { class: "r1", style: "display:flex;justify-content:space-between;font-size:13px" }, [
          C.el("span", { text: d.d }), C.el("span", { text: (d.all || 0) + " coba, " + (d.ok || 0) + " berhasil" })
        ]), bar
      ]);
    }));

    const items = (data.log || []).filter(function (e) { return filter === "all" || (filter === "ok" ? e.ok : !e.ok); });
    $("log").replaceChildren.apply($("log"), items.length ? items.map(row) : [C.el("p", { class: "note", text: "Tidak ada aktivitas." })]);
  }

  function kpi(v, label) { return C.el("div", { class: "kpi" }, [C.el("b", { text: String(v) }), C.el("span", { text: label })]); }

  function row(e) {
    const kids = [
      C.el("div", { class: "r1" }, [
        C.el("span", {}, [C.el("i", { class: e.ok ? "dot" : "dot f" }), document.createTextNode((names[e.s] || e.s) + " · " + (e.h || ""))]),
        C.el("span", { class: "tm", text: fmt(e.t) })
      ]),
      C.el("div", { class: "u", text: "Asal: " + (e.u || e.h || "") }),
      e.r ? C.el("div", { class: "u", style: "color:#b3c7ff", text: "Hasil: " + e.r }) : null,
      C.el("div", { class: "u", text: (e.d || "Perangkat tidak diketahui") + (e.ip ? "  ·  " + e.ip : "") + (e.g ? "  ·  " + e.g : "") }),
      C.el("div", { class: "u", text: (e.p ? "Server " + e.p : "") + (e.ms != null ? (e.p ? ", " : "") + e.ms + " ms" : "") })
    ];
    if (!e.ok && e.e) kids.push(C.el("div", { class: "e", text: e.e }));
    return C.el("div", { class: "ev" }, kids);
  }

  async function load() {
    try {
      data = await call("GET", "days=" + $("days").value + "&limit=150");
      $("login").hidden = true; $("dash").hidden = false;
      render();
    } catch (e) {
      $("dash").hidden = true; $("login").hidden = false;
      if (e.status === 401) setKey("");
      $("msg").textContent = adminKey() === "" && e.status !== 401 ? e.message : (e.status ? e.message : "Tidak bisa menghubungi server.");
    }
  }

  $("enter").addEventListener("click", function () { setKey($("key").value.trim()); $("key").value = ""; $("msg").textContent = ""; load(); });
  $("key").addEventListener("keydown", function (e) { if (e.key === "Enter") $("enter").click(); });
  $("refresh").addEventListener("click", load);
  $("days").addEventListener("change", load);
  $("auto").addEventListener("change", function () {
    clearInterval(timer);
    if ($("auto").checked) timer = setInterval(load, 30000);
  });
  $("wipe").addEventListener("click", async function () {
    if (!confirm("Hapus semua log dan statistik pemantauan? Tindakan ini tidak bisa dibatalkan.")) return;
    try { await call("DELETE"); await load(); } catch (e) { $("msg").textContent = e.message; }
  });
  document.querySelectorAll("[data-f]").forEach(function (b) {
    b.addEventListener("click", function () {
      filter = b.dataset.f;
      document.querySelectorAll("[data-f]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      render();
    });
  });

  if (adminKey()) load();
})();
