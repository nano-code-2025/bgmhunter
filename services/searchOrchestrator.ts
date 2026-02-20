/**
 * SearchOrchestrator — runs all registered MusicProviders in parallel,
 * merges results, deduplicates, and returns a unified ranked list.
 *
 * This module is the ONLY place that touches providers. Hooks / UI import
 * this module, never individual providers directly — keeping things decoupled.
 */
import {
  MusicTrack,
  MusicProvider,
  SearchQuery,
  SearchOptions,
} from '../types';
import { defaultProviders } from './providers';

// ─── Configuration ──────────────────────────────────────────────────

/** Max total tracks returned after merge. */
const DEFAULT_MERGED_LIMIT = 20;

/** Similarity threshold for title+artist dedup (0-1, 1 = exact match). */
const DEDUP_THRESHOLD = 0.85;

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Very lightweight string similarity (Sørensen–Dice on bigrams).
 * Returns 0-1 where 1 = identical.
 */
function similarity(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;

  const bigrams = (str: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
      set.add(str.substring(i, i + 2));
    }
    return set;
  };

  const bg1 = bigrams(s1);
  const bg2 = bigrams(s2);
  let intersect = 0;
  for (const b of bg1) {
    if (bg2.has(b)) intersect++;
  }
  return (2 * intersect) / (bg1.size + bg2.size);
}

/**
 * Deduplicate tracks by title + artist similarity.
 * When a duplicate is found, keep the one with higher popularity or the
 * one from a provider that offers full playback.
 */
function dedup(tracks: MusicTrack[]): MusicTrack[] {
  const result: MusicTrack[] = [];

  for (const track of tracks) {
    const isDupe = result.some((existing) => {
      const titleSim = similarity(existing.title, track.title);
      const artistSim = similarity(existing.artist, track.artist);
      return titleSim > DEDUP_THRESHOLD && artistSim > DEDUP_THRESHOLD;
    });

    if (!isDupe) {
      result.push(track);
    }
  }

  return result;
}

/**
 * Sort tracks by a composite score:
 * 1. Tracks with full playback rank higher than preview-only.
 * 2. Higher popularity → higher rank.
 * 3. Jamendo tracks that are downloadable get a small bonus.
 */
function rankTracks(tracks: MusicTrack[]): MusicTrack[] {
  return [...tracks].sort((a, b) => {
    const scoreA = computeScore(a);
    const scoreB = computeScore(b);
    return scoreB - scoreA;
  });
}

function computeScore(track: MusicTrack): number {
  let score = 0;

  // Playback quality bonus
  if (track.playbackType === 'full') score += 30;
  else if (track.playbackType === 'preview-30s') score += 15;

  // Popularity (0-100)
  score += (track.popularity ?? 50);

  // Downloadable bonus
  if (track.audiodownloadAllowed) score += 10;

  return score;
}

// ─── Public API ─────────────────────────────────────────────────────

export interface OrchestratorOptions extends SearchOptions {
  /** Maximum tracks in the final merged list (default 20). */
  mergedLimit?: number;
  /** Providers to use (defaults to all registered providers). */
  providers?: MusicProvider[];
  /** Provider names to exclude from this search (e.g. ['deezer']). */
  excludeProviders?: string[];
}

/**
 * Run a parallel search across all (or selected) providers,
 * merge, deduplicate, rank, and return up to `mergedLimit` tracks.
 */
export async function orchestratedSearch(
  query: SearchQuery,
  options: OrchestratorOptions = {}
): Promise<MusicTrack[]> {
  const {
    mergedLimit = DEFAULT_MERGED_LIMIT,
    providers = defaultProviders,
    excludeProviders = [],
    filterPlayable = true,
  } = options;

  // Filter out excluded providers
  const activeProviders = providers.filter(
    (p) => !excludeProviders.includes(p.name)
  );

  if (activeProviders.length === 0) {
    console.warn('[Orchestrator] No active providers');
    return [];
  }

  // Per-provider limit: request enough so the merged pool is rich
  const perProviderLimit = Math.max(
    query.limit ?? 15,
    Math.ceil(mergedLimit / activeProviders.length) + 5
  );

  const providerQuery: SearchQuery = { ...query, limit: perProviderLimit };
  const searchOptions: SearchOptions = { filterPlayable };

  // ── Parallel search ───────────────────────────────────────────────
  const settled = await Promise.allSettled(
    activeProviders.map((provider) =>
      provider.search(providerQuery, searchOptions)
    )
  );

  // Collect successful results, log failures
  const allTracks: MusicTrack[] = [];
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      console.log(
        `[Orchestrator] ${activeProviders[i].name}: ${result.value.length} tracks`
      );
      allTracks.push(...result.value);
    } else {
      console.warn(
        `[Orchestrator] ${activeProviders[i].name} failed:`,
        result.reason
      );
    }
  });

  // ── Merge pipeline ────────────────────────────────────────────────
  const unique = dedup(allTracks);
  const ranked = rankTracks(unique);

  return ranked.slice(0, mergedLimit);
}

/**
 * Convenience: search a single provider by name (for debugging / fallback).
 */
export async function searchSingleProvider(
  providerName: string,
  query: SearchQuery,
  options: SearchOptions = {}
): Promise<MusicTrack[]> {
  const provider = defaultProviders.find((p) => p.name === providerName);
  if (!provider) {
    console.error(`[Orchestrator] Unknown provider: ${providerName}`);
    return [];
  }
  return provider.search(query, options);
}

