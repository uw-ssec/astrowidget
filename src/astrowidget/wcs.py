"""WCS extraction from zarr dataset metadata.

Searches for FITS WCS header strings stored redundantly during
FITS→zarr conversion. Adapted from ovro_lwa_portal.accessor._get_wcs.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    import xarray as xr

__all__ = ["get_wcs"]


def get_wcs(ds: xr.Dataset, var: str = "SKY"):
    """Extract WCS from zarr dataset metadata.

    Searches for the WCS header string in three locations (in order):
    1. Variable attrs: ``ds[var].attrs["fits_wcs_header"]``
    2. Dataset attrs: ``ds.attrs["fits_wcs_header"]``
    3. 0-D variable: ``ds["wcs_header_str"]``

    Parameters
    ----------
    ds : xr.Dataset
        Dataset with stored WCS metadata.
    var : str, default "SKY"
        Data variable to check attrs on first.

    Returns
    -------
    astropy.wcs.WCS
        The celestial WCS object.

    Raises
    ------
    ValueError
        If no WCS header is found in the dataset.
    """
    from astropy.io.fits import Header
    from astropy.wcs import WCS

    hdr_str = None

    # 1. Check variable attrs
    if var in ds.data_vars:
        hdr_str = ds[var].attrs.get("fits_wcs_header")

    # 2. Check dataset attrs
    if not hdr_str:
        hdr_str = ds.attrs.get("fits_wcs_header")

    # 3. Check wcs_header_str variable
    if not hdr_str and "wcs_header_str" in ds:
        val = ds["wcs_header_str"].values
        if isinstance(val, np.ndarray):
            val = val.item()
        if isinstance(val, (bytes, bytearray)) or type(val).__name__ == "bytes_":
            hdr_str = val.decode("utf-8", errors="replace")
        else:
            hdr_str = str(val)

    if not hdr_str:
        raise ValueError(
            "No WCS header found in dataset. Expected 'fits_wcs_header' "
            "attribute on variable/dataset or 'wcs_header_str' variable."
        )

    return WCS(Header.fromstring(hdr_str, sep="\n"))
