"""SkyWidget — anywidget-based celestial sphere renderer.

Displays radio astronomy images on a rotatable celestial sphere using
WebGL2 fragment shader SIN projection. Image data is transferred as
raw float32 bytes — no FITS serialization.
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

import anywidget
import numpy as np
import traitlets

if TYPE_CHECKING:
    import astropy.units as u
    from astropy.coordinates import SkyCoord
    from astropy.wcs import WCS

_STATIC = Path(__file__).parent / "static"


class SkyWidget(anywidget.AnyWidget):
    """Interactive celestial sphere widget with SIN projection.

    Renders a 2D radio image on a rotatable sphere. Pan by dragging,
    zoom with scroll wheel. Image data is sent as raw float32 bytes
    via anywidget's binary comm channel.

    Parameters
    ----------
    All parameters are traitlets that sync bidirectionally with the
    JavaScript frontend.

    Examples
    --------
    >>> from astrowidget import SkyWidget
    >>> from astropy.wcs import WCS
    >>> import numpy as np
    >>> widget = SkyWidget()
    >>> widget.set_image(np.random.randn(256, 256).astype(np.float32), wcs)
    >>> widget  # displays in notebook
    """

    _esm = Path(__file__).parent.parent.parent / "js" / "inline_widget.js"
    _css = ""

    # --- Binary image data (raw float32 bytes, no JSON) ---
    image_data = traitlets.Bytes(b"").tag(sync=True)
    image_shape = traitlets.Tuple((0, 0)).tag(sync=True)

    # --- WCS parameters (float64 precision, transferred losslessly) ---
    crval = traitlets.Tuple((0.0, 0.0)).tag(sync=True)  # (RA, Dec) of phase center in degrees
    cdelt = traitlets.Tuple((0.0, 0.0)).tag(sync=True)  # pixel scale in degrees
    crpix = traitlets.Tuple((0.0, 0.0)).tag(sync=True)  # reference pixel (1-based FITS convention)

    # --- View state ---
    view_ra = traitlets.Float(0.0).tag(sync=True)   # current view center RA in degrees
    view_dec = traitlets.Float(0.0).tag(sync=True)  # current view center Dec in degrees
    view_fov = traitlets.Float(180.0).tag(sync=True) # field of view in degrees

    # --- Display options ---
    colormap = traitlets.Unicode("inferno").tag(sync=True)
    stretch = traitlets.Unicode("linear").tag(sync=True)
    vmin = traitlets.Float(0.0).tag(sync=True)
    vmax = traitlets.Float(1.0).tag(sync=True)
    opacity = traitlets.Float(1.0).tag(sync=True)

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._wcs = None
        self._current_data = None

    def set_image(self, data: np.ndarray, wcs: WCS) -> None:
        """Send a 2D numpy array to the widget for display on the sphere.

        Parameters
        ----------
        data : np.ndarray
            2D float array (image pixels). Will be converted to float32.
        wcs : astropy.wcs.WCS
            Celestial WCS for SIN projection parameters.

        Raises
        ------
        TypeError
            If wcs is not an astropy WCS object.
        ValueError
            If wcs lacks celestial axes or data is not 2D.
        """
        from astropy.wcs import WCS as AstropyWCS

        if not isinstance(wcs, AstropyWCS):
            raise TypeError("wcs must be an astropy.wcs.WCS object")
        if not wcs.has_celestial:
            raise ValueError("wcs must have celestial axes (RA/Dec)")
        if data.ndim != 2:
            raise ValueError(f"data must be 2D, got {data.ndim}D")

        if data.dtype != np.float32:
            data = data.astype(np.float32)

        self._wcs = wcs
        self._current_data = data

        # Extract WCS parameters with full float64 precision
        cel = wcs.celestial
        self.crval = (float(cel.wcs.crval[0]), float(cel.wcs.crval[1]))
        self.cdelt = (float(cel.wcs.cdelt[0]), float(cel.wcs.cdelt[1]))
        self.crpix = (float(cel.wcs.crpix[0]), float(cel.wcs.crpix[1]))

        # Send image as raw bytes — ~1MB for 512x512 float32
        self.image_shape = tuple(int(x) for x in data.shape)
        self.image_data = data.tobytes()

        # Auto-scale color limits
        self.auto_scale()

    def goto(self, target: SkyCoord, fov: u.Quantity | None = None) -> None:
        """Navigate the view to a celestial target.

        Parameters
        ----------
        target : astropy.coordinates.SkyCoord
            Target position on the sky.
        fov : astropy.units.Quantity, optional
            Field of view (e.g., ``10 * u.deg``). If None, keeps current FOV.
        """
        import astropy.units as u

        self.view_ra = float(target.icrs.ra.deg)
        self.view_dec = float(target.icrs.dec.deg)
        if fov is not None:
            self.view_fov = float(fov.to(u.deg).value)

    def auto_scale(self, percentile_low: float = 2, percentile_high: float = 98) -> None:
        """Set vmin/vmax from data percentiles.

        Parameters
        ----------
        percentile_low : float
            Lower percentile for vmin (default 2).
        percentile_high : float
            Upper percentile for vmax (default 98).
        """
        if self._current_data is None:
            return
        finite = self._current_data[np.isfinite(self._current_data)]
        if finite.size == 0:
            return
        self.vmin = float(np.percentile(finite, percentile_low))
        self.vmax = float(np.percentile(finite, percentile_high))
