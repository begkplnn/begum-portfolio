// Galloping tiger drawn in tiny ASCII characters, played from the frames in tiger-frames.js.
// Usage: <canvas class="tiger-run"></canvas> (add data-flip to face left)
(() => {
const data = window.TIGER_FRAMES;
const canvases = [...document.querySelectorAll('canvas.tiger-run')];
if (!data || !canvases.length) return;
const { cols: COLS, rows: ROWS, frames: FRAMES } = data;
const FS = 5, CW = FS * .6, FRAME_MS = 85;
const FUR = '.:-=+*x#%@', EDGE = '.:;', STRIPE = '/\\|';
const hash = (x, y, s) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 17.3) * 43758.5; return v - Math.floor(v); };

const tigers = canvases.map((cv, i) => {
  const dpr = devicePixelRatio || 1;
  cv.width = COLS * CW * dpr; cv.height = ROWS * FS * dpr;
  cv.style.aspectRatio = `${COLS * CW} / ${ROWS * FS}`;
  if (cv.hasAttribute('data-flip')) cv.style.transform = 'scaleX(-1)';
  return { cv, ctx: cv.getContext('2d'), dpr, offset: i * 4, visible: true };
});

function render(tg, step) {
  const f = FRAMES[(step + tg.offset) % FRAMES.length], c = tg.ctx;
  c.setTransform(tg.dpr, 0, 0, tg.dpr, 0, 0); c.clearRect(0, 0, COLS * CW, ROWS * FS);
  c.font = `${FS}px "JetBrains Mono", ui-monospace, Menlo, monospace`; c.textBaseline = 'top';
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const v = f.charCodeAt(y * COLS + x) - 48;
    if (!v) continue;
    const h = hash(x, y, step % 5);
    if (v === 1) { c.fillStyle = 'rgba(232,129,58,.55)'; c.fillText(EDGE[h * 3 | 0], x * CW, y * FS); }
    else if (v === 2) { c.fillStyle = '#6b2f0e'; c.fillText(STRIPE[h * 3 | 0], x * CW, y * FS); }
    else {
      // brighter fur gets denser characters; a few random speckles shimmer like the reference horse
      const k = (v - 3) / 6, ch = FUR[Math.min(9, 3 + (k * 6 + h * 2) | 0)], l = h > .93 ? 1.35 : .9 + k * .35;
      c.fillStyle = `rgb(${Math.min(255, 232 * l) | 0},${Math.min(255, 129 * l) | 0},${Math.min(255, 58 * l) | 0})`;
      c.fillText(ch, x * CW, y * FS);
    }
  }
}

const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const io = new IntersectionObserver(es => es.forEach(e => { tigers.find(t => t.cv === e.target).visible = e.isIntersecting; }));
tigers.forEach(t => io.observe(t.cv));
let last = 0, step = 0;
function loop(now) {
  if (now - last > FRAME_MS) { last = now; step++; for (const tg of tigers) if (tg.visible) render(tg, step); }
  requestAnimationFrame(loop);
}
tigers.forEach(tg => render(tg, 0));
if (!still) requestAnimationFrame(loop);
})();
