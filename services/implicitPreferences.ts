/**
 * Implicit Preference Extractor — derives user taste signals from
 * favorited tracks stored in localStorage.
 *
 * Reads the same collection structure used by useCollections, counts tag
 * frequencies across all favorited tracks, and returns the top genres,
 * instruments, and mood/vartags — weighted by recency.
 *
 * Output shape matches UserPreferences so it can be fed directly into
 * the Query Variant Generator and Ranking Engine.
 */
import { Collection, MusicTrack, UserPreferences } from '../types';

// ─── Configuration ──────────────────────────────────────────────────

/** How many top tags to keep per category. */
const TOP_GENRES = 3;
const TOP_INSTRUMENTS = 2;
const TOP_VARTAGS = 3;

/** Recency decay factor: newer favorites get a multiplier up to this value. */
const RECENCY_MAX_BOOST = 2.0;

/** localStorage key (same as useCollections). */
const COLLECTIONS_STORAGE_KEY = 'bgm-hunter-collections';

// ─── Internal helpers ───────────────────────────────────────────────

/** Known genre strings (lowercase) for classification. */
const GENRE_KEYWORDS = new Set([
  'rock', 'pop', 'electronic', 'jazz', 'classical', 'hiphop', 'hip hop',
  'folk', 'blues', 'reggae', 'metal', 'country', 'latin', 'world',
  'ambient', 'chillhop', 'lofi', 'lo-fi', 'downtempo', 'edm', 'synth',
  'trap', 'r&b', 'soul', 'funk', 'disco', 'house', 'techno', 'trance',
  'indie', 'alternative', 'punk', 'grunge', 'psychedelic', 'bossa nova',
  'swing', 'ska', 'dancehall', 'dubstep', 'drum and bass', 'dnb',
  'new age', 'experimental', 'easy listening', 'chillout', 'trip hop',
]);

const INSTRUMENT_KEYWORDS = new Set([
  'piano', 'guitar', 'strings', 'drums', 'bass', 'synthesizer', 'synth',
  'saxophone', 'violin', 'cello', 'flute', 'trumpet', 'organ', 'ukulele',
  'harp', 'clarinet', 'harmonica', 'banjo', 'mandolin', 'accordion',
  'percussion', 'brass', 'woodwind',
]);

function classifyTag(tag: string): 'genre' | 'instrument' | 'vartag' {
  const lower = tag.toLowerCase();
  if (GENRE_KEYWORDS.has(lower)) return 'genre';
  if (INSTRUMENT_KEYWORDS.has(lower)) return 'instrument';
  return 'vartag';
}

interface TagCount {
  tag: string;
  score: number;
}

function topN(counts: Map<string, number>, n: number): string[] {
  const entries: TagCount[] = [];
  for (const [tag, score] of counts) {
    entries.push({ tag, score });
  }
  entries.sort((a, b) => b.score - a.score);
  return entries.slice(0, n).map((e) => e.tag);
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Extract implicit preferences from the user's favorited tracks.
 * Reads directly from localStorage (no React dependency).
 */
export function extractImplicitPreferences(): UserPreferences {
  let collections: Collection[] = [];
  try {
    const raw = localStorage.getItem(COLLECTIONS_STORAGE_KEY);
    if (raw) {
      collections = JSON.parse(raw) as Collection[];
    }
  } catch {
    console.warn('[ImplicitPrefs] Failed to read collections from localStorage');
    return { genres: [], instruments: [], vartags: [] };
  }

  // Flatten all tracks from all collections
  const allTracks: MusicTrack[] = collections.flatMap((c) => c.tracks);

  if (allTracks.length === 0) {
    return { genres: [], instruments: [], vartags: [] };
  }

  // Sort by collection updatedAt for recency weighting
  // Tracks in more recently updated collections get higher weight
  const tracksByRecency: Array<{ track: MusicTrack; recencyWeight: number }> = [];

  for (const collection of collections) {
    const weight = computeRecencyWeight(collection.updatedAt);
    for (const track of collection.tracks) {
      tracksByRecency.push({ track, recencyWeight: weight });
    }
  }

  // Count tags with recency weighting
  const genreCounts = new Map<string, number>();
  const instrumentCounts = new Map<string, number>();
  const vartagCounts = new Map<string, number>();

  for (const { track, recencyWeight } of tracksByRecency) {
    for (const tag of track.tags) {
      const lower = tag.toLowerCase();
      const category = classifyTag(lower);
      const targetMap =
        category === 'genre'
          ? genreCounts
          : category === 'instrument'
            ? instrumentCounts
            : vartagCounts;
      targetMap.set(lower, (targetMap.get(lower) ?? 0) + recencyWeight);
    }
  }

  return {
    genres: topN(genreCounts, TOP_GENRES),
    instruments: topN(instrumentCounts, TOP_INSTRUMENTS),
    vartags: topN(vartagCounts, TOP_VARTAGS),
  };
}

/** Compute a recency weight: 1.0 for old collections, up to RECENCY_MAX_BOOST for recent. */
function computeRecencyWeight(updatedAt: number): number {
  const now = Date.now();
  const ageMs = now - updatedAt;
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

  if (ageMs <= 0) return RECENCY_MAX_BOOST;
  if (ageMs >= oneWeekMs * 4) return 1.0; // older than 4 weeks → base weight

  // Linear interpolation: 4 weeks → 1.0, just now → RECENCY_MAX_BOOST
  const ratio = 1 - Math.min(ageMs / (oneWeekMs * 4), 1);
  return 1.0 + ratio * (RECENCY_MAX_BOOST - 1.0);
}

/**
 * Check if the user has any implicit preference data (non-empty favorites).
 */
export function hasImplicitData(): boolean {
  try {
    const raw = localStorage.getItem(COLLECTIONS_STORAGE_KEY);
    if (!raw) return false;
    const collections = JSON.parse(raw) as Collection[];
    return collections.some((c) => c.tracks.length > 0);
  } catch {
    return false;
  }
}

