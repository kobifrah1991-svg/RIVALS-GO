// Voice chat: push-to-talk audio sent straight between players' devices (WebRTC).
// The game connection only carries the short handshake ('rtc' messages); audio never passes
// through the game server or the host. Works the same with a server and in P2P rooms.
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

export function createVoice(signal) {
  const peers = new Map(); // player id -> { pc, audio, tr, pending }
  let myId = null, micTrack = null, micPromise = null, enabled = true;
  const muted = new Set();

  function drop(id) {
    const p = peers.get(id);
    if (!p) return;
    p.pc.close();
    p.audio.srcObject = null;
    peers.delete(id);
  }

  function makePeer(id, offerer) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const audio = new Audio();
    audio.autoplay = true;
    audio.muted = !enabled || muted.has(id);
    const p = { pc, audio, tr: null, pending: [] };
    if (offerer) p.tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
    pc.ontrack = (e) => { audio.srcObject = e.streams[0] || new MediaStream([e.track]); audio.play().catch(() => {}); };
    pc.onicecandidate = (e) => { if (e.candidate) signal(id, { ice: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') drop(id); };
    peers.set(id, p);
    return p;
  }

  async function attachMic(p) {
    if (p.tr && micTrack) await p.tr.sender.replaceTrack(micTrack).catch(() => {});
  }

  // Keep one connection per other human in the room; the lower id makes the offer (no glare)
  async function sync(myNewId, humanIds) {
    myId = myNewId;
    for (const id of [...peers.keys()]) if (!humanIds.includes(id)) drop(id);
    for (const id of humanIds) {
      if (id === myId || peers.has(id) || !(myId < id)) continue;
      const p = makePeer(id, true);
      try {
        await attachMic(p);
        await p.pc.setLocalDescription(await p.pc.createOffer());
        signal(id, { sdp: p.pc.localDescription.toJSON() });
      } catch (e) { console.warn('voice', e); drop(id); }
    }
  }

  async function onSignal(from, data) {
    try {
      if (data.sdp?.type === 'offer') {
        drop(from); // a fresh offer replaces any stale connection
        const p = makePeer(from, false);
        await p.pc.setRemoteDescription(data.sdp);
        p.tr = p.pc.getTransceivers()[0];
        if (p.tr) p.tr.direction = 'sendrecv';
        await attachMic(p);
        await p.pc.setLocalDescription(await p.pc.createAnswer());
        signal(from, { sdp: p.pc.localDescription.toJSON() });
        for (const c of p.pending.splice(0)) await p.pc.addIceCandidate(c);
      } else if (data.sdp?.type === 'answer') {
        const p = peers.get(from);
        if (!p) return;
        await p.pc.setRemoteDescription(data.sdp);
        for (const c of p.pending.splice(0)) await p.pc.addIceCandidate(c);
      } else if (data.ice) {
        const p = peers.get(from);
        if (!p) return;
        if (p.pc.remoteDescription) await p.pc.addIceCandidate(data.ice);
        else p.pending.push(data.ice);
      }
    } catch (e) { console.warn('voice', e); }
  }

  // Microphone is opened on the first push-to-talk, and only sends while the key/button is held
  async function talk(on) {
    if (!enabled) return false;
    if (on && !micTrack) {
      micPromise ||= navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
        .then((stream) => { micTrack = stream.getAudioTracks()[0]; micTrack.enabled = false; return Promise.all([...peers.values()].map(attachMic)); })
        .catch((e) => { micPromise = null; throw e; });
      try { await micPromise; } catch { return false; }
    }
    if (micTrack) micTrack.enabled = on;
    return true;
  }

  function setEnabled(v) {
    enabled = v;
    if (!v && micTrack) micTrack.enabled = false;
    for (const [id, p] of peers) p.audio.muted = !v || muted.has(id);
  }
  function setMuted(id, v) {
    if (v) muted.add(id); else muted.delete(id);
    const p = peers.get(id);
    if (p) p.audio.muted = !enabled || v;
  }
  // Audio bytes received so far (diagnostics)
  async function received() {
    let n = 0;
    for (const p of peers.values()) (await p.pc.getStats()).forEach((r) => { if (r.type === 'inbound-rtp' && r.kind === 'audio') n += r.bytesReceived; });
    return n;
  }
  const connected = () => [...peers.values()].filter((p) => p.pc.connectionState === 'connected').length;

  return { sync, onSignal, talk, setEnabled, setMuted, connected, received, close: () => [...peers.keys()].forEach(drop) };
}
