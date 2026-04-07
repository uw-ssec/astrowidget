# OVRO-LWA Integration

Use astrowidget with the ovro-lwa-portal package to visualize OVRO-LWA radio observations.

## Setup

Add astrowidget to the ovro-lwa-portal pixi environment:

```toml
# In ovro-lwa-portal/pyproject.toml
[tool.pixi.feature.visualization.pypi-dependencies]
astrowidget = { path = "../astrowidget", editable = true }
```

Then install:

```bash
cd ovro-lwa-portal
pixi install
```

## Basic Usage

```python
import ovro_lwa_portal as ovro
from astrowidget import SkyWidget

# Load data via DOI
ds = ovro.open_dataset(
    "10.33569/4q7nb-ahq31",
    production=False,
    storage_options={"key": os.environ["OSN_KEY"], "secret": os.environ["OSN_SECRET"]},
)

# Display on the sphere — one line
widget = SkyWidget()
widget.set_dataset(ds)
widget
```

`set_dataset()` handles everything:

1. Creates a `PreloadedCube` with strided downsampling (4096 → 512 pixels)
2. Extracts the WCS from zarr metadata
3. Adjusts WCS for the downsampled resolution
4. Sends the initial slice to the GPU
5. Navigates to the phase center with a fitted FOV

## What it Replaces

### Old way (ipyaladin)

```python
# 1. Extract WCS header string from zarr
wcs = ds.radport._get_wcs()

# 2. Load slice and downsample
image = ds.SKY.isel(time=0, frequency=0, polarization=0).values[::8, ::8]

# 3. Build FITS HDU (the round-trip)
from ovro_lwa_portal.viz.sky_viewer import _build_fits_hdu
hdul = _build_fits_hdu(ds, time_idx=0, freq_idx=0)

# 4. Display in Aladin (serializes FITS again)
from ipyaladin import Aladin
aladin = Aladin(target=..., fov=180, survey="CDS/P/DSS2/color")
aladin.add_fits(hdul, name="OVRO-LWA")  # broken: overlay doesn't render
```

### New way (astrowidget)

```python
widget = SkyWidget()
widget.set_dataset(ds)
widget.background_survey = "DSS"
widget
```

## Time/Frequency Navigation

```python
# Switch slices via traitlets (cached, instant after first load)
widget.time_idx = 5
widget.freq_idx = 3

# Check available range
print(f"Times: {widget._cube.n_times}")
print(f"Freqs: {widget._cube.n_freqs}")
print(f"Freq MHz: {widget._cube.freq_mhz}")
```

## Navigating to Sources

```python
from astropy.coordinates import SkyCoord
import astropy.units as u

# Navigate to a known source
widget.goto(SkyCoord.from_name("Cas A"), fov=30 * u.deg)
widget.goto(SkyCoord.from_name("Cyg A"), fov=20 * u.deg)

# Read current view position (after pan/zoom)
print(f"RA: {widget.view_ra:.4f}°, Dec: {widget.view_dec:.4f}°")
print(f"FOV: {widget.view_fov:.2f}°")
```

## Click-to-Inspect

```python
# After clicking on the sphere:
print(f"Clicked: RA={widget.clicked_coord[0]:.4f}°, Dec={widget.clicked_coord[1]:.4f}°")
print(f"Direction cosines: l={widget.clicked_lm[0]:.4f}, m={widget.clicked_lm[1]:.4f}")

# Extract spectrum at clicked position
l_idx, m_idx = widget._cube.nearest_lm_idx(*widget.clicked_lm)
spec = widget._cube.spectrum(l_idx, m_idx, time_idx=widget.time_idx)
```
