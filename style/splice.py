#!/usr/bin/env python3
"""Inline style/ into index.html. Idempotent. Run from the repo root."""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
PASS = (ROOT / "style" / "style-pass.js").read_text()
CSS = (ROOT / "style" / "chrome.css").read_text()
TOKENS = json.loads((ROOT / "style" / "tokens.json").read_text())
JS_PARTS = [
    "globalThis.BH=globalThis.BH||{};",
    "BH.TOKEN_DATA=" + json.dumps(TOKENS, ensure_ascii=False) + ";",
]
for name in ("keys.js", "tokens.js", "style-manager.js", "rail.js"):
    JS_PARTS.append((ROOT / "style" / name).read_text())
UI = "\n".join(JS_PARTS)

html = INDEX.read_text()

def between(text, start, end, payload):
    a = text.find(start)
    b = text.find(end)
    block = start + "\n" + payload + "\n" + end
    if a != -1 and b != -1 and b > a:
        return text[:a] + block + text[b + len(end):]
    return None

css_block = between(html, "<!--BH-STYLE-CSS-START-->", "<!--BH-STYLE-CSS-END-->", "<style id=\"bh-style-chrome\">\n" + CSS + "</style>")
if css_block is None:
    needle = "</head>"
    css_block = html.replace(needle, "<!--BH-STYLE-CSS-START-->\n<style id=\"bh-style-chrome\">\n" + CSS + "</style>\n<!--BH-STYLE-CSS-END-->\n" + needle, 1)
html = css_block

js_block = between(html, "<!--BH-STYLE-JS-START-->", "<!--BH-STYLE-JS-END-->", "<script>\n" + UI + "\n</script>")
if js_block is None:
    needle = "</body>"
    js_block = html.replace(needle, "<!--BH-STYLE-JS-START-->\n<script>\n" + UI + "\n</script>\n<!--BH-STYLE-JS-END-->\n" + needle, 1)
html = js_block

pass_block = between(html, "/*BH_STYLE_PASS_START*/", "/*BH_STYLE_PASS_END*/", PASS)
if pass_block is None:
    needle = "var iI=class"
    if needle not in html:
        raise SystemExit("missing iI class")
    pass_block = html.replace(needle, "/*BH_STYLE_PASS_START*/\n" + PASS + "\n/*BH_STYLE_PASS_END*/\n" + needle, 1)
html = pass_block

def once(old, new, marker):
    global html
    if marker in html:
        return
    if old not in html:
        raise SystemExit("anchor missing: " + old[:80])
    html = html.replace(old, new, 1)

once(
    "fade:Q(0)}",
    "fade:Q(0),styleId:Q(0),styleTier:Q(1)}",
    "styleId:Q(0)",
)
once(
    "this.probeMat=tI(this.ldr.texture)}setSize(e,t,n)",
    "this.probeMat=tI(this.ldr.texture);this.styleRT=rI(2,2);this.styleMats=[null];this.presentStyle=eI(this.styleRT.texture);this.thumbRT=new bn(64,40,{type:u,format:w,colorSpace:Xe,depthBuffer:!1,stencilBuffer:!1,generateMipmaps:!1,minFilter:o,magFilter:o,samples:0});this.warmQueue=[5,3,1,2,4];this.styleBroken={};this.warmHold=0;try{for(let bhI=1;bhI<=5;bhI++)this.styleMats[bhI]=BH_STYLE_MAT(n,this.resolved.texture,bhI)}catch(bhE){console.error(`[bh] style graph`,bhE)}}setSize(e,t,n)",
    "this.styleRT=rI",
)
once(
    "this.ldr.setSize(r,i),this.frozen.setSize(r,i),this.bloom.setSize(r,i),this.U.historyWeight.value=0",
    "this.ldr.setSize(r,i),this.frozen.setSize(r,i),this.bloom.setSize(r,i),this.styleRT&&this.styleRT.setSize(r,i),this.U.historyWeight.value=0",
    "this.styleRT&&this.styleRT.setSize",
)
once(
    "dispose(){this.sceneRT",
    "grabThumb(){let e=this.U.styleId.value|0,t=e>=1&&e<=5&&this.styleMats[e]?this.styleMats[e]:this.presentMat;this.renderer.setRenderTarget(this.thumbRT),this.quad.material=t,this.quad.render(this.renderer),this.renderer.setRenderTarget(null);return this.renderer.readRenderTargetPixelsAsync(this.thumbRT,0,0,64,40)}_styleDraw(e,t){if(!this.styleMats||!this.styleMats[e]||this.styleBroken[e])return!1;try{return this.renderer.setRenderTarget(this.styleRT),this.quad.material=this.styleMats[e],this.quad.render(this.renderer),!0}catch(n){return console.error(`[bh] style`,e,n),this.styleBroken[e]=!0,t&&(this.U.styleId.value=0,window.__BH_STYLE_HOOK&&(window.__BH_STYLE_HOOK.failed=e)),!1}}dispose(){this.sceneRT",
    "grabThumb(){",
)
old_render = "this.renderer.setRenderTarget(this.ldr),this.quad.material=this.tonemapMat,this.quad.render(this.renderer),this.renderer.setRenderTarget(null),this.quad.material=this.presentMat,this.quad.render(this.renderer),e.probe&&(this.renderer.setRenderTarget(this.probeRT),this.quad.material=this.probeMat,this.quad.render(this.renderer),this.renderer.setRenderTarget(null))"
new_render = "this.renderer.setRenderTarget(this.ldr),this.quad.material=this.tonemapMat,this.quad.render(this.renderer);let bhSid=this.U.styleId?this.U.styleId.value|0:0,bhDrew=!1;if(eL.ready&&this.warmQueue&&this.warmQueue.length){this.warmHold=(this.warmHold||0)+1;if(this.warmHold>10){this.warmHold=0;let bhW=this.warmQueue.shift();bhW!==bhSid&&this._styleDraw(bhW,!1)}}if(bhSid>=1&&bhSid<=5)bhDrew=this._styleDraw(bhSid,!0);this.renderer.setRenderTarget(null),this.quad.material=bhDrew?this.presentStyle:this.presentMat,this.quad.render(this.renderer);if(window.__BH_STYLE_HOOK&&window.__BH_STYLE_HOOK.thumbQueued&&this.grabThumb){window.__BH_STYLE_HOOK.thumbQueued=!1;let bhKey=window.__BH_STYLE_HOOK.thumbKey,bhCb=window.__BH_STYLE_HOOK.onThumb;this.grabThumb().then(bhBuf=>{bhCb&&bhCb(bhKey,bhBuf)}).catch(bhErr=>{console.warn(`[bh] thumb`,bhErr)})}e.probe&&(this.renderer.setRenderTarget(this.probeRT),this.quad.material=this.probeMat,this.quad.render(this.renderer),this.renderer.setRenderTarget(null))"
once(old_render, new_render, "bhSid=")
once(
    "window.__BH__=eL;",
    "window.__BH__=eL;window.__BH_STYLE_HOOK={id:0,key:`realistic`,ready:!1,failed:!1,thumbQueued:!1,thumbKey:`realistic`,bind(e){this._set=e,this.ready=!0,e(this.id)},set(e){this.id=e|0,this._set&&this._set(this.id)}};",
    "__BH_STYLE_HOOK=",
)
once(
    "sL=o,tL.current=r",
    "sL=o,tL.current=r,window.__BH_STYLE_HOOK&&window.__BH_STYLE_HOOK.bind(bhId=>{a.styleId.value=bhId|0,eL.style=bhId|0})",
    "a.styleId.value=bhId",
)
once(
    "e.taaBlend.value=$.taaBlend}",
    "e.taaBlend.value=$.taaBlend,e.styleTier&&(e.styleTier.value=eL.tier||1)}",
    "e.styleTier&&",
)
once(
    "this.ldr.dispose(),this.frozen.dispose(),this.probeRT.dispose(),this.bloom.dispose()",
    "this.ldr.dispose(),this.frozen.dispose(),this.probeRT.dispose(),this.bloom.dispose(),this.styleRT&&this.styleRT.dispose(),this.thumbRT&&this.thumbRT.dispose()",
    "this.thumbRT&&this.thumbRT.dispose()",
)

def upgrade(old, new):
    global html
    if new in html:
        return
    if old not in html:
        raise SystemExit("upgrade missing: " + old[:90])
    html = html.replace(old, new, 1)

upgrade(
    "styleId:Q(0),styleTier:Q(1)}",
    "styleId:Q(0),styleTier:Q(1),strokeScale:Q(1),gridPitch:Q(28),inkDry:Q(.55)}",
)
upgrade(
    "set(e){this.id=e|0,this._set&&this._set(this.id)}",
    "set(e){let n=e|0;n!==this.id&&(this.taaReset=6),this.id=n,this._set&&this._set(n)}",
)
upgrade(
    "oe=d||$.debugView>0?0:XI.capture?.12:ae?0:$.taaBlend;if(XI.capture&&h&&S===0)",
    "oe=(d||window.__BH_STYLE_HOOK&&window.__BH_STYLE_HOOK.taaReset>0)||$.debugView>0?0:XI.capture?.12:ae?0:$.taaBlend;if(window.__BH_STYLE_HOOK&&window.__BH_STYLE_HOOK.taaReset>0)window.__BH_STYLE_HOOK.taaReset--;if(XI.capture&&h&&S===0)",
)
upgrade(
    "e.taaBlend.value=$.taaBlend,e.styleTier&&(e.styleTier.value=eL.tier||1)}",
    "e.taaBlend.value=$.taaBlend,e.styleTier&&(e.styleTier.value=eL.tier||1),e.styleId&&((e.styleId.value|0)===3)&&(e.bloomIntensity.value=0)}",
)

INDEX.write_text(html)
print("spliced", INDEX, "bytes", INDEX.stat().st_size)
