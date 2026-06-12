import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    setupFiles: [],
  },
  resolve: {
    alias: {
      "@shared": resolve("../../packages/shared/src"),
      "@renderer": resolve("src/renderer"),
    },
  },
});
