
import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Points, PointMaterial, Float } from '@react-three/drei';
import * as THREE from 'three';
import { AudioStats, Mood, VisualizerTheme } from '../../types';
import { RainGlassScene } from './RainGlassScene';
import { AuroraScene } from './AuroraScene';
import { MilkyWayBackdrop } from './MilkyWayBackdrop';

interface ParticlesProps {
  stats: AudioStats | null;
  mood: Mood;
  theme: VisualizerTheme;
}

/**
 * Visual tuning guide:
 * - POINT_COUNT: lower value = better performance
 * - beatThreshold: higher value = only strong beats trigger motion
 * - basePointSize / beatPointBoost: controls halo softness + beat bloom
 * - theme speed multipliers in switch(theme): overall animation pace
 */
const POINT_COUNT = 900;
const beatThreshold = 0.3;
const basePointSize = 0.034;
const beatPointBoost = 0.012;

const Particles: React.FC<ParticlesProps> = ({ stats, mood, theme }) => {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  
  // Create static positions (fewer particles for smoother rendering)
  const count = POINT_COUNT;
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }
    return pos;
  }, []);

  // Colorful points: each star has a slightly different hue/lightness
  const colors = useMemo(() => {
    const c = new Float32Array(count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const hue = (0.55 + Math.random() * 0.5) % 1; // purple/cyan/pink range
      const sat = 0.55 + Math.random() * 0.25;
      const light = 0.55 + Math.random() * 0.25;
      color.setHSL(hue, sat, light);
      c[i * 3] = color.r;
      c[i * 3 + 1] = color.g;
      c[i * 3 + 2] = color.b;
    }
    return c;
  }, [count]);

  const baseHue = useMemo(() => {
    switch (mood) {
      case 'Melancholy':
        return 0.60;
      case 'Happy':
        return 0.13;
      case 'Dynamic':
        return 0.92;
      default:
        return 0.74;
    }
  }, [mood]);

  useFrame((state) => {
    if (!pointsRef.current) return;
    
    const time = state.clock.getElapsedTime();
    const intensity = stats ? stats.averageFrequency / 255 : 0.05;

    // Only react strongly on heavier beats; light rhythm keeps background steady.
    const normalizedBeat = Math.max(0, (intensity - beatThreshold) / (1 - beatThreshold));
    const beatResponse = Math.pow(normalizedBeat, 1.8);
    
    // Apply different animations based on theme
    switch (theme) {
      case 'rain':
        // Rain: gentle vertical flow
        pointsRef.current.rotation.y = time * 0.004;
        pointsRef.current.rotation.x = -Math.PI / 2;
        pointsRef.current.position.y = (-time * 0.12) % 10;
        break;
      case 'snow':
        // Snow: softer and slower drift than rain
        pointsRef.current.rotation.y = time * 0.002;
        pointsRef.current.rotation.x = -Math.PI / 3;
        pointsRef.current.position.y = (-time * 0.05) % 10;
        pointsRef.current.position.x = Math.sin(time * 0.12) * 0.25;
        break;
      case 'halo':
        // Halo: cinematic slow swirl
        pointsRef.current.rotation.y = time * 0.01;
        pointsRef.current.rotation.x = Math.sin(time * 0.08) * 0.08;
        pointsRef.current.rotation.z = Math.sin(time * 0.06) * 0.05;
        break;
      default: // 'stars'
        // Stars: dreamy subtle drift
        pointsRef.current.rotation.y = time * 0.012;
        pointsRef.current.rotation.x = time * 0.004;
    }

    // Audio-reactive scaling (kicks in mostly on strong beats)
    const scale = 1 + beatResponse * 0.14;
    pointsRef.current.scale.set(scale, scale, scale);

    // Smooth global tint drift + glow pulse to create a halo feeling.
    if (materialRef.current) {
      const hueShift = Math.sin(time * 0.06) * 0.06 + beatResponse * 0.03;
      const hue = (baseHue + hueShift + 1) % 1;
      const saturation = 0.62;
      const lightness = 0.62 + beatResponse * 0.05;
      materialRef.current.opacity = 0.45 + beatResponse * 0.2;
      materialRef.current.size = basePointSize + beatResponse * beatPointBoost;
      materialRef.current.color.setHSL(hue, saturation, lightness);
    }
  });

  return (
    <Points ref={pointsRef} positions={positions} colors={colors} stride={3} frustumCulled={false}>
      <PointMaterial
        ref={materialRef}
        transparent
        vertexColors
        color="#ffffff"
        size={basePointSize}
        opacity={0.45}
        sizeAttenuation={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </Points>
  );
};

// Moving light that reacts to audio
const AudioHalo: React.FC<{ stats: AudioStats | null }> = ({ stats }) => {
  const lightRef = useRef<THREE.PointLight>(null);
  
  useFrame(() => {
    if (!lightRef.current) return;
    const intensity = stats ? stats.bass / 255 : 0.1;
    lightRef.current.intensity = 5 + intensity * 50;
  });

  return (
    <pointLight ref={lightRef} position={[0, 0, 2]} color="#8338ec" />
  );
};

export const Scene3D: React.FC<ParticlesProps> = ({ stats, mood, theme }) => {
  if (theme === 'rainGlass') {
    return <RainGlassScene stats={stats} />;
  }
  if (theme === 'aurora') {
    return <AuroraScene stats={stats} />;
  }

  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      {/* 
        How to add a new 3D background style:
        1) Add a new value in `VisualizerTheme` (`types.ts`).
        2) Add one `case` in `Particles` switch(theme):
           - rotation/position behavior
           - optional music response style
        3) Tune scene-level feel here:
           - camera position/fov
           - ambient/light intensity
           - Float speed/rotation/float intensity
        4) For non-particle scenes, replace <Points> with:
           - mesh-based objects
           - shader material
           - custom R3F component
      */}
      <Canvas camera={{ position: [0, 0, 5], fov: 75 }}>
        <color attach="background" args={['#000000']} />
        <ambientLight intensity={0.35} />
        <MilkyWayBackdrop stats={stats} theme={theme} />
        <Float speed={theme === 'rain' || theme === 'snow' ? 0 : 0.7} rotationIntensity={0.12} floatIntensity={0.12}>
          <Particles stats={stats} mood={mood} theme={theme} />
        </Float>
        <AudioHalo stats={stats} />
      </Canvas>
    </div>
  );
};
