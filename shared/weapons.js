// Balance data only — tweak numbers here, not in game code (GDD §7). Names: i18n keys weapon.<id>.
// rate: seconds between shots. spread: radians (hip). adsSpread: radians when aiming.
// falloff: [start, end] metres; damage drops linearly to minMul at end.
export const WEAPONS = {
  rifle: {
    key: '1', auto: true,
    damage: 22, headMul: 1.6, pellets: 1, rate: 0.1,
    mag: 40, reload: 1.8, spread: 0.022, adsSpread: 0.006,
    falloff: [25, 60], minMul: 0.6, range: 150,
    recoil: 0.012, adsFov: 55, color: 0x40c4ff,
  },
  // M4 carbine: steadier and a little faster than the AK, slightly less damage
  m4: {
    key: '2', auto: true,
    damage: 19, headMul: 1.7, pellets: 1, rate: 0.085,
    mag: 36, reload: 1.7, spread: 0.018, adsSpread: 0.004,
    falloff: [28, 70], minMul: 0.6, range: 160,
    recoil: 0.009, adsFov: 52, color: 0x80d8ff,
  },
  // SMG: very fast fire, short range, big magazine
  smg: {
    key: '3', auto: true,
    damage: 14, headMul: 1.5, pellets: 1, rate: 0.06,
    mag: 45, reload: 1.5, spread: 0.03, adsSpread: 0.012,
    falloff: [12, 35], minMul: 0.5, range: 90,
    recoil: 0.008, adsFov: 62, color: 0xffd740,
  },
  shotgun: {
    key: '4', auto: false,
    damage: 13, headMul: 1.3, pellets: 9, rate: 0.85,
    mag: 8, reload: 2.2, spread: 0.075, adsSpread: 0.06,
    falloff: [7, 20], minMul: 0.25, range: 40,
    recoil: 0.05, adsFov: 65, color: 0xff9100,
  },
  sniper: {
    key: '5', auto: false,
    damage: 85, headMul: 2.0, pellets: 1, rate: 1.25,
    mag: 7, reload: 2.6, spread: 0.06, adsSpread: 0.0,
    falloff: [200, 300], minMul: 1, range: 300,
    recoil: 0.07, adsFov: 22, color: 0xd500f9,
  },
  pistol: {
    key: '6', auto: false,
    damage: 30, headMul: 1.8, pellets: 1, rate: 0.22,
    mag: 15, reload: 1.3, spread: 0.015, adsSpread: 0.006,
    falloff: [15, 40], minMul: 0.55, range: 100,
    recoil: 0.025, adsFov: 60, color: 0x76ff03,
  },
  // Melee: no ammo. range in metres, arc = minimum cos of the angle to the target.
  // A hit from behind (target facing away) multiplies damage by backstabMul — enough to kill outright.
  knife: {
    key: '7', auto: false, melee: true,
    damage: 55, headMul: 1, pellets: 1, rate: 0.55,
    mag: 1, reload: 0, spread: 0, adsSpread: 0,
    falloff: [99, 100], minMul: 1, range: 2.4, arc: 0.72, backstabMul: 4,
    recoil: 0, adsFov: 78, color: 0xeceff1,
  },
  // RPG: only from a pickup on the map (the tower tops). A few rockets for a limited time; the rocket
  // explodes where it hits, hurting everyone in the blast radius (less the further away).
  rpg: {
    key: '8', auto: false, pickupOnly: true, rockets: 4, seconds: 45,
    damage: 150, headMul: 1, pellets: 1, rate: 1.0,
    mag: 4, reload: 0, spread: 0.01, adsSpread: 0.004,
    falloff: [999, 1000], minMul: 1, range: 120, blast: 4.5,
    recoil: 0.09, adsFov: 60, color: 0xff6d00,
  },
};

// Every weapon (models, slots). LOADOUT: what everyone carries; the rest come from pickups.
export const WEAPON_ORDER = ['rifle', 'm4', 'smg', 'shotgun', 'sniper', 'pistol', 'knife', 'rpg'];
export const LOADOUT = WEAPON_ORDER.filter((k) => !WEAPONS[k].pickupOnly);

export function damageAt(w, dist, head) {
  const [a, b] = w.falloff;
  let mul = 1;
  if (dist > a) mul = dist >= b ? w.minMul : 1 - (1 - w.minMul) * ((dist - a) / (b - a));
  return Math.round(w.damage * mul * (head ? w.headMul : 1));
}
