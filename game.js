// Pixel forest walk: move with arrows / WASD / on-screen pad, collect the fireflies, read and leave notes
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

// canvas sizing: whole 16px tiles
let cols, rows, dpr;
function resize() {
  dpr = devicePixelRatio || 1;
  const w = cv.parentElement.clientWidth;
  cols = Math.min(W, Math.floor(w / TS)); rows = w < 600 ? 24 : 32;
  cv.width = cols * TS * dpr; cv.height = rows * TS * dpr;
  cv.style.width = cols * TS + 'px'; cv.style.height = rows * TS + 'px';
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
  moving = held.size > 0 && now - lastStep < STEP_MS * 3;
  if (!held.size || now - lastStep < STEP_MS) return;
  lastStep = now;
  const dx = (held.has('r') ? 1 : 0) - (held.has('l') ? 1 : 0), dy = (held.has('d') ? 1 : 0) - (held.has('u') ? 1 : 0);
  facing = dx > 0 ? 'right' : dx < 0 ? 'left' : dy < 0 ? 'up' : 'down';
  if (walkable(player.x + dx, player.y + dy)) { player.x += dx; player.y += dy; }
  else if (dx && walkable(player.x + dx, player.y)) player.x += dx;
  else if (dy && walkable(player.x, player.y + dy)) player.y += dy;
  updateReading();
  for (const f of flies) if (!f.got && Math.abs(f.x - player.x) <= 1 && Math.abs(f.y - player.y) <= 1) {
    f.got = true; got++; pops.push({ x: f.x, y: f.y, t: now }); updateHud();
    if (got === FLIES) msg.hidden = false;
  }
}

// drawing: top-down pixel art, all made in code. Each tile is 8×8 art pixels, shown at 2× (16px).
const A = 8, Z = 2, TS = A * Z;
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const PAL = {
  [T.GRASS]: ['#86742e', '#958234', '#a3903a', '#b29e44'].map(hex),
  [T.FLOWER]: ['#86742e', '#958234', '#a3903a', '#b29e44'].map(hex),
  [T.TREE]: ['#3e2f17', '#48371b', '#52401f', '#5c4823'].map(hex),
  [T.WATER]: ['#2a5482', '#2f5d8c', '#346696', '#3a6f9f'].map(hex),
  [T.SAND]: ['#bfa66c', '#c9b27a', '#d2bd85', '#dccb97'].map(hex),
  [T.GROUND]: ['#8a643a', '#987042', '#a67c4a', '#b38954'].map(hex),
};
const FOAM = hex('#a9d2ea');

// the whole world painted once into an offscreen canvas, one pixel per art pixel
const base = document.createElement('canvas');
function paintWorld() {
  base.width = W * A; base.height = H * A;
  const b = base.getContext('2d'), img = b.createImageData(base.width, base.height), d = img.data;
  for (let py = 0; py < H * A; py++) for (let px = 0; px < W * A; px++) {
    // ragged borders: near a tile edge, borrow the neighbour's ground now and then
    const jx = px + ((hash(px, py, 31) - .5) * 4 | 0), jy = py + ((hash(px, py, 37) - .5) * 4 | 0);
    let tile = at(jx >> 3, jy >> 3), own = at(px >> 3, py >> 3);
    if (own === T.WATER || tile === T.WATER) tile = own; // keep shorelines true to where you can walk
    const r = hash(px, py, 5), v = fbm(px * .03, py * .03, 21) + (r - .5) * .22;
    const k = Math.max(0, Math.min(3, (v - .22) * 7 | 0));
    let c = PAL[tile][k];
    if (tile === T.WATER) { // foam where the water meets land
      const lx = px & 7, ly = py & 7, tx = px >> 3, ty = py >> 3;
      const edge = (ly === 0 && at(tx, ty - 1) !== T.WATER) || (lx === 0 && at(tx - 1, ty) !== T.WATER) ||
                   (lx === 7 && at(tx + 1, ty) !== T.WATER) || (ly === 7 && at(tx, ty + 1) !== T.WATER);
      if (edge && r < .8) c = FOAM;
      else if (ly === 1 && at(tx, ty - 1) !== T.WATER) c = PAL[T.WATER][0]; // a little shadow under the bank
    }
    const i = (py * W * A + px) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  b.putImageData(img, 0, 0);
  // grass tufts: a light blade tip over two dark ones
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = map[y * W + x]; if (t !== T.GRASS && t !== T.FLOWER) continue;
    for (let j = 0; j < 2; j++) {
      if (hash(x, y, 60 + j) < .45) continue;
      const gx = x * A + (hash(x, y, 70 + j) * 6 | 0), gy = y * A + 1 + (hash(x, y, 80 + j) * 6 | 0);
      b.fillStyle = '#5f5f22'; b.fillRect(gx, gy + 1, 1, 1); b.fillRect(gx + 2, gy + 1, 1, 1);
      b.fillStyle = '#c9b95c'; b.fillRect(gx + 1, gy, 1, 1);
    }
  }
  // flowers: a plus of petals with a yellow middle
  const PETAL = ['#e0503c', '#f4efe0', '#f2d24b', '#d77bd0'];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (map[y * W + x] === T.FLOWER) {
    const s = shade[y * W + x], fx = x * A + 2 + (s * 4 | 0), fy = y * A + 2 + (s * 13 % 4 | 0);
    b.fillStyle = PETAL[s * 37 % 4 | 0]; b.fillRect(fx - 1, fy, 3, 1); b.fillRect(fx, fy - 1, 1, 3);
    b.fillStyle = '#f2d24b'; b.fillRect(fx, fy, 1, 1);
  }
}

// trees: pines and round leafy trees, a few already autumn orange. Three sway poses each.
function sprite(w, h, fn) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); fn((x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); }); return c;
}
function swayed(src, k) { // shift the top of the crown sideways by k pixels
  const c = document.createElement('canvas'); c.width = src.width + 2; c.height = src.height;
  const g = c.getContext('2d'), cut = Math.round(src.height * .45);
  g.drawImage(src, 0, cut, src.width, src.height - cut, 1, cut, src.width, src.height - cut);
  g.drawImage(src, 0, 0, src.width, cut, 1 + k, 0, src.width, cut);
  return c;
}
function pine(seed) {
  const [ol, dk, md, lt] = ['#132a14', '#1d3f1d', '#2b5a28', '#45803a'];
  return sprite(11, 16, put => {
    for (let y = 0; y < 13; y++) {
      const hw = Math.min(5, 1 + (y % 4) + (y >> 2) * .8 | 0);
      for (let x = -hw; x <= hw; x++) {
        const edge = x === -hw || x === hw || y % 4 === 3, r = hash(x, y, seed);
        put(5 + x, y, edge ? ol : x < 0 ? (r < .25 ? lt : md) : (r < .2 ? md : dk));
      }
    }
    for (let y = 13; y < 16; y++) { put(5, y, '#4a3020'); put(4, y, '#3a2416'); }
  });
}
const LEAVES = {
  orange: ['#4a1f08', '#9a4413', '#d0691c', '#f0a040'],
  amber: ['#4a2e06', '#a06a12', '#d89a22', '#f4c858'],
  red: ['#3e1008', '#88281a', '#b8402a', '#e07548'],
  green: ['#163016', '#2a5a26', '#3a7a32', '#62a548'],
};
function leafy(seed, colour) {
  const [ol, dk, md, lt] = LEAVES[colour];
  const cx = 6, cy = 5.5, R = 5.6;
  return sprite(13, 15, put => {
    for (let y = 0; y < 12; y++) for (let x = 0; x < 13; x++) {
      const bump = Math.sin(Math.atan2(y - cy, x - cx) * 5 + seed) * .6, dd = Math.hypot(x - cx, y - cy);
      if (dd > R + bump) continue;
      const v = ((x - cx) * -.6 + (y - cy) * -.8) / R, r = hash(x, y, seed);
      put(x, y, dd > R + bump - 1 ? ol : v + (r - .5) * .5 > .35 ? lt : v + (r - .5) * .4 > -.35 ? md : dk);
    }
    for (let y = 11; y < 15; y++) { put(6, y, '#4a3020'); put(5, y, '#3a2416'); }
  });
}
const TREES = [pine(1), pine(2), leafy(3, 'orange'), leafy(4, 'amber'), leafy(5, 'red'), leafy(6, 'orange'), leafy(7, 'green')].map(s => [-1, 0, 1].map(k => swayed(s, k)));
const treeKind = s => s < .3 ? (s < .15 ? 0 : 1) : s < .92 ? 2 + (s * 31 % 4 | 0) : 6;

// the player: a little white figure with a black outline and lavender shading.
// Rows of art: k outline, w white, l lavender shade, e eye. Eyes move to show which way it faces.
const HEAD = ['..kkkkk..', '.kwwwwwk.', 'kwwwwwwlk', 'kwwwwwwlk', 'kwwwwwwlk', '.kwwwwlk.', '.kkkkkkk.', '.kwwwwlk.', '.kwwwwlk.'];
const LEGS = [
  ['.kwwwllk.', '.kwlkwlk.', '.kkk.kkk.'], // standing
  ['.kwwkwlk.', 'kwlk.kwk.', 'kkk..kkk.'], // stepping
  ['.kwlkwwk.', '.kwk.kwlk', '.kkk..kkk'],
];
const EYES = { down: [2, 5], right: [4, 6], left: [1, 4], up: [] };
const HC = { k: '#16121c', w: '#f7f5ff', l: '#b9b2e8', e: '#16121c' };
const heroCache = {};
function hero(dir, legs, blink) {
  const key = dir + legs + blink;
  return heroCache[key] || (heroCache[key] = sprite(9, 12, put => {
    const rows = [...HEAD, ...LEGS[legs]].map(r => [...r]);
    for (const x of EYES[dir]) { rows[3][x] = blink ? 'w' : 'e'; rows[4][x] = 'e'; }
    rows.forEach((row, y) => row.forEach((ch, x) => HC[ch] && put(x, y, HC[ch])));
  }));
}
// a note sign: a cream board on a post
const SIGN = sprite(8, 9, put => {
  for (let x = 0; x < 8; x++) for (let y = 0; y < 5; y++) put(x, y, x === 0 || y === 0 || x === 7 || y === 4 ? '#3b2416' : '#f1e2c2');
  [[3, 1], [4, 1], [4, 2], [3, 3]].forEach(([x, y]) => put(x, y, '#3b2416'));
  for (let y = 5; y < 9; y++) put(3, y, '#5a3a22');
});

const INK = '#f1e2c2', BG = '#231811';
let moving = 0, facing = 'down';
function draw(now) {
  const t = now / 1000;
  const camX = Math.max(0, Math.min(W - cols, player.x - (cols >> 1)));
  const camY = Math.max(0, Math.min(H - rows, player.y - (rows >> 1)));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(base, camX * A, camY * A, cols * A, rows * A, 0, 0, cols * TS, rows * TS);
  // water shimmer
  ctx.fillStyle = 'rgba(214,236,250,.75)';
  for (let sy = 0; sy < rows; sy++) for (let sx = 0; sx < cols; sx++) {
    const x = sx + camX, y = sy + camY; if (map[y * W + x] !== T.WATER) continue;
    const s = shade[y * W + x], w = Math.sin(t * 1.3 + x * .45 - y * .2 + s * 6) + Math.sin(t * .8 - x * .15 + y * .5);
    if (w > 1.1) ctx.fillRect(sx * TS + (2 + (s * 3 | 0)) * Z, sy * TS + (3 + (s * 7 % 3 | 0)) * Z, (w > 1.5 ? 4 : 3) * Z, Z);
  }
  // note signs
  for (const n of notes) {
    if (n.x < camX || n.y < camY || n.x >= camX + cols || n.y >= camY + rows) continue;
    const px = (n.x - camX) * TS, py = (n.y - camY) * TS;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(px + 2 * Z, py + 7 * Z, 4 * Z, Z);
    ctx.drawImage(SIGN, px, py - Z, 8 * Z, 9 * Z);
    if (n === reading && Math.sin(t * 6) > -.3) { ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = Z; ctx.strokeRect(px - Z, py - 2 * Z, 10 * Z, 11 * Z); }
  }
  // the player, behind the trees of the rows in front
  const sx = (player.x - camX) * TS, sy = (player.y - camY) * TS;
  const drawHero = () => {
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(sx + Z, sy + 7 * Z, 6 * Z, Z);
    const blink = (t % 3.2) < .14;
    ctx.drawImage(hero(facing, moving ? 1 + ((player.x + player.y) & 1) : 0, blink), sx - Z / 2, sy + TS - 11 * Z, 9 * Z, 12 * Z);
  };
  // trees, back to front, so each row's crowns overlap the row behind
  for (let ty = camY - 1; ty < camY + rows + 2; ty++) {
    if (ty === player.y + 1) drawHero();
    for (let tx = camX - 1; tx < camX + cols + 1; tx++) {
      if (at(tx, ty) !== T.TREE || tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
      const s = shade[ty * W + tx], set = TREES[treeKind(s)];
      const pose = set[Math.round(Math.sin(t * 1.4 + tx * .35 + ty * .2) * .9) + 1];
      const ox = ((hash(tx, ty, 9) - .5) * 3 | 0) - 1;
      ctx.drawImage(pose, (tx - camX) * TS + (A - pose.width) / 2 * Z + ox * Z, (ty - camY + 1) * TS - pose.height * Z + 2 * Z, pose.width * Z, pose.height * Z);
    }
  }
  if (player.y + 1 >= camY + rows + 2) drawHero();
  // dusk: the edges dim, a warm lantern light around the player
  const flick = Math.sin(t * 11) * .3 + Math.sin(t * 23.7) * .2;
  const g = ctx.createRadialGradient(sx + TS / 2, sy, TS * 3, sx + TS / 2, sy, TS * (15 + flick));
  g.addColorStop(0, 'rgba(255,180,90,.07)'); g.addColorStop(1, 'rgba(34,14,10,.5)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, cols * TS, rows * TS);
  // fireflies glow and blink
  ctx.globalCompositeOperation = 'lighter';
  for (const f of flies) {
    if (f.got || f.x < camX || f.y < camY || f.x >= camX + cols || f.y >= camY + rows) continue;
    const on = Math.sin(t * 4 + f.ph); if (on < -.3) continue;
    const fx = (f.x - camX) * TS + TS / 2 + Math.sin(t * 2 + f.ph) * 3, fy = (f.y - camY) * TS + TS / 2 + Math.cos(t * 1.7 + f.ph) * 3;
    const gl = ctx.createRadialGradient(fx, fy, 0, fx, fy, TS * 1.6);
    gl.addColorStop(0, `rgba(255,226,110,${.35 + on * .2})`); gl.addColorStop(1, 'rgba(255,226,110,0)');
    ctx.fillStyle = gl; ctx.fillRect(fx - TS * 1.6, fy - TS * 1.6, TS * 3.2, TS * 3.2);
    ctx.fillStyle = '#fff6b0'; ctx.fillRect(Math.round(fx - Z), Math.round(fy - Z), 2 * Z, 2 * Z);
  }
  ctx.globalCompositeOperation = 'source-over';
  // pixel name plate
  ctx.font = `${Math.round(TS * .62)}px Silkscreen, "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const tw = ctx.measureText('you').width + 8, ty = sy - TS * 1.6;
  ctx.fillStyle = INK; ctx.fillRect(sx + TS / 2 - tw / 2, ty - 1, tw, TS * .8);
  ctx.fillStyle = BG; ctx.fillText('you', sx + TS / 2, ty + 1);
  // +1 pops
  pops = pops.filter(p => now - p.t < 900);
  ctx.fillStyle = '#ffe27a';
  for (const p of pops) {
    const k = (now - p.t) / 900;
    if ((now / 90 | 0) % 2 || k < .5) ctx.fillText('+1', (p.x - camX) * TS + TS / 2, (p.y - camY) * TS - k * TS * 2);
  }
  ctx.textAlign = 'left';
}

// only animate while the game is on screen
let visible = false, rafId = 0;
function loop(now) { step(now); draw(now); rafId = visible ? requestAnimationFrame(loop) : 0; }
new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !rafId) rafId = requestAnimationFrame(loop); }).observe(cv);
addEventListener('resize', resize);
paintWorld(); resize(); reset(); updateReading();
})();
