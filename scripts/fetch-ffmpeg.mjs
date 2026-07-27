// Backward-compatible entry point. The shared fetcher installs yt-dlp, ffmpeg,
// and ffprobe from the checksum-locked manifest for the current platform.
await import("./fetch-binaries.mjs");
