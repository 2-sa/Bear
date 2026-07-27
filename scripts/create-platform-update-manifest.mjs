import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const [target] = process.argv.slice(2);
const TARGETS = {
  "x86_64-pc-windows-msvc": { platform: "windows-x86_64", kind: "windows", arch: "x64", bundle: "nsis" },
  "aarch64-pc-windows-msvc": { platform: "windows-aarch64", kind: "windows", arch: "arm64", bundle: "nsis" },
  "x86_64-apple-darwin": { platform: "darwin-x86_64", kind: "macos", arch: "x64", bundle: "app" },
  "aarch64-apple-darwin": { platform: "darwin-aarch64", kind: "macos", arch: "aarch64", bundle: "app" },
};
const spec = TARGETS[target];
if (!spec) {
  throw new Error("usage: create-platform-update-manifest.mjs <target>");
}
const { version } = JSON.parse(await readFile("package.json", "utf8"));
if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error("package.json has an invalid version");
}
const tag = `beta-v${version}`;

async function files(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await files(path)));
    else out.push(path);
  }
  return out;
}

const bundleDir = join("src-tauri", "target", target, "release", "bundle");
const suffix = spec.kind === "windows" ? ".exe.sig" : ".app.tar.gz.sig";
const signatures = (await files(bundleDir)).filter((path) => path.endsWith(suffix));
if (signatures.length !== 1) {
  throw new Error(`expected exactly one ${suffix} under ${bundleDir}, found ${signatures.length}`);
}

const signaturePath = signatures[0];
const updaterPath = signaturePath.slice(0, -".sig".length);
let assetName;
if (spec.kind === "windows") {
  assetName = basename(updaterPath);
} else {
  assetName = `${basename(updaterPath, ".app.tar.gz")}_${spec.arch}.app.tar.gz`;
}
assetName = assetName
  .trim()
  .replace(/[ ()[\]{}]/g, ".")
  .replace(/\.\./g, ".")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "");

const entry = {
  signature: await readFile(signaturePath, "utf8"),
  url: `https://github.com/2-sa/Bear/releases/download/${encodeURIComponent(tag)}/${assetName}`,
};
const manifest = {
  version,
  notes: "",
  pub_date: new Date().toISOString(),
  platforms: {
    [spec.platform]: entry,
    [`${spec.platform}-${spec.bundle}`]: entry,
  },
};

await writeFile(`update-manifest-${target}.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Created isolated signed updater manifest for ${spec.platform}.`);
