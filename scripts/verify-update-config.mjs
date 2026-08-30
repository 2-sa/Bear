import { readFile } from "node:fs/promises";

const EXPECTED_ENDPOINT = "https://github.com/2-sa/Bear/releases/download/beta-channel/latest.json";
const EXPECTED_RELEASES_URL = "https://github.com/2-sa/Bear/releases";
const EXPECTED_PRODUCT_NAME = "Bear";
const EXPECTED_IDENTIFIER = "dev.twosa.bear.beta";
const EXPECTED_SCHEMES = ["bear-beta", "stremio"];

function fail(message) {
  throw new Error(`Update configuration error: ${message}`);
}

const root = new URL("../", import.meta.url);
const [packageJson, tauriConfig, cargoToml, updaterSource, handoffSource, endpointSource] =
  await Promise.all([
    readFile(new URL("package.json", root), "utf8").then(JSON.parse),
    readFile(new URL("src-tauri/tauri.conf.json", root), "utf8").then(JSON.parse),
    readFile(new URL("src-tauri/Cargo.toml", root), "utf8"),
    readFile(new URL("src/lib/updater/use-update.ts", root), "utf8"),
    readFile(new URL("src/lib/updater/handoff.ts", root), "utf8"),
    readFile(new URL("src/lib/config/endpoints.ts", root), "utf8"),
  ]);

const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const versions = new Set([packageJson.version, tauriConfig.version, cargoVersion]);
if (versions.size !== 1 || versions.has(undefined)) {
  fail("package.json, tauri.conf.json, and Cargo.toml must use the same version");
}

const updater = tauriConfig.plugins?.updater;
if (!updater || updater.endpoints?.length !== 1 || updater.endpoints[0] !== EXPECTED_ENDPOINT) {
  fail(`the only updater endpoint must be ${EXPECTED_ENDPOINT}`);
}
if (updater.dangerousInsecureTransportProtocol === true) {
  fail("insecure update transport must never be enabled");
}
if (typeof updater.pubkey !== "string" || updater.pubkey.length < 100) {
  fail("a Tauri updater public key must be embedded in tauri.conf.json");
}
let decodedPublicKey;
try {
  decodedPublicKey = Buffer.from(updater.pubkey, "base64").toString("utf8");
} catch {
  fail("the updater public key is not valid base64");
}
if (!decodedPublicKey.includes("minisign public key")) {
  fail("the updater public key is not a minisign public key");
}
if (
  !endpointSource.includes(EXPECTED_ENDPOINT) ||
  !endpointSource.includes(EXPECTED_RELEASES_URL) ||
  !updaterSource.includes("BEAR_UPDATE_MANIFEST_URL") ||
  !updaterSource.includes("BEAR_RELEASES_URL") ||
  !handoffSource.includes("BEAR_UPDATE_MANIFEST_URL") ||
  updaterSource.includes("HARBOR_API_BASE") ||
  handoffSource.includes("HARBOR_API_BASE")
) {
  fail("manual update downloads must point only to our GitHub Releases page");
}
if (tauriConfig.productName !== EXPECTED_PRODUCT_NAME || tauriConfig.identifier !== EXPECTED_IDENTIFIER) {
  fail("the beta build must use its isolated product name and application identifier");
}
const schemes = tauriConfig.plugins?.["deep-link"]?.desktop?.schemes;
if (
  !Array.isArray(schemes) ||
  schemes.length !== EXPECTED_SCHEMES.length ||
  EXPECTED_SCHEMES.some((scheme) => !schemes.includes(scheme))
) {
  fail(`the beta build must register exactly: ${EXPECTED_SCHEMES.join(", ")}`);
}

if (process.argv.includes("--require-signing-key") && !process.env.TAURI_SIGNING_PRIVATE_KEY) {
  fail("TAURI_SIGNING_PRIVATE_KEY is missing from the release-signing environment");
}

console.log(`Signed updater configuration verified for ${EXPECTED_PRODUCT_NAME} ${packageJson.version}.`);
