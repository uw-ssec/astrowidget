# SkyViewer API

`astrowidget.SkyViewer` — Panel dashboard wrapper with controls and linked views.

!!! note "Optional dependency"
    SkyViewer requires `panel`, `holoviews`, `bokeh`, and `param`.
    Install with: `pip install 'astrowidget[dashboard]'`

## Constructor

```python
from astrowidget import SkyViewer

viewer = SkyViewer(ds, var="SKY", pol=0, max_size=512)
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `ds` | `xr.Dataset` | required | Dataset with WCS metadata |
| `var` | `str` | `"SKY"` | Data variable name |
| `pol` | `int` | `0` | Polarization index |
| `max_size` | `int` | `512` | Max display resolution |

## Class Methods

### from_zarr

```python
viewer = SkyViewer.from_zarr("path/to/data.zarr", var="SKY", pol=0)
```

One-liner: opens dataset, creates viewer, navigates to phase center.

## Parameters

All parameters are `param.Parameterized` and can be set programmatically or via Panel widgets.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `time_idx` | `Integer` | `0` | Time slice index |
| `freq_idx` | `Integer` | `0` | Frequency slice index |
| `cmap` | `Selector` | `"inferno"` | Colormap |
| `stretch` | `Selector` | `"linear"` | Stretch function |
| `show_grid` | `Boolean` | `True` | Show RA/Dec grid |
| `background_survey` | `Selector` | `""` | HiPS background |
| `background_opacity` | `Number` | `1.0` | Background opacity |

## Methods

### panel()

Create and return the Panel dashboard layout.

```python
viewer.panel()  # displays in Jupyter
```

Returns `pn.Row` containing:
- **Controls column** (left): time/freq sliders, colormap/stretch selectors, grid toggle, background controls
- **Sky widget** (center): the interactive SkyWidget
- **Linked views** (right): spectrum and light curve panels (update on click)

## Click-to-Inspect

When the user clicks on the sphere in the dashboard:

1. `clicked_lm` traitlet fires with (l, m) direction cosines
2. The observer extracts spectrum and light curve from `PreloadedCube`
3. HoloViews `Curve` elements update in the linked views column

## Example

```python
import panel as pn
pn.extension()

from astrowidget import SkyViewer

viewer = SkyViewer(ds)
viewer.panel()  # full dashboard with controls + linked views
```
