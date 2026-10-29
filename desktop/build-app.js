// Copies the web game into desktop/app/ so Electron can serve it from app://game/
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(__dirname, 'app');
fs.rmSync(out, { recursive: true, force: true });
const copy = (from, to) => fs.cpSync(path.join(root, from), path.join(out, to), { recursive: true });
copy('public', '.');
copy('shared', 'shared');
copy('node_modules/three/build/three.module.js', 'vendor/three.module.js');
copy('node_modules/three/examples/jsm', 'vendor/addons');
copy('node_modules/peerjs/dist/peerjs.min.js', 'vendor/peerjs.min.js'); // rooms with friends (WebRTC)
// Desktop server list: on-device practice plus the online servers in desktop/servers.json
fs.copyFileSync(path.join(__dirname, 'servers.json'), path.join(out, 'servers.json'));
console.log('Desktop app files ready in', out);
