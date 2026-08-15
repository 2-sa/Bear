import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer as createHttpServer } from "node:http";
import { createServer as createViteServer } from "vite";

let httpServer;
let vite;
let baseUrl;
let includeHangingSource = false;

before(async () => {
  httpServer = createHttpServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/v1/source/list") {
      res.end(JSON.stringify([
        { id: "11", name: "First source", lang: "en" },
        { id: "22", name: "Second source", lang: "ar" },
        ...(includeHangingSource ? [{ id: "33", name: "Broken source", lang: "en" }] : []),
      ]));
      return;
    }
    if (req.url === "/api/v1/source/11/popular/1") {
      res.end(JSON.stringify({ mangaList: [{ id: 101, title: "First manga" }], hasNextPage: false }));
      return;
    }
    if (req.url === "/api/v1/source/22/popular/1") {
      res.end(JSON.stringify({ mangaList: [{ id: 202, title: "Second manga" }], hasNextPage: false }));
      return;
    }
    if (req.url === "/api/v1/source/33/popular/1") {
      return;
    }
    if (req.url === "/api/v1/library") {
      res.end("[]");
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  vite = await createViteServer({
    configFile: false,
    root: process.cwd(),
    appType: "custom",
    resolve: { alias: { "@": "/src" } },
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true },
  });
});

after(async () => {
  await vite?.close();
  httpServer?.closeAllConnections();
  await new Promise((resolve) => httpServer?.close(resolve));
});

test("All tags lists popular manga from every Suwayomi source by default", async () => {
  const { makeSuwayomiProvider } = await vite.ssrLoadModule(
    "/src/lib/manga/sources/suwayomi/provider.ts",
  );
  const provider = makeSuwayomiProvider(baseUrl);

  const manga = await provider.popular(0);

  assert.deepEqual(
    manga.map((item) => item.title).sort(),
    ["First manga", "Second manga"],
  );
});

test("All tags keeps healthy Suwayomi sources when one source hangs", async () => {
  includeHangingSource = true;
  try {
    const { makeSuwayomiProvider } = await vite.ssrLoadModule(
      "/src/lib/manga/sources/suwayomi/provider.ts",
    );
    const provider = makeSuwayomiProvider(baseUrl, undefined, { sourceTimeoutMs: 300 });

    const manga = await provider.popular(0);

    assert.deepEqual(
      manga.map((item) => item.title).sort(),
      ["First manga", "Second manga"],
    );
  } finally {
    includeHangingSource = false;
  }
});
