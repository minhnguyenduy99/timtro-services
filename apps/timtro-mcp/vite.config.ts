import { defineConfig } from "vite";

export default defineConfig({
  ssr: {
    noExternal: true
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "node24",
    ssr: true,
    minify: true,
    rolldownOptions: {
      input: "src/server.ts",
      output: {
        entryFileNames: "server.mjs",
        codeSplitting: false
      }
    }
  }
});
