#!/usr/bin/env bash
# Builds ArenaRush.apk (offline practice vs bots) from the web game.
# Needs (Debian/Ubuntu): aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 openjdk-17-jdk-headless, plus Node.js.
set -euo pipefail
cd "$(dirname "$0")"
ANDROID_JAR=${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}
OUT=build

rm -rf "$OUT" && mkdir -p "$OUT/assets/www" "$OUT/gen" "$OUT/classes"

# 1. Bundle the game into one classic script (WebView can't load ES modules from file://)
ln -sfn ../shared ../public/shared
trap 'rm -f ../public/shared' EXIT
npx --prefix .. esbuild entry.js --bundle --format=iife --minify --target=es2020 --loader:.glb=dataurl --log-level=warning --outfile="$OUT/assets/www/game.js"
python3 - <<'PY'
import re
s = open('../public/index.html', encoding='utf-8').read()
s = re.sub(r'\s*<script type="importmap">.*?</script>', '', s, flags=re.S)
s = s.replace('<script type="module" src="client.js"></script>', '<script src="game.js"></script>')
open('build/assets/www/index.html', 'w', encoding='utf-8').write(s)
PY
cp ../public/style.css "$OUT/assets/www/"
mkdir -p "$OUT/assets/www/vendor" && cp ../node_modules/peerjs/dist/peerjs.min.js "$OUT/assets/www/vendor/"  # friend rooms (WebRTC)

# 2. Resources + manifest, Java, dex
aapt package -f -m -M AndroidManifest.xml -S res -I "$ANDROID_JAR" -J "$OUT/gen" -A "$OUT/assets" -F "$OUT/unsigned.apk"
javac -nowarn --release 8 -cp "$ANDROID_JAR" -d "$OUT/classes" $(find src "$OUT/gen" -name '*.java') 2> "$OUT/javac.log" || { cat "$OUT/javac.log"; exit 1; }
dalvik-exchange --dex --output="$OUT/classes.dex" "$OUT/classes"
(cd "$OUT" && aapt add -f unsigned.apk classes.dex >/dev/null)

# 3. Align and sign (debug key, generated once and reused so updates install over the old version)
zipalign -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
[ -f arena-debug.keystore ] || keytool -genkeypair -keystore arena-debug.keystore -storepass android -keypass android \
  -alias arena -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Arena Rush Debug" >/dev/null 2>&1
apksigner sign --ks arena-debug.keystore --ks-pass pass:android --key-pass pass:android --ks-key-alias arena --out ArenaRush.apk "$OUT/aligned.apk"
apksigner verify ArenaRush.apk && echo "Built $(pwd)/ArenaRush.apk ($(du -h ArenaRush.apk | cut -f1))"
