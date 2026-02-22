import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { AudioStats } from '../../types';

interface RainGlassSceneProps {
  stats: AudioStats | null;
}

/**
 * Tuning guide (rain realism vs performance):
 * - BASE_RAIN: global rain amount on glass
 * - BEAT_THRESHOLD: higher value = only strong beats change rain/light
 * - LIGHT_COUNT: more city lights = richer bokeh but heavier shader cost
 * - CHEAP_NORMALS: true = faster, false = better glass refraction detail
 * - SCREEN_BRIGHTNESS: overall brightness multiplier (1.2 = 20% brighter)
 */
const BASE_RAIN = 0.52;
const BEAT_THRESHOLD = 0.3;
const LIGHT_COUNT = 9;
const CHEAP_NORMALS = true;
const SCREEN_BRIGHTNESS = 1.2;

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
  uniform float uRainAmount;
  uniform float uBrightness;

  float S(float a, float b, float t) { return smoothstep(a, b, t); }

  vec3 N13(float p) {
    vec3 p3 = fract(vec3(p) * vec3(.1031,.11369,.13787));
    p3 += dot(p3, p3.yzx + 19.19);
    return fract(vec3((p3.x + p3.y)*p3.z, (p3.x+p3.z)*p3.y, (p3.y+p3.z)*p3.x));
  }

  float N(float t) {
    return fract(sin(t * 12345.564) * 7658.76);
  }

  float Saw(float b, float t) {
    return S(0., b, t) * S(1., b, t);
  }

  vec2 DropLayer2(vec2 uv, float t) {
    vec2 UV = uv;
    uv.y += t * 0.75;
    vec2 a = vec2(6., 1.);
    vec2 grid = a * 2.;
    vec2 id = floor(uv * grid);
    float colShift = N(id.x);
    uv.y += colShift;
    id = floor(uv * grid);

    vec3 n = N13(id.x * 35.2 + id.y * 2376.1);
    vec2 st = fract(uv * grid) - vec2(.5, 0);
    float x = n.x - .5;

    float y = UV.y * 20.;
    float wiggle = sin(y + sin(y));
    x += wiggle * (.5 - abs(x)) * (n.z - .5);
    x *= .7;
    float ti = fract(t + n.z);
    y = (Saw(.85, ti) - .5) * .9 + .5;
    vec2 p = vec2(x, y);

    float d = length((st - p) * a.yx);
    float mainDrop = S(.4, .0, d);

    float r = sqrt(S(1., y, st.y));
    float cd = abs(st.x - x);
    float trail = S(.23 * r, .15 * r * r, cd);
    float trailFront = S(-.02, .02, st.y - y);
    trail *= trailFront * r * r;

    y = UV.y;
    float trail2 = S(.2 * r, .0, cd);
    float droplets = max(0., (sin(y * (1. - y) * 120.) - st.y)) * trail2 * trailFront * n.z;
    y = fract(y * 10.) + (st.y - .5);
    float dd = length(st - vec2(x, y));
    droplets = S(.3, 0., dd);
    float m = mainDrop + droplets * r * trailFront;

    return vec2(m, trail);
  }

  float StaticDrops(vec2 uv, float t) {
    uv *= 40.;
    vec2 id = floor(uv);
    uv = fract(uv) - .5;
    vec3 n = N13(id.x * 107.45 + id.y * 3543.654);
    vec2 p = (n.xy - .5) * .7;
    float d = length(uv - p);
    float fade = Saw(.025, fract(t + n.z));
    float c = S(.3, 0., d) * fract(n.z * 10.) * fade;
    return c;
  }

  vec2 Drops(vec2 uv, float t, float l0, float l1, float l2) {
    float s = StaticDrops(uv, t) * l0;
    vec2 m1 = DropLayer2(uv, t) * l1;
    vec2 m2 = DropLayer2(uv * 1.85, t) * l2;
    float c = s + m1.x + m2.x;
    c = S(.3, 1., c);
    return vec2(c, max(m1.y * l0, m2.y * l1));
  }

  // Bokeh lights using screen-proportional UV (pixels / minDim) so lights
  // stay circular and evenly distributed regardless of aspect ratio.
  vec3 cityBokeh(vec2 screenUV, float t, float blurFactor) {
    vec3 col = vec3(0.0);
    float pulse = 0.1 + uBeat * 0.12;
    float dynamicBlur = mix(0.03, 0.11, clamp(blurFactor / 6.0, 0.0, 1.0));
    // Screen extent in proportional units so centers fill the whole screen.
    vec2 screenMax = uResolution / min(uResolution.x, uResolution.y);

    for (int i = 0; i < ${LIGHT_COUNT}; i++) {
      float fi = float(i);
      float seed = fi * 17.13;
      vec2 center = vec2(
        fract(sin(seed * 0.83) * 3123.1) * screenMax.x,
        fract(cos(seed * 1.11) * 4567.2) * screenMax.y
      );

      center.x += sin(t * (0.03 + fi * 0.004) + fi) * 0.08;
      center.y += cos(t * (0.025 + fi * 0.003) + fi * 1.7) * 0.05;

      float r = 0.04 + fract(seed) * 0.08 + dynamicBlur;
      float d = length(screenUV - center);
      float blob = smoothstep(r + 0.06, r - 0.02, d);

      vec3 lightColor = vec3(
        0.45 + 0.55 * sin(fi * 1.17 + t * 0.05),
        0.45 + 0.55 * sin(fi * 1.73 + 1.2 + t * 0.06),
        0.45 + 0.55 * sin(fi * 2.11 + 2.1 + t * 0.04)
      );

      col += blob * lightColor * (0.36 + pulse);
    }

    return col * 0.72;
  }

  void main() {
    // Normalize by shortest side so rain/bokeh stay proportional on any aspect ratio.
    float minDim = min(uResolution.x, uResolution.y);
    vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution.xy) / minDim;
    // Screen-proportional UV for bokeh (same pixel-per-unit in x and y).
    vec2 screenUV = gl_FragCoord.xy / minDim;
    float T = uTime;
    float t = T * 0.2;

    float rainAmount = clamp(uRainAmount + uBeat * 0.15, 0.0, 1.0);
    float maxBlur = mix(3.2, 6.0, rainAmount);
    float minBlur = 2.0;

    float staticDrops = S(-.5, 1., rainAmount) * 2.0;
    float layer1 = S(.25, .75, rainAmount);
    float layer2 = S(.0, .5, rainAmount);

    vec2 c = Drops(uv, t, staticDrops, layer1, layer2);

    vec2 n;
    if (${CHEAP_NORMALS ? 'true' : 'false'}) {
      n = vec2(dFdx(c.x), dFdy(c.x));
    } else {
      vec2 e = vec2(.001, 0.);
      float cx = Drops(uv + e, t, staticDrops, layer1, layer2).x;
      float cy = Drops(uv + e.yx, t, staticDrops, layer1, layer2).x;
      n = vec2(cx - c.x, cy - c.x);
    }

    float focus = mix(maxBlur - c.y, minBlur, S(.1, .2, c.x));
    vec3 col = cityBokeh(screenUV + n * 0.35, T, focus);

    // Fog layer + color grading
    float fog = 0.42 + 0.28 * smoothstep(0.0, 1.0, rainAmount);
    col = mix(col, vec3(0.06, 0.09, 0.14), fog - c.y * 0.32);

    // Subtle lightning-like pulse on stronger beats
    col *= 1.0 + uBeat * 0.18;

    // Apply brightness multiplier
    col *= uBrightness;

    // Vignette — use 0-1 UV for correct screen centering
    vec2 v = gl_FragCoord.xy / uResolution.xy - 0.5;
    col *= 1.0 - dot(v, v) * 1.2;
    col = max(col, vec3(0.0));

    gl_FragColor = vec4(col, 1.0);
  }
`;

const RainGlassPlane: React.FC<RainGlassSceneProps> = ({ stats }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const beatRef = useRef(0);

  const uniforms = useMemo<Record<string, THREE.IUniform>>(
    () => ({
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uBeat: { value: 0 },
      uRainAmount: { value: BASE_RAIN },
      uBrightness: { value: SCREEN_BRIGHTNESS },
    }),
    []
  );

  useFrame((state) => {
    const material = meshRef.current?.material as THREE.ShaderMaterial | undefined;
    if (!material) return;

    const intensity = stats ? stats.averageFrequency / 255 : 0.0;
    const normalized = Math.max(0, (intensity - BEAT_THRESHOLD) / (1 - BEAT_THRESHOLD));
    const targetBeat = Math.pow(normalized, 1.5);
    beatRef.current = THREE.MathUtils.lerp(beatRef.current, targetBeat, 0.08);

    material.uniforms.uTime.value = state.clock.getElapsedTime();
    material.uniforms.uBeat.value = beatRef.current;
    material.uniforms.uRainAmount.value = BASE_RAIN;
    material.uniforms.uBrightness.value = SCREEN_BRIGHTNESS;
    // Use actual framebuffer dimensions (CSS pixels × DPR) to match gl_FragCoord.
    material.uniforms.uResolution.value.set(
      state.gl.domElement.width,
      state.gl.domElement.height
    );
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} />
    </mesh>
  );
};

export const RainGlassScene: React.FC<RainGlassSceneProps> = ({ stats }) => {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      <Canvas orthographic camera={{ position: [0, 0, 1], zoom: 1 }}>
        <RainGlassPlane stats={stats} />
      </Canvas>
    </div>
  );
};
