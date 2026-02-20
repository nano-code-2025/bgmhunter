/**
 * Tag Mapping Service — converts user-selected UI tags to structured
 * music search tags (genres, instruments, vartags).
 *
 * V2: Provider-agnostic. No Jamendo-specific language.
 * Each provider's search() method handles its own API-specific conversion.
 */
import { MusicTags, UserPreferences } from '../types';
import { callDeepSeek, getApiKey } from './aiService';
import tagMapping from '../data/tag_mapping.json';

export interface UserSelectedTags {
  genres?: string[];
  moods?: string[];
  themes?: string[];
  duration?: string[];
}

interface TagMappingData {
  mappings: {
    genres: Record<string, string[]>;
    moods: Record<string, string[]>;
    themes: Record<string, string[]>;
  };
}

const typedTagMapping = tagMapping as TagMappingData;

/** Map user-selected tags to structured music tags using AI. */
export async function mapTagsWithAI(
  userTags: UserSelectedTags,
  userPreferences?: UserPreferences
): Promise<MusicTags> {
  if (!getApiKey()) {
    console.warn('DeepSeek API key not set, using static mapping');
    return mapTagsStatic(userTags);
  }

  try {
    const prompt = buildMappingPrompt(userTags, userPreferences);
    const result = await callDeepSeek<MusicTags>(prompt);

    return {
      genres: Array.isArray(result.genres) ? result.genres : [],
      instruments: Array.isArray(result.instruments) ? result.instruments : [],
      vartags: Array.isArray(result.vartags) ? result.vartags : [],
    };
  } catch (error) {
    console.error('AI mapping failed, falling back to static mapping:', error);
    return mapTagsStatic(userTags);
  }
}

/** Static tag mapping fallback (no AI needed). */
export function mapTagsStatic(userTags: UserSelectedTags): MusicTags {
  const result: MusicTags = {
    genres: [],
    instruments: [],
    vartags: [],
  };

  const { mappings } = typedTagMapping;

  if (userTags.genres) {
    for (const genre of userTags.genres) {
      const mapped = mappings.genres[genre] || [genre.toLowerCase()];
      result.genres!.push(...mapped);
    }
  }

  if (userTags.moods) {
    for (const mood of userTags.moods) {
      const mapped = mappings.moods[mood] || [mood.toLowerCase()];
      result.vartags!.push(...mapped);
    }
  }

  if (userTags.themes) {
    for (const theme of userTags.themes) {
      const mapped = mappings.themes[theme] || [theme.toLowerCase()];
      result.vartags!.push(...mapped);
    }
  }

  result.genres = [...new Set(result.genres)];
  result.vartags = [...new Set(result.vartags)];

  return result;
}

/** Merge user preferences into tags. */
export function mergePreferences(
  tags: MusicTags,
  preferences?: UserPreferences
): MusicTags {
  if (!preferences) return tags;

  return {
    genres: [...(tags.genres || []), ...(preferences.genres || [])],
    instruments: [...(tags.instruments || []), ...(preferences.instruments || [])],
    vartags: [...(tags.vartags || []), ...(preferences.vartags || [])],
  };
}

function buildMappingPrompt(
  userTags: UserSelectedTags,
  userPreferences?: UserPreferences
): string {
  return `Convert the following user-selected music tags into structured music search tags.

User selected tags:
- Genres: ${userTags.genres?.join(', ') || 'none'}
- Moods: ${userTags.moods?.join(', ') || 'none'}
- Themes: ${userTags.themes?.join(', ') || 'none'}
${userTags.duration ? `- Duration: ${userTags.duration.join(', ')}` : ''}

${userPreferences ? `User preferences (apply these to enhance the mapping):
- Preferred genres: ${userPreferences.genres?.join(', ') || 'none'}
- Preferred instruments: ${userPreferences.instruments?.join(', ') || 'none'}
- Preferred scenarios: ${userPreferences.vartags?.join(', ') || 'none'}
` : ''}

Map these to three categories of music search tags:
1. genres: Music styles/types (e.g., "rock", "pop", "electronic", "jazz", "classical", "hiphop", "ambient", "lofi", "chillout", "chillhop", "downtempo", "synthwave")
2. instruments: Musical instruments (e.g., "piano", "guitar", "strings", "synthesizer", "drums", "violin", "ukulele", "saxophone")
3. vartags: Mood/emotion/scenario tags (e.g., "happy", "sad", "energetic", "calm", "romantic", "peaceful", "uplifting", "cinematic", "vlog", "sport", "travel", "cozy", "epic")

Return a JSON object:
{
  "genres": ["string"],
  "instruments": ["string"],
  "vartags": ["string"]
}

Use lowercase tag values. Be specific and practical — these tags will be used as free-text search keywords across multiple music APIs.`;
}
