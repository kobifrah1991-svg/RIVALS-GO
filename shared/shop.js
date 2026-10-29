// Cosmetic shop catalog (PROJECT_PLAN stage E). Prices are in-game credits only: no real money.
// Items are purely visual and never change damage or speed. Display names: i18n keys shop.<id>.
export const SHOP = [
  { id: 'outfit.desert', slot: 'outfit', price: 400, tint: 0xc9a46a },
  { id: 'outfit.arctic', slot: 'outfit', price: 600, tint: 0xe6edf5 },
  { id: 'outfit.night', slot: 'outfit', price: 800, tint: 0x30343f },
  { id: 'camo.carbon', slot: 'camo', price: 700, color: 0x2b2b30, metal: 0.4 },
  { id: 'camo.neon', slot: 'camo', price: 1000, color: 0x00e5ff, glow: true },
  { id: 'camo.gold', slot: 'camo', price: 1500, color: 0xd4af37, metal: 0.85 },
];

export const SLOTS = ['outfit', 'camo'];
export const itemById = (id) => SHOP.find((i) => i.id === id) || null;

// Rewards are computed on the server from server-side match results
export const ECONOMY = {
  startCredits: 500,
  credits: { kill: 10, headshot: 5, win: 100, played: 25 },
  xp: { kill: 100, headshot: 50, win: 500, played: 100 },
  levelXp: (level) => 1000 + (level - 1) * 250,
};
