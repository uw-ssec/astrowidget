/**
 * anywidget entry point for SkyWidget.
 *
 * Exports a render() function per the anywidget AFM specification.
 * Creates the canvas, initializes the regl renderer, and wires up
 * model change listeners for all synced traitlets.
 */

import { createRenderer } from "./renderer.js";
import { setupInteraction } from "./interaction.js";

/**
 * anywidget render function.
 *
 * @param {{ model: any, el: HTMLElement }} ctx
 */
export function render({ model, el }) {

  // Create container
  const container = document.createElement("div");
  container.style.position = "relative";
  container.style.width = "100%";
  container.style.height = "600px";
  container.style.backgroundColor = "#000";
  el.appendChild(container);

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  container.appendChild(canvas);

  // Create coordinate readout overlay
  const readout = document.createElement("div");
  readout.style.position = "absolute";
  readout.style.bottom = "8px";
  readout.style.left = "8px";
  readout.style.color = "#fff";
  readout.style.fontFamily = "monospace";
  readout.style.fontSize = "13px";
  readout.style.textShadow = "0 0 4px #000, 0 0 4px #000";
  readout.style.pointerEvents = "none";
  readout.style.userSelect = "none";
  container.appendChild(readout);

  // Size canvas to container
  function resizeCanvas() {
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    if (renderer) {
      renderer.resize(canvas.width, canvas.height);
      renderer.render();
    }
  }

  // Initialize renderer
  resizeCanvas();
  const renderer = createRenderer(canvas);
  if (!renderer) {
    container.textContent = "WebGL2 not available";
    return;
  }

  // --- Wire up model → renderer ---

  function updateImage() {
    const bytes = model.get("image_data");
    const shape = model.get("image_shape");
    if (!bytes || !shape || shape[0] === 0) return;
    const len = bytes.byteLength || bytes.length;
    if (len === 0) return;

    const [height, width] = shape;
    // Copy to ensure proper alignment (DataView may not be 4-byte aligned)
    const float32 = new Float32Array(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + len)
    );
    renderer.setImage(float32, width, height);
  }

  function updateWCS() {
    const crval = model.get("crval");
    const cdelt = model.get("cdelt");
    const crpix = model.get("crpix");
    if (crval && cdelt && crpix) {
      renderer.setWCS(crval, cdelt, crpix);
    }
  }

  function updateView() {
    renderer.setView(
      model.get("view_ra") || 0,
      model.get("view_dec") || 0,
      model.get("view_fov") || 180
    );
  }

  function updateColorScale() {
    renderer.setColorScale(model.get("vmin") || 0, model.get("vmax") || 1);
  }

  function updateAll() {
    updateImage();
    updateWCS();
    updateView();
    updateColorScale();
    renderer.setOpacity(model.get("opacity") ?? 1);
    renderer.setStretch(model.get("stretch") || "linear");
    renderer.setColormap(model.get("colormap") || "inferno");
    renderer.render();
  }

  // Initial render
  updateAll();

  // Image data changes
  model.on("change:image_data", () => {
    updateImage();
    renderer.render();
  });

  // WCS changes
  model.on("change:crval", () => { updateWCS(); renderer.render(); });
  model.on("change:cdelt", () => { updateWCS(); renderer.render(); });
  model.on("change:crpix", () => { updateWCS(); renderer.render(); });

  // Display option changes (GPU-only, instant)
  model.on("change:colormap", () => {
    renderer.setColormap(model.get("colormap"));
    renderer.render();
  });
  model.on("change:stretch", () => {
    renderer.setStretch(model.get("stretch"));
    renderer.render();
  });
  model.on("change:vmin", () => { updateColorScale(); renderer.render(); });
  model.on("change:vmax", () => { updateColorScale(); renderer.render(); });
  model.on("change:opacity", () => {
    renderer.setOpacity(model.get("opacity"));
    renderer.render();
  });

  // Set up interaction (pan/zoom/readout)
  const interaction = setupInteraction(canvas, renderer, model, readout);

  // Handle resize
  const resizeObserver = new ResizeObserver(() => resizeCanvas());
  resizeObserver.observe(container);

  // Cleanup on widget removal
  return () => {
    interaction.destroy();
    resizeObserver.disconnect();
    renderer.destroy();
  };
}
