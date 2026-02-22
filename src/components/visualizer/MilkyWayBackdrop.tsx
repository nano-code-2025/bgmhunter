import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { AudioStats, VisualizerTheme } from '../../types';

interface MilkyWayBackdropProps {
  stats: AudioStats | null;
  theme: VisualizerTheme;
}

const vertexShader = `
  void main() {
    // Full-screen clip-space quad — bypasses camera projection entirely,
    // so the galaxy always fills the viewport regardless of camera type or plane size.
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;

  uniform float uTime;
  uniform vec2 uResolution;
  uniform float uBeat;
  uniform float uTint;

  mat3 rotationMatrix(vec3 axis, float angle) {
    axis = normalize(axis);
    float s = sin(angle);
    float c = cos(angle);
    float oc = 1.0 - c;

    return mat3(
      oc * axis.x * axis.x + c,
      oc * axis.x * axis.y - axis.z * s,
      oc * axis.z * axis.x + axis.y * s,
      oc * axis.x * axis.y + axis.z * s,
      oc * axis.y * axis.y + c,
      oc * axis.y * axis.z - axis.x * s,
      oc * axis.z * axis.x - axis.y * s,
      oc * axis.y * axis.z + axis.x * s,
      oc * axis.z * axis.z + c
    );
  }

  float hash(float n) {
    return fract(sin(n) * 758.5453);
  }

  float configurableNoise(vec3 x, float c1, float c2) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);

    float h2 = c1;
    float h1 = c2;
    float h3 = h2 + h1;

    float n = p.x + p.y * h1 + h2 * p.z;
    return mix(
      mix(
        mix(hash(n + 0.0), hash(n + 1.0), f.x),
        mix(hash(n + h1), hash(n + h1 + 1.0), f.x),
        f.y
      ),
      mix(
        mix(hash(n + h2), hash(n + h2 + 1.0), f.x),
        mix(hash(n + h3), hash(n + h3 + 1.0), f.x),
        f.y
      ),
      f.z
    );
  }

  float superNoise3dX(vec3 p) {
    float a = configurableNoise(p, 883.0, 971.0);
    float b = configurableNoise(p + 0.5, 113.0, 157.0);
    return a * b;
  }

  float fbmHI2d(vec2 p, float dx) {
    p *= 1.2;
    float a = 0.0;
    float w = 1.0;
    float wc = 0.0;
    for (int i = 0; i < 5; i++) {
      a += clamp(2.0 * abs(0.5 - superNoise3dX(vec3(p, 1.0))) * w, 0.0, 1.0);
      wc += w;
      w *= 0.5;
      p = p * dx;
    }
    return a / wc;
  }

  float starMask(vec2 seed, float intensity) {
    float coarse = superNoise3dX(vec3(seed * 500.0, 0.0));
    float fine = 0.8 + 0.2 * superNoise3dX(vec3(seed * 40.0, 0.0));
    return smoothstep(1.0 - intensity * 0.9, (1.0 - intensity * 0.9) + 0.1, coarse * fine);
  }

  vec3 starField(vec2 uv) {
    float intensityRed = (1.0 / (1.0 + 30.0 * abs(uv.y))) * fbmHI2d(uv * 30.0, 3.0) * (1.0 - abs(uv.x));
    float intensityWhite = (1.0 / (1.0 + 20.0 * abs(uv.y))) * fbmHI2d(uv * 30.0 + 120.0, 3.0) * (1.0 - abs(uv.x));
    float intensityBlue = (1.0 / (1.0 + 20.0 * abs(uv.y))) * fbmHI2d(uv * 30.0 + 220.0, 3.0) * (1.0 - abs(uv.x));

    float galaxyDust = smoothstep(
      0.1,
      0.5,
      (1.0 / (1.0 + 20.0 * abs(uv.y))) * fbmHI2d(uv * 20.0 + 220.0, 3.0) * (1.0 - abs(uv.x))
    );
    float galaxyDust2 = smoothstep(
      0.1,
      0.5,
      (1.0 / (1.0 + 20.0 * abs(uv.y))) * fbmHI2d(uv * 50.0 + 220.0, 3.0) * (1.0 - abs(uv.x))
    );

    intensityRed = 1.0 - pow(1.0 - intensityRed, 3.0) * 0.73;
    intensityWhite = 1.0 - pow(1.0 - intensityWhite, 3.0) * 0.73;
    intensityBlue = 1.0 - pow(1.0 - intensityBlue, 3.0) * 0.73;

    float redLights = starMask(uv, intensityRed);
    float whiteLights = starMask(uv + 0.11, intensityWhite);
    float blueLights = starMask(uv + 0.27, intensityBlue);
    float twinkleA = 0.82 + 0.18 * sin(uTime * 0.2 + uv.x * 28.0 + uv.y * 16.0);
    float twinkleB = 0.84 + 0.16 * sin(uTime * 0.16 + uv.x * 19.0 - uv.y * 21.0);
    float twinkleC = 0.9 + 0.1 * sin(uTime * 0.11 + uv.x * 7.0);

    vec3 warm = vec3(1.0, 0.78, 0.48);
    vec3 cool = vec3(0.58, 0.72, 1.0);
    vec3 mint = vec3(0.62, 1.0, 0.88);
    vec3 starsColor = warm * redLights + vec3(1.0) * whiteLights + cool * blueLights;
    starsColor = mix(starsColor, starsColor + mint * blueLights * 0.35, 0.45 + 0.35 * sin(uTime * 0.08 + uv.x * 2.0));
    starsColor *= twinkleA;

    // Richer galaxy colors: cyan / blue / emerald / warm dust.
    vec3 dustInnerA = mix(vec3(0.95, 0.9, 0.88), vec3(0.68, 0.9, 1.0), uTint);
    vec3 dustInnerB = vec3(0.72, 0.86, 1.0);
    vec3 dustInner = mix(dustInnerA, dustInnerB, 0.28 + 0.22 * sin(uTime * 0.06 + uv.x * 3.0));
    vec3 dustOuterA = mix(vec3(0.18, 0.1, 0.06), vec3(0.05, 0.12, 0.22), uTint);
    vec3 dustOuterB = vec3(0.03, 0.1, 0.17);
    vec3 dustOuter = mix(dustOuterA, dustOuterB, 0.25 + 0.2 * sin(uTime * 0.05 - uv.y * 2.5));
    vec3 innerMix = mix(dustInner, starsColor, 1.0 - galaxyDust);
    vec3 allMix = mix(dustOuter, innerMix, 1.0 - galaxyDust2);
    vec3 bloom = 1.35 * dustInner * (1.0 / (1.0 + 30.0 * abs(uv.y))) * fbmHI2d(uv * 3.0, 3.0) * (1.0 - abs(uv.x));
    bloom *= twinkleB;
    vec3 chromaSweep = vec3(
      0.92 + 0.08 * sin(uTime * 0.07 + uv.x * 3.0),
      0.94 + 0.1 * sin(uTime * 0.05 + uv.y * 4.0 + 1.2),
      1.02 + 0.12 * sin(uTime * 0.06 - uv.x * 2.6 + 2.1)
    );
    return (allMix + bloom) * chromaSweep * twinkleC;
  }

  vec3 milkyway(vec2 uv) {
    return starField(uv);
  }

  void main() {
    // gl_FragCoord-based UV: viewport-aware, works on any aspect ratio including mobile portrait.
    // Normalise by shortest side so the galaxy maintains proportional shape.
    float minDim = max(min(uResolution.x, uResolution.y), 1.0);
    vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution.xy) / minDim;

    // Keep position stable to avoid theme-switch drift/offset artifacts.
    vec2 pos = (rotationMatrix(vec3(0.0, 0.0, 1.0), 0.2415) * vec3(uv, 0.0)).xy;
    vec3 col = milkyway(pos);

    // Gentle temporal variation without translating the galaxy.
    float pulse = 0.93 + 0.07 * sin(uTime * 0.1 + pos.x * 4.0);
    col *= pulse;
    col *= 0.9 + uBeat * 0.12;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export const MilkyWayBackdrop: React.FC<MilkyWayBackdropProps> = ({ stats, theme }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const beatRef = useRef(0);

  const uniforms = useMemo<Record<string, THREE.IUniform>>(
    () => ({
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uBeat: { value: 0 },
      uTint: { value: 0.7 },
    }),
    []
  );

  useFrame((state) => {
    const material = meshRef.current?.material as THREE.ShaderMaterial | undefined;
    if (!material || !meshRef.current) return;

    const intensity = stats ? stats.averageFrequency / 255 : 0.0;
    beatRef.current = THREE.MathUtils.lerp(beatRef.current, intensity, 0.06);

    // Keep plane transform fixed to prevent visual boundary drift.
    meshRef.current.rotation.set(0, 0, 0);

    material.uniforms.uTime.value = state.clock.getElapsedTime() * 0.5;
    material.uniforms.uBeat.value = beatRef.current;
    material.uniforms.uTint.value = theme === 'halo' ? 0.78 : 0.62;
    // Use actual framebuffer dimensions (CSS pixels × DPR) to match gl_FragCoord.
    material.uniforms.uResolution.value.set(
      state.gl.domElement.width,
      state.gl.domElement.height
    );
  });

  return (
    <mesh ref={meshRef} renderOrder={-10}>
      {/* 2×2 clip-space quad fills the entire viewport */}
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        depthWrite={false}
        depthTest={false}
        transparent
      />
    </mesh>
  );
};


