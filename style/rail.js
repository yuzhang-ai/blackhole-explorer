/* Style Rail, toast, entry. Thumbnails start as diagrams and are replaced by a real 64×40 readback. */
globalThis.BH = globalThis.BH || {};
function bhSchematic(key) {
  let c = document.createElement("canvas");
  c.width = 64;
  c.height = 40;
  let g = c.getContext("2d");
  let bg = { realistic: "#0b1520", vangogh: "#0b1d51", ukiyo: "#f3e6d0", blueprint: "#0a3d6e", constructivist: "#f2ede4", ink: "#ede4d0" }[key];
  g.fillStyle = bg;
  g.fillRect(0, 0, 64, 40);
  if (key === "blueprint") {
    g.strokeStyle = "#2a6fa3";
    g.lineWidth = 1;
    for (let x = 4; x < 64; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 40); g.stroke(); }
    for (let y = 4; y < 40; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y); g.stroke(); }
    g.strokeStyle = "#e8f4ff";
    g.strokeRect(14, 8, 36, 24);
    g.beginPath(); g.arc(32, 20, 8, 0, 6.3); g.stroke();
  } else if (key === "ink") {
    g.strokeStyle = "#231d17";
    g.lineWidth = 3;
    g.beginPath(); g.ellipse(32, 20, 18, 7, 0, 0, 6.3); g.stroke();
    g.fillStyle = "#0b0906";
    g.beginPath(); g.arc(32, 20, 6, 0, 6.3); g.fill();
    g.strokeStyle = "#9a8f80";
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(8, 32); g.lineTo(22, 30); g.lineTo(18, 36); g.stroke();
  } else if (key === "vangogh") {
    g.strokeStyle = "#f2c230";
    g.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.arc(32, 20, 6 + i * 3, i, i + 1.4);
      g.stroke();
    }
    g.fillStyle = "#050508";
    g.beginPath(); g.arc(32, 20, 5, 0, 6.3); g.fill();
  } else if (key === "ukiyo") {
    g.strokeStyle = "#1a1a1a";
    g.fillStyle = "#1b3a6d";
    g.beginPath(); g.ellipse(32, 22, 20, 8, 0, 0, 6.3); g.fill(); g.stroke();
    g.fillStyle = "#c73e2a";
    g.fillRect(14, 20, 36, 3);
    g.fillStyle = "#1a1a1a";
    g.beginPath(); g.arc(32, 20, 6, 0, 6.3); g.fill();
  } else if (key === "constructivist") {
    g.fillStyle = "#0a0a0a";
    g.beginPath(); g.moveTo(0, 0); g.lineTo(28, 0); g.lineTo(0, 22); g.fill();
    g.fillStyle = "#c41e3a";
    g.fillRect(48, 0, 16, 10);
    g.fillStyle = "#8a8a8a";
    g.fillRect(12, 18, 40, 5);
    g.fillStyle = "#0a0a0a";
    g.beginPath(); g.arc(32, 20, 6, 0, 6.3); g.fill();
  } else {
    g.strokeStyle = "#e9cea7";
    g.lineWidth = 2;
    g.beginPath(); g.ellipse(32, 20, 18, 5, -0.2, 0, 6.3); g.stroke();
    g.fillStyle = "#05070a";
    g.beginPath(); g.arc(32, 20, 6, 0, 6.3); g.fill();
  }
  return c.toDataURL("image/png");
}
function bhPaintThumb(key, buffer) {
  let img = document.querySelector(`.style-cell[data-key="${key}"] img`);
  if (!img || !buffer || buffer.length < 64 * 40 * 4) return;
  let w = 64, h = 40, c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  let ctx = c.getContext("2d");
  let image = ctx.createImageData(w, h);
  let max = 0;
  for (let i = 0; i < buffer.length; i += 17) max = Math.max(max, buffer[i]);
  let bytes = buffer instanceof Uint8Array || buffer instanceof Uint8ClampedArray || max > 1.5;
  let lin = v => v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.min(1, Math.max(0, v)), 1 / 2.4) - 0.055;
  for (let y = 0; y < h; y++) {
    let srcY = h - 1 - y;
    for (let x = 0; x < w; x++) {
      let si = (srcY * w + x) * 4, di = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) {
        let v = buffer[si + k];
        image.data[di + k] = bytes ? v : Math.round(lin(v) * 255);
      }
      image.data[di + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  if (max < 0.02) return;
  img.src = c.toDataURL("image/jpeg", 0.8);
  img.dataset.live = "1";
}
function bhMountRail(manager) {
  let stage = document.getElementById("stage");
  if (!stage || document.querySelector(".style-rail")) return;
  let hud = document.createElement("p");
  hud.className = "style-hud style-chrome";
  hud.textContent = "DRAG · SCROLL";
  let colophon = document.createElement("p");
  colophon.className = "style-colophon style-chrome";
  colophon.textContent = "引力透镜";
  let seal = document.createElement("p");
  seal.className = "style-seal style-chrome";
  seal.textContent = "墨";
  let toast = document.createElement("p");
  toast.className = "style-toast style-chrome";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  let fallback = document.createElement("p");
  fallback.className = "style-fallback style-chrome";
  let entry = document.createElement("button");
  entry.type = "button";
  entry.className = "style-entry style-chrome";
  entry.textContent = "风格";
  entry.setAttribute("aria-controls", "style-rail");
  entry.setAttribute("aria-expanded", "true");
  let rail = document.createElement("div");
  rail.className = "style-rail style-chrome";
  rail.id = "style-rail";
  rail.setAttribute("role", "radiogroup");
  rail.setAttribute("aria-label", "风格");
  let dragging = false;
  BH.STYLES.forEach((style, index) => {
    let btn = document.createElement("button");
    btn.type = "button";
    btn.className = "style-cell";
    btn.dataset.key = style.key;
    btn.dataset.code = style.code;
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", "false");
    btn.setAttribute("aria-label", style.rail);
    btn.style.order = String(index);
    let img = document.createElement("img");
    img.width = 64;
    img.height = 40;
    img.alt = "";
    img.src = bhSchematic(style.key);
    let label = document.createElement("span");
    label.textContent = style.rail;
    btn.append(img, label);
    btn.addEventListener("pointerdown", ev => {
      dragging = true;
      btn.setPointerCapture(ev.pointerId);
      manager.preview(style.key);
    });
    btn.addEventListener("pointerenter", () => { if (dragging) manager.preview(style.key); });
    btn.addEventListener("pointerup", () => {
      if (!dragging) return;
      dragging = false;
      manager.confirm();
    });
    btn.addEventListener("click", ev => ev.preventDefault());
    rail.append(btn);
  });
  window.addEventListener("pointerup", () => {
    if (!dragging) return;
    dragging = false;
    manager.confirm();
  });
  window.addEventListener("pointercancel", () => {
    if (!dragging) return;
    dragging = false;
    manager.cancelPreview();
  });
  function setOpen(open) {
    document.documentElement.dataset.rail = open ? "open" : "closed";
    entry.setAttribute("aria-expanded", open ? "true" : "false");
    rail.hidden = !open;
  }
  entry.addEventListener("click", () => setOpen(document.documentElement.dataset.rail !== "open"));
  window.addEventListener("keydown", ev => {
    let t = ev.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (ev.code === "Backquote" || ev.key === "c" || ev.key === "C") return;
    if (document.documentElement.dataset.rail !== "open") return;
    if (ev.key === "Escape") {
      manager.cancelPreview();
      setOpen(false);
      ev.preventDefault();
      return;
    }
    if (ev.key === "[" || ev.key === "]") {
      let i = BH.STYLES.findIndex(s => s.key === manager.get());
      i = (i + (ev.key === "]" ? 1 : -1) + BH.STYLES.length) % BH.STYLES.length;
      manager.apply(BH.STYLES[i].key);
      ev.preventDefault();
      return;
    }
    if (ev.key >= "1" && ev.key <= "6") {
      let style = BH.STYLES[Number(ev.key) - 1];
      if (style) manager.apply(style.key);
      ev.preventDefault();
    }
  });
  stage.append(hud, colophon, seal, toast, fallback, entry, rail);
  setOpen(true);
  let h = window.__BH_STYLE_HOOK;
  if (h) h.onThumb = bhPaintThumb;
  else {
    let wait = setInterval(() => {
      if (!window.__BH_STYLE_HOOK) return;
      window.__BH_STYLE_HOOK.onThumb = bhPaintThumb;
      clearInterval(wait);
    }, 50);
  }
}
function bhBoot() {
  for (let style of BH.STYLES) document.fonts.load(`16px "${style.font}"`).catch(() => {});
  let manager = BH.createManager();
  BH.manager = manager;
  bhMountRail(manager);
  let key = manager.initialKey();
  manager.apply(key, { silent: !manager.urlAsked(), persist: false });
  window.__BH__ && (window.__BH__.style = key);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bhBoot);
else bhBoot();
