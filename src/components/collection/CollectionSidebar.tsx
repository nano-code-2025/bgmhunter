import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Heart, Music, Play, Trash2, Download } from 'lucide-react';
import { Collection, MusicTrack } from '../../types';

interface CollectionSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  collections: Collection[];
  currentTrack?: MusicTrack | null;
  onSaveCollections: (collections: Collection[]) => void;
  onPlayTrack: (track: MusicTrack) => void;
}

export const CollectionSidebar: React.FC<CollectionSidebarProps> = ({
  isOpen,
  onToggle,
  collections,
  onSaveCollections,
  onPlayTrack,
}) => {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'title' | 'artist' | 'duration'>('recent');
  const collection = collections[0] ?? {
    id: 'favorites-default',
    name: 'Collection',
    tracks: [],
    createdAt: 0,
    updatedAt: 0,
  };

  const visibleTracks = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const filtered = keyword
      ? collection.tracks.filter((track) => {
          const tagStr = (track.tags || []).join(' ').toLowerCase();
          return (
            track.title.toLowerCase().includes(keyword) ||
            track.artist.toLowerCase().includes(keyword) ||
            tagStr.includes(keyword)
          );
        })
      : collection.tracks;

    const sorted = [...filtered];
    switch (sortBy) {
      case 'title':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'artist':
        sorted.sort((a, b) => a.artist.localeCompare(b.artist));
        break;
      case 'duration':
        sorted.sort((a, b) => b.duration - a.duration);
        break;
      default:
        // "recent": keep insertion order
        break;
    }
    return sorted;
  }, [collection.tracks, search, sortBy]);

  const handleRemoveTrack = (trackId: string) => {
    onSaveCollections([
      {
        ...collection,
        tracks: collection.tracks.filter((track) => track.id !== trackId),
        updatedAt: Date.now(),
      },
    ]);
  };

  const handleDownload = (track: MusicTrack) => {
    if (!track.audiodownloadAllowed || !track.audiodownload) return;
    const link = document.createElement('a');
    link.href = track.audiodownload;
    link.download = `${track.title} - ${track.artist}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <aside
      className={`hidden md:flex fixed top-24 right-0 z-40 h-[calc(100dvh-7rem)] transition-transform duration-300 ${
        isOpen ? 'translate-x-0' : 'translate-x-[18rem]'
      }`}
    >
      <div className="h-full w-12 flex items-start justify-center pt-4">
        <button
          onClick={onToggle}
          className="h-10 w-10 rounded-l-xl rounded-r-none border border-r-0 border-white/15 bg-black/70 text-neutral-300 hover:text-white hover:border-white/30 transition-colors flex items-center justify-center"
          title={isOpen ? 'Collapse collections' : 'Open collections'}
        >
          {isOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <div className="h-full w-80 bg-black/75 backdrop-blur-md border border-white/10 rounded-l-2xl shadow-2xl flex flex-col">
        <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
          <Heart className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm uppercase tracking-[0.2em] text-neutral-300">Collection</h3>
        </div>

        <div className="p-4 border-b border-white/10 space-y-2">
          <p className="text-xs text-neutral-400">Liked songs only</p>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by title, artist, tags"
            className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white/25"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'recent' | 'title' | 'artist' | 'duration')}
            className="w-full px-3 py-2 rounded-lg appearance-none bg-neutral-900/90 border border-white/10 text-sm text-neutral-200 focus:outline-none focus:border-white/25"
            style={{ colorScheme: 'dark' }}
          >
            <option value="recent" style={{ backgroundColor: '#0a0a0a', color: '#e5e5e5' }}>Sort: Recent</option>
            <option value="title" style={{ backgroundColor: '#0a0a0a', color: '#e5e5e5' }}>Sort: Title</option>
            <option value="artist" style={{ backgroundColor: '#0a0a0a', color: '#e5e5e5' }}>Sort: Artist</option>
            <option value="duration" style={{ backgroundColor: '#0a0a0a', color: '#e5e5e5' }}>Sort: Duration</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {collection.tracks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-neutral-500 text-sm gap-2">
              <Music className="w-10 h-10 opacity-40" />
              <p>No liked songs yet</p>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="px-3 py-2 border-b border-white/10">
                <p className="text-sm font-medium text-white">Collection</p>
                <p className="text-[11px] text-neutral-500">
                  {visibleTracks.length} / {collection.tracks.length} tracks
                </p>
              </div>

              <div className="max-h-[70vh] overflow-y-auto">
                {visibleTracks.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-neutral-500">No tracks match this filter</p>
                ) : (
                  visibleTracks.map((track) => (
                    <div key={track.id} className="px-3 py-3 border-b border-white/5 hover:bg-white/5">
                      <div className="flex items-start gap-2">
                        <button
                          onClick={() => onPlayTrack(track)}
                          className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
                          title="Play"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white truncate">{track.title}</p>
                          <p className="text-[11px] text-neutral-400 truncate">
                            {track.artist} • {Math.floor(track.duration / 60)}:{String(track.duration % 60).padStart(2, '0')}
                          </p>
                          <p className="text-[10px] text-neutral-500 truncate">
                            {(track.tags || []).slice(0, 3).join(' • ') || 'No tags'}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRemoveTrack(track.id)}
                          className="p-1.5 rounded-md text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDownload(track)}
                          disabled={!track.audiodownloadAllowed || !track.audiodownload}
                          className="p-1.5 rounded-md text-neutral-500 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
                          title={track.audiodownloadAllowed ? 'Download' : 'Download not available'}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

