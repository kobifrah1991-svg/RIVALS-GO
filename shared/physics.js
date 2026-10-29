// Movement + collision shared by the client (prediction), the server (bots, validation).
export const PLAYER = {
  radius: 0.4,
  height: 1.8,
  eye: 1.6,
  headBase: 1.4,   // body hitbox ends here, head hitbox starts
  speed: 7.5,
  adsSpeed: 4.2,
  jump: 8,
  gravity: 22,
  stepUp: 0.46,
  maxHp: 100,
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

// Can a player at p rise to stance `to` (enough headroom)?
export const canStance = (p, to, boxes) => !collides(p[0], p[1] + 0.01, p[2], boxes, stanceOf(to).height);

// state: {p:[x,y,z], v:[x,y,z], onGround, stance}, input: {f, s, jump, yaw, ads}
export function step(state, input, dt, boxes) {
  const p = state.p, v = state.v;
  const st = stanceOf(state.stance), H = st.height;
  const speed = (input.ads ? PLAYER.adsSpeed : PLAYER.speed) * st.speed;
  let f = input.f || 0, s = input.s || 0;
  const len = Math.hypot(f, s);
  if (len > 1) { f /= len; s /= len; }
  const sy = Math.sin(input.yaw), cy = Math.cos(input.yaw);
  // forward = (-sin, 0, -cos), right = (cos, 0, -sin)
  const tx = (-sy * f + cy * s) * speed;
  const tz = (-cy * f - sy * s) * speed;
  const accel = state.onGround ? 14 : 4;
  v[0] += (tx - v[0]) * Math.min(1, accel * dt);
  v[2] += (tz - v[2]) * Math.min(1, accel * dt);
  if (input.jump && state.onGround && !state.stance) { v[1] = PLAYER.jump; state.onGround = false; }
  v[1] -= PLAYER.gravity * dt;

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
