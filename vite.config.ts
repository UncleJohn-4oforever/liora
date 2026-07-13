import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  optimizeDeps: {
    // Prebundle CJS sql.js so default export is a real function in the browser
    include: ["sql.js"],
  },
  build: {
    commonjsOptions: {
      include: [/sql\.js/, /node_modules/],
    },
  },
  assetsInclude: ["**/*.wasm"],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    // false: if 1420 busy, try next port instead of crashing (web dev)
    // tauri still prefers 1420 when free
    strictPort: false,
    // listen on localhost + 127.0.0.1 (avoids blank/connect issues on Windows)
    host: host || "127.0.0.1",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
