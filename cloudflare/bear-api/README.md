# Bear API

This Worker hosts Bear-owned server-side integrations. Its first endpoint is:

- `POST https://api.7mood.net/v1/anilist/token`

The AniList client secret must exist only as the encrypted Worker secret
`ANILIST_CLIENT_SECRET`. Never place its value in source, Wrangler variables,
GitHub secrets, logs, or client builds.

The endpoint accepts only a small JSON body containing a single `code` field,
rate-limits token exchanges, calls AniList's fixed OAuth token endpoint, and
returns only the resulting access token.
