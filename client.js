import * as THREE from 'three';
import { MAP } from './shared/map.js';
import { WEAPONS, WEAPON_ORDER, LOADOUT } from './shared/weapons.js';
import { PLAYER, step, rayBox, rayWorld, hitboxes, dirFromAngles, stanceOf, canStance } from './shared/physics.js';
import { buildArena, animateArena, setupLighting, buildCharacter, buildGun, registerCharacters, loadCharacter, loadAnimations, characterLoaded, buildSoldier, soldierReady, animate, loadWeapons, muzzleDistance, setHold, buildFirstPerson, updateFirstPerson } from './visuals.js';
import { CHARACTERS, characterById } from './shared/characters.js';
import { t, LANGS, getLang, setLang, detectLang } from './shared/i18n.js';
import { SHOP, SLOTS } from './shared/shop.js';
import { P2PHostSocket, P2PGuestSocket, p2pErrorKey, validCode } from './p2p.js';
import { createVoice } from './voice.js';
import { ONLINE_SERVERS } from './shared/servers.js';
import { BRAND } from './shared/brand.js';
const gunModel = (key, scale, camo) => buildGun(key, WEAPONS[key].color, scale, camo);

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('arena.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('arena.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

// ======================= renderer & world =======================
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
renderer.autoClear = false;
renderer.localClippingEnabled = true; // first-person body: only the arms are drawn
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, 1, 0.05, 300);
const shadows = !isTouch; // phones skip shadow maps to keep 60 fps
setupLighting(scene, renderer, { shadows, mode: store.get('time', 'day') });
buildArena(scene, MAP.boxes, { shadows });

// Viewmodel: rendered in its own pass so guns never clip into walls
const vmScene = new THREE.Scene();
const vmCamera = new THREE.PerspectiveCamera(65, 1, 0.01, 10);
vmScene.add(new THREE.HemisphereLight(0xdfe6ff, 0x3a2a50, 2.2));
const vmLight = new THREE.DirectionalLight(0xffffff, 1);
vmLight.position.set(1, 2, 1);
vmScene.add(vmLight);


const viewGuns = {};
const vmRoot = new THREE.Group();
vmScene.add(vmRoot);
for (const k of WEAPON_ORDER) { viewGuns[k] = gunModel(k); viewGuns[k].visible = false; vmRoot.add(viewGuns[k]); }
const flash = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.85 }));
flash.visible = false;
vmScene.add(flash);
const flashLight = new THREE.PointLight(0xffd27a, 0, 8);
scene.add(flashLight);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = vmCamera.aspect = w / h;
  camera.updateProjectionMatrix();
  vmCamera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ======================= audio (synthesised, no assets) =======================
let actx = null, noise = null;
function initAudio() {
  if (actx) return;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  noise = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
const SHOT_SOUND = { rifle: [2200, 0.12, 120], shotgun: [900, 0.3, 70], sniper: [1500, 0.45, 55], pistol: [2800, 0.1, 160] };
function shotSound(w, vol = 1) {
  if (!actx || vol < 0.02) return;
  const [freq, dur, thump] = SHOT_SOUND[w] || SHOT_SOUND.rifle;
  const t = actx.currentTime;
  const src = actx.createBufferSource(); src.buffer = noise;
  const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(200, t + dur);
  const g = actx.createGain(); g.gain.setValueAtTime(0.5 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(actx.destination);
  src.start(t, Math.random() * 0.5, dur + 0.05);
  const o = actx.createOscillator(); o.frequency.setValueAtTime(thump, t); o.frequency.exponentialRampToValueAtTime(30, t + dur * 0.8);
  const og = actx.createGain(); og.gain.setValueAtTime(0.6 * vol, t); og.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.8);
  o.connect(og).connect(actx.destination); o.start(t); o.stop(t + dur);
}
function blip(freq, dur = 0.08, type = 'square', vol = 0.15, delay = 0) {
  if (!actx) return;
  const t = actx.currentTime + delay;
  const o = actx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  const g = actx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
}
const sfx = {
  swing: () => { if (!actx) return; const t0 = actx.currentTime; const src = actx.createBufferSource(); src.buffer = noise; const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(900, t0); f.frequency.exponentialRampToValueAtTime(3000, t0 + 0.15); const g = actx.createGain(); g.gain.setValueAtTime(0.25, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18); src.connect(f).connect(g).connect(actx.destination); src.start(t0, 0, 0.2); },
  pad: () => { blip(220, 0.25, 'sine', 0.2); blip(660, 0.18, 'triangle', 0.12, 0.05); },
  pickup: () => { blip(880, 0.07, 'sine', 0.15); blip(1320, 0.1, 'sine', 0.13, 0.06); },
  boom: (vol = 1) => { if (!actx) return; const t0 = actx.currentTime; const src = actx.createBufferSource(); src.buffer = noise; const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t0); f.frequency.exponentialRampToValueAtTime(60, t0 + 0.9); const g = actx.createGain(); g.gain.setValueAtTime(0.6 * vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 1); src.connect(f).connect(g).connect(actx.destination); src.start(t0, 0, 1); },
  slide: () => { if (!actx) return; const t0 = actx.currentTime; const src = actx.createBufferSource(); src.buffer = noise; const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1800, t0); f.frequency.exponentialRampToValueAtTime(300, t0 + 0.5); const g = actx.createGain(); g.gain.setValueAtTime(0.18, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55); src.connect(f).connect(g).connect(actx.destination); src.start(t0, 0, 0.6); },
  hit: () => blip(1400, 0.05, 'square', 0.12),
  head: () => { blip(1900, 0.06, 'square', 0.14); blip(2500, 0.08, 'square', 0.12, 0.05); },
  kill: () => { blip(660, 0.12, 'triangle', 0.25); blip(990, 0.15, 'triangle', 0.25, 0.08); blip(1320, 0.25, 'triangle', 0.25, 0.16); },
  hurt: () => blip(140, 0.15, 'sawtooth', 0.25),
  reload: () => { blip(500, 0.04, 'square', 0.08); blip(700, 0.04, 'square', 0.08, 0.25); },
  empty: () => blip(300, 0.03, 'square', 0.08),
  chat: () => blip(880, 0.05, 'sine', 0.06),
};
function say(text) {
  try { const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = 1.1; u.pitch = 0.8; speechSynthesis.speak(u); } catch { /* unsupported */ }
}
function vibrate(ms) { if (store.get('vibrate', true) && navigator.vibrate) navigator.vibrate(ms); }

// ======================= game state =======================
const me = {
  id: null, color: 0xffffff, p: [0, 0, 0], v: [0, 0, 0], onGround: true, yaw: 0, pitch: 0,
  alive: false, hp: PLAYER.maxHp, weapon: 'rifle', ammo: {}, reloadUntil: 0, lastShot: 0, ads: false,
  kills: 0, deaths: 0, heads: 0, streak: 0,
  stance: 0, eyeH: PLAYER.eye, // 0 standing, 1 crouching, 2 prone; eyeH eases toward the stance's eye height
};
for (const k of LOADOUT) me.ammo[k] = WEAPONS[k].mag;
// Armor, timed boosts and the special weapon, as told by the game (times are local performance.now() ends)
const buffs = { armor: 0, speedUntil: 0, powerUntil: 0, special: null };
let lastWeapon = 'pistol';
const hasWeapon = (k) => !WEAPONS[k].pickupOnly || (buffs.special?.w === k && performance.now() < buffs.special.until);
const remotes = new Map(); // id -> {group, buf, name, ...}
let roster = [];
let matchInfo = { state: 'playing', endsAt: 0 };
let killLimit = 25;
let quickChat = [];
const muted = new Set();
let ws = null;
let sens = store.get('sens', 1);
const keys = new Set();
let mouseDown = false;
let chatOpen = false, quickOpen = false;
let recoil = 0, bob = 0, shake = 0;
let lastHurtFrom = null, deathUntil = 0;
const touchMove = { f: 0, s: 0 };
let wantJump = false;

// ======================= remote players =======================
function nameSprite(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 30px Rubik, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, 8, 256, 48);
  x.fillStyle = '#' + color.toString(16).padStart(6, '0'); x.fillText(text, 128, 33);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(1.6, 0.4, 1);
  s.renderOrder = 10;
  return s;
}

let charSeed = 0;
// Realistic soldiers and weapon models replace the simple fallbacks as soon as they load
const modelUrl = (file) => (window.ARENA_MODELS?.[file]) || './models/' + file;
function rebuildModels() {
  for (const [id, r] of remotes) {
    scene.remove(r.group);
    remotes.set(id, makeRemote({ id, name: r.name, color: r.color, bot: r.bot, character: r.character, cosmetics: r.cosmetics }));
  }
}
// First-person arms: your own character's sleeves and hands on the view-model weapon
let fpBody = null, fpKey = '';
function refreshFirstPerson() {
  if (!soldierReady()) return;
  const eq = myProfile?.equipped || {};
  const key = selectedChar + JSON.stringify(eq) + me.color;
  if (key === fpKey) return;
  fpKey = key;
  if (fpBody) vmScene.remove(fpBody.root);
  fpBody = buildFirstPerson(selectedChar, eq, me.color ?? 0xffffff);
  vmScene.add(fpBody.root);
}
registerCharacters(CHARACTERS);
const animsLoad = loadAnimations(CHARACTERS, modelUrl).catch((e) => { console.warn('Animations unavailable', e); throw e; });
// Load a character's model when it is needed; players and the preview switch to it as soon as it arrives
const charRequested = new Set(), charFailed = new Set();
let charError = ''; // last load error, shown under the message to help diagnose
function ensureCharacter(id) {
  id = characterById(id).id;
  if (charRequested.has(id)) return;
  charRequested.add(id);
  Promise.all([animsLoad, loadCharacter(id, modelUrl)])
    .then(() => { rebuildModels(); refreshPreview(); fpKey = ''; })
    .catch((e) => { console.warn('Character model unavailable', id, e); charRequested.delete(id); charFailed.add(id); charError = String(e?.message || e).slice(0, 120); refreshPreview(); });
}
let viewCamo = null;
function setViewCamo(camo) {
  if (camo === viewCamo) return;
  viewCamo = camo;
  for (const k of WEAPON_ORDER) {
    vmRoot.remove(viewGuns[k]);
    viewGuns[k] = gunModel(k, 1, viewCamo);
    viewGuns[k].visible = k === me.weapon;
    vmRoot.add(viewGuns[k]);
  }
}
loadWeapons((file) => modelUrl('weapons/' + file)).then(() => {
  for (const k of WEAPON_ORDER) {
    vmRoot.remove(viewGuns[k]);
    viewGuns[k] = gunModel(k, 1, viewCamo);
    viewGuns[k].visible = k === me.weapon;
    vmRoot.add(viewGuns[k]);
  }
  rebuildModels();
}).catch((e) => console.warn('Weapon models unavailable, using simple guns', e));
function makeRemote(info) {
  const c = soldierReady() ? buildSoldier(info.color, charSeed++, info.character, info.cosmetics || {}) : buildCharacter(info.color, charSeed++);
  const g = c.root;
  const guns = {};
  for (const k of WEAPON_ORDER) { guns[k] = gunModel(k, 1, info.cosmetics?.camo); guns[k].visible = false; c.gunMount.add(guns[k]); }
  const tag = nameSprite(info.name, info.color); tag.position.y = 2.3;
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.18, depthWrite: false }));
  shield.position.y = 0.9; shield.visible = false;
  g.add(tag, shield);
  g.visible = false;
  scene.add(g);
  return { id: info.id, name: info.name, color: info.color, bot: info.bot, character: info.character, cosmetics: info.cosmetics, cosKey: JSON.stringify(info.cosmetics || {}), group: g, char: c, headPivot: c.neck, arm: c.aim, guns, tag, shield, buf: [], cur: null, weapon: null, lastSeen: 0, lastPos: null };
}

function syncRoster(list) {
  roster = list;
  for (const info of list) {
    if (info.id === me.id) { me.kills = info.kills; me.deaths = info.deaths; me.color = info.color; setViewCamo(info.cosmetics?.camo || null); continue; }
    ensureCharacter(info.character);
    const r = remotes.get(info.id);
    if (!r) remotes.set(info.id, makeRemote(info));
    else if (r.color !== info.color || r.cosKey !== JSON.stringify(info.cosmetics || {})) { scene.remove(r.group); remotes.set(info.id, makeRemote(info)); } // team or skin change
    if (info.id === me.id) { me.color = info.color; setViewCamo(info.cosmetics?.camo || null); }
  }
  for (const [id, r] of remotes) if (!list.find((p) => p.id === id)) { scene.remove(r.group); remotes.delete(id); }
  updateScoreboard();
  if (!$('admin-panel').classList.contains('hidden')) renderAdminPanel();
}
const nameOf = (id) => (id === me.id ? t('hud.you') : roster.find((p) => p.id === id)?.name || '???');
const colorOf = (id) => '#' + ((id === me.id ? me.color : roster.find((p) => p.id === id)?.color) ?? 0xffffff).toString(16).padStart(6, '0');

const INTERP = 100; // ms behind the newest snapshot
let dtFrame = 0;
function updateRemotes(now, dt) {
  dtFrame = dt;
  const t = now - INTERP;
  for (const r of remotes.values()) {
    const b = r.buf;
    while (b.length > 2 && b[1].t <= t) b.shift();
    if (!b.length || now - r.lastSeen > 400) { r.group.visible = false; r.cur = null; continue; }
    let s;
    if (b.length >= 2 && b[0].t <= t) {
      const k = Math.min(1, (t - b[0].t) / Math.max(1, b[1].t - b[0].t));
      s = { p: b[0].p.map((v, i) => v + (b[1].p[i] - v) * k), yaw: lerpAngle(b[0].yaw, b[1].yaw, k), pitch: b[0].pitch + (b[1].pitch - b[0].pitch) * k };
    } else s = b[0];
    r.cur = s;
    r.group.visible = true;
    const speed = r.lastPos && dtFrame > 0 ? Math.hypot(s.p[0] - r.lastPos[0], s.p[2] - r.lastPos[2]) / dtFrame : 0;
    r.lastPos = s.p;
    r.speed = (r.speed || 0) + (speed - (r.speed || 0)) * 0.2;
    r.group.position.set(s.p[0], s.p[1], s.p[2]);
    r.group.rotation.y = s.yaw;
    r.headPivot.rotation.x = s.pitch * 0.6;
    r.arm.rotation.x = s.pitch;
    const w = b[b.length - 1].w;
    if (w !== r.weapon) { for (const k in r.guns) r.guns[k].visible = k === w; r.weapon = w; setHold(r.char, w); }
    r.char.stance = b[b.length - 1].st || 0;
    animate(r.char, r.speed, now / 1000, dtFrame);
    r.shield.visible = !!b[b.length - 1].sp;
  }
}
function lerpAngle(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

// ======================= effects =======================
// Arcade-style, RIVALS-inspired: bright glowing tracers, punchy muzzle flashes, sparks and dust on impact,
// a burst when you eliminate someone. All additive so they glow in daylight too.
const tracers = [];
const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
const _up = new THREE.Vector3(0, 1, 0);
function tracer(from, to, color = 0xfff59d) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const len = a.distanceTo(b);
  if (len < 0.05) return;
  const dir = b.clone().sub(a).normalize();
  for (const [r, op, c] of [[0.012, 1, 0xffffff], [0.035, 0.55, color]]) { // white-hot core + coloured glow
    const m = new THREE.Mesh(beamGeo, glow(c, op));
    m.scale.set(r, len, r);
    m.position.copy(a).addScaledVector(dir, len / 2);
    m.quaternion.setFromUnitVectors(_up, dir);
    scene.add(m);
    tracers.push({ obj: m, life: 0.11, max: 0.11, op, shrink: true });
  }
}
const sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
function sparks(at, color = 0xffd54f, n = 6) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(sparkGeo, glow(color));
    m.position.set(...at);
    scene.add(m);
    tracers.push({ obj: m, life: 0.4, max: 0.4, op: 1, vel: [(Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8] });
  }
}
const puffGeo = new THREE.SphereGeometry(1, 8, 6);
function puff(at, color = 0xcfc8b8, size = 0.12) { // dust cloud where a bullet hits a wall
  const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }));
  m.position.set(...at); m.scale.setScalar(size);
  scene.add(m);
  tracers.push({ obj: m, life: 0.45, max: 0.45, op: 0.55, grow: size * 5 });
}
function flashAt(at, size = 0.5, color = 0xffe08a) { // muzzle flash star seen by everyone
  const m = new THREE.Mesh(puffGeo, glow(color, 0.9));
  m.position.set(...at); m.scale.setScalar(size * 0.35);
  scene.add(m);
  tracers.push({ obj: m, life: 0.06, max: 0.06, op: 0.9 });
}
function eliminationBurst(at, color) { // you eliminated someone: a ring of glowing shards
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(sparkGeo, glow(i % 3 ? color : 0xffffff));
    m.position.set(at[0], at[1] + 1, at[2]); m.scale.setScalar(1.6);
    scene.add(m);
    const a = (i / 24) * Math.PI * 2;
    tracers.push({ obj: m, life: 0.7, max: 0.7, op: 1, vel: [Math.cos(a) * 6, 3 + Math.random() * 4, Math.sin(a) * 6] });
  }
}
function updateEffects(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const e = tracers[i];
    e.life -= dt;
    const k = Math.max(0, e.life / e.max);
    if (e.vel) { e.vel[1] -= 15 * dt; e.obj.position.x += e.vel[0] * dt; e.obj.position.y += e.vel[1] * dt; e.obj.position.z += e.vel[2] * dt; }
    if (e.grow) e.obj.scale.setScalar(e.obj.scale.x + e.grow * dt);
    if (e.shrink) { e.obj.scale.x *= 0.85; e.obj.scale.z *= 0.85; }
    e.obj.material.opacity = e.op * k;
    if (e.life <= 0) { scene.remove(e.obj); e.obj.material.dispose(); tracers.splice(i, 1); }
  }
}

const dmgNums = [];
function damageNumber(at, text, cls) {
  const el = document.createElement('div');
  el.className = 'dmg ' + (cls || '');
  el.textContent = text;
  $('dmg-numbers').appendChild(el);
  dmgNums.push({ el, pos: new THREE.Vector3(at[0], at[1] + 0.3, at[2]), life: 0.9, dx: (Math.random() - 0.5) * 40 });
}
function updateDamageNumbers(dt) {
  const v = new THREE.Vector3();
  for (let i = dmgNums.length - 1; i >= 0; i--) {
    const d = dmgNums[i];
    d.life -= dt;
    if (d.life <= 0) { d.el.remove(); dmgNums.splice(i, 1); continue; }
    v.copy(d.pos).project(camera);
    const behind = v.z > 1;
    const x = (v.x * 0.5 + 0.5) * innerWidth + d.dx * (0.9 - d.life);
    const y = (-v.y * 0.5 + 0.5) * innerHeight - (0.9 - d.life) * 60;
    d.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${1 + d.life * 0.3})`;
    d.el.style.left = d.el.style.top = '0';
    d.el.style.opacity = behind ? 0 : Math.min(1, d.life * 2);
  }
}

let hitTimer = 0;
function hitMarker(kind) {
  const h = $('hitmarker');
  h.className = 'on ' + kind;
  clearTimeout(hitTimer);
  hitTimer = setTimeout(() => (h.className = kind), 90);
}
function announce(text) {
  const a = $('announce');
  a.textContent = text;
  a.classList.remove('show'); void a.offsetWidth; a.classList.add('show');
}
function centerMsg(text, ms = 2000) {
  const c = $('center-msg');
  c.textContent = text;
  clearTimeout(c._t);
  c._t = setTimeout(() => (c.textContent = ''), ms);
}
function killFeed(killer, victim, w, head) {
  const el = document.createElement('div');
  el.className = 'kf' + (killer === me.id || victim === me.id ? ' me' : '');
  const k = document.createElement('b'); k.style.color = colorOf(killer); k.textContent = nameOf(killer);
  const ws_ = document.createElement('span'); ws_.className = 'w'; ws_.textContent = `[${t('weapon.' + w)}]${head ? ' 🎯' : ''}`;
  const v = document.createElement('b'); v.style.color = colorOf(victim); v.textContent = nameOf(victim);
  el.append(k, ws_, v);
  const feed = $('killfeed');
  feed.prepend(el);
  while (feed.children.length > 5) feed.lastChild.remove();
  setTimeout(() => el.remove(), 6000);
}

// ======================= HUD =======================
function updateWeaponHud() {
  const w = WEAPONS[me.weapon];
  $('weapon-name').textContent = t('weapon.' + me.weapon);
  $('mag').textContent = WEAPONS[me.weapon].melee ? '∞' : performance.now() < me.reloadUntil ? '…' : me.ammo[me.weapon];
  $('mag').classList.toggle('empty', me.ammo[me.weapon] === 0);
  $('mag-max').parentElement.style.visibility = w.melee ? 'hidden' : '';
  $('mag-max').textContent = w.mag;
  $('weapon-slots').innerHTML = '';
  for (const k of WEAPON_ORDER) {
    if (!hasWeapon(k)) continue;
    const s = document.createElement('button');
    s.type = 'button';
    s.textContent = WEAPONS[k].key + ' ' + t('weapon.' + k);
    s.className = (k === me.weapon ? 'on' : '') + (WEAPONS[k].pickupOnly ? ' special' : '');
    s.addEventListener('mousedown', (e) => { e.stopPropagation(); switchWeapon(k); });
    $('weapon-slots').appendChild(s);
  }
  $('switch-hint').textContent = isTouch ? '' : t('hud.switchHint');
}
function updateHp(hp) {
  me.hp = hp;
  $('hp-text').textContent = Math.ceil(hp);
  $('hp-fill').style.width = Math.max(0, hp / PLAYER.maxHp * 100) + '%';
  $('hp-fill').classList.toggle('low', hp < PLAYER.maxHp * 0.35);
}
function updateScoreboard() {
  const sorted = [...roster].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  const tb = $('scoreboard').querySelector('tbody');
  tb.innerHTML = '';
  for (const p of sorted) tb.appendChild(boardRow(p, [p.kills, p.deaths, p.bot ? 'BOT' : p.ping]));
  const lead = sorted[0];
  $('leader').textContent = lead ? t('hud.leader', { name: lead.name, kills: lead.kills, limit: killLimit }) : '';
}
function boardRow(p, cols, rank) {
  const tr = document.createElement('tr');
  if (p.id === me.id) tr.className = 'me';
  if (rank !== undefined) { const td = document.createElement('td'); td.textContent = rank; tr.appendChild(td); }
  const td = document.createElement('td');
  const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = '#' + p.color.toString(16).padStart(6, '0');
  td.append(dot, document.createTextNode(p.name + (muted.has(p.id) ? ' 🔇' : '')));
  tr.appendChild(td);
  for (const c of cols) { const t = document.createElement('td'); t.textContent = c; tr.appendChild(t); }
  return tr;
}

// ======================= chat =======================
// Params ending in "Key" are translated too, e.g. { mapKey: 'map.neon' } -> {map}
function tr(key, p = {}) {
  const out = {};
  for (const [k, v] of Object.entries(p)) if (k.endsWith('Key')) out[k.slice(0, -3)] = t(v); else out[k] = v;
  return t(key, out);
}
function addChat({ name, color, text, sys, quick, from, key, p, q }) {
  if (from && muted.has(from)) return;
  const el = document.createElement('div');
  if (sys) {
    el.className = 'sys';
    el._render = () => { el.textContent = key ? tr(key, p) : text; };
    el._render();
  } else {
    if (quick) el.className = 'quick';
    const b = document.createElement('b');
    b.style.color = '#' + (color ?? 0xffffff).toString(16).padStart(6, '0');
    b.textContent = name + ':';
    const body = document.createTextNode('');
    el.append(b, body);
    el._render = () => { body.textContent = ' ' + (quick ? t('quick.' + q) : text); };
    el._render();
    if (from !== me.id) sfx.chat();
  }
  const log = $('chat-log');
  log.appendChild(el);
  while (log.children.length > 40) log.firstChild.remove();
  setTimeout(() => el.classList.add('faded'), 10000);
}

function openChat() {
  if (chatOpen) return;
  chatOpen = true; quickOpen = false;
  $('quick-menu').classList.add('hidden');
  $('chat').classList.add('open');
  const inp = $('chat-input');
  inp.classList.remove('hidden');
  keys.clear(); mouseDown = false;
  if (document.pointerLockElement) document.exitPointerLock();
  setTimeout(() => inp.focus(), 0);
}
function closeChat(send) {
  const inp = $('chat-input');
  const text = inp.value.trim();
  inp.value = '';
  inp.classList.add('hidden');
  inp.blur();
  $('chat').classList.remove('open');
  chatOpen = false;
  if (send && text) handleChatText(text);
  if (!isTouch) lockPointer();
}
const ADMIN_COMMANDS = ['adminlogin', 'whoami', 'heal', 'sethealth', 'giveweapon', 'givemoney', 'kick', 'ban', 'announce', 'teleport'];
function handleChatText(text) {
  if (text.startsWith('/')) {
    const [cmd, name, ...rest] = text.slice(1).split(' ');
    const target = roster.find((p) => p.name === name);
    if (cmd === 'mute' || cmd === 'unmute') {
      if (!target) return addChat({ sys: true, key: 'sys.noSuchPlayer' });
      cmd === 'mute' ? muted.add(target.id) : muted.delete(target.id);
      voice.setMuted(target.id, cmd === 'mute');
      updateScoreboard();
      return addChat({ sys: true, key: cmd === 'mute' ? 'sys.youMuted' : 'sys.youUnmuted', p: { name: target.name } });
    }
    if (cmd === 'report') {
      if (!target) return addChat({ sys: true, key: 'sys.noSuchPlayer' });
      return net({ t: 'report', name: target.name, reason: rest.join(' ') });
    }
    if (cmd === 'invite') return net({ t: 'invite', email: name || '' });
    // Admin commands: sent as requests; the server decides whether this player may run them
    if (ADMIN_COMMANDS.includes(cmd)) return net({ t: 'admin', cmd, args: [name, ...rest].filter((a) => a !== undefined && a !== '') });
    if (cmd === 'room') return addChat({ sys: true, key: roomCode ? 'sys.roomCode' : 'sys.noRoom', p: { code: roomCode } });
    return addChat({ sys: true, key: 'sys.commands' });
  }
  net({ t: 'chat', text });
}
function toggleQuick() {
  quickOpen = !quickOpen;
  const q = $('quick-menu');
  q.classList.toggle('hidden', !quickOpen);
  if (quickOpen) {
    q.innerHTML = '';
    quickChat.forEach((text, i) => {
      const d = document.createElement('div');
      const k = document.createElement('kbd'); k.textContent = i + 1;
      d.append(k, document.createTextNode(t(text)));
      d.addEventListener('pointerdown', (e) => { e.stopPropagation(); sendQuick(i); });
      q.appendChild(d);
    });
  }
}
function sendQuick(i) { net({ t: 'quick', i }); quickOpen = false; $('quick-menu').classList.add('hidden'); }

$('chat-input').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') closeChat(true);
  if (e.key === 'Escape') closeChat(false);
});

// ======================= combat (client side) =======================
function switchWeapon(k) {
  if (!WEAPONS[k] || k === me.weapon || !hasWeapon(k)) return;
  lastWeapon = me.weapon;
  me.weapon = k;
  me.reloadUntil = 0;
  me.lastShot = performance.now() - 200; // short equip delay
  for (const g in viewGuns) viewGuns[g].visible = g === k;
  updateWeaponHud();
}
function cycleWeapon(dir) {
  const owned = WEAPON_ORDER.filter(hasWeapon);
  const i = owned.indexOf(me.weapon);
  switchWeapon(owned[(i + dir + owned.length) % owned.length]);
}
function reload() {
  const w = WEAPONS[me.weapon];
  if (w.melee || w.pickupOnly || !me.alive || performance.now() < me.reloadUntil || me.ammo[me.weapon] >= w.mag) return;
  me.reloadUntil = performance.now() + w.reload * 1000;
  const k = me.weapon;
  net({ t: 'reload', w: k });
  sfx.reload();
  setTimeout(() => { if (me.weapon === k && me.reloadUntil) { me.ammo[k] = w.mag; me.reloadUntil = 0; updateWeaponHud(); } }, w.reload * 1000);
  updateWeaponHud();
}

let semiReady = true;
let swingAt = -10;
function knifeSwing(now) {
  const w = WEAPONS.knife;
  if (now - me.lastShot < w.rate * 1000 || !semiReady) return;
  semiReady = false;
  me.lastShot = now;
  swingAt = now;
  net({ t: 'melee', yaw: me.yaw, pitch: me.pitch });
  sfx.swing();
  vibrate(15);
}
function tryFire(now) {
  const w = WEAPONS[me.weapon];
  if (!me.alive || chatOpen || matchInfo.state !== 'playing') return;
  if (w.melee) return knifeSwing(now);
  if (now < me.reloadUntil || now - me.lastShot < w.rate * 1000) return;
  if (!w.auto && !semiReady) return;
  if (me.ammo[me.weapon] <= 0) { if (semiReady) sfx.empty(); semiReady = false; reload(); return; }
  semiReady = false;
  me.lastShot = now;
  me.ammo[me.weapon]--;

  const moving = Math.hypot(me.v[0], me.v[2]) > 1;
  let spread = me.ads ? w.adsSpread : w.spread;
  if (moving) spread += w.spread * 0.4;
  if (!me.onGround) spread += w.spread;
  if (me.weapon === 'sniper' && !me.ads) spread = Math.max(spread, 0.06);
  const o = [me.p[0], me.p[1] + stanceOf(me.stance).eye, me.p[2]];
  const dirs = [];
  for (let i = 0; i < w.pellets; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
    dirs.push(dirFromAngles(me.yaw + Math.cos(a) * r, me.pitch + Math.sin(a) * r));
  }
  net({ t: 'shoot', w: me.weapon, o, dirs });

  // Local visuals only — damage is decided by the server
  const muzzle = muzzleWorld();
  for (const d of dirs) {
    let dist = rayWorld(o, d, MAP.boxes, w.range), hitPlayer = false;
    for (const r of remotes.values()) {
      if (!r.cur) continue;
      const hb = hitboxes(r.cur.p, r.char.stance || 0, r.cur.yaw);
      for (const box of [hb.head, hb.body]) {
        const t = rayBox(o, d, box[0], box[1], dist);
        if (t !== null && t < dist) { dist = t; hitPlayer = true; }
      }
    }
    const end = [o[0] + d[0] * dist, o[1] + d[1] * dist, o[2] + d[2] * dist];
    tracer(muzzle, end, w.color);
    if (dist < w.range) { sparks(end, hitPlayer ? 0xff1744 : 0xffd54f, hitPlayer ? 7 : 6); if (!hitPlayer) puff(end); }
  }
  shotSound(me.weapon, 1);
  recoil += w.recoil * 6;
  me.pitch = Math.min(1.5, me.pitch + w.recoil * (me.ads ? 0.5 : 1));
  me.yaw += (Math.random() - 0.5) * w.recoil * 0.5;
  shake = Math.min(0.6, shake + w.recoil * 3);
  flash.visible = true;
  flash.scale.setScalar(1.2 + Math.random() * 0.8); flash.rotation.z = Math.random() * Math.PI;
  camera.fov += w.recoil * 30; // a small kick of the view on every shot
  flashLight.intensity = 9;
  flashLight.position.set(...muzzle);
  setTimeout(() => { flash.visible = false; flashLight.intensity = 0; }, 45);
  vibrate(me.weapon === 'shotgun' || me.weapon === 'sniper' ? 30 : 10);
  updateWeaponHud();
  if (me.ammo[me.weapon] === 0) setTimeout(reload, 250);
}
function muzzleWorld() {
  const fwd = dirFromAngles(me.yaw, me.pitch);
  const right = [Math.cos(me.yaw), 0, -Math.sin(me.yaw)];
  return [me.p[0] + fwd[0] * 0.8 + right[0] * 0.2, me.p[1] + me.eyeH - 0.18 + fwd[1] * 0.8, me.p[2] + fwd[2] * 0.8 + right[2] * 0.2];
}

// ======================= stance: stand / crouch / prone =======================
// Lower stances are slower but smaller targets and steadier; getting up needs headroom
function setStance(st) {
  if (!me.alive || st === me.stance) return;
  if (st < me.stance && !canStance(me.p, st, MAP.boxes)) { addChat({ sys: true, key: 'hud.noRoom' }); return; }
  me.stance = st;
  updateStanceHud();
}
// Crouch while running = slide (keeps momentum, then you are crouched); otherwise toggle crouch
let wantSlide = false;
function crouchPress() {
  if (me.stance === 0 && me.onGround && Math.hypot(me.v[0], me.v[2]) > PLAYER.speed * 0.7) { wantSlide = true; setStance(1); sfx.slide(); return; }
  setStance(me.stance === 1 ? 0 : 1);
}
function updateStanceHud() {
  $('t-crouch').classList.toggle('on', me.stance === 1);
  $('t-prone').classList.toggle('on', me.stance === 2);
}

// ======================= pickups, armor and boosts =======================
// The game owns the items (server or practice host); this draws them, plays effects and shows your boosts.
const itemMeshes = new Map(); // id -> { g, type, ready }
const ITEM_LOOK = { heart: 0xff2d55, armor: 0x2f80ff, speed: 0xffd400, power: 0xb04cff, ammo: 0x2ee59d, rpg: 0xff6d00 };
function itemShape(type) {
  const c = ITEM_LOOK[type], mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.2 });
  const g = new THREE.Group();
  if (type === 'heart') {
    const sh = new THREE.Shape(); sh.moveTo(0, -0.28); sh.bezierCurveTo(-0.5, 0.05, -0.28, 0.42, 0, 0.18); sh.bezierCurveTo(0.28, 0.42, 0.5, 0.05, 0, -0.28);
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03 }), mat); m.position.z = -0.07; g.add(m);
  } else if (type === 'armor') {
    const sh = new THREE.Shape(); sh.moveTo(0, 0.32); sh.lineTo(0.28, 0.22); sh.lineTo(0.24, -0.08); sh.quadraticCurveTo(0.14, -0.26, 0, -0.34); sh.quadraticCurveTo(-0.14, -0.26, -0.24, -0.08); sh.lineTo(-0.28, 0.22); sh.lineTo(0, 0.32);
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02 }), mat); m.position.z = -0.05; g.add(m);
  } else if (type === 'speed') {
    const sh = new THREE.Shape(); sh.moveTo(0.06, 0.34); sh.lineTo(-0.16, 0); sh.lineTo(0.0, 0); sh.lineTo(-0.08, -0.34); sh.lineTo(0.18, 0.06); sh.lineTo(0.02, 0.06); sh.lineTo(0.06, 0.34);
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: false }), mat); m.position.z = -0.04; g.add(m);
  } else if (type === 'power') {
    g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.26), mat));
  } else if (type === 'ammo') {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.28, 0.3), new THREE.MeshStandardMaterial({ color: 0x3d5a3a, roughness: 0.7 })));
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.06, 0.32), mat); g.add(band);
  } else if (type === 'rpg') {
    const gun = gunModel('rpg'); gun.rotation.y = Math.PI / 2; gun.scale.setScalar(1.1); g.add(gun);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 8, 32), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = -0.62;
  const root = new THREE.Group(); root.add(g, ring);
  return { root, spin: g, ring };
}
function setItems(list) {
  for (const [id, type, p, ready] of list) {
    let it = itemMeshes.get(id);
    if (!it) { it = { ...itemShape(type), type }; it.root.position.set(p[0], p[1] + 0.8, p[2]); scene.add(it.root); itemMeshes.set(id, it); }
    it.ready = !!ready;
    it.spin.visible = it.ready;
    it.ring.material.opacity = it.ready ? 0.8 : 0.18; // a faint ring shows where it will come back
  }
}
function animateItems(t) {
  for (const it of itemMeshes.values()) {
    it.spin.rotation.y = t * 1.8;
    it.spin.position.y = Math.sin(t * 2.2 + it.root.position.x) * 0.1;
  }
}
function itemTakenFx(id) { const it = itemMeshes.get(id); if (it) sparks(it.root.position.toArray(), ITEM_LOOK[it.type], 10); }
function onBuffs(m) {
  const now = performance.now(), had = { ...buffs, special: buffs.special && { ...buffs.special } };
  buffs.armor = m.armor;
  buffs.speedUntil = m.speed ? now + m.speed : 0;
  buffs.powerUntil = m.power ? now + m.power : 0;
  buffs.special = m.special ? { w: m.special.w, until: now + m.special.ms } : null;
  if (m.special) me.ammo[m.special.w] = m.special.ammo;
  updateArmor();
  // Toasts for what was just picked up
  if (m.armor > had.armor) { toast(t('hud.gotArmor'), '#4d9dff'); sfx.pickup(); }
  if (m.speed && !(had.speedUntil > now)) { toast(t('hud.gotSpeed'), '#ffd400'); sfx.pickup(); }
  if (m.power && !(had.powerUntil > now)) { toast(t('hud.gotPower'), '#c36bff'); sfx.pickup(); }
  if (m.special && !had.special) { toast(t('hud.gotRpg'), '#ff8a3d'); sfx.pickup(); switchWeapon(m.special.w); }
  if (!m.special && had.special && me.weapon === had.special.w) { me.weapon = ''; switchWeapon(lastWeapon !== had.special.w ? lastWeapon : 'rifle'); }
  updateWeaponHud();
}
function updateArmor() {
  $('armor-fill').style.width = Math.max(0, buffs.armor) + '%';
  $('armor').classList.toggle('hidden', !(buffs.armor > 0));
}
let buffHudAt = 0;
function updateBuffHud(now) {
  if (now - buffHudAt < 200) return;
  buffHudAt = now;
  const chips = [];
  if (buffs.speedUntil > now) chips.push(['speed', '⚡', Math.ceil((buffs.speedUntil - now) / 1000)]);
  if (buffs.powerUntil > now) chips.push(['power', '💥', Math.ceil((buffs.powerUntil - now) / 1000)]);
  if (buffs.special && buffs.special.until > now) chips.push(['rpg', 'RPG', Math.ceil((buffs.special.until - now) / 1000)]);
  $('buffs').innerHTML = chips.map(([k, icon, sec]) => `<span class="buff ${k}">${icon} ${sec}s</span>`).join('');
  if (buffs.special && buffs.special.until <= now && hasWeapon(buffs.special.w) === false && me.weapon === buffs.special.w) switchWeapon('rifle');
}
let toastTimer = 0;
function toast(text, color) {
  const el = $('pickup-toast');
  el.textContent = text; el.style.color = color; el.classList.remove('hidden');
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), 1600);
}
// Rocket explosion: flash, fireball, sparks, shake when close
function explosion(at) {
  flashAt(at, 4, 0xffb347);
  for (let i = 0; i < 3; i++) setTimeout(() => puff(at, i ? 0x555555 : 0xff7a1a, 0.5 + i * 0.3), i * 60);
  sparks(at, 0xffa000, 18);
  const d = Math.hypot(at[0] - me.p[0], at[1] - me.p[1], at[2] - me.p[2]);
  shake = Math.min(1.2, shake + Math.max(0, 1 - d / 15));
  sfx.boom(Math.max(0.15, 1 - d / 40));
}

// ======================= voice chat =======================
const voice = createVoice((to, data) => net({ t: 'rtc', to, data }));
let voiceOn = store.get('voice', true), talking = false;
$('voice-on').checked = voiceOn;
$('voice-on').addEventListener('change', (e) => { voiceOn = e.target.checked; store.set('voice', voiceOn); voice.setEnabled(voiceOn); syncVoice(); });
voice.setEnabled(voiceOn);
// Voice needs another human in the room; offline practice has only bots
function syncVoice() {
  const humans = voiceOn && !lobby?.offline ? roster.filter((p) => !p.bot && !muted.has(p.id)).map((p) => p.id) : [];
  voice.sync(me.id, humans);
  updateVoiceHud();
}
function updateVoiceHud() {
  const others = roster.filter((p) => !p.bot && p.id !== me.id).length;
  const show = voiceOn && !lobby?.offline && others > 0;
  $('voice-hud').classList.toggle('hidden', !show);
  $('voice-hud').classList.toggle('talking', talking);
  $('voice-text').textContent = (talking ? t('voice.talking') : t(isTouch ? 'voice.holdTouch' : 'voice.holdKey')) + ' · 🔊 ' + voice.connected() + '/' + others;
}
setInterval(() => { if (me.id) updateVoiceHud(); }, 1000);
if (new URLSearchParams(location.search).has('debug')) window.arenaDebug = { voice, me, remotes, items: itemMeshes, buffs };
async function setTalking(on) {
  if (on === talking || !me.id || lobby?.offline || !voiceOn) return;
  talking = on;
  $('t-voice').classList.toggle('on', on);
  updateVoiceHud();
  if (!(await voice.talk(on)) && on) { talking = false; $('t-voice').classList.remove('on'); updateVoiceHud(); addChat({ sys: true, key: 'voice.noMic' }); }
}
// Friend rooms: the code (tap to copy an invite link) stays on screen
function showRoomCode(code) {
  roomCode = code;
  const el = $('room-code');
  el.textContent = t('p2p.codeHud', { code });
  el.classList.remove('hidden');
  el.onclick = () => {
    const link = location.href.split('?')[0].split('#')[0] + '?join=' + code;
    const text = t('p2p.shareText', { code }) + (location.protocol.startsWith('http') ? ' ' + link : '');
    if (navigator.share && isTouch) navigator.share({ text }).catch(() => {});
    else navigator.clipboard?.writeText(text).then(() => addChat({ sys: true, key: 'p2p.copied' })).catch(() => {});
  };
  addChat({ sys: true, key: 'p2p.codeChat', p: { code } });
}

// ======================= networking =======================
function net(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
let rtt = 80;

// Offline practice: runs the match simulation in this tab instead of on a server.
class LocalSocket {
  constructor() {
    this.readyState = 0;
    import('./shared/game.js').then((game) => {
      const toClient = { readyState: 1, send: (s) => setTimeout(() => this.onmessage?.({ data: s }), 0), close() {} };
      const match = game.createGame({ difficulty: store.get('difficulty', 'normal') });
      match.start();
      this.conn = match.connect(toClient);
      this.readyState = 1;
      this.onopen?.();
    });
  }
  send(s) { this.conn?.message(s); }
  close() {}
}

let pinger = null, reconnectTries = 0;
function tryReconnect() {
  if (reconnectTries >= 5) { addChat({ sys: true, key: 'sys.disconnected' }); setTimeout(() => location.reload(), 2000); return; }
  reconnectTries++;
  addChat({ sys: true, key: 'sys.reconnecting', p: { n: reconnectTries } });
  setTimeout(() => connect(lobby.name, { t: 'rejoin', code: roomCode }), 1500);
}
let roomCode = null;
let myRole = 'Player', kickedNotice = null;
const ROLE_RANK = { Player: 0, Moderator: 1, Admin: 2, Owner: 3 };
// action: { t: 'quickMatch' } | { t: 'create' } | { t: 'joinCode', code }
// action: { t: 'p2pHost', mode } | { t: 'p2pJoin', code } play with friends device to device (see p2p.js)
function connect(name, action = { t: 'quickMatch' }, offline = !!selectedServer()?.offline) {
  let opened = false;
  const p2p = action.t === 'p2pHost' || action.t === 'p2pJoin';
  if (p2p) offline = false;
  lobby = { name, action, offline, p2p };
  ws = p2p ? (action.t === 'p2pHost' ? new P2PHostSocket({ mode: action.mode }) : new P2PGuestSocket(action.code))
    : offline ? new LocalSocket() : new WebSocket(wsUrl(selectedServer()));
  $('menu-status').textContent = t(p2p ? (action.t === 'p2pHost' ? 'p2p.opening' : 'p2p.joining') : offline ? 'menu.preparing' : 'menu.connecting');
  ws.onopen = () => {
    opened = true;
    // Online: sign in (or as a guest), pick a room, then join it. Offline and P2P: join the match directly.
    if (offline || p2p) net({ t: 'join', name, character: selectedChar });
    else net({ t: 'auth', credential: googleCredential, guestToken: guestToken() });
    if (action.t === 'p2pHost') showRoomCode(ws.code);
    if (action.t === 'p2pJoin') showRoomCode(action.code);
  };
  ws.onerror = (e) => {
    if (p2p) {
      if (!opened) { $('menu-status').textContent = t(p2pErrorKey(e)); enableMenuButtons(); }
      return;
    }
    // No server reachable: fall back to practice against bots in the browser
    if (!opened && action.t === 'rejoin') return; // onclose retries
    if (!opened) { $('menu-status').textContent = t('menu.noServer'); connect(name, action, true); }
  };
  ws.onclose = () => {
    if (p2p) {
      if (me.id) { addChat({ sys: true, key: 'p2p.hostLeft' }); setTimeout(() => location.reload(), 3000); }
      else if (!opened) enableMenuButtons();
      return;
    }
    if (kickedNotice) { setTimeout(() => { try { sessionStorage.setItem('arena.notice', kickedNotice); } catch { /* ignore */ } location.reload(); }, 2500); return; }
    // Unexpected drop mid-game: try to get back into the same room with the same score
    if (me.id && !offline && roomCode) { tryReconnect(); return; }
    if (!opened && action.t === 'rejoin') { tryReconnect(); return; }
    if (me.id && !offline) { addChat({ sys: true, key: 'sys.disconnected' }); setTimeout(() => location.reload(), 2500); }
  };
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  clearInterval(pinger);
  pinger = setInterval(() => net({ t: 'ping', c: performance.now() }), 2000);
}

function onMessage(m) {
  const now = performance.now();
  switch (m.t) {
    case 'authed':
      if (m.user) { googleUser = m.user; showAccount(); }
      net(lobby.action);
      break;
    case 'room':
      roomCode = m.code;
      $('scoreboard').querySelector('h2').textContent = t('hud.scoreboardRoom', { code: m.code });
      net({ t: 'join', name: lobby.name, character: selectedChar });
      break;
    case 'lobbyError':
      if (m.key === 'sys.rejoinFailed') { try { sessionStorage.setItem('arena.notice', t(m.key)); } catch { /* ignore */ } location.reload(); return; }
      $('menu-status').textContent = t(m.key);
      $('play').disabled = false;
      ws.close();
      break;
    case 'invited': showInvite(m.from, m.code); break;
    case 'rtc': if (m.from && m.data && !muted.has(m.from)) voice.onSignal(m.from, m.data); break;
    case 'swing': sfx.swing(); break;
    case 'profile': myProfile = m.profile; showProfile(); renderShop(); break;
    case 'shopError': $('shop-status').textContent = t(m.key); break;
    case 'reward':
      myProfile = m.profile;
      $('xp-line').textContent = t('end.reward', { credits: m.reward.credits, xp: m.reward.xp, level: m.reward.level }) + (m.reward.levelUp ? t('end.levelUp') : '');
      $('xp-fill').style.width = Math.round((m.profile.xp / m.profile.need) * 100) + '%';
      $('next-goal').textContent = t('end.goal', { n: Math.ceil((m.profile.need - m.profile.xp) / 100), level: m.profile.level + 1 });
      if (m.reward.levelUp) { sfx.kill(); announce('LEVEL UP'); }
      showProfile();
      break;
    case 'lobby': onLobby(m); break;
    case 'role':
      myRole = m.role;
      $('admin-btn').classList.toggle('hidden', ROLE_RANK[myRole] < 1);
      break;
    case 'kicked':
      kickedNotice = t(m.key, m.p);
      $('menu-status').textContent = kickedNotice;
      addChat({ sys: true, key: m.key, p: m.p });
      break;
    case 'welcome':
      reconnectTries = 0;
      me.id = m.id; me.color = m.color;
      matchInfo = m.match; killLimit = m.killLimit; quickChat = m.quick; gameMode = m.mode || 'ffa';
      if (m.items) setItems(m.items);
      $('menu').classList.add('hidden');
      $('hud').classList.remove('hidden');
      if (matchInfo.state === 'lobby') $('lobby').classList.remove('hidden');
      else if (isTouch) $('touch').classList.remove('hidden'); else lockPointer();
      addChat({ sys: true, key: 'sys.welcome', p: { mapKey: 'map.' + MAP.id } });
      break;
    case 'full':
      $('menu-status').textContent = t('menu.full');
      $('play').disabled = false;
      break;
    case 'roster':
      syncRoster(m.players);
      syncVoice();
      teamScore = m.teamScore;
      $('team-score').classList.toggle('hidden', !teamScore);
      if (teamScore) { $('ts-a').textContent = teamScore.A; $('ts-b').textContent = teamScore.B; }
      break;
    case 'snap':
      for (const s of m.players) {
        if (s.id === me.id) { updateHp(s.hp); continue; }
        const r = remotes.get(s.id);
        if (!r) continue;
        r.buf.push({ t: now, p: s.p, yaw: s.yaw, pitch: s.pitch, w: s.w, sp: s.sp, st: s.st | 0 });
        r.lastSeen = now;
      }
      break;
    case 'spawn':
      me.p = m.p.slice(); me.v = [0, 0, 0]; me.yaw = m.yaw; me.pitch = 0;
      me.alive = true; me.streak = 0; me.reloadUntil = 0; me.stance = 0; me.eyeH = PLAYER.eye; updateStanceHud();
      buffs.armor = 0; buffs.speedUntil = 0; buffs.powerUntil = 0; buffs.special = null; updateArmor(); if (WEAPONS[me.weapon].pickupOnly) { me.weapon = ''; switchWeapon('rifle'); }
      Object.assign(me.ammo, m.ammo);
      updateHp(PLAYER.maxHp);
      $('death').classList.add('hidden');
      $('streak').textContent = '';
      switchWeapon(me.weapon); for (const g in viewGuns) viewGuns[g].visible = g === me.weapon;
      updateWeaponHud();
      break;
    case 'correct': me.p = m.p.slice(); me.v = [0, 0, 0]; break;
    case 'ammo': me.ammo[m.w] = m.n; updateWeaponHud(); break;
    case 'pong': rtt = rtt * 0.7 + (now - m.c) * 0.3; net({ t: 'rtt', v: rtt }); break;
    case 'shot': {
      const r = remotes.get(m.id);
      const from = r?.cur ? [r.cur.p[0], r.cur.p[1] + 1.3, r.cur.p[2]] : m.o;
      flashAt(from, 0.6);
      for (const e of m.ends) { tracer(from, e, WEAPONS[m.w]?.color); if (!e[3]) { sparks(e, 0xffd54f, 4); puff(e); } else sparks(e, 0xff1744, 5); }
      const dist = Math.hypot(m.o[0] - me.p[0], m.o[1] - me.p[1], m.o[2] - me.p[2]);
      shotSound(m.w, Math.min(0.8, 6 / (dist + 3)));
      break;
    }
    case 'hit': {
      hitMarker(m.kill ? 'kill' : m.head ? 'head' : '');
      if (m.at) damageNumber(m.at, m.dmg, m.kill ? 'kill' : m.head ? 'head' : '');
      m.kill ? null : m.head ? sfx.head() : sfx.hit();
      break;
    }
    case 'hurt': {
      updateHp(m.hp);
      if (Number.isFinite(m.armor)) { buffs.armor = m.armor; updateArmor(); }
      lastHurtFrom = m.from;
      sfx.hurt();
      vibrate(40);
      shake = Math.min(0.8, shake + 0.3);
      const v = $('vignette'); v.style.transition = 'none'; v.style.opacity = 1; void v.offsetWidth; v.style.transition = ''; v.style.opacity = me.hp < PLAYER.maxHp * 0.35 ? 0.5 : 0;
      showDamageDir(m.from);
      break;
    }
    case 'kill': onKillMsg(m); break;
    case 'heal': updateHp(m.hp); toast(t('hud.gotHeart'), '#ff4d6d'); sfx.pickup(); break;
    case 'refill': Object.assign(me.ammo, m.ammo); updateWeaponHud(); toast(t('hud.gotAmmo'), '#69f0ae'); sfx.pickup(); break;
    case 'buffs': onBuffs(m); break;
    case 'items': setItems(m.items); if (m.took && m.took.by !== me.id) itemTakenFx(m.took.id); break;
    case 'boom': explosion(m.at); break;
    case 'leave': { const r = remotes.get(m.id); if (r) { scene.remove(r.group); remotes.delete(m.id); } break; }
    case 'chat': addChat(m); break;
    case 'match': onMatch(m); break;
  }
}

function showDamageDir(from) {
  if (!from) return;
  const dx = from[0] - me.p[0], dz = from[2] - me.p[2];
  const ang = Math.atan2(-dx, -dz) - me.yaw;
  const el = $('damage-dir');
  el.style.transform = `rotate(${-ang}rad)`;
  el.style.transition = 'none'; el.style.opacity = 1; void el.offsetWidth; el.style.transition = ''; el.style.opacity = 0;
}

function onKillMsg(m) {
  killFeed(m.killer, m.victim, m.w, m.head);
  const victim = remotes.get(m.victim);
  if (victim?.cur) eliminationBurst(victim.cur.p, victim.color ?? 0xff2e88);
  if (m.killer === me.id) {
    me.streak = m.streak;
    if (m.head) me.heads++;
    sfx.kill();
    vibrate([30, 40, 60]);
    centerMsg(t('hud.youKilled', { name: nameOf(m.victim) }) + (m.backstab ? t('hud.backstab') : m.head ? t('hud.headshot') : ''), 1800);
    $('streak').textContent = me.streak >= 2 ? t('hud.streak', { n: me.streak }) : '';
    if (m.streakName) { announce(m.streakName); say(m.streakName.toLowerCase()); }
  }
  if (m.victim === me.id) {
    me.alive = false;
    me.ads = false;
    deathUntil = performance.now() + 3000;
    $('death').classList.remove('hidden');
    $('death-by').textContent = t('hud.killedBy', { name: nameOf(m.killer) }) + (m.head ? t('hud.headshotTag') : '');
    lastHurtFrom = m.killer;
    $('streak').textContent = '';
  }
}

function onMatch(m) {
  matchInfo = m;
  if (m.state === 'lobby') {
    // Team modes: back to the lobby after the results screen
    $('end').classList.add('hidden');
    $('touch').classList.add('hidden');
    $('lobby').classList.remove('hidden');
    me.alive = false;
    if (document.pointerLockElement) document.exitPointerLock();
    return;
  }
  $('lobby').classList.add('hidden');
  if (m.state === 'ended') {
    keys.clear(); mouseDown = false;
    if (document.pointerLockElement) document.exitPointerLock();
    const myTeam = roster.find((p) => p.id === me.id)?.team;
    const won = m.winTeam ? m.winTeam === myTeam : m.winner === me.id;
    $('end-title').textContent = m.mode && m.mode !== 'ffa'
      ? (m.winTeam ? t('end.teamWon', { team: t('team.' + m.winTeam) }) : t('end.draw'))
      : won ? t('end.youWon') : t('end.winner', { name: m.winnerName || '' });
    const tb = $('end-board').querySelector('tbody');
    tb.innerHTML = '';
    m.board.forEach((p, i) => tb.appendChild(boardRow(p, [p.kills, p.deaths], i + 1)));
    if (lobby?.offline || lobby?.p2p) awardXp(won); else { $('xp-line').textContent = ''; $('next-goal').textContent = ''; }
    $('end').classList.remove('hidden');
    const tick = () => {
      const s = Math.max(0, Math.ceil((m.next - Date.now()) / 1000));
      $('end-next').textContent = t(m.mode && m.mode !== 'ffa' ? 'end.toLobby' : 'end.next', { s });
      if (matchInfo.state === 'ended') setTimeout(tick, 500);
    };
    tick();
  } else {
    $('end').classList.add('hidden');
    me.heads = 0;
    if (isTouch) $('touch').classList.remove('hidden'); else lockPointer();
  }
}

// ======================= team lobby =======================
let gameMode = 'ffa', lobbyInfo = null, teamScore = null;
function onLobby(m) {
  lobbyInfo = m;
  gameMode = m.mode;
  if (m.state !== 'lobby') return;
  $('lobby').classList.remove('hidden');
  renderLobby();
  renderShop();
}
function renderLobby() {
  const m = lobbyInfo;
  if (!m) return;
  $('lobby-title').textContent = t('lobby.title', { mode: t('mode.' + m.mode), code: roomCode || '' });
  const mine = m.players.find((p) => p.id === me.id);
  for (const team of ['A', 'B']) {
    const col = $('lobby-' + team);
    col.querySelector('h3').textContent = t('team.' + team);
    const list = col.querySelector('ul');
    list.replaceChildren();
    const members = m.players.filter((p) => p.team === team);
    for (let i = 0; i < m.perTeam; i++) {
      const li = document.createElement('li');
      const p = members[i];
      if (p) {
        li.textContent = p.name;
        if (p.id === me.id) li.classList.add('me');
        const st = document.createElement('span');
        st.className = p.ready ? 'ok' : 'wait';
        st.textContent = p.ready ? '✔' : '…';
        li.prepend(st);
      } else {
        li.className = 'open';
        li.textContent = t('lobby.empty');
      }
      list.appendChild(li);
    }
  }
  $('lobby-ready').textContent = t(mine?.ready ? 'lobby.notReady' : 'lobby.ready');
  $('lobby-ready').classList.toggle('on', !!mine?.ready);
  $('lobby-invite').textContent = roomCode ? t('lobby.invite', { code: roomCode }) : '';
  updateLobbyStatus();
}
function updateLobbyStatus() {
  if (!lobbyInfo || $('lobby').classList.contains('hidden')) return;
  const left = lobbyInfo.countdownAt ? Math.max(0, Math.ceil((lobbyInfo.countdownAt - Date.now()) / 1000)) : 0;
  $('lobby-status').textContent = lobbyInfo.countdownAt ? t('lobby.starting', { s: left }) : t('lobby.waiting');
}
setInterval(updateLobbyStatus, 250);
$('lobby-ready').addEventListener('click', () => {
  const mine = lobbyInfo?.players.find((p) => p.id === me.id);
  initAudio();
  net({ t: 'ready', v: !mine?.ready });
});
$('lobby-switch').addEventListener('click', () => {
  const mine = lobbyInfo?.players.find((p) => p.id === me.id);
  net({ t: 'team', team: mine?.team === 'A' ? 'B' : 'A' });
});
$('lobby-leave').addEventListener('click', () => location.reload());

// Local progression (GDD §9–10): XP bar and "one more game" goal
function awardXp(won) {
  const prof = store.get('profile', { xp: 0, level: 1 });
  const gained = me.kills * 100 + me.heads * 50 + (won ? 500 : 100);
  prof.xp += gained;
  const need = (lvl) => 1000 + (lvl - 1) * 250;
  let leveled = false;
  while (prof.xp >= need(prof.level)) { prof.xp -= need(prof.level); prof.level++; leveled = true; }
  store.set('profile', prof);
  $('xp-line').textContent = t('end.xp', { xp: gained, level: prof.level }) + (leveled ? t('end.levelUp') : '');
  $('xp-fill').style.width = '0';
  setTimeout(() => ($('xp-fill').style.width = Math.round((prof.xp / need(prof.level)) * 100) + '%'), 50);
  const left = need(prof.level) - prof.xp;
  $('next-goal').textContent = t('end.goal', { n: Math.ceil(left / 100), level: prof.level + 1 });
  if (leveled) { sfx.kill(); announce('LEVEL UP'); }
  showProfile();
}
function showProfile() {
  if (myProfile) { $('profile').textContent = t('menu.levelCredits', myProfile); return; }
  const prof = store.get('profile', { xp: 0, level: 1 });
  $('profile').textContent = t('menu.level', { level: prof.level, xp: prof.xp });
}

// ======================= input =======================
// Some hosts (embedded frames such as the claude.ai preview, some desktop apps) refuse pointer lock.
// Then the game switches to free-mouse aiming: the visible cursor's movement turns the view, holding it
// near the left/right edge keeps turning, and clicks fire. J/L and I/K also turn and look in any mode.
let freeMouse = false, cursorX = 0.5;
function enterFreeMouse() {
  if (freeMouse || isTouch) return;
  freeMouse = true;
  document.body.classList.add('free-mouse');
  $('pause').classList.add('hidden');
  if (me.id) addChat({ sys: true, key: 'hud.freeMouse' });
}
document.addEventListener('pointerlockerror', enterFreeMouse);
function lockPointer() {
  if (isTouch || freeMouse || !me.id || chatOpen || matchInfo.state !== 'playing') return;
  try {
    const r = canvas.requestPointerLock?.();
    if (r && r.catch) r.catch(enterFreeMouse);
  } catch { enterFreeMouse(); }
  if (!canvas.requestPointerLock) enterFreeMouse();
  // No lock and no error after a moment (silently ignored): fall back too
  setTimeout(() => { if (document.pointerLockElement !== canvas && me.id && !chatOpen && matchInfo.state === 'playing' && document.hasFocus()) enterFreeMouse(); }, 700);
}
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  $('pause').classList.toggle('hidden', locked || freeMouse || chatOpen || !me.id || matchInfo.state !== 'playing' || isTouch || !$('admin-panel').classList.contains('hidden'));
  if (!locked) { mouseDown = false; me.ads = false; }
});
$('pause').addEventListener('click', () => { initAudio(); lockPointer(); });
canvas.addEventListener('click', () => { if (!isTouch) lockPointer(); });

document.addEventListener('mousemove', (e) => {
  cursorX = e.clientX / innerWidth;
  const aiming = document.pointerLockElement === canvas || (freeMouse && me.id && !chatOpen && e.target === canvas);
  if (!aiming) return;
  const k = 0.0022 * sens * (me.ads ? camera.fov / 78 : 1);
  me.yaw -= e.movementX * k;
  me.pitch = Math.max(-1.5, Math.min(1.5, me.pitch - e.movementY * k));
});
document.addEventListener('mousedown', (e) => {
  if (document.pointerLockElement !== canvas && !(freeMouse && e.target === canvas)) return;
  if (e.button === 0) mouseDown = true;
  if (e.button === 2) me.ads = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) { mouseDown = false; semiReady = true; }
  if (e.button === 2) me.ads = false;
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('wheel', (e) => { if (document.pointerLockElement === canvas || (freeMouse && e.target === canvas)) cycleWeapon(e.deltaY > 0 ? 1 : -1); });

document.addEventListener('keydown', (e) => {
  if (!me.id || chatOpen) return;
  if (e.code === 'Tab') { e.preventDefault(); $('scoreboard').classList.remove('hidden'); return; }
  if (e.code === 'Enter' || e.code === 'KeyT') { e.preventDefault(); openChat(); return; }
  if (e.code === 'F2') { e.preventDefault(); toggleAdminPanel(); return; }
  if (e.code === 'KeyB') { toggleQuick(); return; }
  if (e.code === 'KeyV') { if (!e.repeat) setTalking(true); return; }
  if (e.code === 'KeyC' || e.code === 'ControlLeft') { if (!e.repeat) crouchPress(); return; }
  if (e.code === 'KeyZ') { if (!e.repeat) setStance(me.stance === 2 ? 0 : 2); return; }
  if (quickOpen && /^Digit[1-6]$/.test(e.code)) { sendQuick(Number(e.code.slice(5)) - 1); return; }
  if (e.code === 'Escape' && quickOpen) { toggleQuick(); return; }
  const slot = WEAPON_ORDER.find((k) => 'Digit' + WEAPONS[k].key === e.code);
  if (slot) { switchWeapon(slot); return; }
  if (e.code === 'KeyR') reload();
  if (e.code === 'KeyQ') cycleWeapon(1);
  if (e.code === 'KeyX') switchWeapon(lastWeapon); // quick swap to the previous weapon
  keys.add(e.code);
});
document.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Tab') $('scoreboard').classList.add('hidden');
  if (e.code === 'KeyV') setTalking(false);
});
addEventListener('blur', () => { keys.clear(); mouseDown = false; setTalking(false); });

// ---- gyro aiming (phones) ----
// Turning the phone turns the view: the gyroscope's rotation rate is added to yaw / pitch, mapped to
// how the screen is held (portrait or either landscape side). Toggle and sensitivity in Settings.
const gyro = {
  on: store.get('gyro', true), sens: store.get('gyroSens', 1), asked: false,
  ask() { // iOS needs a permission prompt from a user gesture; Android just sends events
    if (this.asked || !isTouch) return;
    this.asked = true;
    const req = window.DeviceMotionEvent?.requestPermission;
    if (typeof req === 'function') req.call(DeviceMotionEvent).catch(() => {});
  },
};
addEventListener('devicemotion', (e) => {
  const r = e.rotationRate;
  if (!gyro.on || !r || !me.alive || chatOpen || !me.id || matchInfo.state !== 'playing') return;
  const dt = Math.min(0.05, (e.interval > 1 ? e.interval / 1000 : e.interval) || 0.016);
  const ang = (screen.orientation?.angle ?? window.orientation ?? 0) % 360;
  const a = r.alpha || 0, b = r.beta || 0, g = r.gamma || 0; // deg/s around the device's z, x, y axes
  let yawRate, pitchRate;
  if (ang === 90) { yawRate = b; pitchRate = -g; }        // landscape, top of the phone to the left
  else if (ang === 270 || ang === -90) { yawRate = -b; pitchRate = g; }
  else { yawRate = g; pitchRate = b; }                    // portrait
  void a;
  const k = (Math.PI / 180) * dt * gyro.sens * (me.ads ? camera.fov / 78 : 1);
  me.yaw += yawRate * k;
  me.pitch = Math.max(-1.5, Math.min(1.5, me.pitch + pitchRate * k));
});

// ---- touch ----
function setupTouch() {
  const stick = $('stick'), knob = $('stick-knob');
  let stickId = null, lookId = null, lx = 0, ly = 0, sx = 0, sy = 0;
  // Floating joystick: wherever the left thumb lands (left 40% of the screen) becomes its centre
  const R = 62; // max knob travel in px
  const placeStick = (x, y) => {
    sx = x; sy = y;
    stick.style.left = (x - stick.offsetWidth / 2) + 'px';
    stick.style.top = (y - stick.offsetHeight / 2) + 'px';
    stick.style.bottom = 'auto';
    stick.classList.add('active');
  };
  const resetStick = () => { stick.style.left = ''; stick.style.top = ''; stick.style.bottom = ''; stick.classList.remove('active'); knob.style.transform = ''; };
  const moveStick = (x, y) => {
    let dx = x - sx, dy = y - sy;
    const l = Math.hypot(dx, dy);
    if (l > R) { dx *= R / l; dy *= R / l; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // Small dead zone, then a gentle curve: fine control near the centre, full speed at the edge
    const m = Math.min(1, l / R), k = m < 0.12 ? 0 : Math.pow((m - 0.12) / 0.88, 1.4) / Math.max(m, 1e-6);
    touchMove.s = (dx / R) * k; touchMove.f = (-dy / R) * k;
  };
  stick.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; stickId = t.identifier; placeStick(t.clientX, t.clientY); });
  addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) moveStick(t.clientX, t.clientY);
      else if (t.identifier === lookId) {
        // Finger look with a little acceleration: slow drags for precision, quick swipes turn fast
        const dx = t.clientX - lx, dy = t.clientY - ly, speed = Math.hypot(dx, dy);
        const k = 0.0045 * sens * (1 + Math.min(1.2, speed / 40)) * (me.ads ? camera.fov / 78 : 1);
        me.yaw -= dx * k;
        me.pitch = Math.max(-1.5, Math.min(1.5, me.pitch - dy * k));
        lx = t.clientX; ly = t.clientY;
      }
    }
  }, { passive: false });
  canvas.addEventListener('touchstart', (e) => {
    initAudio(); gyro.ask();
    for (const t of e.changedTouches) {
      if (stickId === null && t.clientX < innerWidth * 0.4 && t.clientY > innerHeight * 0.3) { stickId = t.identifier; placeStick(t.clientX, t.clientY); moveStick(t.clientX, t.clientY); }
      else if (lookId === null && t.clientX > innerWidth * 0.35) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
    }
  });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { stickId = null; touchMove.f = touchMove.s = 0; resetStick(); }
      if (t.identifier === lookId) lookId = null;
    }
  };
  addEventListener('touchend', end);
  addEventListener('touchcancel', end);
  const hold = (id, down, up) => {
    const b = $(id);
    b.addEventListener('touchstart', (e) => { e.preventDefault(); initAudio(); down(); });
    if (up) b.addEventListener('touchend', (e) => { e.preventDefault(); up(); });
  };
  // The fire button also steers the camera while held
  const fire = $('t-fire');
  fire.addEventListener('touchstart', (e) => { e.preventDefault(); mouseDown = true; if (lookId === null) { const t = e.changedTouches[0]; lookId = t.identifier; lx = t.clientX; ly = t.clientY; } });
  fire.addEventListener('touchend', (e) => { e.preventDefault(); mouseDown = false; semiReady = true; });
  hold('t-ads', () => (me.ads = !me.ads));
  hold('t-jump', () => (wantJump = true));
  hold('t-reload', reload);
  hold('t-swap', () => cycleWeapon(1));
  hold('t-chat', () => (chatOpen ? closeChat(true) : openChat()));
  hold('t-quick', toggleQuick);
  hold('t-score', () => $('scoreboard').classList.toggle('hidden'));
  hold('t-voice', () => setTalking(true), () => setTalking(false)); // hold to talk
  hold('t-crouch', crouchPress);
  hold('t-prone', () => setStance(me.stance === 2 ? 0 : 2));
}
if (isTouch) setupTouch();

// ======================= shop =======================
// The economy service on the server owns balances; this screen only sends requests.
let myProfile = null, shopWs = null;
function uuid() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
// A random id kept on this device, so guests keep their credits and skins
function guestToken() {
  let tok = store.get('guestToken', null);
  if (!tok) { tok = uuid(); store.set('guestToken', tok); }
  return tok;
}
function shopSend(msg) {
  const sock = ws && ws.readyState === 1 && !lobby?.offline ? ws : shopWs;
  if (sock && sock.readyState === 1) sock.send(JSON.stringify(msg));
}
function openShop() {
  $('shop').classList.remove('hidden');
  $('shop-status').textContent = '';
  if (ws && ws.readyState === 1 && !lobby?.offline) { shopSend({ t: 'profile' }); renderShop(); return; }
  const sv = selectedServer();
  if (sv.offline) { myProfile = null; renderShop(); $('shop-status').textContent = t('shop.needOnline'); return; }
  $('shop-status').textContent = t('shop.connecting');
  shopWs = new WebSocket(wsUrl(sv));
  shopWs.onopen = () => shopWs.send(JSON.stringify({ t: 'auth', credential: googleCredential, guestToken: guestToken() }));
  shopWs.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'profile') { $('shop-status').textContent = ''; myProfile = m.profile; showProfile(); renderShop(); refreshPreview(); }
    if (m.t === 'shopError') $('shop-status').textContent = t(m.key);
  };
  shopWs.onerror = () => { $('shop-status').textContent = t('shop.error'); };
}
function closeShop() {
  $('shop').classList.add('hidden');
  if (shopWs) { shopWs.close(); shopWs = null; }
  refreshPreview();
}
function renderShop() {
  if ($('shop').classList.contains('hidden')) return;
  $('shop-balance').textContent = myProfile ? t('shop.balance', { n: myProfile.credits }) : '';
  const box = $('shop-items');
  box.replaceChildren();
  for (const slot of SLOTS) {
    const h = document.createElement('h3');
    h.textContent = t('shop.slot.' + slot);
    const grid = document.createElement('div');
    grid.className = 'shop-grid';
    for (const item of SHOP.filter((i) => i.slot === slot)) {
      const owned = myProfile?.owned.includes(item.id);
      const equipped = myProfile?.equipped?.[slot] === item.id;
      const card = document.createElement('div');
      card.className = 'shop-card' + (equipped ? ' on' : '');
      const sw = document.createElement('span');
      sw.className = 'swatch' + (item.glow ? ' glow' : '');
      sw.style.background = '#' + (item.tint ?? item.color).toString(16).padStart(6, '0');
      const name = document.createElement('b');
      name.textContent = t('shop.' + item.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.disabled = !myProfile;
      if (!owned) {
        btn.textContent = t('shop.buy', { n: item.price });
        btn.disabled = !myProfile || myProfile.credits < item.price;
        btn.addEventListener('click', () => { btn.disabled = true; shopSend({ t: 'buy', item: item.id, purchaseId: uuid() }); });
      } else if (equipped) {
        btn.textContent = t('shop.unequip');
        btn.addEventListener('click', () => shopSend({ t: 'equip', slot, item: null }));
      } else {
        btn.textContent = t('shop.equip');
        btn.addEventListener('click', () => shopSend({ t: 'equip', slot, item: item.id }));
      }
      const tag = document.createElement('small');
      tag.textContent = equipped ? t('shop.equipped') : '';
      card.append(sw, name, tag, btn);
      grid.appendChild(card);
    }
    box.append(h, grid);
  }
}
$('shop-btn').addEventListener('click', openShop);
$('shop-close').addEventListener('click', closeShop);

// ======================= admin panel =======================
// Convenience UI for staff. It only sends the same requests as the chat commands;
// every permission and limit is enforced by the server.
const PANEL_ACTIONS = [
  { cmd: 'heal', min: 2 }, { cmd: 'giveweapon', min: 2, arg: 'rifle' }, { cmd: 'teleport', min: 2, arg: '1' },
  { cmd: 'kick', min: 1, confirm: true }, { cmd: 'ban', min: 2, confirm: true, needsReason: true },
];
function renderAdminPanel() {
  const list = $('admin-list');
  const q = $('admin-search').value.trim().toLowerCase();
  list.replaceChildren();
  for (const p of roster.filter((r) => r.id !== me.id && r.name.toLowerCase().includes(q))) {
    const row = document.createElement('div');
    row.className = 'admin-row';
    const name = document.createElement('b');
    name.textContent = p.name; // bot names already carry their icon
    const actions = document.createElement('div');
    for (const a of PANEL_ACTIONS.filter((x) => ROLE_RANK[myRole] >= x.min && !(p.bot && x.confirm))) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = t('admin.act.' + a.cmd);
      btn.addEventListener('click', () => (a.confirm ? askConfirm(a, p) : net({ t: 'admin', cmd: a.cmd, args: [p.name, a.arg].filter(Boolean) })));
      actions.appendChild(btn);
    }
    row.append(name, actions);
    list.appendChild(row);
  }
}
function askConfirm(a, p) {
  const box = $('admin-confirm');
  box.querySelector('p').textContent = t('admin.confirm', { action: t('admin.act.' + a.cmd), target: p.name });
  const reason = box.querySelector('input');
  reason.value = '';
  reason.classList.toggle('hidden', !a.confirm);
  box.classList.remove('hidden');
  box.querySelector('.yes').onclick = () => {
    if (a.needsReason && !reason.value.trim()) { reason.focus(); return; }
    net({ t: 'admin', cmd: a.cmd, args: [p.name, ...(a.cmd === 'ban' ? ['60'] : []), ...reason.value.trim().split(' ').filter(Boolean)] });
    box.classList.add('hidden');
  };
  box.querySelector('.no').onclick = () => box.classList.add('hidden');
}
function toggleAdminPanel(open = $('admin-panel').classList.contains('hidden')) {
  if (ROLE_RANK[myRole] < 1) return;
  $('admin-panel').classList.toggle('hidden', !open);
  $('pause').classList.add('hidden');
  if (open) { if (document.pointerLockElement) document.exitPointerLock(); renderAdminPanel(); $('admin-search').focus(); }
  else if (!isTouch) lockPointer();
}
$('admin-btn').addEventListener('click', () => toggleAdminPanel());
$('admin-close').addEventListener('click', () => toggleAdminPanel(false));
$('admin-search').addEventListener('input', renderAdminPanel);
$('admin-search').addEventListener('keydown', (e) => e.stopPropagation());
$('admin-confirm').querySelector('input').addEventListener('keydown', (e) => e.stopPropagation());

// ======================= language =======================
// Applies the chosen language to static text (data-i18n attributes), direction and dynamic UI.
// Works mid-game: nothing is sent to the server, so the connection is untouched.
function applyLang(lang) {
  document.querySelectorAll('.credit').forEach((a) => { a.href = BRAND.site; a.innerHTML = ''; const b = document.createElement('b'); b.textContent = BRAND.studio; a.append(t('menu.createdBy', { name: BRAND.creator }) + ' · ', b, ' ↗'); });
  setLang(lang);
  store.set('lang', getLang());
  document.documentElement.lang = getLang();
  document.documentElement.dir = LANGS[getLang()].dir;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.querySelectorAll('#chat-log > div').forEach((el) => el._render?.());
  for (const sel of document.querySelectorAll('.lang-select')) sel.value = getLang();
  if (typeof renderServers === 'function' && $('servers').children.length) renderServers();
  if (typeof refreshPreview === 'function' && preview?.scene) refreshPreview();
  showProfile();
  updateWeaponHud();
  updateScoreboard();
  if (roomCode) $('scoreboard').querySelector('h2').textContent = t('hud.scoreboardRoom', { code: roomCode });
  renderLobby();
  renderShop();
}
for (const sel of document.querySelectorAll('.lang-select')) {
  for (const [code, info] of Object.entries(LANGS)) sel.append(new Option(info.name, code));
  sel.addEventListener('change', (e) => applyLang(e.target.value));
}

// ======================= menu =======================
$('name').value = store.get('name', '');
$('sens').value = sens;
$('sens').addEventListener('input', (e) => { sens = Number(e.target.value); store.set('sens', sens); });
$('difficulty').value = store.get('difficulty', 'normal');
$('difficulty').addEventListener('change', (e) => store.set('difficulty', e.target.value));
$('gyro-on').checked = gyro.on;
$('gyro-on').addEventListener('change', (e) => { gyro.on = e.target.checked; store.set('gyro', gyro.on); if (gyro.on) gyro.ask(); });
$('gyro-sens').value = gyro.sens;
$('gyro-sens').addEventListener('input', (e) => { gyro.sens = Number(e.target.value); store.set('gyroSens', gyro.sens); });
$('time').value = store.get('time', 'day');
$('time').addEventListener('change', (e) => { store.set('time', e.target.value); location.reload(); });
showProfile();
const offlineOnly = !!window.ARENA_OFFLINE || location.protocol === 'file:';
let lobby = null, googleCredential = null, googleUser = null;
try { googleCredential = sessionStorage.getItem('arena.gcred'); } catch { /* storage blocked */ }
function startOnline(action) {
  initAudio();
  const name = $('name').value.trim();
  store.set('name', name);
  for (const id of ['play', 'create', 'join-code', 'p2p-host', 'p2p-join']) $(id).disabled = true;
  if (isTouch) document.documentElement.requestFullscreen?.().catch(() => {});
  connect(name, action);
}
function enableMenuButtons() { for (const id of ['play', 'create', 'join-code', 'p2p-host', 'p2p-join']) $(id).disabled = false; }
$('play').addEventListener('click', () => startOnline({ t: 'quickMatch' }));
$('p2p-host').addEventListener('click', () => startOnline({ t: 'p2pHost', mode: $('p2p-mode').value }));
$('p2p-join').addEventListener('click', () => {
  const code = $('p2p-code').value.trim().toUpperCase();
  if (!validCode(code)) { $('menu-status').textContent = t('menu.codeLength'); return; }
  startOnline({ t: 'p2pJoin', code });
});
$('p2p-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('p2p-join').click(); });
function showTab(name) {
  document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.tab-page').forEach((p) => p.classList.toggle('hidden', p.dataset.page !== name));
  store.set('tab', name);
}
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
showTab(store.get('tab', 'play'));
// Invite links for friend rooms: ?join=CODE
const p2pFromLink = (new URLSearchParams(location.search).get('join') || '').toUpperCase();
if (validCode(p2pFromLink)) { showTab('friends'); $('p2p-code').value = p2pFromLink; $('menu-status').textContent = t('p2p.invitedLink'); }
$('create').addEventListener('click', () => startOnline({ t: 'create', mode: $('mode').value }));
$('join-code').addEventListener('click', () => {
  const code = $('code').value.trim().toUpperCase();
  if (code.length !== 5) { $('menu-status').textContent = t('menu.codeLength'); return; }
  startOnline({ t: 'joinCode', code });
});

// Invitations from friends (by Gmail) and invite links (?room=CODE)
function showInvite(from, code) {
  const box = $('invite');
  box.querySelector('span').textContent = t('hud.inviteFrom', { from, code });
  box.classList.remove('hidden');
  box.querySelector('.yes').onclick = () => { location.href = location.pathname + '?room=' + code; };
  box.querySelector('.no').onclick = () => box.classList.add('hidden');
}
const roomFromLink = new URLSearchParams(location.search).get('room');
if (roomFromLink) { $('code').value = roomFromLink.toUpperCase(); $('menu-status').textContent = t('menu.invitedLink'); }

// Google sign-in (only when the server has a Google client ID configured)
function showAccount() {
  if (!googleUser) return;
  $('account').textContent = t('menu.signedIn', { name: googleUser.name, email: googleUser.email });
  $('gsi').classList.add('hidden');
  if (!$('name').value) $('name').value = googleUser.name;
}
let googleReadyFor = null;
function setupGoogle(clientId) {
  if (!clientId || googleUser || googleReadyFor === clientId) { if (!clientId) $('gsi').replaceChildren(); return; }
  googleReadyFor = clientId;
  const render = () => {
    google.accounts.id.initialize({
      client_id: clientId,
      callback: (resp) => {
        googleCredential = resp.credential;
        try { sessionStorage.setItem('arena.gcred', resp.credential); } catch { /* storage blocked */ }
        // Show the name straight away; the server verifies the token when we connect
        try { const p = JSON.parse(atob(resp.credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); googleUser = { name: p.given_name || p.name, email: p.email }; showAccount(); } catch { /* ignore */ }
      },
    });
    google.accounts.id.renderButton($('gsi'), { theme: 'filled_black', size: 'large', text: 'signin_with', locale: 'he' });
  };
  if (window.google?.accounts) return render();
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.onload = render;
  document.head.appendChild(s);
}

// ---------- server list ----------
// public/servers.json lists online servers ({ name, region, url }); url "" means the server hosting this page.
const LOCAL_SERVER = { id: 'device', nameKey: 'srv.device', regionKey: 'srv.deviceRegion', offline: true };
let servers = [LOCAL_SERVER];
const serverState = new Map(); // id -> { ping, online, rooms, googleClientId, down }
let selectedServerId = store.get('server', null);
function selectedServer() { return servers.find((sv) => sv.id === selectedServerId) || servers[servers.length - 1]; }
function httpBase(sv) { return sv.url ? sv.url.replace(/\/$/, '') : ''; }
function wsUrl(sv) {
  if (sv?.url) return sv.url.replace(/^http/, 'ws').replace(/\/$/, '');
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
}

function renderServers() {
  const list = $('servers');
  list.replaceChildren();
  const current = selectedServer();
  for (const sv of servers) {
    const st = serverState.get(sv.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'server';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(sv === current));
    const dot = document.createElement('span');
    dot.className = 'dot ' + (sv.offline ? 'ok' : !st ? '' : st.down ? 'down' : st.ping > 150 ? 'slow' : 'ok');
    const info = document.createElement('span');
    const title = document.createElement('b'); title.textContent = sv.nameKey ? t(sv.nameKey) : sv.name;
    const sub = document.createElement('small'); sub.textContent = (sv.regionKey ? t(sv.regionKey) : sv.region || '') + (sv.offline ? '' : ' · ' + t('srv.mode'));
    info.append(title, sub);
    const meta = document.createElement('span');
    meta.className = 'meta';
    if (sv.offline) meta.textContent = 'offline';
    else if (!st) meta.textContent = '…';
    else if (st.down) meta.textContent = t('srv.down');
    else {
      const ping = document.createElement('strong'); ping.textContent = st.ping + ' ms';
      meta.append(ping, document.createTextNode(`${st.online} online`));
    }
    btn.append(dot, info, meta);
    btn.addEventListener('click', () => { selectedServerId = sv.id; store.set('server', sv.id); renderServers(); });
    list.appendChild(btn);
  }
  // Online-only controls follow the selected server
  const online = !current.offline;
  document.querySelectorAll('.online-only').forEach((el) => el.classList.toggle('hidden', !online));
  document.querySelectorAll('.practice-only').forEach((el) => el.classList.toggle('hidden', online));
  $('play').textContent = t(online ? 'menu.quickPlay' : 'menu.startPractice');
  $('play-hint').textContent = t(online ? 'menu.hintOnline' : 'menu.hintPractice');
  const st = serverState.get(current.id);
  $('online-count').textContent = online && st && !st.down ? t('srv.counts', { online: st.online, rooms: st.rooms }) : '';
  if (online && st && !st.down) setupGoogle(st.googleClientId);
  else $('gsi').replaceChildren();
}

async function pingServer(sv) {
  const t0 = performance.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(httpBase(sv) + '/config', { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(timer);
    const cfg = await r.json();
    serverState.set(sv.id, { ping: Math.round(performance.now() - t0), online: cfg.online, rooms: cfg.rooms, googleClientId: cfg.googleClientId });
  } catch {
    serverState.set(sv.id, { down: true });
  }
  renderServers();
}

async function loadServers() {
  // Served by a game server: it lists itself (servers.json). Static site / APK: no server of their own.
  let list = [];
  if (!offlineOnly) {
    list = [{ nameKey: 'srv.here', regionKey: 'srv.hereRegion', url: '' }];
    try {
      const r = await fetch('servers.json', { cache: 'no-store' });
      if (r.ok) list = await r.json();
    } catch { /* keep the default */ }
  }
  for (const sv of window.ARENA_SERVERS || ONLINE_SERVERS) if (!list.some((x) => x.url === sv.url)) list.push(sv); // ARENA_SERVERS: override for self-hosting / tests
  servers = [LOCAL_SERVER, ...list.map((sv, i) => ({ id: sv.id || 'srv' + i, ...sv }))];
  if (!selectedServerId || !servers.some((sv) => sv.id === selectedServerId)) selectedServerId = offlineOnly ? LOCAL_SERVER.id : servers[1]?.id || LOCAL_SERVER.id;
  renderServers();
  servers.filter((sv) => !sv.offline).forEach(pingServer);
}
loadServers();
$('servers-refresh').addEventListener('click', () => { serverState.clear(); renderServers(); servers.filter((sv) => !sv.offline).forEach(pingServer); });

// ---------- character select with a live 3D preview ----------
let selectedChar = characterById(store.get('character', CHARACTERS[0].id)).id;
const preview = { renderer: null, scene: null, camera: null, model: null, yaw: 0.5, dragging: false, lastX: 0 };

function initPreview() {
  const c = $('char-preview');
  preview.renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true });
  preview.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  preview.renderer.outputColorSpace = THREE.SRGBColorSpace;
  preview.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  preview.scene = new THREE.Scene();
  preview.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x302040, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.5); key.position.set(2, 3, -3); preview.scene.add(key);
  const rim = new THREE.DirectionalLight(0xff2e88, 2); rim.position.set(-3, 2, 2); preview.scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48), new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.15 }));
  floor.rotation.x = -Math.PI / 2; preview.scene.add(floor);
  preview.camera = new THREE.PerspectiveCamera(32, 480 / 560, 0.1, 20);
  preview.camera.position.set(0, 1.25, -3.9);
  preview.camera.lookAt(0, 0.95, 0);
  c.addEventListener('pointerdown', (e) => { preview.dragging = true; preview.lastX = e.clientX; c.setPointerCapture(e.pointerId); });
  c.addEventListener('pointermove', (e) => { if (preview.dragging) { preview.yaw += (e.clientX - preview.lastX) * 0.01; preview.lastX = e.clientX; } });
  c.addEventListener('pointerup', () => { preview.dragging = false; });
}

function refreshPreview() {
  if (!preview.scene) return;
  if (preview.model) preview.scene.remove(preview.model.root);
  const color = 0xff2e88;
  const eq = myProfile?.equipped || {};
  const def = characterById(selectedChar);
  // Show the chosen character itself, never a stand-in: wait (with a message) until its model is in
  const ready = soldierReady() && characterLoaded(def.id);
  preview.model = null;
  if (ready) {
    const m = buildSoldier(color, 1, def.id, eq);
    m.gunMount.add(gunModel('rifle', 1, eq.camo));
    preview.model = m;
    preview.scene.add(m.root);
  }
  const failed = !ready && charFailed.has(def.id);
  if (!ready && !failed) ensureCharacter(def.id);
  $('char-loading').textContent = t(failed ? 'menu.charFailed' : 'menu.loadingChar');
  if (failed && charError) { const d = document.createElement('small'); d.className = 'err'; d.textContent = charError; $('char-loading').append(d); }
  $('char-loading').classList.toggle('hidden', ready);
  $('char-name').textContent = t('char.' + def.id);
  $('char-role').textContent = t('char.' + def.id + '.role');
  $('char-kind').textContent = t('char.kind' + (def.civ ? 'Civilian' : 'Soldier') + (def.female ? 'F' : 'M'));
  $('char-kind').className = 'kind ' + (def.civ ? 'civ' : 'mil') + (def.female ? ' f' : ' m');
  document.querySelectorAll('.char-card').forEach((el) => el.setAttribute('aria-checked', String(el.dataset.id === selectedChar)));
}

function chooseChar(id) {
  selectedChar = characterById(id).id;
  store.set('character', selectedChar);
  charFailed.delete(selectedChar); // choosing again retries a failed download
  refreshPreview();
}
function stepChar(dir) {
  const i = CHARACTERS.findIndex((c) => c.id === selectedChar);
  chooseChar(CHARACTERS[(i + dir + CHARACTERS.length) % CHARACTERS.length].id);
}

for (const def of CHARACTERS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'char-card';
  b.dataset.id = def.id;
  b.setAttribute('role', 'radio');
  b.classList.add(def.civ ? 'civ' : 'mil', def.female ? 'f' : 'm'); // circle colour: soldiers dark blue / purple, civilians blue / pink
  const av = document.createElement('i'); av.className = 'av'; av.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span'); label.dataset.i18n = 'char.' + def.id; label.textContent = t('char.' + def.id);
  av.textContent = (def.female ? '♀' : '♂');
  b.append(av, label);
  b.addEventListener('click', () => chooseChar(def.id));
  $('char-list').appendChild(b);
}
$('char-list').setAttribute('role', 'radiogroup');
$('char-prev').addEventListener('click', () => stepChar(-1));
$('char-next').addEventListener('click', () => stepChar(1));
initPreview();
refreshPreview();

let previewLast = performance.now();
function previewFrame(now) {
  if ($('menu').classList.contains('hidden')) return; // stop once the game starts
  requestAnimationFrame(previewFrame);
  const dt = Math.min(0.05, (now - previewLast) / 1000);
  previewLast = now;
  if (!preview.dragging) preview.yaw += dt * 0.4;
  if (preview.model) {
    preview.model.root.rotation.y = preview.yaw;
    animate(preview.model, 0, now / 1000, dt);
  }
  preview.renderer.render(preview.scene, preview.camera);
}
requestAnimationFrame(previewFrame);
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('play').click(); });

// ======================= main loop =======================
let lastFrame = performance.now(), lastSend = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  if (me.alive && matchInfo.state === 'playing') {
    let f = 0, s = 0;
    if (!chatOpen) {
      if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
    }
    f += touchMove.f; s += touchMove.s;
    // Keyboard look (J/L turn, I/K look up/down) and free-mouse edge turning
    const turn = 2.4 * sens * dt;
    if (!chatOpen) {
      if (keys.has('KeyJ')) me.yaw += turn;
      if (keys.has('KeyL')) me.yaw -= turn;
      if (keys.has('KeyI')) me.pitch = Math.min(1.5, me.pitch + turn * 0.7);
      if (keys.has('KeyK')) me.pitch = Math.max(-1.5, me.pitch - turn * 0.7);
    }
    if (freeMouse && !chatOpen) {
      if (cursorX < 0.08) me.yaw += turn * (1 - cursorX / 0.08) * 1.5;
      else if (cursorX > 0.92) me.yaw -= turn * ((cursorX - 0.92) / 0.08) * 1.5;
    }
    // Jump from crouch or prone stands up first (if there is room)
    if ((keys.has('Space') || wantJump) && me.stance) { setStance(0); keys.delete('Space'); wantJump = false; }
    step(me, { f, s, jump: keys.has('Space') || wantJump, yaw: me.yaw, ads: me.ads, slide: wantSlide, boost: now < buffs.speedUntil ? 1.3 : 1 }, dt, MAP.boxes);
    wantSlide = false;
    if (me.padded) { me.padded = false; sfx.pad(); vibrate(25); }
    me.eyeH += (stanceOf(me.stance).eye - me.eyeH) * Math.min(1, dt * 10);
    wantJump = false;
    if (mouseDown) tryFire(now);
    const speed = Math.hypot(me.v[0], me.v[2]);
    bob += dt * speed * 1.6 * (me.onGround ? 1 : 0);
    if (now - lastSend > 50) {
      lastSend = now;
      net({ t: 'state', p: me.p.map((n) => Math.round(n * 1000) / 1000), yaw: me.yaw, pitch: me.pitch, w: me.weapon, st: me.stance });
    }
  }

  // Camera
  recoil *= Math.pow(0.0005, dt);
  shake *= Math.pow(0.002, dt);
  const sniperScoped = me.ads && me.weapon === 'sniper' && me.alive;
  const targetFov = me.ads && me.alive ? WEAPONS[me.weapon].adsFov : 78 + (me.slideT > 0 ? 8 : 0); // wider view while sliding
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 14);
  camera.updateProjectionMatrix();
  if (me.alive) {
    camera.position.set(me.p[0], me.p[1] + me.eyeH + Math.sin(bob * 2) * 0.03, me.p[2]);
    camera.rotation.set(me.pitch + (Math.random() - 0.5) * shake * 0.02, me.yaw + (Math.random() - 0.5) * shake * 0.02, 0, 'YXZ');
  } else if (me.id) {
    // Death cam: rise up and look at the killer
    camera.position.y += (me.p[1] + 4 - camera.position.y) * Math.min(1, dt * 2);
    const killer = remotes.get(lastHurtFrom);
    if (killer?.cur) camera.lookAt(killer.cur.p[0], killer.cur.p[1] + 1, killer.cur.p[2]);
    $('death-count').textContent = t('hud.respawnIn', { s: Math.max(0, Math.ceil((deathUntil - now) / 1000)) });
  }

  // Viewmodel sway, bob, recoil, reload dip
  const reloading = now < me.reloadUntil;
  const adsK = me.ads ? 1 : 0;
  // Narrow (portrait) screens: bring the weapon toward the centre so it stays visible
  const vmX = 0.22 * Math.min(1, camera.aspect / 1.4);
  vmRoot.position.set(
    vmX * (1 - adsK) + Math.sin(bob) * 0.012 * (1 - adsK * 0.8),
    -0.2 + adsK * 0.07 + Math.abs(Math.cos(bob)) * 0.01 - (reloading ? 0.15 : 0),
    -0.45 + recoil * 0.25,
  );
  const sw = Math.max(0, 1 - (now - swingAt) / 250); // knife slash: quick arc across the screen
  vmRoot.rotation.set(recoil * 0.6 + (reloading ? -0.6 : 0) - Math.sin(sw * Math.PI) * 0.5, Math.sin(sw * Math.PI) * 0.9, -Math.sin(sw * Math.PI) * 0.4);
  vmRoot.visible = me.alive && !sniperScoped;
  refreshFirstPerson();
  if (fpBody) {
    fpBody.root.visible = vmRoot.visible;
    if (vmRoot.visible) updateFirstPerson(fpBody, vmRoot, me.weapon, Math.hypot(me.v[0], me.v[2]), dt);
  }
  flash.position.set(vmRoot.position.x, vmRoot.position.y + 0.03, vmRoot.position.z - muzzleDistance(me.weapon));
  $('scope').classList.toggle('hidden', !sniperScoped);
  $('crosshair').classList.toggle('hidden', sniperScoped); // stays visible while aiming; the scope has its own reticle
  const spreadPx = 5 + (Math.hypot(me.v[0], me.v[2]) > 1 ? 6 : 0) + (me.onGround ? 0 : 8) + recoil * 40;
  $('crosshair').style.setProperty('--gap', spreadPx + 'px');

  // Timer
  if (matchInfo.state === 'playing' && matchInfo.endsAt) {
    const left = Math.max(0, Math.ceil((matchInfo.endsAt - Date.now()) / 1000));
    $('timer').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  }
  if (reloading) $('mag').textContent = '…';

  animateArena(now / 1000);
  animateItems(now / 1000);
  updateBuffHud(now);
  updateRemotes(now, dt);
  updateEffects(dt);
  updateDamageNumbers(dt);

  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(vmScene, vmCamera);
}
for (const g in viewGuns) viewGuns[g].visible = g === me.weapon;
updateWeaponHud();
requestAnimationFrame(frame);

// Language last: every UI piece it updates exists by now
applyLang(detectLang(store.get('lang', null)));
try {
  const notice = sessionStorage.getItem('arena.notice');
  if (notice) { $('menu-status').textContent = notice; sessionStorage.removeItem('arena.notice'); }
} catch { /* storage blocked */ }
