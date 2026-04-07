"""Tests for open_dataset() — unified zarr loading."""

from __future__ import annotations

import numpy as np
import pytest
import xarray as xr
import zarr


def _make_test_dataset(path=None):
    """Create a minimal synthetic dataset matching OVRO-LWA structure."""
    ds = xr.Dataset(
        data_vars={
            "SKY": (
                ["time", "frequency", "polarization", "l", "m"],
                np.random.randn(2, 3, 1, 16, 16).astype(np.float32),
            ),
        },
        coords={
            "time": np.array([60000.0, 60000.1]),
            "frequency": np.array([40e6, 50e6, 60e6]),
            "polarization": [0],
            "l": np.linspace(-0.5, 0.5, 16),
            "m": np.linspace(-0.5, 0.5, 16),
        },
        attrs={"fits_wcs_header": _make_wcs_header_str()},
    )
    if path:
        ds.to_zarr(str(path), mode="w")
    return ds


def _make_wcs_header_str():
    """Create a minimal SIN WCS header string."""
    from astropy.wcs import WCS

    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---SIN", "DEC--SIN"]
    w.wcs.crval = [180.0, 45.0]
    w.wcs.cdelt = [-0.1, 0.1]
    w.wcs.crpix = [8.5, 8.5]
    w.wcs.cunit = ["deg", "deg"]
    return w.to_header().tostring(sep="\n")


class TestOpenDatasetLocal:
    def test_open_local_zarr(self, tmp_path):
        from astrowidget import open_dataset

        zarr_path = tmp_path / "test.zarr"
        _make_test_dataset(zarr_path)

        ds = open_dataset(zarr_path)
        assert isinstance(ds, xr.Dataset)
        assert "SKY" in ds.data_vars
        assert ds.sizes["time"] == 2
        assert ds.sizes["frequency"] == 3

    def test_open_local_string_path(self, tmp_path):
        from astrowidget import open_dataset

        zarr_path = tmp_path / "test.zarr"
        _make_test_dataset(zarr_path)

        ds = open_dataset(str(zarr_path))
        assert isinstance(ds, xr.Dataset)

    def test_open_nonexistent_raises(self, tmp_path):
        from astrowidget import open_dataset

        with pytest.raises(FileNotFoundError):
            open_dataset(tmp_path / "nonexistent.zarr")

    def test_chunking_auto(self, tmp_path):
        from astrowidget import open_dataset

        zarr_path = tmp_path / "test.zarr"
        _make_test_dataset(zarr_path)

        ds = open_dataset(zarr_path, chunks="auto")
        assert ds.chunks is not None

    def test_chunking_none_loads_eagerly(self, tmp_path):
        from astrowidget import open_dataset

        zarr_path = tmp_path / "test.zarr"
        _make_test_dataset(zarr_path)

        ds = open_dataset(zarr_path, chunks=None)
        # With chunks=None, data is loaded eagerly (no dask)
        assert not hasattr(ds.SKY, "chunks") or ds.SKY.chunks is None

    def test_explicit_chunks(self, tmp_path):
        from astrowidget import open_dataset

        zarr_path = tmp_path / "test.zarr"
        _make_test_dataset(zarr_path)

        ds = open_dataset(zarr_path, chunks={"l": 8, "m": 8})
        assert isinstance(ds, xr.Dataset)


class TestOpenDatasetInMemory:
    def test_open_memory_store(self):
        from astrowidget import open_dataset

        store = zarr.MemoryStore()
        _make_test_dataset().to_zarr(store, mode="w")

        ds = open_dataset(store)
        assert isinstance(ds, xr.Dataset)
        assert "SKY" in ds.data_vars
        assert ds.sizes["time"] == 2

    def test_open_dict_store(self):
        from astrowidget import open_dataset

        store = {}
        _make_test_dataset().to_zarr(store, mode="w")

        ds = open_dataset(store)
        assert isinstance(ds, xr.Dataset)

    def test_wcs_preserved_in_memory(self):
        from astrowidget import get_wcs, open_dataset

        store = zarr.MemoryStore()
        _make_test_dataset().to_zarr(store, mode="w")

        ds = open_dataset(store)
        wcs = get_wcs(ds)
        assert wcs.wcs.ctype[0] == "RA---SIN"
        assert wcs.wcs.crval[0] == pytest.approx(180.0)
