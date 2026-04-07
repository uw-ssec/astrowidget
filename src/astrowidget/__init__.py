"""astrowidget — Interactive radio astronomy visualization for Jupyter.

Renders radio images on a rotatable celestial sphere with SIN projection,
reading directly from zarr. No FITS intermediary in the display path.
"""

__version__ = "0.1.0"

from astrowidget.widget import SkyWidget

__all__ = ["SkyWidget"]
