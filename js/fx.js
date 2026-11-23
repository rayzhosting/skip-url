/*
  Efek suara (disintesis dengan Web Audio, tanpa file audio) dan riak tombol.
  Suara baru bisa berbunyi setelah pengguna menyentuh halaman (aturan browser).
*/
(function () {
  const KEY = "skipurl.sound";
  let enabled = true;
  try { enabled = localStorage.getItem(KEY) !== "off"; } catch (e) {}

  let ctx = null, master = null;

  function ensure() {
    if (!enabled) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(c, t0, o) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.d);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.v, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.d);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + o.d + 0.02);
  }

  const sounds = {
    click: function (c, t) { tone(c, t, { f: 1250, f2: 720, d: 0.05, v: 0.07, type: "triangle" }); },
    pop: function (c, t) { tone(c, t, { f: 520, f2: 920, d: 0.09, v: 0.09 }); },
    detect: function (c, t) { tone(c, t, { f: 1568, d: 0.07, v: 0.04 }); },
    success: function (c, t) {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
        tone(c, t + i * 0.075, { f: f, d: 0.55 - i * 0.05, v: 0.08 });
        tone(c, t + i * 0.075, { f: f * 2, d: 0.3, v: 0.022 });
      });
    },
    error: function (c, t) {
      tone(c, t, { f: 240, f2: 160, d: 0.22, v: 0.08, type: "triangle" });
      tone(c, t + 0.12, { f: 180, f2: 120, d: 0.26, v: 0.08, type: "triangle" });
    }
  };

  function play(name) {
    const c = ensure();
    if (!c || !sounds[name]) return;
    sounds[name](c, c.currentTime + 0.005);
  }

  /* ---------- tombol suara ---------- */
  const ICON_ON = '<svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a8 8 0 0 1 0 11"/></svg>';
  const ICON_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z"/><path d="M16 9.5l5 5"/><path d="M21 9.5l-5 5"/></svg>';

  function paint(btn) {
    btn.innerHTML = enabled ? ICON_ON : ICON_OFF;
    btn.setAttribute("aria-pressed", String(enabled));
    btn.setAttribute("aria-label", enabled ? "Matikan suara" : "Nyalakan suara");
    btn.title = enabled ? "Matikan suara" : "Nyalakan suara";
  }

  const sndBtn = document.getElementById("sound");
  if (sndBtn) {
    paint(sndBtn);
    sndBtn.addEventListener("click", function () {
      enabled = !enabled;
      try { localStorage.setItem(KEY, enabled ? "on" : "off"); } catch (e) {}
      paint(sndBtn);
      if (enabled) play("pop");
    });
  }

  /* ---------- riak dan suara klik ---------- */
  const RIPPLE = ".go, .ghost, nav a, .tabs button";
  const CLICKABLE = "button, a[href], summary, select";

  document.addEventListener("pointerdown", function (e) {
    const t = e.target.closest ? e.target.closest(CLICKABLE) : null;
    if (!t) return;
    if (t.id !== "sound" && !t.disabled) play("click");

    const r = t.matches(RIPPLE) ? t : null;
    if (!r || r.disabled) return;
    const rect = r.getBoundingClientRect();
    const d = Math.max(rect.width, rect.height) * 2;
    const s = document.createElement("span");
    s.className = "rip";
    s.style.width = s.style.height = d + "px";
    s.style.left = (e.clientX - rect.left - d / 2) + "px";
    s.style.top = (e.clientY - rect.top - d / 2) + "px";
    r.appendChild(s);
    setTimeout(function () { s.remove(); }, 650);
  }, { passive: true });

  window.Sfx = { play: play, isOn: function () { return enabled; } };
})();

/* ===== Animasi halaman: GSAP + ScrollTrigger, Motion, Lenis (dimuat dari CDN, bersifat opsional) ===== */
(function () {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const LIB = {
    gsap: "https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js",
    st: "https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js",
    motion: "https://cdn.jsdelivr.net/npm/motion@12.43.0/dist/motion.js",
    lenis: "https://cdn.jsdelivr.net/npm/lenis@1.3.1/dist/lenis.min.js"
  };
  const root = document.documentElement;
  const $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  // Teks sementara disembunyikan sampai animasi siap; jika CDN lambat, tampil apa adanya.
  root.classList.add("fx-wait");
  let timedOut = false;
  const failsafe = setTimeout(function () { timedOut = true; root.classList.remove("fx-wait"); }, 1600);

  function load(src) {
    return new Promise(function (res) {
      const s = document.createElement("script");
      s.src = src;
      s.onload = function () { res(true); };
      s.onerror = function () { res(false); };
      document.head.appendChild(s);
    });
  }

  // Pecah judul menjadi kata-kata (tag <br> dipertahankan).
  function splitWords(el) {
    const out = [];
    const nodes = Array.prototype.slice.call(el.childNodes);
    el.textContent = "";
    nodes.forEach(function (n) {
      if (n.nodeType === 3) {
        n.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { el.appendChild(document.createTextNode(" ")); return; }
          const w = document.createElement("span"); w.className = "w";
          const i = document.createElement("span"); i.className = "wi"; i.textContent = part;
          w.appendChild(i); el.appendChild(w); out.push(i);
        });
      } else {
        el.appendChild(n);
      }
    });
    return out;
  }

  function init() {
    clearTimeout(failsafe);
    const G = window.gsap, ST = window.ScrollTrigger, M = window.Motion;
    const hasG = !!(G && ST), hasM = !!(M && M.animate && M.inView);
    if (hasG) G.registerPlugin(ST);

    /* --- Lenis: smooth scroll, disinkronkan dengan ScrollTrigger --- */
    let lenis = null;
    if (typeof window.Lenis === "function") { try { lenis = new window.Lenis({ lerp: 0.1 }); } catch (e) {} }
    if (lenis) {
      if (hasG) {
        lenis.on("scroll", ST.update);
        G.ticker.add(function (t) { lenis.raf(t * 1000); });
        G.ticker.lagSmoothing(0);
      } else {
        requestAnimationFrame(function loop(t) { lenis.raf(t); requestAnimationFrame(loop); });
      }
    }
    // Area yang bisa di-scroll sendiri tidak ikut smooth scroll
    function guard() { $$("pre, textarea").forEach(function (e) { e.setAttribute("data-lenis-prevent", ""); }); }
    guard();

    /* --- Siapkan keadaan awal sebelum teks ditampilkan --- */
    const enter = timedOut ? [] : $$(".pills, .hero .sub, .panel, .popular, .search, .tabs");
    const heads = (timedOut || !hasG) ? [] : $$("h1, section.blk h2");
    const words = heads.map(function (h) { return { h: h, w: splitWords(h) }; });
    if (hasM) enter.forEach(function (e) { e.style.opacity = "0"; });
    words.forEach(function (o) { G.set(o.w, { yPercent: 115 }); });
    root.classList.remove("fx-wait");

    /* --- GSAP + ScrollTrigger: judul muncul per kata saat di-scroll --- */
    words.forEach(function (o) {
      G.to(o.w, { yPercent: 0, duration: 0.9, ease: "power4.out", stagger: 0.07,
        scrollTrigger: { trigger: o.h, start: "top 90%", once: true } });
    });
    const hero = document.querySelector(".hero.center");
    if (hasG && hero && !timedOut) {
      G.to(hero, { yPercent: -10, opacity: 0.4, ease: "none",
        scrollTrigger: { trigger: hero, start: "top 25%", end: "bottom top", scrub: true } });
    }
    if (hasG) {
      ST.refresh();
      window.addEventListener("load", function () { ST.refresh(); });
    }

    /* --- Motion: animasi masuk dan hover untuk kartu --- */
    if (!hasM) return;
    root.classList.add("has-motion");
    const A = M.animate, ease = [0.22, 1, 0.36, 1];

    if (enter.length) A(enter, { opacity: [0, 1], y: [18, 0] }, { duration: 0.7, delay: M.stagger(0.08, { startDelay: 0.25 }), ease: ease });

    function group(sel, kidSel) {
      const c = document.querySelector(sel);
      if (!c) return;
      const kids = Array.prototype.slice.call(c.children).filter(function (k) { return k.matches(kidSel); });
      if (!kids.length) return;
      kids.forEach(function (k) { k.style.opacity = "0"; });
      M.inView(c, function () {
        A(kids, { opacity: [0, 1], y: [26, 0] }, { duration: 0.7, delay: M.stagger(0.09), ease: ease });
      }, { amount: 0.15 });
    }
    group(".stats", "div");
    group(".steps", ".step");
    group(".faq", "details");

    if (M.hover) {
      M.hover(".step, .stats > div, .popular a", function (el) {
        A(el, { y: -4 }, { duration: 0.25 });
        return function () { A(el, { y: 0 }, { duration: 0.3 }); };
      });
    }

    // Elemen yang dibuat belakangan (hasil bypass, daftar riwayat/domain)
    const seen = new WeakSet();
    function pop(nodes) {
      nodes = nodes.filter(function (n) { return n.nodeType === 1 && !seen.has(n); });
      nodes.forEach(function (n) { seen.add(n); });
      if (!nodes.length) return;
      A(nodes.slice(0, 12), { opacity: [0, 1], y: [16, 0] }, { duration: 0.5, delay: M.stagger(0.05), ease: ease });
    }
    const out = document.getElementById("out"), list = document.getElementById("list");
    if (out) {
      new MutationObserver(function (ms) {
        ms.forEach(function (m) { pop(Array.prototype.slice.call(m.addedNodes)); });
        guard();
      }).observe(out, { childList: true });
    }
    if (list) {
      let listDone = false;
      if (list.children.length) { listDone = true; pop(Array.prototype.slice.call(list.children)); }
      new MutationObserver(function (ms) {
        if (listDone) return;
        const added = [];
        ms.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) { added.push(n); }); });
        if (added.length) { listDone = true; pop(added); }
      }).observe(list, { childList: true });
    }
  }

  Promise.all([
    load(LIB.gsap).then(function (ok) { return ok ? load(LIB.st) : false; }),
    load(LIB.motion),
    load(LIB.lenis)
  ]).then(function () { try { init(); } catch (e) { root.classList.remove("fx-wait"); } })
    .catch(function () { root.classList.remove("fx-wait"); });
})();
