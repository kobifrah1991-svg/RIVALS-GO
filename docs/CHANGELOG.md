# Changelog

## 2026-10-29 (0.9.0)
- Stances: crouch (C / 🧎) and prone with crawling (Z / ⤓); lower eye height, slower movement and smaller hitboxes, checked on the server (standing up needs headroom). Space stands up.
- Tactical posture for every player: knees bent, torso leaning into the weapon; crouch-walk via leg IK; prone body with raised chest and stretched legs.
- Hands: shooting hand on the pistol grip with the index finger on the trigger and the thumb around the grip; support hand wraps the handguard / pump.
- Roster: 2 male and 2 female soldiers (new Military_Female_02), 3 civilian men and 3 civilian women; names that match each look (Marcus, Diego, Sarah, Gabriela, Andre, Leo, Eli, Mei, Noa, Shira).
- Picker colours: soldiers dark blue (men) / purple (women), civilians blue (men) / pink (women).
- Hair textures: colour bled into transparent pixels (no dark fringes at the hairline), alpha-to-coverage edges.

## 2026-10-29 (0.8.1)
- Moved to its own repository (RIVALS-GO); static site on the gh-pages branch.
- Weapon holds measured from each model: left hand under the AK handguard, on the shotgun pump, under the rifle fore-end; two-hand pistol grip; one-hand machete.
- Hands are turned by the measured palm direction; short-armed characters get the weapon (or first-person body) moved back so the support hand reaches.
- Characters load one at a time on demand; embedded models are decoded without fetch (fixes characters not loading in the claude.ai app).

## 2026-10-29 (0.8.0)
- Hands hold the weapon properly: shooting stance (torso turned, stock at the shoulder), right hand on the grip, left hand under the handguard, fingers closed around the grip, separate holds for pistol and knife; head and spine follow the aim.
- First-person arms: your own character's sleeves and hands hold the weapon at eye height.
- 10 characters: 3 soldiers and 7 civilians (5 women, 5 men in total), all Rocketbox (MIT).
- Online rooms with friends without a game server (WebRTC via the free PeerJS broker): open a room, share the 5-letter code or link, friends join from the browser, the APK or the desktop app.
- Push-to-talk voice chat (V / 🎙), device to device; works in friend rooms and on servers. /mute also mutes voice.
- New start screen: top bar, large character preview with a 10-character grid, tabs for Play / With friends / Servers.
- Static web build (`play/`, `node tools/build-web.mjs`) for GitHub Pages. APK 0.8 (internet and microphone permissions).

## 2026-10-29 (0.7.0)
- Reconnect: a player who drops can return within 30 s to the same seat, keeping kills and team.
- Economy and cosmetic shop: server-side accounts (credits, XP, level, inventory), idempotent purchases, rewards from server match results, Owner `givemoney`.
- Windows desktop build (Electron).
- Store release runbook (Steam, Google Play) and privacy policy template.
- Realistic Rocketbox soldiers (MIT) and CC0 PBR weapons; crosshair stays visible while aiming (except the sniper scope).
- APK 0.7.

## 2026-10-29
- Knife (key 5): server-validated melee arc with line of sight; backstab kills instantly.
- Team modes 1v1 and 2v2 with a lobby (team choice, ready, countdown), team spawn sides, no friendly fire, team score HUD; a team that empties mid-match forfeits.
- APK 0.5.
- Four interface languages (he/en/ru/ar). Server sends message keys; each client translates. Language switch in-game without disconnecting.
- Admin system: roles from verified identity or operator code, server-side permission checks, audit log, rate limit, bans, in-game admin panel (F2).
- Start screen: player name, 3 characters with 3D preview, server list with ping and player counts.
- Fix: lobby quick-match message clashed with in-room quick chat.
- Bans for signed-in players apply to the account, not the shared IP.
- Tracking docs: PROJECT_STATUS, TASKS, ADMIN_GUIDE, LOCALIZATION, SERVER_SETUP.

## 2026-10-28
- Browser FPS with multiplayer, bots and filtered chat; offline practice mode; Android APK.
- Daylight arena, procedural textures, animated soldier model, CC0 weapon models.
- Rooms, quick match, private rooms, Gmail invites, optional Google sign-in.
- Unity 6 scripts (compile-checked, not run in Unity).
