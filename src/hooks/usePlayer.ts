import { useState, useRef, useEffect, useCallback } from 'react';
import { MusicTrack } from '../types';

function getAudioErrorMessage(error: MediaError | null): string {
  if (!error) return 'Audio loading failed';

  switch (error.code) {
    case error.MEDIA_ERR_ABORTED:
      return 'Audio loading aborted';
    case error.MEDIA_ERR_NETWORK:
      return 'Network error loading audio';
    case error.MEDIA_ERR_DECODE:
      return 'Audio decode failed';
    case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'Audio format not supported or invalid URL';
    default:
      return `Audio error (code: ${error.code})`;
  }
}

// MediaError code for "source not supported" (includes CORS failures)
const ERR_SRC_NOT_SUPPORTED = 4;

export function usePlayer(tracksSource: MusicTrack[]) {
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioError, setAudioError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);
  // Track whether we've already retried without CORS for the current track
  const corsRetryRef = useRef(false);
  // Ref to avoid stale closure for isPlaying in event handlers
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const currentTrack = tracksSource[currentTrackIndex] || null;

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const next = useCallback(() => {
    setCurrentTrackIndex((prev) => {
      if (prev < tracksSource.length - 1) return prev + 1;
      return prev;
    });
    setIsPlaying(true);
  }, [tracksSource.length]);

  const prev = useCallback(() => {
    setCurrentTrackIndex((p) => {
      if (p > 0) return p - 1;
      return p;
    });
    setIsPlaying(true);
  }, []);

  // ── Load new track: set crossOrigin + src via the ref ──────────────
  // We manage src/crossOrigin here instead of in JSX so we can implement
  // the CORS fallback (remove crossOrigin and retry on failure).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    corsRetryRef.current = false;
    setAudioError(null);
    setCurrentTime(0);
    setDuration(0);

    if (currentTrack?.previewUrl) {
      audio.crossOrigin = 'anonymous'; // Try CORS first for audio visualizer
      audio.src = currentTrack.previewUrl;
      audio.load();
    } else {
      audio.removeAttribute('src');
      audio.load();
    }
  }, [currentTrack?.previewUrl]);

  // ── Synchronize isPlaying state with the audio element ─────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;

    const syncPlay = async () => {
      if (isPlaying) {
        try {
          playPromiseRef.current = audio.play();
          await playPromiseRef.current;
        } catch (error) {
          if (error instanceof Error && error.name !== 'AbortError') {
            console.warn('Playback error:', error);
            setIsPlaying(false);
          }
        }
      } else {
        if (playPromiseRef.current) {
          await playPromiseRef.current.catch(() => {});
        }
        audio.pause();
      }
    };

    syncPlay();
  }, [isPlaying, currentTrackIndex, tracksSource]);

  // ── Audio event listeners ──────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration || 0);

    const handleLoadedData = () => {
      setAudioError(null);
      // Auto-play if we should be playing (e.g. after CORS retry)
      if (isPlayingRef.current && audio.paused) {
        audio.play().catch(() => {});
      }
    };

    const handleError = () => {
      const err = audio.error;

      // ── CORS fallback ──────────────────────────────────────────────
      // Some Jamendo CDN endpoints don't serve proper CORS headers.
      // When crossOrigin="anonymous" is set the browser rejects the
      // audio entirely with MEDIA_ERR_SRC_NOT_SUPPORTED.  Retry
      // WITHOUT crossOrigin — audio will still play, but the audio
      // analyzer receives zeroed data (visualizer uses its default
      // ambient animation instead).
      if (
        err &&
        err.code === ERR_SRC_NOT_SUPPORTED &&
        audio.crossOrigin &&
        !corsRetryRef.current &&
        currentTrack?.previewUrl
      ) {
        corsRetryRef.current = true;
        console.warn(
          'CORS may be blocking playback, retrying without crossOrigin:',
          currentTrack.title
        );
        audio.removeAttribute('crossorigin');
        audio.src = currentTrack.previewUrl;
        audio.load();
        return; // Wait for retry — handleLoadedData will auto-play if needed
      }

      // ── Genuine error (or retry also failed) ──────────────────────
      const message = getAudioErrorMessage(err);
      console.error('Audio error:', message, currentTrack?.previewUrl);
      setAudioError(message);
      setIsPlaying(false);

      // Auto-advance to next track after a delay
      setTimeout(() => {
        if (currentTrackIndex < tracksSource.length - 1) {
          setCurrentTrackIndex((p) => p + 1);
          setAudioError(null);
        }
      }, 2000);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (currentTrackIndex < tracksSource.length - 1) {
        setCurrentTrackIndex((p) => p + 1);
        setIsPlaying(true);
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('loadeddata', handleLoadedData);
    audio.addEventListener('error', handleError);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('loadeddata', handleLoadedData);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [tracksSource, currentTrackIndex, currentTrack?.previewUrl]);

  return {
    currentTrack,
    currentTrackIndex,
    setCurrentTrackIndex,
    isPlaying,
    setIsPlaying,
    togglePlay,
    seek,
    next,
    prev,
    currentTime,
    duration,
    audioError,
    audioRef,
  };
}
