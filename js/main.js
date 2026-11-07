import { initTilt } from './tilt.js';
import { initOrderBook } from './orderbook.js';
import { scoreBand } from './scores.js';

const HUD_INTERVAL_MS = 250;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function hasWebGL() {
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2') || probe.getContext('webgl'));
  } catch {
    return false;
  }
}

function createHudWriter(root) {
  const fields = Object.fromEntries(
    [...root.querySelectorAll('[data-hud]')].map((el) => [el.dataset.hud, el]),
  );
  let lastWrite = 0;
  return (stats, urgent = false) => {
    const now = performance.now();
    if (!urgent && now - lastWrite < HUD_INTERVAL_MS) return;
    lastWrite = now;
    fields.onCurve.textContent = stats.onCurve.toLocaleString('en-US');
    fields.graduated.textContent = stats.graduated.toLocaleString('en-US');
    if (stats.lastScore !== null) {
      fields.lastScore.textContent = String(stats.lastScore);
      fields.lastScore.dataset.band = scoreBand(stats.lastScore);
    }
  };
}

async function initHero() {
  const hero = document.querySelector('.hero');
  const canvas = document.getElementById('curve-canvas');
  if (!hero || !canvas) return;
  if (!hasWebGL()) {
    hero.classList.add('no-webgl');
    return;
  }
  try {
    const { createGraduationScene } = await import('./graduation-scene.js');
    createGraduationScene({ canvas, container: hero, reducedMotion, onStats: createHudWriter(hero) });
    hero.classList.add('is-ready');
  } catch (error) {
    console.error('BaldQuant: 3D hero failed to start, showing the static fallback.', error);
    hero.classList.add('no-webgl');
  }
}

initHero();
initTilt({ reducedMotion });
initOrderBook({ reducedMotion });
