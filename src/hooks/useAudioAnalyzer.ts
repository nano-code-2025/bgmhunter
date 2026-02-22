import { useState, useEffect, useRef, useCallback } from 'react';
import { AudioStats } from '../types';

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export function useAudioAnalyzer(audioRef: React.RefObject<HTMLAudioElement | null>) {
  const [stats, setStats] = useState<AudioStats | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);

  const initAnalyzer = useCallback(() => {
    if (!audioRef.current || analyzerRef.current) return;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      const context = new AudioContextClass();
      const analyzer = context.createAnalyser();
      analyzer.fftSize = 256;

      // createMediaElementSource can only be called ONCE per element
      const source = context.createMediaElementSource(audioRef.current);
      source.connect(analyzer);
      analyzer.connect(context.destination);

      audioContextRef.current = context;
      analyzerRef.current = analyzer;
      sourceRef.current = source;
      dataArrayRef.current = new Uint8Array(analyzer.frequencyBinCount);
    } catch (err) {
      console.warn('Audio Context initialization failed:', err);
    }
  }, [audioRef]);

  const update = useCallback(() => {
    if (!analyzerRef.current || !dataArrayRef.current) return;

    analyzerRef.current.getByteFrequencyData(dataArrayRef.current);

    const data = dataArrayRef.current;
    let sum = 0;
    let bass = 0;
    let mid = 0;
    let treble = 0;

    for (let i = 0; i < data.length; i++) {
      sum += data[i];
      if (i < 10) bass += data[i];
      else if (i < 50) mid += data[i];
      else treble += data[i];
    }

    setStats({
      frequencyData: new Uint8Array(data),
      averageFrequency: sum / data.length,
      bass: bass / 10,
      mid: mid / 40,
      treble: treble / (data.length - 50),
    });

    animationFrameRef.current = requestAnimationFrame(update);
  }, []);

  useEffect(() => {
    const handlePlay = async () => {
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      initAnalyzer();
      update();
    };

    const audio = audioRef.current;
    if (audio) {
      audio.addEventListener('play', handlePlay);
    }

    return () => {
      if (audio) {
        audio.removeEventListener('play', handlePlay);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [audioRef, initAnalyzer, update]);

  return stats;
}
