// ASCII jungle walk: move with arrows / WASD / on-screen pad, collect the fireflies, read and leave notes
(() => {
const cv = document.getElementById('gcanvas'), ctx = cv.getContext('2d');
const hud = document.getElementById('ghud'), overlay = document.getElementById('gstart'), msg = document.getElementById('gmsg');
const W = 240, H = 110, FLIES = 10, STEP_MS = 85, WORLD_SEED = 7; // fixed world so notes stay where they were left
const T = { GROUND: 0, GRASS: 1, WATER: 2, TREE: 3, SAND: 4, FLOWER: 5 };

// value noise
const hash = (x, y, s = 0) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
const smooth = t => t * t * (3 - 2 * t);
function noise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
const fbm = (x, y, s) => noise(x, y, s) * .6 + noise(x * 2.1, y * 2.1, s + 9) * .3 + noise(x * 4.3, y * 4.3, s + 3) * .1;

// world generation (x is scaled by .6 because character cells are taller than wide)
const map = new Uint8Array(W * H), shade = new Float32Array(W * H);
const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? T.TREE : map[y * W + x];
function generate(seed) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = fbm(x * .6 * .07, y * .07, seed), f = fbm(x * .6 * .11, y * .11, seed + 50);
    let t = n < .34 ? T.WATER : f > .66 ? T.TREE : T.GRASS;
    if (t === T.GRASS && hash(x, y, seed + 7) < .008) t = T.FLOWER;
    if (t === T.GRASS && f < .22) t = T.GROUND;
    // edge of the world is forest
    if (x < 2 || y < 2 || x > W - 3 || y > H - 3) t = T.TREE;
    map[y * W + x] = t; shade[y * W + x] = hash(x, y, seed + 3);
  }
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (map[i] !== T.WATER && map[i] !== T.TREE &&
        [map[i - 1], map[i + 1], map[i - W], map[i + W]].includes(T.WATER)) map[i] = T.SAND;
  }
}
const walkable = (x, y) => { const t = at(x, y); return t !== T.WATER && t !== T.TREE; };
function randomLand(minDist) {
  for (let k = 0; k < 5000; k++) {
    const x = 3 + (Math.random() * (W - 6) | 0), y = 3 + (Math.random() * (H - 6) | 0);
    if (walkable(x, y) && Math.hypot(x - player.x, (y - player.y) * 1.6) >= minDist) return { x, y };
  }
  return { x: player.x, y: player.y };
}

// the walkable tile closest to (x, y)
function nearestLand(x, y) {
  for (let r = 0; r < 60; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
    if (Math.max(Math.abs(dx), Math.abs(dy)) === r && walkable(x + dx, y + dy)) return { x: x + dx, y: y + dy };
  return { x, y };
}

let player = { x: W / 2 | 0, y: H / 2 | 0 }, flies = [], pops = [], got = 0, notes = [], spawn;
generate(WORLD_SEED);
spawn = nearestLand(W / 2 | 0, H / 2 | 0);
function reset() {
  player = { ...spawn };
  flies = []; for (let i = 0; i < FLIES; i++) flies.push({ ...randomLand(18), ph: Math.random() * 6 });
  got = 0; pops = []; msg.hidden = true; updateHud();
}
const updateHud = () => { hud.textContent = `fireflies ${got}/${FLIES}`; };

// notes: signs in the world plus a list under the game
const read = document.getElementById('gread'), form = document.getElementById('gform'), list = document.getElementById('glist');
const fname = document.getElementById('gname'), ftext = document.getElementById('gtext'), ferr = document.getElementById('gerr');
const placeNote = n => (n.x < 0 ? { ...n, ...nearestLand(spawn.x + 4, spawn.y - 2) } : n);
const when = d => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
function renderList() {
  list.replaceChildren(...notes.map(n => {
    const li = document.createElement('li'), q = document.createElement('p'), by = document.createElement('small');
    q.textContent = `“${n.text}”`; by.textContent = `— ${n.name} · ${when(n.created_at)}`;
    li.append(q, by); return li;
  }));
  document.getElementById('gcount').textContent = notes.length;
}
Notes.load().then(ns => { notes = ns.map(placeNote); renderList(); });
document.getElementById('gmode').hidden = Notes.online;

let reading = null;
function updateReading() {
  const n = notes.find(n => Math.abs(n.x - player.x) <= 1 && Math.abs(n.y - player.y) <= 1) || null;
  if (n === reading) return;
  reading = n; read.hidden = !n;
  if (n) { read.replaceChildren(); const q = document.createElement('p'), by = document.createElement('small');
    q.textContent = `“${n.text}”`; by.textContent = `— ${n.name}`; read.append(q, by); }
}

function openForm() {
  start(); held.clear();
  const wait = Notes.waitSeconds();
  ferr.textContent = wait ? `You can leave another note in ${wait}s.` : '';
  form.hidden = false; fname.focus();
}
function closeForm() { form.hidden = true; cv.focus({ preventScroll: true }); }
document.getElementById('gnote').addEventListener('click', openForm);
document.getElementById('gcancel').addEventListener('click', closeForm);
form.addEventListener('keydown', e => { if (e.key === 'Escape') closeForm(); });
form.addEventListener('submit', async e => {
  e.preventDefault();
  const wait = Notes.waitSeconds();
  if (wait) { ferr.textContent = `You can leave another note in ${wait}s.`; return; }
  ferr.textContent = 'Pinning…';
  try {
    const n = await Notes.add({ x: player.x, y: player.y, name: fname.value, text: ftext.value });
    notes.unshift(n); renderList(); reading = undefined; updateReading();
    ftext.value = ''; ferr.textContent = ''; closeForm();
  } catch { ferr.textContent = 'Could not save your note. Please try again.'; }
});

// canvas sizing
let fs, cw, cols, rows, dpr;
function resize() {
  dpr = devicePixelRatio || 1;
  const w = cv.parentElement.clientWidth;
  fs = w < 600 ? 13 : 16; cw = fs * .6;
  cols = Math.floor(w / cw); rows = w < 600 ? 26 : 32;
  cv.width = cols * cw * dpr; cv.height = rows * fs * dpr;
  cv.style.width = cols * cw + 'px'; cv.style.height = rows * fs + 'px';
}

// input
const held = new Set(), KEYS = { ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' };
cv.addEventListener('keydown', e => {
  const k = KEYS[e.code]; if (k) { held.add(k); e.preventDefault(); }
  if (e.code === 'Escape') cv.blur();
  if (e.code === 'KeyN') { e.preventDefault(); openForm(); }
});
cv.addEventListener('keyup', e => { const k = KEYS[e.code]; if (k) held.delete(k); });
cv.addEventListener('blur', () => held.clear());
document.querySelectorAll('[data-dir]').forEach(b => {
  const d = b.dataset.dir;
  b.addEventListener('pointerdown', e => { e.preventDefault(); held.add(d); start(); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => held.delete(d)));
});
function start() { overlay.hidden = true; if (!matchMedia('(pointer: coarse)').matches) cv.focus({ preventScroll: true }); }
overlay.addEventListener('click', start);
cv.addEventListener('pointerdown', start);
document.getElementById('gagain').addEventListener('click', () => { reset(); start(); });

let lastStep = 0;
function step(now) {
  if (!held.size || now - lastStep < STEP_MS) return;
  lastStep = now;
  const dx = (held.has('r') ? 1 : 0) - (held.has('l') ? 1 : 0), dy = (held.has('d') ? 1 : 0) - (held.has('u') ? 1 : 0);
  if (walkable(player.x + dx, player.y + dy)) { player.x += dx; player.y += dy; }
  else if (dx && walkable(player.x + dx, player.y)) player.x += dx;
  else if (dy && walkable(player.x, player.y + dy)) player.y += dy;
  updateReading();
  for (const f of flies) if (!f.got && Math.abs(f.x - player.x) <= 1 && Math.abs(f.y - player.y) <= 1) {
    f.got = true; got++; pops.push({ x: f.x, y: f.y, t: now }); updateHud();
    if (got === FLIES) msg.hidden = false;
  }
}

// drawing: 1-bit sepia. Two colours only; light and dark are made with ordered dithering.
const INK = '#f1e2c2', BG = '#231811';
const GRASS = ['|', '/', '\\', '"', ',', "'", ';'];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
function tileChar(tile, x, y, s, t) {
  if (tile === T.GRASS) {
    const wind = Math.sin(t * 1.8 + x * .25 + y * .12 + s * 2);
    return s < .55 ? (wind > .45 ? '/' : wind < -.45 ? '\\' : '|') : GRASS[3 + (s * 40 | 0) % 4];
  }
  if (tile === T.WATER) { const w = Math.sin(t * 1.3 + x * .45 - y * .2 + s) + Math.sin(t * .8 - x * .15 + y * .5); return w > 1.2 ? '~' : w > .7 ? '-' : ''; }
  if (tile === T.TREE) return s < .45 ? '^' : s < .8 ? 'A' : '*';
  if (tile === T.SAND) return s < .5 ? '.' : ':';
  if (tile === T.FLOWER) return 'o';
  return s < .5 ? '.' : ',';
}
function cellBox(px, py, w, h) { ctx.fillStyle = INK; ctx.fillRect(px - 1, py - 1, w + 2, h + 2); ctx.fillStyle = BG; }
function draw(now) {
  const t = now / 1000;
  const camX = Math.max(0, Math.min(W - cols, player.x - (cols >> 1)));
  const camY = Math.max(0, Math.min(H - rows, player.y - (rows >> 1)));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = BG; ctx.fillRect(0, 0, cols * cw, rows * fs);
  ctx.font = `${fs}px "JetBrains Mono", ui-monospace, Menlo, monospace`; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  // lantern light around the player, with a flicker now and then
  const flick = Math.sin(t * 11) * .35 + Math.sin(t * 23.7) * .25 + (Math.sin(t * .9) > .97 ? -4 : 0);
  const R = 14 + flick, lights = flies.filter(f => !f.got);
  ctx.fillStyle = INK;
  for (let sy = 0; sy < rows; sy++) for (let sx = 0; sx < cols; sx++) {
    const x = sx + camX, y = sy + camY;
    if (x >= W || y >= H) continue;
    const i = y * W + x, s = shade[i], tile = map[i];
    let L = .07 + clamp01(1 - Math.hypot((x - player.x) * .6, y - player.y) / R) * 1.85;
    for (const f of lights) { const d = Math.hypot((x - f.x) * .6, y - f.y); if (d < 4.5) L += (1 - d / 4.5) * 1.2; }
    const th = BAYER[(y & 3) * 4 + (x & 3)];
    // brightest light: inverted cream cells (the glow), then normal ink, then sparse night dots
    if (L - 1 > th) {
      ctx.fillRect(sx * cw, sy * fs, cw + .5, fs + .5);
      const ch = tileChar(tile, x, y, s, t);
      if (ch) { ctx.fillStyle = BG; ctx.fillText(ch, sx * cw, sy * fs); ctx.fillStyle = INK; }
    } else if (L > th) { const ch = tileChar(tile, x, y, s, t); if (ch) ctx.fillText(ch, sx * cw, sy * fs); }
    else if (tile !== T.WATER && ((x * 3 + y * 2) % 5 === 0)) ctx.fillText('.', sx * cw, sy * fs);
  }
  const sx = (player.x - camX) * cw, sy = (player.y - camY) * fs;
  // reflection when standing next to water
  if (at(player.x, player.y + 1) === T.WATER) { ctx.fillStyle = INK; ctx.fillText(Math.sin(t * 6) > 0 ? '@' : 'a', sx, sy + fs); }
  // note signs: inverted tiles
  for (const n of notes) {
    if (n.x < camX || n.y < camY || n.x >= camX + cols || n.y >= camY + rows) continue;
    const px = (n.x - camX) * cw, py = (n.y - camY) * fs;
    cellBox(px, py, cw, fs);
    if (n === reading) { ctx.strokeStyle = INK; ctx.strokeRect(px - 3.5, py - 3.5, cw + 7, fs + 7); }
    ctx.fillText('?', px, py);
  }
  // fireflies blink on and off
  ctx.fillStyle = INK;
  for (const f of flies) {
    if (f.got || f.x < camX || f.y < camY || f.x >= camX + cols || f.y >= camY + rows) continue;
    if (Math.sin(t * 4 + f.ph) > -.3) ctx.fillText('*', (f.x - camX) * cw + Math.sin(t * 2 + f.ph) * 2, (f.y - camY) * fs + Math.cos(t * 1.7 + f.ph) * 2);
  }
  // player: an inverted @ with a pixel name plate
  ctx.font = `bold ${fs}px "JetBrains Mono", ui-monospace, Menlo, monospace`;
  cellBox(sx, sy, cw, fs); ctx.fillText('@', sx, sy);
  ctx.font = `${Math.round(fs * .62)}px Silkscreen, "JetBrains Mono", monospace`; ctx.textAlign = 'center';
  const tw = ctx.measureText('begum').width + 8, ty = sy - fs * 1.05;
  ctx.fillStyle = INK; ctx.fillRect(sx + cw / 2 - tw / 2, ty - 1, tw, fs * .8);
  ctx.fillStyle = BG; ctx.fillText('begum', sx + cw / 2, ty + 1);
  // +1 pops
  pops = pops.filter(p => now - p.t < 900);
  ctx.fillStyle = INK;
  for (const p of pops) {
    const k = (now - p.t) / 900;
    if ((now / 90 | 0) % 2 || k < .5) ctx.fillText('+1', (p.x - camX) * cw + cw / 2, (p.y - camY) * fs - k * fs * 2);
  }
  ctx.textAlign = 'left';
}

// only animate while the game is on screen
let visible = false, rafId = 0;
function loop(now) { step(now); draw(now); rafId = visible ? requestAnimationFrame(loop) : 0; }
new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !rafId) rafId = requestAnimationFrame(loop); }).observe(cv);
addEventListener('resize', resize);
resize(); reset(); updateReading();
})();
