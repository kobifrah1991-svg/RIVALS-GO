// Procedural textures, arena materials and humanoid character models.
// Everything is drawn on canvases at startup, so the game ships with no image files.
import * as THREE from 'three';
import { itemById } from './shared/shop.js';

const TEX = 256;

function canvas(size = TEX) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

// Deterministic noise so every player sees the same walls
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function speckle(x, rand, n, colors, maxR = 2) {
  for (let i = 0; i < n; i++) {
    x.fillStyle = colors[Math.floor(rand() * colors.length)];
    x.globalAlpha = 0.05 + rand() * 0.2;
    const r = 0.5 + rand() * maxR;
    x.fillRect(rand() * TEX, rand() * TEX, r, r);
  }
  x.globalAlpha = 1;
}

function stains(x, rand, n, color) {
  for (let i = 0; i < n; i++) {
    const cx = rand() * TEX, cy = rand() * TEX, r = 10 + rand() * 50;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
}

const painters = {
  // Poured concrete with form-tie holes and water stains
  concrete(x, rand) {
    x.fillStyle = '#5b5f6b'; x.fillRect(0, 0, TEX, TEX);
    speckle(x, rand, 5000, ['#3c3f48', '#7a7f8c', '#4a4e59', '#8d919c'], 2.5);
    stains(x, rand, 6, 'rgba(30,32,40,0.25)');
    x.strokeStyle = 'rgba(25,27,33,0.55)'; x.lineWidth = 2;
    x.strokeRect(1, 1, TEX - 2, TEX - 2);
    x.fillStyle = 'rgba(20,22,28,0.7)';
    for (const [a, b] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) { x.beginPath(); x.arc(a * TEX, b * TEX, 3.5, 0, 7); x.fill(); }
    // vertical drips
    for (let i = 0; i < 8; i++) {
      const px = rand() * TEX, len = 30 + rand() * 90;
      const g = x.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, 'rgba(25,25,30,0.25)'); g.addColorStop(1, 'rgba(25,25,30,0)');
      x.fillStyle = g; x.fillRect(px, 0, 2 + rand() * 4, len);
    }
  },
  // Big warehouse wall panels with a hazard stripe along the bottom
  wall(x, rand) {
    painters.concrete(x, rand);
    x.fillStyle = 'rgba(40,44,60,0.55)'; x.fillRect(0, 0, TEX, TEX);
    x.strokeStyle = 'rgba(10,10,16,0.8)'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(TEX / 2, 0); x.lineTo(TEX / 2, TEX); x.stroke();
    x.save(); x.beginPath(); x.rect(0, TEX * 0.86, TEX, TEX * 0.14); x.clip();
    for (let i = -2; i < 12; i++) { x.fillStyle = i % 2 ? '#141414' : '#e8b100'; x.beginPath(); x.moveTo(i * 32, TEX); x.lineTo(i * 32 + 32, TEX); x.lineTo(i * 32 + 64, TEX * 0.86); x.lineTo(i * 32 + 32, TEX * 0.86); x.fill(); }
    x.restore();
    speckle(x, rand, 1500, ['#000', '#777'], 2);
  },
  // Polished industrial floor tiles with worn paint lanes
  floor(x, rand) {
    x.fillStyle = '#2a2d36'; x.fillRect(0, 0, TEX, TEX);
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
      const v = 38 + Math.floor(rand() * 10);
      x.fillStyle = `rgb(${v},${v + 2},${v + 9})`;
      x.fillRect(tx * 128 + 2, ty * 128 + 2, 124, 124);
    }
    speckle(x, rand, 4000, ['#1a1c22', '#4b4f5c', '#5a5e6c'], 2);
    stains(x, rand, 5, 'rgba(10,10,14,0.35)');
    x.fillStyle = 'rgba(255,46,136,0.18)'; x.fillRect(0, 124, TEX, 8);
    // scuffs
    x.strokeStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 25; i++) { x.lineWidth = rand() * 2; x.beginPath(); const a = rand() * TEX, b = rand() * TEX; x.moveTo(a, b); x.lineTo(a + (rand() - 0.5) * 40, b + (rand() - 0.5) * 10); x.stroke(); }
  },
  // Diamond-plate steel for platforms and stairs
  plate(x, rand) {
    const g = x.createLinearGradient(0, 0, TEX, TEX);
    g.addColorStop(0, '#6f7480'); g.addColorStop(1, '#4e535e');
    x.fillStyle = g; x.fillRect(0, 0, TEX, TEX);
    for (let y = 0; y < TEX; y += 16) for (let xx = (y / 16) % 2 ? 8 : 0; xx < TEX; xx += 16) {
      x.save(); x.translate(xx + 4, y + 4); x.rotate(((y / 16) % 2 ? -1 : 1) * 0.7);
      x.fillStyle = 'rgba(255,255,255,0.22)'; x.fillRect(-5, -1.2, 10, 2.4);
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(-5, 1.2, 10, 1);
      x.restore();
    }
    speckle(x, rand, 1200, ['#222', '#999'], 1.5);
    stains(x, rand, 4, 'rgba(90,50,20,0.25)'); // rust
  },
  // Wooden shipping crate with a steel frame and stencil
  crate(x, rand) {
    x.fillStyle = '#8a5a2b'; x.fillRect(0, 0, TEX, TEX);
    for (let i = 0; i < 6; i++) {
      const y = i * (TEX / 6);
      const v = rand() * 30 - 15;
      x.fillStyle = `rgb(${140 + v},${92 + v},${46 + v})`;
      x.fillRect(0, y + 1, TEX, TEX / 6 - 2);
      x.strokeStyle = 'rgba(60,35,15,0.35)';
      for (let k = 0; k < 6; k++) { x.lineWidth = 0.5 + rand(); x.beginPath(); x.moveTo(0, y + rand() * 40); x.bezierCurveTo(80, y + rand() * 40, 160, y + rand() * 40, TEX, y + rand() * 40); x.stroke(); }
    }
    x.strokeStyle = '#3b2a1a'; x.lineWidth = 18; x.strokeRect(9, 9, TEX - 18, TEX - 18);
    x.lineWidth = 14; x.beginPath(); x.moveTo(16, 16); x.lineTo(TEX - 16, TEX - 16); x.stroke();
    x.fillStyle = '#9aa0a8';
    for (const [a, b] of [[16, 16], [TEX - 16, 16], [16, TEX - 16], [TEX - 16, TEX - 16]]) { x.beginPath(); x.arc(a, b, 5, 0, 7); x.fill(); }
    x.font = 'bold 34px Arial'; x.fillStyle = 'rgba(20,20,20,0.55)'; x.textAlign = 'center';
    x.fillText('AR-07', TEX / 2 + 30, TEX / 2 - 20);
    speckle(x, rand, 1500, ['#2a1a0a', '#c08a50'], 1.5);
  },
  // Painted steel cargo box (orange stacks)
  cargo(x, rand) {
    x.fillStyle = '#b5521b'; x.fillRect(0, 0, TEX, TEX);
    for (let i = 0; i < TEX; i += 16) { x.fillStyle = 'rgba(0,0,0,0.22)'; x.fillRect(i, 0, 4, TEX); x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(i + 5, 0, 2, TEX); }
    x.strokeStyle = '#4a2410'; x.lineWidth = 10; x.strokeRect(5, 5, TEX - 10, TEX - 10);
    stains(x, rand, 7, 'rgba(70,35,15,0.45)');
    speckle(x, rand, 2000, ['#3a1a08', '#e07a3a'], 2);
  },
  // Reinforced concrete barrier
  barrier(x, rand) {
    painters.concrete(x, rand);
    x.fillStyle = 'rgba(60,110,190,0.22)'; x.fillRect(0, 0, TEX, TEX);
    x.fillStyle = 'rgba(255,255,255,0.75)';
    x.fillRect(0, TEX * 0.12, TEX, 10);
    x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(0, TEX * 0.12 + 10, TEX, 3);
  },
  // Brushed steel column
  steel(x, rand) {
    x.fillStyle = '#80868f'; x.fillRect(0, 0, TEX, TEX);
    for (let i = 0; i < 400; i++) { x.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'; x.fillRect(0, rand() * TEX, TEX, 1); }
    x.fillStyle = '#2b2f36'; x.fillRect(0, 0, TEX, 10); x.fillRect(0, TEX - 10, TEX, 10);
    x.fillStyle = '#c9ced6';
    for (let i = 12; i < TEX; i += 40) { x.beginPath(); x.arc(i, 5, 2.5, 0, 7); x.fill(); x.beginPath(); x.arc(i, TEX - 5, 2.5, 0, 7); x.fill(); }
  },
  // Military fabric for characters, tinted by the player's colour afterwards
  fabric(x, rand) {
    x.fillStyle = '#8c8c8c'; x.fillRect(0, 0, TEX, TEX);
    for (let i = 0; i < 40; i++) {
      x.fillStyle = ['#6e6e6e', '#a4a4a4', '#7b7b7b', '#5c5c5c'][i % 4];
      x.beginPath();
      const cx = rand() * TEX, cy = rand() * TEX;
      x.moveTo(cx, cy);
      for (let k = 0; k < 6; k++) x.lineTo(cx + (rand() - 0.5) * 70, cy + (rand() - 0.5) * 70);
      x.fill();
    }
    for (let y = 0; y < TEX; y += 3) { x.fillStyle = 'rgba(0,0,0,0.05)'; x.fillRect(0, y, TEX, 1); }
  },
};

const texCache = new Map();
export function texture(kind, seed = 1) {
  const key = kind + seed;
  if (texCache.has(key)) return texCache.get(key);
  const [c, x] = canvas();
  painters[kind](x, rng(seed * 7919 + kind.length));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

// Material per map piece, chosen from its role in the level
const ROLE = {
  0x14162a: ['floor', 4, 0.55, 0.05],
  0x1e2240: ['wall', 6, 0.9, 0],
  0x3a2f6b: ['plate', 2, 0.5, 0.35],
  0x51438f: ['plate', 2, 0.5, 0.35],
  0x24406b: ['barrier', 2.5, 0.85, 0],
  0xffb300: ['crate', 1.5, 0.8, 0],
  0xff6d00: ['cargo', 2.4, 0.6, 0.3],
  0x00e5ff: ['steel', 1.2, 0.4, 0.25],
};

const matCache = new Map();
function boxMaterial(b) {
  const role = ROLE[b.color];
  if (!role) {
    // Neon trim pieces glow in their own colour
    return new THREE.MeshStandardMaterial({ color: b.color, emissive: b.color, emissiveIntensity: 1.2, roughness: 0.4 });
  }
  const [kind, , roughness, metalness] = role;
  if (matCache.has(kind)) return matCache.get(kind);
  const map = texture(kind);
  const m = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: kind === 'plate' ? 2.5 : 1.2, roughness, metalness });
  matCache.set(kind, m);
  return m;
}

// Box-project UVs so textures keep real-world scale on any box size
function worldUVs(geo, size, tile) {
  const uv = geo.attributes.uv;
  const dims = [[2, 1], [2, 1], [0, 2], [0, 2], [0, 1], [0, 1]]; // +x,-x,+y,-y,+z,-z
  for (let f = 0; f < 6; f++) {
    const [a, b] = dims[f];
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * size[a] / tile, uv.getY(k) * size[b] / tile);
    }
  }
  uv.needsUpdate = true;
}

export function buildArena(scene, boxes, { shadows }) {
  for (const b of boxes) {
    const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
    const geo = new THREE.BoxGeometry(...size);
    const role = ROLE[b.color];
    if (role) worldUVs(geo, size, role[1]);
    const mesh = new THREE.Mesh(geo, boxMaterial(b));
    mesh.position.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    mesh.castShadow = shadows && size[0] < 60 && size[1] > 0.3;
    mesh.receiveShadow = shadows;
    scene.add(mesh);
    // Neon light strip along the top of perimeter walls and cover walls
    if (b.color === 0x1e2240 || b.color === 0x24406b) {
      const long = size[0] > size[2] ? 0 : 2;
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(long === 0 ? size[0] : 0.08, 0.08, long === 2 ? size[2] : 0.08),
        new THREE.MeshBasicMaterial({ color: b.color === 0x1e2240 ? 0xff2e88 : 0x00e5ff }),
      );
      strip.position.set(mesh.position.x, b.max[1] - (b.color === 0x1e2240 ? 1.2 : 0.02), mesh.position.z);
      scene.add(strip);
    }
  }
}

// mode: 'day' (default) or 'night'
export function setupLighting(scene, renderer, { shadows, mode = 'day' }) {
  const day = mode !== 'night';
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = day ? 1.0 : 1.15;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Sky dome painted on a canvas: blue day with a sun glow, or a starry night
  const [c, x] = canvas(512);
  const g = x.createLinearGradient(0, 0, 0, 512);
  if (day) {
    g.addColorStop(0, '#2f7fd6'); g.addColorStop(0.5, '#7fbcf2'); g.addColorStop(0.75, '#d9ecfb'); g.addColorStop(1, '#bfd3e6');
  } else {
    g.addColorStop(0, '#05060f'); g.addColorStop(0.55, '#1a1440'); g.addColorStop(0.8, '#3a1a4a'); g.addColorStop(1, '#0b0c1a');
  }
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  const rand = rng(42);
  if (day) {
    const sg = x.createRadialGradient(360, 150, 0, 360, 150, 120);
    sg.addColorStop(0, 'rgba(255,250,225,1)'); sg.addColorStop(0.12, 'rgba(255,245,210,0.9)'); sg.addColorStop(1, 'rgba(255,240,200,0)');
    x.fillStyle = sg; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 14; i++) { // soft clouds
      const cx = rand() * 512, cy = 120 + rand() * 180, w = 40 + rand() * 90;
      for (let k = 0; k < 6; k++) {
        const cg = x.createRadialGradient(cx + k * w * 0.18, cy + (rand() - 0.5) * 10, 0, cx + k * w * 0.18, cy, w * 0.35);
        cg.addColorStop(0, 'rgba(255,255,255,0.55)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = cg; x.fillRect(cx - w, cy - w, w * 3, w * 2);
      }
    }
  } else {
    for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(255,255,255,${rand() * 0.8})`; x.fillRect(rand() * 512, rand() * 260, 1.2, 1.2); }
  }
  const sky = new THREE.CanvasTexture(c);
  sky.colorSpace = THREE.SRGBColorSpace;
  scene.background = sky;
  scene.fog = day ? new THREE.Fog(0xc9dcee, 70, 180) : new THREE.Fog(0x1a1530, 45, 130);

  scene.add(day ? new THREE.HemisphereLight(0xd6ecff, 0x8a7458, 1.6) : new THREE.HemisphereLight(0x9fb4ff, 0x2a1830, 0.9));
  const sun = new THREE.DirectionalLight(day ? 0xfff0d8 : 0xdfe6ff, day ? 3.2 : 2.2);
  sun.position.set(day ? 30 : 25, day ? 50 : 45, day ? 20 : 15);
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = s.bottom = -40; s.right = s.top = 40; s.near = 1; s.far = 140;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
  }
  scene.add(sun);
  // Coloured fill lights give the neon-warehouse mood (softer by day)
  for (const [color, px, pz] of [[0xff2e88, -18, -18], [0x00e5ff, 18, 18], [0xffb300, -18, 18], [0x7c4dff, 18, -18]]) {
    const l = new THREE.PointLight(color, day ? 8 : 40, 30, 1.6);
    l.position.set(px, 5, pz);
    scene.add(l);
  }
  if (!day) {
    const center = new THREE.PointLight(0xffffff, 30, 22, 1.5);
    center.position.set(0, 7, 0);
    scene.add(center);
  }
}

// ---------- characters ----------
const skinTones = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const hairColors = [0x2b1b10, 0x4a2e1a, 0x0f0f10, 0x7a4a22, 0xb08850];

function mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// A rounded limb segment (capsule) stretched between two points in the parent's space
function limb(parent, mat, from, to, radius) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const len = a.distanceTo(b);
  const m = mesh(new THREE.CapsuleGeometry(radius, Math.max(0.01, len - radius * 2 + radius), 6, 12), mat, parent);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

// Human soldier sized to the server hitboxes (body up to 1.4 m, head 1.4–1.85 m), facing -Z.
// Returns the pivots that the walk cycle and aiming move.
export function buildCharacter(color, seed) {
  const root = new THREE.Group();
  const team = new THREE.Color(color);
  const pants = new THREE.MeshStandardMaterial({ color: 0x4b5240, map: texture('fabric'), roughness: 0.9 });
  const shirt = new THREE.MeshStandardMaterial({ color: team.clone().lerp(new THREE.Color(0x555555), 0.45), map: texture('fabric', 2), roughness: 0.85 });
  const vest = new THREE.MeshStandardMaterial({ color: team, roughness: 0.55, metalness: 0.05 });
  const gear = new THREE.MeshStandardMaterial({ color: 0x24262c, roughness: 0.75 });
  const skin = new THREE.MeshStandardMaterial({ color: skinTones[seed % skinTones.length], roughness: 0.55 });
  const hair = new THREE.MeshStandardMaterial({ color: hairColors[(seed * 3) % hairColors.length], roughness: 0.9 });
  const eye = new THREE.MeshStandardMaterial({ color: 0x15100c, roughness: 0.2 });
  const glow = new THREE.MeshBasicMaterial({ color });

  // Legs: hip -> knee -> ankle, with boots
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.11, 0.9, 0);
    limb(hip, pants, [0, 0, 0], [0, -0.44, -0.01], 0.085);
    const knee = new THREE.Group(); knee.position.set(0, -0.44, -0.01); hip.add(knee);
    limb(knee, pants, [0, 0, 0], [0, -0.38, 0.02], 0.07);
    const boot = mesh(new THREE.CapsuleGeometry(0.06, 0.12, 4, 10), gear, knee, 0, -0.42, -0.04);
    boot.rotation.x = Math.PI / 2;
    boot.scale.set(1.1, 1, 0.8);
    root.add(hip);
    legs.push({ hip, knee });
  }

  // Torso: pelvis, chest, vest with team stripe, small backpack
  const torso = new THREE.Group(); torso.position.y = 0.9; root.add(torso);
  const pelvis = mesh(new THREE.SphereGeometry(0.16, 16, 12), pants, torso, 0, 0.02, 0);
  pelvis.scale.set(1.25, 0.7, 0.85);
  mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 20), gear, torso, 0, 0.08, 0).rotation.x = Math.PI / 2; // belt
  const chest = mesh(new THREE.CapsuleGeometry(0.17, 0.22, 6, 16), shirt, torso, 0, 0.3, 0);
  chest.scale.set(1.3, 1, 0.78);
  const vestMesh = mesh(new THREE.CapsuleGeometry(0.175, 0.16, 6, 16), vest, torso, 0, 0.32, 0);
  vestMesh.scale.set(1.32, 1, 0.86);
  mesh(new THREE.TorusGeometry(0.205, 0.012, 6, 24), glow, torso, 0, 0.42, 0).rotation.x = Math.PI / 2;
  mesh(new THREE.BoxGeometry(0.1, 0.09, 0.05), gear, torso, -0.1, 0.25, -0.15);
  mesh(new THREE.BoxGeometry(0.1, 0.09, 0.05), gear, torso, 0.1, 0.25, -0.15);
  const pack = mesh(new THREE.CapsuleGeometry(0.11, 0.12, 4, 10), gear, torso, 0, 0.32, 0.17);
  pack.scale.set(1.3, 1, 0.7);
  // shoulders
  for (const side of [-1, 1]) mesh(new THREE.SphereGeometry(0.085, 12, 10), shirt, torso, side * 0.24, 0.45, 0);

  // Head with face and hair, on a neck pivot so it can look up and down
  const neck = new THREE.Group(); neck.position.y = 1.4; root.add(neck);
  limb(neck, skin, [0, -0.04, 0], [0, 0.08, 0], 0.055);
  const head = mesh(new THREE.SphereGeometry(0.13, 20, 16), skin, neck, 0, 0.22, 0);
  head.scale.set(0.92, 1.12, 1.0);
  const jaw = mesh(new THREE.SphereGeometry(0.1, 16, 12), skin, neck, 0, 0.15, -0.025);
  jaw.scale.set(0.95, 0.8, 1);
  for (const side of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.017, 8, 6), eye, neck, side * 0.045, 0.24, -0.118);       // eyes
    const brow = mesh(new THREE.BoxGeometry(0.05, 0.012, 0.015), hair, neck, side * 0.045, 0.268, -0.118);
    brow.rotation.z = side * -0.12;
    const ear = mesh(new THREE.SphereGeometry(0.03, 8, 8), skin, neck, side * 0.12, 0.22, 0);   // ears
    ear.scale.set(0.5, 1, 0.8);
  }
  const nose = mesh(new THREE.ConeGeometry(0.022, 0.05, 8), skin, neck, 0, 0.21, -0.135);
  nose.rotation.x = -Math.PI / 2.4;
  mesh(new THREE.BoxGeometry(0.05, 0.01, 0.01), eye, neck, 0, 0.165, -0.115);                    // mouth
  // Cap or helmet in the team colour so players are recognisable at range
  const capOn = seed % 2 === 0;
  const top = mesh(new THREE.SphereGeometry(0.138, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), capOn ? vest : hair, neck, 0, 0.245, 0.005);
  top.scale.set(0.98, 0.95, 1.05);
  if (capOn) {
    const brim = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.012, 16, 1, false, Math.PI * 0.5, Math.PI), vest, neck, 0, 0.25, -0.07);
    brim.scale.set(1, 1, 1.3);
  } else {
    mesh(new THREE.SphereGeometry(0.13, 14, 10), hair, neck, 0, 0.22, 0.03).scale.set(0.95, 1.05, 0.95); // hair at the back
  }

  // Arms posed on the weapon: right hand on the grip, left hand on the fore-grip
  const aim = new THREE.Group(); aim.position.y = 1.32; root.add(aim);
  const gunMount = new THREE.Group(); gunMount.position.set(0.09, -0.13, -0.36); aim.add(gunMount);
  const R = { sh: [0.24, 0.02, 0], el: [0.27, -0.24, -0.12], hand: [0.09, -0.17, -0.33] };
  const L = { sh: [-0.24, 0.02, 0], el: [-0.17, -0.2, -0.32], hand: [0.07, -0.1, -0.62] };
  for (const arm of [R, L]) {
    limb(aim, shirt, arm.sh, arm.el, 0.06);
    limb(aim, skin, arm.el, arm.hand, 0.048);
    mesh(new THREE.SphereGeometry(0.05, 10, 8), gear, aim, ...arm.hand).scale.set(1, 0.9, 1.2); // glove
  }

  return { root, legs, torso, neck, aim, gunMount };
}

// Walk cycle driven by ground speed (m/s)
export function animateCharacter(c, speed, t, dt) {
  c.phase = (c.phase || 0) + dt * Math.min(speed, 9) * 1.5;
  const amt = Math.min(1, speed / 6);
  const s = Math.sin(c.phase);
  c.legs[0].hip.rotation.x = s * 0.7 * amt;
  c.legs[1].hip.rotation.x = -s * 0.7 * amt;
  c.legs[0].knee.rotation.x = -Math.max(0, -s) * 1.0 * amt; // knees bend backwards
  c.legs[1].knee.rotation.x = -Math.max(0, s) * 1.0 * amt;
  c.torso.position.y = 0.9 + Math.abs(Math.cos(c.phase)) * 0.035 * amt;
  c.torso.rotation.y = s * 0.07 * amt;
  c.torso.scale.y = 1 + Math.sin(t * 2) * 0.012 * (1 - amt); // idle breathing
}

// Gun metal with a subtle texture for view-model and third-person weapons
export function gunMaterials(accent) {
  return {
    dark: new THREE.MeshStandardMaterial({ color: 0xb4bac6, map: texture('steel', 3), roughness: 0.45, metalness: 0.25 }),
    grip: new THREE.MeshStandardMaterial({ color: 0x2b2c33, roughness: 0.85 }),
    accent: new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.35, roughness: 0.3 }),
  };
}

// Weapon camo skin: tints every material of the weapon (cosmetic only)
export function applyCamo(group, camoId) {
  const camo = itemById(camoId);
  if (!camo || camo.slot !== 'camo') return;
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.color.lerp(new THREE.Color(camo.color), 0.7);
    if (camo.metal != null) { o.material.metalness = camo.metal; o.material.roughness = 0.3; }
    if (camo.glow) { o.material.emissive = new THREE.Color(camo.color); o.material.emissiveIntensity = 0.35; }
  });
}

// ---------- real weapon models (glTF) ----------
// axis/muzzle: where the barrel points in the source file; length in metres;
// back/up: where the hand grips, as fractions from the stock end and from the top.
// The weapon files are already in weapon space: barrel along -Z, grip at the origin, metres.
// (Prepared that way by the mini-cry project from CC0 sources; see models/CREDITS.md.)
const WEAPON_MODELS = {
  rifle: { file: 'rifle.glb' },
  shotgun: { file: 'shotgun.glb' },
  sniper: { file: 'sniper.glb' },
  pistol: { file: 'pistol.glb' },
  knife: { file: 'knife.glb' },
};
const weaponTemplates = {};
const muzzles = {};

export async function loadWeapons(base) {
  await Promise.all(Object.entries(WEAPON_MODELS).map(async ([key, cfg]) => {
    const src = (await loadGLB(typeof base === 'function' ? base(cfg.file) : base + cfg.file)).scene;
    src.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const box = new THREE.Box3().setFromObject(src);
    muzzles[key] = -box.min.z;
    const root = new THREE.Group();
    root.add(src);
    weaponTemplates[key] = root;
  }));
}
// Distance from the grip to the muzzle, for placing the flash
export function muzzleDistance(key) {
  return muzzles[key] ?? 0.75;
}
export const weaponsReady = () => Object.keys(weaponTemplates).length === Object.keys(WEAPON_MODELS).length;

// Weapon meshes for the view model and for characters' hands
export function buildGun(key, color, scale = 1, camoId = null) {
  if (weaponTemplates[key]) {
    const g = weaponTemplates[key].clone();
    g.scale.setScalar(scale);
    applyCamo(g, camoId);
    return g;
  }
  const g = new THREE.Group();
  const { dark, grip, accent } = gunMaterials(color);
  const box = (sx, sy, sz, x, y, z, m = dark) => { const mm = new THREE.Mesh(new THREE.BoxGeometry(sx * scale, sy * scale, sz * scale), m); mm.position.set(x * scale, y * scale, z * scale); mm.castShadow = true; g.add(mm); return mm; };
  const handle = (x, y, z) => box(0.055, 0.13, 0.07, x, y, z, grip);
  if (key === 'rifle') { box(0.08, 0.1, 0.55, 0, 0, -0.1); box(0.04, 0.04, 0.3, 0, 0.02, -0.5); box(0.06, 0.14, 0.06, 0, -0.1, -0.05); box(0.085, 0.03, 0.4, 0, 0.065, -0.1, accent); box(0.07, 0.1, 0.18, 0, -0.02, 0.22, grip); box(0.05, 0.16, 0.08, 0, -0.12, -0.25); handle(0, -0.09, 0.05); }
  if (key === 'shotgun') { box(0.1, 0.1, 0.5, 0, 0, -0.1); box(0.05, 0.05, 0.35, 0.025, 0.02, -0.5); box(0.05, 0.05, 0.35, -0.025, 0.02, -0.5); box(0.105, 0.04, 0.2, 0, -0.05, -0.35, accent); box(0.08, 0.1, 0.2, 0, -0.03, 0.22, grip); handle(0, -0.09, 0.05); }
  if (key === 'sniper') { box(0.07, 0.09, 0.7, 0, 0, -0.1); box(0.03, 0.03, 0.45, 0, 0.01, -0.65); box(0.05, 0.05, 0.28, 0, 0.1, -0.1, accent); box(0.07, 0.12, 0.2, 0, -0.03, 0.3, grip); box(0.06, 0.06, 0.06, 0, 0.1, -0.26); box(0.06, 0.06, 0.06, 0, 0.1, 0.06); handle(0, -0.09, 0.1); }
  if (key === 'knife') {
    const blade = new THREE.MeshStandardMaterial({ color: 0xf2f5f8, roughness: 0.25, metalness: 0.3, emissive: 0x30363d });
    box(0.03, 0.1, 0.03, 0, -0.04, 0.02, grip);          // handle
    box(0.07, 0.015, 0.03, 0, 0.015, 0.02, dark);        // guard
    box(0.012, 0.035, 0.2, 0, 0.03, -0.09, blade);       // blade
    box(0.006, 0.02, 0.05, 0, 0.045, -0.2, blade);       // tip
  }
  if (key === 'pistol') { box(0.06, 0.08, 0.26, 0, 0, -0.05); box(0.055, 0.14, 0.06, 0, -0.09, 0.03, grip); box(0.065, 0.02, 0.2, 0, 0.05, -0.05, accent); }
  return g;
}

// ---------- realistic animated soldier (glTF) ----------
// Characters are Rocketbox avatars (see shared/characters.js) with separate idle/walk/run clips.
// Legs and body play the animation; the arms are solved with two-bone IK onto the weapon.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// One template per model file, shared by every character that uses it
const charTemplates = new Map();
const charDefs = new Map();
const animSets = new Map(); // anims file key -> { Idle, Walk, Run } clips
// Characters load one by one, on demand (the chosen one and those in the match), so a phone never
// holds all ten models at once and one failed download can't take the others down with it.
// Models embedded as data: URLs are decoded here instead of fetched: some hosts (the claude.ai app)
// block fetch() of data: and blob: URLs. Embedded textures then load through <img> rather than fetch.
function loadGLB(url) {
  const loader = new GLTFLoader();
  if (!url.startsWith('data:')) return loader.loadAsync(url);
  const bin = atob(url.slice(url.indexOf(',') + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const saved = window.createImageBitmap;
  window.createImageBitmap = undefined; // GLTFLoader picks TextureLoader (<img>) when ImageBitmap is unavailable
  try { return loader.parseAsync(bytes.buffer, ''); } finally { window.createImageBitmap = saved; }
}
const charLoads = new Map(); // file -> promise
export function registerCharacters(list) { for (const c of list) charDefs.set(c.id, c); }
export function loadCharacter(id, urlFor) {
  const def = charDefs.get(id);
  if (!def) return Promise.reject(new Error('unknown character ' + id));
  if (!charLoads.has(def.file)) {
    charLoads.set(def.file, loadGLB(urlFor(def.file)).then((gltf) => {
      // Hair and lash cards: smooth cut-out edges where multisampling is on
      gltf.scene.traverse((o) => { if (o.isMesh && o.material.alphaTest > 0) o.material.alphaToCoverage = true; });
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const scale = (def.height || 1.8) / (box.max.y - box.min.y);
      charTemplates.set(def.file, { scene: gltf.scene, animations: gltf.animations, scale, footY: -box.min.y * scale });
    }).catch((e) => { charLoads.delete(def.file); throw e; })); // a later request retries
  }
  return charLoads.get(def.file);
}
// Separate animation files (Rocketbox idle/walk/run), shared by characters with the same skeleton
export async function loadAnimations(list, urlFor) {
  const sets = new Map();
  for (const c of list) if (c.anims) sets.set(JSON.stringify(c.anims), c.anims);
  await Promise.all([...sets.entries()].map(async ([key, anims]) => {
    const out = {};
    await Promise.all(Object.entries(anims).map(async ([name, file]) => {
      const clip = (await loadGLB(urlFor(file))).animations[0];
      if (!clip) return;
      clip.name = name;
      // Keep the clip in place: lock the root's horizontal travel, keep its vertical bob.
      // (Movement comes from the game; without this the body walks away from its weapon.)
      for (const tr of clip.tracks) {
        if (!/(^|_)Bip01\.position$/.test(tr.name) && !/Hips\.position$/.test(tr.name)) continue;
        const v = tr.values;
        for (let i = 3; i < v.length; i += 3) { v[i] = v[0]; v[i + 2] = v[2]; }
      }
      out[name] = clip;
    }));
    animSets.set(key, out);
  }));
}
export const characterLoaded = (id) => charTemplates.has(charDefs.get(id)?.file);
// Real soldiers can be drawn once the clips and at least one model are in
export const soldierReady = () => animSets.size > 0 && charTemplates.size > 0;
// A character whose model isn't loaded yet borrows a loaded one (same gender if possible) until it arrives
function loadedDef(id) {
  const want = charDefs.get(id) || charDefs.values().next().value;
  if (charTemplates.has(want.file)) return want;
  const loaded = [...charDefs.values()].filter((d) => charTemplates.has(d.file));
  return loaded.find((d) => !!d.female === !!want.female) || loaded[0];
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

// Rotate `bone` so that its child `child` points towards world position `target`
function aimBone(bone, child, target) {
  bone.getWorldPosition(_v1);
  child.getWorldPosition(_v2);
  const cur = _v2.sub(_v1).normalize();
  const want = _v3.copy(target).sub(_v1).normalize();
  _q.setFromUnitVectors(cur, want);
  bone.getWorldQuaternion(_q2);
  _q2.premultiply(_q);
  const parentQ = new THREE.Quaternion();
  bone.parent.getWorldQuaternion(parentQ);
  bone.quaternion.copy(parentQ.invert().multiply(_q2));
  bone.updateMatrixWorld(true);
}

// Two-bone IK: place `hand` at `target`, bending the elbow towards `pole`
function solveArm(arm, fore, hand, target, pole) {
  const a = arm.getWorldPosition(new THREE.Vector3());
  const l1 = a.distanceTo(fore.getWorldPosition(new THREE.Vector3()));
  const l2 = fore.getWorldPosition(new THREE.Vector3()).distanceTo(hand.getWorldPosition(new THREE.Vector3()));
  const toT = target.clone().sub(a);
  const d = Math.min(toT.length(), (l1 + l2) * 0.999);
  const dir = toT.normalize();
  // elbow: along the reach direction, pushed sideways towards the pole
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const along = l1 * cosA, side = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const poleDir = pole.clone().sub(a);
  poleDir.sub(dir.clone().multiplyScalar(poleDir.dot(dir))).normalize();
  const elbow = a.clone().add(dir.clone().multiplyScalar(along)).add(poleDir.multiplyScalar(side));
  aimBone(arm, fore, elbow);
  aimBone(fore, hand, a.clone().add(dir.multiplyScalar(d)));
}

export function buildSoldier(color, seed, characterId, cosmetics = {}) {
  const outfit = itemById(cosmetics.outfit);
  const def = loadedDef(characterId);
  const t = charTemplates.get(def.file);
  const root = new THREE.Group();
  const model = SkeletonUtils.clone(t.scene);
  model.scale.setScalar(t.scale);
  model.position.y = t.footY || 0;   // feet on the ground
  if (def.flip) model.rotation.y = Math.PI; // models authored facing +Z
  const team = new THREE.Color(color);
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
      o.material = o.material.clone();
      if (def.tint != null) o.material.color.multiply(new THREE.Color(def.tint).lerp(new THREE.Color(0xffffff), 0.35));
      // Outfit skin recolours clothing and gear, never the face
      if (outfit && !/head/i.test(o.material.name)) o.material.color.multiply(new THREE.Color(outfit.tint).lerp(new THREE.Color(0xffffff), 0.25));
      o.material.color.lerp(team, 0.12); // light team tint on the uniform
    }
  });
  // Posture group between root and model: tilted forward to lie prone (see updatePosture)
  const body = new THREE.Group(); root.add(body); body.add(model);
  // Mixamo names first, then 3ds Max Biped names (Rocketbox: "Bip01 R UpperArm"), then any bone ending the same way
  const BIPED = { RightArm: 'R_UpperArm', RightForeArm: 'R_Forearm', RightHand: 'R_Hand', LeftArm: 'L_UpperArm', LeftForeArm: 'L_Forearm', LeftHand: 'L_Hand',
    RightUpLeg: 'R_Thigh', RightLeg: 'R_Calf', RightFoot: 'R_Foot', LeftUpLeg: 'L_Thigh', LeftLeg: 'L_Calf', LeftFoot: 'L_Foot' };
  const bone = (n) => {
    let found = model.getObjectByName('mixamorig' + n);
    for (const suffix of [BIPED[n], n].filter(Boolean)) {
      if (!found) model.traverse((o) => { if (!found && o.isBone && o.name.toLowerCase().endsWith(suffix.toLowerCase())) found = o; });
    }
    return found;
  };
  const bones = {
    rArm: bone('RightArm'), rFore: bone('RightForeArm'), rHand: bone('RightHand'),
    lArm: bone('LeftArm'), lFore: bone('LeftForeArm'), lHand: bone('LeftHand'),
    spine1: bone('Spine1'), spine2: bone('Spine2'), head: bone('Head'),
    rThigh: bone('RightUpLeg'), rCalf: bone('RightLeg'), rFoot: bone('RightFoot'),
    lThigh: bone('LeftUpLeg'), lCalf: bone('LeftLeg'), lFoot: bone('LeftFoot'),
    hips: model.getObjectByName('Bip01') || model.getObjectByName('mixamorigHips'),
  };
  // Finger bones: the middle-finger root orients the hand, the joints curl around the grip
  const fingers = (hand) => {
    const f = { mid: null, thumb: null, joints: [] };
    hand?.traverse((o) => {
      if (o === hand || !o.isBone) return;
      if (/finger2$/i.test(o.name)) f.mid = o;
      else if (/finger0$/i.test(o.name)) f.thumb = o;
      if (/finger[0-4]\d?$/i.test(o.name)) f.joints.push({ bone: o, root: /finger[0-4]$/i.test(o.name), thumb: /finger0\d?$/i.test(o.name), index: /finger1\d?$/i.test(o.name) });
    });
    return f;
  };
  bones.rFingers = fingers(bones.rHand); bones.lFingers = fingers(bones.lHand);
  const mixer = new THREE.AnimationMixer(model);
  // Find clips by name, tolerating other naming (e.g. "idle", "Armature|Run")
  const own = def.anims ? animSets.get(JSON.stringify(def.anims)) : null;
  const pool = own ? Object.values(own) : t.animations;
  const find = (n) => pool.find((a) => a.name.toLowerCase().includes(n.toLowerCase()));
  const actions = {};
  for (const n of ['Idle', 'Walk', 'Run']) {
    const c = find(n) || find('Idle') || pool[0];
    actions[n] = c ? mixer.clipAction(c) : null;
  }
  for (const a of Object.values(actions)) if (a) { a.play(); a.setEffectiveWeight(0); }
  actions.Idle?.setEffectiveWeight(1);
  mixer.setTime(seed * 0.37); // desync idle cycles

  // Aim pivot at shoulder height carries the weapon; pitch rotates it. Hands are solved onto it every frame.
  const aim = new THREE.Group(); aim.position.set(0, 1.42 * (def.height || 1.8) / 1.8, 0); root.add(aim);
  const gunMount = new THREE.Group(); aim.add(gunMount);
  const grip = new THREE.Object3D(); aim.add(grip);
  const fore = new THREE.Object3D(); aim.add(fore);
  const rPole = new THREE.Object3D(); rPole.position.set(0.7, -0.7, 0.3); aim.add(rPole);
  const lPole = new THREE.Object3D(); lPole.position.set(-0.6, -0.8, -0.1); aim.add(lPole);
  const c = { root, body, aim, aimY: aim.position.y, scale: (def.height || 1.8) / 1.8, gunMount, neck: new THREE.Group(), mixer, actions, bones, grip, fore, rPole, lPole, soldier: true, hold: null,
    stance: 0, crouchW: 0, proneW: 0 };
  setHold(c, 'rifle');
  return c;
}

// How each weapon is held, in aim-pivot space (metres; -Z forward, +X the character's right).
// gun: where the weapon's origin (its pistol grip) sits. rOff / lOff: wrist positions relative to the weapon,
// taken from the models: AK handguard ~25 cm ahead of the grip, shotgun pump ~38 cm, rifle fore-end ~30 cm.
// rDir / lDir: where the hand points (wrist to knuckles); rPalm / lPalm: which way the palm faces.
// blade: torso twist that brings the left shoulder forward, like a real shooting stance.
// lOff: null leaves the left arm to the animation (one-handed knife).
const add = (a, b) => a.map((v, i) => v + b[i]);
// right hand: a handshake grip on the pistol grip (palm against the grip's right side, back of the hand outward)
const R_GRIP = { rOff: [0.01, 0.04, 0.12], rDir: [0, -0.6, -0.8], rPalm: [-1, 0, 0] }; // wrist behind the grip, index finger reaching the trigger
// left hand: palm up under the handguard / pump, fingers wrapping its right side
const SUPPORT = { lDir: [0.3, 0.3, -0.9], lPalm: [0.35, 1, 0], curl: 1.15 };
const HOLD_DEFS = {
  rifle: { ...R_GRIP, ...SUPPORT, gun: [0.14, -0.08, -0.24], lOff: [-0.005, 0.035, -0.21], blade: -0.5 },
  shotgun: { ...R_GRIP, ...SUPPORT, gun: [0.14, -0.07, -0.2], lOff: [-0.005, 0.025, -0.33], blade: -0.6 },
  sniper: { ...R_GRIP, ...SUPPORT, gun: [0.14, -0.05, -0.22], lOff: [-0.005, 0.03, -0.26], blade: -0.55 },
  // pistol: both arms forward, the left hand wraps around the right (a "teacup"-free two-hand grip)
  pistol: { ...R_GRIP, gun: [0.05, -0.08, -0.46], rOff: [0.01, 0.065, 0.06], rDir: [0, -0.5, -0.85],
    lOff: [-0.04, 0.045, 0.07], lDir: [0.35, -0.3, -0.9], lPalm: [1, 0.2, 0], blade: -0.18, curl: 1.15 },
  // machete: one hand on the handle, blade forward and slightly up
  knife: { melee: true, gun: [0.2, -0.22, -0.36], rOff: [0, -0.015, 0.07], rDir: [0, -0.2, -1], rPalm: [-1, 0, 0], lOff: null, blade: -0.1, curl: 1.3 },
};
const HOLDS = Object.fromEntries(Object.entries(HOLD_DEFS).map(([k, d]) => [k, { ...d, r: add(d.gun, d.rOff), l: d.lOff && add(d.gun, d.lOff) }]));
export function setHold(c, key) {
  if (!c.soldier) return;
  const h = HOLDS[key] || HOLDS.rifle;
  c.hold = h;
  c.reach = 0; // re-measured on the next frame
  c.gunMount.position.fromArray(h.gun);
  c.grip.position.fromArray(h.r);
  if (h.l) c.fore.position.fromArray(h.l);
}

// Characters' arms differ in length: if the support hand can't reach the handguard, the weapon (third person)
// or the body (first person) slides back just enough, so the hand lands on the gun instead of in the air.
function fitReach(c) {
  const b = c.bones, h = c.hold;
  if (!h.l) return;
  // Measure from the base hold (first person: updateFirstPerson has just put the body at its base spot)
  if (!c.fp) {
    c.gunMount.position.z = h.gun[2]; c.grip.position.z = h.r[2]; c.fore.position.z = h.l[2];
    c.aim.updateMatrixWorld(true);
  }
  if (!c.reach) c.reach = 0.97 * (b.lArm.getWorldPosition(_v1).distanceTo(b.lFore.getWorldPosition(_v2)) + _v2.distanceTo(b.lHand.getWorldPosition(_v3)));
  const S = b.lArm.getWorldPosition(new THREE.Vector3());
  const back = new THREE.Vector3(0, 0, 1).applyQuaternion(c.aim.getWorldQuaternion(new THREE.Quaternion()));
  const D = c.fore.getWorldPosition(new THREE.Vector3()).sub(S);
  const db = D.dot(back), disc = db * db - D.lengthSq() + c.reach * c.reach;
  // First person moves the body only a little: more would bring shoulders into view or clip the right hand
  const k = D.length() <= c.reach || disc < 0 ? 0 : Math.min(c.fp ? 0.06 : 0.2, Math.max(0, -db - Math.sqrt(disc)));
  if (!k) return;
  const local = k / c.aim.getWorldScale(_v1).z;
  if (c.fp) {
    // Body forward, aim pivot back by the same amount: the hands' targets stay on the view-model gun
    c.root.position.z -= local;
    c.aim.position.z += local;
  } else {
    c.gunMount.position.z += local; c.grip.position.z += local; c.fore.position.z += local;
  }
  c.root.updateMatrixWorld(true);
}

const _qa = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qw = new THREE.Quaternion();
// Rotate a bone about a world-space axis, keeping the rest of its pose
function turnBone(bone, axis, angle) {
  if (!bone || !angle) return;
  _qa.setFromAxisAngle(axis, angle);
  bone.getWorldQuaternion(_qw).premultiply(_qa);
  bone.parent.getWorldQuaternion(_qp);
  bone.quaternion.copy(_qp.invert().multiply(_qw));
  bone.updateMatrixWorld(true);
}

// Tactical posture for everyone: knees slightly bent and the torso leaning into the weapon.
// Crouch: hips drop and the legs fold (two-bone leg IK keeps the feet where the walk/idle clip put them),
// so crouch-walking needs no extra animation. Prone: the body tilts forward around the hips to lie flat,
// chest and head raised to aim; moving while prone plays the walk slowly, which reads as crawling.
const POSTURE = { tacticalDrop: 0.05, crouchDrop: 0.42, lean: 0.12, crouchLean: 0.28 };
function legIK(c, thigh, calf, foot, target, fwd) {
  if (!thigh || !calf || !foot) return;
  const footQ = foot.getWorldQuaternion(new THREE.Quaternion());
  const pole = thigh.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, 1).add(new THREE.Vector3(0, -0.3, 0));
  solveArm(thigh, calf, foot, target, pole); // knee bends forward
  foot.parent.getWorldQuaternion(_qp); foot.quaternion.copy(_qp.invert().multiply(footQ)); // foot stays flat
  foot.updateMatrixWorld(true);
}
function updatePosture(c, speed, dt) {
  const b = c.bones, k = Math.min(1, dt * 8), sc = c.scale;
  c.crouchW += ((c.stance === 1 ? 1 : 0) - c.crouchW) * k;
  c.proneW += ((c.stance === 2 ? 1 : 0) - c.proneW) * Math.min(1, dt * 5);
  const pw = c.proneW, cw = c.crouchW * (1 - pw);
  // Prone: tilt the body forward around the hips and bring them down near the ground
  const hipH = 0.95 * sc, th = -Math.PI / 2 * pw;
  c.body.rotation.x = th;
  c.body.position.set(0, hipH - hipH * Math.cos(th) - pw * (hipH - 0.16), -hipH * Math.sin(th));
  if (c.actions.Walk && pw > 0.5) c.actions.Walk.timeScale = Math.min(c.actions.Walk.timeScale, 0.6); // slow crawl
  c.root.updateMatrixWorld(true);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(c.root.getWorldQuaternion(new THREE.Quaternion()));
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(c.root.getWorldQuaternion(new THREE.Quaternion()));
  if (pw < 0.5 && b.hips) {
    // Standing / crouching: lower the hips, then fold the legs back down to the animated feet
    const drop = (POSTURE.tacticalDrop + (POSTURE.crouchDrop - POSTURE.tacticalDrop) * cw) * sc * (1 - pw * 2);
    const lt = b.lFoot && b.lFoot.getWorldPosition(new THREE.Vector3()), rt = b.rFoot && b.rFoot.getWorldPosition(new THREE.Vector3());
    const hp = b.hips.getWorldPosition(new THREE.Vector3()); hp.y -= drop;
    b.hips.position.copy(b.hips.parent.worldToLocal(hp));
    b.hips.updateMatrixWorld(true);
    if (lt) legIK(c, b.lThigh, b.lCalf, b.lFoot, lt, fwd);
    if (rt) legIK(c, b.rThigh, b.rCalf, b.rFoot, rt, fwd);
    // Lean into the weapon (more when crouched)
    const lean = -(POSTURE.lean + (POSTURE.crouchLean - POSTURE.lean) * cw);
    turnBone(b.spine1, right, lean * 0.5); turnBone(b.spine2, right, lean * 0.5);
    turnBone(b.head, right, -lean * 0.8);
    c.aim.position.set(0, c.aimY - drop - 0.06 * cw * sc, -0.08 * cw * sc);
  } else {
    // Prone: raise chest and head off the ground to look and aim forward
    turnBone(b.spine1, right, 0.45 * pw); turnBone(b.spine2, right, 0.35 * pw);
    turnBone(b.head, right, 0.55 * pw);
    c.aim.position.set(0, 0.34 * sc, -0.62 * sc);
    // Legs stretched out behind, slightly apart, resting on the ground; crawling swings them a little
    const swing = Math.sin(performance.now() / 1000 * 5) * Math.min(1, speed / 1.5) * 0.12 * sc;
    for (const [thigh, calf, foot, side, ph] of [[b.lThigh, b.lCalf, b.lFoot, -1, 1], [b.rThigh, b.rCalf, b.rFoot, 1, -1]]) {
      if (!thigh) continue;
      const t = thigh.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, -0.86 * sc + swing * ph).addScaledVector(right, side * 0.1 * sc);
      t.y = c.root.getWorldPosition(_v1).y + 0.07 * sc;
      legIK(c, thigh, calf, foot, t, new THREE.Vector3(0, -1, 0)); // knees toward the ground
    }
  }
}

function updateSoldier(c, speed, dt) {
  // Blend idle / walk / run by ground speed
  const w = speed < 0.3 ? [1, 0, 0] : speed < 4.5 ? [0, 1, 0] : [0, 0, 1];
  const k = Math.min(1, dt * 8);
  ['Idle', 'Walk', 'Run'].forEach((n, i) => {
    const a = c.actions[n];
    if (a) a.setEffectiveWeight(a.getEffectiveWeight() + (w[i] - a.getEffectiveWeight()) * k);
  });
  if (c.actions.Run) c.actions.Run.timeScale = Math.max(0.7, speed / 6);
  if (c.actions.Walk) c.actions.Walk.timeScale = Math.max(0.7, speed / 2.5);
  c.mixer.update(dt);
  if (c.fp && c.bones.head) c.bones.head.scale.setScalar(0.001);
  c.root.updateMatrixWorld(true);
  const b = c.bones, wp = (o) => o.getWorldPosition(new THREE.Vector3());
  // Models without arm bones keep their own pose
  if (!b.rArm || !b.rFore || !b.rHand || !b.lArm || !b.lFore || !b.lHand) return;
  const h = c.hold;
  if (!c.fp) updatePosture(c, speed, dt);
  // Shooting stance: twist the torso (left shoulder forward), bend the spine with the aim, keep the head on target
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(c.root.getWorldQuaternion(new THREE.Quaternion()));
  const pitch = c.fp ? 0 : c.aim.rotation.x; // first person: the camera pitches, the body stays upright
  const blade = (c.fp && h.l ? c.fpBlade : h.blade) * (1 - c.proneW); // lying down: no torso twist
  turnBone(b.spine1, up, blade * 0.5); turnBone(b.spine2, up, blade * 0.5);
  turnBone(b.spine1, right, pitch * 0.2); turnBone(b.spine2, right, pitch * 0.25);
  turnBone(b.head, up, -blade * 0.85); turnBone(b.head, right, pitch * 0.45);
  fitReach(c);
  const aimQ = c.aim.getWorldQuaternion(new THREE.Quaternion());
  solveArm(b.rArm, b.rFore, b.rHand, wp(c.grip), wp(c.rPole));
  gripHand(b.rHand, b.rFingers, h.rDir, h.rPalm, aimQ, h.curl, !h.melee);
  if (h.l) {
    solveArm(b.lArm, b.lFore, b.lHand, wp(c.fore), wp(c.lPole));
    gripHand(b.lHand, b.lFingers, h.lDir, h.lPalm, aimQ, h.curl);
  }
}

// Turn the hand so its knuckles point along `dir` and its palm faces `palm` (aim space), then curl the
// fingers around the grip. Which side is the palm is measured once per hand: curl the fingers and see
// which way the fingertips move.
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
function frame(m, a, b) {
  _x.copy(a).normalize();
  _z.crossVectors(_x, b).normalize();
  _y.crossVectors(_z, _x);
  return m.makeBasis(_x, _y, _z);
}
// Fingers close around the grip; on the shooting hand the index finger stays nearly straight on the trigger
// and the thumb wraps the other side of the grip
function curlFingers(f, curl, trigger = false) {
  for (const j of f.joints) {
    let a = curl * (j.root ? 0.8 : 1);
    if (j.thumb) a = curl * (j.root ? 0.15 : 0.35);
    else if (j.index && trigger) a = j.root ? 0.35 : 0.7; // hooked through the guard onto the trigger
    j.bone.rotation.z = a;
  }
}
function measurePalm(hand, f) {
  const tip = f.joints.find((j) => !j.root && /finger2/i.test(j.bone.name))?.bone || f.joints[f.joints.length - 1]?.bone;
  if (!tip) return null;
  const saved = f.joints.map((j) => j.bone.quaternion.clone());
  hand.updateMatrixWorld(true);
  const open = hand.worldToLocal(tip.getWorldPosition(new THREE.Vector3()));
  curlFingers(f, 1.2); hand.updateMatrixWorld(true);
  const closed = hand.worldToLocal(tip.getWorldPosition(new THREE.Vector3()));
  f.joints.forEach((j, i) => j.bone.quaternion.copy(saved[i])); hand.updateMatrixWorld(true);
  const mid = f.mid.position.clone().normalize();          // knuckle direction in hand space
  const palm = closed.sub(open);
  return { mid, palm: palm.sub(mid.clone().multiplyScalar(palm.dot(mid))).normalize() };
}
function gripHand(hand, f, dir, palm, aimQ, curl, trigger = false) {
  if (!f.mid) return;
  f.local ||= measurePalm(hand, f);
  if (!f.local) return;
  const hq = hand.getWorldQuaternion(new THREE.Quaternion());
  const a = f.local.mid.clone().applyQuaternion(hq), p = f.local.palm.clone().applyQuaternion(hq);
  const A = new THREE.Vector3().fromArray(dir).applyQuaternion(aimQ);
  const P = new THREE.Vector3().fromArray(palm).applyQuaternion(aimQ);
  frame(_m1, a, p); frame(_m2, A, P);
  const rot = new THREE.Quaternion().setFromRotationMatrix(_m2.multiply(_m1.transpose()));
  hand.getWorldQuaternion(_qw).premultiply(rot);
  hand.parent.getWorldQuaternion(_qp);
  hand.quaternion.copy(_qp.invert().multiply(_qw));
  curlFingers(f, curl, trigger);
  hand.updateMatrixWorld(true);
}

const _animateProcedural = animateCharacter;
export function animate(c, speed, t, dt) {
  if (c.soldier) updateSoldier(c, speed, dt);
  else _animateProcedural(c, speed, t, dt);
}

// First-person body: the player's own character, placed so its eyes sit at the view-model camera,
// head hidden, arms solved onto the view-model weapon. What you see are your character's real sleeves and hands.
export function buildFirstPerson(characterId, cosmetics = {}, color = 0xffffff) {
  const c = buildSoldier(color, 0, characterId, cosmetics);
  c.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  c.root.updateMatrixWorld(true);
  const headY = c.bones.head ? c.bones.head.getWorldPosition(new THREE.Vector3()).y : 1.65;
  if (c.bones.head) c.bones.head.scale.setScalar(0.001); // hides the head and helmet from the inside
  // Face, hair and lashes off; anything closer than 24 cm to the eye (collar, hood, shoulders) is clipped away,
  // so only the arms reaching for the weapon are drawn. Needs renderer.localClippingEnabled.
  const near = new THREE.Plane(new THREE.Vector3(0, 0, -1), -0.24);
  c.root.traverse((o) => {
    if (!o.isMesh) return;
    if (/head|opacity|hair/i.test(o.material.name)) o.visible = false;
    o.material.clippingPlanes = [near];
  });
  c.eye = headY + 0.06;
  c.fpZ = -0.2;
  c.root.position.set(0, -c.eye - 0.09, c.fpZ); // shoulders ahead of and below the eye: hands reach the grip, chest stays out of view
  c.fpBlade = -0.7;
  c.fp = true;
  c.weapon = null;
  return c;
}

const _hold = new THREE.Vector3();
// Keep the arms on the view-model gun: the aim pivot follows the weapon root (grip at its origin)
export function updateFirstPerson(c, vmRoot, weapon, speed, dt) {
  if (weapon !== c.weapon) { setHold(c, weapon); c.weapon = weapon; }
  c.root.position.z = c.fpZ; // fitReach moves it forward again if the arms are short
  c.aim.quaternion.copy(vmRoot.quaternion);
  _hold.fromArray(c.hold.gun).applyQuaternion(vmRoot.quaternion);
  c.aim.position.copy(vmRoot.position).sub(c.root.position).sub(_hold);
  updateSoldier(c, speed, dt);
}
