/* StyleManager: one transaction for GPU uniform + chrome. URL > storage > realistic. */
globalThis.BH = globalThis.BH || {};
BH.createManager = function () {
  let current = "realistic";
  let confirmed = "realistic";
  let previewing = false;
  let listeners = new Set();
  let toastTimer = 0;
  function cinema() {
    let q = new URLSearchParams(location.search);
    return q.get("cinema") === "1" || document.body.classList.contains("cinema");
  }
  function hook() {
    return window.__BH_STYLE_HOOK || null;
  }
  function paint() {
    document.querySelectorAll(".style-cell").forEach(el => {
      let on = el.dataset.key === current;
      el.setAttribute("aria-checked", on ? "true" : "false");
      el.classList.toggle("is-selected", on);
    });
  }
  function toast(style) {
    let el = document.querySelector(".style-toast");
    if (!el || document.body.classList.contains("cinema")) return;
    el.textContent = style.toast;
    el.classList.remove("on");
    void el.offsetWidth;
    el.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("on"), 2000);
  }
  function persist(key) {
    try { localStorage.setItem("bh.explorer.style", key); } catch (e) { /* private mode */ }
    let u = new URL(location.href);
    if (key === "realistic") u.searchParams.delete("style");
    else u.searchParams.set("style", key);
    history.replaceState(null, "", u.pathname + u.search + u.hash);
  }
  async function ensureFont(style) {
    let family = style.font;
    try {
      await Promise.race([
        document.fonts.load(`16px "${family}"`),
        new Promise(r => setTimeout(r, 2500))
      ]);
    } catch (e) { /* still apply */ }
    if (!document.fonts.check(`16px "${family}"`)) console.warn("[bh] font check failed", family);
  }
  async function apply(key, opts) {
    opts = opts || {};
    let style = typeof key === "string" ? BH.styleByKey(key) : key;
    if (!style) return;
    let preview = !!opts.preview;
    await ensureFont(style);
    BH.applyChrome(style);
    let h = hook();
    if (h) {
      h.key = style.key;
      h.thumbKey = style.key;
      if (!preview) h.thumbQueued = true;
      if (typeof h.set === "function") h.set(style.id);
      else h.id = style.id;
    }
    current = style.key;
    if (!preview) {
      confirmed = style.key;
      previewing = false;
      if (opts.persist !== false && !cinema()) persist(style.key);
      if (!opts.silent) toast(style);
    } else previewing = true;
    paint();
    listeners.forEach(fn => fn(current));
    if (!preview && h) {
      requestAnimationFrame(() => {
        if (h.failed && h.failed === style.id) {
          console.warn("[bh] style pass failed", style.key);
          h.failed = false;
          let cell = document.querySelector(`.style-cell[data-key="${style.key}"]`);
          if (cell) cell.dataset.state = "error";
          apply("realistic", { silent: true, persist: !cinema() });
        }
      });
    }
  }
  return {
    get: () => current,
    confirmed: () => confirmed,
    apply,
    preview: key => apply(key, { preview: true, silent: true }),
    confirm: () => apply(current, { preview: false, persist: true }),
    cancelPreview: () => {
      if (!previewing) return Promise.resolve();
      previewing = false;
      return apply(confirmed, { preview: false, persist: false, silent: true });
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    initialKey() {
      let q = new URLSearchParams(location.search);
      let fromUrl = BH.resolveStyle(q.get("style"));
      if (q.get("style") && !fromUrl) console.warn("[bh] ignored style param", q.get("style"));
      let stored = null;
      try { stored = BH.resolveStyle(localStorage.getItem("bh.explorer.style")); } catch (e) { /* ignore */ }
      return (fromUrl || stored || BH.styleByKey("realistic")).key;
    },
    urlAsked() {
      return !!BH.resolveStyle(new URLSearchParams(location.search).get("style"));
    }
  };
};
