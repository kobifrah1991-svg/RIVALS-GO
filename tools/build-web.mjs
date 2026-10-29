// Builds a static copy of the game (no game server needed) into the given folder (default ../play, next to this project),
// for GitHub Pages or any static host. It offers practice against bots and online rooms with friends
// (WebRTC, see public/p2p.js). Run: node tools/build-web.mjs [output folder]  (default: ../play)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.resolve(process.argv[2] || path.join(ROOT, '..', 'play'));
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };
const copyDir = (from, to, filter = () => true) => {
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b, filter);
    else if (filter(e.name)) copy(a, b);
  }
};

fs.rmSync(OUT, { recursive: true, force: true });
copyDir(path.join(ROOT, 'public'), OUT, (n) => !n.startsWith('_') && n !== 'servers.json');
copyDir(path.join(ROOT, 'shared'), path.join(OUT, 'shared'));
const three = path.join(ROOT, 'node_modules', 'three');
copy(path.join(three, 'build', 'three.module.js'), path.join(OUT, 'vendor', 'three.module.js'));
for (const f of ['loaders/GLTFLoader.js', 'utils/SkeletonUtils.js', 'utils/BufferGeometryUtils.js']) {
  copy(path.join(three, 'examples', 'jsm', f), path.join(OUT, 'vendor', 'addons', f));
}
copy(path.join(three, 'LICENSE'), path.join(OUT, 'vendor', 'three-LICENSE'));
copy(path.join(ROOT, 'node_modules', 'peerjs', 'dist', 'peerjs.min.js'), path.join(OUT, 'vendor', 'peerjs.min.js'));
copy(path.join(ROOT, 'node_modules', 'peerjs', 'LICENSE'), path.join(OUT, 'vendor', 'peerjs-LICENSE'));

// Relative vendor paths (the site lives in a sub-folder) and no game server
let html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
html = html.replace('"three": "/vendor/three.module.js", "three/addons/": "/vendor/addons/"', '"three": "./vendor/three.module.js", "three/addons/": "./vendor/addons/"');
html = html.replace('<script type="module" src="client.js"></script>', '<script>window.ARENA_OFFLINE = true; // static site: practice and friend rooms</script>\n  <script type="module" src="client.js"></script>');
if (!html.includes('./vendor/three.module.js')) throw new Error('importmap not rewritten');
fs.writeFileSync(path.join(OUT, 'index.html'), html);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

let files = 0, bytes = 0;
const count = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) count(p); else { files++; bytes += fs.statSync(p).size; } } };
count(OUT);
console.log(`Built ${OUT}: ${files} files, ${(bytes / 1e6).toFixed(1)} MB`);
