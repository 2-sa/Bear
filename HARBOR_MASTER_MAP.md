# HARBOR MASTER MAP

> Zero-Trust audit ledger for the Harbor (Bear) project.
> Self-Correction Rule applied before this update.

## [TECH_STACK]

- **Frontend**: React, TypeScript, TanStack Router/Query/Virtual, DOMPurify.
- **Native application**: Tauri 2 with capability-based permissions.
- **Backend**: Rust, Tokio, Axum, Reqwest, librqbit, libmpv.
- **Updater**: Official `tauri-plugin-updater`; only its endpoint is redirected to the project-owned Worker.
- **Network boundary**: Central frontend route registry in `src/lib/network-config.ts` and a closed-route Cloudflare Worker in `src-tauri/proxy/`.
- **Watch Together relay**: Cloudflare Worker/Durable Object in `src-tauri/relay/`.
- **Credential model**: User OAuth access/refresh tokens remain local on the device. Developer-application secrets belong in Cloudflare Worker secrets and are never committed to the client.
- **Security primitives**: Rust SSRF/DNS/path controls in `src-tauri/src/security.rs`; frontend URL and HTML sanitization in `src/lib/security.ts`.

## [SECURITY_THREATS]

### Phase 1 — Completed

- **S-1 / Native SSRF**: Public native fetches reject loopback, RFC1918, link-local, CGNAT, metadata, invalid schemes, and DNS rebinding.
- **S-2 / Redirect SSRF**: Every redirect hop is re-resolved and pinned; HTTPS downgrade and non-idempotent redirects are rejected; cross-origin headers are cleared.
- **S-3 / Arbitrary file write**: Native download and text-save destinations are canonicalized and restricted to approved media/app roots.
- **S-4 / Filesystem over-permission**: Static WebView writes, deletes, creates, and directory traversal are no longer host-wide.
- **S-5 / Engine directory traversal**: Torrent cache paths are canonicalized and restricted.
- **S-6 / Environment mutation**: DHT environment configuration is set before worker threads start.
- **S-7 / Legacy netcheck traffic**: Original developer-controlled lookup was removed and DNS results are TTL-cached.

### Phase 2 — Completed with compatibility correction

- **F-1 / Installer CSRF**: Addon messages require the loaded iframe origin, a valid install URL, and confirmation. The listener now tracks URL-origin changes correctly.
- **F-2 / HTML XSS**: AniList HTML and theme HTML use DOMPurify with conservative tag/attribute/protocol policies.
- **F-3 / Unsafe external URLs**: OS/browser opening accepts only validated HTTP(S) URLs.
- **F-4 / Settings corruption**: Native settings writes reject invalid JSON and non-object roots.
- **F-5 / Imported theme code**: Every imported theme containing JS or HTML requires confirmation before save/activation.
- **F-6 / Local custom code compatibility**: The ineffective global trust bit was removed. User-authored local custom JS continues to work; imported code does not gain a persistent global bypass.

### Phase 3 — Source revised; release not complete

- **N-1 / Original developer-domain traffic**: Runtime scans of `src/` and `src-tauri/` contain zero references to the original developer domain.
- **N-2 / Scattered first-party endpoints**: Frontend API/OAuth/report/theme/provider routes derive from `src/lib/network-config.ts`. The official Tauri updater retains its normal architecture and changes only the endpoint in `src-tauri/tauri.conf.json`.
- **N-3 / Open proxy abuse**: The API Worker has a closed route table, validated HTTPS upstream origins, bounded bodies, manual redirect rejection, CORS allowlists, rate-limit bindings, and redacted logging.
- **N-4 / OAuth custody**: AniList uses the user-owned public client ID; Trakt uses the user-owned public client ID. User tokens remain local. AniList/MAL/Trakt developer secrets are Worker secrets only.
- **N-5 / Remote theme supply chain**: Community theme transport is data-only; executable CSS/JS/HTML is stripped from remote uploads/downloads and media must use the configured asset origin.
- **N-6 / Public fetch SSRF**: String URL traffic in Tauri uses the DNS-pinned native fetch path without a permissive plugin fallback.
- **N-7 / User-selected LAN services**: Local addon and IPTV calls use an explicit private-network path limited to literal loopback/RFC1918/IPv6-ULA or `localhost`, idempotent methods, and the originally approved authority. Public-to-private redirects fail closed.
- **N-8 / LAN stream exposure**: The server keeps upstream-compatible LAN binding, but remote routes require a rotating token in `/access/{token}`. Legacy unprefixed routes are loopback-only.
- **N-9 / Relay exfiltration**: Generic relay forwarding is removed. Source includes origin checks, bounds, per-peer limits, host-ownership enforcement, duplicate-client protection, and empty-room expiry.
- **N-10 / Async security logging**: Native and frontend security events use bounded, non-blocking, redacted paths.

### Residual / Deployment Risks

- **R-1 / Worker upstreams unavailable**: The deployed API Worker currently fails closed because update/content/report/theme upstream origins are not configured. The updater endpoint therefore returns `503`.
- **R-2 / OAuth production configuration**: Worker developer-app IDs/secrets and live callback flows still require configuration and end-to-end testing. No secret belongs in this repository.
- **R-3 / WebView private-network authority**: The LAN fetch exception is narrow, but the current Tauri HTTP capability and IPC surface remain callable by the main WebView. A future hardening pass should move user-approved private origins into a native approval registry before claiming a fully compromised-WebView threat model.
- **R-4 / LAN bearer transport**: The rotating stream token travels over local HTTP. It prevents unauthenticated casual LAN access but does not protect against a privileged LAN sniffer.
- **R-5 / Relay deployment**: Relay security changes are source-only until Durable Object/WebSocket integration tests and deployment are completed.
- **R-6 / Native verification**: Rust and Linux builds are unverified because Cargo is unavailable on this workstation.

## [TECHNICAL_BUGS]

### Resolved

- **B-1 / Updater architecture regression**: Custom updater backend/state machine was removed; official Tauri updater frontend, plugin, and lifecycle were restored byte-for-byte.
- **B-2 / Local addon/IPTV regression**: Explicit local/LAN sources work without reopening the normal public SSRF path.
- **B-3 / LAN streaming regression**: Remote clients receive a tokenized base URL; loopback clients retain original paths.
- **B-4 / Custom relay regression**: Clean public `wss:` custom domains are accepted; credentials, query strings, fragments, private hosts, and insecure schemes are rejected.
- **B-5 / Stale installer origin**: The listener effect now updates with `expectedOrigin`.
- **B-6 / Mutex poison and body caps**: Phase 1 poison recovery and bounded response/body logic remain in place.

### Deferred / Baseline

- **B-7 / Startup loader test**: The full Node suite has one baseline failure because `HEAD` lacks the page-load handler shape expected by `tests/startup-loader.test.ts`.
- **B-8 / Download cancellation polling**: Existing 150 ms polling remains a refactor opportunity.
- **B-9 / Binary fetch decoding**: `harbor_fetch` still returns text and uses lossy UTF-8 for binary responses; dedicated binary paths remain separate.

## [AFFECTED_FILES]

| Area | Exact paths | Status |
|---|---|---|
| Central network routes | `src/lib/network-config.ts`, `.env.example` | Retained, minimized |
| Official updater endpoint | `src-tauri/tauri.conf.json`, `src/lib/updater/use-update.ts`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` | Official architecture restored; endpoint-only change |
| API Worker | `src-tauri/proxy/worker.js`, `src-tauri/proxy/wrangler.jsonc`, `src-tauri/proxy/README.md` | Retained |
| Relay Worker | `src-tauri/relay/worker.js`, `src-tauri/relay/wrangler.jsonc` | Source hardened; deployment pending |
| Native SSRF/logging/filesystem | `src-tauri/src/security.rs`, `src-tauri/src/http_fetch.rs`, `src-tauri/src/download.rs`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json` | Retained |
| Local addon/IPTV compatibility | `src/lib/safe-fetch.ts`, `src/lib/addon-store.ts`, `src/lib/addons.ts`, `src/lib/streams/addons.ts`, `src/lib/meta-resource.ts`, `src/lib/search-addons.ts`, `src/lib/subtitles/providers/addons.ts`, `src/lib/iptv/store.ts`, `src/lib/iptv/xmltv.ts`, `src/lib/iptv/xtream.ts` | Fixed |
| Auth routes | `src/lib/anilist/auth.ts`, `src/lib/anilist/config.ts`, `src/lib/mal/auth.ts`, `src/lib/mal/config.ts`, `src/lib/trakt/client.ts`, `src/lib/trakt/config.ts`, `src/lib/trakt/device-auth.ts` | Routed through Worker; live configuration pending |
| LAN stream authentication | `src-tauri/src/torrent_engine.rs`, `src-tauri/src/torrent_engine/stream_route.rs`, `src-tauri/src/cast_server.rs`, `src/lib/stremio-server.ts`, `src/views/settings/player-panel/server-address-section.tsx` | Fixed; Rust build pending |
| XSS/custom code | `src/lib/security.ts`, `src/components/custom-code-mount.tsx`, `src/components/installer-viewport.tsx`, `src/views/settings/theme-panel/custom-themes-section.tsx`, `src/views/settings/theme-panel/theme-studio.tsx`, `src/views/detail/anilist-comments.tsx` | Fixed |
| Community themes | `src/lib/theme-store.ts` | Data-only remote boundary retained |
| Security tests | `tests/network-config.test.ts`, `tests/proxy-worker.test.ts`, `tests/relay-worker.test.ts`, `tests/security-redaction.test.ts` | 22/22 passing |

## [REFACTOR_OPPORTUNITIES]

- Add a native, user-confirmed allowlist for private-network origins and remove broad WebView HTTP authority.
- Replace the remaining download cancellation poll with a cancellation token.
- Sandbox custom user JavaScript in a dedicated restricted WebView/iframe without changing the current editor workflow.
- Consolidate the duplicated Worker origin at build time only if Tauri gains a simple supported configuration substitution; current tests enforce that both endpoints stay aligned.
- Keep unrelated React compiler warnings and existing formatting debt out of this security patch.

## [PENDING_ACTIONS]

- [x] Restore the official Tauri updater and remove the custom replacement.
- [x] Keep only the project-owned Worker endpoint change.
- [x] Restore local addon, IPTV, custom relay, local custom-code, and LAN streaming behavior with narrow controls.
- [x] Remove the generated `.pnpm-store` artifact from the repository workspace.
- [x] Confirm zero runtime references to the original developer domain under `src/` and `src-tauri/`.
- [x] Pass TypeScript build and 22 focused network/Worker/security tests.
- [ ] Configure controlled `UPDATES_ORIGIN`, `CONTENT_ORIGIN`, `REPORTS_ORIGIN`, `THEMES_ORIGIN`, and exact `ALLOWED_ORIGINS` on Cloudflare.
- [ ] Configure AniList/MAL/Trakt developer-app secrets in Cloudflare and run live device-code/code-exchange/refresh tests.
- [ ] Publish a valid signed Tauri update manifest and immutable artifacts through `/v1/updates/artifacts/`; verify check/download/install.
- [ ] Run `cargo check --manifest-path src-tauri/Cargo.toml`.
- [ ] Run `pnpm tauri:build:linux-system` on Linux with Cargo and platform dependencies.
- [ ] Run live relay host/join/transfer/reconnect/expiry tests before deployment.
- [ ] Decide whether to implement the native private-origin approval registry in this phase or track it as the next zero-trust hardening item.

## [QA_VERIFICATION]

- **Direct TypeScript (`tsc -b --pretty false`)**: PASS.
- **Focused network/Worker/security tests**: PASS, 22/22.
- **Full Node suite**: 105/106 PASS; sole failure is the unchanged startup-loader baseline.
- **Changed-file `vp check --no-fmt`**: PASS with 0 errors; existing warnings remain in already-dirty React files.
- **Repository-wide `vp check`**: Baseline failure from formatting across 1,621 files; unrelated files were not reformatted.
- **Repository-wide `vp check --no-fmt`**: Baseline 5 errors in untouched tests plus existing warnings; changed-file scoped check has 0 errors.
- **`pnpm run check` / `pnpm run typecheck`**: Wrapper stalled without output; direct tools were used and the generated local store was removed.
- **`cargo check`**: BLOCKED; Cargo is not installed.
- **Linux Tauri build**: BLOCKED by the same toolchain and the pnpm wrapper.
- **`git diff --check`**: PASS.

## [STATE]

- Phase 1 and Phase 2 remain complete.
- Phase 3 source has been revised for upstream compatibility and minimal architecture drift.
- Phase 3 is **not release-complete** until Worker bindings/secrets, signed update artifacts, native compilation, Linux build, and live OAuth/relay tests pass.
