# Model credits

All third-party models below allow use in a commercial game. Keep this file with any build you distribute.

| File | Model | Author | Licence | Source |
|---|---|---|---|---|
| `characters/Military_Male_01.glb` | Military_Male_01 avatar | Microsoft (Rocketbox Avatar Library) | MIT | https://github.com/microsoft/Microsoft-Rocketbox |
| `characters/Military_Male_02.glb` | Military_Male_02 avatar | Microsoft (Rocketbox Avatar Library) | MIT | https://github.com/microsoft/Microsoft-Rocketbox |
| `characters/Military_Female_01.glb` | Military_Female_01 avatar | Microsoft (Rocketbox Avatar Library) | MIT | https://github.com/microsoft/Microsoft-Rocketbox |
| `characters/Female_Adult_03.glb` | Female_Adult_03 avatar | Microsoft (Rocketbox Avatar Library) | MIT | https://github.com/microsoft/Microsoft-Rocketbox |
| `characters/Female_Adult_05.glb` | Female_Adult_05 avatar | Microsoft (Rocketbox Avatar Library) | MIT | https://github.com/microsoft/Microsoft-Rocketbox |
| `characters/Female_Adult_08.glb` | Female_Adult_08 avatar | Microsoft (Rocketbox Avatar Library) | MIT | https://github.com/microsoft/Microsoft-Rocketbox |
| `characters/Female_Adult_04.glb` | Female_Adult_04 avatar | Microsoft (Rocketbox Avatar Library) | MIT | https://github.com/microsoft/Microsoft-Rocketbox |
| `characters/Male_Adult_06.glb` | Male_Adult_06 avatar | Microsoft (Rocketbox Avatar Library) | MIT | https://github.com/microsoft/Microsoft-Rocketbox |
| `characters/Military_Female_02.glb` | Military_Female_02 avatar | Microsoft (Rocketbox Avatar Library) | MIT | https://github.com/microsoft/Microsoft-Rocketbox |
| `characters/Male_Adult_04.glb` | Male_Adult_04 avatar | Microsoft (Rocketbox Avatar Library) | MIT | https://github.com/microsoft/Microsoft-Rocketbox |
| `characters/Male_Adult_09.glb` | Male_Adult_09 avatar | Microsoft (Rocketbox Avatar Library) | MIT | https://github.com/microsoft/Microsoft-Rocketbox |
| `characters/Male_Adult_14.glb` | Male_Adult_14 avatar | Microsoft (Rocketbox Avatar Library) | MIT | https://github.com/microsoft/Microsoft-Rocketbox |
| `anims/*.glb` | idle_neutral_01, walk_neutral_01, run_neutral_01 (male and female) | Microsoft (Rocketbox animations) | MIT | https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Animations |
| `weapons/rifle.glb` | AKM | LonesomeDucky | CC0 | https://opengameart.org/content/akm |
| `weapons/shotgun.glb` | Mossberg 500 (3D Model Haven gun pack) | Rajil Jose Macatangay | CC0 | https://archive.org/details/gun_models.7z |
| `weapons/sniper.glb` | Bolt Action Rifle 7.62 | Mateusz Sadek (Poly Haven) | CC0 | https://polyhaven.com/a/bolt_action_rifle_7_62 |
| `weapons/pistol.glb` | Service Pistol | Mateusz Sadek (Poly Haven) | CC0 | https://polyhaven.com/a/service_pistol |
| `weapons/knife.glb` | Machete | Ulan Cabanilla (Poly Haven) | CC0 | https://polyhaven.com/a/machete |

The weapon GLBs were prepared (re-centred into weapon space, textures resized) by the mini-cry project (https://github.com/vvanghelue/mini-cry, `public/models/fp/`). The Rocketbox avatars were converted here from FBX with FBX2glTF; textures were downscaled to 1024 px JPEG (hair and eyelash cards: 512 px PNG with alpha); the walk and run clips have their horizontal root motion locked in the game code.

## Code libraries shipped with the game

- three.js (MIT) — 3D rendering.
- PeerJS 1.5.4 (MIT, https://peerjs.com) — rooms with friends over WebRTC. The free public PeerJS server only introduces devices; no game data passes through it.

## Microsoft Rocketbox: MIT License

Copyright (c) 2020 Microsoft

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
