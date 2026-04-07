/**
 * Colormap texture generation.
 *
 * Generates 256-entry RGB lookup tables for common astronomical colormaps.
 * Each colormap is a Float32Array of length 256*3 (RGB triplets, 0-1 range)
 * suitable for upload as a 256×1 RGB texture.
 */

/**
 * Generate an inferno colormap (256 entries).
 * Approximation of matplotlib's inferno using piecewise linear interpolation.
 * @returns {Float32Array} 256*3 RGB values
 */
function generateInferno() {
  // Key control points from matplotlib's inferno (index, R, G, B)
  const stops = [
    [0, 0.001, 0.0, 0.014],
    [32, 0.122, 0.006, 0.262],
    [64, 0.329, 0.01, 0.407],
    [96, 0.533, 0.068, 0.352],
    [128, 0.729, 0.212, 0.227],
    [160, 0.891, 0.393, 0.101],
    [192, 0.981, 0.588, 0.024],
    [224, 0.993, 0.802, 0.162],
    [255, 0.988, 0.998, 0.645],
  ];
  return interpolateStops(stops);
}

/**
 * Generate a viridis colormap (256 entries).
 * @returns {Float32Array}
 */
function generateViridis() {
  const stops = [
    [0, 0.267, 0.004, 0.329],
    [32, 0.282, 0.14, 0.458],
    [64, 0.254, 0.265, 0.53],
    [96, 0.206, 0.372, 0.553],
    [128, 0.163, 0.471, 0.558],
    [160, 0.128, 0.567, 0.551],
    [192, 0.134, 0.658, 0.517],
    [224, 0.267, 0.749, 0.441],
    [255, 0.993, 0.906, 0.144],
  ];
  return interpolateStops(stops);
}

/**
 * Generate a plasma colormap (256 entries).
 * @returns {Float32Array}
 */
function generatePlasma() {
  const stops = [
    [0, 0.05, 0.03, 0.53],
    [32, 0.28, 0.01, 0.63],
    [64, 0.49, 0.01, 0.66],
    [96, 0.66, 0.06, 0.57],
    [128, 0.80, 0.16, 0.43],
    [160, 0.90, 0.29, 0.30],
    [192, 0.97, 0.44, 0.16],
    [224, 0.99, 0.62, 0.04],
    [255, 0.94, 0.98, 0.13],
  ];
  return interpolateStops(stops);
}

/**
 * Generate a magma colormap (256 entries).
 * @returns {Float32Array}
 */
function generateMagma() {
  const stops = [
    [0, 0.001, 0.0, 0.014],
    [32, 0.1, 0.03, 0.26],
    [64, 0.27, 0.04, 0.43],
    [96, 0.45, 0.07, 0.48],
    [128, 0.64, 0.13, 0.44],
    [160, 0.83, 0.24, 0.37],
    [192, 0.95, 0.44, 0.38],
    [224, 0.99, 0.68, 0.53],
    [255, 0.99, 0.99, 0.75],
  ];
  return interpolateStops(stops);
}

/**
 * Generate a grayscale colormap (256 entries).
 * @returns {Float32Array}
 */
function generateGrayscale() {
  const data = new Float32Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    data[i * 3] = v;
    data[i * 3 + 1] = v;
    data[i * 3 + 2] = v;
  }
  return data;
}

/**
 * Interpolate between colormap stops to produce a 256-entry table.
 * @param {Array<[number, number, number, number]>} stops
 * @returns {Float32Array}
 */
function interpolateStops(stops) {
  const data = new Float32Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    // Find the surrounding stops
    let lo = 0;
    for (let s = 0; s < stops.length - 1; s++) {
      if (i >= stops[s][0]) lo = s;
    }
    const hi = Math.min(lo + 1, stops.length - 1);

    const range = stops[hi][0] - stops[lo][0];
    const t = range > 0 ? (i - stops[lo][0]) / range : 0;

    data[i * 3] = stops[lo][1] + t * (stops[hi][1] - stops[lo][1]);
    data[i * 3 + 1] = stops[lo][2] + t * (stops[hi][2] - stops[lo][2]);
    data[i * 3 + 2] = stops[lo][3] + t * (stops[hi][3] - stops[lo][3]);
  }
  return data;
}

/** Map of colormap name → generator function */
const COLORMAP_GENERATORS = {
  inferno: generateInferno,
  viridis: generateViridis,
  plasma: generatePlasma,
  magma: generateMagma,
  grayscale: generateGrayscale,
};

/**
 * Get the RGB data for a named colormap.
 * @param {string} name - Colormap name
 * @returns {Float32Array} 256*3 RGB data
 */
export function getColormapData(name) {
  const gen = COLORMAP_GENERATORS[name];
  if (!gen) {
    console.warn(`Unknown colormap "${name}", falling back to inferno`);
    return generateInferno();
  }
  return gen();
}

/** Available colormap names */
export const COLORMAP_NAMES = Object.keys(COLORMAP_GENERATORS);
