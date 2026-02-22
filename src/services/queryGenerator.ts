/**
 * Query Variant Generator — produces 2-3 SearchQuery objects from a single
 * intent (core tags + mode + preferences).
 *
 * Variant A (Precision): Core tags as-is. High relevance, low diversity.
 * Variant B (Recall):    AI-expanded synonyms / neighbors for broader reach.
 * Variant C (Exploration): Mood-driven + implicit prefs for serendipity.
 *
 * A single DeepSeek call returns all 3 variants. Static fallback when AI
 * is unavailable.
 */
import { MusicTags, SearchQuery, UserPreferences } from '../types';
import { callDeepSeek, getApiKey } from './aiService';

// ─── Public types ───────────────────────────────────────────────────

export interface QueryGeneratorInput {
  coreTags: MusicTags;
  mode: 'script' | 'keyword';
  text: string;
  explicitPreferences?: UserPreferences;
  implicitPreferences?: UserPreferences;
  /** Increment on each refresh to vary the exploration query. */
  explorationSeed?: number;
}

interface AIVariantsResponse {
  precision: MusicTags;
  recall: MusicTags;
  exploration: MusicTags;
}

// ─── Static synonym map (fallback when AI is unavailable) ───────────

const SYNONYM_MAP: Record<string, string[]> = {
  lofi: ['chillhop', 'downtempo', 'lo-fi beats', 'study beats'],
  electronic: ['edm', 'synth', 'electronica', 'synthwave'],
  jazz: ['smooth jazz', 'bossa nova', 'swing', 'nu jazz'],
  classical: ['orchestral', 'chamber', 'neo-classical', 'symphony'],
  pop: ['indie pop', 'electropop', 'synth pop'],
  hiphop: ['hip hop', 'rap', 'trap', 'boom bap'],
  rock: ['alternative rock', 'indie rock', 'post-rock'],
  ambient: ['drone', 'soundscape', 'new age', 'atmospheric'],
  folk: ['acoustic', 'indie folk', 'singer-songwriter'],
  blues: ['delta blues', 'electric blues', 'soul blues'],
  metal: ['heavy metal', 'progressive metal', 'post-metal'],
  reggae: ['dub', 'ska', 'dancehall'],
  country: ['americana', 'bluegrass', 'country rock'],
  latin: ['bossa nova', 'salsa', 'reggaeton', 'cumbia'],
  chillhop: ['lofi', 'jazzhop', 'chillout', 'trip hop'],
  // Mood expansions
  happy: ['joyful', 'cheerful', 'upbeat', 'uplifting'],
  sad: ['melancholic', 'somber', 'bittersweet', 'nostalgic'],
  calm: ['peaceful', 'serene', 'tranquil', 'gentle'],
  energetic: ['powerful', 'driving', 'intense', 'dynamic'],
  romantic: ['love', 'tender', 'passionate', 'dreamy'],
  cinematic: ['epic', 'dramatic', 'trailer', 'film score'],
};

// ─── Helpers ────────────────────────────────────────────────────────

function tagsToText(tags: MusicTags): string {
  const { genres = [], instruments = [], vartags = [] } = tags;
  return [...genres, ...instruments, ...vartags].filter(Boolean).join(' ');
}

function toSearchQuery(tags: MusicTags, limit: number = 15): SearchQuery {
  return { text: tagsToText(tags), tags, limit };
}

function dedupArray(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.toLowerCase()))];
}

/** Pick N random elements from an array. */
function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// ─── Static variant builders ────────────────────────────────────────

function buildStaticRecall(coreTags: MusicTags): MusicTags {
  const expandedGenres = [...(coreTags.genres || [])];
  for (const genre of coreTags.genres || []) {
    const synonyms = SYNONYM_MAP[genre.toLowerCase()];
    if (synonyms) expandedGenres.push(...pickRandom(synonyms, 2));
  }

  const expandedVartags = [...(coreTags.vartags || [])];
  for (const tag of coreTags.vartags || []) {
    const synonyms = SYNONYM_MAP[tag.toLowerCase()];
    if (synonyms) expandedVartags.push(...pickRandom(synonyms, 1));
  }

  return {
    genres: dedupArray(expandedGenres),
    instruments: coreTags.instruments || [],
    vartags: dedupArray(expandedVartags),
  };
}

function buildStaticExploration(
  coreTags: MusicTags,
  implicitPrefs?: UserPreferences,
  seed?: number
): MusicTags {
  // Keep mood/vartags from core, mix in implicit preference tags
  const moodTags = coreTags.vartags || [];
  const implicitGenres = implicitPrefs?.genres || [];
  const implicitInstruments = implicitPrefs?.instruments || [];
  const implicitVartags = implicitPrefs?.vartags || [];

  // Use seed to vary which implicit tags get picked
  const seedOffset = (seed ?? 0) % Math.max(implicitGenres.length, 1);

  const explorationGenres: string[] = [];
  if (implicitGenres.length > 0) {
    // Rotate through implicit genres based on seed
    for (let i = 0; i < Math.min(2, implicitGenres.length); i++) {
      explorationGenres.push(implicitGenres[(seedOffset + i) % implicitGenres.length]);
    }
  }

  return {
    genres: dedupArray(explorationGenres),
    instruments: dedupArray(pickRandom(implicitInstruments, 2)),
    vartags: dedupArray([...moodTags, ...pickRandom(implicitVartags, 2)]),
  };
}

// ─── AI-powered variant builder ─────────────────────────────────────

function buildVariantPrompt(input: QueryGeneratorInput): string {
  const { coreTags, explicitPreferences, implicitPreferences, explorationSeed } = input;

  return `You are a music search query optimizer. Given core search tags, generate 3 search query variants for finding background music.

Core tags:
- Genres: ${coreTags.genres?.join(', ') || 'none'}
- Instruments: ${coreTags.instruments?.join(', ') || 'none'}
- Moods/Vartags: ${coreTags.vartags?.join(', ') || 'none'}

${explicitPreferences ? `User explicit preferences:
- Genres: ${explicitPreferences.genres?.join(', ') || 'none'}
- Instruments: ${explicitPreferences.instruments?.join(', ') || 'none'}
- Scenarios: ${explicitPreferences.vartags?.join(', ') || 'none'}` : ''}

${implicitPreferences ? `User implicit preferences (from listening history):
- Genres: ${implicitPreferences.genres?.join(', ') || 'none'}
- Instruments: ${implicitPreferences.instruments?.join(', ') || 'none'}
- Moods: ${implicitPreferences.vartags?.join(', ') || 'none'}` : ''}

Exploration seed: ${explorationSeed ?? 0} (use this to vary the exploration variant)

Generate 3 variants:
1. "precision": Clean/validate the core tags. Keep them close to the original intent. 2-3 genres, 1-2 instruments, 2-3 moods.
2. "recall": Expand with synonyms, related sub-genres, and neighboring styles for broader coverage. 3-5 genres, 2-3 instruments, 3-4 moods.
3. "exploration": Serendipitous discovery tags based on mood+energy+implicit preferences. Different genres from precision, but mood-compatible. 2-3 genres, 1-2 instruments, 2-3 moods.

Return JSON:
{
  "precision": { "genres": [], "instruments": [], "vartags": [] },
  "recall": { "genres": [], "instruments": [], "vartags": [] },
  "exploration": { "genres": [], "instruments": [], "vartags": [] }
}

Use lowercase tag values. Be specific and practical for music search APIs.`;
}

function validateVariant(variant: unknown): MusicTags | null {
  if (!variant || typeof variant !== 'object') return null;
  const v = variant as Record<string, unknown>;
  return {
    genres: Array.isArray(v.genres) ? v.genres.filter((g): g is string => typeof g === 'string') : [],
    instruments: Array.isArray(v.instruments) ? v.instruments.filter((g): g is string => typeof g === 'string') : [],
    vartags: Array.isArray(v.vartags) ? v.vartags.filter((g): g is string => typeof g === 'string') : [],
  };
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Generate 2-3 SearchQuery variants from a single intent.
 * Tries AI expansion; falls back to static synonym expansion.
 */
export async function generateQueryVariants(
  input: QueryGeneratorInput
): Promise<SearchQuery[]> {
  const { coreTags, implicitPreferences, explorationSeed } = input;

  // Query A: Precision (always static — just the core tags)
  const precisionQuery = toSearchQuery(coreTags);

  // Try AI-powered variants
  if (getApiKey()) {
    try {
      const variants = await callDeepSeek<AIVariantsResponse>(buildVariantPrompt(input));

      const recallTags = validateVariant(variants.recall) ?? buildStaticRecall(coreTags);
      const explorationTags =
        validateVariant(variants.exploration) ??
        buildStaticExploration(coreTags, implicitPreferences, explorationSeed);

      return [precisionQuery, toSearchQuery(recallTags), toSearchQuery(explorationTags)];
    } catch (error) {
      console.warn('[QueryGenerator] AI variant generation failed, using static:', error);
    }
  }

  // Fallback: static variants
  return [
    precisionQuery,
    toSearchQuery(buildStaticRecall(coreTags)),
    toSearchQuery(buildStaticExploration(coreTags, implicitPreferences, explorationSeed)),
  ];
}

