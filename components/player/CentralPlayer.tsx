
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, PanInfo, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Play, Pause, Music, Heart, Download, Copy, Share2 } from 'lucide-react';
import { MusicTrack, AudioStats } from '../../types';

interface PlayerProps {
  tracks: MusicTrack[];
  currentTrackIndex: number;
  onSelectTrack: (index: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  stats: AudioStats | null;
  currentTime?: number;
  duration?: number;
  onSeek?: (time: number) => void;
  showGlow?: boolean;
  onToggleCollection?: () => void;
  isInCollection?: boolean;
}

export const CentralPlayer: React.FC<PlayerProps> = ({ 
  tracks,
  currentTrackIndex,
  onSelectTrack,
  isPlaying, 
  onTogglePlay, 
  stats,
  currentTime = 0,
  duration = 0,
  onSeek,
  showGlow = false,
  onToggleCollection,
  isInCollection = false
}) => {
  const track = tracks[currentTrackIndex] || null;
  const progressBarRef = useRef<HTMLDivElement>(null);
  const carouselStageRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window === 'undefined' ? 1024 : window.innerWidth
  );
  const [stageWidth, setStageWidth] = useState<number>(0);

  const mouseXSpring = useSpring(x);
  const mouseYSpring = useSpring(y);

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["10deg", "-10deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-10deg", "10deg"]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;
    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  // Enhanced Audio Reactive Values
  const bassIntensity = stats ? stats.bass / 255 : 0;
  const trebleIntensity = stats ? stats.treble / 255 : 0;
  
  // Calculate a dynamic HSL color based on treble
  // Base hue is 270 (purple), shifting towards 320 (pink/red) with high treble
  const dynamicGlowColor = useMemo(() => {
    const hue = 260 + (trebleIntensity * 60);
    return `hsla(${hue}, 80%, 60%, ${0.3 + bassIntensity * 0.7})`;
  }, [trebleIntensity, bassIntensity]);

  // Glow shadow style based on bass
  const glowShadow = useMemo(() => {
    const blur = 20 + (bassIntensity * 60);
    const spread = 5 + (bassIntensity * 30);
    return `0 0 ${blur}px ${spread}px ${dynamicGlowColor}`;
  }, [bassIntensity, dynamicGlowColor]);

  // Format time helper
  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Card widths must match Tailwind classes:
  // <640: w-[14rem]=224  sm(640+): w-[16rem]=256  md(768+): w-[18rem]=288  lg(1024+): w-[20rem]=320
  const getCardMetrics = (width: number) => {
    if (width >= 1024) return { cardWidth: 320, gap: 24 };
    if (width >= 768) return { cardWidth: 288, gap: 20 };
    if (width >= 640) return { cardWidth: 256, gap: 16 };
    return { cardWidth: 224, gap: 12 };
  };

  const { cardWidth, gap } = getCardMetrics(viewportWidth);
  const cardSpacing = cardWidth + gap;

  useEffect(() => {
    const updateLayout = () => {
      setViewportWidth(window.innerWidth);
      if (carouselStageRef.current) {
        setStageWidth(carouselStageRef.current.clientWidth);
      }
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  // Progress percentage
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Handle progress bar click
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek || !duration || !progressBarRef.current) return;
    
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percent * duration;
    onSeek(newTime);
  };

  const handleDownload = (item: MusicTrack) => {
    if (!item.audiodownloadAllowed || !item.audiodownload) return;
    const link = document.createElement('a');
    link.href = item.audiodownload;
    link.download = `${item.title} - ${item.artist}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyTrackInfo = async (item: MusicTrack) => {
    const text = `${item.title} - ${item.artist}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      console.warn('Clipboard write failed');
    }
  };

  const handleShareTrack = async (item: MusicTrack) => {
    const shareUrl = item.sourceUrl || item.previewUrl;
    const payload = {
      title: `${item.title} - ${item.artist}`,
      text: `Listen: ${item.title} - ${item.artist}`,
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(payload);
      } else {
        await navigator.clipboard.writeText(shareUrl);
      }
    } catch {
      console.warn('Share cancelled or unavailable');
    }
  };

  if (!track) return null;

  const centerOffset = stageWidth > 0 ? stageWidth / 2 - cardWidth / 2 : 0;
  const targetX = centerOffset - currentTrackIndex * cardSpacing;

  const handleCarouselDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = Math.min(120, cardSpacing * 0.2);
    const velocityThreshold = 450;

    if (info.offset.x < -threshold || info.velocity.x < -velocityThreshold) {
      onSelectTrack(Math.min(currentTrackIndex + 1, tracks.length - 1));
      return;
    }
    if (info.offset.x > threshold || info.velocity.x > velocityThreshold) {
      onSelectTrack(Math.max(currentTrackIndex - 1, 0));
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full">
      <div ref={carouselStageRef} className="relative w-[96vw] overflow-hidden">
        {/* Edge fades — hidden on mobile to avoid black-border artifacts, subtle on desktop */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-16 md:w-24 bg-gradient-to-r from-black/25 to-transparent hidden sm:block" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-16 md:w-24 bg-gradient-to-l from-black/25 to-transparent hidden sm:block" />
        <motion.div
          className="flex items-center py-2"
          style={{ gap: `${gap}px` }}
          animate={{ x: targetX }}
          transition={{ type: 'spring', stiffness: 170, damping: 28, mass: 0.8 }}
          drag="x"
          dragConstraints={{ left: targetX - cardSpacing * 0.8, right: targetX + cardSpacing * 0.8 }}
          dragElastic={0.2}
          dragMomentum={false}
          onDragEnd={handleCarouselDragEnd}
        >
          {tracks.map((item, index) => {
            const isActive = index === currentTrackIndex;
            const distance = Math.abs(index - currentTrackIndex);
            const scale = isActive ? 1 : Math.max(0.76, 1 - distance * 0.09);
            const opacity = isActive ? 1 : Math.max(0.2, 1 - distance * 0.32);
            const blur = isActive ? 0 : Math.min(1.6, distance * 0.8);

            return (
      <motion.div
                key={item.id}
                onClick={() => {
                  if (!isActive) {
                    onSelectTrack(index);
                  }
                }}
        style={{
                  scale,
                  opacity,
                  rotateX: isActive ? rotateX : '0deg',
                  rotateY: isActive ? rotateY : '0deg',
                  filter: `blur(${blur}px)`,
                  transformStyle: 'preserve-3d',
        }}
                onMouseMove={isActive ? handleMouseMove : undefined}
                onMouseLeave={isActive ? handleMouseLeave : undefined}
                className={`relative h-[20rem] w-[14rem] sm:h-[24rem] sm:w-[16rem] md:h-[28rem] md:w-[18rem] lg:h-[30rem] lg:w-[20rem] rounded-[2rem] sm:rounded-[2.5rem] glass p-3 sm:p-4 md:p-6 flex-shrink-0 flex flex-col items-center justify-between group shadow-2xl transition-all duration-200 ${
                  isActive ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                }`}
      >
        {/* Cover Art with audio reactive border and glow */}
        <div 
          className="relative w-full aspect-square rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl transition-all duration-100 ease-out"
          style={{ 
                    boxShadow: isActive && showGlow ? glowShadow : 'none',
                    transform: isActive ? `translateZ(60px) scale(${1 + (bassIntensity * 0.05)})` : 'translateZ(20px)',
                    border: isActive && showGlow
                      ? `1px solid hsla(${260 + (trebleIntensity * 60)}, 80%, 60%, 0.3)`
                      : '1px solid rgba(255,255,255,0.1)'
          }}
        >
                  {item.cover ? (
                    <img src={item.cover} alt={item.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-neutral-900 flex items-center justify-center">
              <Music className="w-16 h-16 text-neutral-700" />
            </div>
          )}
          
          {/* Inner Light Overlay */}
          <div className="absolute inset-0 bg-gradient-to-tr from-black/20 to-transparent pointer-events-none" />

                  {/* Provider badge + playback type (top-left) */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10">
                    {item.provider && item.provider !== 'jamendo' && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-black/55 border border-white/15 text-neutral-300 backdrop-blur-sm">
                        {item.provider}
                      </span>
                    )}
                    {item.playbackType === 'preview-30s' && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/80 text-black tracking-wider">
                        30s
                      </span>
                    )}
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleShareTrack(item);
                    }}
                    className="absolute top-3 right-3 p-2 rounded-full bg-black/45 border border-white/10 text-neutral-300 hover:text-white hover:border-white/30 transition-colors"
                    title="Share track link"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
        </div>

        {/* Text Info */}
                <div className="w-full text-center mt-2 sm:mt-4 md:mt-6" style={{ transform: isActive ? 'translateZ(40px)' : 'translateZ(16px)' }}>
          <motion.h2 
                    className="text-base sm:text-lg md:text-xl font-bold tracking-tight text-white line-clamp-1"
                    animate={{ scale: isActive ? 1 + (bassIntensity * 0.02) : 1 }}
          >
                    {item.title}
          </motion.h2>
                  <p className="text-neutral-400 text-[10px] sm:text-xs md:text-sm mt-0.5 sm:mt-1 line-clamp-1">{item.artist}</p>
        </div>

                {isActive ? (
                  <>
        {/* Controls */}
                    <div className="flex items-center gap-4 sm:gap-6 mt-2 sm:mt-4" style={{ transform: 'translateZ(50px)' }}>
          <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onTogglePlay();
                        }}
            className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 active:scale-90 transition-all shadow-xl"
            style={{
              boxShadow: `0 0 ${15 + bassIntensity * 20}px rgba(255,255,255,${0.3 + bassIntensity})`
            }}
          >
            {isPlaying ? <Pause className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 fill-current" /> : <Play className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 fill-current ml-0.5 sm:ml-1" />}
          </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(item);
                        }}
                        disabled={!item.audiodownloadAllowed || !item.audiodownload}
                        className="text-neutral-500 hover:text-white transition-colors active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed"
                        title={item.audiodownloadAllowed ? 'Download' : 'Download not available'}
                      >
                        <Download className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleCopyTrackInfo(item);
                        }}
                        className="text-neutral-500 hover:text-white transition-colors active:scale-90"
                        title="Copy track info"
                      >
                        <Copy className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />
                      </button>

                      {onToggleCollection && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleCollection();
                          }}
                          className={`transition-colors active:scale-90 ${
                            isInCollection 
                              ? 'text-red-400 hover:text-red-300' 
                              : 'text-neutral-500 hover:text-white'
                          }`}
                          title={isInCollection ? 'In collection' : 'Add to collection'}
                        >
                          <Heart className={`w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 ${isInCollection ? 'fill-current' : ''}`} />
          </button>
                      )}
        </div>

                    {/* Progress Bar */}
                    <div className="w-full mt-2 sm:mt-4" style={{ transform: 'translateZ(40px)' }}>
                      <div 
                        ref={progressBarRef}
                        onClick={handleProgressClick}
                        className="w-full h-1.5 bg-white/10 rounded-full cursor-pointer group relative"
                      >
                        <motion.div
                          className="h-full bg-white rounded-full relative"
                          style={{ width: `${progressPercent}%` }}
                          transition={{ duration: 0.1 }}
                        >
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                        </motion.div>
                      </div>
                      <div className="flex justify-between text-[10px] md:text-xs text-neutral-500 mt-1.5">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                      </div>
        </div>

                  </>
                ) : (
                  <div className="h-5 mt-4" />
                )}
              </motion.div>
            );
          })}
      </motion.div>
      </div>
      
      {/* Waveform Visualization (Simple Bars) */}
      <div className="mt-4 sm:mt-8 md:mt-12 w-full max-w-[15rem] sm:max-w-sm md:max-w-xl h-10 sm:h-16 md:h-20 relative overflow-hidden flex items-end justify-center gap-0.5 sm:gap-1 px-2 sm:px-4">
        {stats?.frequencyData && Array.from(stats.frequencyData).slice(0, viewportWidth < 640 ? 24 : 48).map((v, i) => {
          // Scale bar height to fit container: mobile h-10 (40px) ÷8, sm h-16 (64px) ÷5, md h-20 (80px) ÷3
          const divisor = viewportWidth < 640 ? 8 : viewportWidth < 768 ? 5 : 3;
          return (
            <motion.div 
              key={i}
              className="w-0.5 sm:w-1 md:w-1.5 bg-gradient-to-t from-purple-500/10 to-white/40 rounded-full"
              animate={{ height: Math.max(2, (v as number) / divisor) }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              style={{
                opacity: 0.3 + ((v as number) / 255) * 0.7
              }}
            />
          );
        })}
      </div>
    </div>
  );
};
