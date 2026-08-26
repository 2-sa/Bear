import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { defineConfig, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import pkg from "./package.json" with { type: "json" };

declare const process: { env: Record<string, string | undefined> };

function silenceMediapipeSourcemap() {
  return {
    name: "silence-mediapipe-sourcemap",
    enforce: "pre" as const,
    load(id: string) {
      const file = id.split("?")[0];
      if (file.includes("@mediapipe") && file.endsWith(".mjs")) {
        const code = readFileSync(file, "utf-8").replace(/\/\/#\s*sourceMappingURL=[^\n]*/g, "");
        return { code, map: null };
      }
      return null;
    },
  };
}

function normalizeCssLineEndings() {
  return {
    name: "normalize-css-line-endings",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (id.split("?")[0].endsWith(".css")) {
        return { code: code.replace(/\r+\n/g, "\n"), map: null };
      }
      return null;
    },
  };
}

function servePublicMediapipe() {
  return {
    name: "serve-public-mediapipe",
    apply: "serve" as const,
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "").split("?")[0];
        if (!path.startsWith("/mp-wasm/") || path.includes("..") || !path.endsWith(".js")) {
          next();
          return;
        }
        let body: Buffer;
        try {
          body = readFileSync(`${server.config.root}/public${path}`);
        } catch {
          next();
          return;
        }
        res.setHeader("Content-Type", "text/javascript; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.end(body);
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    normalizeCssLineEndings(),
    tailwindcss(),
    silenceMediapipeSourcemap(),
    servePublicMediapipe(),
  ],
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __IS_BETA_BUILD__: JSON.stringify(process.env.HARBOR_CHANNEL !== "stable"),
    __BUILD_ID__: JSON.stringify(
      process.env.HARBOR_BUILD_ID ||
        (() => {
          try {
            return execSync("git rev-parse --short HEAD").toString().trim();
          } catch {
            return "local";
          }
        })(),
    ),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
    proxy: Object.fromEntries(
      [
        "graphql.anilist.co",
        "openlibrary.org",
        "covers.openlibrary.org",
        "www.googleapis.com",
        "www.wikidata.org",
      ].map((host) => [
        `/api-proxy/${host}`,
        {
          target: `https://${host}`,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(`/api-proxy/${host}`, ""),
        },
      ]),
    ),
  },
  resolve: {
    alias: { "@": "/src" },
  },
  assetsInclude: ["**/*.onnx", "**/*.tflite"],
  optimizeDeps: { exclude: ["onnxruntime-web", "@mediapipe/tasks-vision"] },
  worker: { format: "es" },
});
