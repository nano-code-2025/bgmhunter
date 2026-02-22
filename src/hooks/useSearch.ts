/**
 * useSearch V2 — search and refresh hook wired to the V2 orchestrator.
 *
 * Simplified flow:
 * 1. Extract intent (AI for scripts, tag mapping for keywords).
 * 2. Delegate to orchestratedSearch (which handles multi-query, multi-provider,
 *    ranking, diversity, and session memory internally).
 * 3. Refresh = re-run orchestrator with incremented exploration seed.
 */
import { useState, useCallback } from 'react';
import { AnalysisResult, MusicTrack, Mood, MusicTags, UserPreferences } from '../types';
import { TAG_GROUPS } from '../constants';
import { analyzeInput } from '../services/deepseekService';
import { mapTagsWithAI, mergePreferences } from '../services/tagMappingService';
import { orchestratedSearch } from '../services/searchOrchestrator';
import { extractImplicitPreferences } from '../services/implicitPreferences';
import { sessionMemory } from '../services/sessionMemory';

export interface SearchData {
  text: string;
  selectedTags: string[];
  mode: 'script' | 'keyword';
}

// ─── Tag classification helpers ─────────────────────────────────────

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

function tagsToText(tags: MusicTags): string {
  const { genres = [], instruments = [], vartags = [] } = tags;
  return [...genres, ...instruments, ...vartags].join(' ');
}

// ─── Hook ───────────────────────────────────────────────────────────

export function useSearch(userPreferences: UserPreferences) {
  const [isLoading, setIsLoading] = useState(false);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [mood, setMood] = useState<Mood>('Neutral');
  const [lastSearchData, setLastSearchData] = useState<SearchData | null>(null);
  const [lastCoreTags, setLastCoreTags] = useState<MusicTags | null>(null);

  /** Main search: extract intent → orchestrated search. */
  const search = useCallback(
    async (data: SearchData) => {
      setIsLoading(true);
      setLastSearchData(data);
      try {
        let tags: MusicTags;
        let analysisResult: AnalysisResult;

        // ── Intent extraction ─────────────────────────────────────
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
        setLastCoreTags(tags);

        // ── V2 Orchestrated multi-provider search ─────────────────
        const implicitPrefs = extractImplicitPreferences();

        const foundTracks = await orchestratedSearch(
          { text: tagsToText(tags), tags, limit: 15 },
          {
            mergedLimit: 20,
            filterPlayable: true,
            mode: data.mode,
            explicitPreferences: userPreferences,
            implicitPreferences: implicitPrefs,
          }
        );

        setTracks(foundTracks);
      } catch (error) {
        console.error('Analysis/Search error:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [userPreferences]
  );

  /**
   * Refresh V2: re-run orchestrator with incremented exploration seed.
   * The query generator will produce new variants, and session memory
   * penalises previously shown tracks — no random tag mutation needed.
   */
  const refresh = useCallback(async () => {
    if (!lastSearchData || !lastCoreTags) return;
    setIsLoading(true);
    try {
      const implicitPrefs = extractImplicitPreferences();
      const seed = sessionMemory.nextRefreshSeed();

      // First attempt: standard orchestrated search with new seed
      let foundTracks = await orchestratedSearch(
        { text: tagsToText(lastCoreTags), tags: lastCoreTags, limit: 15 },
        {
          mergedLimit: 20,
          filterPlayable: true,
          mode: lastSearchData.mode,
          explicitPreferences: userPreferences,
          implicitPreferences: implicitPrefs,
        }
      );

      // Check novelty: at least 60% should be tracks not in current list
      const currentIds = new Set(tracks.map((t) => t.id));
      const novelTracks = foundTracks.filter((t) => !currentIds.has(t.id));
      const noveltyRatio = foundTracks.length > 0
        ? novelTracks.length / foundTracks.length
        : 0;

      if (noveltyRatio < 0.6 && foundTracks.length > 0) {
        // Retry with broader tags: drop specific genres, keep mood/vartags
        console.log(`[useSearch] Low novelty (${(noveltyRatio * 100).toFixed(0)}%), broadening query…`);
        const broaderTags: MusicTags = {
          genres: [], // Drop genre constraints entirely
          instruments: lastCoreTags.instruments || [],
          vartags: lastCoreTags.vartags || [],
        };

        const broaderResults = await orchestratedSearch(
          { text: tagsToText(broaderTags), tags: broaderTags, limit: 15 },
          {
            mergedLimit: 20,
            filterPlayable: true,
            mode: lastSearchData.mode,
            explicitPreferences: userPreferences,
            implicitPreferences: implicitPrefs,
          }
        );

        // Merge: prefer novel tracks from both attempts
        const allCandidates = [...novelTracks, ...broaderResults.filter((t) => !currentIds.has(t.id))];
        const seen = new Set<string>();
        const merged: MusicTrack[] = [];
        for (const t of allCandidates) {
          if (!seen.has(t.id)) {
            seen.add(t.id);
            merged.push(t);
          }
        }
        foundTracks = merged.length > 0 ? merged.slice(0, 10) : foundTracks;
      }

      setTracks(foundTracks);
    } catch (error) {
      console.error('Refresh search error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [lastSearchData, lastCoreTags, userPreferences, tracks]);

  return { isLoading, tracks, setTracks, analysis, mood, search, refresh };
}
