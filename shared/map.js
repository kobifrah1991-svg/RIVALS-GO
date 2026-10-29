// "Neon Warehouse" arena. Every solid is an axis-aligned box: {min:[x,y,z], max:[x,y,z], color}.
const boxes = [];
const add = (min, max, color = 0x2b2f4a) => boxes.push({ min, max, color });

// Floor and perimeter walls
add([-32, -1, -32], [32, 0, 32], 0x14162a);
add([-32, 0, -32], [32, 6, -31], 0x1e2240);
add([-32, 0, 31], [32, 6, 32], 0x1e2240);
add([-32, 0, -31], [-31, 6, 31], 0x1e2240);
add([31, 0, -31], [32, 6, 31], 0x1e2240);

// Central platform with stairs on both sides
add([-4, 0, -4], [4, 3, 4], 0x3a2f6b);
for (let i = 0; i < 7; i++) {
  const h = (i + 1) * 0.43;
  add([-1.5, 0, 4 + (6 - i) * 0.57], [1.5, h, 4 + (7 - i) * 0.57], 0x51438f);
  add([-1.5, 0, -4 - (7 - i) * 0.57], [1.5, h, -4 - (6 - i) * 0.57], 0x51438f);
}
// Low parapets on the platform for cover
add([-4, 3, -4], [-2, 3.8, -3.6], 0xff2e88);
add([2, 3, 3.6], [4, 3.8, 4], 0xff2e88);

// Long cover walls
add([-14, 0, -2], [-13, 2.5, 10], 0x24406b);
add([13, 0, -10], [14, 2.5, 2], 0x24406b);
add([-6, 0, -18], [8, 2.5, -17], 0x24406b);
add([-8, 0, 17], [6, 2.5, 18], 0x24406b);

// Corner platforms (jump from the crate)
add([-28, 0, -28], [-22, 2, -22], 0x3a2f6b);
add([-22, 0, -25.5], [-20.5, 1.2, -24], 0xffb300);
add([22, 0, 22], [28, 2, 28], 0x3a2f6b);
add([20.5, 0, 24], [22, 1.2, 25.5], 0xffb300);

// Pillars
for (const [x, z] of [[10, 10], [-10, 10], [10, -10], [-10, -10]]) {
  add([x - 0.6, 0, z - 0.6], [x + 0.6, 6, z + 0.6], 0x00e5ff);
}

// Crates
for (const [x, z] of [[-20, 6], [-19, 7.6], [18, -6], [6, 24], [-6, -24], [22, -20], [-22, 18], [-3, 12], [4, -12], [24, 4], [-25, -6]]) {
  add([x - 0.75, 0, z - 0.75], [x + 0.75, 1.2, z + 0.75], 0xffb300);
}
// Double-stacked crates
add([18, 0, 14], [19.5, 2.4, 15.5], 0xff6d00);
add([-19.5, 0, -15.5], [-18, 2.4, -14], 0xff6d00);

export const MAP = {
  id: 'neon', // display name: i18n key map.neon
  boxes,
  spawns: [
    [-26, 0, 0], [26, 0, 0], [0, 0, -27], [0, 0, 27],
    [-24, 0, 24], [24, 0, -24], [-26, 3, -26], [25, 3, 25],
    [-10, 0, -26], [10, 0, 26], [-26, 0, 12], [26, 0, -12],
  ],
  // Open points bots wander between
  waypoints: [
    [-24, 0, 0], [24, 0, 0], [0, 0, -24], [0, 0, 24], [0, 3, 0],
    [-18, 0, -18], [18, 0, 18], [-18, 0, 18], [18, 0, -18],
    [-8, 0, 0], [8, 0, 0], [0, 0, 10], [0, 0, -10], [-25, 2, -25], [25, 2, 25],
  ],
};
