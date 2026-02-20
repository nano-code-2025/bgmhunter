/**
 * SearchOrchestrator V2 — runs M query variants × N providers in parallel,
 * merges, deduplicates, scores with RankingEngine, and applies diversity
 * constraints.
 *
 * This module is the ONLY place that touches providers. Hooks / UI import
 * this module, never individual providers directly — keeping things decoupled.
 */
import {
  MusicTrack,
  MusicProvider,
  SearchQuery,
  SearchOptions,
  MusicTags,
  UserPreferences,
} from '../types';
import { defaultProviders } from './providers';
import {
  scoreAndRank,
  diversifiedSelect,
  getWeightsForMode,
  ScoringContext,
  DiversityConfig,
  RankingWeights,
} from './rankingEngine';
import { generateQueryVariants, QueryGeneratorInput } from './queryGenerator';
import { sessionMemory } from './sessionMemory';

// ─── Configuration ──────────────────────────────────────────────────

/** Default max tracks returned after merge + ranking. */
const DEFAULT_MERGED_LIMIT = 20;

/** Similarity threshold for title+artist dedup (0-1, 1 = exact match). */
const DEDUP_THRESHOLD = 0.85;

/** Target raw candidate pool size before scoring. */
const TARGET_POOL_SIZE = 50;

// ─── Helpers ────────────────────────────────────────────────────────

/** Sørensen–Dice bigram similarity (0-1). */
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

/** Deduplicate by title + artist similarity. Keep higher-quality variant. */
function dedup(tracks: MusicTrack[]): MusicTrack[] {
  const result: MusicTrack[] = [];

  for (const track of tracks) {
    let foundDupeIdx = -1;
    for (let i = 0; i < result.length; i++) {
      const existing = result[i];
      const titleSim = similarity(existing.title, track.title);
      const artistSim = similarity(existing.artist, track.artist);
      if (titleSim > DEDUP_THRESHOLD && artistSim > DEDUP_THRESHOLD) {
        foundDupeIdx = i;
        break;
      }
    }

    if (foundDupeIdx === -1) {
      result.push(track);
    } else {
      // Keep the one with better playback quality or higher popularity
      const existing = result[foundDupeIdx];
      const existingScore =
        (existing.playbackType === 'full' ? 2 : existing.playbackType === 'preview-30s' ? 1 : 0) +
        (existing.popularity ?? 0) / 100;
      const newScore =
        (track.playbackType === 'full' ? 2 : track.playbackType === 'preview-30s' ? 1 : 0) +
        (track.popularity ?? 0) / 100;
      if (newScore > existingScore) {
        result[foundDupeIdx] = track;
      }
    }
  }

  return result;
}

function tagsToText(tags: MusicTags): string {
  const { genres = [], instruments = [], vartags = [] } = tags;
  return [...genres, ...instruments, ...vartags].filter(Boolean).join(' ');
}

// ─── Public API ─────────────────────────────────────────────────────

export interface OrchestratorOptions extends SearchOptions {
  /** Maximum tracks in the final merged list (default 20). */
  mergedLimit?: number;
  /** Providers to use (defaults to all registered providers). */
  providers?: MusicProvider[];
  /** Provider names to exclude from this search. */
  excludeProviders?: string[];
  /** Scoring mode (affects weight profile). */
  mode?: 'script' | 'keyword';
  /** User explicit preferences for ranking. */
  explicitPreferences?: UserPreferences;
  /** User implicit preferences for ranking. */
  implicitPreferences?: UserPreferences;
  /** Custom ranking weights (overrides mode default). */
  weights?: RankingWeights;
  /** Diversity config (overrides defaults). */
  diversity?: Partial<DiversityConfig>;
}

/**
 * V2: Generate query variants, run M queries × N providers in parallel,
 * merge, dedup, score, diversify, and return top K.
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
    mode = 'keyword',
    explicitPreferences,
    implicitPreferences,
    weights,
    diversity,
  } = options;

  const activeProviders = providers.filter(
    (p) => !excludeProviders.includes(p.name)
  );

  if (activeProviders.length === 0) {
    console.warn('[Orchestrator] No active providers');
    return [];
  }

  // ── Step 1: Generate query variants ─────────────────────────────
  const coreTags: MusicTags = query.tags || {
    genres: [],
    instruments: [],
    vartags: [],
  };

  const generatorInput: QueryGeneratorInput = {
    coreTags,
    mode,
    text: query.text,
    explicitPreferences,
    implicitPreferences,
    explorationSeed: Math.floor(Math.random() * 1000),
  };

  let queryVariants: SearchQuery[];
  try {
    queryVariants = await generateQueryVariants(generatorInput);
  } catch (error) {
    console.warn('[Orchestrator] Query variant generation failed, using single query:', error);
    queryVariants = [query];
  }

  console.log(
    `[Orchestrator] ${queryVariants.length} query variants × ${activeProviders.length} providers`
  );

  // ── Step 2: Parallel M × N fetch ───────────────────────────────
  const perProviderLimit = Math.max(
    query.limit ?? 15,
    Math.ceil(TARGET_POOL_SIZE / (activeProviders.length * queryVariants.length)) + 3
  );

  const searchOptions: SearchOptions = { filterPlayable };
  const fetchPromises: Promise<MusicTrack[]>[] = [];

  for (const variant of queryVariants) {
    const variantQuery: SearchQuery = { ...variant, limit: perProviderLimit };
    for (const provider of activeProviders) {
      fetchPromises.push(
        provider
          .search(variantQuery, searchOptions)
          .then((tracks) => {
            console.log(
              `[Orchestrator] ${provider.name} (${variantQuery.text.slice(0, 40)}…): ${tracks.length} tracks`
            );
            return tracks;
          })
          .catch((error) => {
            console.warn(`[Orchestrator] ${provider.name} failed:`, error);
            return [] as MusicTrack[];
          })
      );
    }
  }

  const results = await Promise.allSettled(fetchPromises);

  // ── Step 3: Merge into candidate pool ──────────────────────────
  const allTracks: MusicTrack[] = [];
  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      allTracks.push(...result.value);
    }
  });

  console.log(`[Orchestrator] Raw pool: ${allTracks.length} tracks`);

  // ── Step 4: Dedup ──────────────────────────────────────────────
  const unique = dedup(allTracks);
  console.log(`[Orchestrator] After dedup: ${unique.length} tracks`);

  // ── Step 5: Score and rank ─────────────────────────────────────
  const scoringCtx: ScoringContext = {
    queryTags: coreTags,
    explicitPreferences,
    implicitPreferences,
    recentlyShownIds: sessionMemory.getRecentIds(),
    weights: weights || getWeightsForMode(mode),
  };

  const ranked = scoreAndRank(unique, scoringCtx);

  // ── Step 6: Diversity-constrained selection ────────────────────
  const diversityConfig: DiversityConfig = {
    maxPerArtist: diversity?.maxPerArtist ?? 2,
    minProviderMixRatio: diversity?.minProviderMixRatio ?? 0.3,
    maxGenreRatio: diversity?.maxGenreRatio ?? 0.5,
  };

  const selected = diversifiedSelect(ranked, mergedLimit, diversityConfig);

  // ── Step 7: Update session memory ──────────────────────────────
  sessionMemory.addBatch(selected.map((t) => t.id));

  console.log(`[Orchestrator] Final selection: ${selected.length} tracks`);
  return selected;
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
