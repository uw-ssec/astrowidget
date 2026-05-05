# Development Guide

This guide covers the internals of astrowidget for contributors who need to
understand how the pieces fit together. Read it after the
[Getting Started](getting-started.md) guide and the
[Architecture Overview](../architecture/overview.md).

---

## Environment setup

astrowidget uses [pixi](https://pixi.sh) for reproducible Python + Node
environments. You need nothing else installed.

```bash
git clone https://github.com/uw-ssec/astrowidget.git
cd astrowidget
pixi install
pixi run test   # should pass before you touch anything
```

| Task | Command |
|---|---|
| All tests | `pixi run test` |
| Python tests only | `pixi run test-py` |
| JS tests only | `pixi run test-js` |
| Lint | `pixi run lint` |
| Build JS bundle | `pixi run build` |
| JS watch mode | `pixi run dev` |
| Serve docs | `pixi run docs-serve` |

---

## JS → Python traitlet bridge

Every piece of state that must be shared between the notebook and the browser
lives as a [traitlet](https://traitlets.readthedocs.io/) on `SkyWidget`
tagged with `.tag(sync=True)`.

```python
# src/astrowidget/widget.py
class SkyWidget(anywidget.AnyWidget):
    image_data   = traitlets.Bytes(b"").tag(sync=True)   # raw float32 bytes
    image_shape  = traitlets.Tuple((0, 0)).tag(sync=True)
    crval        = traitlets.Tuple((0.0, 0.0)).tag(sync=True)  # (RA, Dec) degrees
    cdelt        = traitlets.Tuple((0.0, 0.0)).tag(sync=True)  # pixel scale degrees
    crpix        = traitlets.Tuple((0.0, 0.0)).tag(sync=True)  # reference pixel
    view_ra      = traitlets.Float(0.0).tag(sync=True)
    view_dec     = traitlets.Float(0.0).tag(sync=True)
    view_fov     = traitlets.Float(180.0).tag(sync=True)
    colormap     = traitlets.Unicode("inferno").tag(sync=True)
    stretch      = traitlets.Unicode("linear").tag(sync=True)
    vmin         = traitlets.Float(0.0).tag(sync=True)
    vmax         = traitlets.Float(1.0).tag(sync=True)
    clicked_coord = traitlets.Tuple((0.0, 0.0)).tag(sync=True)  # JS → Python
    ...
```

anywidget's comm channel handles serialization automatically. The sync is
**bidirectional**:

- **Python → JS**: set a traitlet in Python (e.g. `widget.colormap = "viridis"`)
  and the JS frontend receives a `change:colormap` event immediately.
- **JS → Python**: the frontend sets a traitlet (e.g. `clicked_coord` on mouse
  click) and Python observers fire.

Python-side observers are registered with `self.observe()`:

```python
self.observe(self._on_slice_change, names=["time_idx", "freq_idx"])
```

On the JS side, listen for changes with the `model` object provided by
anywidget's `initialize` export:

```javascript
model.on("change:colormap", () => {
    renderer.setColormap(model.get("colormap"));
    renderer.render();
});
```

---

## Inline ESM loading

anywidget requires the frontend code to be provided as an ESM module. There are
two ways to do this: reference a file on disk, or embed the source directly in
the Python class.

astrowidget uses **inline embedding**:

```python
# src/astrowidget/widget.py
_STATIC = Path(__file__).parent / "static"
_JS_PATH = _STATIC / "widget.js"

class SkyWidget(anywidget.AnyWidget):
    _esm = _JS_PATH.read_text()   # bundle is read once at import time
    _css = ""
```

### Why not file-based ESM?

File-based ESM (passing a `pathlib.Path` to `_esm`) relies on the Jupyter
server being able to serve static files from the package directory. This breaks
in several common environments:

- **VS Code notebooks** — the static file server is not always active.
- **Google Colab** — static serving from installed packages is not supported.
- **JupyterHub deployments** — path resolution varies across server
  configurations.

Embedding the bundle as a string sidesteps all of this. The tradeoff is that
the bundle must be rebuilt (`pixi run build`) whenever the JS source changes,
and the Python package must be reinstalled to pick up the new bundle.

### Build pipeline

The source lives in `js/` and is compiled by Vite into
`src/astrowidget/static/widget.js`:

```
js/inline_widget.js   ← edit here
        ↓  pixi run build
src/astrowidget/static/widget.js   ← compiled bundle (do not edit)
        ↓  _JS_PATH.read_text()
SkyWidget._esm   ← embedded in the Python class at import time
```

Never edit `src/astrowidget/static/widget.js` directly — it will be
overwritten on the next build.

---

## uint8 normalization pipeline

WebGL2 guarantees support for `RGBA8` (uint8) textures with linear filtering.
Float textures (`OES_texture_float_linear`) are optional in WebGL2 and are
absent on some mobile GPUs and older integrated graphics. To ensure consistent
rendering everywhere, astrowidget converts image data to uint8 before uploading
to the GPU.

### Python side — send raw bytes

`set_image()` sends the array as raw `float32` bytes with no normalization:

```python
# src/astrowidget/widget.py
if data.dtype != np.float32:
    data = data.astype(np.float32)
self.image_shape = tuple(int(x) for x in data.shape)
self.image_data  = data.tobytes()   # ~1 MB for a 512×512 image
self.auto_scale()                   # sets vmin/vmax from percentiles
```

WCS parameters are sent separately as float64 tuples (`crval`, `cdelt`,
`crpix`), preserving full precision.

### JS side — normalize to uint8 for the GPU

The renderer (`js/inline_widget.js`) receives the float32 buffer and maps it
into the `[vmin, vmax]` range before uploading:

```javascript
function normalizeToUint8(floatData, width, height, vmin, vmax) {
  const n = width * height;
  const out = new Uint8Array(n * 4);  // RGBA
  const range = vmax - vmin || 1e-30;
  for (let i = 0; i < n; i++) {
    const val = floatData[i];
    if (val !== val || !isFinite(val)) {   // NaN / Inf → transparent
      out[i * 4 + 3] = 0;
      continue;
    }
    let norm = (val - vmin) / range;
    norm = norm < 0 ? 0 : norm > 1 ? 1 : norm;
    out[i * 4]     = (norm * 255 + 0.5) | 0;  // R = normalized intensity
    out[i * 4 + 3] = 255;                      // A = opaque
  }
  return out;
}
```

The result is uploaded as an `RGBA8` texture. Only the R channel carries image
data; the A channel encodes validity (0 = NaN/Inf, 255 = valid).

When `vmin` or `vmax` changes, `normalizeToUint8` runs again on the stored raw
data and the texture is re-uploaded — no round-trip to Python is needed.

### Stretch and colormap in the shader

Stretch (linear / log / sqrt / asinh) and colormap lookup happen entirely in
the fragment shader after texture sampling. The colormap is a separate 256×1
`RGBA8` texture. This keeps the CPU-side normalization simple and lets the GPU
handle per-pixel color math at full framerate.

---

## WebGL2 renderer and SIN projection

### Architecture

The renderer is a full-screen quad. Every frame, the fragment shader runs once
per canvas pixel, computing which sky coordinate that pixel maps to and looking
up the corresponding image value.

The projection pipeline per fragment:

```
canvas pixel (x, y)
    ↓  inverse gnomonic (screen → RA/Dec from view center)
(RA, Dec)
    ↓  SIN projection (RA/Dec → direction cosines l, m)
(l, m)
    ↓  WCS pixel transform (l/cdelt + crpix)
(px, py)  →  texture UV  →  sample image  →  stretch  →  colormap lookup
```

### Inverse gnomonic projection

The view renders a gnomonic (tangent-plane) projection centered on
`(view_ra, view_dec)` with half-angle `fov/2`. Normalized screen coordinates
`[-1, 1]` map to direction cosines in the view frame:

```glsl
float scale = tan(u_fov * 0.5);
float lV = -screen.x * scale * aspect;
float mV =  screen.y * scale;
```

These are then rotated from the view frame to absolute (RA, Dec) using the
gnomonic inverse formula.

### SIN projection

Given (RA, Dec) in radians and the phase center `crval`, the SIN projection
gives direction cosines relative to the phase center:

```glsl
float dra = ra - u_crval.x;
float l   = cos(dec) * sin(dra);
float m   = sin(dec)*cos(u_crval.y) - cos(dec)*sin(u_crval.y)*cos(dra);
```

Pixel coordinates follow from the standard WCS formula
(`px = l/cdelt_x + crpix_x - 1`, using 0-based indexing for the texture UV).

Pixels on the far side of the celestial sphere (`cosAngDist ≤ 0`) are
discarded with `alpha = 0`.

### Projection test vectors

The SIN math is validated against astropy-computed reference values in
`tests/fixtures/projection_vectors.json`. Regenerate them with:

```bash
pixi run vectors
```

Run the JS projection tests with:

```bash
pixi run test-js
```

---

## PR size limits

The repository enforces a **2,000-line cap** per PR (hard max 3,000 lines —
PRs over this are closed without review).

If your change is larger:

1. Split the work into independent PRs, each mergeable on its own.
2. A common split: (1) infrastructure / plumbing, (2) feature or content on top.
3. Open the PRs in order and reference the dependency in the description.

Every PR must reference its issue (`Fixes #N` or `See #N`), pass
`pixi run test` and `pixi run lint`, and include a rebuilt JS bundle if any
file under `js/` changed.
