// Begüm's room: a cozy isometric 3D bedroom with real GLB models.
// Loaded on demand by index.html when the #room section comes near the screen.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = s => document.querySelector(s);
const V = THREE.Vector3;
const stage = $('#rstage'), cv = $('#rcanvas'), cover = $('#rcover');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = matchMedia('(pointer: coarse), (max-width: 760px)').matches;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
// render loop state (the loop starts once the models are in)
let ready = false, visible = true, running = false, last = performance.now(), clock = 0, screenT = 0;

const MODELS = { desk: 'desk.glb', rug: 'rug.glb', board: 'snowboard.glb', me: 'me.glb', bed: 'bed.glb' };

// warm cream walls, ivory trim, walnut wood
const C = {
  wall: '#eadbc4', wallL: '#e3d2b9', ivory: '#f4ecdf', cream: '#efe5d3',
  walnut: '#4a2b1c', walnutL: '#6a4029', walnutD: '#2b170e', black: '#1b1816', brass: '#b58a4c',
  leafA: '#3d6a37', leafB: '#4f7f43', leafC: '#2e532c', pot: '#f1ebe1', terra: '#b98a5e',
};
const H = 5;              // wall height
const DOOR = { x0: 2.5, x1: 3.95, h: 4.05 };
const BAR = { x: 3.22, y: 3.85, z: -3.72 };

// ---------- renderer, scene, camera ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  cover.querySelector('span').textContent = "Your browser couldn't start 3D graphics.";
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;
const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, .1, 100);
const VIEW = new V(1, .86, 1).normalize();
// drag to turn the room: yaw goes around, pitch tilts. Limited to the open side so the walls never block the view.
const YAW0 = Math.atan2(VIEW.x, VIEW.z), PITCH0 = Math.asin(VIEW.y);
const YAW_MIN = -.08, YAW_MAX = Math.PI / 2 + .08, P_MIN = .28, P_MAX = 1.3, UZ_MIN = .8, UZ_MAX = 2.6;
const orbit = { yaw: YAW0, pitch: PITCH0, ty: YAW0, tp: PITCH0, uz: 1, tz: 1 };
const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
function setView() { VIEW.set(Math.sin(orbit.yaw) * Math.cos(orbit.pitch), Math.sin(orbit.pitch), Math.cos(orbit.yaw) * Math.cos(orbit.pitch)); }
function resetView() { orbit.ty = YAW0; orbit.tp = PITCH0; orbit.tz = 1; }

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, cam));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .45, .4, .96);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .82, metalness: 0, ...o });
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
function put(m, parent, x, y, z, cast = true, receive = true) {
  m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = receive;
  (parent || scene).add(m); return m;
}
const rbox = (w, h, d, m, p, x = 0, y = 0, z = 0, r = .04) =>
  put(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.max(.002, Math.min(r, w / 2 - .001, h / 2 - .001, d / 2 - .001))), m), p, x, y, z);
const box = (w, h, d, m, p, x = 0, y = 0, z = 0) => put(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m), p, x, y, z);
const cyl = (rt, rb, h, m, p, x = 0, y = 0, z = 0, seg = 20) => put(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m), p, x, y, z);
const ball = (r, m, p, x = 0, y = 0, z = 0, seg = 20) => put(new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg * .75), m), p, x, y, z);
function group(x = 0, y = 0, z = 0, p) { const g = new THREE.Group(); g.position.set(x, y, z); (p || scene).add(g); return g; }
// a group on a wall whose local +z points into the room: back wall (z = -4) or left wall (x = -4)
function wallGroup(wall, along, y, out = 0) {
  const g = new THREE.Group();
  if (wall === 'back') g.position.set(along, y, -3.99 + out);
  else { g.position.set(-3.99 + out, y, along); g.rotation.y = Math.PI / 2; }
  scene.add(g); return g;
}

// things you can hover and click
const hot = [];
function hoverable(obj, info) {
  obj.traverse(m => {
    if (m.isMesh && m.material && m.material.emissive && !m.userData.glowy) {
      m.material = m.material.clone();
      m.userData.baseEm = m.material.emissive.clone();
      m.userData.baseEmI = m.material.emissiveIntensity;
    }
  });
  obj.userData.hot = { ...info, glow: 0 };
  hot.push(obj);
  return obj;
}

// ---------- lights ----------
const hemi = new THREE.HemisphereLight('#fff4e6', '#8a6a4e', 1);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffe7c4', 2.4);
sun.position.set(9, 14, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 45 });
sun.shadow.bias = -4e-4; sun.shadow.normalBias = .03; sun.shadow.radius = 5;
scene.add(sun);
const lamps = [];   // warm point lights that come on at night
function lampLight(x, y, z, I, d = 7, color = '#ffb46a') {
  const l = new THREE.PointLight(color, 0, d, 1.6);
  l.position.set(x, y, z); l.userData.I = I; scene.add(l); lamps.push(l); return l;
}
const glows = [];   // emissive bulbs, candle flames, screens: { mat, day, night, flicker }
function glowMat(color, day, night, flicker = 0) {
  const m = new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: day, roughness: .4 });
  glows.push({ m, day, night, flicker, seed: Math.random() * 10 });
  return m;
}
const glowy = m => { m.userData.glowy = true; return m; };

// ---------- room shell: floor, walls with a doorway, trim ----------
function buildShell() {
  const floorTex = canvasTex(1024, 1024, (g, w, h) => {
    const rows = 12, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      g.fillStyle = `hsl(${17 + (r * 7) % 5} 46% ${23 + (r * 53) % 7}%)`; g.fillRect(0, r * rh, w, rh);
      for (let k = 0; k < 30; k++) {
        g.fillStyle = `rgba(${k % 2 ? '255,210,170' : '30,12,4'},.06)`;
        g.fillRect(Math.random() * w, r * rh + Math.random() * rh, 100 + Math.random() * 220, 1.5);
      }
      g.fillStyle = 'rgba(20,8,2,.55)'; g.fillRect(0, r * rh, w, 2.5);
      for (let x = (r * 197) % 340; x < w; x += 340 + (r % 3) * 60) g.fillRect(x, r * rh, 2.5, rh);
    }
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ map: floorTex, roughness: .38 }));
  floor.rotation.x = -Math.PI / 2; floor.rotation.z = Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const slab = box(8.2, .45, 8.2, mat('#3a2116', { roughness: .5 }), null, .1, -.225, .1); slab.castShadow = false;

  const wallM = mat(C.wall, { roughness: .95 }), wallLM = mat(C.wallL, { roughness: .95 });
  const T = .2, z = -4.1, x = -4.1;
  const parts = [
    box(DOOR.x0 + 4.2, H, T, wallM, null, (DOOR.x0 - 4.2) / 2, H / 2, z),            // back wall left of the door
    box(4.2 - DOOR.x1, H, T, wallM, null, (DOOR.x1 + 4.2) / 2, H / 2, z),             // right of the door
    box(DOOR.x1 - DOOR.x0, H - DOOR.h, T, wallM, null, (DOOR.x0 + DOOR.x1) / 2, (H + DOOR.h) / 2, z), // above the door
    box(T, H, 8.2, wallLM, null, x, H / 2, .1),
  ];
  parts.forEach(p => { p.castShadow = false; });
  // a painted hallway just behind the door opening (real geometry would poke out past the room's edge)
  const hallTex = canvasTex(256, 640, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#6b5844'); gr.addColorStop(.75, '#c9ad8a'); gr.addColorStop(.76, '#4a2c1c'); gr.addColorStop(1, '#2e1a10');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, w * .18, h);           // side wall in shadow
    const lg = g.createRadialGradient(w * .6, h * .2, 4, w * .6, h * .2, w * .7); lg.addColorStop(0, 'rgba(255,215,160,.55)'); lg.addColorStop(1, 'rgba(255,215,160,0)');
    g.fillStyle = lg; g.fillRect(0, 0, w, h);
  });
  put(new THREE.Mesh(new THREE.PlaneGeometry(DOOR.x1 - DOOR.x0, DOOR.h), new THREE.MeshBasicMaterial({ map: hallTex })), null, (DOOR.x0 + DOOR.x1) / 2, DOOR.h / 2, -4.19, false, false);
  const trim = mat(C.ivory, { roughness: .5 });
  // crown moulding
  box(8.2, .2, .14, trim, null, .1, H - .1, -3.93); box(8.3, .07, .22, trim, null, .1, H - .26, -3.9);
  box(.14, .2, 8.2, trim, null, -3.93, H - .1, .1); box(.22, .07, 8.3, trim, null, -3.9, H - .26, .1);
  // skirting
  box(DOOR.x0 + 4, .3, .07, trim, null, (DOOR.x0 - 4) / 2, .15, -3.97); box(4 - DOOR.x1, .3, .07, trim, null, (DOOR.x1 + 4) / 2, .15, -3.97);
  box(.07, .3, 8, trim, null, -3.97, .15, 0);
  // door casing
  const cw = .16;
  box(cw, DOOR.h + cw, .1, trim, null, DOOR.x0 - cw / 2, (DOOR.h + cw) / 2, -3.96);
  box(cw, DOOR.h + cw, .1, trim, null, DOOR.x1 + cw / 2, (DOOR.h + cw) / 2, -3.96);
  box(DOOR.x1 - DOOR.x0 + cw * 2, cw, .1, trim, null, (DOOR.x0 + DOOR.x1) / 2, DOOR.h + cw / 2, -3.96);
  box(.06, DOOR.h, .2, trim, null, DOOR.x0 + .03, DOOR.h / 2, -4.1); box(.06, DOOR.h, .2, trim, null, DOOR.x1 - .03, DOOR.h / 2, -4.1);
}

// ---------- windows with drapes ----------
const views = [];
function cityView(night, seed) {
  return (g, w, h) => {
    let s = seed; const rnd = () => (s = s * 16807 % 2147483647) / 2147483647;
    const gr = g.createLinearGradient(0, 0, 0, h);
    if (night) { gr.addColorStop(0, '#0b1024'); gr.addColorStop(1, '#27304f'); } else { gr.addColorStop(0, '#8ec3e6'); gr.addColorStop(1, '#f3e3c8'); }
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    if (night) {
      g.fillStyle = '#fff';
      for (let i = 0; i < 30; i++) { g.globalAlpha = .3 + rnd() * .6; g.fillRect(rnd() * w, rnd() * h * .45, 1.5, 1.5); }
      g.globalAlpha = 1;
      if (seed % 2) { g.fillStyle = '#f6efcf'; g.beginPath(); g.arc(w * .55, h * .2, 22, 0, 7); g.fill(); g.fillStyle = '#0d1228'; g.beginPath(); g.arc(w * .55 + 10, h * .2 - 6, 20, 0, 7); g.fill(); }
    } else {
      g.fillStyle = 'rgba(255,255,255,.8)';
      for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(rnd() * w, h * (.1 + rnd() * .2), 40, 10, 0, 0, 7); g.fill(); }
    }
    // two rows of buildings
    [[.48, night ? '#1a1f33' : '#a9b4c2', .5], [.62, night ? '#120f17' : '#7c7066', 1]].forEach(([top, col, k]) => {
      let x = -10;
      while (x < w) {
        const bw = 40 + rnd() * 60, bt = h * (top + rnd() * .15);
        g.fillStyle = col; g.fillRect(x, bt, bw, h - bt);
        for (let wy = bt + 10; wy < h - 8; wy += 16) for (let wx = x + 8; wx < x + bw - 8; wx += 14) {
          const on = rnd() < (night ? .45 * k : .1);
          g.fillStyle = on ? (night ? '#ffc76e' : '#e6edf2') : (night ? 'rgba(0,0,0,.25)' : 'rgba(60,60,70,.25)');
          g.fillRect(wx, wy, 6, 8);
        }
        x += bw + 4 + rnd() * 10;
      }
    });
  };
}
function curtain(parent, x, w, h, y) {
  const geo = new THREE.PlaneGeometry(w, h, 24, 1), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / w + .5) * Math.PI * 7) * .045);
  geo.computeVertexNormals();
  const m = put(new THREE.Mesh(geo, mat(C.ivory, { roughness: 1, side: THREE.DoubleSide })), parent, x, y, .16);
  return m;
}
function buildWindow(wall, along, seed) {
  const W = 1.15, Hh = 2.1, y = 3.15;
  const g = wallGroup(wall, along, y);
  const day = canvasTex(256, 460, cityView(false, seed)), night = canvasTex(256, 460, cityView(true, seed));
  put(new THREE.Mesh(new THREE.PlaneGeometry(W, Hh), new THREE.MeshBasicMaterial({ map: day })), g, 0, 0, .005, false, false);
  const nm = new THREE.MeshBasicMaterial({ map: night, transparent: true, opacity: 1 });
  put(new THREE.Mesh(new THREE.PlaneGeometry(W, Hh), nm), g, 0, 0, .007, false, false);
  views.push(nm);
  const sash = mat('#1e1a17', { roughness: .5 }), trim = mat(C.ivory, { roughness: .5 }), f = .06;
  box(W, f, .08, sash, g, 0, Hh / 2 - f / 2, .04); box(W, f, .08, sash, g, 0, -Hh / 2 + f / 2, .04);
  box(f, Hh, .08, sash, g, -W / 2 + f / 2, 0, .04); box(f, Hh, .08, sash, g, W / 2 - f / 2, 0, .04);
  box(W, .05, .07, sash, g, 0, .05, .04); box(.04, Hh, .06, sash, g, 0, 0, .04);
  box(.035, Hh, .06, sash, g, -W / 4, 0, .035); box(.035, Hh, .06, sash, g, W / 4, 0, .035);
  const c = .13;
  box(W + c * 2, c, .07, trim, g, 0, Hh / 2 + c / 2, .03); box(c, Hh, .07, trim, g, -W / 2 - c / 2, 0, .03); box(c, Hh, .07, trim, g, W / 2 + c / 2, 0, .03);
  box(W + .45, .07, .22, trim, g, 0, -Hh / 2 - .03, .1); box(W + c * 2, .14, .06, trim, g, 0, -Hh / 2 - .12, .03);
  // black rod with finials, two ivory drapes
  const rodY = Hh / 2 + .38, black = mat(C.black, { roughness: .4, metalness: .4 });
  cyl(.022, .022, W + 1.25, black, g, 0, rodY, .17).rotation.z = Math.PI / 2;
  [-1, 1].forEach(s => { ball(.05, black, g, s * (W / 2 + .64), rodY, .17, 10); box(.03, .12, .17, black, g, s * (W / 2 + .5), rodY, .09); });
  [-1, 1].forEach(s => curtain(g, s * (W / 2 + .3), .62, Hh + .55, rodY - (Hh + .55) / 2 - .03));
}

// ---------- floor areas the character can't walk through ----------
const cols = [];
function block(obj) {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj);
  cols.push([b.min.x, b.max.x, b.min.z, b.max.z]);
}
function blockRect(x, z, hx, hz) { cols.push([x - hx, x + hx, z - hz, z + hz]); }

// ---------- plants with real leaves ----------
const leafGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.bezierCurveTo(.5, .18, .48, .78, 0, 1); s.bezierCurveTo(-.48, .78, -.5, .18, 0, 0);
  const g = new THREE.ShapeGeometry(s, 6);
  const p = g.attributes.position; // fold along the middle a little
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.abs(p.getX(i)) * .35);
  g.computeVertexNormals();
  return g;
})();
const leafMats = [C.leafA, C.leafB, C.leafC].map(c => mat(c, { roughness: .6, side: THREE.DoubleSide }));
function plant({ x, y = 0, z, pot = 'white', potR = .28, potH = .5, stems = 12, size = .5, height = 1.6, spread = .9, seed = 1, parent, scale = 1, wide = 1 }) {
  let s = seed * 7919; const rnd = () => (s = s * 16807 % 2147483647) / 2147483647;
  const g = group(x, y, z, parent); g.scale.setScalar(scale);
  if (!parent && pot) blockRect(x, z, potR * scale, potR * scale);
  if (pot) {
    const pm = mat(pot === 'white' ? C.pot : C.terra, { roughness: .7 });
    cyl(potR, potR * .78, potH, pm, g, 0, potH / 2, 0, 24);
    cyl(potR * .94, potR * .94, .03, mat('#3b2a1c'), g, 0, potH - .03, 0, 20);
  }
  const stemM = mat('#4a6b35');
  for (let i = 0; i < stems; i++) {
    const a = i * 2.39996 + rnd() * .4, len = height * (.45 + rnd() * .55), tilt = spread * (.15 + rnd() * .55);
    const tip = new V(Math.sin(a) * Math.sin(tilt) * len, potH + Math.cos(tilt) * len, Math.cos(a) * Math.sin(tilt) * len);
    const st = cyl(.012, .016, 1, stemM, g, 0, 0, 0, 5);
    const base = new V(0, potH, 0), d = tip.clone().sub(base);
    st.position.copy(base).addScaledVector(d, .5); st.scale.y = d.length(); st.quaternion.setFromUnitVectors(new V(0, 1, 0), d.normalize());
    const n = height > 1.5 ? 4 : height > .7 ? 2 : 1;
    for (let j = 0; j < n; j++) {
      const t = n === 1 ? 1 : .35 + .65 * j / (n - 1), lf = new THREE.Mesh(leafGeo, leafMats[(i + j) % 3]);
      const ls = size * (.6 + rnd() * .6) * (.7 + .3 * t);
      lf.scale.set(ls * wide, ls, ls);
      lf.position.copy(base).lerp(tip, t);
      lf.rotation.set(.9 + rnd() * .9, a + (j ? (rnd() - .5) * 2.4 : 0), (rnd() - .5) * .6, 'YXZ');
      lf.castShadow = true; g.add(lf);
    }
  }
  return g;
}
function trailing(parent, x, y, z, strands = 6, length = 1.4, seed = 3) {
  let s = seed * 7919; const rnd = () => (s = s * 16807 % 2147483647) / 2147483647;
  for (let k = 0; k < strands; k++) {
    const a = k / strands * Math.PI * 2, r = .12 + rnd() * .1, n = 6 + (rnd() * 6 | 0), L = length * (.4 + rnd() * .6);
    for (let i = 0; i < n; i++) {
      const t = i / n, lf = new THREE.Mesh(leafGeo, leafMats[(i + k) % 3]);
      const ls = .13 + rnd() * .05; lf.scale.setScalar(ls);
      lf.position.set(x + Math.sin(a) * (r + t * .15) + Math.sin(t * 9 + k) * .03, y - t * L, z + Math.cos(a) * (r + t * .15));
      lf.rotation.set(Math.PI + (rnd() - .5) * 1.2, a + (rnd() - .5), (rnd() - .5), 'YXZ');
      parent.add(lf);
    }
  }
}

// ---------- bed side: nightstands, globe lamps, candles, prints ----------
function globeLamp(p, x, y, z) {
  cyl(.11, .13, .05, mat(C.brass, { metalness: .6, roughness: .35 }), p, x, y + .025, z, 18);
  cyl(.018, .018, .22, mat(C.brass, { metalness: .6, roughness: .35 }), p, x, y + .16, z, 8);
  const b = ball(.24, glowy(glowMat('#ffe2b0', .05, 1.6)), p, x, y + .48, z, 28); b.castShadow = false;
}
function candle(p, x, y, z, h = .16) {
  cyl(.065, .065, h, mat('#f3ead8', { roughness: .6 }), p, x, y + h / 2, z, 16);
  const f = ball(.025, glowy(glowMat('#ffb347', .0, 4, 1)), p, x, y + h + .04, z, 8); f.scale.y = 1.8; f.castShadow = false;
  return f;
}
function nightstand(z, books) {
  const g = group(-3.55, 0, z), w = mat(C.walnut, { roughness: .55 }), dk = mat(C.walnutD);
  rbox(.84, .06, .94, w, g, 0, 1.0, 0, .02);
  rbox(.8, .06, .9, w, g, 0, .1, 0, .01);
  [-1, 1].forEach(s => rbox(.8, .9, .05, w, g, 0, .55, s * .425, .01));
  box(.05, .9, .85, dk, g, -.37, .55, 0);
  rbox(.78, .04, .82, w, g, 0, .64, 0, .01);
  rbox(.04, .28, .8, mat(C.walnutL, { roughness: .5 }), g, .4, .81, 0, .015);
  ball(.025, mat(C.brass, { metalness: .7, roughness: .3 }), g, .43, .81, 0, 8);
  [[-.33, -.38], [-.33, .38], [.33, -.38], [.33, .38]].forEach(([a, b]) => box(.05, .07, .05, dk, g, a, .035, b));
  globeLamp(g, -.05, 1.03, books ? -.18 : .18);
  candle(g, .2, 1.03, books ? .22 : -.22);
  lampLight(-3.3, 1.7, z, 7, 7);
  block(g);
  return g;
}
const BOOKS = [
  { title: 'Extreme Ownership', author: 'Jocko Willink & Leif Babin', color: '#1b1b1d' },
  { title: 'Notes from Underground', author: 'Fyodor Dostoevsky', color: '#8a3a2a', cover: 'notes-from-underground.webp' },
  { title: '1984', author: 'George Orwell', color: '#d8261c', cover: '1984.webp' },
  { title: 'Aylak Adam', author: 'Yusuf Atılgan', color: '#a3b394', cover: 'aylak-adam.webp' },
];
const pops = [];
function bookStack(stand) {
  let y = .135;
  BOOKS.forEach((b, i) => {
    const t = .065 + (i % 3) * .008, g = group(-.02 + (i % 2 ? .03 : -.02), y, (i % 3 - 1) * .03, stand);
    g.rotation.y = (i % 2 ? .06 : -.05);
    rbox(.5, t, .62, mat(b.color, { roughness: .6, emissive: new THREE.Color('#000') }), g, 0, t / 2, 0, .01);
    box(.48, t * .7, .015, mat('#f2ead9'), g, .01, t / 2, .31);
    y += t + .004;
    g.userData.home = g.position.x;
    hoverable(g, { title: b.title, desc: b.author + '. Click to see the cover.', onClick: () => { g.userData.pop = 1; goTo('books'); showBook(b); } });
    pops.push(g);
  });
}
// click a book: its cover pops up
const bookBox = $('#rbook');
let bookFocus = null;
function showBook(b) {
  const img = $('#rbimg'), fall = $('#rbfall');
  img.hidden = !b.cover; fall.hidden = !!b.cover;
  if (b.cover) { img.src = base + 'covers/' + b.cover; img.alt = `Cover of ${b.title} by ${b.author}`; }
  else { fall.style.background = b.color; fall.replaceChildren(Object.assign(document.createElement('b'), { textContent: b.title }), Object.assign(document.createElement('span'), { textContent: b.author })); }
  $('#rbtitle').textContent = b.title; $('#rbauthor').textContent = b.author;
  bookFocus = document.activeElement; bookBox.hidden = false; tip.hidden = true;
  setTimeout(() => $('#rbclose').focus({ preventScroll: true }), 30);
}
function hideBook() {
  if (bookBox.hidden) return;
  bookBox.hidden = true;
  if (bookFocus && bookFocus.focus) bookFocus.focus({ preventScroll: true });
}
$('#rbclose').onclick = hideBook;
bookBox.addEventListener('pointerdown', e => { if (e.target === bookBox) hideBook(); });
addEventListener('keydown', e => { if (!bookBox.hidden && (e.key === 'Escape' || e.key === 'Tab')) { e.preventDefault(); if (e.key === 'Escape') hideBook(); } });

function buildPrints() {
  // the Women in STEM collage, as a tall framed poster
  const poster = wallGroup('left', 1.2, 2.55);
  const PW = .9, PH = PW * 16 / 9 * .9;
  rbox(PW + .1, PH + .1, .06, mat(C.walnut, { roughness: .5 }), poster, 0, 0, .03, .015);
  const tex = new THREE.TextureLoader().load(base + 'stem-poster.webp', () => wake());
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  // crop the 9:16 image a little top and bottom to fit the frame
  tex.repeat.set(1, .9); tex.offset.set(0, .05);
  put(new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), mat('#ffffff', { map: tex, roughness: .7 })), poster, 0, 0, .065, false, false);
  hoverable(poster, { title: 'Women in STEM', desc: 'My collage. Study for the women in the world who can\u2019t.' });

  // the red tiger line drawing by fiz_lorsman (4:5)
  const p = wallGroup('left', -.25, 2.7);
  const TW = .9, TH = TW * 5 / 4;
  rbox(TW + .1, TH + .1, .06, mat(C.walnut, { roughness: .5 }), p, 0, 0, .03, .015);
  const ttex = new THREE.TextureLoader().load(base + 'tiger-print.webp', () => wake());
  ttex.colorSpace = THREE.SRGBColorSpace; ttex.anisotropy = 4;
  put(new THREE.Mesh(new THREE.PlaneGeometry(TW, TH), mat('#ffffff', { map: ttex, roughness: .9 })), p, 0, 0, .065, false, false);
  hoverable(p, { title: 'Tiger print', desc: 'A starry red tiger, drawn by fiz_lorsman.' });
}

// ---------- tall leaning mirror ----------
function buildMirror() {
  const g = group(-2.05, 0, -3.78); g.rotation.x = -.07;
  const fr = mat(C.walnutD, { roughness: .45 });
  const W = 1.25, Hh = 3.4;
  rbox(W, .14, .1, fr, g, 0, Hh, 0, .02); rbox(W, .14, .1, fr, g, 0, .07, 0, .02);
  rbox(.14, Hh, .1, fr, g, -W / 2 + .07, Hh / 2, 0, .02); rbox(.14, Hh, .1, fr, g, W / 2 - .07, Hh / 2, 0, .02);
  const glass = canvasTex(256, 700, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#b9a891'); gr.addColorStop(.55, '#8f7a64'); gr.addColorStop(1, '#4a2f20');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.filter = 'blur(10px)';
    c.fillStyle = '#efe6d6'; c.fillRect(w * .1, h * .62, w * .9, h * .16);    // the bed, reflected
    c.fillStyle = '#7a2f22'; c.fillRect(0, h * .8, w, h * .1);               // the rug
    c.fillStyle = 'rgba(255,214,150,.7)'; c.beginPath(); c.arc(w * .3, h * .52, 18, 0, 7); c.fill(); // a lamp
    c.fillStyle = '#efe6d6'; c.fillRect(w * .55, h * .15, w * .25, h * .2);  // a print
    c.filter = 'none';
  });
  put(new THREE.Mesh(new THREE.PlaneGeometry(W - .22, Hh - .2), mat('#ffffff', { map: glass, roughness: .08, metalness: .2 })), g, 0, Hh / 2 + .02, .03, false, false);
  block(g);
  hoverable(g, { title: 'The mirror', desc: 'Outfit checks before every trip.' });
}

// ---------- GLB loading ----------
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const base = new URL('./', import.meta.url).href;
const progress = {};
function showProgress() {
  const p = Object.values(progress).reduce((a, b) => a + b, 0) / Object.keys(MODELS).length;
  cover.querySelector('span').textContent = `loading room… ${Math.round(p * 100)}%`;
}
function load(name) {
  progress[name] = 0;
  return new Promise((res, rej) => loader.load(base + MODELS[name], g => { progress[name] = 1; showProgress(); res(g); },
    e => { if (e.total) { progress[name] = e.loaded / e.total; showProgress(); } }, rej));
}
// scale a model so one world axis has a given size, centre it on x/z and stand it on y=0
function fit(obj, axis, size) {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj), s = b.getSize(new V());
  obj.scale.multiplyScalar(size / s[axis]);
  obj.updateMatrixWorld(true);
  b.setFromObject(obj);
  const c = b.getCenter(new V());
  obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= b.min.y;
  const wrap = new THREE.Group(); wrap.add(obj);
  wrap.traverse(m => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; } });
  return wrap;
}

// ---------- bed (GLB), headboard against the left wall ----------
function buildBed(gltf) {
  gltf.scene.rotation.y = Math.PI / 2;
  const b = fit(gltf.scene, 'z', 3.75);
  const bb = new THREE.Box3().setFromObject(b);
  const g = group(-3.98 - bb.min.x, 0, .45); g.add(b); // headboard against the wall
  block(g);
  hoverable(g, { title: 'My bed', desc: 'Where the best ideas show up at 2am.' });
}

// ---------- desk + computer (GLB) with a live screen ----------
let screenCtx, screenTex, deskLight;
// where the monitor's screen sits, in the desk model's local space (model scaled to 3 wide)
const SCREEN = { x: 0, y: 2.2, z: -.535, w: 1.5, h: .82, tilt: -.21 };
const DESK = { x: .55, w: 2.6 };
function buildDesk(gltf) {
  const inner = new THREE.Group(); inner.add(fit(gltf.scene, 'x', 3.0)); inner.scale.setScalar(DESK.w / 3);
  const g = group(DESK.x, 0, -3.99 + .53 * DESK.w / 1.9 + .02); g.add(inner);
  const c = document.createElement('canvas'); c.width = 512; c.height = 280;
  screenCtx = c.getContext('2d');
  screenTex = new THREE.CanvasTexture(c); screenTex.colorSpace = THREE.SRGBColorSpace; screenTex.anisotropy = 8;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  scr.position.set(SCREEN.x, SCREEN.y, SCREEN.z); scr.scale.set(SCREEN.w, SCREEN.h, 1); scr.rotation.x = SCREEN.tilt;
  inner.add(scr);
  block(g);
  hoverable(g, { title: 'The computer', desc: 'Click to use it: made-up markets, a useless terminal, and notes.', onClick: () => openComputer() });
  deskLight = lampLight(DESK.x, 2.4, -2.9, 3, 5, '#bcd0ff');
  // candles on the desk
  const top = 1.24;
  candle(scene, DESK.x - 1.05, top, -3.25, .14); candle(scene, DESK.x + .95, top, -3.15, .12);
  lampLight(DESK.x - .6, 2.3, -3.2, 3.5, 5);
}
function drawScreen(g, w, h, t) {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5a7aa6'); gr.addColorStop(1, '#d9c2a4');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = '#8b9bb4'; g.beginPath(); g.moveTo(0, h * .72); g.lineTo(w * .25, h * .38); g.lineTo(w * .42, h * .6); g.lineTo(w * .62, h * .3); g.lineTo(w, h * .7); g.lineTo(w, h); g.lineTo(0, h); g.fill();
  g.fillStyle = '#eef2f7'; g.beginPath(); g.moveTo(w * .62, h * .3); g.lineTo(w * .55, h * .4); g.lineTo(w * .66, h * .4); g.fill();
  g.fillStyle = '#4a5a52'; g.beginPath(); g.moveTo(0, h * .85); g.lineTo(w * .4, h * .7); g.lineTo(w, h * .85); g.lineTo(w, h); g.lineTo(0, h); g.fill();
  // a little note window
  g.fillStyle = 'rgba(241,226,194,.95)'; g.fillRect(24, 28, 190, 120);
  g.fillStyle = '#231811'; g.fillRect(24, 28, 190, 20);
  g.fillStyle = '#f1e2c2'; g.font = '12px monospace'; g.fillText('begum.os', 34, 42);
  g.fillStyle = '#231811'; g.font = 'bold 15px monospace'; g.fillText('leave a note', 36, 74);
  g.fillStyle = '#b9a688';
  for (let r = 0; r < 3; r++) g.fillRect(36, 88 + r * 15, 120 - (r % 2) * 34, 5);
  if (Math.floor(t * 2) % 2) { g.fillStyle = '#e8813a'; g.fillRect(36, 133, 8, 3); }
  g.fillStyle = 'rgba(20,14,10,.75)'; g.fillRect(0, h - 26, w, 26);
  g.fillStyle = '#f1e2c2'; g.font = '13px monospace'; g.fillText('> click me to leave a note_', 14, h - 9);
}
function buildChair() {
  const g = group(DESK.x + .1, 0, -2.25); g.rotation.y = Math.PI + .18;
  const seat = mat('#efe6d6', { roughness: .45 }), frame = mat(C.black, { roughness: .4, metalness: .5 });
  rbox(.92, .2, .88, seat, g, 0, .82, 0, .09);
  rbox(.88, 1.15, .18, seat, g, 0, 1.55, -.42, .12).rotation.x = -.08;
  cyl(.05, .05, .5, frame, g, 0, .5, 0);
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    rbox(.55, .05, .07, frame, g, Math.cos(a) * .27, .2, Math.sin(a) * .27, .02).rotation.y = -a;
    ball(.055, frame, g, Math.cos(a) * .52, .1, Math.sin(a) * .52, 10);
  }
  [-1, 1].forEach(s => { rbox(.07, .07, .55, frame, g, s * .5, 1.12, .02, .03); box(.04, .25, .04, frame, g, s * .5, .98, .02); });
  blockRect(g.position.x, g.position.z, .45, .45);
  hoverable(g, { title: 'Desk chair', desc: 'Where the coding happens.' });
}
function buildShelf() {
  const g = group(2.0, 3.55, -3.8);
  rbox(.95, .07, .38, mat(C.walnutL, { roughness: .5 }), g, 0, 0, 0, .015);
  [-1, 1].forEach(s => box(.04, .18, .3, mat(C.black), g, s * .35, -.12, -.02));
  const p = plant({ x: -.18, y: .035, z: 0, parent: g, pot: 'terra', potR: .13, potH: .2, stems: 8, size: .17, height: .35, spread: 1.2, seed: 5 });
  trailing(p, 0, .18, 0, 7, 1.5, 4);
  [['#e7dcc6', .06], ['#7a2f22', .05], ['#2f4459', .07]].reduce((y, [c, t]) => { rbox(.34, t, .26, mat(c), g, .22, y + t / 2, 0, .01); return y + t; }, .035);
  cyl(.05, .06, .15, mat('#e9dfcf', { roughness: .3 }), g, .25, .26, 0, 12);
  [0, .03, -.02].forEach((o, i) => { const st = cyl(.006, .006, .32, mat('#2b1b12'), g, .25 + o, .48, (i - 1) * .02, 4); st.rotation.z = (i - 1) * .2; });
}

// ---------- snowboard (GLB) hung sideways above the bed ----------
function buildBoard(gltf) {
  // model: long along y, bindings facing +z → long along the wall, bindings facing into the room
  gltf.scene.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new V(0, 1, 0), new V(0, 0, 1), new V(1, 0, 0)));
  const b = fit(gltf.scene, 'z', 3.0);
  const g = group(-3.93, 3.55, .45); g.add(b);
  const peg = mat(C.black, { metalness: .4, roughness: .4 });
  [-.9, .9].forEach(dz => rbox(.2, .08, .12, peg, null, -3.92, 3.55, .45 + dz, .02));
  hoverable(g, { title: 'My snowboard', desc: 'The best days of the year are on this thing.' });
}

// ---------- rug (GLB) under the bed ----------
function buildRug(gltf) {
  const r = fit(gltf.scene, 'x', 5.8);
  const g = group(-1.0, .006, .45); g.add(r);
  g.traverse(m => { if (m.isMesh) m.castShadow = false; });
}

// ---------- gym corner ----------
let ballObj, repCtx, repTex, reps = 0;
function buildGym() {
  const iron = mat('#161414', { metalness: .45, roughness: .45 });
  const black = mat(C.black, { metalness: .5, roughness: .35 });
  // pull-up bar across the doorway, with wall brackets
  cyl(.04, .04, DOOR.x1 - DOOR.x0 + .5, black, null, BAR.x, BAR.y, BAR.z).rotation.z = Math.PI / 2;
  [DOOR.x0 - .2, DOOR.x1 + .2].forEach(x => {
    rbox(.08, .5, .06, black, null, x, BAR.y, -3.95, .02);
    rbox(.06, .07, .3, black, null, x, BAR.y, -3.82, .02);
  });
  // mat, dumbbells, kettlebell, plates
  rbox(2.7, .035, 1.35, mat('#1d1b1a', { roughness: .95 }), null, 2.15, .02, 2.55, .01).rotation.y = -.06;
  const dumbbell = (x, z, r) => {
    const d = group(x, .14, z); d.rotation.y = r;
    cyl(.035, .035, .5, mat('#9a9590', { metalness: .8, roughness: .3 }), d, 0, 0, 0, 8).rotation.z = Math.PI / 2;
    [-.25, .25].forEach(s => cyl(.14, .14, .16, iron, d, s, 0, 0, 6).rotation.z = Math.PI / 2);
  };
  dumbbell(.45, 3.35, .5); dumbbell(.95, 3.55, .35);
  const kb = group(2.75, 0, .95);
  ball(.24, iron, kb, 0, .26, 0, 18);
  const hd = new THREE.Mesh(new THREE.TorusGeometry(.14, .035, 8, 16, Math.PI), iron); hd.position.y = .46; hd.castShadow = true; kb.add(hd);
  [0, 1, 2, 3].forEach(i => { cyl(.34 - i * .02, .34 - i * .02, .09, iron, null, 3.55, .05 + i * .095, 1.1, 28); });
  cyl(.06, .06, .02, mat('#555'), null, 3.55, .43, 1.1, 12);
  blockRect(2.75, .95, .25, .25); blockRect(3.55, 1.1, .34, .34); blockRect(.45, 3.35, .3, .3); blockRect(.95, 3.55, .3, .3);
  hoverable(kb, { title: 'Kettlebell', desc: 'Leg day lives here.' });
  // volleyball
  const vb = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#f6f1e2'; g.fillRect(0, 0, w, h);
    const cols = ['#2f5f86', '#d9a441'];
    for (let i = 0; i < 8; i++) { g.fillStyle = cols[i % 2]; g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + 16, h); g.lineTo(i * 32 + 32, 0); g.fill(); }
    g.strokeStyle = '#6b5b3a'; g.lineWidth = 2;
    for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + 16, h); g.stroke(); }
  });
  ballObj = group(3.45, .3, 3.3); ballObj.userData.v = 0;
  ball(.3, new THREE.MeshStandardMaterial({ map: vb, roughness: .5 }), ballObj, 0, 0, 0, 28);
  hoverable(ballObj, { title: 'Volleyball', desc: 'Click to bounce it. I play whenever I can.', onClick: () => { ballObj.userData.v = 5.2; } });
  // rep counter above the door
  const c = document.createElement('canvas'); c.width = 384; c.height = 128;
  repCtx = c.getContext('2d'); repTex = new THREE.CanvasTexture(c); repTex.colorSpace = THREE.SRGBColorSpace;
  rbox(1.15, .42, .05, mat(C.walnutD), null, BAR.x, 4.6, -3.96, .02);
  put(new THREE.Mesh(new THREE.PlaneGeometry(1.05, .35), new THREE.MeshBasicMaterial({ map: repTex, toneMapped: false })), null, BAR.x, 4.6, -3.93, false, false);
  drawReps();
}
function drawReps() {
  const g = repCtx;
  g.fillStyle = '#1c140e'; g.fillRect(0, 0, 384, 128);
  g.fillStyle = '#e8813a'; g.font = '700 30px ui-monospace,Menlo,monospace'; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillText('PULL-UPS', 22, 64);
  g.fillStyle = '#f1e2c2'; g.font = '700 64px ui-monospace,Menlo,monospace'; g.textAlign = 'right';
  g.fillText(String(reps).padStart(3, '0'), 366, 66);
  repTex.needsUpdate = true;
}

// ---------- me (rigged GLB) doing pull-ups in the doorway ----------
// The model only ships with walk/run clips, so the pull-up is posed in code:
// the body moves up and down, and a two-bone IK keeps both hands on the bar.
const me = {};
function buildMe(gltf) {
  const root = gltf.scene;
  root.traverse(o => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
    if (o.isBone) o.userData.rest = o.quaternion.clone();
  });
  const bone = n => root.getObjectByName('mixamorig' + n) || root.getObjectByName('mixamorig:' + n);
  Object.assign(me, {
    root, bones: [], arm: [bone('LeftArm'), bone('RightArm')], fore: [bone('LeftForeArm'), bone('RightForeArm')],
    hand: [bone('LeftHand'), bone('RightHand')], up: [bone('LeftUpLeg'), bone('RightUpLeg')], leg: [bone('LeftLeg'), bone('RightLeg')],
    head: bone('Head'), top: bone('HeadTop_End'), toe: bone('LeftToeBase'),
  });
  root.traverse(o => { if (o.isBone) me.bones.push(o); });
  scene.add(root);
  root.updateMatrixWorld(true);
  const tall = me.top.getWorldPosition(new V()).y - me.toe.getWorldPosition(new V()).y;
  root.scale.multiplyScalar(2.95 / tall);
  root.position.set(BAR.x, 0, BAR.z + .12);
  root.updateMatrixWorld(true);
  const sh = me.arm[0].getWorldPosition(new V()), el = me.fore[0].getWorldPosition(new V()), wr = me.hand[0].getWorldPosition(new V());
  me.shoulderY = sh.y - root.position.y;
  me.reach = sh.distanceTo(el) + el.distanceTo(wr);
  me.halfGrip = Math.abs(sh.x - BAR.x) + .16;
  hoverable(root, { title: 'Me', desc: () => ctl.mode === 'bar' ? `Doing pull-ups. Rep ${reps}… still going.` : 'Walk me around with the arrow keys.' });
  // walking clip, kept in place (the room code moves her)
  const clip = gltf.animations.find(a => /walk/i.test(a.name)) || gltf.animations[0];
  if (clip) {
    clip.tracks.forEach(t => {
      if (/Hips\.position$/.test(t.name)) for (let i = 3; i < t.values.length; i += 3) { t.values[i] = t.values[0]; t.values[i + 2] = t.values[2]; }
    });
    me.mixer = new THREE.AnimationMixer(root);
    me.walk = me.mixer.clipAction(clip);
    me.walk.play();
    me.cycle = clip.duration;
  }
  pose(0, 0);
}
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion();
const va = new V(), vb = new V(), vc = new V(), vd = new V();
function turnWorld(b, q) {
  b.getWorldQuaternion(qb); b.parent.getWorldQuaternion(qc);
  b.quaternion.copy(qc.invert().multiply(q).multiply(qb));
  b.updateMatrixWorld(true);
}
function aim(b, child, target) {
  b.getWorldPosition(va); child.getWorldPosition(vb);
  qa.setFromUnitVectors(vb.sub(va).normalize(), vc.copy(target).sub(va).normalize());
  turnWorld(b, qa);
}
function joint(a, b, l1, l2, bend) {
  const d = Math.min(Math.max(a.distanceTo(b), .05), l1 + l2 - .001);
  const dir = new V().subVectors(b, a).normalize();
  const side = bend.clone().sub(dir.clone().multiplyScalar(bend.dot(dir))).normalize();
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), y = Math.sqrt(Math.max(l1 * l1 - x * x, 0));
  return a.clone().addScaledVector(dir, x).addScaledVector(side, y);
}
const X = new V(1, 0, 0);
function pose(p, t) {
  const { root } = me;
  me.bones.forEach(b => b.quaternion.copy(b.userData.rest));
  const shoulder = BAR.y - .08 - me.reach * (.97 - .66 * p);
  root.position.y = shoulder - me.shoulderY;
  root.updateMatrixWorld(true);
  me.up.forEach(b => turnWorld(b, qa.setFromAxisAngle(X, -.28 - .08 * p + Math.sin(t * 1.4) * .03)));
  me.leg.forEach(b => turnWorld(b, qa.setFromAxisAngle(X, 1.05 + .1 * p)));
  turnWorld(me.head, qa.setFromAxisAngle(X, -.25 * p));
  [0, 1].forEach(i => {
    const S = me.arm[i].getWorldPosition(new V()), E = me.fore[i].getWorldPosition(new V()), Hh = me.hand[i].getWorldPosition(new V());
    const side = Math.sign(S.x - BAR.x) || (i ? -1 : 1);
    const target = vd.set(BAR.x + side * me.halfGrip, BAR.y - .06, BAR.z);
    const elbow = joint(S, target, S.distanceTo(E), E.distanceTo(Hh), new V(side, -.15, .35));
    aim(me.arm[i], me.fore[i], elbow);
    aim(me.fore[i], me.hand[i], target);
  });
}
let lastTop = 0;
function pullups(t) {
  if (!me.root) return;
  const c = t % 4.6;
  let p = c < 1.3 ? ease(c / 1.3) : c < 1.7 ? 1 : c < 3.2 ? 1 - ease((c - 1.7) / 1.5) : 0;
  if (reduce) p = .5;
  const top = c >= 1.3 ? 1 : 0;
  if (top && !lastTop) { reps++; drawReps(); }
  lastTop = top;
  pose(p, t);
}

// ---------- playable: walk around with arrows / WASD, space for pull-ups ----------
const ctl = { mode: 'bar', x: BAR.x, z: BAR.z + .12, heading: 0, keys: new Set() };
const RAD = .3, SPEED = 1.9;
const prompt = $('#rprompt');
function free(x, z) {
  const inDoor = x > DOOR.x0 + RAD && x < DOOR.x1 - RAD;
  if (x < -3.97 + RAD || x > 4 - RAD || z > 4 - RAD) return false;
  if (z < -3.97 + RAD && !(inDoor && z > -4.05)) return false;
  return !cols.some(([a, b, c, d]) => x > a - RAD && x < b + RAD && z > c - RAD && z < d + RAD);
}
const nearBar = () => Math.abs(ctl.x - BAR.x) < .75 && ctl.z < BAR.z + 1.1;
function toBar() {
  ctl.mode = 'bar'; ctl.x = BAR.x; ctl.z = BAR.z + .12; ctl.heading = 0;
  me.root.position.set(ctl.x, 0, ctl.z); me.root.rotation.y = 0; lastTop = 1;
}
function offBar() {
  ctl.mode = 'stand'; ctl.z = BAR.z + .55;
  me.root.position.set(ctl.x, 0, ctl.z);
}
function setPrompt(text) { if (prompt.textContent !== text) prompt.textContent = text; prompt.hidden = !text; }
function standPose(t) {
  const { root } = me;
  me.bones.forEach(b => b.quaternion.copy(b.userData.rest));
  root.updateMatrixWorld(true);
  const h = ctl.heading, right = new V(Math.cos(h), 0, -Math.sin(h)), fwd = new V(Math.sin(h), 0, Math.cos(h));
  [0, 1].forEach(i => {
    const S = me.arm[i].getWorldPosition(new V()), E = me.fore[i].getWorldPosition(new V()), Hh = me.hand[i].getWorldPosition(new V());
    const side = Math.sign(S.clone().sub(root.position).dot(right)) || (i ? -1 : 1);
    const target = S.clone().addScaledVector(new V(0, -1, 0), me.reach * .93).addScaledVector(right, side * .2).addScaledVector(fwd, .05 + Math.sin(t * 1.6) * .01);
    const elbow = joint(S, target, S.distanceTo(E), E.distanceTo(Hh), fwd.clone().multiplyScalar(-1).addScaledVector(right, side * .3));
    aim(me.arm[i], me.fore[i], elbow);
    aim(me.fore[i], me.hand[i], target);
  });
}
function control(dt, t) {
  if (!me.root) return;
  const k = ctl.keys;
  const ix = (k.has('r') ? 1 : 0) - (k.has('l') ? 1 : 0), iy = (k.has('u') ? 1 : 0) - (k.has('d') ? 1 : 0);
  if (ctl.mode === 'bar') {
    if (ix || iy) offBar(); else { pullups(t); setPrompt(document.activeElement === cv ? 'Press an arrow key to hop off the bar' : ''); return; }
  }
  // screen directions on the floor, following the camera angle: up = away from you, right = screen right
  const cy = Math.cos(orbit.yaw), sy = Math.sin(orbit.yaw);
  let dx = ix * cy - iy * sy, dz = -ix * sy - iy * cy;
  const len = Math.hypot(dx, dz);
  if (len) {
    dx /= len; dz /= len;
    const nx = ctl.x + dx * SPEED * dt, nz = ctl.z + dz * SPEED * dt;
    if (free(nx, nz)) { ctl.x = nx; ctl.z = nz; } else if (free(nx, ctl.z)) ctl.x = nx; else if (free(ctl.x, nz)) ctl.z = nz;
    const want = Math.atan2(dx, dz);
    let d = want - ctl.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
    ctl.heading += d * Math.min(1, dt * 12);
    ctl.mode = 'walk';
    me.root.position.set(ctl.x, 0, ctl.z); me.root.rotation.y = ctl.heading;
    if (me.mixer) { me.mixer.timeScale = SPEED / 2.4 * me.cycle; me.mixer.update(dt); } else standPose(t);
    // bump the volleyball
    const bd = Math.hypot(ballObj.position.x - ctl.x, ballObj.position.z - ctl.z);
    if (bd < .65 && ballObj.position.y <= .31) ballObj.userData.v = 4.5;
  } else {
    ctl.mode = 'stand';
    me.root.position.set(ctl.x, 0, ctl.z); me.root.rotation.y = ctl.heading;
    standPose(t);
  }
  setPrompt(nearBar() ? 'Press Space to do pull-ups' : '');
}
const KEYS = { ArrowUp: 'u', ArrowDown: 'd', ArrowLeft: 'l', ArrowRight: 'r', w: 'u', s: 'd', a: 'l', d: 'r', W: 'u', S: 'd', A: 'l', D: 'r' };
function jump() { if (!me.root) return; if (ctl.mode === 'bar') offBar(); else if (nearBar()) toBar(); }
cv.addEventListener('keydown', e => {
  if (KEYS[e.key]) { e.preventDefault(); ctl.keys.add(KEYS[e.key]); $('#rhint').classList.add('gone'); }
  if (e.key === ' ') { e.preventDefault(); if (!e.repeat) jump(); }
});
cv.addEventListener('keyup', e => { if (KEYS[e.key]) ctl.keys.delete(KEYS[e.key]); });
cv.addEventListener('blur', () => ctl.keys.clear());
document.querySelectorAll('#rpad [data-move]').forEach(b => {
  const m = b.dataset.move;
  b.addEventListener('pointerdown', e => { e.preventDefault(); if (m === 'j') jump(); else ctl.keys.add(m); $('#rhint').classList.add('gone'); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => ctl.keys.delete(m)));
});

// ---------- day / night (the room starts in the evening, like the picture) ----------
let night = 1, nightT = 1;
const L = {
  day: { sky: new THREE.Color('#fff4e6'), ground: new THREE.Color('#8a6a4e'), hemi: 1.05, sun: 2.4, sunC: new THREE.Color('#ffe7c4'), env: .45, exp: 1.0, bg: new THREE.Color('#120c08') },
  night: { sky: new THREE.Color('#ffcf9e'), ground: new THREE.Color('#2a1810'), hemi: .3, sun: .45, sunC: new THREE.Color('#ffb98a'), env: .12, exp: 1.15, bg: new THREE.Color('#030201') },
};
const bg = new THREE.Color();
function applyLight() {
  const k = nightT, d = L.day, n = L.night;
  hemi.intensity = lerp(d.hemi, n.hemi, k);
  hemi.color.copy(d.sky).lerp(n.sky, k); hemi.groundColor.copy(d.ground).lerp(n.ground, k);
  sun.intensity = lerp(d.sun, n.sun, k); sun.color.copy(d.sunC).lerp(n.sunC, k);
  scene.environmentIntensity = lerp(d.env, n.env, k);
  lamps.forEach(l => { l.intensity = l === deskLight ? lerp(.3, l.userData.I, k) : l.userData.I * k; });
  views.forEach(m => { m.opacity = k; });
  renderer.toneMappingExposure = lerp(d.exp, n.exp, k);
  bloom.strength = lerp(.12, .5, k);
  bg.copy(d.bg).lerp(n.bg, k); renderer.setClearColor(bg);
}
function flicker(t) {
  glows.forEach(gl => {
    const base = lerp(gl.day, gl.night, nightT);
    gl.m.emissiveIntensity = gl.flicker ? base * (.82 + .18 * Math.sin(t * 13 + gl.seed) * Math.sin(t * 7.3 + gl.seed * 2)) : base;
  });
}
const dn = $('#rnight');
dn.onclick = () => {
  night = night ? 0 : 1;
  dn.textContent = night ? '☀ Day' : '☾ Night';
  dn.setAttribute('aria-pressed', String(!night));
  wake();
};

// ---------- camera focus ----------
const FOCUS = {
  room: { t: [0, 2, 0], z: 1 },
  bed: { t: [-2.2, 1.4, .45], z: 1.6 },
  board: { t: [-3.9, 3.7, .45], z: 2.1 },
  desk: { t: [.6, 2.0, -3.2], z: 1.9 },
  gym: { t: [3.0, 2.3, -2.2], z: 1.75 },
  books: { t: [-3.4, .8, 2.85], z: 2.4 },
};
let focus = 'room', zoom = reduce ? 1 : 1.25;
const look = new V(...FOCUS.room.t);
const focusBtns = [...document.querySelectorAll('#rfocus [data-focus]')];
function goTo(k) {
  focus = k;
  focusBtns.forEach(b => b.setAttribute('aria-current', String(b.dataset.focus === k)));
  $('#rhint').classList.add('gone');
  wake();
}
focusBtns.forEach(b => b.addEventListener('click', () => {
  if (b.dataset.focus === 'room') resetView();
  goTo(b.dataset.focus);
  if (b.dataset.focus === 'desk') setTimeout(() => openOS(), reduce ? 0 : 650);
}));
function openComputer(app) { goTo('desk'); setTimeout(() => openOS(app), reduce ? 0 : 650); }

// ---------- sizing: fit the whole room snugly in the frame ----------
const ROOM_PTS = [];
[-4.2, 4.1].forEach(x => [-4.2, 4.1].forEach(z => [-.45, H].forEach(y => ROOM_PTS.push(new V(x, y, z)))));
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false); composer.setSize(w, h);
  frameRoom();
  wake();
}
// frame the whole room for the current angle
function frameRoom() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  const a = w / h;
  cam.position.copy(VIEW).multiplyScalar(40); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
  const inv = cam.matrixWorldInverse, lo = new V(Infinity, Infinity, 0), hi = new V(-Infinity, -Infinity, 0);
  ROOM_PTS.forEach(p => { const q = p.clone().applyMatrix4(inv); lo.min(q); hi.max(q); });
  const cx = (lo.x + hi.x) / 2, cy = (lo.y + hi.y) / 2, hx = (hi.x - lo.x) / 2, hy = (hi.y - lo.y) / 2;
  const n = Math.max(hy, hx / a) * 1.04;
  // centre of the room on screen, as a world point
  const right = new V().setFromMatrixColumn(cam.matrixWorld, 0), up = new V().setFromMatrixColumn(cam.matrixWorld, 1);
  FOCUS.room.t = new V().addScaledVector(right, cx).addScaledVector(up, cy).toArray();
  Object.assign(cam, { top: n, bottom: -n, left: -n * a, right: n * a });
  cam.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

// ---------- hover + click ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tip = $('#rtip');
let hovered = null, down = null, tipTimer = 0;
function pick(e) {
  const r = cv.getBoundingClientRect();
  ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, cam);
  const hit = ray.intersectObjects(hot, true)[0];
  let o = hit && hit.object;
  while (o && !o.userData.hot) o = o.parent;
  return o || null;
}
function showTip(o, e) {
  const h = o.userData.hot, d = typeof h.desc === 'function' ? h.desc() : h.desc;
  const b = document.createElement('b'); b.textContent = h.title;
  const s = document.createElement('span'); s.textContent = d;
  tip.replaceChildren(b, s); tip.hidden = false;
  tip.style.left = Math.min(e.clientX, innerWidth - 250) + 'px';
  tip.style.top = Math.min(e.clientY, innerHeight - 90) + 'px';
}
let drag = null;
cv.addEventListener('pointermove', e => {
  if (drag && drag.id === e.pointerId) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.on && Math.hypot(dx, dy) > 6) {
      drag.on = true; cv.setPointerCapture(e.pointerId);
      hovered = null; tip.hidden = true; cv.style.cursor = 'grabbing'; $('#rhint').classList.add('gone');
    }
    if (drag.on) {
      const k = 3.2 / Math.max(300, cv.clientWidth);
      orbit.ty = clampN(orbit.ty - dx * k, YAW_MIN, YAW_MAX);
      if (e.pointerType !== 'touch') orbit.tp = clampN(orbit.tp + dy * k, P_MIN, P_MAX);
      drag.x = e.clientX; drag.y = e.clientY; wake();
      return;
    }
  }
  if (e.pointerType === 'touch' || osOpen()) return;
  const o = pick(e);
  if (o !== hovered) wake();
  hovered = o; cv.style.cursor = o ? 'pointer' : 'default';
  o ? showTip(o, e) : (tip.hidden = true);
});
cv.addEventListener('pointerleave', () => { hovered = null; tip.hidden = true; wake(); });
cv.addEventListener('pointerdown', e => {
  down = { x: e.clientX, y: e.clientY }; cv.focus({ preventScroll: true });
  if (!e.button) drag = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false };
});
cv.addEventListener('pointercancel', () => { drag = null; down = null; cv.style.cursor = 'default'; });
cv.addEventListener('dblclick', () => { resetView(); wake(); });
// trackpad pinch (and ctrl + scroll) zooms; a plain scroll still scrolls the page
cv.addEventListener('wheel', e => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  orbit.tz = clampN(orbit.tz * Math.exp(-e.deltaY * .01), UZ_MIN, UZ_MAX); wake();
}, { passive: false });
cv.addEventListener('pointerup', e => {
  if (drag && drag.on) { drag = null; down = null; cv.style.cursor = 'default'; return; }
  drag = null;
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) { down = null; return; }
  down = null;
  const o = pick(e);
  if (!o) { tip.hidden = true; return; }
  if (e.pointerType === 'touch') { showTip(o, e); clearTimeout(tipTimer); tipTimer = setTimeout(() => (tip.hidden = true), 2600); }
  const h = o.userData.hot;
  if (h.onClick) h.onClick();
});
addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });

// ---------- the computer: a small Mac-style desktop with three apps ----------
const os = $('#ros'), desk = $('#mdesk');
const osOpen = () => !os.hidden;
let lastFocus = null, chartsOn = false, zTop = 10;
const wins = Object.fromEntries([...desk.querySelectorAll('.mwin')].map(w => [w.dataset.app, w]));
const dockBtn = k => os.querySelector(`.mdock [data-open="${k}"]`);
// where each window first opens, as fractions of the desktop
const START = { stocks: [.05, .05, .66, .74], term: [.32, .2, .54, .58], notes: [.16, .03, .64, .8] };
const shown = w => !w.hidden && !w.classList.contains('mini');
function syncCharts() { chartsOn = osOpen() && shown(wins.stocks); if (chartsOn) requestAnimationFrame(drawChart); }
function front(w) {
  Object.values(wins).forEach(o => o.classList.toggle('front', o === w));
  if (w) w.style.zIndex = ++zTop;
  $('#mapp').textContent = w ? w.dataset.title : 'Finder';
}
function topWin() { return Object.values(wins).filter(shown).sort((a, b) => b.style.zIndex - a.style.zIndex)[0] || null; }
function place(w) {
  const [x, y, ww, hh] = START[w.dataset.app], W = desk.clientWidth, Hh = desk.clientHeight - 78;
  w.style.width = Math.max(300, W * ww) + 'px'; w.style.height = Math.max(220, Hh * hh) + 'px';
  w.style.left = W * x + 'px'; w.style.top = Hh * y + 'px'; w.dataset.placed = 1;
}
function openApp(k) {
  const w = wins[k]; if (!w) return;
  if (w.hidden) { w.hidden = false; if (!w.dataset.placed) place(w); }
  w.classList.remove('mini'); dockBtn(k).classList.add('on');
  front(w); syncCharts();
  if (k === 'notes') setTimeout(() => (notesView === 'new' ? ntext : $('#rnew')).focus({ preventScroll: true }), 30);
  if (k === 'term') { if (!tout.childNodes.length) termHello(); setTimeout(() => tin.focus({ preventScroll: true }), 30); }
  if (k === 'stocks') setTimeout(() => os.querySelector('#rchips [aria-pressed="true"]')?.focus({ preventScroll: true }), 30);
}
function closeApp(w) { w.hidden = true; w.classList.remove('mini', 'max'); dockBtn(w.dataset.app).classList.remove('on'); front(topWin()); syncCharts(); }
function minApp(w) { w.classList.add('mini'); front(topWin()); syncCharts(); dockBtn(w.dataset.app).focus({ preventScroll: true }); }
Object.values(wins).forEach(w => {
  w.addEventListener('pointerdown', () => { if (!w.classList.contains('front')) front(w); });
  w.querySelectorAll('.lights button').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const a = b.dataset.act;
    if (a === 'close') closeApp(w); else if (a === 'min') minApp(w); else { w.classList.toggle('max'); syncCharts(); }
  }));
  // drag a window around by its title bar
  const bar = w.querySelector('.mtitle');
  bar.addEventListener('dblclick', e => { if (!e.target.closest('button')) { w.classList.toggle('max'); syncCharts(); } });
  bar.addEventListener('pointerdown', e => {
    if (e.button || e.target.closest('button') || w.classList.contains('max') || innerWidth <= 760) return;
    const sx = e.clientX, sy = e.clientY, l0 = w.offsetLeft, t0 = w.offsetTop;
    bar.setPointerCapture(e.pointerId);
    const move = ev => {
      const W = desk.clientWidth, Hh = desk.clientHeight;
      w.style.left = Math.min(W - 80, Math.max(80 - w.offsetWidth, l0 + ev.clientX - sx)) + 'px';
      w.style.top = Math.min(Hh - 40, Math.max(0, t0 + ev.clientY - sy)) + 'px';
    };
    const up = () => { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up); };
    bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
  });
});
os.querySelectorAll('.mdock [data-open]').forEach(b => b.addEventListener('click', () => {
  const w = wins[b.dataset.open];
  // clicking the icon of the window already in front minimizes it, like the real dock
  if (shown(w) && w.classList.contains('front')) minApp(w); else openApp(b.dataset.open);
}));
desk.addEventListener('pointerdown', e => { if (e.target === desk) front(null); });

// menu bar clock
const clockEl = $('#mclock');
const tickClock = () => {
  const d = new Date();
  clockEl.textContent = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + '  ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  $('#rdate').textContent = d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
};
let clockTimer = 0;

function openOS(app) {
  if (osOpen()) { if (app) openApp(app); return; }
  lastFocus = document.activeElement; os.hidden = false;
  document.documentElement.classList.add('ros-open');
  tickClock(); clockTimer = setInterval(tickClock, 10000);
  if (app) openApp(app);
  else { syncCharts(); front(topWin()); setTimeout(() => (os.querySelector('.mwin.front .lights button') || dockBtn('stocks')).focus({ preventScroll: true }), 30); }
}
function closeOS() {
  if (os.hidden) return;
  os.hidden = true; chartsOn = false; clearInterval(clockTimer);
  document.documentElement.classList.remove('ros-open');
  if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  goTo('room');
}
$('#rclose').onclick = closeOS;
$('#rnote').onclick = () => openComputer('notes');
os.addEventListener('pointerdown', e => { if (e.target === os) closeOS(); });
addEventListener('keydown', e => {
  if (os.hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); closeOS(); }
  if (e.key === 'Tab') {
    const f = [...os.querySelectorAll('button,input,textarea')].filter(el => !el.closest('[hidden]') && !el.closest('.mini') && el.offsetParent);
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

// ---------- Notes app: the shared visitor guestbook ----------
const nlist = $('#rnotelist'), nform = $('#rnoteform'), ntext = $('#rtext'), nname = $('#rname'), nmsg = $('#rnotemsg'), nread = $('#rread');
const when = d => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const firstLine = t => { const s = t.trim().split('\n')[0]; return s.length > 34 ? s.slice(0, 33) + '…' : s; };
let notes = [], notesView = 'new';
function showNote(i) {
  notesView = i;
  const n = notes[i];
  nform.hidden = i !== 'new'; nread.hidden = i === 'new';
  $('#rwhen').textContent = i === 'new' ? when(new Date()) : when(n.created_at);
  if (i !== 'new') {
    const p = document.createElement('p'); p.textContent = n.text;
    const by = document.createElement('div'); by.className = 'by'; by.textContent = '— ' + n.name;
    nread.replaceChildren(p, by);
  }
  nlist.querySelectorAll('button').forEach(b => b.setAttribute('aria-current', String(+b.dataset.i === i)));
}
function renderNotes() {
  nlist.replaceChildren(...notes.map((n, i) => {
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.dataset.i = i; b.setAttribute('aria-current', String(notesView === i));
    const t = document.createElement('b'); t.textContent = firstLine(n.text);
    const s = document.createElement('small'); s.textContent = `${new Date(n.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}  ${n.name}`;
    b.append(t, s); b.onclick = () => showNote(i); li.append(b); return li;
  }));
  $('#rnotecount').textContent = notes.length + (notes.length === 1 ? ' note' : ' notes');
}
Notes.load().then(ns => { notes = ns; renderNotes(); });
addEventListener('notes:added', e => { if (!notes.includes(e.detail)) { notes.splice(1, 0, e.detail); renderNotes(); } });
$('#rnew').onclick = () => { showNote('new'); ntext.focus(); };
$('#rnotefine').textContent = Notes.online ? 'Every visitor can read these.' : 'Preview mode: notes are only saved in this browser.';
ntext.addEventListener('input', () => { $('#rcount').textContent = ntext.value.length + ' / 140'; });
nform.addEventListener('submit', async e => {
  e.preventDefault();
  const wait = Notes.waitSeconds();
  if (wait) { nmsg.textContent = `You can leave another note in ${wait}s.`; return; }
  if (!ntext.value.trim()) return;
  nmsg.textContent = 'Pinning…';
  try {
    await Notes.add({ ...Notes.ROOM, name: nname.value.trim() || 'someone', text: ntext.value });
    ntext.value = ''; $('#rcount').textContent = '0 / 140'; nmsg.textContent = 'Pinned. Thank you!';
    renderNotes(); showNote(1);
  } catch { nmsg.textContent = 'Could not save your note. Please try again.'; }
});
showNote('new');

// ---------- Terminal app: does nothing useful, on purpose ----------
const tout = $('#tout'), tin = $('#tin'), term = $('#term');
const hist = []; let hi = 0;
function say(text, cls) { const s = document.createElement('span'); if (cls) s.className = cls; s.textContent = text + '\n'; tout.append(s); term.scrollTop = term.scrollHeight; }
function termHello() {
  say(`Last login: ${new Date().toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} on ttys000`, 'dim');
  say("Type 'help' to see everything this terminal can't do.", 'dim');
}
const FILES = {
  'readme.txt': "This is a terminal. It is not connected to anything.\nYou can't break it. Please try anyway.",
  'todo.md': '- [x] build a 3D room\n- [x] put a computer in it\n- [ ] make the computer useful\n- [ ] one more pull-up',
  'plants.log': 'monstera ......... alive\npothos ........... thriving\nthe little one ... hanging in there',
};
const FORTUNES = ['The snow is always better on the next run.', 'Your next commit will build on the first try. (It will not.)',
  'A note left today is a smile tomorrow.', 'Drink water. Then do one more pull-up.', 'Somewhere, a candle is flickering just for you.'];
const TIGER = String.raw`   /\_/\      guest@begums-mac
  ( o.o )     ----------------
   > ^ <      OS: begum.os 1.0 (walnut)
              Host: a desk by the window
              Shell: zsh (decorative)
              CPU: 1 candle @ 0.0 GHz
              Memory: 140 characters per note
              Uptime: ${Math.round(performance.now() / 60000)} min`;
const CMDS = {
  help: () => 'help  ls  cat <file>  cd  pwd  whoami  date  echo  fortune  neofetch\nsudo  coffee  history  clear  exit',
  ls: a => a.includes('-a') ? '.  ..  .secret  ' + Object.keys(FILES).join('  ') : Object.keys(FILES).join('  ') + '  snowboard/',
  cat: a => !a[0] ? 'cat: which file?' : a[0] === '.secret' ? 'nice try 🐯' : FILES[a[0]] ?? `cat: ${a[0]}: No such file or directory`,
  cd: a => a[0] && a[0] !== '~' ? (a[0].startsWith('snowboard') ? 'cd: snowboard: it is hanging on the wall, you cannot go inside' : `cd: no such file or directory: ${a[0]}`) : '',
  pwd: () => '/Users/guest/begums-room',
  whoami: () => 'guest (a very welcome one)',
  date: () => new Date().toString(),
  echo: a => a.join(' '),
  fortune: () => FORTUNES[Math.random() * FORTUNES.length | 0],
  neofetch: () => TIGER.replace(/Uptime: \d+/, 'Uptime: ' + Math.max(1, Math.round(performance.now() / 60000))),
  sudo: () => ['guest is not in the sudoers file. This incident will be reported to the tiger.', 'e'],
  rm: () => ['rm: nope.', 'e'],
  coffee: () => ['brewing... ☕\nerror: this computer has no coffee machine. try the kitchen.', 'a'],
  history: () => hist.map((h, i) => `  ${i + 1}  ${h}`).join('\n'),
  vim: () => 'you are now stuck in vim forever. (just kidding, type anything)',
  exit: () => { setTimeout(() => closeApp(wins.term), 120); return 'logout'; },
};
$('#tform').addEventListener('submit', e => {
  e.preventDefault();
  const line = tin.value; tin.value = '';
  say('guest@begums-mac ~ % ' + line, 'p');
  const [cmd, ...args] = line.trim().split(/\s+/);
  if (!cmd) return;
  hist.push(line.trim()); hi = hist.length;
  if (cmd === 'clear') { tout.replaceChildren(); return; }
  const f = Object.hasOwn(CMDS, cmd.toLowerCase()) ? CMDS[cmd.toLowerCase()] : null;
  if (!f) return say(`zsh: command not found: ${cmd}`, 'e');
  const r = f(args);
  if (Array.isArray(r)) say(r[0], r[1]); else if (r) say(r);
});
tin.addEventListener('keydown', e => {
  if (e.key === 'ArrowUp' && hi > 0) { e.preventDefault(); tin.value = hist[--hi]; }
  if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(hist.length, hi + 1); tin.value = hist[hi] || ''; }
  if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); tout.replaceChildren(); }
});
term.addEventListener('click', () => { if (!getSelection().toString()) tin.focus({ preventScroll: true }); });

// ---------- Trading app: made-up live candlestick charts ----------
const TICKERS = [
  { sym: 'SNOW', name: 'Snowboard Index', base: 142, vol: 2.2 }, { sym: 'SPIKE', name: 'Volleyball Futures', base: 88, vol: 1.7 },
  { sym: 'PULLUP', name: 'Pull-up Capital', base: 64, vol: 1.3 }, { sym: 'SHUTR', name: 'Photo Shares', base: 211, vol: 2.8 },
  { sym: 'BOOKS', name: 'Reading List ETF', base: 37, vol: .9 }, { sym: 'CNDL', name: 'Candle Light Co.', base: 19, vol: .6 },
];
const N = 48;
const rng = seed => () => { seed |= 0; seed = seed + 1831565813 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const wiggle = r => (r() + r() + r() + r() - 2) * 1.7;
const series = TICKERS.map((k, i) => {
  const r = rng(i * 991 + 7); let px = k.base; const out = [];
  for (let j = 0; j < N; j++) {
    const o = px; px = Math.max(5, px + wiggle(r) * k.vol);
    out.push({ o, c: px, h: Math.max(o, px) + r() * k.vol * .6, l: Math.min(o, px) - r() * k.vol * .6 });
  }
  return out;
});
const UP = '#30d158', DOWN = '#ff453a', BG = '#1c1c1e';
const change = s => (s[N - 1].c / s[0].o - 1) * 100;
let pick_ = 0, ticks = 0;
function drawChart() {
  const c = $('#rchart');
  if (!c.clientWidth || !c.clientHeight) return;
  const dpr = Math.min(devicePixelRatio || 1, 2), w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const s = series[pick_];
  let lo = Infinity, hi = -Infinity; s.forEach(k => { lo = Math.min(lo, k.l); hi = Math.max(hi, k.h); });
  const pad = (hi - lo) * .12; lo -= pad; hi += pad;
  const L = 4, R = 56, T = 6, B = 6, cw = (w - L - R) / N, y = v => T + (hi - v) / (hi - lo) * (h - T - B);
  g.font = '11px -apple-system,BlinkMacSystemFont,system-ui,sans-serif'; g.textBaseline = 'middle'; g.strokeStyle = '#2c2c2e'; g.fillStyle = '#8e8e93'; g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4, yy = Math.round(y(v)) + .5; g.beginPath(); g.moveTo(L, yy); g.lineTo(w - R, yy); g.stroke(); g.fillText(v.toFixed(1), w - R + 6, yy); }
  s.forEach((k, i) => {
    const x = L + i * cw + cw / 2, up = k.c >= k.o, col = up ? UP : DOWN;
    g.strokeStyle = col; g.fillStyle = col; g.beginPath(); g.moveTo(x, y(k.h)); g.lineTo(x, y(k.l)); g.stroke();
    const top = y(Math.max(k.o, k.c)), bh = Math.max(2, Math.abs(y(k.o) - y(k.c)));
    if (up) g.fillRect(x - cw * .32, top, cw * .64, bh);
    else { g.fillStyle = BG; g.fillRect(x - cw * .32, top, cw * .64, bh); g.strokeRect(x - cw * .32 + .5, top + .5, cw * .64 - 1, bh - 1); }
  });
  const last = s[N - 1], ly = y(last.c), pct = change(s), col = pct >= 0 ? UP : DOWN;
  g.setLineDash([4, 4]); g.strokeStyle = col; g.beginPath(); g.moveTo(L, ly); g.lineTo(w - R, ly); g.stroke(); g.setLineDash([]);
  g.fillStyle = col; g.beginPath(); g.roundRect(w - R + 1, ly - 9, R - 3, 18, 4); g.fill(); g.fillStyle = '#fff'; g.fillText(last.c.toFixed(1), w - R + 6, ly);
  $('#rqpx').textContent = last.c.toFixed(2);
  const ch = $('#rqch'); ch.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%'; ch.className = 'ch ' + (pct >= 0 ? 'up' : 'down');
  // watchlist prices
  os.querySelectorAll('#rchips button').forEach((b, i) => {
    const p = change(series[i]);
    b.querySelector('.wpx').textContent = series[i][N - 1].c.toFixed(2);
    const pill = b.querySelector('.pill'); pill.textContent = (p >= 0 ? '+' : '') + p.toFixed(2) + '%'; pill.classList.toggle('down', p < 0);
  });
}
function pickTicker(i) {
  pick_ = i; $('#rqsym').textContent = TICKERS[i].sym; $('#rqname').textContent = TICKERS[i].name;
  os.querySelectorAll('#rchips button').forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
  drawChart();
}
TICKERS.forEach((k, i) => {
  const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
  b.innerHTML = '<b></b><span class="wpx"></span><span class="nm"></span><span class="pill"></span>';
  b.querySelector('b').textContent = k.sym; b.querySelector('.nm').textContent = k.name;
  b.onclick = () => pickTicker(i); $('#rchips').append(b);
});
pickTicker(0);
setInterval(() => {
  if (!chartsOn) return;
  series.forEach((s, i) => { const k = s[N - 1], v = TICKERS[i].vol; k.c = Math.max(5, k.c + wiggle(Math.random) * v * .35); k.h = Math.max(k.h, k.c); k.l = Math.min(k.l, k.c); });
  if (++ticks % 6 === 0) series.forEach(s => { const c = s[N - 1].c; s.shift(); s.push({ o: c, c, h: c, l: c }); });
  drawChart();
}, 1000);
new ResizeObserver(() => chartsOn && drawChart()).observe($('#rchart').parentElement);

// ---------- build ----------
buildShell();
buildWindow('left', -2.85, 7); buildWindow('back', DESK.x, 4);
const standFront = nightstand(2.85, true), standBack = nightstand(-1.95, false);
bookStack(standFront);
plant({ x: -3.45, z: 3.62, pot: 'terra', potR: .2, potH: .35, stems: 9, size: .32, height: .9, seed: 2, y: 0 });
buildPrints(); buildMirror(); buildChair(); buildShelf(); buildGym();
// big plants: monstera under the side window, two by the mirror
hoverable(plant({ x: -3.3, z: -3.05, potR: .3, potH: .55, stems: 11, size: .75, height: 1.9, spread: 1.0, seed: 9, wide: 1.35 }), { title: 'Monstera', desc: 'Still alive. Mostly.' });
plant({ x: -3.2, z: -3.45, potR: .26, potH: .45, stems: 14, size: .38, height: 2.6, spread: .55, seed: 13 });
plant({ x: -1.05, z: -3.45, potR: .25, potH: .45, stems: 12, size: .4, height: 2.2, spread: .6, seed: 21 });
plant({ x: DESK.x - 1.55, z: -3.5, potR: .22, potH: .5, stems: 9, size: .42, height: 1.3, spread: .8, seed: 17 });
applyLight();
resize();

const names = Object.keys(MODELS);
const results = await Promise.allSettled(names.map(load));
const got = Object.fromEntries(names.map((n, i) => [n, results[i].status === 'fulfilled' ? results[i].value : null]));
results.forEach((r, i) => r.status === 'rejected' && console.warn('room: could not load', names[i], r.reason));
if (got.desk) buildDesk(got.desk);
if (got.rug) buildRug(got.rug);
if (got.board) buildBoard(got.board);
if (got.bed) buildBed(got.bed);
if (got.me) buildMe(got.me);
applyLight();
cover.hidden = true;
stage.classList.add('ready');
ready = true;

// ---------- loop: only runs while the room is on screen ----------
function wake() { if (ready && !running && visible && !document.hidden) { running = true; last = performance.now(); requestAnimationFrame(frame); } }
new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) wake(); }, { rootMargin: '100px' }).observe(stage);
document.addEventListener('visibilitychange', wake);
const glowCol = new THREE.Color('#ffd9a0');
function frame(now) {
  if (!visible || document.hidden) { running = false; return; }
  const dt = Math.min((now - last) / 1000, .1); last = now; clock += dt;
  const f = FOCUS[focus], k = reduce ? 1 : 1 - Math.exp(-dt * 4.5);
  look.x = lerp(look.x, f.t[0], k); look.y = lerp(look.y, f.t[1], k); look.z = lerp(look.z, f.t[2], k);
  zoom = lerp(zoom, f.z, k);
  const ko = reduce ? 1 : 1 - Math.exp(-dt * 10);
  if (Math.abs(orbit.ty - orbit.yaw) + Math.abs(orbit.tp - orbit.pitch) > 1e-4) {
    orbit.yaw = lerp(orbit.yaw, orbit.ty, ko); orbit.pitch = lerp(orbit.pitch, orbit.tp, ko); setView(); frameRoom();
  }
  orbit.uz = lerp(orbit.uz, orbit.tz, ko);
  cam.zoom = zoom * orbit.uz; cam.position.copy(look).addScaledVector(VIEW, 40); cam.lookAt(look); cam.updateProjectionMatrix();
  if (Math.abs(night - nightT) > .002) { nightT += (night - nightT) * (reduce ? 1 : 1 - Math.exp(-dt * 3)); applyLight(); }
  else if (nightT !== night) { nightT = night; applyLight(); }
  flicker(clock);
  hot.forEach(o => {
    const h = o.userData.hot;
    h.glow = lerp(h.glow, o === hovered ? 1 : 0, 1 - Math.exp(-dt * 12));
    o.traverse(m => {
      if (m.isMesh && m.userData.baseEm) {
        m.material.emissive.copy(m.userData.baseEm).lerp(glowCol, h.glow * .35);
        m.material.emissiveIntensity = Math.max(m.userData.baseEmI, h.glow * .6);
      }
    });
  });
  control(dt, clock);
  const b = ballObj.userData;
  if (b.v !== 0 || ballObj.position.y > .3) {
    b.v -= 14 * dt; ballObj.position.y += b.v * dt;
    if (ballObj.position.y <= .3) { ballObj.position.y = .3; b.v = Math.abs(b.v) > 1 ? -b.v * .55 : 0; }
    ballObj.rotation.z += dt * 2;
  }
  pops.forEach(p => {
    const out = p.userData.pop ? .3 : 0;
    p.position.x = lerp(p.position.x, p.userData.home + out, 1 - Math.exp(-dt * 10));
    if (p.userData.pop) p.userData.pop += dt;
    if (p.userData.pop > 2) p.userData.pop = 0;
  });
  screenT += dt;
  if (screenCtx && screenT > .12) { screenT = 0; drawScreen(screenCtx, 512, 280, clock); screenTex.needsUpdate = true; }
  composer.render();
  requestAnimationFrame(frame);
}
wake();

// handy for tweaking placement from the console
window.__room = { scene, cam, ctl, free, cols, goTo, openOS, closeOS, me, BAR, setNight: v => { night = v ? 1 : 0; wake(); }, get reps() { return reps; } };
