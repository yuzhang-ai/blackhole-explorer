/* Apply _tokens.json (0.5-locked-six) onto the document. */
globalThis.BH = globalThis.BH || {};
function bhRgba(ch) {
  let a = ch.length > 3 ? ch[3] / 255 : 1;
  return `rgba(${ch[0]},${ch[1]},${ch[2]},${a.toFixed(3)})`;
}
BH.applyChrome = function (style) {
  let pack = BH.TOKEN_DATA.tokens[style.key];
  let layout = BH.TOKEN_DATA.layout || { rail_h: 72, rail_gap: 16 };
  let root = document.documentElement;
  let set = (name, value) => root.style.setProperty(name, value);
  set("--accent-fill", pack.accent_fill);
  set("--accent-text", pack.accent_text);
  set("--text", pack.text);
  set("--surface", pack.surface);
  set("--border", pack.border);
  set("--radius", pack.radius + "px");
  set("--border-w", pack.border_w + "px");
  set("--font-ui", `"${pack.font_ui}", sans-serif`);
  set("--btn-fill", bhRgba(pack.btn_fill));
  set("--btn-border", bhRgba(pack.btn_border));
  set("--btn-text", bhRgba(pack.btn_text));
  set("--btn-hover", bhRgba(pack.btn_hover));
  set("--hud-bg", bhRgba(pack.hud_bg));
  set("--rail-bg", bhRgba(pack.rail_bg));
  set("--rail-sel", bhRgba(pack.rail_sel_border));
  set("--toast-bg", bhRgba(pack.toast_bg));
  set("--rail-h-open", layout.rail_h + "px");
  set("--rail-gap-open", layout.rail_gap + "px");
  root.dataset.style = style.key;
  root.lang = pack.lang === "zh" ? "zh-CN" : pack.lang === "ja" ? "ja" : "en";
  let hint = document.querySelector(".style-hud");
  if (hint) hint.textContent = style.hint;
  let note = document.querySelector(".style-fallback");
  if (note) {
    note.textContent = style.key === "ink"
      ? "此浏览器只有静帧。画面仍是写实海报，界面已换为水墨。"
      : style.key === "realistic"
        ? ""
        : "Still frame only. The poster stays realistic; chrome follows this style.";
  }
};
