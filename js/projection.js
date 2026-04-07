/**
 * SIN (slant orthographic) projection math.
 *
 * Implements forward and inverse SIN projection matching FITS WCS Paper II
 * (Calabretta & Greisen 2002). These functions are the single source of
 * truth for coordinate transforms in JS — the GLSL shader mirrors this math.
 *
 * All angles in radians unless noted.
 */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Forward SIN projection: celestial (RA, Dec) → direction cosines (l, m).
 *
 * @param {number} ra  - Right ascension in radians
 * @param {number} dec - Declination in radians
 * @param {number} ra0 - Phase center RA in radians (CRVAL1)
 * @param {number} dec0 - Phase center Dec in radians (CRVAL2)
 * @returns {{ l: number, m: number, visible: boolean }}
 */
export function celestialToLM(ra, dec, ra0, dec0) {
  const dra = ra - ra0;
  const sinDec = Math.sin(dec);
  const cosDec = Math.cos(dec);
  const sinDec0 = Math.sin(dec0);
  const cosDec0 = Math.cos(dec0);
  const cosDra = Math.cos(dra);

  // Visibility check: cos(angular distance) > 0 means on the near side
  const cosc = sinDec * sinDec0 + cosDec * cosDec0 * cosDra;

  const l = cosDec * Math.sin(dra);
  const m = sinDec * cosDec0 - cosDec * sinDec0 * cosDra;

  return { l, m, visible: cosc > 0 };
}

/**
 * Inverse SIN projection: direction cosines (l, m) → celestial (RA, Dec).
 *
 * @param {number} l - Direction cosine l
 * @param {number} m - Direction cosine m
 * @param {number} ra0 - Phase center RA in radians
 * @param {number} dec0 - Phase center Dec in radians
 * @returns {{ ra: number, dec: number } | null} null if outside unit circle
 */
export function lmToCelestial(l, m, ra0, dec0) {
  const r = Math.sqrt(l * l + m * m);
  if (r > 1.0) return null;

  const sinDec0 = Math.sin(dec0);
  const cosDec0 = Math.cos(dec0);

  let dec, ra;
  if (r === 0) {
    dec = dec0;
    ra = ra0;
  } else {
    const cosc = Math.sqrt(1 - r * r); // cos(angular distance) for SIN
    dec = Math.asin(cosc * sinDec0 + m * cosDec0 / r * r);

    // More numerically stable formulation
    const sinc = r; // sin(angular distance) for SIN where theta = acos(r)
    dec = Math.asin(cosc * sinDec0 + (m * cosDec0 * sinc) / r);
    ra = ra0 + Math.atan2(l * sinc, r * cosDec0 * cosc - m * sinDec0 * sinc);
  }

  return { ra, dec };
}

/**
 * Screen pixel → celestial (RA, Dec) via inverse gnomonic from view center.
 *
 * @param {number} x - Normalized screen x [-1, 1]
 * @param {number} y - Normalized screen y [-1, 1]
 * @param {number} viewRA - View center RA in radians
 * @param {number} viewDec - View center Dec in radians
 * @param {number} viewFov - Field of view in radians
 * @param {number} aspect - Canvas aspect ratio (width/height)
 * @returns {{ ra: number, dec: number } | null}
 */
export function screenToCelestial(x, y, viewRA, viewDec, viewFov, aspect) {
  const scale = Math.tan(viewFov * 0.5);
  const lView = -x * scale * aspect;
  const mView = y * scale;

  const r = Math.sqrt(lView * lView + mView * mView);
  const c = Math.atan(r);

  if (r === 0) return { ra: viewRA, dec: viewDec };

  const sinc = Math.sin(c);
  const cosc = Math.cos(c);
  const sinDec0 = Math.sin(viewDec);
  const cosDec0 = Math.cos(viewDec);

  const dec = Math.asin(cosc * sinDec0 + (mView * sinc * cosDec0) / r);
  const ra =
    viewRA +
    Math.atan2(
      lView * sinc,
      r * cosDec0 * cosc - mView * sinDec0 * sinc
    );

  return { ra, dec };
}

/**
 * Direction cosines (l, m) → pixel coordinates.
 *
 * @param {number} l - Direction cosine
 * @param {number} m - Direction cosine
 * @param {number} cdelt1 - Pixel scale in radians (axis 1)
 * @param {number} cdelt2 - Pixel scale in radians (axis 2)
 * @param {number} crpix1 - Reference pixel (axis 1, 1-based)
 * @param {number} crpix2 - Reference pixel (axis 2, 1-based)
 * @returns {{ px: number, py: number }}
 */
export function lmToPixel(l, m, cdelt1, cdelt2, crpix1, crpix2) {
  // l,m are dimensionless direction cosines; cdelt is in radians
  const px = l / cdelt1 + crpix1;
  const py = m / cdelt2 + crpix2;
  return { px, py };
}

/**
 * Format RA in degrees to sexagesimal hours string.
 * @param {number} raDeg - RA in degrees
 * @returns {string}
 */
export function formatRA(raDeg) {
  // Normalize to [0, 360)
  let ra = ((raDeg % 360) + 360) % 360;
  const hours = ra / 15;
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  const s = ((hours - h) * 60 - m) * 60;
  return `${h}h${String(m).padStart(2, "0")}m${s.toFixed(1).padStart(4, "0")}s`;
}

/**
 * Format Dec in degrees to sexagesimal string.
 * @param {number} decDeg - Dec in degrees
 * @returns {string}
 */
export function formatDec(decDeg) {
  const sign = decDeg >= 0 ? "+" : "-";
  const abs = Math.abs(decDeg);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = ((abs - d) * 60 - m) * 60;
  return `${sign}${d}°${String(m).padStart(2, "0")}'${s.toFixed(1).padStart(4, "0")}"`;
}

export { DEG2RAD, RAD2DEG };
