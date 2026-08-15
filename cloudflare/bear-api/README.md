# Bear API

This Worker hosts Bear-owned server-side integrations:

- `POST https://api.7mood.net/v1/anilist/token`
- allowlisted public content under `https://api.7mood.net`, including Bear's
  announcements, curated artwork, badge packs, shader previews, and signed
  skip-segment corpus

The public-content proxy accepts only fixed read-only paths, strips caller
headers and query strings, refuses redirects, validates response types, and
caps response sizes. It is not a general proxy and does not expose services
that require third-party API keys.

The AniList client secret must exist only as the encrypted Worker secret
`ANILIST_CLIENT_SECRET`. Never place its value in source, Wrangler variables,
GitHub secrets, logs, or client builds.

The AniList endpoint accepts only a small JSON body containing a single `code` field,
rate-limits token exchanges, calls AniList's fixed OAuth token endpoint, and
returns only the resulting access token.
