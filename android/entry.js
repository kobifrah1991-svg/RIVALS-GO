// APK entry: everything bundled (offline practice works with no network; online rooms with friends use WebRTC).
// Models are embedded as data: URLs because a WebView can't fetch() file:// assets.
// Lists every .glb under public/models: add a line here when you add a model.
import m0 from '../public/models/characters/Female_Adult_03.glb';
import m1 from '../public/models/characters/Female_Adult_04.glb';
import m2 from '../public/models/characters/Female_Adult_05.glb';
import m3 from '../public/models/characters/Female_Adult_08.glb';
import m4 from '../public/models/characters/Male_Adult_04.glb';
import m5 from '../public/models/characters/Male_Adult_06.glb';
import m6 from '../public/models/characters/Male_Adult_09.glb';
import m7 from '../public/models/characters/Male_Adult_14.glb';
import m8 from '../public/models/characters/Military_Female_01.glb';
import m9 from '../public/models/characters/Military_Female_02.glb';
import m10 from '../public/models/characters/Military_Male_01.glb';
import m11 from '../public/models/characters/Military_Male_02.glb';
import m12 from '../public/models/anims/f_idle_neutral_01.glb';
import m13 from '../public/models/anims/f_run_neutral_01.glb';
import m14 from '../public/models/anims/f_walk_neutral_01.glb';
import m15 from '../public/models/anims/m_idle_neutral_01.glb';
import m16 from '../public/models/anims/m_run_neutral_01.glb';
import m17 from '../public/models/anims/m_walk_neutral_01.glb';
import m18 from '../public/models/weapons/knife.glb';
import m19 from '../public/models/weapons/pistol.glb';
import m20 from '../public/models/weapons/rifle.glb';
import m21 from '../public/models/weapons/shotgun.glb';
import m22 from '../public/models/weapons/sniper.glb';

window.ARENA_OFFLINE = true; // no game server of its own: practice, friend rooms and the online servers in shared/servers.js
window.ARENA_MODELS = {
  'characters/Female_Adult_03.glb': m0,
  'characters/Female_Adult_04.glb': m1,
  'characters/Female_Adult_05.glb': m2,
  'characters/Female_Adult_08.glb': m3,
  'characters/Male_Adult_04.glb': m4,
  'characters/Male_Adult_06.glb': m5,
  'characters/Male_Adult_09.glb': m6,
  'characters/Male_Adult_14.glb': m7,
  'characters/Military_Female_01.glb': m8,
  'characters/Military_Female_02.glb': m9,
  'characters/Military_Male_01.glb': m10,
  'characters/Military_Male_02.glb': m11,
  'anims/f_idle_neutral_01.glb': m12,
  'anims/f_run_neutral_01.glb': m13,
  'anims/f_walk_neutral_01.glb': m14,
  'anims/m_idle_neutral_01.glb': m15,
  'anims/m_run_neutral_01.glb': m16,
  'anims/m_walk_neutral_01.glb': m17,
  'weapons/knife.glb': m18,
  'weapons/pistol.glb': m19,
  'weapons/rifle.glb': m20,
  'weapons/shotgun.glb': m21,
  'weapons/sniper.glb': m22,
};
import('../public/client.js');
