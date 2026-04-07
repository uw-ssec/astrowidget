import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: resolve(__dirname, "src/astrowidget/static"),
    lib: {
      entry: resolve(__dirname, "js/widget.js"),
      formats: ["es"],
      fileName: () => "widget.js",
    },
    sourcemap: true,
    emptyOutDir: true,
  },
  test: {
    include: ["tests/js/**/*.{test,spec}.js"],
  },
});
