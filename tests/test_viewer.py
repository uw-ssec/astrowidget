"""Tests for SkyViewer Panel wrapper and click events."""

from __future__ import annotations

import numpy as np
import pytest
import xarray as xr
from astropy.wcs import WCS


def _make_wcs_header_str():
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---SIN", "DEC--SIN"]
    w.wcs.crval = [180.0, 45.0]
    w.wcs.cdelt = [-0.1, 0.1]
    w.wcs.crpix = [8.5, 8.5]
    w.wcs.cunit = ["deg", "deg"]
    return w.to_header().tostring(sep="\n")


def _make_dataset(n_t=3, n_f=4):
    data = np.random.randn(n_t, n_f, 1, 16, 16).astype(np.float32)
    return xr.Dataset(
        data_vars={"SKY": (["time", "frequency", "polarization", "l", "m"], data)},
        coords={
            "time": np.linspace(60000, 60001, n_t),
            "frequency": np.linspace(40e6, 80e6, n_f),
            "polarization": [0],
            "l": np.linspace(-0.5, 0.5, 16),
            "m": np.linspace(-0.5, 0.5, 16),
        },
        attrs={"fits_wcs_header": _make_wcs_header_str()},
    )


class TestClickEvents:
    def test_clicked_coord_traitlet(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        assert w.clicked_coord == (0.0, 0.0)

    def test_clicked_lm_traitlet(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        assert w.clicked_lm == (0.0, 0.0)

    def test_clicked_coord_settable(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        w.clicked_coord = (180.0, 45.0)
        assert w.clicked_coord == (180.0, 45.0)


class TestSkyViewer:
    def test_instantiation(self):
        from astrowidget.viewer import SkyViewer
        ds = _make_dataset()
        viewer = SkyViewer(ds)
        assert viewer.time_idx == 0
        assert viewer.freq_idx == 0
        assert viewer.cmap == "inferno"

    def test_time_freq_bounds(self):
        from astrowidget.viewer import SkyViewer
        ds = _make_dataset(n_t=5, n_f=8)
        viewer = SkyViewer(ds)
        assert viewer.param.time_idx.bounds == (0, 4)
        assert viewer.param.freq_idx.bounds == (0, 7)

    def test_param_change_updates_widget(self):
        from astrowidget.viewer import SkyViewer
        ds = _make_dataset()
        viewer = SkyViewer(ds)

        viewer.time_idx = 1
        assert viewer._widget.time_idx == 1

        viewer.cmap = "viridis"
        assert viewer._widget.colormap == "viridis"

        viewer.stretch = "log"
        assert viewer._widget.stretch == "log"

        viewer.show_grid = False
        assert viewer._widget.show_grid is False

    def test_from_zarr(self, tmp_path):
        from astrowidget.viewer import SkyViewer
        zarr_path = tmp_path / "test.zarr"
        _make_dataset().to_zarr(str(zarr_path), mode="w")

        viewer = SkyViewer.from_zarr(zarr_path)
        assert viewer._cube.n_times == 3
        assert viewer._cube.n_freqs == 4

    def test_from_zarr_memory_store(self):
        import zarr
        from astrowidget.viewer import SkyViewer

        store = zarr.MemoryStore()
        _make_dataset().to_zarr(store, mode="w")

        viewer = SkyViewer.from_zarr(store)
        assert viewer._cube.n_times == 3
