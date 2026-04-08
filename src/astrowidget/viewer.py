"""SkyViewer — Panel dashboard wrapper for SkyWidget.

Composes the interactive sphere widget with controls (time, frequency,
colormap, stretch) and linked HoloViews panels (spectrum, light curve)
that update on click.
"""

from __future__ import annotations

from collections.abc import MutableMapping
from pathlib import Path
from typing import TYPE_CHECKING

import param

if TYPE_CHECKING:
    import xarray as xr

__all__ = ["SkyViewer"]

SURVEY_HIPS = {
    "DSS": "CDS/P/DSS2/color",
    "2MASS": "CDS/P/2MASS/color",
    "WISE": "CDS/P/allWISE/color",
    "Planck": "CDS/P/PLANCK/R2/HFI/color",
    "SDSS": "CDS/P/SDSS9/color",
    "Mellinger": "CDS/P/Mellinger/color",
    "Fermi": "CDS/P/Fermi/color",
    "Haslam408": "CDS/P/HI4PI/NHI",
}


class SkyViewer(param.Parameterized):
    """Interactive sky viewer dashboard with linked spectrum/light curve panels.

    Parameters
    ----------
    ds : xr.Dataset
        Dataset with dimensions (time, frequency, polarization, l, m).
    var : str, default "SKY"
        Data variable name.
    pol : int, default 0
        Polarization index.
    max_size : int, default 512
        Maximum display resolution per spatial axis.

    Examples
    --------
    >>> viewer = SkyViewer(ds)
    >>> viewer.panel()  # displays in Jupyter

    >>> viewer = SkyViewer.from_zarr("path/to/data.zarr")
    >>> viewer.panel()
    """

    time_idx = param.Integer(default=0, bounds=(0, None), doc="Time slice index")
    freq_idx = param.Integer(default=0, bounds=(0, None), doc="Frequency slice index")
    cmap = param.Selector(
        default="inferno",
        objects=["inferno", "viridis", "plasma", "magma", "grayscale"],
        doc="Colormap",
    )
    stretch = param.Selector(
        default="linear",
        objects=["linear", "log", "sqrt", "asinh"],
        doc="Stretch function",
    )
    show_grid = param.Boolean(default=True, doc="Show RA/Dec grid overlay")
    background_survey = param.Selector(
        default="",
        objects=["", "DSS", "2MASS", "WISE", "Planck", "SDSS", "Mellinger", "Fermi", "Haslam408"],
        doc="HiPS background survey (empty = none)",
    )
    background_opacity = param.Number(default=1.0, bounds=(0.0, 1.0), doc="Background opacity")

    def __init__(self, ds: xr.Dataset, var: str = "SKY", pol: int = 0, max_size: int = 512, **kwargs):
        super().__init__(**kwargs)
        from astropy.coordinates import SkyCoord

        from astrowidget.cube import PreloadedCube
        from astrowidget.wcs import get_wcs
        from astrowidget.widget import SkyWidget

        self._cube = PreloadedCube(ds, var=var, pol=pol, max_size=max_size)
        self._wcs = get_wcs(ds, var=var)

        # Set time/freq bounds from data
        self.param.time_idx.bounds = (0, self._cube.n_times - 1)
        self.param.freq_idx.bounds = (0, self._cube.n_freqs - 1)

        # Create widget
        self._widget = SkyWidget()
        self._widget.set_dataset(ds, var=var, pol=pol, max_size=max_size)

        # Navigate to phase center
        SkyCoord(
            ra=self._wcs.wcs.crval[0], dec=self._wcs.wcs.crval[1],
            unit="deg", frame="fk5",
        )
        # set_dataset() already navigates to phase center with fitted FOV

        # Wire click event for linked views
        self._widget.observe(self._on_click, names=["clicked_lm"])

    @classmethod
    def from_zarr(
        cls,
        source: str | Path | MutableMapping,
        var: str = "SKY",
        pol: int = 0,
        max_size: int = 512,
        **open_kwargs,
    ) -> SkyViewer:
        """Create a SkyViewer from a zarr store in one line.

        Parameters
        ----------
        source : str, Path, or MutableMapping
            Zarr store path or in-memory store.
        var : str, default "SKY"
            Data variable name.
        pol : int, default 0
            Polarization index.
        max_size : int, default 512
            Maximum display resolution.
        **open_kwargs
            Additional arguments passed to ``open_dataset()``.

        Returns
        -------
        SkyViewer
        """
        from astrowidget.io import open_dataset

        ds = open_dataset(source, **open_kwargs)
        return cls(ds, var=var, pol=pol, max_size=max_size)

    @param.depends("time_idx", "freq_idx", watch=True)
    def _on_slice_change(self):
        self._widget.time_idx = self.time_idx
        self._widget.freq_idx = self.freq_idx

    @param.depends("cmap", watch=True)
    def _on_cmap_change(self):
        self._widget.colormap = self.cmap

    @param.depends("stretch", watch=True)
    def _on_stretch_change(self):
        self._widget.stretch = self.stretch

    @param.depends("show_grid", watch=True)
    def _on_grid_change(self):
        self._widget.show_grid = self.show_grid

    @param.depends("background_survey", watch=True)
    def _on_bg_survey_change(self):
        self._widget.background_survey = self.background_survey

    @param.depends("background_opacity", watch=True)
    def _on_bg_opacity_change(self):
        self._widget.background_opacity = self.background_opacity

    def _on_click(self, change):
        """Handle click events — update spectrum and light curve panels."""
        if not hasattr(self, "_spectrum_pane"):
            return
        l_val, m_val = change["new"]
        l_idx, m_idx = self._cube.nearest_lm_idx(l_val, m_val)

        import holoviews as hv

        # Update spectrum
        spec = self._cube.spectrum(l_idx, m_idx, self.time_idx)
        self._spectrum_pane.object = hv.Curve(
            (self._cube.freq_mhz, spec),
            kdims=["Frequency (MHz)"],
            vdims=["Intensity (Jy/beam)"],
        ).opts(title=f"Spectrum at l={l_val:.3f}, m={m_val:.3f}", responsive=True, height=250)

        # Update light curve
        lc = self._cube.light_curve(l_idx, m_idx, self.freq_idx)
        self._lightcurve_pane.object = hv.Curve(
            (self._cube.time_vals, lc),
            kdims=["Time (MJD)"],
            vdims=["Intensity (Jy/beam)"],
        ).opts(title=f"Light Curve at {self._cube.freq_mhz[self.freq_idx]:.1f} MHz", responsive=True, height=250)

    def panel(self):
        """Create and return the Panel dashboard layout.

        Returns
        -------
        pn.viewable.Viewable
        """
        import holoviews as hv
        import panel as pn

        if not hv.Store.renderers:
            hv.extension("bokeh")

        # Sky widget pane
        sky_pane = pn.pane.IPyWidget(self._widget, sizing_mode="stretch_both")

        # Controls
        controls = pn.Column(
            pn.widgets.IntSlider.from_param(self.param.time_idx, name="Time"),
            pn.widgets.IntSlider.from_param(self.param.freq_idx, name="Frequency"),
            pn.widgets.Select.from_param(self.param.cmap, name="Colormap"),
            pn.widgets.Select.from_param(self.param.stretch, name="Stretch"),
            pn.widgets.Checkbox.from_param(self.param.show_grid, name="Grid"),
            "---",
            pn.widgets.Select.from_param(self.param.background_survey, name="Background"),
            pn.widgets.FloatSlider.from_param(self.param.background_opacity, name="BG Opacity", step=0.05),
            width=250,
        )

        # Linked view panes (updated on click)
        self._spectrum_pane = pn.pane.HoloViews(
            hv.Curve([], kdims=["Frequency (MHz)"], vdims=["Intensity (Jy/beam)"]).opts(
                title="Click on image for spectrum", responsive=True, height=250
            ),
            sizing_mode="stretch_width",
        )
        self._lightcurve_pane = pn.pane.HoloViews(
            hv.Curve([], kdims=["Time (MJD)"], vdims=["Intensity (Jy/beam)"]).opts(
                title="Click on image for light curve", responsive=True, height=250
            ),
            sizing_mode="stretch_width",
        )

        linked_views = pn.Column(
            self._spectrum_pane,
            self._lightcurve_pane,
            min_width=350,
        )

        return pn.Row(
            controls,
            sky_pane,
            linked_views,
            sizing_mode="stretch_width",
        )
