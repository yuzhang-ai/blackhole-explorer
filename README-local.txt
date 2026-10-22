Black hole v6.7 — run on Windows without Node
===============================================

Unzip this folder anywhere. You do not need Node, npm, or a GPU driver install
beyond what Chrome or Edge already uses.

The page opens on the hero camera (distance 26, inclination 68 degrees, roll -7).
The disk is moving. Inner gas orbits faster than outer gas, so the threads
wind. The disk has a hard outer edge; past it the frame is sky. A still camera
keeps that motion; you do not have to drag. ?drift=0 holds the camera still
if you want to watch only the gas. The default adds a very slow orbit.

Add ?fps=1 to show, in the top-right: the frame rate, the internal resolution
scale, and the GPU name (UNMASKED_RENDERER_WEBGL, or the WebGPU adapter).
The rate is 1000 / median frame interval, the same value as window.__BH__.fps.
Other ?fps= values are the cinema path step, not the counter.

If the GPU line says Intel, UHD, or Iris, the page is on the integrated GPU.
The context requests powerPreference high-performance. On an Optimus laptop,
the NVIDIA GPU is the one that should be named.

Every ray that can reach the disk is looked up in a Schwarzschild geodesic
table built when the page loads. There is no near-hole sphere and no
straight-line disk, so the shadow should not grow a hard circular seam.
The near side of the disk crosses in front of the shadow. The far side
arches over the top and under the bottom. The Milky Way is the ESO plate
at 2048×1024. The mip comes from the smooth camera ray, plus separate
point stars. The credit on the page is ESO/S. Brunier. The on-screen
scale should drop on its own if a frame is still slow. ?dyn=0 pins it.

Option A — one double-click, with the frame-rate counter
-------------------------------------------------------
1. Double-click start.bat.
2. Leave the black window open while you watch. Closing it stops the server.
3. The browser opens at http://127.0.0.1:41731/?fps=1

start.bat uses the Python launcher (py), then python, then PowerShell
(serve.ps1) if Python is not installed. Windows 10 and 11 include PowerShell.

If the window says the address is already in use, edit PORT=41731 near the
top of start.bat and run it again.

Option B — double-click index.html
-----------------------------------
index.html has the script, the CSS, and the Milky Way JPEG inside it, so
Chrome or Edge can open the file directly. A plain double-click shows the
hero view without the counter. To turn the counter on, open:

  index.html?fps=1

Chrome blocks a separate local JPEG from being used as a WebGL texture, which
is why the panorama is embedded. sky/eso0932a.jpg is the same plate, kept so
the credit file is in the folder. The page does not fetch it. It draws the
plate down to 1024×512 after load and uses the mip chain.

If the picture stays on the still poster, use Option A.

What you should see
-------------------
A dark hole with the front of the disk crossing its lower half, and the back
of the disk bent over the top and under the bottom. Inner gas is white-hot,
outer gas gold, and the Milky Way is faint. The gas flows. The corner credit
"ESO/S. Brunier" is required for the sky photo (CC BY 4.0). Backtick (`) opens
the debug panel. C toggles the cinema camera.

This build is the static site only. It is not licensed for commercial use.
