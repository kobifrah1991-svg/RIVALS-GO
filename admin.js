// Server-side admin system (PROJECT_PLAN stage D).
// Roles come only from verified identities (Google email) or the operator's secret ADMIN_CODE,
// never from player names or anything the client claims. Every attempt is written to an audit log.
import fs from 'node:fs';
import path from 'node:path';
import { WEAPONS } from './shared/weapons.js';
import { MAP } from './shared/map.js';
import { filterChat } from './shared/chatfilter.js';

export const ROLES = ['Player', 'Moderator', 'Admin', 'Owner'];
const rank = (role) => Math.max(0, ROLES.indexOf(role));

// Minimum role and argument rules per command
const COMMANDS = {
  whoami: { role: 'Player', usage: '/whoami' },
  announce: { role: 'Moderator', usage: '/announce <message>' },
  kick: { role: 'Moderator', usage: '/kick <player> [reason]' },
  heal: { role: 'Admin', usage: '/heal <player> [1-100]' },
  sethealth: { role: 'Admin', usage: '/sethealth <player> <1-100>' },
  giveweapon: { role: 'Admin', usage: `/giveweapon <player> <${Object.keys(WEAPONS).join('|')}>` },
  teleport: { role: 'Admin', usage: '/teleport <player> <spawn 1-12 | player>' },
  ban: { role: 'Admin', usage: '/ban <player> [minutes] <reason>' },
  givemoney: { role: 'Owner', usage: '/givemoney <player> <1-10000>' },
};

export function createAdmin({ dataDir, rooms, sessions, economy }) {
  fs.mkdirSync(dataDir, { recursive: true });
  const auditFile = path.join(dataDir, 'admin-audit.log');
  const bansFile = path.join(dataDir, 'bans.json');

  // admins.json: { "someone@gmail.com": "Admin", ... }  (kept out of git)
  let staff = {};
  try { staff = JSON.parse(fs.readFileSync(path.join(dataDir, 'admins.json'), 'utf8')); } catch { /* none configured */ }
  const ADMIN_CODE = process.env.ADMIN_CODE || '';

  let bans = [];
  try { bans = JSON.parse(fs.readFileSync(bansFile, 'utf8')); } catch { /* no bans yet */ }
  const saveBans = () => fs.writeFileSync(bansFile, JSON.stringify(bans, null, 2));

  function audit(sess, action, target, value, result) {
    const entry = {
      time: new Date().toISOString(),
      admin: sess.user?.email || (sess.codeLogin ? 'admin-code' : 'guest'),
      role: sess.role,
      ip: sess.ip,
      room: sess.room?.code || null,
      action, target: target ?? null, value: value ?? null, result,
    };
    fs.appendFile(auditFile, JSON.stringify(entry) + '\n', () => {});
  }

  const reply = (sess, key, p) => sess.send({ t: 'chat', sys: true, key, p });

  function setRole(sess, role) {
    sess.role = ROLES.includes(role) ? role : 'Player';
    sess.send({ t: 'role', role: sess.role });
  }

  // Called after Google sign-in (or as a guest) to assign the session's role
  function onAuth(sess) {
    setRole(sess, sess.user ? staff[sess.user.email] || 'Player' : 'Player');
  }

  function activeBan(sess) {
    const now = Date.now();
    bans = bans.filter((b) => b.until > now);
    return bans.find((b) => (sess.user && b.email && b.email === sess.user.email) || (b.ip && b.ip === sess.ip)) || null;
  }

  // Operator login with the secret ADMIN_CODE (for servers without Google sign-in)
  function codeLogin(sess, code) {
    sess.codeTries = (sess.codeTries || []).filter((t) => Date.now() - t < 60000);
    if (!ADMIN_CODE || sess.codeTries.length >= 3 || String(code) !== ADMIN_CODE) {
      sess.codeTries.push(Date.now());
      audit(sess, 'adminlogin', null, null, 'denied');
      reply(sess, 'admin.loginFail');
      return;
    }
    sess.codeLogin = true;
    setRole(sess, 'Owner');
    audit(sess, 'adminlogin', null, null, 'ok');
    reply(sess, 'admin.role', { roleKey: 'role.Owner' });
  }

  function findTarget(sess, name) {
    const game = sess.room?.game;
    return game ? game.admin.find(name) : null;
  }
  const sessionOf = (player) => [...sessions].find((s) => s.conn?.player() === player);

  function handle(sess, cmd, args) {
    cmd = String(cmd || '').toLowerCase();
    args = Array.isArray(args) ? args.map((a) => String(a).slice(0, 200)).slice(0, 20) : [];
    if (cmd === 'adminlogin') return codeLogin(sess, args[0]);
    const def = COMMANDS[cmd];
    if (!def) { reply(sess, 'admin.unknown'); return; }
    if (rank(sess.role) < rank(def.role)) {
      audit(sess, cmd, args[0], args.slice(1).join(' '), 'denied');
      reply(sess, 'admin.denied');
      return;
    }
    // Rate limit: 10 commands per 10 seconds per admin
    sess.adminTimes = (sess.adminTimes || []).filter((t) => Date.now() - t < 10000);
    if (sess.adminTimes.length >= 10) { reply(sess, 'admin.rate'); return; }
    sess.adminTimes.push(Date.now());

    const bad = () => { reply(sess, 'admin.badArgs', { usage: def.usage }); audit(sess, cmd, args[0], args.slice(1).join(' '), 'bad-args'); };
    const done = (target, value) => { reply(sess, 'admin.ok', { actionKey: 'admin.act.' + cmd, target }); audit(sess, cmd, target, value, 'ok'); };
    const fail = (target, value) => { reply(sess, 'admin.noTarget'); audit(sess, cmd, target, value, 'failed'); };

    if (cmd === 'whoami') { reply(sess, 'admin.role', { roleKey: 'role.' + sess.role }); return; }

    if (cmd === 'announce') {
      const text = filterChat(args.join(' ')).text;
      if (!text) return bad();
      for (const room of rooms.values()) room.game.admin.announce(text);
      return done('*', text);
    }

    const name = args[0];
    const target = findTarget(sess, name);
    if (!name) return bad();
    if (!target) return fail(name, args.slice(1).join(' '));
    const game = sess.room.game;

    switch (cmd) {
      case 'heal': {
        const n = args[1] === undefined ? 100 : Number(args[1]);
        if (!Number.isInteger(n) || n < 1 || n > 100) return bad();
        return game.admin.heal(target, n) ? done(target.name, n) : fail(target.name, n);
      }
      case 'sethealth': {
        const n = Number(args[1]);
        if (!Number.isInteger(n) || n < 1 || n > 100) return bad();
        return game.admin.setHealth(target, n) ? done(target.name, n) : fail(target.name, n);
      }
      case 'giveweapon': {
        const w = String(args[1] || '').toLowerCase();
        if (!WEAPONS[w]) return bad();
        return game.admin.giveWeapon(target, w) ? done(target.name, w) : fail(target.name, w);
      }
      case 'teleport': {
        const dest = /^\d+$/.test(args[1] || '') ? MAP.spawns[Number(args[1]) - 1] : game.admin.find(args[1])?.p;
        if (!dest) return bad();
        const spot = [dest[0] + (/^\d+$/.test(args[1]) ? 0 : 1.2), dest[1], dest[2]];
        return game.admin.teleport(target, spot) ? done(target.name, args[1]) : fail(target.name, args[1]);
      }
      case 'kick': {
        const victim = sessionOf(target);
        if (!victim || target.bot) return fail(target.name);
        if (rank(victim.role) >= rank(sess.role)) { reply(sess, 'admin.denied'); return audit(sess, cmd, target.name, null, 'denied-rank'); }
        const reason = filterChat(args.slice(1).join(' ')).text || '-';
        victim.send({ t: 'kicked', key: 'admin.kicked', p: { reason } });
        setTimeout(() => victim.ws.close(), 100);
        return done(target.name, reason);
      }
      case 'ban': {
        const victim = sessionOf(target);
        if (!victim || target.bot) return fail(target.name);
        if (rank(victim.role) >= rank(sess.role)) { reply(sess, 'admin.denied'); return audit(sess, cmd, target.name, null, 'denied-rank'); }
        const hasMinutes = /^\d+$/.test(args[1] || '');
        const minutes = hasMinutes ? Number(args[1]) : 60;
        const reason = filterChat(args.slice(hasMinutes ? 2 : 1).join(' ')).text;
        if (!reason || minutes < 1 || minutes > 525600) return bad();
        // Signed-in players are banned by account; only guests fall back to IP (shared networks!)
        bans.push({ email: victim.user?.email || null, ip: victim.user ? null : victim.ip, until: Date.now() + minutes * 60000, reason, by: sess.user?.email || 'admin-code' });
        saveBans();
        victim.send({ t: 'kicked', key: 'admin.banned', p: { reason } });
        setTimeout(() => victim.ws.close(), 100);
        return done(target.name, `${minutes}m ${reason}`);
      }
      case 'givemoney': {
        const n = Number(args[1]);
        if (!Number.isInteger(n) || n < 1 || n > 10000) return bad();
        // Currency only moves through the economy service, into the target's account
        const victim = sessionOf(target);
        const accId = victim && economy?.accountId(victim);
        if (!accId) { reply(sess, 'admin.noEconomy'); return audit(sess, cmd, target.name, n, 'no-account'); }
        if (!economy.grant(accId, n)) return bad();
        victim.send({ t: 'profile', profile: economy.profile(economy.get(accId)) });
        victim.send({ t: 'chat', sys: true, key: 'shop.granted', p: { n } });
        return done(target.name, n);
      }
    }
  }

  return { handle, onAuth, activeBan };
}
