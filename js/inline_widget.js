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
uniform int u_stretch;
out vec4 fragColor;

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
    float dra = ra - u_crval.x;
    float sdP = sin(dec), cdP = cos(dec);
    float sd0P = sin(u_crval.y), cd0P = cos(u_crval.y);
    float cdra = cos(dra);
    float cosAng = sdP*sd0P + cdP*cd0P*cdra;
    if (cosAng <= 0.0) { fragColor = vec4(0,0,0,0); return; }
    float l = cdP * sin(dra);
    float m = sdP*cd0P - cdP*sd0P*cdra;
    float px = l/u_cdelt.x + u_crpix.x - 1.0;
    float py = m/u_cdelt.y + u_crpix.y - 1.0;
    vec2 uv = vec2(px/u_imageSize.x, py/u_imageSize.y);
    if (uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0) { fragColor=vec4(0,0,0,0); return; }
    vec4 texel = texture(u_image, uv);
    if (texel.a < 0.5) { fragColor = vec4(0,0,0,0); return; }
    float norm = texel.r;
    if (u_stretch==1) norm = log(norm*99.0+1.0)/log(100.0);
    else if (u_stretch==2) norm = sqrt(norm);
    else if (u_stretch==3) norm = log(norm*10.0+sqrt(norm*norm*100.0+1.0))/log(10.0+sqrt(101.0));
    fragColor = texture(u_cmap, vec2(norm, 0.5));
    fragColor.a *= u_opacity;
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

export function render({ model, el }) {
  function log(s) { console.log("[astrowidget]", s); }

  // Canvas
  const container = document.createElement("div");
  container.style.cssText = "position:relative;width:100%;height:600px;background:#000";
  el.appendChild(container);
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "width:100%;height:100%;display:block";
  container.appendChild(canvas);

  // Readout
  const readout = document.createElement("div");
  readout.style.cssText = "position:absolute;bottom:8px;left:8px;color:#fff;font:13px monospace;text-shadow:0 0 4px #000;pointer-events:none";
  container.appendChild(readout);

  try {
    // Size canvas
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = (rect.width || 800) * dpr;
    canvas.height = (rect.height || 600) * dpr;

    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
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
     "u_viewCenter","u_fov","u_opacity","u_stretch","u_resolution"].forEach(
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
    let vmin = 0, vmax = 1, opacity = 1, stretch = 0;
    const stretchMap = { linear:0, log:1, sqrt:2, asinh:3 };

    function uploadImage() {
      if (!rawData) return;
      const uint8 = normalizeToUint8(rawData, vmin, vmax);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, imgTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, imgW, imgH, 0, gl.RGBA, gl.UNSIGNED_BYTE, uint8);
    }

    function draw() {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
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
      viewRA = (model.get("view_ra")||0)*DEG2RAD;
      viewDec = (model.get("view_dec")||0)*DEG2RAD;
      viewFov = (model.get("view_fov")||180)*DEG2RAD;
    }

    function syncDisplay() {
      vmin = model.get("vmin") || 0;
      vmax = model.get("vmax") || 1;
      opacity = model.get("opacity") ?? 1;
      stretch = stretchMap[model.get("stretch")] || 0;
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

    // Initial sync — try immediately, then retry after model is populated
    syncAll();
    setTimeout(syncAll, 100);
    setTimeout(syncAll, 500);

    // --- Interaction ---
    let dragging = false, lastX = 0, lastY = 0;
    canvas.style.cursor = "grab";

    canvas.addEventListener("mousedown", e => {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      canvas.style.cursor = "grabbing";
    });
    window.addEventListener("mousemove", e => {
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
      requestAnimationFrame(draw);
    });
    window.addEventListener("mouseup", () => {
      if (dragging) {
        dragging = false; canvas.style.cursor = "grab";
        model.set("view_ra", viewRA/DEG2RAD);
        model.set("view_dec", viewDec/DEG2RAD);
        model.save_changes();
      }
    });
    canvas.addEventListener("wheel", e => {
      e.preventDefault();
      viewFov *= e.deltaY > 0 ? 1.1 : 1/1.1;
      viewFov = Math.max(0.001*DEG2RAD, Math.min(Math.PI, viewFov));
      model.set("view_fov", viewFov/DEG2RAD);
      model.save_changes();
      requestAnimationFrame(draw);
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
