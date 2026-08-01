import assert from "node:assert/strict";
import test from "node:test";

import {
  parseOtoolDependencies,
  portabilityViolations,
  releaseTargetPaths,
  resolveTargetTriple,
} from "../scripts/macos-runtime-libs.mjs";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("macOS dependency audit rejects Homebrew paths", () => {
  const dependencies = parseOtoolDependencies(`
/Applications/Bear.app/Contents/MacOS/bear:
\t/opt/homebrew/opt/mpv/lib/libmpv.2.dylib (compatibility version 2.0.0, current version 2.5.0)
\t/System/Library/Frameworks/AppKit.framework/Versions/C/AppKit (compatibility version 45.0.0, current version 2575.40.25)
`);

  assert.deepEqual(portabilityViolations(dependencies, new Set()), [
    "external macOS dependency: /opt/homebrew/opt/mpv/lib/libmpv.2.dylib",
  ]);
});

test("macOS dependency audit accepts bundled rpath libraries and system libraries", () => {
  const dependencies = [
    "@rpath/libmpv.2.dylib",
    "/System/Library/Frameworks/AppKit.framework/Versions/C/AppKit",
    "/usr/lib/libSystem.B.dylib",
  ];

  assert.deepEqual(portabilityViolations(dependencies, new Set(["libmpv.2.dylib"])), []);
});

test("macOS dependency audit rejects missing bundled rpath libraries", () => {
  assert.deepEqual(portabilityViolations(["@rpath/libmpv.2.dylib"], new Set()), [
    "missing bundled macOS dependency: libmpv.2.dylib",
  ]);
});

test("release workflow uses the generated portable macOS bundle configuration", () => {
  const workflow = readFileSync(resolve(repoRoot, ".github/workflows/tauri-build.yml"), "utf8");
  assert.match(workflow, /macos-runtime-libs\.mjs stage/);
  assert.match(workflow, /macos.*src-tauri\/tauri\.macos\.conf\.json/);
  assert.match(workflow, /tauri-macos-build\.sh/);
});

test("macOS builders use LLVM's install-name tool for Homebrew libraries", () => {
  const workflow = readFileSync(resolve(repoRoot, ".github/workflows/tauri-build.yml"), "utf8");

  assert.match(workflow, /brew install mpv pkg-config llvm/);
  assert.match(
    workflow,
    /MACOS_INSTALL_NAME_TOOL=.*brew --prefix llvm.*llvm-install-name-tool/,
  );
});

test("macOS builds discard incomplete Apple signing configuration", () => {
  const workflow = readFileSync(resolve(repoRoot, ".github/workflows/tauri-build.yml"), "utf8");
  const buildScript = readFileSync(resolve(repoRoot, "scripts/tauri-macos-build.sh"), "utf8");

  assert.doesNotMatch(workflow, /APPLE_SIGNING_IDENTITY:.*\|\|\s*'-'/);
  assert.match(buildScript, /unset "\$variable"/);
  assert.match(buildScript, /APPLE_CERTIFICATE/);
  assert.match(buildScript, /APPLE_SIGNING_IDENTITY/);
});

test("macOS bundle verification keeps the explicit Tauri target", () => {
  const buildScript = readFileSync(resolve(repoRoot, "scripts/tauri-macos-build.sh"), "utf8");

  assert.equal(
    resolveTargetTriple(["build", "--target", "aarch64-apple-darwin"], {}),
    "aarch64-apple-darwin",
  );
  assert.equal(
    resolveTargetTriple(["build", "--target=x86_64-apple-darwin"], {}),
    "x86_64-apple-darwin",
  );
  assert.match(buildScript, /macos-runtime-libs\.mjs verify "\$@"/);
});

test("macOS bundle verification never falls back from an explicit target", () => {
  const targetDir = resolve(repoRoot, "src-tauri/target");

  assert.deepEqual(
    releaseTargetPaths(targetDir, "aarch64-apple-darwin", "bundle", "macos", "Bear.app"),
    [join(targetDir, "aarch64-apple-darwin", "release", "bundle", "macos", "Bear.app")],
  );
  assert.deepEqual(
    releaseTargetPaths(targetDir, "", "bundle", "macos", "Bear.app"),
    [join(targetDir, "release", "bundle", "macos", "Bear.app")],
  );
});
