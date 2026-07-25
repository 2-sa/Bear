# Continue Watching Beta Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the beta-only Continue Watching correctness fixes onto current `main` without importing the beta view architecture.

**Architecture:** Keep the existing TanStack `/` route and Home component boundary. Put new deterministic behavior in framework-independent helpers, keep provider lookups at the Continue Card integration boundary, and persist provider season identity separately from the season shown to users.

**Tech Stack:** React 19, TypeScript 6, TanStack Router, Node test runner, Vite Plus.

## Global Constraints

- Base the PR on `origin/main`; do not depend on the manga port.
- Do not introduce new legacy view-stack frames.
- Continue Watching remains part of the existing TanStack `/` route; no new route is required.
- Add regression coverage before each behavior change.
- Do not port beta build changes already satisfied by current `main`.
- Run `pnpm run check`, `pnpm run typecheck`, and `pnpm test`.

---

### Task 1: Stream IDs and resume season identity

**Files:**

- Modify: `src/lib/streams/stream-ids.ts`
- Modify: `src/lib/resume.ts`
- Modify: `src/lib/hover-preview/resume-index.ts`
- Modify: `src/views/player/hooks/use-resume-autosave.ts`
- Modify: `src/views/detail.tsx`
- Test: `tests/cw-beta-parity.test.ts`

**Interfaces:**

- Consumes: existing `PlayEpisode`, resume storage, and player source types.
- Produces: stream IDs for Kitsu/MAL/AniList/AniDB episodes and an optional `displaySeason` on resume entries.

- [ ] **Step 1: Add failing regression tests**

Test that all supported anime provider IDs produce an episode stream ID and that `saveResumeMs(id, ms, season, episode, displaySeason)` preserves `displaySeason` through `readResumeEntry` and `lastPlayedEpisode`.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test tests/cw-beta-parity.test.ts`

Expected: AniList/AniDB stream ID assertions fail and resume storage does not expose `displaySeason`.

- [ ] **Step 3: Implement provider IDs and display-season persistence**

Generalize the anime provider branch in `buildStreamIds`. Extend resume storage with optional `s`, return it as `displaySeason`, save the canonical IMDb season as the display season while retaining the source season in the resume key, and render that display season in resume UI.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `node --test tests/cw-beta-parity.test.ts`

Expected: all assertions pass.

### Task 2: Continue Card episode mapping and label

**Files:**

- Create: `src/lib/cw-episode.ts`
- Modify: `src/components/continue-card.tsx`
- Test: `tests/cw-beta-parity.test.ts`

**Interfaces:**

- Consumes: `AniZipMapping`, `PlayEpisode`, parsed source metadata, and Kitsu video metadata.
- Produces: `formatCwEpisodeLabel()` and `applyAniZipEpisodeMapping()`.

- [ ] **Step 1: Add failing tests for labels and AniZip mapping**

Cover mapped IMDb season labels, ordinary season labels, absolute anime episode fallback, Kitsu stream IDs, IMDb IDs, and mapped IMDb episode coordinates.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test tests/cw-beta-parity.test.ts`

Expected: import fails because `src/lib/cw-episode.ts` does not exist.

- [ ] **Step 3: Implement helpers and integrate them**

Create pure formatting/mapping helpers. Use them in Continue Card, and perform the existing AniZip provider lookup only when an anime fallback episode lacks complete mapping data.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `node --test tests/cw-beta-parity.test.ts`

Expected: all assertions pass.

### Task 3: Franchise deduplication and row reset

**Files:**

- Create: `src/lib/cw-list.ts`
- Modify: `src/views/home.tsx`
- Modify: `src/views/home/cw-section.tsx`
- Test: `tests/cw-beta-parity.test.ts`

**Interfaces:**

- Consumes: ordered Continue Watching items and cached franchise roots.
- Produces: `dedupeCwFranchises()` and `cwRowKey()`.

- [ ] **Step 1: Add failing list-behavior tests**

Verify that the newest item wins for a shared franchise root, unknown roots remain visible, and the row key changes when the first item changes.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test tests/cw-beta-parity.test.ts`

Expected: import fails because `src/lib/cw-list.ts` does not exist.

- [ ] **Step 3: Implement and integrate the helpers**

Deduplicate after the existing ID/name pass, prefetch missing franchise roots in an effect, and key the Continue Watching `Row` by its first item.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `node --test tests/cw-beta-parity.test.ts`

Expected: all assertions pass.

### Task 4: Verify, document exclusions, and prepare the draft PR

**Files:**

- Modify: `docs/beta-remaining-features.md` only if it is present on the branch.

**Interfaces:**

- Consumes: completed implementation and repository checks.
- Produces: a reviewable draft PR based on `main`.

- [ ] **Step 1: Verify beta build fixes against current main**

Confirm award assets are tracked and `package.json` has no missing face-assets prebuild hook. Do not change those files.

- [ ] **Step 2: Run required checks**

Run: `pnpm run check`

Run: `pnpm run typecheck`

Run: `pnpm test`

Expected: all changed-file checks, TypeScript compilation, and tests pass. If repository-wide formatting fails only on untouched files, record that baseline without modifying them.

- [ ] **Step 3: Review and commit**

Review `git diff --check` and the complete branch diff, then commit with Conventional Commit messages.

- [ ] **Step 4: Push and open a draft PR**

Push `fix/cw-beta-parity` and open a Draft PR targeting `main`, including the test evidence and noting that no new TanStack route was needed because Continue Watching is owned by `/`.
