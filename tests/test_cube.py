"""Tests for PreloadedCube — LRU-cached slice loader."""

from __future__ import annotations

import numpy as np
import pytest
import xarray as xr


def _make_cube_dataset(n_t=3, n_f=4, n_l=32, n_m=32):
    """Create a synthetic dataset for cube tests."""
    # Fill with predictable values: pixel value = time*100 + freq*10 + l_idx
    data = np.zeros((n_t, n_f, 1, n_l, n_m), dtype=np.float32)
    for t in range(n_t):
        for f in range(n_f):
            data[t, f, 0] = t * 100 + f * 10 + np.arange(n_l)[:, None]

    return xr.Dataset(
        data_vars={
            "SKY": (["time", "frequency", "polarization", "l", "m"], data),
        },
        coords={
            "time": np.linspace(60000, 60001, n_t),
            "frequency": np.linspace(40e6, 80e6, n_f),
            "polarization": [0],
            "l": np.linspace(-0.5, 0.5, n_l),
            "m": np.linspace(-0.5, 0.5, n_m),
        },
    )


class TestPreloadedCube:
    def test_init(self):
        from astrowidget import PreloadedCube

        ds = _make_cube_dataset()
        cube = PreloadedCube(ds)
        assert cube.n_times == 3
        assert cube.n_freqs == 4
        assert cube.var == "SKY"

    def test_stride_downsampling(self):
        from astrowidget import PreloadedCube

        ds = _make_cube_dataset(n_l=1024, n_m=1024)
        cube = PreloadedCube(ds, max_size=256)
        assert cube.stride_l == 4
        assert cube.stride_m == 4
        assert len(cube.l_vals) == 256
        assert len(cube.m_vals) == 256

    def test_no_stride_for_small_images(self):
        from astrowidget import PreloadedCube

        ds = _make_cube_dataset(n_l=32, n_m=32)
        cube = PreloadedCube(ds, max_size=512)
        assert cube.stride_l == 1
        assert cube.stride_m == 1

    def test_image_shape(self):
        from astrowidget import PreloadedCube

        ds = _make_cube_dataset(n_l=32, n_m=32)
        cube = PreloadedCube(ds)
        img = cube.image(0, 0)
        # image() transposes (l,m) → (m,l) for display
        assert img.shape == (32, 32)
        assert img.dtype == np.float32

    def test_spectrum_shape(self):
        from astrowidget import PreloadedCube

        ds = _make_cube_dataset()
        cube = PreloadedCube(ds)
        spec = cube.spectrum(0, 0, time_idx=0)
        assert spec.shape == (4,)
        assert spec.dtype == np.float32

    def test_light_curve_shape(self):
        from astrowidget import PreloadedCube

        ds = _make_cube_dataset()
        cube = PreloadedCube(ds)
        lc = cube.light_curve(0, 0, freq_idx=0)
        assert lc.shape == (3,)
        assert lc.dtype == np.float32

    def test_dynamic_spectrum_shape(self):
        from astrowidget import PreloadedCube

        ds = _make_cube_dataset()
        cube = PreloadedCube(ds)
        dynspec = cube.dynamic_spectrum(0, 0)
        assert dynspec.shape == (3, 4)

    def test_cache_hit(self):
        from astrowidget import PreloadedCube

        ds = _make_cube_dataset()
        cube = PreloadedCube(ds)

        # First access
        img1 = cube._load_slice(0, 0)
        # Second access should return the same object (cache hit)
        img2 = cube._load_slice(0, 0)
        assert img1 is img2

    def test_nearest_lm_idx(self):
        from astrowidget import PreloadedCube

        ds = _make_cube_dataset()
        cube = PreloadedCube(ds)

        # Center should be near the middle index
        l_idx, m_idx = cube.nearest_lm_idx(0.0, 0.0)
        assert 14 <= l_idx <= 17
        assert 14 <= m_idx <= 17

    def test_bounds(self):
        from astrowidget import PreloadedCube

        ds = _make_cube_dataset()
        cube = PreloadedCube(ds)
        bounds = cube.bounds
        assert len(bounds) == 4
        assert bounds[0] < bounds[2]  # l_left < l_right (or could be reversed)

    def test_freq_mhz(self):
        from astrowidget import PreloadedCube

        ds = _make_cube_dataset()
        cube = PreloadedCube(ds)
        assert cube.freq_mhz[0] == pytest.approx(40.0)
        assert cube.freq_mhz[-1] == pytest.approx(80.0)
