"""Tests for Phase 5 HiPS background traitlets."""

from __future__ import annotations


class TestBackgroundTraitlets:
    def test_default_no_background(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        assert w.background_survey == ""

    def test_default_opacity(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        assert w.background_opacity == 1.0

    def test_set_survey(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        w.background_survey = "DSS"
        assert w.background_survey == "DSS"

    def test_clear_survey(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        w.background_survey = "DSS"
        w.background_survey = ""
        assert w.background_survey == ""

    def test_set_opacity(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        w.background_opacity = 0.5
        assert w.background_opacity == 0.5

    def test_all_survey_names(self):
        from astrowidget import SkyWidget
        w = SkyWidget()
        for name in ["DSS", "2MASS", "WISE", "Planck", "SDSS", "Mellinger", "Fermi", "Haslam408"]:
            w.background_survey = name
            assert w.background_survey == name


class TestSkyViewerBackground:
    def test_viewer_has_background_params(self):
        import numpy as np
        import xarray as xr
        from astropy.wcs import WCS

        from astrowidget.viewer import SkyViewer

        w = WCS(naxis=2)
        w.wcs.ctype = ["RA---SIN", "DEC--SIN"]
        w.wcs.crval = [180.0, 45.0]
        w.wcs.cdelt = [-0.1, 0.1]
        w.wcs.crpix = [8.5, 8.5]
        w.wcs.cunit = ["deg", "deg"]

        ds = xr.Dataset(
            data_vars={"SKY": (["time", "frequency", "polarization", "l", "m"],
                               np.zeros((2, 3, 1, 16, 16), dtype=np.float32))},
            coords={
                "time": [60000.0, 60000.1],
                "frequency": [40e6, 50e6, 60e6],
                "polarization": [0],
                "l": np.linspace(-0.5, 0.5, 16),
                "m": np.linspace(-0.5, 0.5, 16),
            },
            attrs={"fits_wcs_header": w.to_header().tostring(sep="\n")},
        )

        viewer = SkyViewer(ds)
        assert viewer.background_survey == ""
        assert viewer.background_opacity == 1.0

        viewer.background_survey = "DSS"
        assert viewer._widget.background_survey == "DSS"

        viewer.background_opacity = 0.7
        assert viewer._widget.background_opacity == 0.7
