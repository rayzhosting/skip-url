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
