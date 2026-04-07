# astrowidget

Interactive radio astronomy visualization for Jupyter. Renders radio images on a rotatable celestial sphere with SIN projection, reading directly from zarr stores -- no FITS intermediary.

<span><img src="https://img.shields.io/badge/SSEC-Project-purple?logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA0AAAAOCAQAAABedl5ZAAAACXBIWXMAAAHKAAABygHMtnUxAAAAGXRFWHRTb2Z0d2FyZQB3d3cuaW5rc2NhcGUub3Jnm+48GgAAAMNJREFUGBltwcEqwwEcAOAfc1F2sNsOTqSlNUopSv5jW1YzHHYY/6YtLa1Jy4mbl3Bz8QIeyKM4fMaUxr4vZnEpjWnmLMSYCysxTcddhF25+EvJia5hhCudULAePyRalvUteXIfBgYxJufRuaKuprKsbDjVUrUj40FNQ11PTzEmrCmrevPhRcVQai8m1PRVvOPZgX2JttWYsGhD3atbHWcyUqX4oqDtJkJiJHUYv+R1JbaNHJmP/+Q1HLu2GbNoSm3Ft0+Y1YMdPSTSwQAAAABJRU5ErkJggg==&style=plastic" /><span>
[![PyPI version](https://badge.fury.io/py/astrowidget.svg)](https://pypi.org/project/astrowidget/)
[![License](https://img.shields.io/badge/license-BSD--3--Clause-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-%E2%89%A53.11-blue.svg)](https://www.python.org/)
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.19451814.svg)](https://doi.org/10.5281/zenodo.19451814)

## Why astrowidget?

Existing tools like ipyaladin have significant limitations for radio astronomy workflows:

| Problem with ipyaladin | astrowidget solution |
|---|---|
| Broken sphere overlay for radio images | Correct SIN projection on a rotatable sphere |
| Requires FITS round-trip (zarr -> HDU -> FITS -> display) | Direct binary transfer (zarr -> numpy -> GPU) |
| GPL-3 license (Aladin Lite) | BSD-3, fully owned |
| No native zarr support | `open_dataset()` reads zarr natively |
| FITS serialization adds latency | Raw float32 transfer, <50 ms per frame |
| No frequency/time slider controls | Built-in time/freq slice navigation |

## Features

- **Interactive sphere** -- Pan, zoom, and rotate the celestial sphere at 60 fps
- **Zarr-native** -- Load local, remote (S3/HTTPS), or in-memory zarr stores
- **WCS coordinate grid** -- RA/Dec grid overlay with auto-scaling intervals
- **HiPS backgrounds** -- Aladin Lite embed for DSS, WISE, Planck survey tiles
- **Click-to-inspect** -- Click anywhere on the sphere to extract spectrum and light curve
- **SkyViewer dashboard** -- Panel-based dashboard with controls and linked HoloViews plots
- **Box zoom** -- Drag a rectangle to zoom into a region of interest
- **Tested** -- 63 Python + 15 JS tests with astropy-validated projection vectors

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

### Synthetic data

```python
from astrowidget import SkyWidget
import numpy as np
from astropy.wcs import WCS

data = np.random.randn(256, 256).astype(np.float32)

wcs = WCS(naxis=2)
wcs.wcs.ctype = ["RA---SIN", "DEC--SIN"]
wcs.wcs.crval = [180.0, 45.0]
wcs.wcs.cdelt = [-0.1, 0.1]
wcs.wcs.crpix = [128.5, 128.5]

widget = SkyWidget()
widget.set_image(data, wcs)
widget
```

### Dashboard with linked views

```python
from astrowidget import SkyViewer

viewer = SkyViewer.from_zarr("path/to/observation.zarr")
viewer.panel()
```

This opens a Panel dashboard with the sky widget, time/frequency sliders, colormap controls, and linked spectrum + light curve plots that update on click.

## Installation

### From PyPI

```bash
pip install astrowidget
```

Optional extras:

```bash
pip install 'astrowidget[dashboard]'  # Panel, HoloViews, Bokeh for SkyViewer
pip install 'astrowidget[remote]'     # S3/fsspec for remote zarr stores
pip install 'astrowidget[ingest]'     # xradio for radio data ingestion
```

### From source (development)

```bash
git clone https://github.com/uw-ssec/astrowidget.git
cd astrowidget
pixi install
pixi run test  # verify everything works
```

### As a dependency in another pixi project

Add to your `pyproject.toml`:

```toml
[tool.pixi.feature.visualization.pypi-dependencies]
astrowidget = { path = "../astrowidget", editable = true }
```

## Development

astrowidget uses [pixi](https://pixi.sh) for reproducible development environments. All tasks are defined in `pyproject.toml`:

| Task | Description |
|---|---|
| `pixi run test` | Run all Python and JS tests |
| `pixi run test-py` | Run Python tests only |
| `pixi run test-js` | Run JS tests only |
| `pixi run lint` | Lint with ruff |
| `pixi run build` | Build JS bundle with Vite |
| `pixi run dev` | Watch mode for JS development |
| `pixi run docs-serve` | Serve docs locally at localhost:8000 |
| `pixi run docs-build` | Build static documentation site |
| `pixi run vectors` | Regenerate astropy projection test fixtures |

### Build pipeline

1. **JS**: `npm run build` bundles `js/inline_widget.js` into `src/astrowidget/static/widget.js` via Vite
2. **Python**: `python -m build` creates sdist + wheel with the bundled JS
3. **CI/CD**: GitHub Actions builds and publishes to PyPI on release via trusted publisher

## Architecture

```
zarr store ──> xarray.Dataset ──> PreloadedCube (LRU cache)
                                       │
                                  float32 slice
                                       │
                              SkyWidget (anywidget)
                                       │
                               ┌───────┴───────┐
                               │  Python ←→ JS  │
                               │   (traitlets)  │
                               └───────┬───────┘
                                       │
                              WebGL2 fragment shader
                              ┌────────────────────┐
                              │ screen pixel        │
                              │   → gnomonic inv.   │
                              │   → RA/Dec          │
                              │   → SIN proj.       │
                              │   → (l, m)          │
                              │   → texture sample  │
                              │   → stretch         │
                              │   → colormap LUT    │
                              │   → RGBA            │
                              └────────────────────┘
```

### Key components

| Component | File | Role |
|---|---|---|
| `SkyWidget` | `src/astrowidget/widget.py` | Anywidget class -- bridges Python data to JS renderer |
| `open_dataset` | `src/astrowidget/io.py` | Unified zarr loader (local, S3, in-memory) |
| `PreloadedCube` | `src/astrowidget/cube.py` | LRU-cached slice loader with strided downsampling |
| `get_wcs` | `src/astrowidget/wcs.py` | WCS extraction from zarr metadata (3 fallback locations) |
| `SkyViewer` | `src/astrowidget/viewer.py` | Panel dashboard with linked spectrum/light curve views |
| WebGL renderer | `js/inline_widget.js` | Raw WebGL2 fragment shader with SIN projection |

## API Overview

### SkyWidget

The core widget for displaying radio images on the celestial sphere.

```python
widget = SkyWidget()

# Load data
widget.set_image(data_2d, wcs)           # numpy array + astropy WCS
widget.set_dataset(ds)                    # xarray Dataset from zarr

# Navigation
widget.goto(SkyCoord(180, 45, unit="deg"), fov=10)

# Display options
widget.colormap = "viridis"               # inferno, viridis, plasma, magma, grayscale
widget.stretch = "sqrt"                   # linear, log, sqrt, asinh
widget.show_grid = True                   # RA/Dec coordinate grid
widget.auto_scale(5, 99.5)               # percentile-based vmin/vmax

# HiPS background
widget.background_survey = "DSS"          # DSS, WISE, Planck, 2MASS, ...
widget.background_opacity = 0.5

# Events
widget.clicked_coord                      # (RA, Dec) of last click
```

### open_dataset

```python
from astrowidget import open_dataset

ds = open_dataset("/local/path.zarr")
ds = open_dataset("s3://bucket/obs.zarr", storage_options={"anon": True})
```

### SkyViewer

```python
from astrowidget import SkyViewer

viewer = SkyViewer.from_zarr("path/to/data.zarr")
viewer.panel()  # returns a Panel layout
```

## Tech Stack

| Layer | Technology |
|---|---|
| Widget framework | [anywidget](https://anywidget.dev) |
| Rendering | Raw WebGL2 (fragment shader) |
| Projection | SIN (slant orthographic) |
| Data format | zarr v2 via xarray + dask |
| Coordinates | astropy WCS |
| Dashboard | Panel + HoloViews + Bokeh |
| Build | Hatchling (Python) + Vite (JS) |
| Environment | pixi (conda-forge) |
| Testing | pytest + vitest |
| CI/CD | GitHub Actions -> PyPI trusted publisher |

## Documentation

Full documentation is available at [uw-ssec.github.io/astrowidget](https://uw-ssec.github.io/astrowidget):

| Section | Description |
|---|---|
| [Getting Started](https://uw-ssec.github.io/astrowidget/guides/getting-started/) | Installation, first widget, pixi tasks |
| [Architecture Overview](https://uw-ssec.github.io/astrowidget/architecture/overview/) | System design, data flow, components |
| [Data Pipeline](https://uw-ssec.github.io/astrowidget/architecture/data-pipeline/) | Zarr loading, WCS extraction, caching |
| [WebGL Renderer](https://uw-ssec.github.io/astrowidget/architecture/webgl-renderer/) | Fragment shader, SIN projection, colormaps |
| [Design Decisions](https://uw-ssec.github.io/astrowidget/architecture/decisions/) | Why raw WebGL2, inline ESM, uint8 textures |
| [OVRO-LWA Integration](https://uw-ssec.github.io/astrowidget/guides/ovro-lwa/) | Using with ovro-lwa-portal |
| [HiPS Backgrounds](https://uw-ssec.github.io/astrowidget/guides/hips-backgrounds/) | Aladin Lite survey configuration |
| [API Reference](https://uw-ssec.github.io/astrowidget/api/sky-widget/) | SkyWidget, open_dataset, SkyViewer |

## License

[BSD 3-Clause](LICENSE) -- Copyright (c) 2026, UW Scientific Software Engineering Center

## Citation

If you use astrowidget in your research, please cite:

```bibtex
@software{astrowidget,
  title     = {astrowidget: Interactive Radio Astronomy Visualization for Jupyter},
  author    = {{UW Scientific Software Engineering Center}},
  year      = {2026},
  url       = {https://github.com/uw-ssec/astrowidget},
  license   = {BSD-3-Clause}
}
```
