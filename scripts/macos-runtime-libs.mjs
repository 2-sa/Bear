import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tauriDir = join(repoRoot, "src-tauri");
const stagedDir = join(tauriDir, "macos-libs");
const generatedConfig = join(tauriDir, "tauri.macos.conf.json");
const portableRpath = "@executable_path/../Frameworks";

export function parseOtoolDependencies(output) {
  return String(output)
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.match(/^\s*(.+?)\s+\(compatibility version\s+/)?.[1])
    .filter(Boolean);
}

function isSystemDependency(dependency) {
  return dependency.startsWith("/System/Library/") || dependency.startsWith("/usr/lib/");
}

export function portabilityViolations(dependencies, bundledNames) {
  const violations = [];
  for (const dependency of dependencies) {
    if (isSystemDependency(dependency)) continue;
    if (dependency.startsWith("@rpath/")) {
      const name = basename(dependency);
      if (!bundledNames.has(name)) {
        violations.push(`missing bundled macOS dependency: ${name}`);
      }
      continue;
    }
    if (dependency.startsWith("@loader_path/") || dependency.startsWith("@executable_path/")) {
      continue;
    }
    violations.push(`external macOS dependency: ${dependency}`);
  }
  return violations;
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function otoolDependencies(file) {
  return parseOtoolDependencies(run("otool", ["-L", file]));
}

function otoolRpaths(file) {
  const lines = run("otool", ["-l", file]).split(/\r?\n/);
  const paths = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== "cmd LC_RPATH") continue;
    for (let cursor = index + 1; cursor < Math.min(lines.length, index + 8); cursor += 1) {
      const match = lines[cursor].match(/^\s*path\s+(.+?)\s+\(offset\s+/);
      if (match) {
        paths.push(match[1]);
        break;
      }
    }
  }
  return paths;
}

function removeSignature(file) {
  spawnSync("codesign", ["--remove-signature", file], { stdio: "ignore" });
}

function adHocSign(file) {
  run("codesign", ["--force", "--sign", "-", file]);
}

function expandLoaderPath(value, sourceFile, executableDir) {
  if (value.startsWith("@loader_path/")) {
    return join(dirname(sourceFile), value.slice("@loader_path/".length));
  }
  if (value.startsWith("@executable_path/")) {
    return join(executableDir, value.slice("@executable_path/".length));
  }
  return value;
}

function resolveDependency(dependency, sourceFile, executableDir, brewPrefix) {
  if (dependency.startsWith("/")) return existsSync(dependency) ? dependency : null;

  if (dependency.startsWith("@loader_path/") || dependency.startsWith("@executable_path/")) {
    const candidate = resolve(expandLoaderPath(dependency, sourceFile, executableDir));
    return existsSync(candidate) ? candidate : null;
  }

  if (!dependency.startsWith("@rpath/")) return null;
  const suffix = dependency.slice("@rpath/".length);
  const candidates = [
    ...otoolRpaths(sourceFile).map((rpath) =>
      resolve(expandLoaderPath(rpath, sourceFile, executableDir), suffix),
    ),
    resolve(dirname(sourceFile), suffix),
    resolve(brewPrefix, "lib", suffix),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function assertDarwin() {
  if (process.platform !== "darwin") {
    throw new Error("macOS runtime library preparation must run on a macOS builder");
  }
}

function assertGeneratedPath(path) {
  const relative = path.slice(repoRoot.length + 1).replaceAll("\\", "/");
  if (!path.startsWith(`${repoRoot}${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new Error(`refusing to modify a path outside the repository: ${path}`);
  }
  if (relative !== "src-tauri/macos-libs" && relative !== "src-tauri/tauri.macos.conf.json") {
    throw new Error(`refusing to modify an unexpected generated path: ${path}`);
  }
}

function stageLibraries() {
  assertDarwin();
  assertGeneratedPath(stagedDir);
  assertGeneratedPath(generatedConfig);
  rmSync(stagedDir, { recursive: true, force: true });
  mkdirSync(stagedDir, { recursive: true });

  const brewPrefix = run("brew", ["--prefix"]);
  const mpvPrefix = run("brew", ["--prefix", "mpv"]);
  const rootLibrary = join(mpvPrefix, "lib", "libmpv.2.dylib");
  if (!existsSync(rootLibrary)) throw new Error(`libmpv was not found at ${rootLibrary}`);

  const entries = new Map();
  const queue = [];
  const enqueue = (source, name) => {
    const canonical = realpathSync(source);
    const existing = entries.get(name);
    if (existing && existing.canonical !== canonical) {
      throw new Error(`macOS library name collision for ${name}: ${existing.source} and ${source}`);
    }
    if (existing) return;
    const entry = { source, canonical, name, dependencies: [] };
    entries.set(name, entry);
    queue.push(entry);
  };

  enqueue(rootLibrary, "libmpv.2.dylib");
  for (let index = 0; index < queue.length; index += 1) {
    const entry = queue[index];
    entry.dependencies = otoolDependencies(entry.source);
    // The first otool entry for a dylib is its own install name, not a linked library.
    for (const dependency of entry.dependencies.slice(1)) {
      if (isSystemDependency(dependency)) continue;
      const name = basename(dependency);
      if (entries.has(name)) continue;
      const resolved = resolveDependency(dependency, entry.source, dirname(rootLibrary), brewPrefix);
      if (!resolved) {
        throw new Error(`unable to locate ${dependency}, required by ${entry.source}`);
      }
      enqueue(resolved, name);
    }
  }

  for (const entry of entries.values()) {
    const destination = join(stagedDir, entry.name);
    copyFileSync(entry.source, destination);
    chmodSync(destination, 0o755);
    removeSignature(destination);
    run("install_name_tool", ["-id", `@rpath/${entry.name}`, destination]);
    for (const dependency of entry.dependencies.slice(1)) {
      if (isSystemDependency(dependency)) continue;
      const name = basename(dependency);
      if (!entries.has(name)) {
        throw new Error(`dependency ${dependency} was not staged for ${entry.name}`);
      }
      run("install_name_tool", ["-change", dependency, `@rpath/${name}`, destination]);
    }
    adHocSign(destination);
  }

  const frameworks = [...entries.keys()]
    .sort((left, right) => left.localeCompare(right))
    .map((name) => `macos-libs/${name}`);
  const config = {
    $schema: "https://schema.tauri.app/config/2",
    build: { beforeBundleCommand: "node scripts/macos-runtime-libs.mjs patch" },
    bundle: { createUpdaterArtifacts: true, macOS: { frameworks } },
  };
  writeFileSync(generatedConfig, `${JSON.stringify(config, null, 2)}\n`);

  const bytes = [...entries.keys()].reduce((total, name) => total + statSync(join(stagedDir, name)).size, 0);
  console.log(`Staged ${entries.size} portable macOS libraries (${(bytes / 1048576).toFixed(1)} MiB).`);
}

function targetDirectory() {
  const configured = process.env.CARGO_TARGET_DIR;
  return configured ? resolve(repoRoot, configured) : join(tauriDir, "target");
}

function targetTriple() {
  return (
    process.env.TAURI_ENV_TARGET_TRIPLE ||
    process.env.TAURI_TARGET_TRIPLE ||
    process.env.CARGO_BUILD_TARGET ||
    ""
  );
}

function findBuiltExecutable() {
  const target = targetTriple();
  const candidates = [
    target && join(targetDirectory(), target, "release", "bear"),
    join(targetDirectory(), "release", "bear"),
  ].filter(Boolean);
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) {
    throw new Error(`could not find the built Bear executable (checked ${candidates.join(", ")})`);
  }
  return executable;
}

function patchExecutable() {
  assertDarwin();
  if (!existsSync(stagedDir)) throw new Error("macOS libraries were not staged before the build");
  const executable = findBuiltExecutable();
  const bundledNames = new Set(readdirSync(stagedDir).filter((name) => name.endsWith(".dylib")));
  const dependencies = otoolDependencies(executable);

  removeSignature(executable);
  for (const dependency of dependencies) {
    if (isSystemDependency(dependency)) continue;
    const name = basename(dependency);
    if (!bundledNames.has(name)) {
      throw new Error(`the Bear executable needs an unstaged library: ${dependency}`);
    }
    if (dependency !== `@rpath/${name}`) {
      run("install_name_tool", ["-change", dependency, `@rpath/${name}`, executable]);
    }
  }

  for (const rpath of new Set(otoolRpaths(executable))) {
    if (rpath.startsWith("/opt/homebrew/") || rpath.startsWith("/usr/local/") || rpath.startsWith("/opt/local/")) {
      run("install_name_tool", ["-delete_rpath", rpath, executable]);
    }
  }
  if (!otoolRpaths(executable).includes(portableRpath)) {
    run("install_name_tool", ["-add_rpath", portableRpath, executable]);
  }
  adHocSign(executable);

  const violations = portabilityViolations(otoolDependencies(executable), bundledNames);
  if (violations.length) throw new Error(violations.join("\n"));
  console.log(`Patched ${executable} to use bundled macOS libraries.`);
}

function walkFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function findAppBundle() {
  const target = targetTriple();
  const candidates = [
    target && join(targetDirectory(), target, "release", "bundle", "macos", "Bear.app"),
    join(targetDirectory(), "release", "bundle", "macos", "Bear.app"),
  ].filter(Boolean);
  const app = candidates.find((candidate) => existsSync(candidate));
  if (!app) throw new Error(`could not find Bear.app (checked ${candidates.join(", ")})`);
  return app;
}

function resolveBundledReference(dependency, file, app) {
  if (dependency.startsWith("@rpath/")) {
    return join(app, "Contents", "Frameworks", basename(dependency));
  }
  if (dependency.startsWith("@loader_path/")) {
    return resolve(dirname(file), dependency.slice("@loader_path/".length));
  }
  if (dependency.startsWith("@executable_path/")) {
    return resolve(
      app,
      "Contents",
      "MacOS",
      dependency.slice("@executable_path/".length),
    );
  }
  return null;
}

function verifyBundle() {
  assertDarwin();
  const app = findAppBundle();
  const frameworksDir = join(app, "Contents", "Frameworks");
  const bundledNames = new Set(
    existsSync(frameworksDir) ? readdirSync(frameworksDir).filter((name) => name.endsWith(".dylib")) : [],
  );
  if (!bundledNames.has("libmpv.2.dylib")) {
    throw new Error("Bear.app does not contain Contents/Frameworks/libmpv.2.dylib");
  }

  const roots = [join(app, "Contents", "MacOS"), frameworksDir];
  const violations = [];
  let inspected = 0;
  for (const file of roots.flatMap(walkFiles)) {
    let dependencies;
    try {
      dependencies = otoolDependencies(file);
    } catch {
      continue;
    }
    inspected += 1;
    for (const dependency of dependencies) {
      if (isSystemDependency(dependency)) continue;
      const bundled = resolveBundledReference(dependency, file, app);
      if (!bundled) {
        violations.push(`${file}: external macOS dependency: ${dependency}`);
      } else if (!existsSync(bundled)) {
        violations.push(`${file}: missing bundled macOS dependency: ${dependency}`);
      }
    }
  }
  if (!inspected) throw new Error("no Mach-O files were found inside Bear.app");
  if (violations.length) throw new Error(violations.join("\n"));

  run("codesign", ["--verify", "--deep", "--strict", app]);
  console.log(`Verified portable Bear.app with ${bundledNames.size} bundled libraries.`);
}

function main() {
  const mode = process.argv[2];
  if (mode === "stage") stageLibraries();
  else if (mode === "patch") patchExecutable();
  else if (mode === "verify") verifyBundle();
  else throw new Error("usage: node scripts/macos-runtime-libs.mjs <stage|patch|verify>");
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
