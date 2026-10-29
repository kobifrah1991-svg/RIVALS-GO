// Online play without a game server: one player hosts the match in their own browser or app,
// friends connect to that device directly over WebRTC data channels. PeerJS's free public broker
// (0.peerjs.com) only introduces the devices; game traffic then flows device to device.
// Both sockets mimic the small part of the WebSocket API the client uses.
import { createGame } from './shared/game.js';

const PREFIX = 'arenarush-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

let libPromise = null;
function loadLib() {
  if (window.peerjs?.Peer) return Promise.resolve(window.peerjs.Peer);
  libPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = window.ARENA_PEERJS_URL || 'vendor/peerjs.min.js';
    s.onload = () => (window.peerjs?.Peer ? resolve(window.peerjs.Peer) : reject(new Error('peerjs')));
    s.onerror = () => { libPromise = null; reject(new Error('peerjs')); };
    document.head.appendChild(s);
  });
  return libPromise;
}

// window.ARENA_PEER can point at your own PeerServer: { host, port, path, secure }
function openPeer(Peer, id) {
  return new Promise((resolve, reject) => {
    const peer = new Peer(id, { debug: 0, ...(window.ARENA_PEER || {}), config: { iceServers: ICE } });
    peer.once('open', () => resolve(peer));
    peer.once('error', (e) => { peer.destroy(); reject(e); });
  });
}

const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
export const validCode = (code) => new RegExp(`^[${CODE_CHARS}]{5}$`).test(code);

// Why a P2P attempt failed, as an i18n key
export function p2pErrorKey(e) {
  if (e?.type === 'peer-unavailable') return 'p2p.notFound';
  if (e?.message === 'timeout') return 'p2p.timeout';
  return 'p2p.failed';
}

export class P2PHostSocket {
  constructor({ mode }) {
    this.readyState = 0;
    this.code = null;
    this.start(mode).catch((e) => { this.readyState = 3; this.onerror?.(e); });
  }

  async start(mode) {
    const Peer = await loadLib();
    for (let attempt = 0; !this.peer; attempt++) {
      const code = randomCode();
      try { this.peer = await openPeer(Peer, PREFIX + code); this.code = code; } catch (e) {
        if (e?.type !== 'unavailable-id' || attempt >= 3) throw e; // code taken: try another
      }
    }
    this.match = createGame({ mode });
    this.match.start();
    // The host's own client talks to the match in memory, like offline practice
    const toClient = { readyState: 1, send: (s) => setTimeout(() => this.onmessage?.({ data: s }), 0), close() {} };
    this.conn = this.match.connect(toClient);
    this.peer.on('connection', (dc) => this.guest(dc));
    this.peer.on('disconnected', () => { if (!this.peer.destroyed) this.peer.reconnect(); }); // broker lost: running games continue
    this.readyState = 1;
    this.onopen?.();
  }

  guest(dc) {
    let player = null;
    const sock = { get readyState() { return dc.open ? 1 : 3; }, send: (s) => dc.send(s), close: () => dc.close() };
    dc.on('open', () => { player = this.match.connect(sock); });
    dc.on('data', (d) => { if (typeof d === 'string' && d.length < 20000) player?.message(d); });
    dc.on('close', () => player?.close());
    dc.on('error', () => player?.close());
  }

  send(s) { this.conn?.message(s); }
  close() { this.match?.stop(); this.peer?.destroy(); this.readyState = 3; }
}

export class P2PGuestSocket {
  constructor(code) {
    this.readyState = 0;
    this.start(code).catch((e) => { this.readyState = 3; this.peer?.destroy(); this.onerror?.(e); });
  }

  async start(code) {
    const Peer = await loadLib();
    this.peer = await openPeer(Peer, undefined);
    const dc = this.peer.connect(PREFIX + code, { reliable: true, serialization: 'raw' });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 15000);
      dc.on('open', () => { clearTimeout(timer); resolve(); });
      this.peer.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
    this.dc = dc;
    dc.on('data', (d) => this.onmessage?.({ data: d }));
    dc.on('close', () => { this.readyState = 3; this.onclose?.(); });
    this.readyState = 1;
    this.onopen?.();
  }

  send(s) { if (this.dc?.open) this.dc.send(s); }
  close() { this.peer?.destroy(); this.readyState = 3; }
}
