// Economy service: accounts, XP, credits, inventory and purchases (PROJECT_PLAN stage E).
// The server is the only place balances change; clients only send requests.
// Storage: a JSON file written atomically (temp file + rename). On hosts whose disk is wiped on every
// restart (free cloud plans), set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN and accounts are
// also kept in an Upstash Redis database (free tier, plain HTTPS), loaded at start and saved on change.
import fs from 'node:fs';
import path from 'node:path';
import { SHOP, SLOTS, ECONOMY, itemById } from './shared/shop.js';

const MAX_GRANT = 10000;

// Optional remote copy in Upstash Redis (REST API). Returns null when not configured.
function redisStore(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL, token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const KEY = env.ACCOUNTS_KEY || 'arena-rush:accounts';
  const call = async (body) => {
    const r = await fetch(url.replace(/\/$/, ''), { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('Upstash ' + r.status);
    return (await r.json()).result;
  };
  return {
    load: async () => { const v = await call(['GET', KEY]); return v ? JSON.parse(v) : null; },
    save: (data) => call(['SET', KEY, JSON.stringify(data)]),
  };
}

export function createEconomy({ dataDir, remote = redisStore() }) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'accounts.json');
  let accounts = {};
  try { accounts = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
  // With a remote store, its copy wins (the local disk may have been wiped by a redeploy)
  const ready = remote
    ? remote.load().then((data) => { if (data) accounts = data; console.log('Accounts loaded from Upstash:', Object.keys(accounts).length); })
      .catch((e) => console.error('Upstash load failed, using local file:', e.message))
    : Promise.resolve();

  let saveTimer = null, remoteBusy = false, remoteAgain = false;
  async function pushRemote() {
    if (!remote) return;
    if (remoteBusy) { remoteAgain = true; return; } // one write at a time, the latest state wins
    remoteBusy = true;
    try { await remote.save(accounts); } catch (e) { console.error('Upstash save failed:', e.message); }
    remoteBusy = false;
    if (remoteAgain) { remoteAgain = false; pushRemote(); }
  }
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(accounts));
    fs.renameSync(tmp, file); // atomic replace: a crash never leaves a half-written file
    pushRemote();
  }
  const saveSoon = () => { if (!saveTimer) saveTimer = setTimeout(saveNow, 300); };

  // Signed-in players are keyed by verified email; guests by a random device token they keep
  function accountId(sess) {
    if (sess.user?.email) return 'g:' + sess.user.email;
    if (typeof sess.guestToken === 'string' && /^[0-9a-f-]{36}$/.test(sess.guestToken)) return 'd:' + sess.guestToken;
    return null;
  }

  function get(id) {
    if (!id) return null;
    if (!accounts[id]) {
      accounts[id] = { credits: ECONOMY.startCredits, xp: 0, level: 1, owned: [], equipped: {}, purchases: [], created: Date.now() };
      saveSoon();
    }
    return accounts[id];
  }

  const profile = (acc) => acc && {
    credits: acc.credits, xp: acc.xp, level: acc.level, need: ECONOMY.levelXp(acc.level),
    owned: acc.owned, equipped: acc.equipped,
  };

  // Cosmetics that other players see (validated: only owned items)
  function cosmetics(acc) {
    const out = {};
    for (const slot of SLOTS) if (acc?.equipped?.[slot] && acc.owned.includes(acc.equipped[slot])) out[slot] = acc.equipped[slot];
    return out;
  }

  function addXp(acc, xp) {
    acc.xp += xp;
    let levelUp = false;
    while (acc.xp >= ECONOMY.levelXp(acc.level)) { acc.xp -= ECONOMY.levelXp(acc.level); acc.level++; levelUp = true; }
    return levelUp;
  }

  // Match rewards, from the server's own match results
  function award(id, { kills = 0, heads = 0, won = false }) {
    const acc = get(id);
    if (!acc) return null;
    const c = ECONOMY.credits, x = ECONOMY.xp;
    const credits = kills * c.kill + heads * c.headshot + (won ? c.win : c.played);
    const xp = kills * x.kill + heads * x.headshot + (won ? x.win : x.played);
    acc.credits += credits;
    const levelUp = addXp(acc, xp);
    saveSoon();
    return { credits, xp, levelUp, level: acc.level };
  }

  // Purchase: validated and applied in one synchronous step, so it cannot interleave with another.
  // purchaseId makes retries safe: the same id is applied once, even after a disconnect.
  function buy(id, itemId, purchaseId) {
    const acc = get(id);
    if (!acc) return { ok: false, key: 'shop.needAccount' };
    if (typeof purchaseId !== 'string' || purchaseId.length < 8 || purchaseId.length > 64) return { ok: false, key: 'shop.error' };
    if (acc.purchases.includes(purchaseId)) return { ok: true, repeat: true };
    const item = itemById(itemId);
    if (!item) return { ok: false, key: 'shop.error' };
    if (acc.owned.includes(item.id)) return { ok: false, key: 'shop.owned' };
    if (acc.credits < item.price) return { ok: false, key: 'shop.noCredits' };
    acc.credits -= item.price;
    acc.owned.push(item.id);
    acc.purchases = [...acc.purchases, purchaseId].slice(-100);
    saveNow(); // purchases are written immediately
    return { ok: true, item: item.id };
  }

  function equip(id, slot, itemId) {
    const acc = get(id);
    if (!acc || !SLOTS.includes(slot)) return { ok: false, key: 'shop.error' };
    if (itemId === null || itemId === '') { delete acc.equipped[slot]; saveSoon(); return { ok: true }; }
    const item = itemById(itemId);
    if (!item || item.slot !== slot || !acc.owned.includes(item.id)) return { ok: false, key: 'shop.error' };
    acc.equipped[slot] = item.id;
    saveSoon();
    return { ok: true };
  }

  // Admin grant (Owner only; checked by admin.js) — goes through the same service as everything else
  function grant(id, amount) {
    const acc = get(id);
    if (!acc || !Number.isInteger(amount) || amount < 1 || amount > MAX_GRANT) return false;
    acc.credits += amount;
    saveNow();
    return true;
  }

  return { accountId, get, profile, cosmetics, award, buy, equip, grant, catalog: SHOP, flush: saveNow, ready, storage: remote ? 'upstash' : 'file' };
}
