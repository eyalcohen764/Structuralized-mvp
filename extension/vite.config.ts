import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

export default defineConfig({
  plugins: [react(), vue()],
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // background + content are JS entry bundles
        background: resolve(__dirname, "src/background/background.ts"),
        content: resolve(__dirname, "src/content/content.ts"),
        // runner is an html page (React app)
        runner: resolve(__dirname, "src/runner/index.html")
      },
      output: {
        entryFileNames: "[name].js"
      }
    }
  }
});
