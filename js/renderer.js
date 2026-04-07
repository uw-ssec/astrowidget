/**
 * regl-based renderer for SIN projection.
 *
 * Uses uint8 textures (universally supported) with JS-side normalization.
 * The image data is normalized to [0, 255] based on vmin/vmax in JS,
 * then the shader applies stretch and colormap lookup.
 */

import createREGL from "regl";
import { getColormapData } from "./colormap.js";

const DEG2RAD = Math.PI / 180;

/**
 * Normalize float data to uint8 RGBA for texture upload.
 * R channel holds the normalized value, A=255.
 */
function normalizeToUint8(floatData, width, height, vmin, vmax) {
  const n = width * height;
  const out = new Uint8Array(n * 4);
  const range = vmax - vmin || 1e-30;
  for (let i = 0; i < n; i++) {
    const val = floatData[i];
    // NaN/Inf → transparent
    if (val !== val || !isFinite(val)) {
      out[i * 4 + 3] = 0;
      continue;
    }
    let norm = (val - vmin) / range;
    norm = norm < 0 ? 0 : norm > 1 ? 1 : norm;
    out[i * 4] = (norm * 255 + 0.5) | 0;     // R = normalized value
    out[i * 4 + 1] = 0;
    out[i * 4 + 2] = 0;
    out[i * 4 + 3] = 255;                      // A = opaque
  }
  return out;
}

/**
 * Convert colormap float RGB [0-1] to uint8 RGBA [0-255].
 */
function colormapToUint8(rgbFloat) {
  const nPixels = rgbFloat.length / 3;
  const out = new Uint8Array(nPixels * 4);
  for (let i = 0; i < nPixels; i++) {
    out[i * 4] = (rgbFloat[i * 3] * 255 + 0.5) | 0;
    out[i * 4 + 1] = (rgbFloat[i * 3 + 1] * 255 + 0.5) | 0;
    out[i * 4 + 2] = (rgbFloat[i * 3 + 2] * 255 + 0.5) | 0;
    out[i * 4 + 3] = 255;
  }
  return out;
}

// Fragment shader — image is pre-normalized to [0,1] in the R channel
const FRAG_SHADER = `
precision highp float;

uniform sampler2D u_image;
uniform sampler2D u_colormap;
uniform vec2 u_crval;       // phase center (RA, Dec) in radians
uniform vec2 u_cdelt;       // pixel scale in radians
uniform vec2 u_crpix;       // reference pixel (1-based)
uniform vec2 u_imageSize;   // (width, height) in pixels
uniform vec2 u_viewCenter;  // view center (RA, Dec) in radians
uniform float u_fov;        // field of view in radians
uniform float u_opacity;
uniform int u_stretch;      // 0=linear, 1=log, 2=sqrt, 3=asinh
uniform vec2 u_resolution;  // canvas (width, height)

void main() {
    // Normalized screen coordinates [-1, 1]
    vec2 screen = (gl_FragCoord.xy / u_resolution) * 2.0 - 1.0;
    float aspect = u_resolution.x / u_resolution.y;

    // Inverse gnomonic projection: screen -> (RA, Dec) from view center
    float scale = tan(u_fov * 0.5);
    float lView = -screen.x * scale * aspect;
    float mView = screen.y * scale;

    float r = sqrt(lView * lView + mView * mView);
    float c = atan(r);
    float sinc = sin(c);
    float cosc = cos(c);

    float sinDec0 = sin(u_viewCenter.y);
    float cosDec0 = cos(u_viewCenter.y);

    float dec, ra;
    if (r < 1.0e-10) {
        dec = u_viewCenter.y;
        ra = u_viewCenter.x;
    } else {
        dec = asin(cosc * sinDec0 + (mView * sinc * cosDec0) / r);
        ra = u_viewCenter.x + atan(
            lView * sinc,
            r * cosDec0 * cosc - mView * sinDec0 * sinc
        );
    }

    // SIN projection: (RA, Dec) -> (l, m) direction cosines from phase center
    float dra = ra - u_crval.x;
    float sinDecP = sin(dec);
    float cosDecP = cos(dec);
    float sinDec0P = sin(u_crval.y);
    float cosDec0P = cos(u_crval.y);
    float cosDra = cos(dra);

    // Visibility check
    float cosAngDist = sinDecP * sinDec0P + cosDecP * cosDec0P * cosDra;
    if (cosAngDist <= 0.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }

    float l = cosDecP * sin(dra);
    float m = sinDecP * cosDec0P - cosDecP * sinDec0P * cosDra;

    // (l, m) -> pixel coordinates (0-based for texture UV)
    float px = l / u_cdelt.x + u_crpix.x - 1.0;
    float py = m / u_cdelt.y + u_crpix.y - 1.0;

    // Texture UV (0-1 range)
    vec2 uv = vec2(px / u_imageSize.x, py / u_imageSize.y);

    // Bounds check
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }

    // Sample — R channel holds pre-normalized value [0,1], A=0 means NaN
    vec4 texel = texture2D(u_image, uv);
    if (texel.a < 0.5) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }

    float norm = texel.r;

    // Apply stretch
    if (u_stretch == 1) {       // log
        norm = log(norm * 99.0 + 1.0) / log(100.0);
    } else if (u_stretch == 2) { // sqrt
        norm = sqrt(norm);
    } else if (u_stretch == 3) { // asinh
        norm = log(norm * 10.0 + sqrt(norm * norm * 100.0 + 1.0)) / log(10.0 + sqrt(101.0));
    }

    // Colormap lookup
    gl_FragColor = texture2D(u_colormap, vec2(norm, 0.5));
    gl_FragColor.a *= u_opacity;
}
`;

const VERT_SHADER = `
precision highp float;
attribute vec2 a_position;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const STRETCH_MAP = { linear: 0, log: 1, sqrt: 2, asinh: 3 };

/**
 * Create the renderer on a canvas element.
 * @param {HTMLCanvasElement} canvas
 * @returns {object} Renderer API
 */
export function createRenderer(canvas) {
  let regl;
  try {
    regl = createREGL({ canvas });
  } catch (e) {
    console.error("regl init failed:", e);
    return null;
  }

  const quadBuffer = regl.buffer([
    [-1, -1], [1, -1], [-1, 1],
    [-1, 1], [1, -1], [1, 1],
  ]);

  // Image texture — uint8 RGBA, universally supported
  let imageTexture = regl.texture({
    width: 1, height: 1,
    data: new Uint8Array([0, 0, 0, 255]),
    mag: "nearest", min: "nearest", wrap: "clamp",
  });

  // Colormap texture — 256x1 uint8 RGBA
  let colormapTexture = regl.texture({
    width: 256, height: 1,
    data: colormapToUint8(getColormapData("inferno")),
    mag: "linear", min: "linear", wrap: "clamp",
  });

  const state = {
    crval: [0, 0], cdelt: [1, 1], crpix: [0, 0],
    imageSize: [1, 1], viewCenter: [0, 0],
    fov: Math.PI, opacity: 1, stretch: 0,
    // Raw float data for re-normalization on vmin/vmax change
    rawData: null, rawWidth: 0, rawHeight: 0,
    vmin: 0, vmax: 1,
  };

  const drawSky = regl({
    frag: FRAG_SHADER,
    vert: VERT_SHADER,
    attributes: { a_position: quadBuffer },
    count: 6,
    uniforms: {
      u_image: () => imageTexture,
      u_colormap: () => colormapTexture,
      u_crval: () => state.crval,
      u_cdelt: () => state.cdelt,
      u_crpix: () => state.crpix,
      u_imageSize: () => state.imageSize,
      u_viewCenter: () => state.viewCenter,
      u_fov: () => state.fov,
      u_opacity: () => state.opacity,
      u_stretch: () => state.stretch,
      u_resolution: () => [canvas.width, canvas.height],
    },
    blend: {
      enable: true,
      func: {
        srcRGB: "src alpha", dstRGB: "one minus src alpha",
        srcAlpha: 1, dstAlpha: "one minus src alpha",
      },
    },
  });

  function uploadImage() {
    if (!state.rawData) return;
    const uint8 = normalizeToUint8(
      state.rawData, state.rawWidth, state.rawHeight,
      state.vmin, state.vmax
    );
    imageTexture = regl.texture({
      width: state.rawWidth, height: state.rawHeight,
      data: uint8,
      mag: "nearest", min: "nearest", wrap: "clamp",
    });
  }

  function render() {
    regl.clear({ color: [0, 0, 0, 1], depth: 1 });
    drawSky();
  }

  return {
    state,

    setImage(data, width, height) {
      state.rawData = data;
      state.rawWidth = width;
      state.rawHeight = height;
      state.imageSize = [width, height];
      uploadImage();
    },

    setWCS(crval, cdelt, crpix) {
      state.crval = [crval[0] * DEG2RAD, crval[1] * DEG2RAD];
      state.cdelt = [cdelt[0] * DEG2RAD, cdelt[1] * DEG2RAD];
      state.crpix = crpix;
    },

    setView(ra, dec, fov) {
      state.viewCenter = [ra * DEG2RAD, dec * DEG2RAD];
      state.fov = fov * DEG2RAD;
    },

    setColorScale(vmin, vmax) {
      state.vmin = vmin;
      state.vmax = vmax;
      uploadImage(); // re-normalize with new vmin/vmax
    },

    setOpacity(opacity) { state.opacity = opacity; },
    setStretch(name) { state.stretch = STRETCH_MAP[name] ?? 0; },

    setColormap(name) {
      colormapTexture = regl.texture({
        width: 256, height: 1,
        data: colormapToUint8(getColormapData(name)),
        mag: "linear", min: "linear", wrap: "clamp",
      });
    },

    resize(width, height) {
      canvas.width = width;
      canvas.height = height;
      regl.poll();
    },

    render,
    destroy() { regl.destroy(); },
  };
}
