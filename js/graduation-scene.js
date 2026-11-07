// Hero scene: tokens spiral up a bonding-curve funnel. Most stall and slide
// back down; the few that reach the rim "graduate" and burst in their score
// colour. Typed arrays are updated in place each frame for performance.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { randomScore, scoreBand } from './scores.js';

const PALETTE = {
  accent: new THREE.Color('#B79CFF'),
  dimAccent: new THREE.Color('#5E4E8C'),
  hot: new THREE.Color('#F3EFF9'),
  good: new THREE.Color('#4ADE80'),
  warn: new THREE.Color('#F5C04A'),
  bad: new THREE.Color('#EE6B53'),
};
const BAND_COLOR = { good: PALETTE.good, warn: PALETTE.warn, bad: PALETTE.bad };

const CURVE = { radius: 5, height: 4.2, turns: 1.1 };
const TOKEN_COUNT = { wide: 720, narrow: 380 };
const GRADUATION_CHANCE = 0.06;
const SPARK = { pool: 1600, perBurst: 48, life: 1.9, gravity: -1.7, drag: 0.985 };
const CAMERA_FOV = 36;
const CAMERA_DIR = new THREE.Vector3(0, 0.62, 1).normalize();
const CAMERA_BASE_DISTANCE = 22;
const CAMERA_TARGET = new THREE.Vector3(0, 2.2, 0);
const FIT_HALF_WIDTH = 6.2;
const AUTO_SPIN = 0.07;
const MAX_DT = 1 / 20;
const WIDE_LAYOUT = 1024;
const NARROW_LAYOUT = 760;

const VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uScale;
  uniform float uDistance;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    vColor = aColor;
    vAlpha = aAlpha * smoothstep(uDistance + 9.0, uDistance - 5.0, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float glow = pow(1.0 - d * 2.0, 1.7);
    gl_FragColor = vec4(vColor * (0.55 + glow * 0.85), vAlpha * glow);
  }
`;

function curvePoint(progress, theta, out) {
  const angle = theta + progress * CURVE.turns * Math.PI * 2;
  const r = CURVE.radius * progress;
  return out.set(Math.cos(angle) * r, CURVE.height * progress * progress, Math.sin(angle) * r);
}

function createPointLayer(count) {
  const position = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const alpha = new Float32Array(count);
  const geometry = new THREE.BufferGeometry();
  const attrs = {
    position: new THREE.BufferAttribute(position, 3),
    aColor: new THREE.BufferAttribute(color, 3),
    aSize: new THREE.BufferAttribute(size, 1),
    aAlpha: new THREE.BufferAttribute(alpha, 1),
  };
  Object.entries(attrs).forEach(([name, attr]) => {
    attr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name, attr);
  });
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: { uScale: { value: 1 }, uDistance: { value: CAMERA_BASE_DISTANCE } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  const markDirty = () => Object.values(attrs).forEach((attr) => { attr.needsUpdate = true; });
  return { points, material, position, color, size, alpha, markDirty };
}

function lineFrom(points, opacity) {
  const material = new THREE.LineBasicMaterial({
    color: PALETTE.accent, transparent: true, opacity, depthWrite: false,
  });
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
}

function createFunnel() {
  const group = new THREE.Group();
  const v = new THREE.Vector3();
  const RINGS = 9;
  const RING_SEGMENTS = 120;
  for (let k = 1; k < RINGS; k += 1) {
    const p = k / RINGS;
    const ring = [];
    for (let i = 0; i <= RING_SEGMENTS; i += 1) {
      const a = (i / RING_SEGMENTS) * Math.PI * 2;
      ring.push(new THREE.Vector3(Math.cos(a) * CURVE.radius * p, CURVE.height * p * p, Math.sin(a) * CURVE.radius * p));
    }
    group.add(lineFrom(ring, 0.06 + p * 0.14));
  }
  const TRACKS = 16;
  const TRACK_STEPS = 60;
  for (let t = 0; t < TRACKS; t += 1) {
    const theta = (t / TRACKS) * Math.PI * 2;
    const track = [];
    for (let s = 0; s <= TRACK_STEPS; s += 1) track.push(curvePoint(s / TRACK_STEPS, theta, v).clone());
    group.add(lineFrom(track, 0.1));
  }
  return group;
}

function createGraduationRing() {
  const group = new THREE.Group();
  const coreMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.accent.clone(), transparent: true, opacity: 0.95 });
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: PALETTE.accent, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const core = new THREE.Mesh(new THREE.TorusGeometry(CURVE.radius, 0.028, 8, 180), coreMaterial);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(CURVE.radius, 0.09, 12, 180), haloMaterial);
  [core, halo].forEach((mesh) => {
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = CURVE.height;
    group.add(mesh);
  });
  return { group, coreMaterial, haloMaterial };
}

function createTokenSim(count) {
  const layer = createPointLayer(count);
  const theta = new Float32Array(count);
  const progress = new Float32Array(count);
  const speed = new Float32Array(count);
  const peak = new Float32Array(count);
  const fade = new Float32Array(count);
  const falling = new Uint8Array(count);
  const point = new THREE.Vector3();
  const tint = new THREE.Color();

  function spawn(i, scattered) {
    const graduates = Math.random() < GRADUATION_CHANCE;
    theta[i] = Math.random() * Math.PI * 2;
    peak[i] = graduates ? 1 : 0.08 + Math.pow(Math.random(), 1.7) * 0.82;
    speed[i] = 0.035 + Math.random() * 0.07;
    progress[i] = scattered ? Math.random() * peak[i] : 0;
    fade[i] = 1;
    falling[i] = 0;
  }

  function write(i) {
    const p = progress[i];
    curvePoint(p, theta[i], point);
    layer.position.set([point.x, point.y, point.z], i * 3);
    tint.copy(PALETTE.dimAccent).lerp(PALETTE.accent, Math.min(1, p * 1.4));
    if (p > 0.75) tint.lerp(PALETTE.hot, (p - 0.75) * 2.4);
    if (falling[i]) tint.lerp(PALETTE.bad, 1 - fade[i]);
    layer.color.set([tint.r, tint.g, tint.b], i * 3);
    layer.size[i] = 1.1 + p * 1.7;
    layer.alpha[i] = falling[i] ? fade[i] * 0.55 : 0.3 + p * 0.7;
  }

  function step(dt, onGraduate) {
    let climbing = 0;
    for (let i = 0; i < count; i += 1) {
      if (falling[i]) {
        progress[i] = Math.max(0, progress[i] - speed[i] * 1.8 * dt);
        fade[i] -= dt * 0.55;
        if (fade[i] <= 0) spawn(i, false);
      } else {
        // Buyers dry up as a stalling token nears its peak.
        const slow = peak[i] < 1 ? Math.min(1, 0.25 + (peak[i] - progress[i]) * 6) : 1;
        progress[i] += speed[i] * slow * dt;
        if (progress[i] >= 1) {
          onGraduate(curvePoint(1, theta[i], point).clone());
          spawn(i, false);
        } else if (progress[i] >= peak[i]) {
          falling[i] = 1;
        }
        climbing += 1;
      }
      write(i);
    }
    layer.markDirty();
    return climbing;
  }

  for (let i = 0; i < count; i += 1) spawn(i, true);
  return { layer, step };
}

function createSparks() {
  const layer = createPointLayer(SPARK.pool);
  const velocity = new Float32Array(SPARK.pool * 3);
  const life = new Float32Array(SPARK.pool);
  const maxLife = new Float32Array(SPARK.pool).fill(1);
  let cursor = 0;

  function burst(origin, color) {
    const outX = origin.x / CURVE.radius;
    const outZ = origin.z / CURVE.radius;
    for (let k = 0; k < SPARK.perBurst; k += 1) {
      const i = cursor;
      cursor = (cursor + 1) % SPARK.pool;
      const push = 0.5 + Math.random() * 1.7;
      layer.position.set([origin.x, origin.y, origin.z], i * 3);
      velocity.set([
        outX * push + (Math.random() - 0.5) * 1.2,
        1.1 + Math.random() * 2.2,
        outZ * push + (Math.random() - 0.5) * 1.2,
      ], i * 3);
      maxLife[i] = SPARK.life * (0.55 + Math.random() * 0.45);
      life[i] = maxLife[i];
      layer.color.set([color.r, color.g, color.b], i * 3);
      layer.size[i] = 1.4 + Math.random() * 1.4;
    }
  }

  function step(dt) {
    const { position } = layer;
    for (let i = 0; i < SPARK.pool; i += 1) {
      if (life[i] <= 0) { layer.alpha[i] = 0; continue; }
      life[i] -= dt;
      const j = i * 3;
      velocity[j + 1] += SPARK.gravity * dt;
      for (let axis = 0; axis < 3; axis += 1) {
        velocity[j + axis] *= SPARK.drag;
        position[j + axis] += velocity[j + axis] * dt;
      }
      layer.alpha[i] = Math.max(0, life[i] / maxLife[i]);
    }
    layer.markDirty();
  }

  return { layer, burst, step };
}

/**
 * @param {{ canvas: HTMLCanvasElement, container: HTMLElement, reducedMotion: boolean,
 *           onStats: (stats: {onCurve: number, graduated: number, lastScore: number|null}, urgent?: boolean) => void }} options
 */
export function createGraduationScene({ canvas, container, reducedMotion, onStats }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 120);
  const world = new THREE.Group();
  const spin = new THREE.Group();
  scene.add(world);
  world.add(spin);

  const ring = createGraduationRing();
  const isNarrow = container.clientWidth < NARROW_LAYOUT;
  const tokens = createTokenSim(isNarrow ? TOKEN_COUNT.narrow : TOKEN_COUNT.wide);
  const sparks = createSparks();
  spin.add(createFunnel(), ring.group, tokens.layer.points, sparks.layer.points);

  let stats = { onCurve: 0, graduated: 0, lastScore: null };
  let pulse = 0;
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };

  function handleGraduate(origin) {
    const score = randomScore();
    stats = { ...stats, graduated: stats.graduated + 1, lastScore: score };
    pulse = 1;
    sparks.burst(origin, BAND_COLOR[scoreBand(score)]);
    onStats(stats, true);
  }

  function layout() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const halfTan = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2));
    const fitDistance = FIT_HALF_WIDTH / (halfTan * camera.aspect);
    const distance = Math.max(CAMERA_BASE_DISTANCE, fitDistance);
    camera.position.copy(CAMERA_TARGET).addScaledVector(CAMERA_DIR, distance);
    camera.lookAt(CAMERA_TARGET);
    camera.updateProjectionMatrix();
    const wide = width >= WIDE_LAYOUT;
    world.position.set(wide ? 4.6 : 0, wide ? -0.4 : distance * 0.17, 0);
    const scale = dpr * height * 0.15 * Math.pow(distance / CAMERA_BASE_DISTANCE, 0.35);
    [tokens.layer.material, sparks.layer.material].forEach((material) => {
      material.uniforms.uScale.value = scale;
      material.uniforms.uDistance.value = distance;
    });
  }

  function update(dt) {
    const climbing = tokens.step(dt, handleGraduate);
    sparks.step(dt);
    if (climbing !== stats.onCurve) stats = { ...stats, onCurve: climbing };
    onStats(stats);

    pulse = Math.max(0, pulse - dt * 1.3);
    ring.haloMaterial.opacity = 0.06 + pulse * 0.4;
    ring.coreMaterial.color.copy(PALETTE.accent).lerp(PALETTE.hot, pulse * 0.7);

    pointer.x += (pointer.targetX - pointer.x) * 0.04;
    pointer.y += (pointer.targetY - pointer.y) * 0.04;
    const scrollTilt = Math.min(1, window.scrollY / Math.max(1, container.clientHeight));
    spin.rotation.y += (AUTO_SPIN + pointer.x * 0.25) * dt;
    world.rotation.x = pointer.y * 0.16 + scrollTilt * 0.42;
    world.rotation.z = pointer.x * -0.06;
  }

  let running = false;
  let inView = true;
  let rafId = 0;
  let last = 0;

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(MAX_DT, (now - last) / 1000);
    last = now;
    update(dt);
    renderer.render(scene, camera);
  }

  function start() {
    if (running || reducedMotion || !inView || document.hidden) return;
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  function renderStill() {
    layout();
    tokens.step(0, handleGraduate);
    stats = { ...stats, onCurve: tokens.layer.alpha.length };
    onStats(stats, true);
    renderer.render(scene, camera);
  }

  new ResizeObserver(() => {
    layout();
    if (!running) renderer.render(scene, camera);
  }).observe(container);

  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView) start(); else stop();
  }).observe(container);

  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  window.addEventListener('pointermove', (event) => {
    pointer.targetX = event.clientX / window.innerWidth - 0.5;
    pointer.targetY = event.clientY / window.innerHeight - 0.5;
  }, { passive: true });

  renderStill();
  start();
}
