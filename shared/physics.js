// Movement + collision shared by the client (prediction), the server (bots, validation).
export const PLAYER = {
  radius: 0.4,
  height: 1.8,
  eye: 1.6,
  headBase: 1.4,   // body hitbox ends here, head hitbox starts
  speed: 9,        // fast, RIVALS-like movement
  adsSpeed: 5.4,
  jump: 9.4,       // ~1.8 m jump
  padJump: 17,     // jump pads launch ~6 m up
  climb: 2.4,      // ledges up to this high above the feet can be climbed (jump into them)
  gravity: 25,
  slideBoost: 1.45, // crouch while running: a short slide that keeps momentum
  slideTime: 0.7,
  stepUp: 0.46,
  maxHp: 175,      // tougher than before: ~8 rifle body hits, 5 to the head; a backstab still kills
};

// Stances: 0 standing, 1 crouching, 2 prone. Height, eye level, head hitbox and speed for each.
export const STANCES = [
  { height: 1.8, eye: 1.6, headBase: 1.4, speed: 1 },
  { height: 1.2, eye: 1.08, headBase: 0.88, speed: 0.5 },
  { height: 0.6, eye: 0.42, headBase: 0.3, speed: 0.22 },
];
export const stanceOf = (s) => STANCES[s | 0] || STANCES[0];

function overlaps(x, y, z, b, h) {
  const r = PLAYER.radius;
  return x + r > b.min[0] && x - r < b.max[0] &&
    y + h > b.min[1] && y < b.max[1] &&
    z + r > b.min[2] && z - r < b.max[2];
}

export function collides(x, y, z, boxes, h = PLAYER.height) {
  for (const b of boxes) if (overlaps(x, y, z, b, h)) return b;
  return null;
}

// Ramps (MAP.ramps, attached to the boxes array): walkable slopes {min, max, axis: 'x'|'z', up: 1|-1}.
// The surface rises from min.y to max.y along `axis` in the `up` direction.
function rampY(r, x, z) {
  if (x < r.min[0] || x > r.max[0] || z < r.min[2] || z > r.max[2]) return -Infinity;
  const a = r.axis === 'x' ? 0 : 2, v = a === 0 ? x : z;
  let t = (v - r.min[a]) / (r.max[a] - r.min[a]);
  if (r.up < 0) t = 1 - t;
  return r.min[1] + t * (r.max[1] - r.min[1]);
}
export function floorAt(x, z, boxes) {
  let y = -Infinity;
  for (const r of boxes.ramps || []) y = Math.max(y, rampY(r, x, z));
  return y;
}
// Jump pads (MAP.pads): {x, y, z, r}
export const padAt = (p, boxes) => (boxes.pads || []).find((d) => Math.hypot(p[0] - d.x, p[2] - d.z) < d.r && Math.abs(p[1] - d.y) < 0.3);

// Can a player at p rise to stance `to` (enough headroom)?
export const canStance = (p, to, boxes) => !collides(p[0], p[1] + 0.01, p[2], boxes, stanceOf(to).height);

// state: {p:[x,y,z], v:[x,y,z], onGround, stance}, input: {f, s, jump, yaw, ads}
export function step(state, input, dt, boxes) {
  const p = state.p, v = state.v;
  const st = stanceOf(state.stance), H = st.height;
  const speed = (input.ads ? PLAYER.adsSpeed : PLAYER.speed) * st.speed * (input.boost || 1); // boost: speed pickup
  let f = input.f || 0, s = input.s || 0;
  const len = Math.hypot(f, s);
  if (len > 1) { f /= len; s /= len; }
  const sy = Math.sin(input.yaw), cy = Math.cos(input.yaw);
  // forward = (-sin, 0, -cos), right = (cos, 0, -sin)
  const tx = (-sy * f + cy * s) * speed;
  const tz = (-cy * f - sy * s) * speed;
  // Slide: starts when crouching at running speed, glides with low friction, then you are crouched
  const hs = Math.hypot(v[0], v[2]);
  if (input.slide && state.onGround && !(state.slideT > 0) && hs > PLAYER.speed * 0.7) {
    const k = Math.min(PLAYER.speed * PLAYER.slideBoost, hs * PLAYER.slideBoost) / hs;
    v[0] *= k; v[2] *= k;
    state.slideT = PLAYER.slideTime;
  }
  if (state.slideT > 0) {
    state.slideT -= dt;
    const fr = Math.max(0, 1 - 1.6 * dt);
    v[0] *= fr; v[2] *= fr;
  } else {
    const accel = state.onGround ? 18 : 6;
    v[0] += (tx - v[0]) * Math.min(1, accel * dt);
    v[2] += (tz - v[2]) * Math.min(1, accel * dt);
  }
  if (input.jump && state.onGround && !state.stance) { v[1] = PLAYER.jump; state.onGround = false; }
  // Jump pad: stepping on it launches you high (keeps your run-up speed)
  if (state.onGround && padAt(p, boxes)) { v[1] = PLAYER.padJump; state.onGround = false; state.padded = true; }
  v[1] -= PLAYER.gravity * dt;
  if (state.climbT > 0) state.climbT -= dt;
  state.wall = null;

  // Sub-step to avoid tunnelling on frame hitches
  const n = Math.max(1, Math.ceil(dt / 0.02));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    moveAxis(state, 0, v[0] * h, boxes, H);
    moveAxis(state, 2, v[2] * h, boxes, H);
    const dy = v[1] * h;
    p[1] += dy;
    const hit = collides(p[0], p[1], p[2], boxes, H);
    state.onGround = false;
    if (hit) {
      if (dy < 0) { p[1] = hit.max[1]; state.onGround = true; }
      else p[1] = hit.min[1] - H;
      v[1] = 0;
    } else if (dy <= 0 && collides(p[0], p[1] - 0.05, p[2], boxes, H)) {
      state.onGround = true;
    }
    // Ramps: stand on the slope; while walking down, stay glued to it instead of hopping
    const fy = floorAt(p[0], p[2], boxes);
    if (fy > -Infinity && v[1] <= 0.01 && p[1] < fy + (state.wasGround ? 0.35 : 0.02) && p[1] > fy - 0.7) {
      p[1] = fy; v[1] = 0; state.onGround = true;
    }
  }
  state.wasGround = state.onGround;
  // Climb: pressing forward into a ledge you can reach (jumping or in the air) pulls you up onto it
  const w = state.wall;
  if (w && !state.stance && !(state.climbT > 0) && (input.jump || !state.onGround) && (input.f || 0) > 0) {
    const rise = w.max[1] - p[1];
    const ahead = [p[0] - Math.sin(input.yaw) * 0.6, w.max[1] + 0.02, p[2] - Math.cos(input.yaw) * 0.6];
    if (rise > PLAYER.stepUp && rise <= PLAYER.climb && !collides(ahead[0], ahead[1], ahead[2], boxes, H)) {
      v[1] = Math.sqrt(2 * PLAYER.gravity * (rise + 0.3));
      state.climbT = 0.6;
      state.onGround = false;
    }
  }
  if (p[1] < -20) { p[1] = 2; v[1] = 0; } // safety net
}

function moveAxis(state, axis, d, boxes, H) {
  if (!d) return;
  const p = state.p;
  p[axis] += d;
  const hit = collides(p[0], p[1], p[2], boxes, H);
  if (!hit) return;
  // Try stepping up small ledges (stairs, kerbs)
  const rise = hit.max[1] - p[1];
  if (state.onGround && rise > 0 && rise <= PLAYER.stepUp && !collides(p[0], hit.max[1] + 0.001, p[2], boxes, H)) {
    p[1] = hit.max[1] + 0.001;
    return;
  }
  p[axis] -= d;
  state.v[axis] = 0;
  state.wall = hit; // remembered for climbing
}

// Ray vs AABB (slab method). Returns entry distance or null.
export function rayBox(o, d, min, max, maxDist = Infinity) {
  let tmin = 0, tmax = maxDist;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < min[i] || o[i] > max[i]) return null;
    } else {
      let t1 = (min[i] - o[i]) / d[i], t2 = (max[i] - o[i]) / d[i];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

export function rayWorld(o, d, boxes, maxDist) {
  let best = maxDist;
  for (const b of boxes) {
    const t = rayBox(o, d, b.min, b.max, best);
    if (t !== null && t < best) best = t;
  }
  return best;
}

export function hitboxes(p, stance = 0, yaw = 0) {
  const r = PLAYER.radius, hr = 0.26, st = stanceOf(stance);
  if (stance === 2) {
    // Lying down: a long low body along the facing direction, head in front
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), L = 0.8;
    const hx = p[0] + fx * 0.75, hz = p[2] + fz * 0.75;
    return {
      body: [[Math.min(p[0] - fx * L, p[0]) - r, p[1], Math.min(p[2] - fz * L, p[2]) - r], [Math.max(p[0] - fx * L, p[0]) + r, p[1] + st.headBase, Math.max(p[2] - fz * L, p[2]) + r]],
      head: [[hx - hr, p[1] + 0.1, hz - hr], [hx + hr, p[1] + st.height, hz + hr]],
    };
  }
  return {
    body: [[p[0] - r, p[1], p[2] - r], [p[0] + r, p[1] + st.headBase, p[2] + r]],
    head: [[p[0] - hr, p[1] + st.headBase, p[2] - hr], [p[0] + hr, p[1] + st.height + 0.05, p[2] + hr]],
  };
}

export function dirFromAngles(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}
