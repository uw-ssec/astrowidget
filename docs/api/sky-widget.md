# SkyWidget API

`astrowidget.SkyWidget` — Interactive celestial sphere widget with SIN projection.

## Constructor

```python
from astrowidget import SkyWidget

widget = SkyWidget()
```

No arguments. All state is managed via traitlets.

## Methods

### set_image(data, wcs)

Send a 2D numpy array to the widget for display on the sphere.

| Parameter | Type | Description |
|---|---|---|
| `data` | `np.ndarray` | 2D float array. Converted to float32 if needed. |
| `wcs` | `astropy.wcs.WCS` | Celestial WCS with SIN projection. |

```python
widget.set_image(data, wcs)
```

Raises `TypeError` if `wcs` is not an astropy WCS. Raises `ValueError` if WCS lacks celestial axes or data is not 2D. Automatically calls `auto_scale()`.

### set_dataset(ds, var="SKY", pol=0, max_size=512)

Load a zarr-backed dataset for interactive exploration. Creates a `PreloadedCube`, extracts WCS, and displays the initial slice.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `ds` | `xr.Dataset` | required | Dataset with (time, frequency, polarization, l, m) |
| `var` | `str` | `"SKY"` | Data variable name |
| `pol` | `int` | `0` | Polarization index |
| `max_size` | `int` | `512` | Max display resolution per axis |

### goto(target, fov=None)

Navigate the view to a celestial target.

| Parameter | Type | Description |
|---|---|---|
| `target` | `SkyCoord` | Target position |
| `fov` | `Quantity` or `None` | Field of view (e.g., `30 * u.deg`) |

### auto_scale(percentile_low=2, percentile_high=98)

Set vmin/vmax from data percentiles.

### update_slice(time_idx, freq_idx)

Update the displayed image to a different time/frequency slice. Requires `set_dataset()` first.

### overlay(survey="DSS", height=600)

Display the widget overlaid on HiPS survey tiles using an ipywidgets GridBox.

### create_background(survey, fov=None)

Create a standalone ipyaladin widget synced to this widget's view.

## Traitlets

All traitlets are synced bidirectionally with the JavaScript frontend.

### Image Data

| Traitlet | Type | Default | Description |
|---|---|---|---|
| `image_data` | `Bytes` | `b""` | Raw float32 image bytes |
| `image_shape` | `Tuple` | `(0, 0)` | Image dimensions (height, width) |
| `crval` | `Tuple` | `(0, 0)` | Phase center (RA, Dec) in degrees |
| `cdelt` | `Tuple` | `(0, 0)` | Pixel scale in degrees |
| `crpix` | `Tuple` | `(0, 0)` | Reference pixel (1-based) |

### View State

| Traitlet | Type | Default | Description |
|---|---|---|---|
| `view_ra` | `Float` | `0.0` | View center RA in degrees |
| `view_dec` | `Float` | `0.0` | View center Dec in degrees |
| `view_fov` | `Float` | `180.0` | Field of view in degrees |

### Display Options

| Traitlet | Type | Default | Description |
|---|---|---|---|
| `colormap` | `Unicode` | `"inferno"` | Colormap name |
| `stretch` | `Unicode` | `"linear"` | Stretch function |
| `vmin` | `Float` | `0.0` | Color scale minimum |
| `vmax` | `Float` | `1.0` | Color scale maximum |
| `opacity` | `Float` | `1.0` | Image opacity |
| `show_grid` | `Bool` | `True` | Show RA/Dec grid |

### Background

| Traitlet | Type | Default | Description |
|---|---|---|---|
| `background_survey` | `Unicode` | `""` | HiPS survey preset or URL |
| `background_opacity` | `Float` | `1.0` | Background opacity |

### Click Events

| Traitlet | Type | Default | Description |
|---|---|---|---|
| `clicked_coord` | `Tuple` | `(0, 0)` | Last click (RA, Dec) in degrees |
| `clicked_lm` | `Tuple` | `(0, 0)` | Last click (l, m) direction cosines |

### Slice Indices

| Traitlet | Type | Default | Description |
|---|---|---|---|
| `time_idx` | `Int` | `0` | Current time slice index |
| `freq_idx` | `Int` | `0` | Current frequency slice index |
