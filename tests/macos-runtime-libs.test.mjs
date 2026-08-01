import assert from "node:assert/strict";
import test from "node:test";

import {
  parseOtoolDependencies,
  portabilityViolations,
} from "../scripts/macos-runtime-libs.mjs";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
