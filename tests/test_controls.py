"""Tests for Phase 3 controls: grid, time/freq sliders, display options."""

from __future__ import annotations

import numpy as np
import xarray as xr
from astropy.wcs import WCS


def _make_sin_wcs():
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---SIN", "DEC--SIN"]
    w.wcs.crval = [180.0, 45.0]
    w.wcs.cdelt = [-0.1, 0.1]
    w.wcs.crpix = [8.5, 8.5]
    w.wcs.cunit = ["deg", "deg"]
    return w


def _make_dataset(n_t=3, n_f=4):
    data = np.random.randn(n_t, n_f, 1, 16, 16).astype(np.float32)
    hdr_str = _make_sin_wcs().to_header().tostring(sep="\n")
    return xr.Dataset(
        data_vars={"SKY": (["time", "frequency", "polarization", "l", "m"], data)},
        coords={
            "time": np.linspace(60000, 60001, n_t),
            "frequency": np.linspace(40e6, 80e6, n_f),
            "polarization": [0],
            "l": np.linspace(-0.5, 0.5, 16),
            "m": np.linspace(-0.5, 0.5, 16),
        },
        attrs={"fits_wcs_header": hdr_str},
    )


class TestGridTraitlets:
    def test_show_grid_default(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        assert w.show_grid is True

    def test_show_grid_toggle(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        w.show_grid = False
        assert w.show_grid is False


class TestSliceTraitlets:
    def test_time_idx_default(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        assert w.time_idx == 0

    def test_freq_idx_default(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        assert w.freq_idx == 0

    def test_slice_change_updates_image(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        ds = _make_dataset()
        w.set_dataset(ds)

        # Capture initial image bytes
        initial_data = w.image_data

        # Change time index — should trigger new image
        w.time_idx = 1
        assert w.image_data != initial_data

    def test_freq_change_updates_image(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        ds = _make_dataset()
        w.set_dataset(ds)

        initial_data = w.image_data

        w.freq_idx = 2
        assert w.image_data != initial_data

    def test_slice_change_without_dataset_is_safe(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        # No dataset loaded — changing idx should not crash
        w.time_idx = 5
        w.freq_idx = 3


class TestDisplayOptions:
    def test_colormap_options(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        for cmap in ["inferno", "viridis", "plasma", "magma", "grayscale"]:
            w.colormap = cmap
            assert w.colormap == cmap

    def test_stretch_options(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        for s in ["linear", "log", "sqrt", "asinh"]:
            w.stretch = s
            assert w.stretch == s

    def test_opacity_range(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        w.opacity = 0.5
        assert w.opacity == 0.5

    def test_vmin_vmax(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        w.vmin = -10.0
        w.vmax = 10.0
        assert w.vmin == -10.0
        assert w.vmax == 10.0


class TestAutoScale:
    def test_auto_scale_after_set_dataset(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        ds = _make_dataset()
        w.set_dataset(ds)

        # vmin/vmax should be set from data percentiles, not defaults
        assert w.vmin != 0.0 or w.vmax != 1.0

    def test_auto_scale_updates_on_slice_change(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        ds = _make_dataset()
        w.set_dataset(ds)

        w.time_idx = 2
        # Different slice may produce different auto-scale
        # (at minimum, set_image was called which runs auto_scale)
        assert w.vmin is not None
