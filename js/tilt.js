// Screenshot card that starts tipped back in 3D and settles flat as it
// scrolls into view, with a small pointer tilt and glare on hover.
const SCROLL_TILT_X = 28;
const SCROLL_TILT_Y = -14;
const SCROLL_LIFT_PX = 70;
const POINTER_TILT = 6;
const EASE = 0.16;
const SETTLE_EPSILON = 0.002;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function setupTilt(el) {
  let visible = false;
  let raf = 0;
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0, active: false };

  function render() {
    raf = 0;
    const rect = el.getBoundingClientRect();
    const viewport = window.innerHeight;
    const settle = easeOutCubic(clamp((viewport - rect.top) / (viewport * 0.85), 0, 1));
    pointer.x += (pointer.targetX - pointer.x) * EASE;
    pointer.y += (pointer.targetY - pointer.y) * EASE;

    const rx = (1 - settle) * SCROLL_TILT_X - pointer.y * POINTER_TILT;
    const ry = (1 - settle) * SCROLL_TILT_Y + pointer.x * POINTER_TILT;
    const lift = (1 - settle) * SCROLL_LIFT_PX;
    el.style.transform = `translate3d(0, ${lift.toFixed(1)}px, 0) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    el.style.setProperty('--glare-x', `${(pointer.x * 100).toFixed(1)}%`);
    el.style.setProperty('--glare-y', `${(pointer.y * 100).toFixed(1)}%`);

    const moving = Math.abs(pointer.targetX - pointer.x) > SETTLE_EPSILON
      || Math.abs(pointer.targetY - pointer.y) > SETTLE_EPSILON;
    if (moving) schedule();
  }

  function schedule() {
    if (!visible || raf) return;
    raf = requestAnimationFrame(render);
  }

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    el.classList.toggle('is-animating', visible);
    schedule();
  }, { rootMargin: '15% 0px' }).observe(el);

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });

  el.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    const rect = el.getBoundingClientRect();
    pointer.targetX = (event.clientX - rect.left) / rect.width - 0.5;
    pointer.targetY = (event.clientY - rect.top) / rect.height - 0.5;
    el.classList.add('is-hovered');
    schedule();
  });

  el.addEventListener('pointerleave', () => {
    pointer.targetX = 0;
    pointer.targetY = 0;
    el.classList.remove('is-hovered');
    schedule();
  });
}

/** @param {{ reducedMotion: boolean }} options */
export function initTilt({ reducedMotion }) {
  if (reducedMotion) return;
  document.querySelectorAll('[data-tilt]').forEach(setupTilt);
}
