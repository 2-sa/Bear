// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readdirSync, readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import {
  ACTIVE_THEME_CONTENT_ENABLED,
  CUSTOM_THEME_TOOLS_ENABLED,
  IN_APP_EXTERNAL_PAGES_ENABLED,
  SIGNED_UPDATES_ENABLED,
  activeThemeContent,
} from "../src/lib/security-policy.ts";

function sourceFiles(root: URL, extensions: readonly string[]): URL[] {
  const files: URL[] = [];

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, root);
    if (entry.isDirectory()) files.push(...sourceFiles(url, extensions));
    else if (extensions.some((extension) => entry.name.endsWith(extension))) files.push(url);
  }

  return files;
}

function rustCommand(source: string, name: string): string {
  const declaration = new RegExp(`pub(?:\\(crate\\))?\\s+(?:async\\s+)?fn\\s+${name}\\s*\\(`);
  const match = declaration.exec(source);
  assert.ok(match, `missing Rust command ${name}`);
  const nextCommand = source.indexOf("#[tauri::command]", match.index + match[0].length);
  return source.slice(match.index, nextCommand === -1 ? source.length : nextCommand);
}

test("active theme content is disabled by default", () => {
  assert.equal(ACTIVE_THEME_CONTENT_ENABLED, false);
  assert.equal(CUSTOM_THEME_TOOLS_ENABLED, false);
  assert.equal(activeThemeContent("body { display: none }"), "");
  assert.equal(activeThemeContent("globalThis.__TAURI_INTERNALS__"), "");
  assert.equal(activeThemeContent("<img src=x onerror=alert(1)>"), "");
});

test("privileged filesystem access stays narrowly scoped", () => {
  const capability = JSON.parse(
    readFileSync(new URL("../src-tauri/capabilities/default.json", import.meta.url), "utf8"),
  ) as {
    permissions?: Array<
      | string
      | {
          identifier?: string;
          allow?: Array<{ path?: string }>;
          deny?: Array<{ path?: string }>;
        }
    >;
  };
  const filesystemPaths = (capability.permissions ?? []).flatMap((permission) => {
    if (typeof permission === "string" || !permission.identifier?.startsWith("fs:")) return [];
    return [...(permission.allow ?? []), ...(permission.deny ?? [])].map((rule) => rule.path);
  });

  assert.equal(filesystemPaths.includes("**"), false);
  assert.equal(filesystemPaths.includes("$PICTURE/Bear"), true);
  assert.equal(filesystemPaths.includes("$PICTURE/Bear/**"), true);
  assert.equal(filesystemPaths.some((path) => path?.includes("$PICTURE/Harbor")), false);
  assert.equal(filesystemPaths.includes("$APPDATA/settings.json"), true);
  assert.equal(filesystemPaths.includes("$APPDATA/settings.json.tmp"), true);
  assert.equal(capability.permissions?.includes("process:default"), false);

  const desktopCapability = JSON.parse(
    readFileSync(new URL("../src-tauri/capabilities/desktop-only.json", import.meta.url), "utf8"),
  ) as { permissions?: string[] };
  assert.equal(desktopCapability.permissions?.includes("process:default"), false);
  assert.equal(desktopCapability.permissions?.includes("process:allow-restart"), true);

  const config = JSON.parse(
    readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
  ) as {
    app?: {
      security?: {
        assetProtocol?: {
          scope?: string[] | { allow?: string[]; deny?: string[] };
        };
      };
    };
  };
  const assetScope = config.app?.security?.assetProtocol?.scope;
  const assetPaths = Array.isArray(assetScope)
    ? assetScope
    : [...(assetScope?.allow ?? []), ...(assetScope?.deny ?? [])];
  assert.equal(assetPaths.includes("**"), false);
  assert.equal(assetPaths.includes("$PICTURE/Bear/**"), true);
  assert.equal(assetPaths.includes("$APPDATA/settings.json"), true);
  assert.equal(assetPaths.includes("$APPDATA/settings.json.tmp"), true);
});

test("the arbitrary save_text_file bridge stays removed", () => {
  const sourceRoots: Array<[URL, readonly string[]]> = [
    [new URL("../src/", import.meta.url), [".ts", ".tsx"]],
    [new URL("../src-tauri/src/", import.meta.url), [".rs"]],
  ];

  for (const [root, extensions] of sourceRoots) {
    for (const file of sourceFiles(root, extensions)) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /\bsave_text_file\b/, file.pathname);
    }
  }
});

test("untrusted extra mpv options are never applied", () => {
  const mpv = readFileSync(new URL("../src-tauri/src/mpv.rs", import.meta.url), "utf8");
  assert.doesNotMatch(
    rustCommand(mpv, "mpv_start"),
    /\b(?:apply_extra_mpv_options|args\.extra_options)\b/,
  );
});

test("native media exports validate every user-selected write path", () => {
  const mpv = readFileSync(new URL("../src-tauri/src/mpv.rs", import.meta.url), "utf8");
  assert.match(mpv, /fn\s+validate_mpv_media_target[\s\S]*?fs_scope\(\)\.is_allowed/);
  for (const [command, argument] of [
    ["mpv_save_screenshot", "path"],
    ["mpv_gif_stop", "out_path"],
    ["mpv_clip_save", "out_path"],
  ] as const) {
    assert.match(
      rustCommand(mpv, command),
      new RegExp(
        `(?:validate_[a-z_]+\\(&app,\\s*&${argument}\\)|fs_scope\\(\\)\\.is_allowed\\([\\s\\S]{0,120}&${argument}\\))`,
      ),
      `${command} must validate its output path against the filesystem scope`,
    );
  }

  const dvr = readFileSync(new URL("../src-tauri/src/dvr.rs", import.meta.url), "utf8");
  assert.match(
    rustCommand(dvr, "dvr_start"),
    /fs_scope\(\)\.is_allowed\(&output_path\)/,
  );
});

test("subtitle and local analysis commands enforce the shared filesystem scope guard", () => {
  const guard = readFileSync(
    new URL("../src-tauri/src/subsync/url_guard.rs", import.meta.url),
    "utf8",
  );
  assert.match(
    guard,
    /pub fn validate_media_source[\s\S]*?fs_scope\(\)\.is_allowed\(&path\)/,
  );

  const guardedCommands: Array<[string, string, string]> = [
    ["sub_extract.rs", "subtitle_extract", "source"],
    ["sub_extract.rs", "subtitle_extract_ass", "source"],
    ["subsync/mod.rs", "sync_subtitle", "url"],
    ["subsync/moviehash.rs", "compute_moviehash", "url"],
    ["subsync/audio_tracks.rs", "audio_probe_tracks", "url"],
    ["subsync/scorer.rs", "subsync_score_transform", "url"],
    ["subsync/asr.rs", "asr_transcribe_windows", "url"],
    ["subsync/asr.rs", "asr_verify", "url"],
    ["subsync/fingerprint.rs", "compute_chromaprint", "url"],
    ["subsync/torrent_sync.rs", "torrent_sync_subtitle", "url"],
    ["subsync/torrent_sync.rs", "torrent_score_transform", "url"],
  ];
  const cache = new Map<string, string>();
  for (const [file, command, argument] of guardedCommands) {
    const source = cache.get(file) ?? readFileSync(
      new URL(`../src-tauri/src/${file}`, import.meta.url),
      "utf8",
    );
    cache.set(file, source);
    assert.match(
      rustCommand(source, command),
      new RegExp(`validate_media_source\\(&app,\\s*&${argument},\\s*true\\)`),
      `${command} must validate local media through the shared filesystem scope guard`,
    );
  }
});

test("external pages are kept outside Harbor by default", () => {
  assert.equal(IN_APP_EXTERNAL_PAGES_ENABLED, false);

  for (const file of ["default.json", "desktop-only.json"]) {
    const capability = JSON.parse(
      readFileSync(new URL(`../src-tauri/capabilities/${file}`, import.meta.url), "utf8"),
    ) as { windows?: string[] };
    assert.equal(capability.windows?.includes("harbor-browser"), false);
    assert.equal(capability.windows?.includes("harbor-cf-solver"), false);
  }
});

test("only our signature-verified update channel is enabled", () => {
  assert.equal(SIGNED_UPDATES_ENABLED, true);

  const config = JSON.parse(
    readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
  ) as {
    bundle?: { createUpdaterArtifacts?: boolean };
    plugins?: { updater?: { endpoints?: string[]; pubkey?: string; dangerousInsecureTransportProtocol?: boolean } };
  };
  assert.equal(config.bundle?.createUpdaterArtifacts, false);
  assert.deepEqual(config.plugins?.updater?.endpoints, [
    "https://github.com/2-sa/Bear/releases/download/beta-channel/latest.json",
  ]);
  assert.notEqual(config.plugins?.updater?.pubkey, undefined);
  assert.notEqual(config.plugins?.updater?.pubkey, "");
  assert.notEqual(config.plugins?.updater?.dangerousInsecureTransportProtocol, true);

  const defaultCapability = readFileSync(
    new URL("../src-tauri/capabilities/default.json", import.meta.url),
    "utf8",
  );
  const desktopCapability = readFileSync(
    new URL("../src-tauri/capabilities/desktop-only.json", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(defaultCapability, /"updater:default"/);
  assert.match(desktopCapability, /"updater:default"/);

  const frontend = readFileSync(
    new URL("../src/lib/updater/use-update.ts", import.meta.url),
    "utf8",
  );
  assert.match(frontend, /HARBOR_API_BASE/);
  assert.doesNotMatch(frontend, /harbor\.site|harborstremio/);

  for (const file of ["versions.ts", "release-notes.ts"]) {
    const source = readFileSync(new URL(`../src/lib/updater/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /harbor\.site|harborstremio/);
  }
});

test("release workflow signs every desktop update before advancing the beta channel", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/tauri-build.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /^\s*workflow_dispatch:/m);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /environment: release-signing/);
  assert.match(workflow, /TAURI_SIGNING_PRIVATE_KEY: \$\{\{ secrets\.TAURI_SIGNING_PRIVATE_KEY \}\}/);
  const releaseConfig = JSON.parse(
    readFileSync(new URL("../src-tauri/tauri.release.conf.json", import.meta.url), "utf8"),
  ) as { bundle?: { createUpdaterArtifacts?: boolean } };
  assert.equal(releaseConfig.bundle?.createUpdaterArtifacts, true);
  assert.match(workflow, /tagName: beta-v__VERSION__/);
  assert.match(workflow, /releaseDraft: true/);
  assert.match(workflow, /publish-update:[\s\S]*?needs: build/);
  assert.match(workflow, /verify-update-manifest\.mjs/);
  assert.match(workflow, /gh release edit "\$VERSION_TAG" --draft=false/);
  assert.match(workflow, /x86_64-pc-windows-msvc/);
  assert.match(workflow, /aarch64-pc-windows-msvc/);
  assert.match(workflow, /x86_64-apple-darwin/);
  assert.match(workflow, /aarch64-apple-darwin/);
  assert.doesNotMatch(workflow, /unknown-linux-gnu/);

  const setup = readFileSync(
    new URL("../scripts/configure-github-update-signing.ps1", import.meta.url),
    "utf8",
  );
  assert.match(setup, /environments\/\$environmentName/);
  assert.match(setup, /prevent_self_review = \$false/);
  assert.match(setup, /reviewers = @\(/);
  assert.match(setup, /deployment-branch-policies/);
  assert.match(setup, /\$releaseBranch = "main"/);
  assert.match(setup, /gh secret set TAURI_SIGNING_PRIVATE_KEY --env \$environmentName/);
  assert.doesNotMatch(setup, /Write-Output.+Get-Content/);

  const settings = readFileSync(
    new URL("../src/views/settings/advanced-panel.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(settings, /<BetaChannelRow\s*\/>|<RollbackRow\s*\/>/);
});

test("release builds bundle only checksum-locked executable sidecars", () => {
  const config = JSON.parse(
    readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
  ) as { bundle?: { externalBin?: string[] } };
  assert.deepEqual(config.bundle?.externalBin, [
    "binaries/yt-dlp",
    "binaries/ffmpeg",
    "binaries/ffprobe",
  ]);

  const workflow = readFileSync(
    new URL("../.github/workflows/tauri-build.yml", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(workflow, /releases\/latest|releases\/download\/latest|osxexperts\.net|johnvansickle\.com/);
  assert.match(workflow, /fetch-binaries\.mjs --target/);

  const appWorkflow = readFileSync(
    new URL("../.github/workflows/app-build.yml", import.meta.url),
    "utf8",
  );
  assert.match(appWorkflow, /pnpm run setup:all/);

  for (const file of ["fetch-libmpv.mjs", "fetch-mpv.mjs", "fetch-ffmpeg.mjs"]) {
    const source = readFileSync(new URL(`../scripts/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /releases\/latest|releases\/download\/latest/);
    assert.match(source, /sha256|SHA256|checksum/i);
  }

  const fetcher = readFileSync(
    new URL("../scripts/fetch-binaries.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(fetcher, /releases\/latest|releases\/download\/latest/);
  assert.match(fetcher, /downloadSha256/);
  assert.match(fetcher, /outputSha256/);
  assert.match(fetcher, /IntegrityError/);

  const lock = JSON.parse(
    readFileSync(new URL("../scripts/binary-lock.json", import.meta.url), "utf8"),
  ) as {
    schemaVersion: number;
    artifacts: Record<string, Record<string, {
      sourceUrl: string;
      mirrorKey: string;
      downloadSha256: string;
      outputSha256: string;
    }>>;
  };
  assert.equal(lock.schemaVersion, 1);
  assert.deepEqual(Object.keys(lock.artifacts).sort(), [
    "aarch64-apple-darwin",
    "aarch64-pc-windows-msvc",
    "x86_64-apple-darwin",
    "x86_64-pc-windows-msvc",
  ]);
  for (const entries of Object.values(lock.artifacts)) {
    assert.deepEqual(Object.keys(entries).sort(), ["ffmpeg", "ffprobe", "yt-dlp"]);
    for (const spec of Object.values(entries)) {
      assert.match(spec.sourceUrl, /^https:\/\//);
      assert.doesNotMatch(spec.sourceUrl, /\/latest(?:\/|$)/);
      assert.match(spec.downloadSha256, /^[a-f0-9]{64}$/);
      assert.match(spec.outputSha256, /^[a-f0-9]{64}$/);
    }
  }
});

test("R2 mirror is read-only, allowlisted, and never proxies upstream", () => {
  const worker = readFileSync(
    new URL("../cloudflare/binary-mirror/src/index.js", import.meta.url),
    "utf8",
  );
  const lock = JSON.parse(
    readFileSync(new URL("../scripts/binary-lock.json", import.meta.url), "utf8"),
  ) as { artifacts: Record<string, Record<string, { mirrorKey: string }>> };

  for (const entries of Object.values(lock.artifacts)) {
    for (const spec of Object.values(entries)) assert.match(worker, new RegExp(spec.mirrorKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(worker, /await\s+fetch\s*\(/);
  assert.doesNotMatch(worker, /\.put\s*\(|\.delete\s*\(|\.list\s*\(/);
  assert.match(worker, /method !== "GET" && method !== "HEAD"/);
});

test("release workflow actions are pinned to immutable commits", () => {
  for (const file of ["tauri-build.yml", "app-build.yml"]) {
    const workflow = readFileSync(
      new URL(`../.github/workflows/${file}`, import.meta.url),
      "utf8",
    );
    const actionRefs = [...workflow.matchAll(/^\s*uses:\s+[^\s@]+@([^\s#]+)/gm)].map(
      (m) => m[1],
    );
    assert.ok(actionRefs.length > 0);
    for (const ref of actionRefs) assert.match(ref, /^[a-f0-9]{40}$/);
  }
});

test("runtime native downloads require an explicit policy and trusted shader allowlist", () => {
  const policy = readFileSync(
    new URL("../src-tauri/src/security_policy.rs", import.meta.url),
    "utf8",
  );
  assert.match(policy, /fn remote_native_assets_enabled\(\) -> bool\s*\{\s*false\s*\}/);

  assert.match(policy, /fn known_shader_downloads_enabled\(\) -> bool\s*\{\s*true\s*\}/);

  const model = readFileSync(new URL("../src-tauri/src/asr_model.rs", import.meta.url), "utf8");
  assert.match(model, /security_policy::remote_native_assets_enabled/);

  for (const [file, command] of [
    ["anime4k.rs", "anime4k_download"],
    ["shaders.rs", "shader_download"],
  ] as const) {
    const source = readFileSync(new URL(`../src-tauri/src/${file}`, import.meta.url), "utf8");
    assert.match(source, /security_policy::known_shader_downloads_enabled/);
    assert.doesNotMatch(rustCommand(source, command), /\burl:\s*String\b/);
  }
  const shaders = readFileSync(new URL("../src-tauri/src/shaders.rs", import.meta.url), "utf8");
  assert.match(shaders, /find_pack\(&id\)/);
});
