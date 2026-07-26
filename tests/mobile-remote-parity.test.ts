// @ts-expect-error -- Node built-ins are provided by the test runtime.
import { readFileSync } from "node:fs";
// @ts-expect-error -- Node built-ins are provided by the test runtime.
import test from "node:test";
// @ts-expect-error -- Node built-ins are provided by the test runtime.
import assert from "node:assert/strict";

const read = (path: string) => {
  try {
    return readFileSync(new URL(path, import.meta.url), "utf8");
  } catch {
    return "";
  }
};

test("/remote uses the beta mobile shell and defaults to the D-pad remote", () => {
  const main = read("../src/main.tsx");
  const app = read("../src/App.tsx");
  const shell = read("../src/views/mobile/mobile-shell.tsx");
  const dpad = read("../src/views/mobile/dpad-remote.tsx");
  const style = read("../src/views/mobile/remote-style.ts");
  const host = read("../src/lib/remote/host-mount.tsx");
  const profiles = read("../src/lib/profiles.tsx");
  const remoteOpen = read("../src/lib/remote/remote-open-bridge.tsx");

  assert.doesNotMatch(main, /<RemoteApp \/>/);
  assert.match(app, /isMobileWeb\(\) \|\| isRemoteRoute\(\)/);
  assert.match(app, /<MobileShell \/>/);
  assert.match(shell, /<DpadRemote \/>/);
  assert.match(shell, /<MobileBrowse \/>/);
  assert.match(shell, /<MobileSearch \/>/);
  assert.match(shell, /<MobileLibrary \/>/);
  assert.match(shell, /<MobileProfile onOpenRemote=/);
  assert.match(shell, /<BottomTabBar active=\{tab\}/);
  assert.match(dpad, /aria-label="Select"/);
  for (const direction of ["up", "right", "down", "left"]) {
    assert.match(dpad, new RegExp(`dir: "${direction}"`));
  }
  assert.match(style, /localStorage\.getItem\(KEY\) === "minimal" \? "minimal" : "dpad"/);
  assert.match(host, /setRemoteLibrary\(hostLibrary\)/);
  assert.match(host, /setRemoteTrackers\(\{/);
  assert.doesNotMatch(host, /setRemoteHostConfig/);
  assert.match(profiles, /\.filter\(\(p\) => !p\.passwordHash\)/);
  assert.match(remoteOpen, /profile && !profile\.passwordHash/);
});
