/**
 * DeepSeek analysis service — extracts structured BGM tags from user input.
 *
 * V2 enhancements:
 * - Added contentCategory field for content-type classification.
 * - Trend-aware prompts with TikTok/Douyin BGM pattern knowledge.
 * - Richer energy / mood extraction.
 */
import { AnalysisResult, UserPreferences, Mood, Energy } from '../types';
import { callDeepSeek, getApiKey } from './aiService';

interface DeepSeekAnalysisResponse {
  contentType?: string;
  contentCategory?: string;
  moods?: string[];
  instruments?: string[];
  energy?: string;
  keywords?: string[];
  summary?: string;
  tags?: {
    genres?: string[];
    instruments?: string[];
    vartags?: string[];
  };
}

export async function analyzeInput(
  text: string,
  mode: 'script' | 'keyword',
  userPreferences?: UserPreferences,
  selectedTags?: string[]
): Promise<AnalysisResult> {
  if (!getApiKey()) {
    console.error('DeepSeek API key not found');
    return getDefaultResult();
  }

  const prompt = buildAnalysisPrompt(text, mode, userPreferences, selectedTags);

  try {
    const result = await callDeepSeek<DeepSeekAnalysisResponse>(prompt);

    return {
      contentType: result.contentType || 'General',
      contentCategory: result.contentCategory || 'general',
      moods: Array.isArray(result.moods) ? result.moods as Mood[] : ['Neutral'],
      instruments: Array.isArray(result.instruments) ? result.instruments : [],
      energy: (result.energy || 'medium') as Energy,
      keywords: Array.isArray(result.keywords) ? result.keywords : [],
      summary: result.summary || 'AI analysis completed.',
      tags: result.tags || {
        genres: result.keywords?.slice(0, 3) || [],
        instruments: result.instruments || [],
        vartags: [],
      },
    };
  } catch (e) {
    console.error('DeepSeek analysis failed:', e);
    return getDefaultResult();
  }
}

// ─── Trend context (TikTok / Douyin BGM patterns) ───────────────────

const TREND_CONTEXT = `
## Trending BGM patterns by content type (based on TikTok / Douyin / social media trends):

- **Vlog / Lifestyle**: uplifting electronic, light acoustic, lo-fi, chillhop, ukulele, soft percussion. Typical 20-60s clips. Tags: vlog, uplifting, cheerful, light.
- **Knowledge sharing / Educational**: calm instrumental, piano ambient, minimal beats, gentle strings. Focus on non-distracting BGM. Tags: educational, calm, focused, ambient.
- **Food / Cooking**: playful ukulele, jazzy cafe, light percussion, acoustic guitar, bossa nova. Tags: food, playful, cozy, cafe.
- **Travel / Adventure**: cinematic, epic orchestral, upbeat electronic, world music, ethnic instruments. Tags: travel, adventure, cinematic, epic.
- **Fashion / Beauty**: trendy pop, edm drops, stylish electronic, modern R&B. Tags: fashion, trendy, stylish, cool.
- **Sports / Fitness**: high-energy EDM, hip-hop beats, trap, intense percussion. Tags: sport, energetic, powerful, intense.
- **Gaming / ACG**: synthwave, chiptune, electronic, epic orchestral, anime-style. Tags: gaming, retro, epic, digital.
- **Emotional / Story**: piano ballad, strings, cinematic ambient, melancholic, nostalgic. Tags: emotional, heartfelt, dramatic, sentimental.
- **Cute / Pet**: playful, light percussion, xylophone, music box, cheerful acoustic. Tags: cute, playful, adorable, light.
- **Transition / Effect**: short dramatic hits, whoosh, bass drop, riser. Tags: transition, impact, dramatic.

Use these patterns to bias tag selection toward what works well for the detected content type.`;

function buildAnalysisPrompt(
  text: string,
  mode: 'script' | 'keyword',
  userPreferences?: UserPreferences,
  selectedTags?: string[]
): string {
  let prompt = '';

  if (mode === 'script') {
    prompt = `You are a professional BGM (Background Music) consultant for video creators. Analyze the following video script and extract music tags for BGM recommendation.

${TREND_CONTEXT}

**Instructions:**
1. First, classify the content category (e.g., "vlog", "education", "food", "travel", "fashion", "sports", "gaming", "emotional", "cute", "transition", "general").
2. Then extract appropriate music tags influenced by the trending patterns for that content type.
3. Return genres (e.g., "lofi", "chillhop", "electronic", "jazz"), instruments (e.g., "piano", "guitar", "synthesizer"), and vartags/moods (e.g., "peaceful", "happy", "energetic", "calm", "uplifting").`;

    if (selectedTags && selectedTags.length > 0) {
      prompt += `\n\nUser selected keywords for reference: ${selectedTags.join(', ')}. Please consider these keywords when analyzing.`;
    }

    if (userPreferences) {
      prompt += `\n\nUser preferences: genres=${userPreferences.genres?.join(', ') || 'none'}, instruments=${userPreferences.instruments?.join(', ') || 'none'}, vartags=${userPreferences.vartags?.join(', ') || 'none'}. Please consider these preferences when generating tags.`;
    }

    prompt += `\n\nScript: "${text}"`;
  } else {
    prompt = `You are a professional BGM consultant. Given the keywords "${text}", extract structured BGM search tags including genres, instruments, and vartags (mood/emotion tags).

${TREND_CONTEXT}

If the keywords suggest a specific content type, bias the tags toward trending patterns for that type.`;

    if (userPreferences) {
      prompt += `\n\nUser preferences: genres=${userPreferences.genres?.join(', ') || 'none'}, instruments=${userPreferences.instruments?.join(', ') || 'none'}, vartags=${userPreferences.vartags?.join(', ') || 'none'}. Please consider these preferences.`;
    }
  }

  prompt += `\n\nReturn a JSON object with this exact structure:
{
  "contentType": "string (e.g., 'Vlog Script', 'Product Review', 'Tutorial')",
  "contentCategory": "string (one of: vlog, education, food, travel, fashion, sports, gaming, emotional, cute, transition, general)",
  "moods": ["Melancholy" | "Happy" | "Dynamic" | "Neutral"],
  "instruments": ["string"],
  "energy": "low" | "medium" | "high",
  "keywords": ["string (key descriptive words)"],
  "summary": "string (1-2 sentence summary)",
  "tags": {
    "genres": ["string (2-4 music genres)"],
    "instruments": ["string (1-3 instruments)"],
    "vartags": ["string (2-4 mood/scenario tags)"]
  }
}`;

  return prompt;
}

function getDefaultResult(): AnalysisResult {
  return {
    contentType: 'General',
    contentCategory: 'general',
    moods: ['Neutral'],
    instruments: ['Piano'],
    energy: 'medium',
    keywords: ['background music'],
    summary: 'AI analysis failed, returning defaults.',
    tags: {
      genres: ['ambient'],
      instruments: ['piano'],
      vartags: ['neutral'],
    },
  };
}
