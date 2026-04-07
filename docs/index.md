# astrowidget

Interactive radio astronomy visualization for Jupyter. Renders radio images on a rotatable celestial sphere with SIN projection, reading directly from zarr — no FITS intermediary.

## Why astrowidget?

| Problem with ipyaladin | astrowidget solution |
|---|---|
| Broken sphere overlay for radio images | Working SIN projection on rotatable sphere |
| Requires FITS round-trip (zarr → HDU → FITS → display) | Direct binary transfer (zarr → numpy → GPU) |
| GPL-3 license (Aladin Lite) | BSD-3, fully owned |
| No native zarr support | `open_dataset()` reads zarr natively |
| FITS serialization adds latency | Raw float32 transfer, <50ms per frame |
| No frequency/time slider controls | Built-in time/freq slice navigation |

## Quick Start

```python
from astrowidget import SkyWidget, open_dataset

# Load zarr data
ds = open_dataset("path/to/observation.zarr")

# Display on the celestial sphere
widget = SkyWidget()
widget.set_dataset(ds)
widget.background_survey = "DSS"  # optional HiPS background
widget
```

## Features

- **Interactive sphere** — Pan, zoom, and rotate the celestial sphere at 60fps
- **Zarr-native** — `open_dataset()` loads local, remote (S3), or in-memory zarr stores
- **Coordinate grid** — RA/Dec grid overlay with auto-scaling intervals
- **HiPS backgrounds** — Aladin Lite embed for DSS, WISE, Planck survey tiles
- **Click-to-inspect** — Click on the sphere to extract spectrum and light curve
- **SkyViewer dashboard** — Panel wrapper with controls and linked HoloViews panels
- **Box zoom** — Drag a rectangle to zoom into a region
- **63 tests** — pytest (Python) + vitest (JS) with astropy-validated projection vectors

## Documentation

| Section | Description |
|---|---|
| [Getting Started](guides/getting-started.md) | Installation, first widget, basic usage |
| [Architecture Overview](architecture/overview.md) | System design, data flow, component relationships |
| [Data Pipeline](architecture/data-pipeline.md) | Zarr loading, WCS extraction, PreloadedCube caching |
| [WebGL Renderer](architecture/webgl-renderer.md) | Fragment shader, SIN projection, coordinate math |
| [OVRO-LWA Integration](guides/ovro-lwa.md) | Using astrowidget with ovro-lwa-portal |
| [HiPS Backgrounds](guides/hips-backgrounds.md) | Aladin Lite embed, survey switching |
| [API Reference](api/sky-widget.md) | SkyWidget, open_dataset, SkyViewer |
