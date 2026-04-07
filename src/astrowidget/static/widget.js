/**
 * SkyWidget renderer using raw WebGL2 (no regl, no bundling).
 * SIN projection fragment shader renders radio images on a celestial sphere.
 */

const DEG2RAD = Math.PI / 180;

// Inferno colormap (256 RGB triplets, uint8)
function makeInfernoUint8() {
  const stops = [
    [0, 0,0,4], [32, 31,2,67], [64, 84,3,104], [96, 136,17,90],
    [128, 186,54,58], [160, 227,100,26], [192, 250,150,6],
    [224, 253,205,41], [255, 252,255,164],
  ];
  const out = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    let lo = 0;
    for (let s = 0; s < stops.length - 1; s++) if (i >= stops[s][0]) lo = s;
    const hi = Math.min(lo + 1, stops.length - 1);
    const range = stops[hi][0] - stops[lo][0] || 1;
    const t = (i - stops[lo][0]) / range;
    out[i*4]   = (stops[lo][1] + t * (stops[hi][1] - stops[lo][1])) | 0;
    out[i*4+1] = (stops[lo][2] + t * (stops[hi][2] - stops[lo][2])) | 0;
    out[i*4+2] = (stops[lo][3] + t * (stops[hi][3] - stops[lo][3])) | 0;
    out[i*4+3] = 255;
  }
  return out;
}

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0, 1); }
`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_image;
uniform sampler2D u_cmap;
uniform vec2 u_crval, u_cdelt, u_crpix, u_imageSize, u_viewCenter, u_resolution;
uniform float u_fov, u_opacity;
uniform int u_stretch, u_showGrid;
uniform vec2 u_crosshair;  // clicked position (RA, Dec) in radians; (-999,-999) = none
out vec4 fragColor;

// Auto-scale grid interval based on FOV
float gridInterval(float fovDeg) {
    if (fovDeg > 90.0) return 30.0;
    if (fovDeg > 30.0) return 10.0;
    if (fovDeg > 10.0) return 5.0;
    if (fovDeg > 3.0) return 1.0;
    if (fovDeg > 1.0) return 0.5;
    return 0.1;
}

void main() {
    vec2 screen = (gl_FragCoord.xy / u_resolution) * 2.0 - 1.0;
    float aspect = u_resolution.x / u_resolution.y;
    float scale = tan(u_fov * 0.5);
    float lV = -screen.x * scale * aspect;
    float mV = screen.y * scale;
    float r = sqrt(lV*lV + mV*mV);
    float c = atan(r);
    float sc = sin(c), cc = cos(c);
    float sd0 = sin(u_viewCenter.y), cd0 = cos(u_viewCenter.y);
    float dec, ra;
    if (r < 1e-10) { dec = u_viewCenter.y; ra = u_viewCenter.x; }
    else {
        dec = asin(cc*sd0 + mV*sc*cd0/r);
        ra = u_viewCenter.x + atan(lV*sc, r*cd0*cc - mV*sd0*sc);
    }

    // Convert to degrees for grid computation
    float raDeg = ra * 57.29577951;
    float decDeg = dec * 57.29577951;
    float fovDeg = u_fov * 57.29577951;

    // SIN projection: (RA, Dec) -> (l, m) from phase center
    float dra = ra - u_crval.x;
    float sdP = sin(dec), cdP = cos(dec);
    float sd0P = sin(u_crval.y), cd0P = cos(u_crval.y);
    float cdra = cos(dra);
    float cosAng = sdP*sd0P + cdP*cd0P*cdra;

    // --- Coordinate grid overlay ---
    float gridAlpha = 0.0;
    if (u_showGrid == 1) {
        float interval = gridInterval(fovDeg);
        // Line thickness in degrees (scales with FOV for consistent screen width)
        float lineWidth = fovDeg * 0.002;

        // RA grid lines (normalize RA to [0, 360))
        float raNorm = mod(raDeg, 360.0);
        float raRem = mod(raNorm, interval);
        if (raRem < lineWidth || raRem > interval - lineWidth) gridAlpha = 0.35;

        // Dec grid lines
        float decRem = mod(decDeg + 90.0, interval);
        if (decRem < lineWidth || decRem > interval - lineWidth) gridAlpha = 0.35;
    }

    // --- Horizon circle (SIN projection boundary) ---
    float horizonAlpha = 0.0;
    if (abs(cosAng) < 0.008) horizonAlpha = 0.5;

    // Outside the visible hemisphere
    if (cosAng <= 0.0) {
        // Show grid even outside image (on the "sky" background)
        if (gridAlpha > 0.0) {
            fragColor = vec4(1.0, 1.0, 1.0, gridAlpha * 0.5);
        } else {
            fragColor = vec4(0,0,0,0);
        }
        return;
    }

    float l = cdP * sin(dra);
    float m = sdP*cd0P - cdP*sd0P*cdra;
    float px = l/u_cdelt.x + u_crpix.x - 1.0;
    float py = m/u_cdelt.y + u_crpix.y - 1.0;
    vec2 uv = vec2(px/u_imageSize.x, py/u_imageSize.y);

    // Outside image bounds
    if (uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0) {
        if (gridAlpha > 0.0 || horizonAlpha > 0.0) {
            float a = max(gridAlpha, horizonAlpha);
            fragColor = vec4(1.0, 1.0, 1.0, a * 0.5);
        } else {
            fragColor = vec4(0,0,0,0);
        }
        return;
    }

    vec4 texel = texture(u_image, uv);
    if (texel.a < 0.5) { fragColor = vec4(0,0,0,0); return; }

    float norm = texel.r;
    if (u_stretch==1) norm = log(norm*99.0+1.0)/log(100.0);
    else if (u_stretch==2) norm = sqrt(norm);
    else if (u_stretch==3) norm = log(norm*10.0+sqrt(norm*norm*100.0+1.0))/log(10.0+sqrt(101.0));

    fragColor = texture(u_cmap, vec2(norm, 0.5));
    fragColor.a *= u_opacity;

    // Overlay grid lines on top of image
    if (gridAlpha > 0.0) {
        fragColor.rgb = mix(fragColor.rgb, vec3(1.0), gridAlpha);
    }
    // Overlay horizon circle
    if (horizonAlpha > 0.0) {
        fragColor.rgb = mix(fragColor.rgb, vec3(0.0, 1.0, 0.5), horizonAlpha);
    }
    // Crosshair at clicked position
    if (u_crosshair.x > -900.0) {
        float angDist = acos(clamp(
            sin(dec)*sin(u_crosshair.y) + cos(dec)*cos(u_crosshair.y)*cos(ra - u_crosshair.x),
            -1.0, 1.0));
        float crossSize = fovDeg * 0.015 * 0.0174533;  // size in radians
        float crossWidth = fovDeg * 0.002 * 0.0174533;
        // Draw a "+" shape
        float dra2 = abs(ra - u_crosshair.x);
        if (dra2 > 3.14159) dra2 = 6.28318 - dra2;
        float ddec2 = abs(dec - u_crosshair.y);
        bool onH = ddec2 < crossWidth && dra2*cos(u_crosshair.y) < crossSize;
        bool onV = dra2*cos(u_crosshair.y) < crossWidth && ddec2 < crossSize;
        if (onH || onV) {
            fragColor.rgb = vec3(0.0, 1.0, 1.0);  // cyan crosshair
            fragColor.a = 1.0;
        }
    }
    // Premultiply alpha for correct compositing with background
    fragColor.rgb *= fragColor.a;
}
`;

function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const err = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error("Shader: " + err);
  }
  return s;
}

function createProgram(gl) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("Link: " + gl.getProgramInfoLog(prog));
  }
  return prog;
}

function normalizeToUint8(floatData, vmin, vmax) {
  const n = floatData.length;
  const out = new Uint8Array(n * 4);
  const range = vmax - vmin || 1e-30;
  for (let i = 0; i < n; i++) {
    const v = floatData[i];
    if (v !== v || !isFinite(v)) { out[i*4+3] = 0; continue; }
    let norm = (v - vmin) / range;
    norm = norm < 0 ? 0 : norm > 1 ? 1 : norm;
    out[i*4] = (norm * 255 + 0.5) | 0;
    out[i*4+3] = 255;
  }
  return out;
}

// Survey presets
const SURVEY_PRESETS = {
  "DSS": "CDS/P/DSS2/color",
  "2MASS": "CDS/P/2MASS/color",
  "WISE": "CDS/P/allWISE/color",
  "Planck": "CDS/P/PLANCK/R2/HFI/color",
  "SDSS": "CDS/P/SDSS9/color",
  "Mellinger": "CDS/P/Mellinger/color",
  "Fermi": "CDS/P/Fermi/color",
  "Haslam408": "CDS/P/HI4PI/NHI",
};

export async function render({ model, el }) {
  function log(s) { console.log("[astrowidget]", s); }

  // --- Aladin Lite: load if background survey is requested ---
  let AladinLib = null;
  let aladin = null;
  const initBg = model.get("background_survey");

  if (initBg) {
    try {
      const mod = await import("https://esm.sh/aladin-lite@3.7.3-beta");
      AladinLib = mod.default;
      await AladinLib.init;
      log("Aladin Lite loaded");
    } catch (e) {
      log("Aladin Lite load failed: " + e.message);
    }
  }

  // Container
  const container = document.createElement("div");
  container.style.cssText = "position:relative;width:100%;height:600px;background:" + (initBg && AladinLib ? "transparent" : "#000");
  el.appendChild(container);

  // Aladin div (background layer — behind canvas, z-index 0)
  const aladinDiv = document.createElement("div");
  aladinDiv.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;z-index:0";
  if (initBg && AladinLib) {
    container.appendChild(aladinDiv);
  }

  // WebGL canvas (foreground — z-index 1, transparent where no data)
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;display:block;z-index:1";
  container.appendChild(canvas);

  // Toolbar (top-right, z-index 3)
  const toolbar = document.createElement("div");
  toolbar.style.cssText = "position:absolute;top:8px;right:8px;z-index:3;display:flex;gap:4px";
  container.appendChild(toolbar);

  const btnStyle = "padding:4px 10px;font:12px sans-serif;border:1px solid #888;border-radius:3px;cursor:pointer;color:#fff;background:rgba(0,0,0,0.6)";
  const btnActiveStyle = btnStyle + ";background:rgba(70,130,255,0.8);border-color:#7af";

  function makeBtn(label, title) {
    const b = document.createElement("button");
    b.textContent = label;
    b.title = title;
    b.style.cssText = btnStyle;
    toolbar.appendChild(b);
    return b;
  }

  const btnReset = makeBtn("\u21BA", "Reset view to initial position");
  const btnPan = makeBtn("\u2725", "Pan mode (drag to rotate)");
  const btnZoom = makeBtn("\u2B1A", "Box zoom (drag to select region)");

  // Box zoom selection overlay
  const boxOverlay = document.createElement("div");
  boxOverlay.style.cssText = "position:absolute;border:2px dashed #7af;background:rgba(70,130,255,0.15);pointer-events:none;z-index:2;display:none";
  container.appendChild(boxOverlay);

  // Readout (on top of everything)
  const readout = document.createElement("div");
  readout.style.cssText = "position:absolute;bottom:8px;left:8px;color:#fff;font:13px monospace;text-shadow:0 0 4px #000;pointer-events:none;z-index:2";
  container.appendChild(readout);

  try {
    // Size canvas
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = (rect.width || 800) * dpr;
    canvas.height = (rect.height || 600) * dpr;

    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
    if (!gl) { log("FAIL: No WebGL2"); return; }
    log("WebGL2: " + gl.getParameter(gl.RENDERER));

    const prog = createProgram(gl);
    log("Shader compiled OK");

    gl.useProgram(prog);

    // Fullscreen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Uniforms
    const loc = {};
    ["u_image","u_cmap","u_crval","u_cdelt","u_crpix","u_imageSize",
     "u_viewCenter","u_fov","u_opacity","u_stretch","u_showGrid","u_crosshair","u_resolution"].forEach(
      n => loc[n] = gl.getUniformLocation(prog, n)
    );

    // Colormap texture (unit 1)
    const cmapTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, cmapTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, makeInfernoUint8());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    log("Colormap texture OK");

    // Image texture (unit 0)
    const imgTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, imgTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // State
    let imgW = 1, imgH = 1, rawData = null;
    let crval = [0,0], cdelt = [1,1], crpix = [0,0];
    let viewRA = 0, viewDec = 0, viewFov = Math.PI;
    let vmin = 0, vmax = 1, opacity = 1, stretch = 0, showGrid = 1;
    let dragging = false;
    let userInteracting = false;  // true during drag and briefly after mouseup
    let interactionTimer = null;
    let crosshairRA = -999, crosshairDec = -999;
    const stretchMap = { linear:0, log:1, sqrt:2, asinh:3 };

    // Interaction mode: "pan" or "boxzoom"
    let mode = "pan";
    // Store initial view for reset
    let initialRA = 0, initialDec = 0, initialFov = Math.PI;
    let boxStartX = 0, boxStartY = 0, boxing = false;

    function setMode(m) {
      mode = m;
      btnPan.style.cssText = m === "pan" ? btnActiveStyle : btnStyle;
      btnZoom.style.cssText = m === "boxzoom" ? btnActiveStyle : btnStyle;
      canvas.style.cursor = m === "pan" ? "grab" : "crosshair";
    }
    setMode("pan");

    btnPan.addEventListener("click", () => setMode("pan"));
    btnZoom.addEventListener("click", () => setMode("boxzoom"));
    btnReset.addEventListener("click", () => {
      userInteracting = true;
      viewRA = initialRA; viewDec = initialDec; viewFov = initialFov;
      model.set("view_ra", viewRA/DEG2RAD);
      model.set("view_dec", viewDec/DEG2RAD);
      model.set("view_fov", viewFov/DEG2RAD);
      model.save_changes();
      syncAladin();
      draw();
      if (interactionTimer) clearTimeout(interactionTimer);
      interactionTimer = setTimeout(() => { userInteracting = false; }, 500);
    });

    function uploadImage() {
      if (!rawData) return;
      const uint8 = normalizeToUint8(rawData, vmin, vmax);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, imgTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, imgW, imgH, 0, gl.RGBA, gl.UNSIGNED_BYTE, uint8);
    }

    function draw() {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);  // always transparent — container background provides the black
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(prog);
      gl.uniform1i(loc.u_image, 0);
      gl.uniform1i(loc.u_cmap, 1);
      gl.uniform2f(loc.u_crval, crval[0], crval[1]);
      gl.uniform2f(loc.u_cdelt, cdelt[0], cdelt[1]);
      gl.uniform2f(loc.u_crpix, crpix[0], crpix[1]);
      gl.uniform2f(loc.u_imageSize, imgW, imgH);
      gl.uniform2f(loc.u_viewCenter, viewRA, viewDec);
      gl.uniform1f(loc.u_fov, viewFov);
      gl.uniform1f(loc.u_opacity, opacity);
      gl.uniform1i(loc.u_stretch, stretch);
      gl.uniform1i(loc.u_showGrid, showGrid);
      gl.uniform2f(loc.u_crosshair, crosshairRA, crosshairDec);
      gl.uniform2f(loc.u_resolution, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // --- Sync from model ---
    function syncImage() {
      const bytes = model.get("image_data");
      const shape = model.get("image_shape");
      if (!bytes || !shape || shape[0] === 0) return;
      const len = bytes.byteLength || bytes.length;
      if (len === 0) return;
      imgH = shape[0]; imgW = shape[1];
      rawData = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + len));
      log("Image: " + imgW + "x" + imgH + ", " + rawData.length + " floats");
      uploadImage();
    }

    function syncWCS() {
      const cv = model.get("crval"), cd = model.get("cdelt"), cp = model.get("crpix");
      if (cv) crval = [cv[0]*DEG2RAD, cv[1]*DEG2RAD];
      if (cd) cdelt = [cd[0]*DEG2RAD, cd[1]*DEG2RAD];
      if (cp) crpix = [cp[0], cp[1]];
    }

    function syncView() {
      // Don't overwrite local view state during or shortly after user interaction
      if (userInteracting) return;
      viewRA = (model.get("view_ra")||0)*DEG2RAD;
      viewDec = (model.get("view_dec")||0)*DEG2RAD;
      viewFov = (model.get("view_fov")||180)*DEG2RAD;
    }

    function syncDisplay() {
      vmin = model.get("vmin") || 0;
      vmax = model.get("vmax") || 1;
      opacity = model.get("opacity") ?? 1;
      stretch = stretchMap[model.get("stretch")] || 0;
      showGrid = model.get("show_grid") === false ? 0 : 1;
    }

    function syncAll() {
      syncDisplay();
      syncImage();
      syncWCS();
      syncView();
      draw();
    }

    // Register change handlers first
    model.on("change:image_data", () => { syncDisplay(); syncImage(); syncWCS(); syncView(); draw(); });
    model.on("change:image_shape", () => { syncDisplay(); syncImage(); syncWCS(); syncView(); draw(); });
    model.on("change:crval", () => { syncWCS(); draw(); });
    model.on("change:cdelt", () => { syncWCS(); draw(); });
    model.on("change:crpix", () => { syncWCS(); draw(); });
    model.on("change:view_ra", () => { syncView(); draw(); });
    model.on("change:view_dec", () => { syncView(); draw(); });
    model.on("change:view_fov", () => { syncView(); draw(); });
    model.on("change:vmin", () => { syncDisplay(); uploadImage(); draw(); });
    model.on("change:vmax", () => { syncDisplay(); uploadImage(); draw(); });
    model.on("change:opacity", () => { syncDisplay(); draw(); });
    model.on("change:stretch", () => { syncDisplay(); draw(); });
    model.on("change:show_grid", () => { syncDisplay(); draw(); });
    model.on("change:background_survey", () => {
      const hasBg = model.get("background_survey");
      container.style.background = hasBg ? "transparent" : "#000";
      draw();
    });

    // --- Aladin Lite: JS-side sync (no Python round-trip) ---
    function syncAladin() {
      if (!aladin) return;
      const raDeg = ((viewRA / DEG2RAD) % 360 + 360) % 360;
      const decDeg = viewDec / DEG2RAD;
      const fovDeg = viewFov / DEG2RAD;
      aladin.gotoRaDec(raDeg, decDeg);
      aladin.setFoV(fovDeg);
    }

    // Initialize Aladin if background survey is set
    if (AladinLib && initBg) {
      const hipsUrl = SURVEY_PRESETS[initBg] || initBg;
      const raDeg = ((viewRA / DEG2RAD) % 360 + 360) % 360;
      const decDeg = viewDec / DEG2RAD;
      const fovDeg = viewFov / DEG2RAD;
      aladin = AladinLib.aladin(aladinDiv, {
        fov: fovDeg || 180,
        target: raDeg + " " + decDeg,
        survey: hipsUrl,
        projection: "SIN",
        showCooGrid: false,
        showFrame: false,
        showCooGridControl: false,
        showSimbadPointerControl: false,
        showFullscreenControl: false,
        showLayersControl: false,
        showGotoControl: false,
        showShareControl: false,
        showSettingsControl: false,
        showZoomControl: false,
      });
      log("Aladin viewer created: " + initBg);
    }

    // Handle background_survey changes
    model.on("change:background_survey", async () => {
      const survey = model.get("background_survey");
      if (survey && aladin) {
        // Switch survey on existing instance
        const hipsUrl = SURVEY_PRESETS[survey] || survey;
        aladin.setBaseImageLayer(hipsUrl);
        container.style.background = "transparent";
      } else if (survey && !aladin && !AladinLib) {
        // Need to load Aladin Lite for the first time
        try {
          const mod = await import("https://esm.sh/aladin-lite@3.7.3-beta");
          AladinLib = mod.default;
          await AladinLib.init;
          container.appendChild(aladinDiv);
          container.style.background = "transparent";
          const hipsUrl = SURVEY_PRESETS[survey] || survey;
          aladin = AladinLib.aladin(aladinDiv, {
            fov: (viewFov / DEG2RAD) || 180,
            target: (((viewRA / DEG2RAD) % 360 + 360) % 360) + " " + (viewDec / DEG2RAD),
            survey: hipsUrl, projection: "SIN",
            showCooGrid: false, showFrame: false,
            showCooGridControl: false, showSimbadPointerControl: false,
            showFullscreenControl: false, showLayersControl: false,
            showGotoControl: false, showShareControl: false,
            showSettingsControl: false, showZoomControl: false,
          });
          log("Aladin loaded on demand: " + survey);
        } catch (e) { log("Aladin load failed: " + e.message); }
      } else if (!survey) {
        container.style.background = "#000";
        aladinDiv.style.display = "none";
      }
      draw();
    });

    // Initial sync — poll until image data arrives from the binary comm channel.
    // Binary traitlet data often lags behind JSON state, so we poll with
    // exponential backoff rather than relying on fixed timeouts.
    syncAll();
    let _pollCount = 0;
    const _maxPolls = 15;  // ~0 + 100 + 200 + 400 + ... ≈ 6s total
    function _pollForData() {
      _pollCount++;
      syncAll();
      const bytes = model.get("image_data");
      const hasData = bytes && (bytes.byteLength || bytes.length) > 0;
      if (hasData) {
        log("Data arrived after " + _pollCount + " poll(s)");
        syncAladin();
        initialRA = viewRA; initialDec = viewDec; initialFov = viewFov;
        return;
      }
      if (_pollCount < _maxPolls) {
        setTimeout(_pollForData, Math.min(100 * Math.pow(1.5, _pollCount - 1), 1000));
      } else {
        log("No image data after " + _maxPolls + " polls — waiting for change event");
        // Still capture initial view so reset button works if data arrives later
        syncAladin();
        initialRA = viewRA; initialDec = viewDec; initialFov = viewFov;
      }
    }
    setTimeout(_pollForData, 100);

    // --- Interaction ---
    // (dragging declared earlier for syncView guard)
    let lastX = 0, lastY = 0;
    let mouseDownX = 0, mouseDownY = 0, didDrag = false;
    canvas.style.cursor = "grab";

    // Helper: screen coords → (RA, Dec) in radians
    function screenToRaDec(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const sx = ((clientX-rect.left)/rect.width)*2-1;
      const sy = -(((clientY-rect.top)/rect.height)*2-1);
      const aspect = canvas.width/canvas.height;
      const sc = Math.tan(viewFov*0.5);
      const lV = -sx*sc*aspect, mV = sy*sc;
      const r = Math.sqrt(lV*lV+mV*mV);
      if (r < 1e-10) return { ra: viewRA, dec: viewDec };
      const c = Math.atan(r), snc=Math.sin(c), csc=Math.cos(c);
      const sd=Math.sin(viewDec), cd=Math.cos(viewDec);
      const dec2 = Math.asin(csc*sd + mV*snc*cd/r);
      const ra2 = viewRA + Math.atan2(lV*snc, r*cd*csc - mV*sd*snc);
      return { ra: ra2, dec: dec2 };
    }

    canvas.addEventListener("mousedown", e => {
      userInteracting = true;
      if (interactionTimer) { clearTimeout(interactionTimer); interactionTimer = null; }
      mouseDownX = e.clientX; mouseDownY = e.clientY; didDrag = false;

      if (mode === "boxzoom") {
        boxing = true;
        const rect = container.getBoundingClientRect();
        boxStartX = e.clientX - rect.left;
        boxStartY = e.clientY - rect.top;
        boxOverlay.style.left = boxStartX + "px";
        boxOverlay.style.top = boxStartY + "px";
        boxOverlay.style.width = "0";
        boxOverlay.style.height = "0";
        boxOverlay.style.display = "block";
      } else {
        dragging = true;
        lastX = e.clientX; lastY = e.clientY;
        canvas.style.cursor = "grabbing";
      }
    });
    window.addEventListener("mousemove", e => {
      if (boxing) {
        // Box zoom: draw selection rectangle
        const rect = container.getBoundingClientRect();
        const curX = e.clientX - rect.left;
        const curY = e.clientY - rect.top;
        const x = Math.min(boxStartX, curX), y = Math.min(boxStartY, curY);
        const w = Math.abs(curX - boxStartX), h = Math.abs(curY - boxStartY);
        boxOverlay.style.left = x + "px";
        boxOverlay.style.top = y + "px";
        boxOverlay.style.width = w + "px";
        boxOverlay.style.height = h + "px";
        didDrag = true;
        return;
      }
      if (!dragging) {
        // Hover readout
        const rect = canvas.getBoundingClientRect();
        const sx = ((e.clientX-rect.left)/rect.width)*2-1;
        const sy = -(((e.clientY-rect.top)/rect.height)*2-1);
        const aspect = canvas.width/canvas.height;
        const sc = Math.tan(viewFov*0.5);
        const lV = -sx*sc*aspect, mV = sy*sc;
        const r = Math.sqrt(lV*lV+mV*mV);
        if (r < 1e-10) {
          const rd = ((viewRA/DEG2RAD)%360+360)%360;
          readout.textContent = fmtRA(rd) + "  " + fmtDec(viewDec/DEG2RAD);
        } else {
          const c = Math.atan(r), snc=Math.sin(c), csc=Math.cos(c);
          const sd=Math.sin(viewDec), cd=Math.cos(viewDec);
          const dec2 = Math.asin(csc*sd + mV*snc*cd/r);
          const ra2 = viewRA + Math.atan2(lV*snc, r*cd*csc - mV*sd*snc);
          const rd = ((ra2/DEG2RAD)%360+360)%360;
          readout.textContent = fmtRA(rd) + "  " + fmtDec(dec2/DEG2RAD);
        }
        return;
      }
      const dx = (e.clientX-lastX)/canvas.clientWidth*viewFov;
      const dy = (e.clientY-lastY)/canvas.clientHeight*viewFov;
      const aspect = canvas.width/canvas.height;
      const cosDec = Math.max(Math.cos(viewDec), 0.01);
      viewRA -= dx*aspect/cosDec;
      viewDec = Math.max(-Math.PI/2+0.001, Math.min(Math.PI/2-0.001, viewDec+dy));
      lastX = e.clientX; lastY = e.clientY;
      didDrag = true;
      syncAladin();
      requestAnimationFrame(draw);
    });
    window.addEventListener("mouseup", e => {
      if (boxing) {
        // Box zoom complete — compute FOV from selection
        boxing = false;
        boxOverlay.style.display = "none";
        interactionTimer = setTimeout(() => { userInteracting = false; }, 500);

        const dist = Math.sqrt((e.clientX-mouseDownX)**2 + (e.clientY-mouseDownY)**2);
        if (dist < 5) return; // too small, ignore

        const rect = container.getBoundingClientRect();
        const curX = e.clientX - rect.left;
        const curY = e.clientY - rect.top;

        // Center of selection in normalized coords [-1, 1]
        const cx = ((boxStartX + curX) / 2 / rect.width) * 2 - 1;
        const cy = -(((boxStartY + curY) / 2 / rect.height) * 2 - 1);

        // Navigate to center of selection
        const center = screenToRaDec(
          rect.left + (boxStartX + curX) / 2,
          rect.top + (boxStartY + curY) / 2
        );
        viewRA = center.ra;
        viewDec = center.dec;

        // New FOV proportional to selection size
        const selFrac = Math.max(Math.abs(curX - boxStartX) / rect.width,
                                  Math.abs(curY - boxStartY) / rect.height);
        viewFov = viewFov * selFrac;
        viewFov = Math.max(0.001 * DEG2RAD, Math.min(Math.PI, viewFov));

        model.set("view_ra", viewRA/DEG2RAD);
        model.set("view_dec", viewDec/DEG2RAD);
        model.set("view_fov", viewFov/DEG2RAD);
        model.save_changes();
        syncAladin();
        draw();
        return;
      }
      if (dragging) {
        dragging = false;
        canvas.style.cursor = mode === "pan" ? "grab" : "crosshair";
        // Keep userInteracting true to absorb model echo, then release
        interactionTimer = setTimeout(() => { userInteracting = false; }, 500);
        // Distinguish click (< 3px movement) from drag
        const dist = Math.sqrt((e.clientX-mouseDownX)**2 + (e.clientY-mouseDownY)**2);
        if (dist < 3) {
          // Click — compute celestial coords and send to Python
          const coord = screenToRaDec(e.clientX, e.clientY);
          const raDeg = ((coord.ra / DEG2RAD) % 360 + 360) % 360;
          const decDeg = coord.dec / DEG2RAD;
          model.set("clicked_coord", [raDeg, decDeg]);

          // Compute (l, m) direction cosines from phase center
          const dra = coord.ra - crval[0];
          const sdP = Math.sin(coord.dec), cdP = Math.cos(coord.dec);
          const sd0P = Math.sin(crval[1]), cd0P = Math.cos(crval[1]);
          const lVal = cdP * Math.sin(dra);
          const mVal = sdP * cd0P - cdP * sd0P * Math.cos(dra);
          model.set("clicked_lm", [lVal, mVal]);
          model.save_changes();

          // Set crosshair position
          crosshairRA = coord.ra;
          crosshairDec = coord.dec;
          requestAnimationFrame(draw);
        } else {
          model.set("view_ra", viewRA/DEG2RAD);
          model.set("view_dec", viewDec/DEG2RAD);
          model.save_changes();
          syncAladin();
        }
      }
    });
    canvas.addEventListener("wheel", e => {
      e.preventDefault();
      userInteracting = true;
      if (interactionTimer) clearTimeout(interactionTimer);
      viewFov *= e.deltaY > 0 ? 1.1 : 1/1.1;
      viewFov = Math.max(0.001*DEG2RAD, Math.min(Math.PI, viewFov));
      model.set("view_fov", viewFov/DEG2RAD);
      model.save_changes();
      syncAladin();
      requestAnimationFrame(draw);
      interactionTimer = setTimeout(() => { userInteracting = false; }, 500);
    }, { passive: false });

    // Resize
    const ro = new ResizeObserver(() => {
      const r = container.getBoundingClientRect();
      const d = window.devicePixelRatio||1;
      canvas.width = r.width*d; canvas.height = r.height*d;
      draw();
    });
    ro.observe(container);

  } catch(e) {
    log("ERROR: " + e.message);
    log(e.stack);
  }
}

function fmtRA(deg) {
  const h = deg/15, hi = Math.floor(h), mi = Math.floor((h-hi)*60), s = ((h-hi)*60-mi)*60;
  return hi+"h"+String(mi).padStart(2,"0")+"m"+s.toFixed(1).padStart(4,"0")+"s";
}
function fmtDec(deg) {
  const sign = deg>=0?"+":"-", a = Math.abs(deg), d=Math.floor(a), m=Math.floor((a-d)*60), s=((a-d)*60-m)*60;
  return sign+d+"°"+String(m).padStart(2,"0")+"'"+s.toFixed(1).padStart(4,"0")+'"';
}
