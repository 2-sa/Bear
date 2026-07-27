import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, "..");
const BIN_DIR = join(ROOT, "src-tauri", "binaries");
const LOCK = JSON.parse(readFileSync(join(SCRIPT_DIR, "binary-lock.json"), "utf8"));
const SIDECARS = ["yt-dlp", "ffmpeg", "ffprobe"];
const SUPPORTED_FORMATS = new Set(["raw", "gzip", "zip"]);
const SHA256 = /^[a-f0-9]{64}$/;

class IntegrityError extends Error {}

function detectedTarget() {
  const arch = process.arch === "arm64" ? "aarch64" : process.arch === "x64" ? "x86_64" : null;
  if (!arch) return null;
  if (process.platform === "win32") return `${arch}-pc-windows-msvc`;
  if (process.platform === "darwin") return `${arch}-apple-darwin`;
  return null;
}

function requestedTarget() {
  const index = process.argv.indexOf("--target");
  if (index === -1) return detectedTarget();
  const target = process.argv[index + 1];
  if (!target || target.startsWith("--")) throw new Error("[binaries] --target requires a target triple");
  return target;
}

function validateManifest() {
  if (LOCK.schemaVersion !== 1 || !LOCK.artifacts || typeof LOCK.artifacts !== "object") {
    throw new Error("[binaries] unsupported or malformed binary lock manifest");
  }

  for (const [target, entries] of Object.entries(LOCK.artifacts)) {
    if (!/^(x86_64|aarch64)-(pc-windows-msvc|apple-darwin)$/.test(target)) {
      throw new Error(`[binaries] unsupported target in manifest: ${target}`);
    }
    for (const name of SIDECARS) {
      const spec = entries[name];
      if (!spec) throw new Error(`[binaries] ${target} is missing ${name}`);
      const url = new URL(spec.sourceUrl);
      if (url.protocol !== "https:") throw new Error(`[binaries] ${target}/${name} source must use HTTPS`);
      if (/\/latest(?:\/|$)/i.test(url.pathname)) {
        throw new Error(`[binaries] ${target}/${name} source must not use a floating latest URL`);
      }
      if (!/^v1\/[A-Za-z0-9._/-]+$/.test(spec.mirrorKey) || spec.mirrorKey.includes("..")) {
        throw new Error(`[binaries] ${target}/${name} has an unsafe mirror key`);
      }
      if (!SUPPORTED_FORMATS.has(spec.format)) {
        throw new Error(`[binaries] ${target}/${name} has unsupported format ${spec.format}`);
      }
      if (spec.format === "zip" && (!spec.member || basename(spec.member) !== spec.member)) {
        throw new Error(`[binaries] ${target}/${name} needs a basename-only archive member`);
      }
      for (const field of ["downloadSha256", "outputSha256"]) {
        if (!SHA256.test(spec[field])) throw new Error(`[binaries] ${target}/${name} has invalid ${field}`);
      }
      for (const field of ["downloadSize", "outputSize"]) {
        if (!Number.isSafeInteger(spec[field]) || spec[field] <= 0) {
          throw new Error(`[binaries] ${target}/${name} has invalid ${field}`);
        }
      }
    }
  }
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function verifyFile(path, expectedSize, expectedHash, label) {
  const size = statSync(path).size;
  if (size !== expectedSize) {
    throw new IntegrityError(`${label} size mismatch (expected ${expectedSize}, got ${size})`);
  }
  const actualHash = await sha256(path);
  if (actualHash !== expectedHash) {
    throw new IntegrityError(`${label} SHA-256 mismatch (expected ${expectedHash}, got ${actualHash})`);
  }
}

function mirrorUrl(spec) {
  const base = process.env.HARBOR_BINARY_MIRROR_URL?.replace(/\/+$/, "");
  if (!base) return null;
  const parsed = new URL(base);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("[binaries] HARBOR_BINARY_MIRROR_URL must be a credential-free HTTPS base URL");
  }
  return `${base}/${spec.mirrorKey}`;
}

async function fetchToFile(url, destination) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { accept: "application/octet-stream", "user-agent": "Harbor reproducible build" },
  });
  if (!response.ok || !response.body) {
    throw new Error(`download failed (${response.status} ${response.statusText})`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination, { flags: "wx" }));
}

const downloadCache = new Map();
async function download(spec, tempDir) {
  const cacheKey = `${spec.downloadSha256}:${spec.downloadSize}`;
  if (downloadCache.has(cacheKey)) return downloadCache.get(cacheKey);

  const promise = (async () => {
    const destination = join(tempDir, `${spec.downloadSha256}.download`);
    const mirror = mirrorUrl(spec);
    if (mirror) {
      console.log(`[binaries] fetching mirror key ${spec.mirrorKey}`);
      try {
        await fetchToFile(mirror, destination);
        await verifyFile(destination, spec.downloadSize, spec.downloadSha256, "mirror download");
        return destination;
      } catch (error) {
        if (error instanceof IntegrityError || process.env.HARBOR_BINARY_MIRROR_REQUIRED === "1") throw error;
        rmSync(destination, { force: true });
        console.warn(`[binaries] mirror unavailable; falling back to the pinned upstream asset: ${error.message}`);
      }
    }

    console.log(`[binaries] fetching pinned asset ${spec.sourceUrl}`);
    await fetchToFile(spec.sourceUrl, destination);
    await verifyFile(destination, spec.downloadSize, spec.downloadSha256, "upstream download");
    return destination;
  })();

  downloadCache.set(cacheKey, promise);
  return promise;
}

function findMember(dir, member, matches = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) findMember(path, member, matches);
    else if (entry.name === member) matches.push(path);
  }
  return matches;
}

async function materialize(spec, downloadPath, outputPath, tempDir) {
  if (spec.format === "raw") {
    copyFileSync(downloadPath, outputPath);
    return;
  }
  if (spec.format === "gzip") {
    await pipeline(createReadStream(downloadPath), createGunzip(), createWriteStream(outputPath, { flags: "wx" }));
    return;
  }

  const extractDir = join(tempDir, `extract-${spec.downloadSha256}`);
  if (!existsSync(extractDir)) {
    mkdirSync(extractDir);
    execFileSync("tar", ["-xf", downloadPath, "-C", extractDir], { stdio: "inherit" });
  }
  const matches = findMember(extractDir, spec.member);
  if (matches.length !== 1) {
    throw new IntegrityError(`verified archive contains ${matches.length} copies of ${spec.member}; expected exactly one`);
  }
  copyFileSync(matches[0], outputPath);
}

validateManifest();
if (process.argv.includes("--verify-manifest")) {
  console.log("[binaries] lock manifest is valid");
  process.exit(0);
}

const target = requestedTarget();
if (!target) {
  console.log("[binaries] Linux and unsupported platforms use system tools; skipping bundled sidecars");
  process.exit(0);
}
const entries = LOCK.artifacts[target];
if (!entries) throw new Error(`[binaries] no locked sidecars for ${target}`);

mkdirSync(BIN_DIR, { recursive: true });
const extension = target.includes("windows") ? ".exe" : "";
const tempDir = mkdtempSync(join(tmpdir(), "harbor-sidecars-"));

try {
  for (const name of SIDECARS) {
    const spec = entries[name];
    const destination = join(BIN_DIR, `${name}-${target}${extension}`);
    if (existsSync(destination)) {
      try {
        await verifyFile(destination, spec.outputSize, spec.outputSha256, destination);
        console.log(`[binaries] ${name}-${target}${extension} already present and verified`);
        continue;
      } catch (error) {
        console.warn(`[binaries] replacing stale or invalid generated sidecar: ${error.message}`);
      }
    }

    const downloadPath = await download(spec, tempDir);
    const staged = join(BIN_DIR, `.${name}-${target}-${process.pid}.tmp`);
    rmSync(staged, { force: true });
    await materialize(spec, downloadPath, staged, tempDir);
    await verifyFile(staged, spec.outputSize, spec.outputSha256, `${name} output`);
    if (!target.includes("windows")) chmodSync(staged, 0o755);
    rmSync(destination, { force: true });
    renameSync(staged, destination);
    console.log(`[binaries] wrote verified ${name}-${target}${extension}`);
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

console.log(`[binaries] all sidecars are pinned and verified for ${target}`);
