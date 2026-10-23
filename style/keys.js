/* StyleKey table. Rail order and copy follow style-switch-ix v0.5. */
globalThis.BH = globalThis.BH || {};
BH.RETIRED = ["cgi1993", "bauhaus", "pop"];
BH.STYLES = [
  { key: "realistic", id: 0, code: "REAL", rail: "写实", toast: "Style · REALISTIC", font: "JetBrains Mono", hint: "DRAG · SCROLL" },
  { key: "vangogh", id: 1, code: "VG", rail: "梵高", toast: "Style · STARRY NIGHT", font: "Cormorant Garamond", hint: "DRAG · SCROLL" },
  { key: "ukiyo", id: 2, code: "UKIYO", rail: "浮世绘", toast: "Style · UKIYO-E", font: "Shippori Mincho", hint: "DRAG · SCROLL" },
  { key: "blueprint", id: 3, code: "BLUE", rail: "蓝图", toast: "Style · BLUEPRINT", font: "IBM Plex Mono", hint: "DRAG · SCROLL" },
  { key: "constructivist", id: 4, code: "CONST", rail: "构成", toast: "Style · CONSTRUCTIVIST", font: "Oswald", hint: "DRAG · SCROLL" },
  { key: "ink", id: 5, code: "INK", rail: "水墨", toast: "水墨", font: "LXGW WenKai", hint: "拖动环视 · 滚轮远近" }
];
BH.styleByKey = function (key) {
  return BH.STYLES.find(s => s.key === key) || null;
};
BH.resolveStyle = function (raw) {
  if (raw == null) return null;
  let s = String(raw).trim().toLowerCase();
  if (!s || BH.RETIRED.includes(s)) return null;
  return BH.STYLES.find(x => x.key === s || x.code.toLowerCase() === s) || null;
};
