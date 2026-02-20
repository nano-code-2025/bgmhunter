/**
 * JamendoProvider — adapter wrapping the Jamendo API behind the MusicProvider interface.
 *
 * Capabilities:
 * - Full-length audio playback (previewUrl = full track stream)
 * - CC-licensed downloads (audiodownload)
 * - Tag-based structured search
 */
import {
  MusicTrack,
  MusicProvider,
  SearchQuery,
  SearchOptions,
  MusicTags,
} from '../../types';

const CLIENT_ID = 'f2567443';
const BASE_URL = 'https://api.jamendo.com/v3.0';

// ─── Internal Jamendo response types ────────────────────────────────
interface JamendoMusicInfo {
  tags?: {
    genres?: string[];
    instruments?: string[];
    vartags?: string[];
  };
}

interface JamendoTrackResponse {
  id: number;
  name: string;
  artist_name: string;
  duration: number;
  audio: string;
  shareurl?: string;
  license_ccurl?: string;
  image?: string;
  album_image?: string;
  audiodownload?: string;
  audiodownload_allowed?: boolean;
  position?: number;
  releasedate?: string;
  musicinfo?: JamendoMusicInfo;
}

interface JamendoApiResponse {
  results?: JamendoTrackResponse[];
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Build a flat search string from structured tags. */
function tagsToQuery(tags?: MusicTags): string {
  if (!tags) return '';
  const { genres = [], instruments = [], vartags = [] } = tags;
  return [...genres, ...instruments, ...vartags].join(' ');
}

/** Map a Jamendo raw track to the unified MusicTrack shape. */
function mapTrack(raw: JamendoTrackResponse): MusicTrack {
  const musicinfo = raw.musicinfo || {};
  const tags = musicinfo.tags || {};
  const allTags = [
    ...(tags.genres || []),
    ...(tags.instruments || []),
    ...(tags.vartags || []),
  ];

  return {
    id: `jamendo-${raw.id}`,
    title: raw.name,
    artist: raw.artist_name,
    duration: raw.duration,
    previewUrl: raw.audio,
    sourceUrl: raw.shareurl || '#',
    license: raw.license_ccurl || 'CC',
    tags: allTags,
    cover:
      raw.image ||
      raw.album_image ||
      `https://picsum.photos/seed/${raw.id}/400/400`,
    bpm: 0,
    audiodownload: raw.audiodownload,
    audiodownloadAllowed: raw.audiodownload_allowed || false,
    position: raw.position,
    releasedate: raw.releasedate,
    // Provider metadata
    provider: 'jamendo',
    playbackType: 'full',
    popularity: undefined, // Jamendo doesn't expose a normalised score
  };
}

// ─── Provider implementation ────────────────────────────────────────

export const jamendoProvider: MusicProvider = {
  name: 'jamendo',

  async search(
    query: SearchQuery,
    options: SearchOptions = {}
  ): Promise<MusicTrack[]> {
    const { filterPlayable = true } = options;
    const limit = query.limit ?? 15;

    const url = new URL(`${BASE_URL}/tracks/`);
    url.searchParams.set('client_id', CLIENT_ID);
    url.searchParams.set('format', 'json');
    // Fetch more when filtering so enough candidates pass
    const fetchLimit = filterPlayable ? Math.min(limit * 3, 50) : limit;
    url.searchParams.set('limit', fetchLimit.toString());
    url.searchParams.set('include', 'musicinfo');
    url.searchParams.set('orderby', 'popularity_total_desc');

    // Prefer structured tags; fall back to free-text
    const searchText = tagsToQuery(query.tags) || query.text;
    url.searchParams.set('search', searchText);

    try {
      const response = await fetch(url.toString());
      const data: JamendoApiResponse = await response.json();
      if (!data.results) return [];

      let tracks = data.results.map(mapTrack);

      if (filterPlayable) {
        tracks = tracks.filter(
          (t) => t.audiodownloadAllowed && t.audiodownload && t.previewUrl
        );
      }

      return tracks.slice(0, limit);
    } catch (error) {
      console.error('[JamendoProvider] search failed:', error);
      return [];
    }
  },
};

