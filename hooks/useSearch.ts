import { useState, useCallback } from 'react';
import { AnalysisResult, MusicTrack, Mood, MusicTags, UserPreferences } from '../types';
import { TAG_GROUPS } from '../constants';
import { analyzeInput } from '../services/deepseekService';
import { mapTagsWithAI, mergePreferences } from '../services/tagMappingService';
import { orchestratedSearch } from '../services/searchOrchestrator';

export interface SearchData {
  text: string;
  selectedTags: string[];
  mode: 'script' | 'keyword';
}

function classifySelectedTags(selectedTags: string[]) {
  return {
    genres: selectedTags.filter((tag) =>
      TAG_GROUPS.find((g) => g.category === 'genre')?.tags.includes(tag)
    ),
    moods: selectedTags.filter((tag) =>
      TAG_GROUPS.find((g) => g.category === 'mood')?.tags.includes(tag)
    ),
    themes: selectedTags.filter(
      (tag) =>
        !TAG_GROUPS.find((g) => g.category === 'genre')?.tags.includes(tag) &&
        !TAG_GROUPS.find((g) => g.category === 'mood')?.tags.includes(tag)
    ),
  };
}

function isMoodTag(tag: string): boolean {
  const moodTags = TAG_GROUPS.find((g) => g.category === 'mood')?.tags || [];
  const lowerTag = tag.toLowerCase();
  return (
    moodTags.some((t) => t.toLowerCase() === lowerTag) ||
    [
      'happy', 'sad', 'peaceful', 'energetic', 'calm', 'uplifting', 'relaxing',
      'exciting', 'romantic', 'melancholic', 'joyful', 'serene', 'intense',
    ].includes(lowerTag)
  );
}

function getRandomTags(
  originalTags: string[],
  allAvailableTags: string[],
  count: number,
  excludeUsed: Set<string>
): string[] {
  const available = allAvailableTags.filter(
    (tag) => !originalTags.includes(tag) && !excludeUsed.has(tag.toLowerCase())
  );
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

const ALL_GENRES = [
  'rock', 'electronic', 'jazz', 'classical', 'pop', 'hiphop', 'folk', 'blues',
  'reggae', 'metal', 'country', 'latin', 'world', 'ambient', 'chillhop', 'lofi',
];
const ALL_INSTRUMENTS = [
  'piano', 'guitar', 'strings', 'drums', 'bass', 'synthesizer', 'saxophone',
  'violin', 'cello', 'flute', 'trumpet', 'organ',
];

/** Build a free-text fallback from MusicTags for providers without tag support. */
function tagsToText(tags: MusicTags): string {
  const { genres = [], instruments = [], vartags = [] } = tags;
  return [...genres, ...instruments, ...vartags].join(' ');
}

export function useSearch(userPreferences: UserPreferences) {
  const [isLoading, setIsLoading] = useState(false);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [mood, setMood] = useState<Mood>('Neutral');
  const [lastSearchData, setLastSearchData] = useState<SearchData | null>(null);
  const [recommendedTrackIds, setRecommendedTrackIds] = useState<Set<string>>(new Set());

  const search = useCallback(
    async (data: SearchData) => {
      setIsLoading(true);
      setLastSearchData(data);
      try {
        let tags: MusicTags;
        let analysisResult: AnalysisResult;

        if (data.mode === 'keyword') {
          const classified = classifySelectedTags(data.selectedTags);
          if (data.text.trim()) {
            classified.themes.push(data.text.trim());
          }

          const mappedTags = await mapTagsWithAI(classified, userPreferences);
          tags = mergePreferences(mappedTags, userPreferences);

          const allKeywords = [...data.selectedTags, data.text].filter(Boolean);
          analysisResult = {
            contentType: 'Keyword Search',
            moods: classified.moods.length > 0 ? [classified.moods[0] as Mood] : ['Neutral'],
            instruments: mappedTags.instruments || [],
            energy: 'medium',
            keywords: allKeywords,
            summary: `Searching for: ${allKeywords.join(', ')}`,
            tags,
          };
        } else {
          // Script analysis mode
          const result = await analyzeInput(data.text, 'script', userPreferences, data.selectedTags);
          analysisResult = result;

          if (result.moods.length > 0) {
            setMood(result.moods[0]);
          }

          let aiTags = result.tags || {
            genres: result.keywords.slice(0, 3),
            instruments: result.instruments,
            vartags: [],
          };

          // Merge user-selected keyword tags with AI tags
          if (data.selectedTags.length > 0) {
            const classified = classifySelectedTags(data.selectedTags);
            const mappedUserTags = await mapTagsWithAI(classified, userPreferences);
            aiTags = {
              genres: [...(aiTags.genres || []), ...(mappedUserTags.genres || [])],
              instruments: [...(aiTags.instruments || []), ...(mappedUserTags.instruments || [])],
              vartags: [...(aiTags.vartags || []), ...(mappedUserTags.vartags || [])],
            };
          }

          tags = mergePreferences(aiTags, userPreferences);
        }

        setAnalysis(analysisResult);

        // ── Orchestrated multi-provider search ────────────────────────
        const foundTracks = await orchestratedSearch(
          { text: tagsToText(tags), tags, limit: 15 },
          { mergedLimit: 20, filterPlayable: true }
        );

        if (foundTracks.length > 0) {
          setRecommendedTrackIds(new Set(foundTracks.map((t) => t.id)));
        }
        setTracks(foundTracks);
      } catch (error) {
        console.error('Analysis/Search error:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [userPreferences]
  );

  const refresh = useCallback(async () => {
    if (!lastSearchData) return;
    setIsLoading(true);
    try {
      let originalTags: MusicTags = { genres: [], instruments: [], vartags: [] };

      if (lastSearchData.mode === 'keyword') {
        const classified = classifySelectedTags(lastSearchData.selectedTags);
        originalTags = await mapTagsWithAI(classified, userPreferences);
      } else {
        if (analysis?.tags) {
          originalTags = analysis.tags;
        } else {
          const result = await analyzeInput(
            lastSearchData.text,
            'script',
            userPreferences,
            lastSearchData.selectedTags
          );
          originalTags = result.tags || { genres: [], instruments: [], vartags: [] };
        }
      }

      // Keep mood tags, randomize genres and instruments
      const moodTags = (originalTags.vartags || []).filter((tag) => isMoodTag(tag));
      if (moodTags.length === 0 && originalTags.vartags && originalTags.vartags.length > 0) {
        moodTags.push(...originalTags.vartags);
      }

      const excludeUsed = new Set([
        ...(originalTags.genres || []).map((g) => g.toLowerCase()),
        ...(originalTags.instruments || []).map((i) => i.toLowerCase()),
      ]);

      const newGenres = getRandomTags(
        originalTags.genres || [],
        ALL_GENRES,
        Math.max(2, Math.floor(Math.random() * 3) + 1),
        excludeUsed
      );

      const newInstruments = getRandomTags(
        originalTags.instruments || [],
        ALL_INSTRUMENTS,
        Math.max(1, Math.floor(Math.random() * 2) + 1),
        excludeUsed
      );

      const newTags = mergePreferences(
        {
          genres: newGenres.length > 0 ? newGenres : (originalTags.genres || []).slice(0, 1),
          instruments: newInstruments.length > 0 ? newInstruments : (originalTags.instruments || []).slice(0, 1),
          vartags: moodTags.length > 0 ? moodTags : originalTags.vartags || [],
        },
        userPreferences
      );

      // ── Orchestrated refresh ──────────────────────────────────────
      const foundTracks = await orchestratedSearch(
        { text: tagsToText(newTags), tags: newTags, limit: 15 },
        { mergedLimit: 20, filterPlayable: true }
      );

      const newTracks = foundTracks.filter((track) => !recommendedTrackIds.has(track.id));

      if (newTracks.length > 0) {
        setRecommendedTrackIds(new Set([...recommendedTrackIds, ...newTracks.map((t) => t.id)]));
        setTracks(newTracks.slice(0, 10));
      } else {
        setRecommendedTrackIds(new Set());
        const allTracks = await orchestratedSearch(
          { text: tagsToText(newTags), tags: newTags, limit: 15 },
          { mergedLimit: 10, filterPlayable: true }
        );
        setTracks(allTracks);
        if (allTracks.length > 0) {
          setRecommendedTrackIds(new Set(allTracks.map((t) => t.id)));
        }
      }
    } catch (error) {
      console.error('Refresh search error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [lastSearchData, analysis, userPreferences, recommendedTrackIds]);

  return { isLoading, tracks, setTracks, analysis, mood, search, refresh };
}
