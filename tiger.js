const out = document.getElementById('c'), o = out.getContext('2d');
const off = document.createElement('canvas'), g = off.getContext('2d', { willReadFrequently: true });
const RAMP = ' .`:-=+*cx#%@';
const img = new Image(); img.src = 'tiger.jpg';
let src; // pre-shrunk copy so the tiny ASCII grid samples a smooth image, not aliased pixels
const IW = 1079, IH = 687;
const CY = 200, CH = 400; // crop to the band around the eyes
// Eye openings in photo pixels: center, radii, tilt
const EYES = [
  { x: 256, y: 398, rx: 92, ry: 52, rot: 0.28, ix: 258, iy: 395 },
  { x: 866, y: 398, rx: 92, ry: 52, rot: -0.28, ix: 865, iy: 395 },
];
const IRIS_R = 74, LOOK_X = 26, LOOK_Y = 12; // iris radius and how far it can move, in photo pixels
let look = { x: 0, y: 0 }, target = { x: 0, y: 0 };
const freeze = new URLSearchParams(location.search).get('lid');
let cols, rows, fs, cw, dpr;

function resize() {
  dpr = devicePixelRatio || 1;
  cols = innerWidth < 700 ? 130 : 240;
  rows = Math.round(cols * CH / IW * 0.6);
  off.width = cols; off.height = rows;
  fs = Math.min(innerWidth * 0.96 / (cols * 0.6), innerHeight * 0.6 / rows);
  cw = fs * 0.6;
  out.width = cols * cw * dpr; out.height = rows * fs * dpr;
  out.style.width = cols * cw + 'px'; out.style.height = rows * fs + 'px';
}

const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5; return s - Math.floor(s); };

// Photo plus eyelids: the fur above each eye slides down over it; lid 0 = open, 1 = closed
function scene(lid) {
  g.setTransform(cols / IW, 0, 0, rows / CH, 0, -CY * rows / CH);
  g.drawImage(src, 0, 0, IW, IH);
  // irises: redraw each one shifted toward the cursor, kept inside the eye opening
  const dx = look.x * LOOK_X, dy = look.y * LOOK_Y;
  for (const e of EYES) {
    g.save();
    g.translate(e.x, e.y); g.rotate(e.rot);
    g.beginPath(); g.ellipse(0, 0, e.rx, e.ry, 0, 0, 7); g.clip();
    g.rotate(-e.rot); g.translate(-e.x, -e.y);
    g.beginPath(); g.arc(e.ix + dx, e.iy + dy, IRIS_R, 0, 7); g.clip();
    g.drawImage(src, dx, dy, IW, IH);
    g.restore();
  }
  if (lid <= 0) return;
  for (const e of EYES) {
    const drop = lid * e.ry * 2.2;
    g.save();
    g.translate(e.x, e.y); g.rotate(e.rot);
    g.beginPath(); g.ellipse(0, 0, e.rx, e.ry, 0, 0, 7); g.clip();
    g.beginPath(); g.rect(-e.rx, -e.ry, e.rx * 2, drop); g.clip();
    g.rotate(-e.rot); g.translate(-e.x, -e.y);
    g.drawImage(src, 0, drop * 0.9, IW, IH);
    g.restore();
    // dark lid edge
    g.save();
    g.translate(e.x, e.y); g.rotate(e.rot);
    g.beginPath(); g.ellipse(0, 0, e.rx, e.ry, 0, 0, 7); g.clip();
    g.fillStyle = 'rgba(10,6,3,.9)';
    g.fillRect(-e.rx, -e.ry + drop - 8, e.rx * 2, 14);
    g.restore();
  }
}

// Turns the low-res frame into colored ASCII, fading the edges into the background
function render() {
  const d = g.getImageData(0, 0, cols, rows).data;
  o.setTransform(dpr, 0, 0, dpr, 0, 0);
  o.fillStyle = '#0b0906'; o.fillRect(0, 0, cols * cw, rows * fs);
  o.font = `${fs}px ui-monospace, Menlo, Consolas, monospace`; o.textBaseline = 'top';
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = (y * cols + x) * 4;
    const nx = x / cols - .5, ny = y / rows - .5;
    const fade = Math.max(0, Math.min(1, (.5 - Math.abs(nx)) * 7) * Math.min(1, (.5 - Math.abs(ny)) * 5));
    const r = d[i], gr = d[i + 1], b = d[i + 2];
    const L = Math.pow((0.3 * r + 0.59 * gr + 0.11 * b) / 255, 0.8) * fade * (0.95 + 0.1 * hash(x, y));
    const idx = Math.min(RAMP.length - 1, L * 1.15 * (RAMP.length - 1) | 0);
    if (!idx) continue;
    // keep the photo's hue but lift it so dark fur still reads on black
    const avg = (r + gr + b) / 3, sat = 1.6;
    const sr = Math.max(0, avg + (r - avg) * sat), sg = Math.max(0, avg + (gr - avg) * sat), sb = Math.max(0, avg + (b - avg) * sat);
    const m = Math.max(sr, sg, sb, 1), lift = (110 + 145 * Math.min(1, L * 1.3)) / m;
    o.fillStyle = `rgb(${Math.min(255, sr * lift) | 0},${Math.min(255, sg * lift) | 0},${Math.min(255, sb * lift) | 0})`;
    o.fillText(RAMP[idx], x * cw, y * fs);
  }
}

// Timeline: eyes start closed, open slowly, then blink every few seconds
let start, blinkAt, blinkDur = 260;
function lidAt(now) {
  if (freeze !== null) return +freeze;
  const e = now - start;
  if (e < 700) return 1;
  if (e < 2300) { const p = (e - 700) / 1600; return Math.pow(1 - p, 3); }
  const p = (now - blinkAt) / blinkDur;
  if (p >= 1) { blinkAt = now + 2500 + Math.random() * 3000; return 0; }
  if (p < 0) return 0;
  return p < .4 ? p / .4 : 1 - (p - .4) / .6;
}

let lastLid = -1, lastLook = '';
function frame(now) {
  look.x += (target.x - look.x) * .12; look.y += (target.y - look.y) * .12;
  const lid = lidAt(now), lk = look.x.toFixed(2) + ',' + look.y.toFixed(2);
  if (lid !== lastLid || lk !== lastLook) { scene(lid); render(); lastLid = lid; lastLook = lk; }
  requestAnimationFrame(frame);
}

// cursor position relative to the tiger, clamped to -1..1
addEventListener('pointermove', e => {
  const r = out.getBoundingClientRect();
  const cl = v => Math.max(-1, Math.min(1, v));
  target.x = cl((e.clientX - (r.left + r.width / 2)) / (r.width / 2));
  target.y = cl((e.clientY - (r.top + r.height / 2)) / (r.height * 1.5));
});
document.addEventListener('pointerleave', () => { target.x = 0; target.y = 0; });
out.addEventListener('click', () => { if (performance.now() > start + 2300) blinkAt = performance.now(); });
addEventListener('resize', () => { resize(); lastLid = -1; });

img.onload = () => {
  src = img;
  for (let w = IW / 2; w >= 200; w /= 2) {
    const c = document.createElement('canvas'); c.width = w; c.height = w * IH / IW;
    const cx = c.getContext('2d'); cx.imageSmoothingQuality = 'high';
    cx.drawImage(src, 0, 0, c.width, c.height); src = c;
  }
  resize();
  start = performance.now(); blinkAt = start + 4300;
  requestAnimationFrame(frame);
  setTimeout(() => {
    const title = document.getElementById('title'), el = document.getElementById('name'), text = 'BEGUM';
    title.classList.add('on');
    [...text].forEach((ch, i) => setTimeout(() => el.textContent += ch, 160 * i));
  }, 2500);
};
