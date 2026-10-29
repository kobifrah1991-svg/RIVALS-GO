// Arena Rush match simulation: players, server-authoritative combat, bots and chat.
// Runs inside the Node server (server.js, one instance per room) and, for offline practice, inside the browser.
import { MAP } from './map.js';
import { WEAPONS, WEAPON_ORDER, damageAt } from './weapons.js';
import { PLAYER, step, rayBox, rayWorld, hitboxes, dirFromAngles, collides, stanceOf, canStance } from './physics.js';
import { filterChat, cleanName, QUICK_CHAT } from './chatfilter.js';
import { CHARACTERS, characterById } from './characters.js';
import { itemById } from './shop.js';

// Each call creates an independent match (one per room).
// Game modes. Team modes start from a lobby (choose team, ready up) and have no bots.
export const MODES = {
  ffa: { teams: false, perTeam: 12, killLimit: 25 },
  duel: { teams: true, perTeam: 1, killLimit: 10 },
  team2: { teams: true, perTeam: 2, killLimit: 15 },
};
const TEAM_COLORS = { A: 0x40c4ff, B: 0xff1744 };

export function createGame(opts = {}) {
  const mode = MODES[opts.mode] ? opts.mode : 'ffa';
  const M = MODES[mode];
  const config = { bots: M.teams ? 0 : (opts.bots ?? 4), mode }; // bots fill up to this many fighters
  const TICK = 1 / 30;
  const SNAP_EVERY = 2;              // snapshots at 15 Hz
  const MAX_PLAYERS = M.teams ? M.perTeam * 2 : 12;
  const MATCH_SECONDS = 300;
  const KILL_LIMIT = M.killLimit;
  const RESPAWN_SECONDS = 3;
  const SPAWN_PROTECT = 1.5;
  const COLORS = [0xff2e88, 0x00e5ff, 0xffd600, 0x76ff03, 0xff6d00, 0xd500f9, 0x40c4ff, 0xff1744, 0x1de9b6, 0xf50057, 0xc6ff00, 0x651fff];
  const STREAKS = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 5: 'RAMPAGE', 7: 'UNSTOPPABLE', 10: 'GODLIKE' };

  // ---------- state ----------
  const players = new Map(); // id -> player (humans and bots)
  let nextId = 1;
  let tick = 0;
  const match = { state: M.teams ? 'lobby' : 'playing', endsAt: Date.now() + MATCH_SECONDS * 1000, winner: null, countdownAt: 0 };
  const teamScore = { A: 0, B: 0 };

  function newPlayer(name, bot = false) {
    const used = new Set([...players.values()].map((p) => p.color));
    const p = {
      id: (bot ? 'b' : 'p') + nextId++,
      name, bot, ws: null,
      color: COLORS.find((c) => !used.has(c)) ?? COLORS[nextId % COLORS.length],
      p: [0, 0, 0], v: [0, 0, 0], onGround: true, yaw: 0, pitch: 0,
      hp: PLAYER.maxHp, alive: false, respawnAt: Date.now() + 500, protectUntil: 0,
      stance: 0, weapon: 'rifle', ammo: {}, reloadUntil: 0, lastShot: {}, lastHurt: 0,
      kills: 0, deaths: 0, streak: 0, heads: 0, team: null, ready: false,
      history: [], rtt: 80, lastState: Date.now(), chatTimes: [], strikes: 0, mutedUntil: 0,
      ai: bot ? { wp: null, stuck: 0, target: null, seenAt: 0, strafe: 1, strafeT: 0, jumpT: 0, aimErr: 0 } : null,
    };
    refill(p);
    players.set(p.id, p);
    return p;
  }

  const refill = (p) => { for (const k of WEAPON_ORDER) p.ammo[k] = WEAPONS[k].mag; };
  const humans = () => [...players.values()].filter((p) => !p.bot);
  const send = (p, msg) => { if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg)); };
  const broadcast = (msg, except) => { const s = JSON.stringify(msg); for (const p of players.values()) if (p !== except && p.ws && p.ws.readyState === 1) p.ws.send(s); };
  // System messages carry a key and neutral params; each client shows them in its own language
  const sys = (key, p = {}) => broadcast({ t: 'chat', sys: true, key, p });
  const tell = (pl, key, p = {}) => send(pl, { t: 'chat', sys: true, key, p });

  function roster() {
    return [...players.values()].map((p) => ({ id: p.id, name: p.name, bot: p.bot, color: p.color, kills: p.kills, deaths: p.deaths, ping: p.bot ? 0 : Math.round(p.rtt), character: p.character, team: p.team, ready: p.ready, cosmetics: p.cosmetics || {} }));
  }
  const sendRoster = () => broadcast({ t: 'roster', players: roster(), mode, teamScore: M.teams ? teamScore : null });

  // ---------- teams & lobby ----------
  const teamOf = (team) => [...players.values()].filter((p) => p.team === team);
  function assignTeam(p, team) {
    p.team = team;
    p.color = TEAM_COLORS[team];
    p.ready = false;
  }
  function smallerTeam() {
    const a = teamOf('A').length, b = teamOf('B').length;
    if (a >= M.perTeam && b >= M.perTeam) return null;
    return a <= b ? 'A' : 'B';
  }
  function lobbyState() {
    return { t: 'lobby', mode, perTeam: M.perTeam, state: match.state, countdownAt: match.countdownAt, players: roster() };
  }
  const sendLobby = () => broadcast(lobbyState());
  // Ready when every player is ready, both teams have someone and team sizes match
  function checkStart() {
    if (match.state !== 'lobby') return;
    const a = teamOf('A'), b = teamOf('B');
    const ok = a.length > 0 && a.length === b.length && [...players.values()].every((p) => p.ready);
    match.countdownAt = ok ? Date.now() + 3000 : 0;
    sendLobby();
  }
  function startTeamMatch() {
    match.state = 'playing';
    match.countdownAt = 0;
    match.endsAt = Date.now() + MATCH_SECONDS * 1000;
    teamScore.A = teamScore.B = 0;
    for (const p of players.values()) { p.kills = 0; p.deaths = 0; p.heads = 0; spawn(p); }
    broadcast({ t: 'match', state: 'playing', endsAt: match.endsAt, mode });
    sendRoster();
    sys('sys.matchStart', { n: KILL_LIMIT });
  }

  function pickSpawn(p) {
    const enemies = [...players.values()].filter((o) => o !== p && o.alive && (!M.teams || o.team !== p.team));
    let best = MAP.spawns[0], bestScore = -1;
    // Team modes: each team starts on its own side of the arena
    const side = !M.teams ? MAP.spawns : MAP.spawns.filter((s) => (p.team === 'A' ? s[0] <= 0 : s[0] >= 0));
    for (const s of side) {
      let d = 1e9;
      for (const e of enemies) d = Math.min(d, Math.hypot(e.p[0] - s[0], e.p[2] - s[2]));
      const score = d + Math.random() * 6;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  function spawn(p) {
    const s = pickSpawn(p);
    p.p = [s[0], s[1], s[2]]; p.v = [0, 0, 0];
    p.yaw = Math.atan2(s[0], s[2]); // face the centre
    p.pitch = 0;
    p.hp = PLAYER.maxHp; p.alive = true; p.streak = 0; p.stance = 0;
    p.protectUntil = Date.now() + SPAWN_PROTECT * 1000;
    p.reloadUntil = 0; refill(p);
    p.history = [];
    send(p, { t: 'spawn', p: p.p, yaw: p.yaw, ammo: p.ammo });
  }

  // ---------- combat ----------
  function positionAt(p, t) {
    const h = p.history;
    if (!h.length) return p.p;
    if (t >= h[h.length - 1].t) return h[h.length - 1].p;
    for (let i = h.length - 1; i > 0; i--) {
      const a = h[i - 1], b = h[i];
      if (a.t <= t) {
        const k = (t - a.t) / Math.max(1, b.t - a.t);
        return [a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k];
      }
    }
    return h[0].p;
  }

  function fire(shooter, wKey, origin, dirs) {
    const w = WEAPONS[wKey];
    const now = Date.now();
    if (!w || !shooter.alive || match.state !== 'playing') return;
    if (now < shooter.reloadUntil) return;
    if (now - (shooter.lastShot[wKey] || 0) < w.rate * 1000 * 0.85) return; // rate-of-fire check
    if (shooter.ammo[wKey] <= 0) return;
    if (!Array.isArray(dirs) || dirs.length < 1 || dirs.length > w.pellets) return;
    shooter.lastShot[wKey] = now;
    shooter.ammo[wKey]--;
    shooter.weapon = wKey;
    shooter.protectUntil = 0; // firing ends spawn protection

    // The shot must start at the shooter's eye (small tolerance for latency)
    const eye = [shooter.p[0], shooter.p[1] + stanceOf(shooter.stance).eye, shooter.p[2]];
    const o = (Array.isArray(origin) && origin.length === 3 && origin.every(Number.isFinite) &&
      Math.hypot(origin[0] - eye[0], origin[1] - eye[1], origin[2] - eye[2]) < 2.5) ? origin : eye;

    // Lag compensation: rewind targets to what the shooter saw
    const rewind = shooter.bot ? 0 : Math.min(300, shooter.rtt / 2 + 100);
    const tShot = now - rewind;
    const targets = [...players.values()].filter((t) => t !== shooter && t.alive && (!M.teams || t.team !== shooter.team)).map((t) => ({ t, pos: positionAt(t, tShot) }));

    const ends = [];
    const dmgBy = new Map();
    for (const raw of dirs) {
      if (!Array.isArray(raw) || raw.length !== 3 || !raw.every(Number.isFinite)) continue;
      const l = Math.hypot(raw[0], raw[1], raw[2]);
      if (l < 0.5 || l > 1.5) continue;
      const d = [raw[0] / l, raw[1] / l, raw[2] / l];
      const wall = rayWorld(o, d, MAP.boxes, w.range);
      let best = wall, hitT = null, head = false;
      for (const { t, pos } of targets) {
        const hb = hitboxes(pos, t.stance, t.yaw);
        const th = rayBox(o, d, hb.head[0], hb.head[1], best);
        if (th !== null && th < best) { best = th; hitT = t; head = true; }
        const tb = rayBox(o, d, hb.body[0], hb.body[1], best);
        if (tb !== null && tb < best) { best = tb; hitT = t; head = false; }
      }
      ends.push([o[0] + d[0] * best, o[1] + d[1] * best, o[2] + d[2] * best, hitT ? 1 : 0]);
      if (hitT) {
        const e = dmgBy.get(hitT) || { dmg: 0, head: false, at: null };
        e.dmg += damageAt(w, best, head);
        e.head = e.head || head;
        e.at = ends[ends.length - 1].slice(0, 3);
        dmgBy.set(hitT, e);
      }
    }
    broadcast({ t: 'shot', id: shooter.id, w: wKey, o, ends }, shooter);
    for (const [target, e] of dmgBy) applyDamage(shooter, target, e.dmg, e.head, wKey, e.at);
  }

  // Knife: nearest enemy in a short arc in front, in line of sight. Hits from behind kill outright.
  function melee(attacker, yaw, pitch) {
    const w = WEAPONS.knife, now = Date.now();
    if (!attacker.alive || match.state !== 'playing') return;
    if (now - (attacker.lastShot.knife || 0) < w.rate * 1000 * 0.85) return;
    attacker.lastShot.knife = now;
    attacker.weapon = 'knife';
    attacker.protectUntil = 0;
    if (Number.isFinite(yaw)) attacker.yaw = yaw;
    if (Number.isFinite(pitch)) attacker.pitch = Math.max(-1.55, Math.min(1.55, pitch));
    const fwd = dirFromAngles(attacker.yaw, attacker.pitch);
    const eye = [attacker.p[0], attacker.p[1] + stanceOf(attacker.stance).eye, attacker.p[2]];
    const tHit = now - (attacker.bot ? 0 : Math.min(300, attacker.rtt / 2 + 100));
    let best = null, bestDist = w.range;
    for (const t of players.values()) {
      if (t === attacker || !t.alive || (M.teams && t.team === attacker.team)) continue;
      const pos = positionAt(t, tHit);
      const c = [pos[0], pos[1] + stanceOf(t.stance).height * 0.6, pos[2]];
      const d = [c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]];
      const dist = Math.hypot(d[0], d[1], d[2]);
      if (dist > bestDist + 0.4) continue; // body radius
      const dot = (d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2]) / Math.max(dist, 0.01);
      if (dot < w.arc) continue;
      if (rayWorld(eye, d.map((v) => v / dist), MAP.boxes, dist) < dist - 0.05) continue;
      best = { t, dist, pos };
      bestDist = dist;
    }
    broadcast({ t: 'swing', id: attacker.id }, attacker);
    if (!best) return;
    // Backstab: the target looks the same way we are attacking (we are behind them)
    const tf = [-Math.sin(best.t.yaw), -Math.cos(best.t.yaw)];
    const dx = best.pos[0] - attacker.p[0], dz = best.pos[2] - attacker.p[2], dl = Math.hypot(dx, dz) || 1;
    const back = (tf[0] * dx + tf[1] * dz) / dl > 0.5;
    const dmg = Math.round(w.damage * (back ? w.backstabMul : 1));
    applyDamage(attacker, best.t, dmg, false, 'knife', [best.pos[0], best.pos[1] + 1.2, best.pos[2]], back);
  }

  function applyDamage(attacker, target, dmg, head, wKey, at, backstab = false) {
    if (!target.alive || Date.now() < target.protectUntil) return;
    if (M.teams && attacker !== target && attacker.team === target.team) return; // no friendly fire
    target.hp -= dmg;
    target.lastHurt = Date.now();
    const kill = target.hp <= 0;
    send(attacker, { t: 'hit', target: target.id, dmg, head, kill, at, backstab });
    send(target, { t: 'hurt', by: attacker.id, hp: Math.max(0, target.hp), from: attacker.p });
    if (target.bot && target.ai) { target.ai.target = attacker.id; target.ai.seenAt = Date.now(); }
    if (kill) onKill(attacker, target, wKey, head, backstab);
  }

  function onKill(killer, victim, wKey, head, backstab = false) {
    victim.alive = false; victim.hp = 0; victim.deaths++; victim.streak = 0;
    victim.respawnAt = Date.now() + RESPAWN_SECONDS * 1000;
    killer.kills++; killer.streak++;
    if (head) killer.heads++;
    // Kill reward: heal a little so aggressive play feels good
    if (killer.alive) killer.hp = Math.min(PLAYER.maxHp, killer.hp + 25);
    const streakName = STREAKS[killer.streak] || null;
    if (M.teams && killer.team) teamScore[killer.team]++;
    broadcast({ t: 'kill', killer: killer.id, victim: victim.id, w: wKey, head, backstab, streak: killer.streak, streakName, pos: victim.p });
    if (killer.streak >= 5 && streakName) sys('sys.streak', { name: killer.name, streak: streakName, n: killer.streak });
    sendRoster();
    if (M.teams ? teamScore[killer.team] >= KILL_LIMIT : killer.kills >= KILL_LIMIT) endMatch(killer);
  }

  function endMatch(winner, forceTeam = null) {
    if (match.state !== 'playing') return;
    const board = roster().sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    let winTeam = null;
    if (M.teams) {
      winTeam = forceTeam || (winner?.team) || (teamScore.A === teamScore.B ? null : teamScore.A > teamScore.B ? 'A' : 'B');
      winner = null;
    } else winner = winner || players.get(board[0]?.id);
    match.state = 'ended';
    match.winner = winner ? winner.id : null;
    match.endsAt = Date.now() + 10000;
    broadcast({ t: 'match', state: 'ended', winner: match.winner, winnerName: winner?.name, winTeam, teamScore: M.teams ? teamScore : null, board, next: match.endsAt, mode });
    // Hand the results to the host (server.js pays rewards); humans only
    opts.onMatchEnd?.(humans().map((p) => ({ player: p, kills: p.kills, heads: p.heads, won: M.teams ? !!winTeam && p.team === winTeam : p.id === match.winner })));
  }

  function newMatch() {
    if (M.teams) {
      // Team modes go back to the lobby; everyone readies up again
      match.state = 'lobby';
      for (const p of players.values()) { p.ready = false; p.alive = false; }
      broadcast({ t: 'match', state: 'lobby', mode });
      sendRoster();
      sendLobby();
      return;
    }
    match.state = 'playing';
    match.winner = null;
    match.endsAt = Date.now() + MATCH_SECONDS * 1000;
    for (const p of players.values()) { p.kills = 0; p.deaths = 0; p.heads = 0; spawn(p); }
    broadcast({ t: 'match', state: 'playing', endsAt: match.endsAt });
    sendRoster();
    sys('sys.newRound', { n: KILL_LIMIT });
  }

  // ---------- bots ----------
  const BOT_NAMES = ['Neon', 'Blitz', 'Turbo', 'Pixel', 'Robo', 'Shadow', 'Spark', 'Comet', 'Galaxy', 'Rainbow'];
  function balanceBots() {
    const total = players.size;
    const bots = [...players.values()].filter((p) => p.bot);
    const want = humans().length ? Math.max(0, config.bots - humans().length) : 0;
    if (bots.length < want && total < MAX_PLAYERS && humans().length > 0) {
      const used = new Set(bots.map((b) => b.name));
      const name = '🤖 ' + (BOT_NAMES.find((n) => !used.has('🤖 ' + n)) || 'Bot' + nextId);
      newPlayer(name, true).character = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].id;
      sendRoster();
    } else if (bots.length > want) {
      const b = bots[bots.length - 1];
      players.delete(b.id);
      broadcast({ t: 'leave', id: b.id });
      sendRoster();
    }
  }

  function lineOfSight(a, b) {
    const o = [a[0], a[1] + PLAYER.eye, a[2]];
    const tgt = [b[0], b[1] + 1.2, b[2]];
    const d = [tgt[0] - o[0], tgt[1] - o[1], tgt[2] - o[2]];
    const dist = Math.hypot(d[0], d[1], d[2]);
    d[0] /= dist; d[1] /= dist; d[2] /= dist;
    return rayWorld(o, d, MAP.boxes, dist) >= dist - 0.01;
  }

  function botThink(b, dt) {
    const ai = b.ai, now = Date.now();
    const input = { f: 0, s: 0, jump: false, yaw: b.yaw };
    // Pick the closest visible enemy
    let target = null, tDist = 45;
    for (const o of players.values()) {
      if (o === b || !o.alive || now < o.protectUntil) continue;
      const d = Math.hypot(o.p[0] - b.p[0], o.p[1] - b.p[1], o.p[2] - b.p[2]);
      const remembered = ai.target === o.id && now - ai.seenAt < 2000;
      if ((d < tDist || remembered) && lineOfSight(b.p, o.p)) { target = o; tDist = d; }
    }
    if (target) {
      if (ai.target !== target.id) { ai.reactAt = now + 500 + Math.random() * 500; ai.aimErr = 0.3; }
      ai.target = target.id; ai.seenAt = now;
      const dx = target.p[0] - b.p[0], dz = target.p[2] - b.p[2];
      const dy = target.p[1] + 0.9 - (b.p[1] + PLAYER.eye);
      const wantYaw = Math.atan2(-dx, -dz);
      const wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
      let dyaw = wantYaw - b.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      b.yaw += dyaw * Math.min(1, dt * 6);
      b.pitch += (wantPitch - b.pitch) * Math.min(1, dt * 6);
      ai.aimErr = Math.max(0.055, ai.aimErr - dt * 0.15);
      // Strafe while fighting, close distance if far
      ai.strafeT -= dt;
      if (ai.strafeT <= 0) { ai.strafe = Math.random() < 0.5 ? -1 : 1; ai.strafeT = 0.6 + Math.random() * 1.2; }
      input.s = ai.strafe;
      input.f = tDist > 18 ? 1 : tDist < 6 ? -0.6 : 0;
      input.yaw = b.yaw;
      const wKey = tDist < 7 ? 'shotgun' : 'rifle';
      if (b.ammo[wKey] <= 0 && now >= b.reloadUntil) { b.reloadUntil = now + WEAPONS[wKey].reload * 1000; b.ammo[wKey] = WEAPONS[wKey].mag; }
      if (now > ai.reactAt && Math.abs(dyaw) < 0.25) {
        const w = WEAPONS[wKey];
        const dirs = [];
        for (let i = 0; i < w.pellets; i++) {
          const err = ai.aimErr + w.spread;
          dirs.push(dirFromAngles(b.yaw + (Math.random() - 0.5) * err * 2, b.pitch + (Math.random() - 0.5) * err * 2));
        }
        fire(b, wKey, [b.p[0], b.p[1] + PLAYER.eye, b.p[2]], dirs);
      }
    } else {
      // Wander between waypoints
      if (!ai.wp || Math.hypot(ai.wp[0] - b.p[0], ai.wp[2] - b.p[2]) < 1.5 || ai.stuck > 1.2) {
        ai.wp = MAP.waypoints[Math.floor(Math.random() * MAP.waypoints.length)];
        ai.stuck = 0;
      }
      const dx = ai.wp[0] - b.p[0], dz = ai.wp[2] - b.p[2];
      const wantYaw = Math.atan2(-dx, -dz);
      let dyaw = wantYaw - b.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      b.yaw += dyaw * Math.min(1, dt * 5);
      b.pitch *= 0.9;
      input.f = 1; input.yaw = b.yaw;
      const speed = Math.hypot(b.v[0], b.v[2]);
      ai.stuck = speed < 1.5 ? ai.stuck + dt : 0;
      if (ai.stuck > 0.4) input.jump = true;
    }
    step(b, input, dt, MAP.boxes);
  }


  // ---------- connections ----------
  function connect(ws) {
    let me = null;
    function message(data) {
      let m;
      try { m = JSON.parse(data); } catch { return; }
      if (!m || typeof m.t !== 'string') return;

      if (m.t === 'join' && !me) {
        if (humans().length >= MAX_PLAYERS || (M.teams && !smallerTeam())) { ws.send(JSON.stringify({ t: 'full' })); ws.close(); return; }
        // Make room by removing a bot if the arena is full
        if (players.size >= MAX_PLAYERS) {
          const bot = [...players.values()].find((p) => p.bot);
          if (bot) { players.delete(bot.id); broadcast({ t: 'leave', id: bot.id }); }
        }
        me = newPlayer(cleanName(m.name));
        me.character = characterById(m.character).id;
        // Equipped cosmetics, already validated by the server's economy service
        me.cosmetics = {};
        for (const slot of ['outfit', 'camo']) if (typeof m.cosmetics?.[slot] === 'string' && itemById(m.cosmetics[slot])?.slot === slot) me.cosmetics[slot] = m.cosmetics[slot];
        me.ws = ws;
        // Rejoining after a drop: the server passes back the saved score and team
        const back = m.restore && typeof m.restore === 'object' ? m.restore : null;
        if (back) { me.kills = back.kills | 0; me.deaths = back.deaths | 0; me.heads = back.heads | 0; }
        if (M.teams) assignTeam(me, back && (back.team === 'A' || back.team === 'B') && teamOf(back.team).length < M.perTeam ? back.team : smallerTeam());
        send(me, { t: 'welcome', id: me.id, color: me.color, match: { state: match.state, endsAt: match.endsAt }, killLimit: KILL_LIMIT, quick: QUICK_CHAT, mode, team: me.team });
        sendRoster();
        sys('sys.joined', { name: me.name });
        if (match.state === 'playing') spawn(me);
        if (M.teams) checkStart();
        return;
      }
      if (!me) return;

      switch (m.t) {
        case 'state': {
          if (!me.alive || !Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(Number.isFinite)) return;
          const now = Date.now();
          const dt = Math.min(0.5, (now - me.lastState) / 1000);
          me.lastState = now;
          // Speed sanity check: horizontal and vertical budgets with generous tolerance
          const dh = Math.hypot(m.p[0] - me.p[0], m.p[2] - me.p[2]);
          const dv = Math.abs(m.p[1] - me.p[1]);
          if (dh > PLAYER.speed * 1.6 * dt + 0.6 || dv > 14 * dt + 0.8) {
            send(me, { t: 'correct', p: me.p });
            return;
          }
          me.p = m.p;
          if (Number.isFinite(m.yaw)) me.yaw = m.yaw;
          if (Number.isFinite(m.pitch)) me.pitch = Math.max(-1.55, Math.min(1.55, m.pitch));
          if (WEAPONS[m.w]) me.weapon = m.w;
          // Stance: crouching or lying down is always allowed; getting up needs headroom
          if (m.st === 0 || m.st === 1 || m.st === 2) {
            if (m.st >= me.stance || canStance(me.p, m.st, MAP.boxes)) me.stance = m.st;
          }
          break;
        }
        case 'shoot':
          if (WEAPONS[m.w]?.melee) break;
          fire(me, m.w, m.o, m.dirs);
          break;
        case 'melee':
          melee(me, m.yaw, m.pitch);
          break;
        case 'team': {
          // Switch team in the lobby, if the other team has room
          if (!M.teams || match.state !== 'lobby' || (m.team !== 'A' && m.team !== 'B') || m.team === me.team) break;
          if (teamOf(m.team).length >= M.perTeam) break;
          assignTeam(me, m.team);
          sendRoster();
          checkStart();
          break;
        }
        case 'ready':
          if (!M.teams || match.state !== 'lobby') break;
          me.ready = !!m.v;
          sendRoster();
          checkStart();
          break;
        case 'reload': {
          const w = WEAPONS[m.w];
          if (!w || !me.alive || Date.now() < me.reloadUntil || me.ammo[m.w] >= w.mag) return;
          me.reloadUntil = Date.now() + w.reload * 1000 * 0.9;
          setTimeout(() => { if (players.has(me.id)) { me.ammo[m.w] = w.mag; send(me, { t: 'ammo', w: m.w, n: w.mag }); } }, w.reload * 1000 * 0.9);
          break;
        }
        case 'ping':
          send(me, { t: 'pong', c: m.c });
          break;
        case 'rtt':
          if (Number.isFinite(m.v)) me.rtt = Math.max(0, Math.min(1000, m.v));
          break;
        case 'chat':
          onChat(me, m.text);
          break;
        case 'quick':
          if (Number.isInteger(m.i) && QUICK_CHAT[m.i]) onChat(me, '', true, m.i);
          break;
        case 'rtc': {
          // Voice chat handshake (WebRTC offer/answer/ICE) relayed between two humans; the audio itself goes device to device
          const to = players.get(m.to);
          const now = Date.now();
          if (now - (me.rtcWindow || 0) > 1000) { me.rtcWindow = now; me.rtcCount = 0; }
          if (!to || to.bot || to === me || !m.data || typeof m.data !== 'object' || ++me.rtcCount > 40) break;
          if (JSON.stringify(m.data).length > 12000) break;
          send(to, { t: 'rtc', from: me.id, data: m.data });
          break;
        }
        case 'report': {
          const target = [...players.values()].find((p) => p.name === String(m.name || ''));
          console.log(`[REPORT] ${me.name} reported ${target ? target.name : m.name}: ${String(m.reason || '').slice(0, 100)}`);
          tell(me, 'sys.reportOk');
          break;
        }
      }
    }

    function close() {
      if (!me) return;
      players.delete(me.id);
      broadcast({ t: 'leave', id: me.id });
      sys('sys.left', { name: me.name });
      sendRoster();
      if (M.teams) {
        // A team emptied mid-match: give it 20 s to reconnect, then the other side wins
        if (match.state === 'playing') {
          setTimeout(() => {
            if (match.state === 'playing' && (teamOf('A').length === 0 || teamOf('B').length === 0)) endMatch(null, teamOf('A').length ? 'A' : 'B');
          }, opts.forfeitMs ?? 20000);
        } else checkStart();
      }
    }
    return { message, close, player: () => me };
  }

  function onChat(p, text, quick = false, quickIndex = -1) {
    const now = Date.now();
    if (now < p.mutedUntil) { tell(p, 'sys.muted'); return; }
    p.chatTimes = p.chatTimes.filter((t) => now - t < 5000);
    if (p.chatTimes.length >= 4) { tell(p, 'sys.slowDown'); return; }
    p.chatTimes.push(now);
    const { text: clean, flagged } = quick ? { text: 'q', flagged: false } : filterChat(text);
    if (!clean) return;
    if (flagged) {
      // Graduated enforcement (GDD §13): warning, then a temporary mute
      p.strikes++;
      if (p.strikes >= 3) { p.mutedUntil = now + 60000; p.strikes = 0; tell(p, 'sys.mutedMinute'); }
      else tell(p, 'sys.warning', { n: p.strikes });
    }
    // Quick messages travel as an index so each player reads them in their language
    broadcast(quick ? { t: 'chat', from: p.id, name: p.name, color: p.color, q: quickIndex, quick: true } : { t: 'chat', from: p.id, name: p.name, color: p.color, text: clean });
  }

  // ---------- main loop ----------
  let last = Date.now(), timer = null;
  function start() {
    if (timer) return;
    last = Date.now();
    timer = setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    tick++;

    if (match.state === 'lobby' && match.countdownAt && now >= match.countdownAt) startTeamMatch();
    if (match.state === 'playing' && now >= match.endsAt) endMatch(null);
    if (match.state === 'ended' && now >= match.endsAt) newMatch();
    if (tick % 15 === 0) balanceBots();

    for (const p of players.values()) {
      if (!p.alive) {
        if (match.state === 'playing' && now >= p.respawnAt) spawn(p);
        continue;
      }
      if (p.bot) botThink(p, dt);
      // Health regen after 5 s out of combat
      if (now - p.lastHurt > 5000 && p.hp < PLAYER.maxHp) p.hp = Math.min(PLAYER.maxHp, p.hp + 20 * dt);
      p.history.push({ t: now, p: [p.p[0], p.p[1], p.p[2]] });
      while (p.history.length && now - p.history[0].t > 1000) p.history.shift();
    }

    if (tick % SNAP_EVERY === 0 && players.size) {
      broadcast({
        t: 'snap', now,
        players: [...players.values()].filter((p) => p.alive).map((p) => ({
          id: p.id, p: p.p.map((n) => Math.round(n * 100) / 100), yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3), w: p.weapon, hp: Math.ceil(p.hp), sp: now < p.protectUntil ? 1 : 0, st: p.stance,
        })),
      });
    }
    }, TICK * 1000);
  }

  function stop() { clearInterval(timer); timer = null; }
  const humanCount = () => humans().length;
  // ---------- admin hooks ----------
  // These only perform actions. Who may call them is decided in server.js.
  const admin = {
    players: () => [...players.values()],
    find: (name) => [...players.values()].find((p) => p.name.toLowerCase() === String(name || '').toLowerCase()),
    heal(p, n) {
      if (!p.alive) return false;
      p.hp = Math.min(PLAYER.maxHp, p.hp + n);
      tell(p, 'admin.healed', { n });
      return true;
    },
    setHealth(p, n) {
      if (!p.alive) return false;
      p.hp = Math.max(1, Math.min(PLAYER.maxHp, n));
      return true;
    },
    giveWeapon(p, w) {
      if (!WEAPONS[w] || !p.alive) return false;
      p.ammo[w] = WEAPONS[w].mag;
      p.reloadUntil = 0;
      send(p, { t: 'ammo', w, n: WEAPONS[w].mag });
      return true;
    },
    // dest: [x, y, z]; refused if it would put the player inside a wall or off the map
    teleport(p, dest) {
      if (!p.alive || !Array.isArray(dest) || !dest.every(Number.isFinite)) return false;
      if (Math.abs(dest[0]) > 31 || Math.abs(dest[2]) > 31 || dest[1] < 0 || dest[1] > 10) return false;
      if (collides(dest[0], dest[1], dest[2], MAP.boxes)) return false;
      p.p = dest.slice();
      p.v = [0, 0, 0];
      p.history = [];
      send(p, { t: 'correct', p: p.p });
      return true;
    },
    announce: (text) => sys('admin.announce', { text }),
  };

  return { connect, start, stop, humanCount, config, admin, mode };
}
