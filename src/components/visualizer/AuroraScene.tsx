import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { AudioStats } from '../../types';

interface AuroraSceneProps {
  stats: AudioStats | null;
}

/**
 * Aurora tuning controls:
 * - TIME_SCALE: lower = slower background evolution (0.2 = 80% slower)
 * - CAMERA_DRIFT_SCALE: controls slow camera tilt/drift strength
 * - AURORA_INTENSITY: overall aurora brightness
 * - STAR_DENSITY: larger = fewer grid stars
 * - SHOOTING_STREAKS: shooting meteor count
 * - COOL_TONE_MIX: higher = colder cyan/blue/green profile, less purple
 */
const TIME_SCALE = 0.5;
const CAMERA_DRIFT_SCALE = 0.6;
const AURORA_INTENSITY = 1.95;
const STAR_DENSITY = 28.0;
const SHOOTING_STREAKS = 3;
const COOL_TONE_MIX = 0.28;

const vertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;

  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform float uBeat;
  uniform float uStarDensity;
  uniform float uAuroraIntensity;
  uniform float uCoolToneMix;
  uniform float uDriftScale;
  uniform float uStreakCount;

  #define DUST_OPACITY 0.08
  #define GLOW_INTENSITY 0.42
  #define GALAXY_TILT 2.7
  #define M_PI 3.1415926535897932384626433832795

  mat2 rot(float a) {
    float c = cos(a);
    float s = sin(a);
    return mat2(c, s, -s, c);
  }

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 23.45);
    return fract(p.x * p.y);
  }

  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float noise2d(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
          dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
      mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
          dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 8.0;
    for (int i = 0; i < 8; i++) {
      if (i >= octaves) break;
      value += amplitude * noise2d(p * frequency);
      frequency *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
  }

  vec3 randColor(vec2 seed) {
    return vec3(rand(seed + 13.1), rand(seed + 37.7), rand(seed + 91.3));
  }

  float tri(float x) {
    return clamp(abs(fract(x) - 0.5), 0.01, 0.49);
  }

  vec2 tri2(vec2 p) {
    return vec2(tri(p.x) + tri(p.y), tri(p.y + tri(p.x)));
  }

  float triNoise2d(vec2 p, float spd, float t) {
    float z = 1.8;
    float z2 = 2.5;
    float rz = 0.0;
    p *= rot(p.x * 0.06);
    vec2 bp = p;

    for (int i = 0; i < 5; i++) {
      vec2 dg = tri2(bp * 1.85) * 0.75;
      dg *= rot(t * spd);
      p -= dg / z2;

      bp *= 1.3;
      z2 *= 0.45;
      z *= 0.42;
      p *= 1.21 + (rz - 1.0) * 0.02;

      rz += tri(p.x + tri(p.y)) * z;
      p *= -mat2(0.95534, 0.29552, -0.29552, 0.95534);
    }

    return clamp(1.0 / pow(rz * 29.0, 1.3), 0.0, 0.75);
  }

  vec3 auroraPalette(vec2 coord, float t) {
    // Common aurora hues with stronger warm accents.
    vec3 green = vec3(0.22, 1.0, 0.56);
    vec3 cyan = vec3(0.34, 0.96, 1.0);
    vec3 blue = vec3(0.28, 0.5, 1.0);
    vec3 purple = vec3(0.72, 0.44, 0.96);
    vec3 magenta = vec3(0.95, 0.34, 0.92);
    vec3 red = vec3(1.0, 0.38, 0.46);
    vec3 white = vec3(0.97, 0.99, 1.0);

    // Build several color bands so one frame already has mixed colors.
    float bandA = 0.5 + 0.5 * sin(coord.x * 3.4 + coord.y * 1.6 + t * 0.24);
    float bandB = 0.5 + 0.5 * sin(coord.x * 2.2 - coord.y * 2.9 + t * 0.2 + 1.9);
    float bandC = 0.5 + 0.5 * sin(coord.x * 4.0 + coord.y * 0.9 + t * 0.28 + 3.2);

    vec3 coolMix = mix(mix(green, cyan, bandA), blue, bandB * 0.65);
    vec3 warmMix = mix(mix(purple, magenta, bandB), red, bandC * 0.58);
    vec3 mixed = mix(coolMix, warmMix, 0.3 + 0.4 * bandC);

    // Keep rich multi-hue look while preserving cooler bias control.
    vec3 coolBias = mix(mixed, mix(coolMix, white, 0.22), clamp(uCoolToneMix, 0.0, 1.0));
    mixed = mix(mixed, coolBias, 0.45 + 0.25 * sin(coord.x * 1.2 + t * 0.14));
    mixed = mix(mixed, white, 0.08 + 0.08 * sin(t * 0.1 + coord.y * 2.1));

    // Audio should be subtle: slight saturation/luma lift only.
    float luma = dot(mixed, vec3(0.299, 0.587, 0.114));
    mixed = mix(vec3(luma), mixed, 1.04 + uBeat * 0.08);
    return mixed;
  }

  vec3 renderStreak(float streakId, vec2 p, float time) {
    float speed = 2.0;
    float travelTime = 1.0 / speed;
    vec2 seedId = vec2(streakId);
    float timeOffset = rand(seedId + 17.0) * 200.0;
    float cyclePeriod = travelTime + 0.5 + rand(seedId + 29.0) * 15.0;

    float localTime = time + timeOffset;
    float timeInCycle = mod(localTime, cyclePeriod);
    if (timeInCycle > travelTime) return vec3(0.0);

    float cycleID = floor(localTime / cyclePeriod);
    vec2 runSeed = vec2(streakId, cycleID);
    float a = timeInCycle / travelTime;

    // Constrain meteors to a downward diagonal direction (never flying upward).
    vec2 dir = normalize(vec2(
      0.65 + rand(runSeed + 2.4) * 0.55,
      -(0.35 + rand(runSeed + 5.7) * 0.55)
    ));
    vec2 offset = vec2(
      (rand(runSeed * 9.8) * 2.0 - 1.0) * 1.0,
      (rand(runSeed * 3.6) * 2.0 - 1.0) * 0.18
    );
    vec2 center = dir * 1.4 * (a * 2.0 - 1.0) + offset;

    float segLen = 0.2;
    float clampedProj = clamp(dot(p - center, dir), -segLen, segLen);
    float line = smoothstep(0.003, 0.0, length((p - center) - dir * clampedProj));
    float streakAlpha = line
      * (smoothstep(0.0, 0.15, a) * smoothstep(1.0, 0.85, a))
      * ((clampedProj + segLen) / (2.0 * segLen));

    vec3 tint = mix(vec3(0.75, 0.88, 1.0), randColor(runSeed), 0.25);
    return tint * streakAlpha * 1.4;
  }

  vec3 realisticStarsAndStreaks(vec2 fragCoord, vec2 uv, float t) {
    vec3 starsAndStreaksColor = vec3(0.0);

    // Grid stars, less "stretched" and more physical-like twinkle.
    float starSize = uStarDensity;
    vec2 gridPos = floor(fragCoord / starSize);
    float starValue = rand(gridPos);
    float prob = 0.95;

    if (starValue > prob) {
      vec2 center = starSize * gridPos + starSize * 0.5;
      float twinkleSpeed = 1.0 + rand(gridPos + 42.0) * 4.0;
      float phaseOffset = (starValue - prob) / (1.0 - prob) * M_PI * 2.0;
      float twinkle = 0.86 + 0.16 * sin(t * twinkleSpeed + phaseOffset);
      float d = distance(fragCoord, center);
      // Sharper star core + tiny halo for clarity.
      float core = smoothstep(1.2, 0.0, d);
      float halo = smoothstep(starSize * 0.2, 0.0, d) * 0.22;
      float base = (core + halo) * twinkle * twinkle;
      vec3 starTint = mix(vec3(1.0), vec3(0.75, 0.9, 1.0), rand(gridPos + 123.4));
      starsAndStreaksColor += base * starTint;
    } else if (rand(fragCoord / uResolution.xy) > 0.9965) {
      float r = rand(fragCoord);
      float base = r * (0.25 * sin(t * (r * 5.0) + 720.0 * r) + 0.75);
      vec3 starTint = mix(vec3(1.0), vec3(0.74, 0.9, 1.0), rand(fragCoord * 0.13));
      starsAndStreaksColor += base * starTint * 0.7;
    }

    for (int i = 0; i < 5; i++) {
      if (float(i) >= uStreakCount) break;
      starsAndStreaksColor += renderStreak(float(i), uv, t);
    }

    return starsAndStreaksColor;
  }

  vec3 galaxyBackground(vec2 fragCoord) {
    // Centered UV, normalized by min-side to stay proportional on any screen shape.
    vec2 uv = (fragCoord - 0.5 * uResolution.xy) / max(min(uResolution.x, uResolution.y), 1.0);
    float angle = GALAXY_TILT;
    mat2 rotation = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    vec2 rotatedUv = uv * rotation;

    float bandShape = pow(1.0 - abs(rotatedUv.y), 3.0) * 0.2;
    float coreGlow = 1.0 - smoothstep(0.0, 1.0, length(rotatedUv * vec2(0.5, 1.0)));
    coreGlow = pow(coreGlow, 5.0) * GLOW_INTENSITY;
    float milkyWay = bandShape + coreGlow;

    vec2 gasUv = rotatedUv * 6.5 + vec2(123.45, 678.9);
    float gasFBM = fbm(gasUv, 4);
    gasFBM = (gasFBM + 1.0) * 0.5;
    gasFBM = smoothstep(0.28, 0.78, gasFBM);
    milkyWay += gasFBM * bandShape * 0.22;

    vec2 dustUv = rotatedUv * 3.8 + vec2(456.7, 890.12);
    vec2 dustDistort = vec2(fbm(dustUv + 15.5, 3), fbm(dustUv + 33.3, 3)) * 0.18;
    float dustFBM = fbm(dustUv + dustDistort, 5);
    dustFBM = (dustFBM + 1.0) * 0.5;
    float dustMask = smoothstep(0.56, 0.78, dustFBM);

    milkyWay *= (1.0 - dustMask * DUST_OPACITY);
    milkyWay = max(0.0, milkyWay);

    vec3 galaxyColor1 = vec3(0.08, 0.19, 0.34);
    vec3 galaxyColor2 = vec3(0.22, 0.36, 0.56);
    vec3 galaxyColor3 = vec3(0.75, 0.9, 1.0);
    vec3 skyColor = vec3(0.01, 0.02, 0.05);

    vec3 baseColor = mix(galaxyColor1, galaxyColor2, smoothstep(0.0, 0.14, milkyWay));
    baseColor = mix(baseColor, galaxyColor3, smoothstep(0.3, 0.9, milkyWay));
    return mix(skyColor, baseColor, milkyWay * 0.78);
  }

  vec4 aurora(vec3 ro, vec3 rd, float t) {
    vec4 col = vec4(0.0);
    vec4 avgCol = vec4(0.0);

    for (int i = 0; i < 48; i++) {
      float fi = float(i);
      float of = 0.006 * hash21(gl_FragCoord.xy + fi) * smoothstep(0.0, 15.0, fi);
      float pt = ((0.8 + pow(fi, 1.35) * 0.002) - ro.y) / (rd.y * 2.0 + 0.4);
      pt -= of;

      vec3 bpos = ro + pt * rd;
      vec2 p = bpos.zx;
      float rzt = triNoise2d(p, 0.055, t);

      vec4 col2 = vec4(0.0, 0.0, 0.0, rzt);
      vec2 paletteCoord = vec2(fi * 0.05 + bpos.x * 0.2, bpos.y * 0.18 - fi * 0.02);
      col2.rgb = auroraPalette(paletteCoord, t) * rzt;
      avgCol = mix(avgCol, col2, 0.5);
      col += avgCol * exp2(-fi * 0.065 - 2.35) * smoothstep(0.0, 5.0, fi);
    }

    col *= clamp(rd.y * 12.0 + 0.35, 0.0, 1.0);
    return col * uAuroraIntensity;
  }

  void main() {
    vec2 p = vUv - 0.5;
    // Proportional scaling: use min-side so scene never distorts on portrait / landscape.
    float minDim = min(uResolution.x, uResolution.y);
    p *= uResolution.xy / max(minDim, 1.0);

    vec2 fragCoord = vUv * uResolution.xy;
    vec2 uv = (2.0 * fragCoord - uResolution.xy) / max(minDim, 1.0);

    vec3 ro = vec3(0.0, 0.0, -6.7);
    vec3 rd = normalize(vec3(p, 1.35));
    float t = uTime;

    // Slower drift (80% slower when uDriftScale=0.2)
    rd.yz *= rot(0.05 * uDriftScale * sin(t * 0.08));
    rd.xz *= rot(0.18 * uDriftScale * sin(t * 0.05));

    vec3 col = vec3(0.0);
    float fade = smoothstep(0.0, 0.01, abs(rd.y)) * 0.1 + 0.9;

    col = galaxyBackground(fragCoord) * fade;

    if (rd.y > 0.0) {
      vec4 aur = smoothstep(0.0, 1.45, aurora(ro, rd, t)) * fade;
      col += realisticStarsAndStreaks(fragCoord, uv, t);
      col = col * (1.0 - aur.a) + aur.rgb;
    } else {
      // Water reflection
      rd.y = abs(rd.y);
      col = galaxyBackground(fragCoord) * fade * 0.62;
      vec4 aur = smoothstep(0.0, 2.25, aurora(ro, rd, t));
      col += realisticStarsAndStreaks(fragCoord, uv, t) * 0.12;
      col = col * (1.0 - aur.a) + aur.rgb;

      vec3 pos = ro + ((0.5 - ro.y) / rd.y) * rd;
      float nz = triNoise2d(pos.xz * vec2(0.45, 0.7), 0.0, t);
      col += mix(vec3(0.18, 0.24, 0.42) * 0.1, vec3(0.22, 0.32, 0.58) * 0.55, nz * 0.5);
    }

    // Beat-linked brightness but still subtle.
    col *= 1.0 + uBeat * 0.08;

    // Mild vignette
    vec2 vv = vUv - 0.5;
    col *= 1.0 - dot(vv, vv) * 0.9;
    col = max(col, vec3(0.0));

    gl_FragColor = vec4(col, 1.0);
  }
`;

const AuroraPlane: React.FC<AuroraSceneProps> = ({ stats }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const beatRef = useRef(0);

  const uniforms = useMemo<Record<string, THREE.IUniform>>(
    () => ({
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uBeat: { value: 0 },
      uStarDensity: { value: STAR_DENSITY },
      uAuroraIntensity: { value: AURORA_INTENSITY },
      uCoolToneMix: { value: COOL_TONE_MIX },
      uDriftScale: { value: CAMERA_DRIFT_SCALE },
      uStreakCount: { value: SHOOTING_STREAKS },
    }),
    []
  );

  useFrame((state) => {
    const material = meshRef.current?.material as THREE.ShaderMaterial | undefined;
    if (!material) return;

    const intensity = stats ? stats.averageFrequency / 255 : 0.0;
    const normalized = Math.max(0, (intensity - 0.35) / 0.65);
    const targetBeat = Math.pow(normalized, 1.6);
    beatRef.current = THREE.MathUtils.lerp(beatRef.current, targetBeat, 0.08);

    material.uniforms.uTime.value = state.clock.getElapsedTime() * TIME_SCALE;
    material.uniforms.uBeat.value = beatRef.current;
    // Use actual framebuffer dimensions (CSS pixels × DPR) to match gl_FragCoord.
    material.uniforms.uResolution.value.set(
      state.gl.domElement.width,
      state.gl.domElement.height
    );
    material.uniforms.uStarDensity.value = STAR_DENSITY;
    material.uniforms.uAuroraIntensity.value = AURORA_INTENSITY;
    material.uniforms.uCoolToneMix.value = COOL_TONE_MIX;
    material.uniforms.uDriftScale.value = CAMERA_DRIFT_SCALE;
    material.uniforms.uStreakCount.value = SHOOTING_STREAKS;
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} />
    </mesh>
  );
};

export const AuroraScene: React.FC<AuroraSceneProps> = ({ stats }) => {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      <Canvas orthographic camera={{ position: [0, 0, 1], zoom: 1 }}>
        <AuroraPlane stats={stats} />
      </Canvas>
    </div>
  );
};


