"""PreloadedCube — LRU-cached slice loader for interactive visualization.

Loads individual 2D slices on demand with strided downsampling and caches
them for fast repeated access. Adapted from ovro_lwa_portal.viz._data.
"""

from __future__ import annotations

from functools import lru_cache
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    import xarray as xr

__all__ = ["PreloadedCube"]

_MAX_DISPLAY_SIZE = 512
_CACHE_SIZE = 32


class PreloadedCube:
    """Cached, spatially downsampled accessor for radio astronomy datasets.

    Loads individual 2D (l, m) slices on demand, applies strided
    downsampling to cap display resolution, and caches recently
    accessed slices via LRU cache.

    Parameters
    ----------
    ds : xr.Dataset
        Dataset with dimensions (time, frequency, polarization, l, m).
    var : str, default "SKY"
        Data variable name.
    pol : int, default 0
        Polarization index.
    max_size : int, default 512
        Maximum spatial dimension after downsampling.
    """

    def __init__(
        self,
        ds: xr.Dataset,
        var: str = "SKY",
        pol: int = 0,
        max_size: int = _MAX_DISPLAY_SIZE,
    ) -> None:
        self._ds = ds
        self.var = var
        self.pol = pol

        n_l = ds.sizes["l"]
        n_m = ds.sizes["m"]
        self.stride_l = max(1, n_l // max_size)
        self.stride_m = max(1, n_m // max_size)

        # Cache coordinate arrays (strided to match display resolution)
        self.l_vals = ds.coords["l"].values[:: self.stride_l]
        self.m_vals = ds.coords["m"].values[:: self.stride_m]
        self.time_vals = ds.coords["time"].values
        self.freq_vals = ds.coords["frequency"].values
        self.freq_mhz = self.freq_vals / 1e6
        self.n_times = len(self.time_vals)
        self.n_freqs = len(self.freq_vals)

    @lru_cache(maxsize=_CACHE_SIZE)  # noqa: B019
    def _load_slice(self, time_idx: int, freq_idx: int) -> np.ndarray:
        """Load and downsample a single (l, m) slice. Cached via LRU."""
        da = self._ds[self.var].isel(
            time=time_idx, frequency=freq_idx, polarization=self.pol
        )
        data = da.values[:: self.stride_l, :: self.stride_m]
        return data.astype(np.float32, copy=False)

    def image(self, time_idx: int = 0, freq_idx: int = 0) -> np.ndarray:
        """Get a 2D image slice, transposed for display (m, l) → (y, x)."""
        return self._load_slice(time_idx, freq_idx).T

    def spectrum(self, l_idx: int, m_idx: int, time_idx: int) -> np.ndarray:
        """Get a 1D frequency spectrum at a display pixel and time."""
        out = np.empty(self.n_freqs, dtype=np.float32)
        for fi in range(self.n_freqs):
            slc = self._load_slice(time_idx, fi)
            out[fi] = slc[l_idx, m_idx]
        return out

    def light_curve(self, l_idx: int, m_idx: int, freq_idx: int) -> np.ndarray:
        """Get a 1D time series at a display pixel and frequency."""
        out = np.empty(self.n_times, dtype=np.float32)
        for ti in range(self.n_times):
            slc = self._load_slice(ti, freq_idx)
            out[ti] = slc[l_idx, m_idx]
        return out

    def dynamic_spectrum(self, l_idx: int, m_idx: int) -> np.ndarray:
        """Get a 2D (time, freq) dynamic spectrum at a display pixel."""
        out = np.empty((self.n_times, self.n_freqs), dtype=np.float32)
        for ti in range(self.n_times):
            for fi in range(self.n_freqs):
                slc = self._load_slice(ti, fi)
                out[ti, fi] = slc[l_idx, m_idx]
        return out

    def nearest_lm_idx(self, l: float, m: float) -> tuple[int, int]:
        """Find nearest display pixel indices for given l, m values."""
        l_idx = int(np.argmin(np.abs(self.l_vals - l)))
        m_idx = int(np.argmin(np.abs(self.m_vals - m)))
        return l_idx, m_idx

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        """Image bounds as (l_left, m_bottom, l_right, m_top)."""
        return (
            float(self.l_vals[0]),
            float(self.m_vals[0]),
            float(self.l_vals[-1]),
            float(self.m_vals[-1]),
        )
