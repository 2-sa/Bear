# Harbor binary mirror

This Worker is a read-only front end for the checksum-locked build assets in
`scripts/binary-lock.json`. It never fetches an upstream URL and it does not
expose any upload, delete, proxy, or directory-listing endpoint.

Production URL: `https://bear.7mood.net`

The current ten unique objects use 336,751,444 bytes (about 0.337 GB), well
below the account's 10 GB storage limit. Keep only the compressed/raw source
objects listed in the lock manifest; do not upload extracted duplicates.

## Deploy

1. Review `scripts/binary-lock.json` and the allowlist in `src/index.js` together.
2. Create the bucket: `wrangler r2 bucket create harbor-build-assets`.
3. Download every unique `sourceUrl`, verify its `downloadSize` and
   `downloadSha256`, then upload it under its exact `mirrorKey` with
   `wrangler r2 object put harbor-build-assets/<mirrorKey> --file <verified-file>`.
4. From this directory, run `wrangler deploy` and record the emitted HTTPS URL.
5. Set `HARBOR_BINARY_MIRROR_URL` to that URL in the build environment. Set
   `HARBOR_BINARY_MIRROR_REQUIRED=1` if builds must never fall back to the fixed
   upstream release assets.

The build verifies SHA-256 again after every R2 download. Replacing an R2 object
with different bytes therefore stops the build; control of the Worker or bucket
alone cannot introduce a different executable into a release.

When rotating a tool, add a new versioned key. Do not overwrite an existing key,
and never add `latest` or a Worker-side upstream `fetch()`.
