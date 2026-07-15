import type { Meta } from "@/lib/cinemeta";

export function dropUnreleased(metas: Meta[]): Meta[] {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yearNow = now.getUTCFullYear();
  return metas.filter((m) => {
    if (m.releaseDate) return m.releaseDate.slice(0, 10) <= today;
    const y = m.releaseInfo ? parseInt(m.releaseInfo.slice(0, 4), 10) : NaN;
    return !Number.isFinite(y) || y <= yearNow;
  });
}

// Genres excluded from the kids catalogs (the `without_genres` used to build the
// rows). Applied to cross-title recommendations, which — unlike the catalog rows
// — are not certification-filtered upstream.
const EXCLUDED_KID_GENRES = new Set(["horror", "thriller"]);

export function dropUnsafeGenres(metas: Meta[]): Meta[] {
  return metas.filter(
    (m) => !(m.genres ?? []).some((g) => EXCLUDED_KID_GENRES.has(g.trim().toLowerCase())),
  );
}
