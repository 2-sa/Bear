const ASSETS = new Map([
  ["v1/yt-dlp/2026.06.09/yt-dlp.exe", { sha256: "3a48cb955d55c8821b60ccbdbbc6f61bc958f2f3d3b7ad5eaf3d83a543293a27", size: 18202192 }],
  ["v1/yt-dlp/2026.06.09/yt-dlp_arm64.exe", { sha256: "847583f91bb6d26479c1dc9643c2f4b8857a90b40d619da97b0cfabccb9138d0", size: 22204855 }],
  ["v1/yt-dlp/2026.06.09/yt-dlp_macos", { sha256: "b82c3626952e6c14eaf654cc565866775ffd0b9ffb7021628ac59b42c2f4f244", size: 36478448 }],
  ["v1/ffmpeg-static/b6.1.1/ffmpeg-win32-x64.gz", { sha256: "8883a3dffbd0a16cf4ef95206ea05283f78908dbfb118f73c83f4951dcc06d77", size: 29581307 }],
  ["v1/ffmpeg-static/b6.1.1/ffprobe-win32-x64.gz", { sha256: "f309e6223ad89d2fe54bccd420a7709b66fd27540674e92309578ed491a43c8d", size: 29521644 }],
  ["v1/ffmpeg-static/b6.1.1/ffmpeg-darwin-x64.gz", { sha256: "929b375c1182d956c51f7ac25e0b2b0411fb01f6f407aa15c9758efeb4242106", size: 25296431 }],
  ["v1/ffmpeg-static/b6.1.1/ffprobe-darwin-x64.gz", { sha256: "d4da574d6e2e197bd259b47d69cf262df9e312af24ad960444f6d806d3d4c186", size: 25239438 }],
  ["v1/ffmpeg-static/b6.1.1/ffmpeg-darwin-arm64.gz", { sha256: "8923876afa8db5585022d7860ec7e589af192f441c56793971276d450ed3bbfa", size: 19246198 }],
  ["v1/ffmpeg-static/b6.1.1/ffprobe-darwin-arm64.gz", { sha256: "d986a8ec7b030899fe66a8a288ed809a3543338705a3ce178cfb85869c5d80be", size: 19207077 }],
  ["v1/ffmpeg-builds/autobuild-2026-06-30-13-34/ffmpeg-N-125365-g9a01c1cb6a-winarm64-gpl.zip", { sha256: "f1e59d579755fbb5ecfe9cde2ec2c4a59a71ae701fa8d770c95b4db9dabcedf2", size: 111773854 }],
]);

function responseHeaders(object, spec) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Content-Length", String(spec.size));
  headers.set("Content-Type", "application/octet-stream");
  headers.set("ETag", object.httpEtag);
  headers.set("X-Content-SHA256", spec.sha256);
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

export default {
  async fetch(request, env) {
    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    const key = new URL(request.url).pathname.replace(/^\/+/, "");
    const spec = ASSETS.get(key);
    if (!spec) return new Response("Not Found", { status: 404 });

    try {
      const object = method === "HEAD" ? await env.BINARIES.head(key) : await env.BINARIES.get(key);
      if (object === null) return new Response("Not Found", { status: 404 });
      if (object.size !== spec.size) {
        console.error(JSON.stringify({ message: "R2 object size mismatch", key, expected: spec.size, actual: object.size }));
        return new Response("Stored object failed integrity metadata validation", { status: 503 });
      }
      return new Response(method === "HEAD" ? null : object.body, {
        status: 200,
        headers: responseHeaders(object, spec),
      });
    } catch (error) {
      console.error(JSON.stringify({
        message: "R2 read failed",
        key,
        error: error instanceof Error ? error.message : "Unknown error",
      }));
      return new Response("Internal Server Error", { status: 500 });
    }
  },
};
