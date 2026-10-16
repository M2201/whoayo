import { defineConfig } from "vite";

// Separate entry: the hosted preview never bundles the local account/workspace UI.
export default defineConfig({
  build: {
    outDir: "dist-render",
    rollupOptions: { input: "render-preview.html" },
  },
});
