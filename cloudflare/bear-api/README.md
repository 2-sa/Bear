# Bear API

This Worker hosts Bear-owned server-side integrations:

- `POST https://api.7mood.net/v1/anilist/token`
- `POST https://api.7mood.net/v1/feedback`
- `POST https://api.7mood.net/v1/adreport`
- `POST https://api.7mood.net/v1/reports`
- allowlisted public content under `https://api.7mood.net`, including Bear's
  announcements, curated artwork, badge packs, shader previews, and signed
  skip-segment corpus

Public content is stored in the private `bear-public-content` R2 bucket and
refreshed every six hours. Requests are served from the last known-good R2
copy. A missing object is fetched once from the fixed upstream origin, checked,
stored, and then served. The mirror accepts only fixed read-only paths, strips
caller headers and query strings, validates redirects, response types, and
response sizes. It is not a general proxy and does not expose services that
require third-party API keys.

The AniList client secret must exist only as the encrypted Worker secret
`ANILIST_CLIENT_SECRET`. Never place its value in source, Wrangler variables,
GitHub secrets, logs, or client builds.

Feedback, ad reports, bug reports, and their explicitly selected attachments
are stored privately under the `submissions/` prefix in Bear's R2 bucket. They
are never forwarded to Harbor. Request type, size, field, file-count, origin,
and rate limits are enforced before storage.

The AniList endpoint accepts only a small JSON body containing a single `code` field,
rate-limits token exchanges, calls AniList's fixed OAuth token endpoint, and
returns only the resulting access token.
