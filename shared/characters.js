// Playable characters (display names: i18n keys char.<id> and char.<id>.role). To use your own models, put the .glb files in public/models/characters/
// and point `file` at them. Models rigged with Mixamo bones get walk/run animation and hands on the gun.
// Rocketbox avatars (Microsoft, MIT) with Rocketbox idle/walk/run clips; see public/models/CREDITS.md
// 3 soldiers and 7 civilians (4 women, 3 men). height: rendered height in metres (default 1.8). civ / female: labels for the character picker.
const MALE = { Idle: 'anims/m_idle_neutral_01.glb', Walk: 'anims/m_walk_neutral_01.glb', Run: 'anims/m_run_neutral_01.glb' };
const FEMALE = { Idle: 'anims/f_idle_neutral_01.glb', Walk: 'anims/f_walk_neutral_01.glb', Run: 'anims/f_run_neutral_01.glb' };
export const CHARACTERS = [
  { id: 'assault', file: 'characters/Military_Male_01.glb', anims: MALE, flip: true, tint: null },
  { id: 'ranger', file: 'characters/Military_Male_02.glb', anims: MALE, flip: true, tint: null },
  { id: 'urban', female: true, file: 'characters/Military_Female_01.glb', anims: FEMALE, flip: true, tint: null, height: 1.72 },
  { id: 'maya', civ: true, female: true, file: 'characters/Female_Adult_03.glb', anims: FEMALE, flip: true, tint: null, height: 1.7 },
  { id: 'noa', civ: true, female: true, file: 'characters/Female_Adult_05.glb', anims: FEMALE, flip: true, tint: null, height: 1.68 },
  { id: 'dana', civ: true, female: true, file: 'characters/Female_Adult_12.glb', anims: FEMALE, flip: true, tint: null, height: 1.7 },
  { id: 'shira', civ: true, female: true, file: 'characters/Female_Adult_08.glb', anims: FEMALE, flip: true, tint: null, height: 1.72 },
  { id: 'avi', civ: true, file: 'characters/Male_Adult_04.glb', anims: MALE, flip: true, tint: null },
  { id: 'omer', civ: true, file: 'characters/Male_Adult_09.glb', anims: MALE, flip: true, tint: null },
  { id: 'eli', civ: true, file: 'characters/Male_Adult_14.glb', anims: MALE, flip: true, tint: null },
];

export const characterById = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
