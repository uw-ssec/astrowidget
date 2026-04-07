"""Generate astropy projection test vectors for coordinate alignment validation.

Produces tests/fixtures/projection_vectors.json containing (RA,Dec) ↔ (l,m)
mappings computed by astropy's WCS. These vectors are the single source of
truth — both Python and JS tests validate against them.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from astropy.wcs import WCS


def make_reference_wcs() -> WCS:
    """Create a reference SIN projection WCS matching OVRO-LWA typical parameters."""
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---SIN", "DEC--SIN"]
    w.wcs.crval = [180.0, 45.0]  # Phase center: RA=180°, Dec=+45°
    w.wcs.cdelt = [-0.1, 0.1]    # 0.1°/pixel (6 arcmin), RA negative
    w.wcs.crpix = [129.0, 129.0] # Center of 256×256 image
    w.wcs.cunit = ["deg", "deg"]
    return w


def generate_vectors() -> dict:
    """Generate test vectors covering critical coordinate alignment cases."""
    wcs = make_reference_wcs()
    ra0 = wcs.wcs.crval[0]
    dec0 = wcs.wcs.crval[1]

    vectors = {
        "wcs": {
            "ctype": list(wcs.wcs.ctype),
            "crval": list(wcs.wcs.crval),
            "cdelt": list(wcs.wcs.cdelt),
            "crpix": list(wcs.wcs.crpix),
        },
        "forward": [],   # (RA, Dec) → (l, m)
        "inverse": [],   # (l, m) → (RA, Dec)
        "pixel": [],     # pixel → (RA, Dec) → pixel roundtrip
    }

    # Test points: (RA_offset_deg, Dec_offset_deg) from phase center
    offsets = [
        (0, 0),       # Phase center (exact)
        (5, 0),       # Small RA offset
        (0, 5),       # Small Dec offset
        (5, 5),       # Diagonal
        (-5, -5),     # Negative diagonal
        (10, 0),      # Moderate RA
        (0, 10),      # Moderate Dec
        (30, 0),      # Large RA offset
        (0, 30),      # Large Dec offset
        (10, 10),     # Moderate diagonal
        (45, 0),      # Very large RA offset
        (0, 40),      # Near pole (dec0=45 + 40 = 85°)
        (-30, -30),   # Large negative (dec0=45 - 30 = 15°)
    ]

    for dra, ddec in offsets:
        ra = ra0 + dra
        dec = dec0 + ddec

        # Clamp Dec to valid range
        if dec > 89.999 or dec < -89.999:
            continue

        ra_rad = np.radians(ra)
        dec_rad = np.radians(dec)
        ra0_rad = np.radians(ra0)
        dec0_rad = np.radians(dec0)

        # Forward SIN projection
        dra_rad = ra_rad - ra0_rad
        l = np.cos(dec_rad) * np.sin(dra_rad)
        m = np.sin(dec_rad) * np.cos(dec0_rad) - np.cos(dec_rad) * np.sin(dec0_rad) * np.cos(dra_rad)

        # Visibility check
        cosc = np.sin(dec_rad) * np.sin(dec0_rad) + np.cos(dec_rad) * np.cos(dec0_rad) * np.cos(dra_rad)
        visible = bool(cosc > 0)

        vectors["forward"].append({
            "ra_deg": float(ra),
            "dec_deg": float(dec),
            "l": float(l),
            "m": float(m),
            "visible": visible,
        })

        # Inverse
        if visible:
            r = np.sqrt(l**2 + m**2)
            if r <= 1.0 and r > 0:
                cosc_inv = np.sqrt(1 - r**2)
                phi = np.arctan2(l, -m)
                theta = np.arccos(r)

                dec_inv = np.arcsin(
                    np.sin(theta) * np.sin(dec0_rad) +
                    np.cos(theta) * np.cos(dec0_rad) * np.cos(phi)
                )
                ra_inv = ra0_rad + np.arctan2(
                    -np.cos(theta) * np.sin(phi),
                    np.sin(theta) * np.cos(dec0_rad) -
                    np.cos(theta) * np.sin(dec0_rad) * np.cos(phi)
                )

                vectors["inverse"].append({
                    "l": float(l),
                    "m": float(m),
                    "ra_deg": float(np.degrees(ra_inv)),
                    "dec_deg": float(np.degrees(dec_inv)),
                    "original_ra_deg": float(ra),
                    "original_dec_deg": float(dec),
                })

    # Pixel roundtrip tests using astropy WCS
    test_pixels = [
        (129, 129),  # Reference pixel (center)
        (64, 64),    # Bottom-left quadrant
        (192, 192),  # Top-right quadrant
        (1, 1),      # Corner
        (256, 256),  # Opposite corner
        (129, 1),    # Edge
        (1, 129),    # Edge
    ]

    for px, py in test_pixels:
        world = wcs.pixel_to_world(px - 1, py - 1)  # pixel_to_world uses 0-based
        if world is not None:
            ra_out = float(world.ra.deg)
            dec_out = float(world.dec.deg)

            # Roundtrip back to pixel
            pix_back = wcs.world_to_pixel(world)
            vectors["pixel"].append({
                "pixel_x": float(px),  # 1-based FITS convention
                "pixel_y": float(py),
                "ra_deg": ra_out,
                "dec_deg": dec_out,
                "roundtrip_px": float(pix_back[0]) + 1,  # back to 1-based
                "roundtrip_py": float(pix_back[1]) + 1,
            })

    return vectors


def main():
    vectors = generate_vectors()
    out_path = Path(__file__).parent / "fixtures" / "projection_vectors.json"
    out_path.parent.mkdir(exist_ok=True)
    out_path.write_text(json.dumps(vectors, indent=2))
    print(f"Wrote {len(vectors['forward'])} forward, {len(vectors['inverse'])} inverse, "
          f"{len(vectors['pixel'])} pixel vectors to {out_path}")


if __name__ == "__main__":
    main()
