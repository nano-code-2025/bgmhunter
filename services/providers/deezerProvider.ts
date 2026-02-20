/**
 * DeezerProvider — adapter wrapping the Deezer public API behind the MusicProvider interface.
 *
 * Capabilities:
 * - 30-second MP3 preview (direct URL, CORS `*` on CDN)
 * - 73M+ track catalog
 * - No authentication required
 *
 * CORS note:
 * - Search API (`api.deezer.com`) does NOT return CORS headers → proxied via Vite / edge function.
 * - Preview audio CDN (`cdnt-preview.dzcdn.net`) returns `Access-Control-Allow-Origin: *` → <audio> OK.
 */
import {
  MusicTrack,
  MusicProvider,
  SearchQuery,
  SearchOptions,
  MusicTags,
} from '../../types';

// In dev we use the Vite proxy to bypass CORS; in production use your own proxy URL.
const DEEZER_BASE =
  import.meta.env.VITE_DEEZER_PROXY_URL || '/api/deezer';

// ─── Internal Deezer response types ─────────────────────────────────

interface DeezerArtist {
  id: number;
  name: string;
  picture_xl?: string;
}

interface DeezerAlbum {
  id: number;
  title: string;
  cover_xl?: string;
  cover_big?: string;
  cover_medium?: string;
}

interface DeezerTrackResponse {
  id: number;
  title: string;
  duration: number;      // seconds
  rank: number;          // Deezer popularity rank (higher = more popular)
  preview: string;       // 30s MP3 direct URL
  artist: DeezerArtist;
  album: DeezerAlbum;
  link?: string;         // Deezer track page
}

interface DeezerSearchResponse {
  data?: DeezerTrackResponse[];
  total?: number;
  error?: { type: string; message: string };
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Build a search string from structured tags. */
function tagsToQuery(tags?: MusicTags): string {
  if (!tags) return '';
  const { genres = [], instruments = [], vartags = [] } = tags;
  return [...genres, ...instruments, ...vartags].join(' ');
}

/**
 * Normalise Deezer rank (typically 0–1_000_000+) to 0-100.
 * Top hits are ~900k+, obscure tracks ~10k.
 */
function normalisePopularity(rank: number): number {
  // Clamp to [0, 1_000_000], then map linearly to 0-100
  const clamped = Math.max(0, Math.min(rank, 1_000_000));
  return Math.round((clamped / 1_000_000) * 100);
}

/** Map a Deezer raw track to the unified MusicTrack shape. */
function mapTrack(raw: DeezerTrackResponse): MusicTrack {
  return {
    id: `deezer-${raw.id}`,
    title: raw.title,
    artist: raw.artist.name,
    duration: raw.duration,
    previewUrl: raw.preview,
    sourceUrl: raw.link || `https://www.deezer.com/track/${raw.id}`,
    license: 'Deezer Preview',
    tags: [],                      // Deezer basic search doesn't return tags
    cover:
      raw.album.cover_xl ||
      raw.album.cover_big ||
      raw.album.cover_medium ||
      '',
    bpm: 0,
    audiodownload: undefined,      // Not downloadable
    audiodownloadAllowed: false,
    position: undefined,
    releasedate: undefined,
    // Provider metadata
    provider: 'deezer',
    playbackType: 'preview-30s',
    popularity: normalisePopularity(raw.rank),
  };
}

// ─── Provider implementation ────────────────────────────────────────

export const deezerProvider: MusicProvider = {
  name: 'deezer',

  async search(
    query: SearchQuery,
    options: SearchOptions = {}
  ): Promise<MusicTrack[]> {
    const { filterPlayable = true } = options;
    const limit = query.limit ?? 15;

    // Prefer structured tags → joined string; fall back to free-text
    const searchText = tagsToQuery(query.tags) || query.text;
    if (!searchText.trim()) return [];

    const url = new URL(`${DEEZER_BASE}/search`);
    url.searchParams.set('q', searchText);
    url.searchParams.set('limit', limit.toString());

    try {
      const response = await fetch(url.toString());
      const data: DeezerSearchResponse = await response.json();

      if (data.error) {
        console.warn('[DeezerProvider] API error:', data.error.message);
        return [];
      }
      if (!data.data) return [];

      let tracks = data.data.map(mapTrack);

      if (filterPlayable) {
        tracks = tracks.filter((t) => !!t.previewUrl);
      }

      return tracks.slice(0, limit);
    } catch (error) {
      console.error('[DeezerProvider] search failed:', error);
      return [];
    }
  },
};

