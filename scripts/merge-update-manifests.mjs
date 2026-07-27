import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const [inputDir, outputPath, expectedTag, expectedVersion] = process.argv.slice(2);
if (!inputDir || !outputPath || !expectedTag || !expectedVersion) {
  throw new Error("usage: merge-update-manifests.mjs <input-dir> <output> <tag> <version>");
}

const names = (await readdir(inputDir)).filter((name) => name.endsWith(".json")).sort();
if (names.length !== 4) throw new Error(`expected 4 platform manifests, found ${names.length}`);

const platforms = {};
let notes = "";
for (const name of names) {
  const manifest = JSON.parse(await readFile(join(inputDir, name), "utf8"));
  if (manifest.version !== expectedVersion) throw new Error(`${name} has the wrong version`);
  notes ||= typeof manifest.notes === "string" ? manifest.notes : "";
  for (const [platform, entry] of Object.entries(manifest.platforms ?? {})) {
    if (platforms[platform]) throw new Error(`duplicate updater platform ${platform}`);
    platforms[platform] = entry;
  }
}

const required = ["windows-x86_64", "windows-aarch64", "darwin-x86_64", "darwin-aarch64"];
for (const platform of required) {
  const entry = platforms[platform];
  if (!entry || typeof entry.url !== "string" || typeof entry.signature !== "string") {
    throw new Error(`missing signed updater entry for ${platform}`);
  }
  const url = new URL(entry.url);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    !url.pathname.startsWith(`/2-sa/Bear/releases/download/${expectedTag}/`) ||
    entry.signature.trim().length < 40
  ) {
    throw new Error(`unsafe or invalid updater entry for ${platform}`);
  }
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify({ version: expectedVersion, notes, pub_date: new Date().toISOString(), platforms }, null, 2)}\n`,
);
console.log(`Merged ${names.length} isolated updater manifests.`);
