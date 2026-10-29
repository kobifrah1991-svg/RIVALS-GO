<div dir="rtl" align="right">

# הוצאה לחנויות: Steam ו-Google Play

## תקציר בעברית (לבעל הפרויקט)
- **מה כבר מוכן:**
  - Build ל-Windows (Electron): `cd desktop && npm install && npm run dist` יוצר `dist/Arena Rush-<גרסה>-win.zip`.
  - APK לבדיקות: `android/ArenaRush.apk`. הוא חתום במפתח debug, ולכן **לא** מתאים להעלאה ל-Google Play.
- **מה עולה כסף:**
  - Steam: ‏100$ לכל משחק (Steam Direct). הסכום חוזר כזיכוי אחרי 1,000$ הכנסות.
  - Google Play: ‏25$ חד-פעמי לחשבון מפתח.
  - שרת אונליין קבוע: לפי הספק שתבחר.
- **כמה זמן זה לוקח:**
  - Steam: לפחות 30 יום מתשלום ועד שאפשר לשחרר. בנוסף, דף "Coming Soon" ציבורי שבועיים לפחות.
  - Google Play, חשבון אישי חדש: בדיקה סגורה עם 12 בודקים לפחות, במשך 14 ימים ברציפות, לפני שאפשר לפרסם לכולם.
- **חובה לפני פרסום בשתי החנויות:**
  - מדיניות פרטיות בכתובת ציבורית. יש טיוטה ב-`PRIVACY_POLICY.md`.
  - שרת אונליין אמיתי שרשום ב-`servers.json`, אחרת המשחק הוא רק אימון נגד בוטים.
- **כלל ברזל:** Claude לא משלם, לא פותח חשבונות בשמך ולא לוחץ "Publish" או "Release". הוא מכין הכול ועוצר לאישור שלך בכל נקודה שמסומנת 🛑.

</div>

---

## Instructions for Claude (agent runbook)

You are preparing Arena Rush for store release. Follow these rules for the whole runbook:

- **Stop points:** 🛑 marks a step that needs the owner. Stop there and ask the owner, in Hebrew, with a clear summary. This covers anything that costs money, creates an account, signs a legal agreement, uploads to a store, or makes something public.
- **No secrets in the repo:** never commit keystores, upload keys, Steam credentials, `ADMIN_CODE`, or `.p12`/`.jks` files. Keep them outside the repo, or in a secret manager the owner controls.
- **Verify current rules:** store rules change every year. Before each step, check the official page linked here. If it differs from this file, follow the official page and update this file.
- **Honest reporting:** report only what you actually ran. Mark untested items as untested.

### 0. Prerequisites (both stores)
1. **Real server.** Deploy the server per `docs/SERVER_SETUP.md` 🛑 (hosting may cost money).
   - Set `GOOGLE_CLIENT_ID`, `ADMIN_CODE`, `DATA_DIR` (a persistent disk; it holds accounts and bans) and `TRUST_PROXY`.
   - Add the server URL to `public/servers.json` and `desktop/servers.json`.
2. **Privacy policy.** Fill in `docs/PRIVACY_POLICY.md` (contact email, operator name, hosting country) and host it at a public HTTPS URL 🛑.
3. **Licenses.** Re-check `public/models/CREDITS.md`. Every shipped asset must allow commercial redistribution.
   - Rocketbox is MIT; keep its notice.
   - The weapons are CC0.
   - Never add Mixamo, Sketchfab "Standard", or MetaHuman files to a build.
4. **Version.** Bump the version in three places together:
   - `desktop/package.json` `version`
   - `android/AndroidManifest.xml` `versionCode` (+1) and `versionName`
   - `docs/CHANGELOG.md`
5. **Store art and text.** Produce the store assets: screenshots from a real build, capsule/feature images, a short and long description in he/en/ru/ar, and a trailer (optional). Screenshots must show the real game, not mockups.

### 1. Steam (Windows desktop build)
Official: <https://partner.steamgames.com/steamdirect>, <https://partner.steamgames.com/doc/sdk/uploading>.

1. 🛑 **Owner creates the Steamworks account.** The owner signs up at partner.steamgames.com and signs the distribution agreement. They complete the tax interview, bank details and identity verification (Valve says this takes about 15–30 days), then pay the **$100 Steam Direct fee** for the app. Valve keeps a 30-day wait between paying and being allowed to release. You get the **App ID** and **Depot ID** from the owner.
2. **Build:**
   ```bash
   cd desktop
   npm install
   npm run dist            # dist/Arena Rush-<version>-win.zip (portable folder)
   ```
   - Unzip it and check that `Arena Rush.exe` starts, the menu shows, and practice and online play work.
   - Linux is covered by the same Electron code (`npx electron-builder --linux dir`) if the owner wants a Linux depot too.
   - The exe is not code-signed (`signAndEditExecutable: false`). Steam does not require signing, but Windows SmartScreen may warn on downloads outside Steam.
3. **Store page.** In Steamworks, fill in the store page with descriptions, screenshots (at least 5), capsule images in Valve's exact sizes, tags, system requirements and supported languages (Hebrew, English, Russian, Arabic). Do the content survey honestly: realistic weapons, violence, user chat. Add the privacy policy URL.
4. 🛑 **Owner submits the store page for review**, then publishes it as **Coming Soon**. A new game must show a public Coming Soon page for at least two weeks before release; confirm the current rule in Steamworks docs.
5. **Upload the build with SteamPipe:**
   - Install `steamcmd`.
   - Create `app_build_<appid>.vdf` and `depot_build_<depotid>.vdf` pointing at the unzipped folder. The launch option is `Arena Rush.exe`.
   - Run `steamcmd +login <builder account> +run_app_build ...` 🛑. The login is the owner's account or a builder account they create with Steam Guard, so the owner types the credentials; never store them.
   - The build lands on a branch. The owner sets it live on `default` only after review.
6. 🛑 **Build review** (Valve takes about 1–5 days), then **owner presses Release**.
7. **Optional Steamworks SDK** (achievements, Steam friends invites, overlay): add it via `steamworks.js` in the Electron main process. This is a separate task with its own testing; ship without it first.

### 2. Google Play (Android)
Official: <https://support.google.com/googleplay/android-developer/answer/14151465> (testing requirement), <https://developer.android.com/google/play/requirements/target-sdk> (target API).

The current `android/build.sh` makes a **debug-signed APK** with targetSdk 34 for sideloading. Play needs these instead:
- **An Android App Bundle (`.aab`)**, signed with an **upload key**. Play App Signing holds the final key.
- **targetSdk 36 (Android 16)** for new apps and updates from **31 Aug 2026**. An extension to 1 Nov 2026 can be requested in Play Console. Re-check this every year.

#### Recommended path: Capacitor wrapper
It produces a normal Gradle project that Android Studio and Play understand.
```bash
cd RIVALS-GO
npm i -D @capacitor/cli @capacitor/core @capacitor/android
npx cap init "Arena Rush" com.arenarush.game --web-dir android-www
# android-www = the same bundle build.sh creates in android/build/assets/www (index.html, game.js, style.css)
npx cap add android
```
Then:
1. Set `compileSdk`/`targetSdk` to 36 and `minSdk` to 24 or higher in `android/variables.gradle` of the Capacitor project. Lock orientation to landscape. Set `versionCode`/`versionName`.
2. Create the upload key **on the owner's machine**: `keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`. Never commit it, and tell the owner to back it up.
3. Build: `cd android && ./gradlew bundleRelease`. This needs Android SDK 36 and JDK 17+, installed with Android Studio.
4. Test the release build on a real phone: `bundletool build-apks --connected-device` or an internal testing track.

Bubblewrap/TWA is an alternative only if the game is hosted as a PWA on the owner's HTTPS domain, since it then needs online access.

#### Play Console steps
1. 🛑 **Owner creates the developer account**: $25, identity verification, and a personal or organization account choice. Organization accounts (they need a D-U-N-S number) are exempt from the 12-tester rule.
2. Create the app and fill in **App content**:
   - Privacy policy URL.
   - **Data safety** form: microphone audio for push-to-talk (sent to other players, not stored), IP shared with other players in peer-to-peer rooms, email and name from Google sign-in, IP for abuse bans, chat messages and reports, device guest ID, gameplay stats; data is not sold; deletion on request.
   - **Content rating** (IARC questionnaire): realistic violence and user chat.
   - Target audience: choose 13+ or 16+ honestly. If under-13s are included, the **Families policy** applies and chat must be restricted, so avoid that unless the owner decides otherwise.
   - Ads: none.
3. **Closed testing** (new personal accounts):
   - Upload the AAB to a closed track and add **at least 12 testers** who stay opted in for **14 days in a row**.
   - The owner recruits them 🛑.
   - Then apply for production access in the Dashboard 🛑.
4. Store listing: icon 512×512, feature graphic 1024×500, phone screenshots, and he/en/ru/ar texts.
5. 🛑 **Owner sends for review and rolls out** (staged rollout recommended, for example 20%).

### 3. After release
- Monitor server logs, `data/admin-audit.log`, and crash reports (Play Console vitals).
- For each update, bump the versions (step 0.4), rebuild, re-test, and repeat the upload step. Never re-use a `versionCode`.

