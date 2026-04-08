"""Unified zarr dataset loading for radio astronomy data.

Supports local paths, remote URLs (S3, HTTPS), and in-memory zarr stores.
Adapted from ovro_lwa_portal.io — no FITS in the display path.
"""

from __future__ import annotations

from collections.abc import MutableMapping
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import xarray as xr

__all__ = ["open_dataset", "DataSourceError"]


class DataSourceError(Exception):
    """Exception raised for errors in data source handling."""


def open_dataset(
    source: str | Path | MutableMapping,
    chunks: dict[str, int] | str | None = "auto",
    storage_options: dict[str, Any] | None = None,
    **kwargs: Any,
) -> xr.Dataset:
    """Load a zarr dataset as an xarray Dataset.

    Parameters
    ----------
    source : str, Path, or MutableMapping
        Data source, can be:
        - Local file path (e.g., "/path/to/data.zarr")
        - Remote URL (e.g., "s3://bucket/data.zarr", "https://...")
        - In-memory zarr store (``zarr.MemoryStore``, ``dict``, or any MutableMapping)
    chunks : dict, str, or None, default "auto"
        Chunking strategy for lazy loading:
        - dict: Explicit chunk sizes, e.g., ``{"time": 100, "l": 512}``
        - ``"auto"``: Let xarray/dask determine optimal chunks
        - ``None``: Load entirely into memory
    storage_options : dict, optional
        Options passed to the filesystem backend (e.g., S3 credentials).
    **kwargs
        Additional arguments passed to ``xr.open_zarr()``.

    Returns
    -------
    xr.Dataset

    Raises
    ------
    DataSourceError
        If source cannot be accessed or loaded.
    FileNotFoundError
        If local file path doesn't exist.
    """
    # In-memory zarr store (MutableMapping)
    if isinstance(source, MutableMapping):
        try:
            return xr.open_zarr(source, chunks=chunks, **kwargs)
        except Exception as e:
            raise DataSourceError(f"Failed to open in-memory zarr store: {e}") from e

    source_str = str(source)
    parsed = urlparse(source_str)
    protocol = parsed.scheme if parsed.scheme else ""

    # Remote URL (s3://, gs://, https://, etc.)
    if protocol in ("s3", "gs", "gcs", "abfs", "az", "https", "http"):
        return _open_remote(source_str, protocol, chunks, storage_options, **kwargs)

    # Local path
    return _open_local(source_str, chunks, **kwargs)


def _open_local(
    path: str,
    chunks: dict[str, int] | str | None,
    **kwargs: Any,
) -> xr.Dataset:
    """Open a local zarr store."""
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Local path does not exist: {p}")

    try:
        return xr.open_zarr(str(p), chunks=chunks, **kwargs)
    except Exception as e:
        raise DataSourceError(f"Failed to open local zarr store '{p}': {e}") from e


def _open_remote(
    url: str,
    protocol: str,
    chunks: dict[str, int] | str | None,
    storage_options: dict[str, Any] | None,
    **kwargs: Any,
) -> xr.Dataset:
    """Open a remote zarr store via fsspec."""
    try:
        import fsspec
    except ImportError as e:
        raise ImportError(
            "fsspec is required for remote access. "
            "Install with: pip install 'astrowidget[remote]'"
        ) from e

    opts = storage_options or {}

    if protocol in ("s3",):
        try:
            import s3fs  # noqa: F401
        except ImportError as e:
            raise ImportError(
                "s3fs is required for S3 access. "
                "Install with: pip install 'astrowidget[remote]'"
            ) from e

    try:
        if protocol in ("s3", "gs", "gcs", "abfs", "az"):
            fs = fsspec.filesystem(protocol, **opts)
            parsed = urlparse(url)
            path = f"{parsed.netloc}/{parsed.path.lstrip('/')}"
            store = fs.get_mapper(path)
        else:
            store = fsspec.get_mapper(url, **opts)

        return xr.open_zarr(store, chunks=chunks, **kwargs)
    except Exception as e:
        raise DataSourceError(f"Failed to open remote zarr store '{url}': {e}") from e
