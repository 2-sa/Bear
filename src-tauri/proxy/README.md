# Harbor API proxy

This Worker is the only supported first-party API boundary for Harbor clients.
It exposes a closed route table and never accepts an upstream URL from a
request.

Non-secret origins are configured as Worker variables:

- `UPDATES_ORIGIN`
- `CONTENT_ORIGIN`
- `REPORTS_ORIGIN`
- `THEMES_ORIGIN`
- `ALLOWED_ORIGINS`

OAuth application IDs and secrets are configured with Wrangler secrets:

- `ANILIST_CLIENT_ID`, `ANILIST_CLIENT_SECRET`
- `MAL_CLIENT_ID`, `MAL_CLIENT_SECRET`
- `TRAKT_CLIENT_ID`, `TRAKT_CLIENT_SECRET`

The official Tauri updater endpoint is configured in `src-tauri/tauri.conf.json`.
Frontend routes use the project-owned Worker by default and can be overridden
with `VITE_HARBOR_WORKER_PROXY_BASE`. Neither value is a secret. No legacy
service origin is used as a fallback.

The Wrangler configuration provisions separate read and write rate-limit
bindings. The Worker fails closed if either binding is unavailable for a
matched route.

Update manifests must point signed artifacts at the same Worker under
`/v1/updates/artifacts/<immutable-path>`. The Worker maps only that fixed path
to `UPDATES_ORIGIN/updates/artifacts/<immutable-path>`; it never accepts a
caller-supplied URL. Keep the updater endpoint and frontend Worker origin on
the same deployed Worker so the native updater and WebView share one route
contract.
