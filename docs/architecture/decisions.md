# Architecture Decisions

Record of key technical decisions made during development.

### 2026-04-06: Raw WebGL2 instead of regl bundle (Accepted)

- **Decision:** Use raw WebGL2 API in a plain JS file instead of bundling regl via Vite
- **Why:** The Vite-bundled regl output produced a black canvas in JupyterLab. Extensive debugging showed that WebGL2 works fine (green triangle test passed), but the regl bundle never rendered. Root cause: likely interaction between regl's context creation and anywidget's blob URL module loading.
- **Result:** `inline_widget.js` is a self-contained ~20KB file with zero dependencies. All WebGL calls use the raw GL API. The renderer works reliably in JupyterLab, VSCode, and Marimo.

### 2026-04-06: Inline ESM string instead of file path for _esm (Accepted)

- **Decision:** Set `_esm = _JS_PATH.read_text()` (inline string) instead of `_esm = Path(...)` (file reference)
- **Why:** anywidget loads file-based ESM via blob URLs, which cannot resolve cross-origin `import()` calls to `esm.sh`. Inline ESM strings go through the same blob URL mechanism but with different behavior for external imports. This pattern is proven by ipyaladin's own widget.js.
- **Result:** Aladin Lite loads successfully via `import("https://esm.sh/aladin-lite@3.7.3-beta")` inside the `render()` function. The JS file is read once at Python import time.

### 2026-04-06: uint8 textures instead of float32 (Accepted)

- **Decision:** Normalize image data to uint8 in JS and upload as RGBA uint8 textures
- **Why:** Float textures (`luminance` + `float`, `R32F`) produced black canvases in WebGL2 via anywidget's blob URL context. Multiple approaches tried (WebGL1 with `OES_texture_float`, RGBA float, premultiplied alpha) — all produced black output.
- **Result:** uint8 normalization adds ~1ms per frame (negligible). The shader reads pre-normalized values from the R channel. vmin/vmax changes re-upload the texture (also ~1ms).

### 2026-04-06: JS-side Aladin Lite sync instead of Python round-trip (Accepted)

- **Decision:** Sync the Aladin Lite view directly in JavaScript interaction handlers
- **Why:** Python round-trip (JS → traitlet → Python observer → ipyaladin traitlet → JS) added ~50-100ms latency. When panning, the radio overlay and DSS background drifted apart visibly. Two separate widgets with Python-side sync never stayed in sync.
- **Result:** `syncAladin()` is called on every `mousemove` (during drag) and `wheel` event. Both views move together with zero latency.

### 2026-04-06: userInteracting flag to prevent model echo snap-back (Accepted)

- **Decision:** Add a `userInteracting` flag that blocks `syncView()` during and 500ms after user interaction
- **Why:** When the user drags the sphere, the JS sends view_ra/dec/fov to Python via `model.save_changes()`. Python processes this and the model echo propagates back to JS, triggering `change:view_ra` which calls `syncView()` and overwrites the local drag state. This caused the view to snap back to the pre-drag position.
- **Result:** `syncView()` returns immediately when `userInteracting` is true. The flag is set on `mousedown`, cleared 500ms after `mouseup`. Interaction is now smooth.

### 2026-04-06: setTimeout retries for initial model sync (Workaround)

- **Decision:** Call `syncAll()` immediately, at 150ms, and at 600ms after render
- **Why:** anywidget's model data (image_data, crval, vmin, etc.) is not always available when `render()` first runs. The traitlet values arrive asynchronously after the widget is displayed. Without retries, the widget renders with default values (empty image, vmin=0, vmax=1).
- **Result:** The 600ms retry reliably picks up the data. The `userInteracting` guard prevents these retries from interfering with user interaction.

### 2026-04-06: set_dataset() auto-computes FOV from image extent (Accepted)

- **Decision:** Calculate initial FOV from `npix * |cdelt|` instead of defaulting to 180°
- **Why:** A 180° gnomonic FOV makes the radio image appear very small. Users expected the image to fill the view on initial display.
- **Result:** `set_dataset()` computes `fov = max(n_l * |cdelt1|, n_m * |cdelt2|) * 0.9` and navigates to the phase center with this fitted FOV. The reset button returns to this fitted view.
