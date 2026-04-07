"""Tests for SkyWidget Python class."""

from __future__ import annotations

import numpy as np
import pytest
from astropy.coordinates import SkyCoord
from astropy.wcs import WCS
import astropy.units as u


def _make_sin_wcs(ra0=180.0, dec0=45.0, cdelt=-0.1, crpix=129.0, naxis=256):
    """Create a reference SIN projection WCS."""
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---SIN", "DEC--SIN"]
    w.wcs.crval = [ra0, dec0]
    w.wcs.cdelt = [cdelt, abs(cdelt)]
    w.wcs.crpix = [crpix, crpix]
    w.wcs.cunit = ["deg", "deg"]
    return w


class TestSkyWidgetInit:
    def test_instantiation(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        assert w.view_fov == 180.0
        assert w.colormap == "inferno"
        assert w.stretch == "linear"
        assert w.opacity == 1.0

    def test_default_image_empty(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        assert w.image_data == b""
        assert w.image_shape == (0, 0)


class TestSetImage:
    def test_basic_set_image(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        data = np.random.randn(256, 256).astype(np.float32)
        wcs = _make_sin_wcs()
        w.set_image(data, wcs)

        assert w.image_shape == (256, 256)
        assert len(w.image_data) == 256 * 256 * 4  # float32 = 4 bytes

    def test_binary_serialization_roundtrip(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        data = np.array([[1.0, 2.0], [3.0, 4.0]], dtype=np.float32)
        wcs = _make_sin_wcs(crpix=1.0, naxis=2)
        w.set_image(data, wcs)

        recovered = np.frombuffer(w.image_data, dtype=np.float32).reshape(2, 2)
        np.testing.assert_array_equal(recovered, data)

    def test_dtype_conversion(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        data = np.ones((64, 64), dtype=np.float64)
        wcs = _make_sin_wcs(crpix=32.0, naxis=64)
        w.set_image(data, wcs)

        # Should be stored as float32
        recovered = np.frombuffer(w.image_data, dtype=np.float32)
        assert recovered.dtype == np.float32

    def test_wcs_parameter_extraction(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        wcs = _make_sin_wcs(ra0=123.456, dec0=-12.345, cdelt=-0.05, crpix=100.0)
        data = np.zeros((200, 200), dtype=np.float32)
        w.set_image(data, wcs)

        # Verify lossless float64 transfer
        assert w.crval == (123.456, -12.345)
        assert w.cdelt == (-0.05, 0.05)
        assert w.crpix == (100.0, 100.0)

    def test_rejects_non_wcs(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        with pytest.raises(TypeError, match="astropy.wcs.WCS"):
            w.set_image(np.zeros((10, 10)), "not a wcs")

    def test_rejects_non_celestial_wcs(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        wcs = WCS(naxis=2)
        wcs.wcs.ctype = ["FREQ", "STOKES"]
        with pytest.raises(ValueError, match="celestial"):
            w.set_image(np.zeros((10, 10)), wcs)

    def test_rejects_3d_data(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        wcs = _make_sin_wcs()
        with pytest.raises(ValueError, match="2D"):
            w.set_image(np.zeros((10, 10, 10)), wcs)

    def test_auto_scale_on_set_image(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        data = np.linspace(0, 100, 10000).reshape(100, 100).astype(np.float32)
        wcs = _make_sin_wcs(crpix=50.0, naxis=100)
        w.set_image(data, wcs)

        assert w.vmin == pytest.approx(np.percentile(data, 2), rel=1e-4)
        assert w.vmax == pytest.approx(np.percentile(data, 98), rel=1e-4)


class TestGoto:
    def test_goto_skycoord(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        target = SkyCoord(ra=83.633, dec=22.014, unit="deg")
        w.goto(target)

        assert w.view_ra == pytest.approx(83.633)
        assert w.view_dec == pytest.approx(22.014)

    def test_goto_with_fov(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        target = SkyCoord(ra=0, dec=0, unit="deg")
        w.goto(target, fov=10 * u.deg)

        assert w.view_fov == pytest.approx(10.0)

    def test_goto_preserves_fov_when_none(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        w.view_fov = 42.0
        target = SkyCoord(ra=0, dec=0, unit="deg")
        w.goto(target)

        assert w.view_fov == 42.0


class TestAutoScale:
    def test_auto_scale_with_nans(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        data = np.ones((100, 100), dtype=np.float32)
        data[0:10, :] = np.nan
        data[10:, :] = np.linspace(0, 100, 9000).reshape(90, 100).astype(np.float32)
        wcs = _make_sin_wcs(crpix=50.0, naxis=100)
        w.set_image(data, wcs)

        # vmin/vmax should be computed ignoring NaN
        finite = data[np.isfinite(data)]
        assert w.vmin == pytest.approx(np.percentile(finite, 2), rel=1e-4)

    def test_auto_scale_custom_percentiles(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        data = np.linspace(0, 100, 10000).reshape(100, 100).astype(np.float32)
        wcs = _make_sin_wcs(crpix=50.0, naxis=100)
        w.set_image(data, wcs)
        w.auto_scale(percentile_low=5, percentile_high=95)

        assert w.vmin == pytest.approx(np.percentile(data, 5), rel=1e-4)
        assert w.vmax == pytest.approx(np.percentile(data, 95), rel=1e-4)
