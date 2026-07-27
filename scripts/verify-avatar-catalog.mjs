import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const catalog = await readFile(new URL("src/lib/avatars/catalog.ts", root), "utf8");
const ids = [...catalog.matchAll(/\bid:\s*"([^"]+)"/g)].map((match) => match[1]);

if (ids.length === 0) {
  throw new Error("Avatar catalog is empty or could not be parsed.");
}

const avatarDir = new URL("public/avatars/", root);
let files;
try {
  files = new Set((await readdir(avatarDir)).filter((name) => name.endsWith(".webp")));
} catch {
  files = new Set();
}

const expected = new Set(ids.map((id) => `${id}.webp`));
const missing = [...expected].filter((name) => !files.has(name));
const unlisted = [...files].filter((name) => !expected.has(name));

if (missing.length || unlisted.length || expected.size !== ids.length) {
  const details = [
    missing.length ? `missing: ${missing.join(", ")}` : null,
    unlisted.length ? `not listed: ${unlisted.join(", ")}` : null,
    expected.size !== ids.length ? "duplicate avatar IDs found" : null,
  ]
    .filter(Boolean)
    .join("\n");
  throw new Error(`Avatar catalog and public assets do not match.\n${details}`);
}

console.log(`Avatar catalog verified: ${ids.length} images.`);
