import { readFile } from "node:fs/promises";

const [manifestPath, expectedTag, expectedVersion] = process.argv.slice(2);
if (!manifestPath || !expectedTag || !expectedVersion) {
  throw new Error("usage: verify-update-manifest.mjs <manifest> <tag> <version>");
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.version !== expectedVersion) {
  throw new Error(`manifest version ${manifest.version} does not match ${expectedVersion}`);
}

const required = ["windows-x86_64", "windows-aarch64", "darwin-x86_64", "darwin-aarch64"];
for (const platform of required) {
  const entry = manifest.platforms?.[platform];
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

console.log(`Verified ${required.length} signed updater platforms for ${expectedTag}.`);
