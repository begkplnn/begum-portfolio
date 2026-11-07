// Projects as tiger-paw tamagotchis hanging from a silver chain.
// Built from the project cards in #projects (which stay in the page for search engines and screen readers).
// Each paw swings when the cursor brushes past, shows a tiny LCD animation, and opens to show the project.
(() => {
const section = document.getElementById('projects'), chain = document.getElementById('chain');
const cards = [...section.querySelectorAll('article.card[data-art]')];
if (!chain || !cards.length) return;
section.classList.add('paws-on');
const hint = section.querySelector('.chain-hint');
if (hint && matchMedia('(hover: none)').matches) hint.textContent = 'Swipe along the chain. Tap a paw to open it.';
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- LCD screens: 44×30 pixel buffer, drawn as 3×3 dots on a 4×4 grid like a real LCD ----------
const GW = 44, GH = 30, DOT = 4, buf = new Uint8Array(GW * GH);
const set = (x, y, v = 1) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < GW && y < GH) buf[y * GW + x] = v; };
const rect = (x, y, w, h, v = 1) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, v); };
const box = (x, y, w, h) => { rect(x, y, w, 1); rect(x, y + h - 1, w, 1); rect(x, y, 1, h); rect(x + w - 1, y, 1, h); };
const line = (x0, y0, x1, y1, step = 1) => {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, n = 0;
  for (;;) { if (n++ % step === 0) set(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
};
const disc = (cx, cy, r, v = 1) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * .8) set(cx + x, cy + y, v); };
const ring = (cx, cy, r) => { disc(cx, cy, r); disc(cx, cy, r - 1, 0); };
const sprite = (x, y, rows) => rows.forEach((row, j) => [...row].forEach((c, i) => c === '#' && set(x + i, y + j)));

const ART = {
  tender(t) { // a magnifying glass reading a tender document
    box(9, 3, 17, 24); rect(22, 3, 4, 4, 0); line(22, 3, 25, 6); rect(22, 3, 1, 4); rect(22, 6, 4, 1);
    [12, 9, 12, 7, 11, 8].forEach((w, i) => rect(12, 9 + i * 3, w, 1));
    const cx = 19 + 7 * Math.sin(t * .25), cy = 14 + 5 * Math.sin(t * .13);
    disc(cx, cy, 5, 0); ring(cx, cy, 5); rect(cx - 3, cy - 1, 6, 2);
    line(cx + 4, cy + 4, cx + 8, cy + 8); line(cx + 5, cy + 4, cx + 9, cy + 8);
    if (t % 24 > 15) sprite(33, 5, ['......#', '.....#.', '#...#..', '.#.#...', '..#....']);
  },
  sight(t) { // a camera watches a shopper lift a product and put it back
    rect(2, 2, 7, 4); set(9, 3); set(9, 4); if (t % 4 < 2) set(3, 0);
    rect(3, 25, 38, 1); rect(3, 25, 1, 4); rect(40, 25, 1, 4);
    const lift = [0, 0, 0, 1, 2, 3, 4, 5, 5, 5, 5, 5, 5, 4, 3, 2, 1, 0, 0, 0][t % 20];
    box(6, 17, 8, 8); rect(8, 20, 4, 1); box(30, 17, 8, 8); rect(32, 20, 4, 1);
    box(18, 17 - lift, 8, 8); rect(20, 20 - lift, 4, 1);
    if (t % 20 > 1 && t % 20 < 18) { rect(20, 13 - lift, 4, 3); rect(21, 0, 2, 13 - lift); }
    if (t % 2) line(8, 6, 18, 18 - lift, 2);
  },
  slipp(t) { // a receipt prints out and earns a reward star
    const c = t % 28, h = Math.min(c * 1.3, 19) | 0;
    rect(8, 2, 28, 4); rect(12, 5, 20, 1, 0);
    if (h > 1) {
      rect(13, 6, 1, h); rect(30, 6, 1, h);
      for (let x = 13; x <= 30; x++) set(x, 6 + h - (x % 2));
      for (let y = 8, k = 0; y < 5 + h; y += 3, k++) rect(15, y, [13, 9, 11, 7, 12, 10][k % 6], 1);
    }
    if (c > 19 && c % 2) sprite(35, 17, ['..#..', '.###.', '#####', '.#.#.', '#...#']);
  },
  spotr(t) { // a map pin bouncing on its spot
    const b = Math.abs(Math.sin(t * .35)) * 7, py = 12 - b;
    disc(22, py, 5); disc(22, py, 1.5, 0);
    for (let k = 0; k < 6; k++) { const w = Math.max(0, 4 - k); rect(22 - w, py + 4 + k, w * 2 + 1, 1); }
    const w = Math.round(12 - b); rect(22 - w / 2, 27, w, 1); rect(23 - w / 2, 28, w - 2, 1);
    if (b > 6) { set(35, 4); set(34, 5); set(36, 5); set(35, 6); set(35, 5); }
  },
  car(t) { // a car driving past with a tracking box around it
    for (let x = 0; x < GW; x++) if ((x + t * 2) % 6 < 3) set(x, 28);
    const cx = (t * 2) % 64 - 16;
    sprite(cx, 18, ['....#######....', '...#...#...#...', '..#....#....#..', '###############', '#.##.......##.#', '###############', '..##.......##..']);
    if (t % 4 < 3) {
      const x0 = cx - 2, y0 = 15, x1 = cx + 16, y1 = 26;
      rect(x0, y0, 3, 1); rect(x0, y0, 1, 3); rect(x1 - 2, y0, 3, 1); rect(x1, y0, 1, 3);
      rect(x0, y1, 3, 1); rect(x0, y1 - 2, 1, 3); rect(x1 - 2, y1, 3, 1); rect(x1, y1 - 2, 1, 3);
    }
  },
  cards(t) { // one card face down, one card flipping over
    box(6, 6, 13, 18); for (let y = 8; y < 22; y++) for (let x = 8; x < 17; x++) if ((x + y) % 3 === 0) set(x, y);
    const f = t % 16, cos = Math.cos(Math.PI * f / 8), w = Math.max(1, Math.round(13 * Math.abs(cos))), x = 25 + ((13 - w) >> 1);
    box(x, 6, w, 18);
    if (cos < 0 && w > 8) { sprite(x + ((w - 7) >> 1), 12, ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...']); set(x + 2, 8); set(x + w - 3, 21); }
    else if (cos >= 0 && w > 3) for (let y = 8; y < 22; y++) for (let i = 2; i < w - 2; i++) if ((x + i + y) % 3 === 0) set(x + i, y);
  },
  zombie(t) { // a zombie dancing on a flashing floor
    for (let i = 0; i < 7; i++) if ((i + t) % 2) rect(1 + i * 6, 25, 5, 4);
    const b = t % 2, a = t % 4 < 2 ? 0 : 1;
    box(15, 3 + b, 7, 6); set(17, 5 + b); set(19, 5 + b); rect(17, 7 + b, 3, 1);
    rect(17, 9 + b, 3, 8); rect(20, 11 + b + a, 8, 1); rect(20, 14 + b - a, 7, 1);
    if (t % 4 === 1) { line(17, 17 + b, 12, 21); line(19, 17 + b, 20, 23); }
    else { line(17, 17 + b, 15, 23); line(19, 17 + b, 21, 23); }
    sprite(31 + (t % 8 > 3 ? 1 : 0), 12 - (t % 8), ['..##', '..#.', '..#.', '###.', '##..']);
  },
  poster(t) { // a research poster filling up, chart bars growing, a face changing expression
    line(14, 22, 10, 29); line(30, 22, 34, 29); rect(22, 22, 1, 8);
    box(9, 2, 26, 21); rect(11, 4, 14, 2);
    const c = t % 30;
    if (c > 2) rect(11, 8, 10, 1); if (c > 4) rect(11, 10, 8, 1); if (c > 6) rect(11, 12, 9, 1);
    [8, 5, 10].forEach((max, k) => { const h = Math.min(Math.max(c - 8 - k * 3, 0), max); rect(25 + k * 3, 20 - h, 2, h); });
    if (c > 10) { ring(15, 17, 3); set(14, 16); set(16, 16); if (c % 6 < 3) { set(14, 18); set(15, 19); set(16, 18); } else rect(14, 19, 3, 1); }
    if (c > 22 && c % 2) { set(39, 4); set(38, 5); set(40, 5); set(39, 6); set(4, 8); set(3, 9); set(5, 9); set(4, 10); }
  },
};

function paint(cv, art, t) {
  buf.fill(0); ART[art](t);
  const c = cv.getContext('2d');
  c.clearRect(0, 0, cv.width, cv.height);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    c.fillStyle = buf[y * GW + x] ? 'rgba(32,40,26,.86)' : 'rgba(32,40,26,.06)';
    c.fillRect(x * DOT, y * DOT, DOT - 1, DOT - 1);
  }
}
const lcd = () => { const cv = document.createElement('canvas'); cv.className = 'lcd'; cv.width = GW * DOT; cv.height = GH * DOT; cv.setAttribute('aria-hidden', 'true'); return cv; };
// shell finishes; projects take them in turn, or a card can pick one with data-color="silver"
const COLORS = ['orange', 'bronze', 'silver'];
const paint3d = (b, color) => { b.querySelector('img').src = `paw-${color}.webp`; b.style.setProperty('--img', `url(paw-${color}.webp)`); };
const device = color => {
  const b = document.createElement('span'); b.className = 'body3d';
  b.innerHTML = '<img alt="" width="600" height="710"><span class="shine"></span>';
  const cv = lcd(); b.insertBefore(cv, b.lastChild);
  paint3d(b, color);
  return { b, cv };
};

// ---------- the chain: paws hang by their keyring straight off an oval-link chain ----------
const RING = 55 / 600; // centre of the keyring hole, as a fraction of the paw's width
const LINK_H = 22, LINK_W = LINK_H * 114 / 56; // chain.webp holds one flat link and one edge-on link and repeats seamlessly
const track = document.createElement('div'); track.className = 'track';
const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.classList.add('links');
track.append(svg); chain.append(track);

const paws = cards.map((card, i) => {
  const el = document.createElement('button'); el.type = 'button'; el.className = 'paw';
  const name = card.querySelector('h3').textContent;
  el.setAttribute('aria-label', `Open project: ${name}`);
  const color = card.dataset.color || COLORS[i % COLORS.length];
  const { b, cv } = device(color);
  const lbl = document.createElement('span'); lbl.className = 'lbl';
  lbl.textContent = card.querySelector('.bar span').textContent.split('/').pop();
  el.append(b, lbl); track.append(el);
  el.addEventListener('click', () => { kick(i, .6); open(i); });
  el.addEventListener('pointerenter', () => focusPaw(i));
  el.addEventListener('focus', () => focusPaw(i));
  el.addEventListener('blur', () => focusPaw(-1));
  return { el, b, cv, card, art: card.dataset.art, color, th: 0, w: 0, k: 14, x0: 0, y0: 0, ox: 0, s: 1 };
});

let yAt = () => 0, pw = 118;
function layout() {
  const small = innerWidth <= 760, n = paws.length;
  const W = small ? n * 128 + 40 : chain.clientWidth, pad = small ? 20 : 30;
  pw = small ? 104 : Math.min(118, (W - 2 * pad) / n - 12);
  const y0 = 14, sag = small ? 26 : 40;
  yAt = x => { const u = x / W; return y0 + 4 * sag * u * (1 - u); };
  track.style.width = W + 'px';
  const ringY = RING * pw;
  paws.forEach((p, i) => {
    p.x0 = pad + (i + .5) * (W - 2 * pad) / n; p.y0 = yAt(p.x0);
    p.el.style.width = pw + 'px'; p.el.style.left = p.x0 - pw / 2 + 'px'; p.el.style.top = p.y0 - ringY + 'px';
    p.el.style.transformOrigin = `50% ${ringY}px`;
    p.k = 13;
  });
  const grow = matchMedia('(hover: hover)').matches ? 1.3 : 1; // room for a focused paw at 1.3× where hovering exists
  chain.style.height = y0 + sag + pw * 710 / 600 * grow + 60 + 'px';

  // lay the link tiles end to end along the curve, each turned to the curve's slope
  const pts = [[0, yAt(0), 0]];
  for (let x = 1; x <= W; x++) { const q = pts[pts.length - 1], y = yAt(x); pts.push([x, y, q[2] + Math.hypot(1, y - q[1])]); }
  const total = pts[pts.length - 1][2];
  let html = '', j = 0;
  for (let s = 0; s < total; s += LINK_W) {
    while (j < pts.length - 1 && pts[j][2] < s + LINK_W / 2) j++;
    const [x, y] = pts[j], slope = (yAt(x + 1) - yAt(x - 1)) / 2;
    html += `<image href="chain.webp" x="${-LINK_W / 2 - .4}" y="${-LINK_H / 2}" width="${LINK_W + .8}" height="${LINK_H}" preserveAspectRatio="none" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(Math.atan(slope) * 180 / Math.PI).toFixed(2)})"/>`;
  }
  svg.setAttribute('width', W); svg.setAttribute('height', y0 + sag + LINK_H);
  svg.innerHTML = html;
}
layout();
new ResizeObserver(layout).observe(chain);

// ---------- focus: like clothes on a rail, the paw under the cursor grows and the others slide apart along the chain ----------
let hov = -1;
function focusPaw(i) {
  hov = i;
  paws.forEach((p, j) => { p.el.classList.toggle('dim', i >= 0 && j !== i); p.el.style.zIndex = j === i ? 2 : 1; });
}
chain.addEventListener('pointerleave', () => { if (!chain.contains(document.activeElement)) focusPaw(-1); });

// ---------- swing physics: a damped pendulum per paw, nudged by the cursor and loosely tied to its neighbours ----------
function kick(i, v) { const p = paws[i]; p.w = Math.max(-5, Math.min(5, p.w + v)); }
let lastX = null;
chain.addEventListener('pointermove', e => {
  const dx = lastX == null ? 0 : e.clientX - lastX; lastX = e.clientX;
  const el = e.target.closest('.paw'); if (!el || still) return;
  kick(paws.findIndex(p => p.el === el), Math.max(-40, Math.min(40, dx)) * .014);
});
chain.addEventListener('pointerleave', () => { lastX = null; });

let visible = false, last = performance.now(), tick = 0, tickAt = 0;
new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(chain);
function step(now) {
  const dt = Math.min(.033, (now - last) / 1000); last = now;
  if (visible) {
    const time = now / 1000, ease = still ? 1 : Math.min(1, dt * 9), spread = pw * .24;
    paws.forEach((p, i) => {
      const breeze = still ? 0 : .035 * Math.sin(time * .9 + i * 1.7);
      const nb = ((paws[i - 1] || p).th + (paws[i + 1] || p).th - 2 * p.th) * 1.2;
      p.w += (-p.k * (p.th - breeze) - 1.1 * p.w + nb) * dt;
      p.th = Math.max(-1, Math.min(1, p.th + p.w * dt));
      const d = i - hov, tx = hov < 0 || !d ? 0 : Math.sign(d) * spread * Math.max(.35, 1 - (Math.abs(d) - 1) * .2);
      p.ox += (tx - p.ox) * ease; p.s += ((i === hov ? 1.3 : 1) - p.s) * ease;
      const dy = yAt(p.x0 + p.ox) - p.y0; // slide along the curve, not in a straight line
      p.el.style.transform = `translate(${p.ox.toFixed(2)}px, ${dy.toFixed(2)}px) rotate(${p.th}rad) scale(${p.s.toFixed(3)})`;
      p.b.style.transform = `perspective(520px) rotateY(${-p.w * 7}deg)`;
      p.b.style.setProperty('--sx', (p.th * 140).toFixed(1));
    });
  }
  if (now - tickAt > 150) { // LCDs refresh at a chunky ~7 fps
    tickAt = now; if (!still) tick++;
    if (visible) paws.forEach(p => paint(p.cv, p.art, tick));
    if (view.classList.contains('open')) paint(big.cv, paws[cur].art, tick);
  }
  requestAnimationFrame(step);
}

// ---------- opened paw ----------
const view = document.createElement('div');
view.className = 'pawview'; view.setAttribute('role', 'dialog'); view.setAttribute('aria-modal', 'true');
view.innerHTML = `<div class="pv-in">
  <div><div class="bigpaw"></div><div class="pv-keys"><span>◀ prev</span><span>● close</span><span>next ▶</span></div></div>
  <div class="pv-card"></div></div>`;
const bigEl = view.querySelector('.bigpaw'), cardBox = view.querySelector('.pv-card');
const big = device(COLORS[0]); bigEl.append(big.b);
[['k1', 'Previous project', -1], ['k2', 'Close', 0], ['k3', 'Next project', 1]].forEach(([cls, label, dir]) => {
  const k = document.createElement('button'); k.type = 'button'; k.className = 'key ' + cls; k.setAttribute('aria-label', label);
  k.addEventListener('click', () => dir ? show(cur + dir) : close());
  bigEl.append(k);
});
document.body.append(view);

let cur = 0, opener = null;
function show(i) {
  cur = (i + paws.length) % paws.length;
  const card = paws[cur].card.cloneNode(true); card.classList.remove('reveal');
  cardBox.replaceChildren(card);
  view.setAttribute('aria-label', paws[cur].card.querySelector('h3').textContent);
  bigEl.style.animation = 'none'; void bigEl.offsetWidth; bigEl.style.animation = '';
  paint3d(big.b, paws[cur].color);
  paint(big.cv, paws[cur].art, tick);
}
function open(i) {
  opener = paws[i].el; show(i);
  view.classList.add('open'); document.documentElement.style.overflow = 'hidden';
  view.querySelector('.k2').focus({ preventScroll: true });
}
function close() {
  view.classList.remove('open'); document.documentElement.style.overflow = '';
  if (opener) opener.focus({ preventScroll: true });
}
view.addEventListener('click', e => { if (e.target === view || e.target.classList.contains('pv-in')) close(); });
addEventListener('keydown', e => {
  if (!view.classList.contains('open')) return;
  if (e.key === 'Escape') close();
  else if (e.key === 'ArrowLeft') show(cur - 1);
  else if (e.key === 'ArrowRight') show(cur + 1);
  else if (e.key === 'Tab') { // keep focus inside the opened paw
    const f = [...view.querySelectorAll('button, a[href]')], first = f[0], lastF = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastF.focus(); }
    else if (!e.shiftKey && document.activeElement === lastF) { e.preventDefault(); first.focus(); }
  }
});

paws.forEach(p => paint(p.cv, p.art, 0));
requestAnimationFrame(step);
})();
