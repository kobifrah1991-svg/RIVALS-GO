// Arena Rush game server: static files + WebSocket transport around shared/game.js.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createGame, MODES } from './shared/game.js';
import { cleanName } from './shared/chatfilter.js';
import { createAdmin } from './admin.js';
import { createEconomy } from './economy.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const BOTS = process.env.BOTS !== undefined ? Number(process.env.BOTS) : 4;
// Google sign-in: create an OAuth "Web client ID" in Google Cloud Console and pass it here.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const ROOM_SIZE = 12;

// ---------- static files ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/health') { res.writeHead(200); res.end('ok'); return; }
  if (url === '/config') {
    // Readable from other servers' start screens, so players can compare servers
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ googleClientId: GOOGLE_CLIENT_ID, online: sessions.size, rooms: rooms.size }));
    return;
  }
  let base = path.join(ROOT, 'public'), rel = url === '/' ? 'index.html' : url;
  if (url.startsWith('/shared/')) base = ROOT;
  if (url === '/vendor/peerjs.min.js') { base = path.join(ROOT, 'node_modules', 'peerjs', 'dist'); rel = 'peerjs.min.js'; }
  else if (url.startsWith('/vendor/addons/')) { base = path.join(ROOT, 'node_modules', 'three', 'examples', 'jsm'); rel = url.slice('/vendor/addons/'.length); }
  else if (url.startsWith('/vendor/')) { base = path.join(ROOT, 'node_modules', 'three', 'build'); rel = url.slice('/vendor/'.length); }
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------- accounts ----------
// Verifies a Google ID token with Google and returns the verified profile.
async function verifyGoogle(credential) {
  if (!GOOGLE_CLIENT_ID || typeof credential !== 'string' || credential.length > 4096) return null;
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
    if (!r.ok) return null;
    const t = await r.json();
    const fresh = Number(t.exp) * 1000 > Date.now();
    if (t.aud !== GOOGLE_CLIENT_ID || t.email_verified !== 'true' || !fresh) return null;
    return { email: t.email.toLowerCase(), name: cleanName(t.given_name || t.name || t.email.split('@')[0]), picture: t.picture || '' };
  } catch {
    return null;
  }
}

// ---------- rooms & matchmaking ----------
const rooms = new Map();     // code -> { code, isPublic, game, members:Set<session> }
const sessions = new Set();  // every connected socket's session
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newRoom(isPublic, mode = 'ffa') {
  let code;
  do code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  while (rooms.has(code));
  const game = createGame({ bots: BOTS, mode: MODES[mode] ? mode : 'ffa', onMatchEnd: (results) => payRewards(results) });
  const room = { code, isPublic, mode: game.mode, game, members: new Set() };
  room.game.start();
  rooms.set(code, room);
  return room;
}

// Quick match: the fullest public room that still has space, so players meet each other
function quickRoom() {
  let best = null;
  for (const r of rooms.values()) if (r.isPublic && r.mode === 'ffa' && r.members.size < ROOM_SIZE && (!best || r.members.size > best.members.size)) best = r;
  return best || newRoom(true);
}

function enterRoom(sess, room) {
  if (sess.room || room.members.size >= ROOM_SIZE) return false;
  sess.room = room;
  room.members.add(sess);
  sess.conn = room.game.connect(sess.ws);
  sess.send({ t: 'room', code: room.code, isPublic: room.isPublic, mode: room.mode });
  return true;
}

function leaveRoom(sess) {
  const room = sess.room;
  if (!room) return;
  sess.conn?.close();
  room.members.delete(sess);
  sess.room = sess.conn = null;
  if (room.members.size === 0) { room.game.stop(); rooms.delete(room.code); }
}

const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const economy = createEconomy({ dataDir: DATA_DIR });
const admin = createAdmin({ dataDir: DATA_DIR, rooms, sessions, economy });

// Match rewards come from the server's own results, never from the client
function payRewards(results) {
  for (const r of results) {
    const sess = [...sessions].find((s) => s.conn?.player() === r.player);
    const id = sess && economy.accountId(sess);
    if (!id) continue;
    const reward = economy.award(id, r);
    sess.send({ t: 'reward', reward, profile: economy.profile(economy.get(id)) });
  }
}
// Reconnect: a player who drops keeps their room seat and score for 30 seconds
const RECONNECT_MS = 30000;
const pendingRejoin = new Map(); // account id -> { code, until, stats }
function rememberSeat(sess) {
  const id = economy.accountId(sess), p = sess.conn?.player();
  if (!id || !p || !sess.room) return;
  pendingRejoin.set(id, { code: sess.room.code, until: Date.now() + RECONNECT_MS, stats: { kills: p.kills, deaths: p.deaths, heads: p.heads, team: p.team } });
}
const sendProfile = (sess) => { const id = economy.accountId(sess); if (id) sess.send({ t: 'profile', profile: economy.profile(economy.get(id)) }); };

// ---------- networking ----------
const wss = new WebSocketServer({ server, maxPayload: 8 * 1024 });
wss.on('connection', (ws, req) => {
  const ip = (process.env.TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '') || req.socket.remoteAddress;
  const sess = { ws, ip, user: null, role: 'Player', room: null, conn: null, invites: [], send: (m) => ws.readyState === 1 && ws.send(JSON.stringify(m)) };
  sessions.add(sess);
  const refuseIfBanned = () => {
    const ban = admin.activeBan(sess);
    if (!ban) return false;
    sess.send({ t: 'kicked', key: 'admin.banned', p: { reason: ban.reason } });
    setTimeout(() => ws.close(), 100);
    return true;
  };
  if (refuseIfBanned()) return;

  ws.on('message', async (data) => {
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m.t !== 'string') return;

    // Lobby messages; everything else goes to the room's match
    switch (m.t) {
      case 'auth': {
        sess.user = m.credential ? await verifyGoogle(m.credential) : null;
        sess.guestToken = typeof m.guestToken === 'string' ? m.guestToken.slice(0, 64) : null;
        if (refuseIfBanned()) return;
        admin.onAuth(sess);
        sess.send({ t: 'authed', user: sess.user && { name: sess.user.name, picture: sess.user.picture, email: sess.user.email }, googleClientId: GOOGLE_CLIENT_ID });
        sendProfile(sess);
        return;
      }
      // ---- shop (economy service decides; the client only asks) ----
      case 'profile': sendProfile(sess); return;
      case 'buy': {
        const id = economy.accountId(sess);
        const res = economy.buy(id, String(m.item || ''), m.purchaseId);
        if (!res.ok) sess.send({ t: 'shopError', key: res.key });
        sendProfile(sess);
        return;
      }
      case 'equip': {
        const id = economy.accountId(sess);
        const res = economy.equip(id, String(m.slot || ''), m.item === null ? null : String(m.item || ''));
        if (!res.ok) sess.send({ t: 'shopError', key: res.key });
        sendProfile(sess);
        return;
      }
      case 'quickMatch': enterRoom(sess, quickRoom()); return; // not 'quick': that is quick chat inside a room
      case 'create': enterRoom(sess, newRoom(false, String(m.mode || 'ffa'))); return;
      case 'joinCode': {
        const room = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!room) sess.send({ t: 'lobbyError', key: 'sys.roomNotFound' });
        else if (!enterRoom(sess, room)) sess.send({ t: 'lobbyError', key: 'sys.roomFull' });
        return;
      }
      case 'invite': {
        // Find a friend by their Gmail address. Only signed-in players can invite or be found,
        // and the reply never reveals anything about the address beyond online/offline.
        if (!sess.user) { sess.send({ t: 'chat', sys: true, key: 'sys.inviteNeedsLogin' }); return; }
        if (!sess.room) return;
        const email = String(m.email || '').toLowerCase().trim();
        if (sess.invites.filter((t) => Date.now() - t < 60000).length >= 5) { sess.send({ t: 'chat', sys: true, key: 'sys.inviteLimit' }); return; }
        sess.invites.push(Date.now());
        const friend = [...sessions].find((s) => s.user && s.user.email === email && s !== sess);
        if (friend) friend.send({ t: 'invited', from: sess.user.name, code: sess.room.code });
        sess.send(friend ? { t: 'chat', sys: true, key: 'sys.inviteSent' } : { t: 'chat', sys: true, key: 'sys.inviteOffline', p: { code: sess.room.code } });
        return;
      }
      case 'leaveRoom': pendingRejoin.delete(economy.accountId(sess)); leaveRoom(sess); return;
      case 'rejoin': {
        const id = economy.accountId(sess), seat = id && pendingRejoin.get(id);
        const room = seat && seat.until > Date.now() && seat.code === String(m.code || '').toUpperCase() ? rooms.get(seat.code) : null;
        if (!room || !enterRoom(sess, room)) { sess.send({ t: 'lobbyError', key: 'sys.rejoinFailed' }); return; }
        pendingRejoin.delete(id);
        sess.restore = seat.stats; // applied to the join below; never taken from the client
        return;
      }
      case 'admin': admin.handle(sess, m.cmd, m.args); return; // permissions are checked inside, server-side
      case 'join': {
        if (sess.user) m.name = sess.user.name; // signed-in players play under their Google first name
        // Cosmetics and restored stats come only from the server, never from the client message
        const id = economy.accountId(sess);
        m.cosmetics = id ? economy.cosmetics(economy.get(id)) : {};
        delete m.restore;
        if (sess.restore) { m.restore = sess.restore; sess.restore = null; }
        break;
      }
    }
    if (!sess.room) {
      // Old clients (and offline fallbacks) that skip the lobby go straight to quick match
      if (m.t !== 'join') return;
      enterRoom(sess, quickRoom());
    }
    sess.conn?.message(JSON.stringify(m));
  });

  ws.on('close', () => { rememberSeat(sess); leaveRoom(sess); sessions.delete(sess); });
});

server.listen(PORT, () => console.log(`Arena Rush running on http://localhost:${PORT}` + (GOOGLE_CLIENT_ID ? ' (Google sign-in on)' : ' (guests only: set GOOGLE_CLIENT_ID for Google sign-in)')));
