import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Scene3D } from './components/visualizer/Scene3D';
import { SearchPanel } from './components/input/SearchPanel';
import { CentralPlayer } from './components/player/CentralPlayer';
import { PreferencesModal } from './components/settings/PreferencesModal';
import { CollectionModal } from './components/collection/CollectionModal';
import { CollectionSidebar } from './components/collection/CollectionSidebar';
import { useAudioAnalyzer } from './hooks/useAudioAnalyzer';
import { usePlayer } from './hooks/usePlayer';
import { useSearch, SearchData } from './hooks/useSearch';
import { useCollections } from './hooks/useCollections';
import { usePersistedState } from './hooks/usePersistedState';
import { UserPreferences, VisualizerTheme, MusicTrack } from './types';
import { ChevronLeft, Info, RefreshCw, Settings, Sparkles } from 'lucide-react';

const FAVORITES_COLLECTION_ID = 'favorites-default';
const SUPPORTED_THEMES: VisualizerTheme[] = ['halo', 'rainGlass', 'aurora'];

export const App: React.FC = () => {
  const [view, setView] = useState<'landing' | 'results'>('landing');
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [isCollectionModalOpen, setIsCollectionModalOpen] = useState(false);
  const [isCollectionSidebarOpen, setIsCollectionSidebarOpen] = useState(true);

  const [userPreferences, setUserPreferences] = usePersistedState<UserPreferences>(
    'bgm-hunter-preferences',
    {}
  );
  const [visualizerTheme, setVisualizerTheme] = usePersistedState<VisualizerTheme>(
    'bgm-hunter-visualizer-theme',
    'halo'
  );
  const [showGlow, setShowGlow] = usePersistedState('bgm-hunter-show-glow', false);

  const searchState = useSearch(userPreferences);
  const player = usePlayer(searchState.tracks);
  const collectionsState = useCollections();
  const audioStats = useAudioAnalyzer(player.audioRef);
  const activeTheme = SUPPORTED_THEMES.includes(visualizerTheme) ? visualizerTheme : 'halo';

  const collectionList = collectionsState.collections;
  const favoritesCollection = useMemo(() => {
    const existing = collectionList.find((c) => c.id === FAVORITES_COLLECTION_ID) ?? collectionList[0];
    return existing ?? {
      id: FAVORITES_COLLECTION_ID,
      name: 'Collection',
      tracks: [],
      createdAt: 0,
      updatedAt: 0,
    };
  }, [collectionList]);

  // Migrate legacy multi-collection data to a single "Collection" (liked tracks only).
  useEffect(() => {
    if (
      collectionList.length !== 1 ||
      collectionList[0]?.id !== FAVORITES_COLLECTION_ID ||
      collectionList[0]?.name !== 'Collection'
    ) {
      collectionsState.save([
        {
          ...favoritesCollection,
          id: FAVORITES_COLLECTION_ID,
          name: 'Collection',
          updatedAt: Date.now(),
        },
      ]);
    }
  }, [collectionList, collectionsState, favoritesCollection]);

  const handleSearch = async (data: SearchData) => {
    await searchState.search(data);
    player.setCurrentTrackIndex(0);
    player.setIsPlaying(false);
    setView('results');
  };

  const handleRefresh = async () => {
    player.setIsPlaying(false);
    await searchState.refresh();
    player.setCurrentTrackIndex(0);
  };

  const handlePlayTrack = (track: MusicTrack) => {
    const trackIndex = searchState.tracks.findIndex((t) => t.id === track.id);
    if (trackIndex !== -1) {
      player.setCurrentTrackIndex(trackIndex);
      player.setIsPlaying(true);
      } else {
      // Allow playing tracks from collections even if they are not in current search results.
      searchState.setTracks((prev) => [track, ...prev.filter((t) => t.id !== track.id)]);
      player.setCurrentTrackIndex(0);
      player.setIsPlaying(true);
    }
    setIsCollectionModalOpen(false);
    };

  const handleToggleFavorite = () => {
    const current = player.currentTrack;
    if (!current) return;
    const alreadyLiked = favoritesCollection.tracks.some((track) => track.id === current.id);
    const updatedTracks = alreadyLiked
      ? favoritesCollection.tracks.filter((track) => track.id !== current.id)
      : [...favoritesCollection.tracks, current];

    collectionsState.save([
      {
        ...favoritesCollection,
        id: FAVORITES_COLLECTION_ID,
        name: 'Collection',
        tracks: updatedTracks,
        updatedAt: Date.now(),
      },
    ]);
  };

  return (
    <div className="relative min-h-[100dvh] w-full flex flex-col selection:bg-purple-500 selection:text-white bg-black overflow-hidden">
      {/* 3D Background Visualizer */}
      <Scene3D stats={audioStats} mood={searchState.mood} theme={activeTheme} />

      {/* Audio Element — src and crossOrigin are managed by usePlayer */}
      <audio ref={player.audioRef} preload="auto" />

      {/* Header */}
      <header className="fixed top-0 left-0 w-full z-50 p-5 md:p-8 flex items-center justify-between">
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2.5"
        >
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-white flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.2)]">
            <Sparkles className="text-black w-5 h-5 md:w-6 md:h-6" />
          </div>
          <span className="text-lg md:text-xl font-bold tracking-tighter uppercase hidden sm:inline">
            BGM Hunter Pro
          </span>
          <span className="text-base font-bold tracking-tighter uppercase sm:hidden">BGM_HP</span>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 md:gap-4"
        >
          <button className="p-2 text-neutral-500 hover:text-white transition-colors bg-white/5 rounded-full">
            <Info className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsPreferencesOpen(true)}
            className="p-2 text-neutral-500 hover:text-white transition-colors bg-white/5 rounded-full"
          >
            <Settings className="w-5 h-5" />
          </button>
        </motion.div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4 md:p-6 z-10">
        <AnimatePresence mode="wait">
          {view === 'landing' ? (
            <motion.div
              key="landing"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02, filter: 'blur(10px)' }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
              className="w-full flex flex-col items-center gap-5 sm:gap-8 md:gap-12"
            >
              <div className="text-center px-4">
                <motion.h1 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-3xl sm:text-4xl md:text-7xl font-bold tracking-tighter mb-2 sm:mb-4 leading-tight"
                >
                  Perfect BGM, <br className="hidden md:block" />
                  <span className="text-white/30">Powered by AI.</span>
                </motion.h1>
                <motion.p 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-neutral-500 text-sm md:text-lg max-w-lg mx-auto leading-relaxed"
                >
                  Enter your video script or keywords. We'll search Jamendo's high-quality library to
                  find the perfect sonic match.
                </motion.p>
              </div>
              
              <SearchPanel onSearch={handleSearch} isLoading={searchState.isLoading} />
            </motion.div>
          ) : (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full h-full flex flex-col items-center justify-center pt-14 md:pt-20"
            >
              <button 
                onClick={() => {
                  player.setIsPlaying(false);
                  setView('landing');
                }}
                className="absolute top-20 left-4 md:top-24 md:left-8 group flex items-center gap-2 text-neutral-500 hover:text-white transition-colors text-sm font-medium z-50 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/5"
              >
                <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                Return
              </button>

              {/* Analysis Summary */}
              <div className="flex flex-col items-center gap-2 sm:gap-3 mb-3 sm:mb-6 md:mb-8 text-center max-w-xs md:max-w-md">
                <motion.span 
                  layoutId="mood-badge"
                  className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-[9px] md:text-[10px] uppercase tracking-[0.25em] text-purple-400 font-bold backdrop-blur-sm"
                >
                  {searchState.analysis?.moods[0] || 'Neutral'} Atmosphere
                </motion.span>
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-neutral-400 text-xs md:text-sm italic px-4 line-clamp-2"
                >
                  &ldquo;{searchState.analysis?.summary}&rdquo;
                </motion.p>
                {/* Tags display above the player */}
                {player.currentTrack && player.currentTrack.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 justify-center mt-2">
                    {player.currentTrack.tags.slice(0, 5).map((tag, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-[8px] md:text-[9px] uppercase tracking-wider text-neutral-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Player */}
              <CentralPlayer 
                tracks={searchState.tracks}
                currentTrackIndex={player.currentTrackIndex}
                onSelectTrack={(index) => {
                  player.setCurrentTrackIndex(index);
                  player.setIsPlaying(true);
                }}
                isPlaying={player.isPlaying}
                onTogglePlay={player.togglePlay}
                stats={audioStats}
                currentTime={player.currentTime}
                duration={player.duration}
                onSeek={player.seek}
                showGlow={showGlow}
                onToggleCollection={handleToggleFavorite}
                isInCollection={player.currentTrack ? collectionsState.isTrackInCollection(player.currentTrack.id) : false}
              />

              {/* Audio Error Message */}
              {player.audioError && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-4 px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 text-sm"
                >
                  {player.audioError}
                </motion.div>
              )}

              {/* Standalone Shuffle Button */}
              <button
                onClick={handleRefresh}
                className="mt-3 sm:mt-5 md:mt-7 px-4 py-2 sm:px-5 sm:py-2.5 rounded-full bg-white/5 border border-white/10 text-neutral-400 hover:text-white hover:border-white/30 transition-all text-xs md:text-sm flex items-center gap-2"
                    >
                <RefreshCw className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span>Shuffle</span>
                    </button>

            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {view === 'results' && (
        <CollectionSidebar
          isOpen={isCollectionSidebarOpen}
          onToggle={() => setIsCollectionSidebarOpen((prev) => !prev)}
          collections={[favoritesCollection]}
          onSaveCollections={collectionsState.save}
          onPlayTrack={handlePlayTrack}
          currentTrack={player.currentTrack}
        />
      )}

      {/* Status Bar */}
      <footer className="fixed bottom-0 left-0 w-full z-50 p-4 md:p-6 text-[9px] md:text-[10px] uppercase tracking-[0.2em] text-neutral-600 flex justify-between items-center pointer-events-none">
        <div className="bg-black/20 backdrop-blur-sm px-2 py-1 rounded">
          <span className="hidden md:inline">SYSTEM_STATUS: </span>
          <span className="text-neutral-400 font-bold">
            {searchState.isLoading ? 'ANALYZING...' : player.isPlaying ? 'STREAMING_HQ' : 'IDLE'}
          </span>
        </div>
        <div className="pointer-events-auto flex gap-3 md:gap-6 bg-black/20 backdrop-blur-sm px-2 py-1 rounded">
          <span className="opacity-40">
            <span className="hidden sm:inline">FREQ: </span>
            {Math.round(audioStats?.averageFrequency || 0)}
          </span>
          <span className="opacity-40 text-purple-500/80">JAMENDO_LIB</span>
        </div>
      </footer>

      {/* Scrollbar hide CSS */}
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Preferences Modal */}
      <PreferencesModal
        isOpen={isPreferencesOpen}
        onClose={() => setIsPreferencesOpen(false)}
        onSave={setUserPreferences}
        currentPreferences={userPreferences}
        visualizerTheme={activeTheme}
        onVisualizerThemeChange={setVisualizerTheme}
        showGlow={showGlow}
        onGlowToggle={setShowGlow}
      />

      {/* Collection Modal (mobile fallback only) */}
      <div className="md:hidden">
        <CollectionModal
          isOpen={isCollectionModalOpen}
          onClose={() => setIsCollectionModalOpen(false)}
          collections={[favoritesCollection]}
          onSaveCollections={collectionsState.save}
          onPlayTrack={handlePlayTrack}
          currentTrack={player.currentTrack || undefined}
        />
      </div>
    </div>
  );
};
