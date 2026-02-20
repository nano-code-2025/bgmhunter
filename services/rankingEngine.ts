/**
 * Ranking Engine — multi-factor scoring with configurable weights.
 *
 * Scores each track on: relevance, popularity, preference fit, novelty, quality.
 * Then applies diversity constraints (artist cap, provider mix, tag spread)
 * via greedy selection.
 */
import { MusicTrack, MusicTags, UserPreferences } from '../types';

// ─── Weight profiles ────────────────────────────────────────────────

export interface RankingWeights {
  relevance: number;
  popularity: number;
  explicitPreference: number;
  implicitPreference: number;
  novelty: number;
  quality: number;
}

const KEYWORD_WEIGHTS: RankingWeights = {
  relevance: 0.40,
  popularity: 0.22,
  explicitPreference: 0.12,
  implicitPreference: 0.10,
  novelty: 0.06,
  quality: 0.10,
};

const SCRIPT_WEIGHTS: RankingWeights = {
  relevance: 0.30,
  popularity: 0.20,
  explicitPreference: 0.15,
  implicitPreference: 0.15,
  novelty: 0.10,
  quality: 0.10,
};

export function getWeightsForMode(mode: 'script' | 'keyword'): RankingWeights {
  return mode === 'script' ? { ...SCRIPT_WEIGHTS } : { ...KEYWORD_WEIGHTS };
}

// ─── Scoring context ────────────────────────────────────────────────

export interface ScoringContext {
  /** Tags from the original search intent (for relevance). */
  queryTags: MusicTags;
  /** User-set preferences. */
  explicitPreferences?: UserPreferences;
  /** Derived from favorites history. */
  implicitPreferences?: UserPreferences;
  /** Track IDs recently shown in this session. */
  recentlyShownIds: Set<string>;
  /** Weight profile (mode-dependent). */
  weights: RankingWeights;
}

// ─── Individual score components ────────────────────────────────────

/** Jaccard similarity between two string sets. */
function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0.5; // neutral when both empty
  const setA = new Set(a.map((s) => s.toLowerCase()));
  const setB = new Set(b.map((s) => s.toLowerCase()));
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0.5 : intersection / union;
}

/** Tag overlap between track and query (0-1). */
function relevanceScore(track: MusicTrack, queryTags: MusicTags): number {
  // Deezer tracks often have empty tags — give them a neutral default
  if (track.tags.length === 0) return 0.45;

  const queryFlat = [
    ...(queryTags.genres || []),
    ...(queryTags.instruments || []),
    ...(queryTags.vartags || []),
  ];
  return jaccard(track.tags, queryFlat);
}

/** Normalised popularity (already 0-100 on the track, map to 0-1). */
function popularityScore(track: MusicTrack): number {
  return (track.popularity ?? 50) / 100;
}

/** How well the track matches explicit preferences (0-1). */
function explicitPreferenceScore(
  track: MusicTrack,
  prefs?: UserPreferences
): number {
  if (!prefs) return 0.5;
  const prefTags = [
    ...(prefs.genres || []),
    ...(prefs.instruments || []),
    ...(prefs.vartags || []),
  ];
  if (prefTags.length === 0) return 0.5;
  return jaccard(track.tags, prefTags);
}

/** How well the track matches implicit preferences (0-1). */
function implicitPreferenceScore(
  track: MusicTrack,
  prefs?: UserPreferences
): number {
  if (!prefs) return 0.5;
  const prefTags = [
    ...(prefs.genres || []),
    ...(prefs.instruments || []),
    ...(prefs.vartags || []),
  ];
  if (prefTags.length === 0) return 0.5;
  return jaccard(track.tags, prefTags);
}

/** Novelty: 1 if unseen, penalised if recently shown. */
function noveltyScore(track: MusicTrack, recentlyShown: Set<string>): number {
  return recentlyShown.has(track.id) ? 0.1 : 1.0;
}

/** Quality: playback type + downloadable bonus. */
function qualityScore(track: MusicTrack): number {
  let score = 0.5;
  if (track.playbackType === 'full') score += 0.35;
  else if (track.playbackType === 'preview-30s') score += 0.15;
  if (track.audiodownloadAllowed) score += 0.15;
  return Math.min(1.0, score);
}

// ─── Composite scoring ──────────────────────────────────────────────

export interface ScoredTrack {
  track: MusicTrack;
  score: number;
  breakdown: {
    relevance: number;
    popularity: number;
    explicitPref: number;
    implicitPref: number;
    novelty: number;
    quality: number;
  };
}

export function scoreTrack(track: MusicTrack, ctx: ScoringContext): ScoredTrack {
  const w = ctx.weights;
  const rel = relevanceScore(track, ctx.queryTags);
  const pop = popularityScore(track);
  const ePref = explicitPreferenceScore(track, ctx.explicitPreferences);
  const iPref = implicitPreferenceScore(track, ctx.implicitPreferences);
  const nov = noveltyScore(track, ctx.recentlyShownIds);
  const qual = qualityScore(track);

  const composite =
    w.relevance * rel +
    w.popularity * pop +
    w.explicitPreference * ePref +
    w.implicitPreference * iPref +
    w.novelty * nov +
    w.quality * qual;

  return {
    track,
    score: composite,
    breakdown: {
      relevance: rel,
      popularity: pop,
      explicitPref: ePref,
      implicitPref: iPref,
      novelty: nov,
      quality: qual,
    },
  };
}

export function scoreAndRank(
  tracks: MusicTrack[],
  ctx: ScoringContext
): ScoredTrack[] {
  return tracks
    .map((t) => scoreTrack(t, ctx))
    .sort((a, b) => b.score - a.score);
}

// ─── Diversity constraints ──────────────────────────────────────────

export interface DiversityConfig {
  /** Max tracks from the same artist (default 2). */
  maxPerArtist: number;
  /** Min fraction from non-primary provider (default 0.3). */
  minProviderMixRatio: number;
  /** Max fraction of final list from one genre (default 0.5). */
  maxGenreRatio: number;
}

const DEFAULT_DIVERSITY: DiversityConfig = {
  maxPerArtist: 2,
  minProviderMixRatio: 0.3,
  maxGenreRatio: 0.5,
};

/**
 * Greedy diversified selection from the ranked pool.
 * Picks tracks top-down, skipping those that would violate constraints.
 */
export function diversifiedSelect(
  ranked: ScoredTrack[],
  limit: number,
  config: DiversityConfig = DEFAULT_DIVERSITY
): MusicTrack[] {
  const selected: MusicTrack[] = [];
  const artistCount = new Map<string, number>();
  const providerCount = new Map<string, number>();
  const genreCount = new Map<string, number>();

  for (const { track } of ranked) {
    if (selected.length >= limit) break;

    const artistKey = track.artist.toLowerCase();
    const providerKey = track.provider ?? 'unknown';

    // Artist cap
    if ((artistCount.get(artistKey) ?? 0) >= config.maxPerArtist) continue;

    // Genre cap (check each tag)
    const trackGenres = track.tags.filter((t) => t.length > 0);
    const wouldExceedGenre = trackGenres.some((genre) => {
      const gKey = genre.toLowerCase();
      const currentCount = genreCount.get(gKey) ?? 0;
      return currentCount / Math.max(selected.length, 1) >= config.maxGenreRatio &&
        selected.length >= 4; // only enforce after initial fill
    });
    if (wouldExceedGenre) continue;

    // Accept
    selected.push(track);
    artistCount.set(artistKey, (artistCount.get(artistKey) ?? 0) + 1);
    providerCount.set(providerKey, (providerCount.get(providerKey) ?? 0) + 1);
    for (const genre of trackGenres) {
      const gKey = genre.toLowerCase();
      genreCount.set(gKey, (genreCount.get(gKey) ?? 0) + 1);
    }
  }

  // Provider mix enforcement: if one provider dominates too much, swap some
  if (selected.length >= 4) {
    const total = selected.length;
    const primaryProvider = [...providerCount.entries()].sort((a, b) => b[1] - a[1])[0];
    if (primaryProvider && primaryProvider[1] / total > (1 - config.minProviderMixRatio)) {
      // Try to backfill from other providers in the ranked pool
      const skipped = ranked
        .map((s) => s.track)
        .filter(
          (t) =>
            !selected.includes(t) &&
            t.provider !== primaryProvider[0]
        );

      const swapCount = Math.ceil(total * config.minProviderMixRatio) -
        (total - primaryProvider[1]);

      if (swapCount > 0 && skipped.length > 0) {
        // Replace lowest-scored primary-provider tracks
        for (let i = 0; i < Math.min(swapCount, skipped.length); i++) {
          // Find last primary-provider track in selected
          for (let j = selected.length - 1; j >= 0; j--) {
            if (selected[j].provider === primaryProvider[0]) {
              selected[j] = skipped[i];
              break;
            }
          }
        }
      }
    }
  }

  return selected;
}

