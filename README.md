# Black Hole Explorer v6.7

实时浏览器黑洞渲染（Schwarzschild 测地线查找表 + 吸积盘流动气体），WebGL/WebGPU。

## 运行
- 下载 Release 里的 `blackhole-v6.7-local.zip`，解压后双击 `start.bat`，浏览器打开 http://127.0.0.1:41731/ （加 `?fps=1` 显示帧率）。
- 或直接用 Chrome/Edge 打开 `index.html`。

本仓库为构建后的独立页面（脚本、样式与银河贴图内嵌于 index.html）。详见 `README-local.txt`。

## 艺术史皮肤
默认仍是写实 v6.7。右下角「风格」打开 Style Rail，可切到梵高、浮世绘、蓝图、构成、水墨。画面与按钮、Rail、Toast 一起换。拖拽和滚轮在每种皮肤下都还在。

- 地址栏：`?style=ink`、`?style=blueprint`（也接受短码 `INK` `BLUE` `VG` `UKIYO` `CONST` `REAL`）
- 记忆：`localStorage['bh.explorer.style']`；有 `?style=` 时以地址栏为准
- 电影模式：`?cinema=1` 隐藏 Rail 和按钮，画面仍用当前皮肤，且不写入上面的记忆
- 键盘：Rail 打开时 `1`–`6`、`[` `]` 切换，`Esc` 关闭
- 帧率：加 `?fps=1`。皮肤是色调映射之后的一次全屏合成，测地线表不因换肤重编译。写实路径在未选皮肤时仍直接送出原来的画面

改 `style/` 之后在仓库根目录运行 `python3 style/splice.py`，再刷新页面。

参考静帧不进这个仓库。字体为 SIL OFL，见 `fonts/NOTICE.txt`。

## Credits
Milky Way panorama: ESO/S. Brunier (https://www.eso.org/public/images/eso0932a/), CC BY 4.0.
