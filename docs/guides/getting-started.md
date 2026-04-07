# Getting Started

Install astrowidget and display your first radio image on the celestial sphere.

## Installation

### From source (development)

```bash
git clone https://github.com/uw-ssec/astrowidget.git
cd astrowidget
pixi install
pixi run test  # verify everything works
```

### As a dependency (e.g., in ovro-lwa-portal)

Add to `pyproject.toml`:

```toml
[tool.pixi.feature.visualization.pypi-dependencies]
astrowidget = { path = "../astrowidget", editable = true }
```

### From PyPI (once published)

```bash
pip install astrowidget
```

Optional extras:

```bash
pip install 'astrowidget[dashboard]'  # Panel, HoloViews, Bokeh
pip install 'astrowidget[remote]'     # S3, fsspec for remote zarr
```

## Pixi Tasks

| Task | Command | Description |
|---|---|---|
| `pixi run test` | `pytest + vitest` | Run all Python and JS tests |
| `pixi run test-py` | `pytest tests/ -v` | Run Python tests only |
| `pixi run test-js` | `npx vitest run` | Run JS tests only |
| `pixi run lint` | `ruff check src/ tests/` | Lint Python code |
| `pixi run build` | `npm run build` | Build JS bundle (Vite) |
| `pixi run docs-serve` | `mkdocs serve` | Serve docs locally at localhost:8000 |
| `pixi run docs-build` | `mkdocs build` | Build static docs site |
| `pixi run vectors` | Generate test vectors | Regenerate astropy projection fixtures |

## First Widget

```python
from astrowidget import SkyWidget
import numpy as np
from astropy.wcs import WCS
from astropy.coordinates import SkyCoord
import astropy.units as u

# Create a synthetic sky image
data = np.random.randn(256, 256).astype(np.float32)

# Define a SIN projection WCS
wcs = WCS(naxis=2)
wcs.wcs.ctype = ["RA---SIN", "DEC--SIN"]
wcs.wcs.crval = [180.0, 45.0]   # phase center
wcs.wcs.cdelt = [-0.1, 0.1]     # pixel scale (degrees)
wcs.wcs.crpix = [128.5, 128.5]  # reference pixel

# Display on the sphere
widget = SkyWidget()
widget.set_image(data, wcs)
widget.goto(SkyCoord(ra=180, dec=45, unit="deg"), fov=60 * u.deg)
widget  # displays in Jupyter
```

## Controls

| Action | How |
|---|---|
| Pan / rotate | Drag with mouse (in Pan mode) |
| Zoom | Scroll wheel |
| Box zoom | Click **&#x2B1A;** button, then drag a rectangle |
| Reset view | Click **&#x21BA;** button |
| Coordinate readout | Hover over the image |
| Click-to-inspect | Click on the sphere (sends RA/Dec to Python) |

## Loading Real Data

```python
from astrowidget import SkyWidget, open_dataset

# Local zarr store
ds = open_dataset("/path/to/observation.zarr")

# Remote S3
ds = open_dataset("s3://bucket/observation.zarr",
                  storage_options={"key": "...", "secret": "..."})

# In-memory
import zarr
store = zarr.MemoryStore()
# ... populate store ...
ds = open_dataset(store)

# Display with one line
widget = SkyWidget()
widget.set_dataset(ds)  # auto-fits FOV, extracts WCS, creates cache
widget
```

## Changing Display Options

```python
widget.colormap = "viridis"     # inferno, viridis, plasma, magma, grayscale
widget.stretch = "sqrt"         # linear, log, sqrt, asinh
widget.show_grid = False        # toggle RA/Dec grid
widget.auto_scale(5, 95)        # percentile-based vmin/vmax

# Navigate to a source
widget.goto(SkyCoord.from_name("Cas A"), fov=30 * u.deg)

# Switch time/frequency slice (requires set_dataset)
widget.time_idx = 5
widget.freq_idx = 3
```

## HiPS Background

```python
widget.background_survey = "DSS"  # set BEFORE displaying the widget
widget  # Aladin Lite tiles appear behind the radio data
```

Available presets: `DSS`, `2MASS`, `WISE`, `Planck`, `SDSS`, `Mellinger`, `Fermi`, `Haslam408`
