
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Trash2, Music, Download } from 'lucide-react';
import { Collection, MusicTrack } from '../../types';

interface CollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  collections: Collection[];
  onSaveCollections: (collections: Collection[]) => void;
  onPlayTrack: (track: MusicTrack) => void;
  currentTrack?: MusicTrack;
}

export const CollectionModal: React.FC<CollectionModalProps> = ({
  isOpen,
  onClose,
  collections,
  onSaveCollections,
  onPlayTrack,
  currentTrack: _currentTrack
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

  const handleRemoveTrack = (trackId: string) => {
    onSaveCollections([
      {
        ...collection,
        tracks: collection.tracks.filter((t) => t.id !== trackId),
        updatedAt: Date.now(),
      },
    ]);
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
        break;
    }
    return sorted;
  }, [collection.tracks, search, sortBy]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-neutral-900 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-white/10">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <Music className="w-6 h-6 text-purple-400" />
                  <h2 className="text-2xl font-bold text-white">Collection</h2>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-full hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5 text-neutral-400" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="mb-6 space-y-2">
                  <p className="text-xs text-neutral-400">Liked songs only</p>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter by title, artist, tags"
                    className="w-full px-4 py-2 rounded-full bg-white/5 border border-white/10 text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500/50"
                  />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'recent' | 'title' | 'artist' | 'duration')}
                    className="w-full px-4 py-2 rounded-full appearance-none bg-neutral-900/90 border border-white/10 text-sm text-neutral-200 focus:outline-none focus:border-purple-500/50"
                    style={{ colorScheme: 'dark' }}
                  >
                    <option value="recent" style={{ backgroundColor: '#0a0a0a', color: '#e5e5e5' }}>Sort: Recent</option>
                    <option value="title" style={{ backgroundColor: '#0a0a0a', color: '#e5e5e5' }}>Sort: Title</option>
                    <option value="artist" style={{ backgroundColor: '#0a0a0a', color: '#e5e5e5' }}>Sort: Artist</option>
                    <option value="duration" style={{ backgroundColor: '#0a0a0a', color: '#e5e5e5' }}>Sort: Duration</option>
                  </select>
                </div>

                {/* Collection list */}
                {collection.tracks.length === 0 ? (
                  <div className="text-center py-12 text-neutral-400">
                    <Music className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p>No liked songs yet</p>
                    <p className="text-sm mt-2">Tap the heart icon on a track card to add songs here</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                      <h3 className="text-lg font-semibold text-white">Collection</h3>
                      <p className="text-sm text-neutral-400 mt-1">
                        {visibleTracks.length} / {collection.tracks.length} tracks
                      </p>
                    </div>
                    {visibleTracks.map((track) => (
                      <div
                        key={track.id}
                        className="flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
                      >
                        {track.cover && (
                          <img
                            src={track.cover}
                            alt={track.title}
                            className="w-12 h-12 rounded-lg object-cover"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {track.title}
                          </p>
                          <p className="text-xs text-neutral-400 truncate">
                            {track.artist} • {formatDuration(track.duration)}
                          </p>
                          <p className="text-[10px] text-neutral-500 truncate">
                            {(track.tags || []).slice(0, 3).join(' • ') || 'No tags'}
                          </p>
                        </div>
                        <button
                          onClick={() => onPlayTrack(track)}
                          className="p-2 rounded-full hover:bg-purple-500/20 text-purple-400 transition-colors"
                          title="Play"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleRemoveTrack(track.id)}
                          className="p-2 rounded-full hover:bg-red-500/20 text-red-400 transition-colors"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDownload(track)}
                          disabled={!track.audiodownloadAllowed || !track.audiodownload}
                          className="p-2 rounded-full hover:bg-white/10 text-neutral-400 transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
                          title={track.audiodownloadAllowed ? 'Download' : 'Download not available'}
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
