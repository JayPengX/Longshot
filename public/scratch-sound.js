// The scratch's sound (scratch-ticket.js): a coin on latex, soft (a gentle
// rustle well under the phone's other sounds, never a hiss), a little louder the faster the finger goes, silent when it stops; a tick as a
// scratch-off comes off; a soft chime as a win shows. Made here (Web Audio),
// no files. On an iPhone it plays with the silent switch on too (a
// `playback` audio session while a card is scratched, back to `auto` when
// the sheet closes: Web Audio left to itself is muted by the switch); iOS
// opens audio only from a touch that ends, so every touch and lift wakes it.
// The speaker button turns it off here for good (kept on this device).

const KEY = 'longshot.scratchSound';
let on = true;
try {
  on = localStorage.getItem(KEY) !== 'off';
} catch {}
export const soundOn = () => on;
export function setSoundOn(v) {
  on = Boolean(v);
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {}
  if (!on) rub(0), session('auto');
}

const session = type => {
  try {
    if (navigator.audioSession && navigator.audioSession.type !== type) navigator.audioSession.type = type;
  } catch {}
};
let ac = null;
let grit = null;
let tone = null;
let level = null;
// Started inside a touch (iOS opens audio only from one).
export function wake() {
  if (!on) return;
  session('playback');
  if (!ac) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    // A second of grit: noise in short uneven bursts (a coin catching on the
    // latex's grain), not a smooth hiss.
    const n = ac.sampleRate;
    const buf = ac.createBuffer(1, n, n);
    const d = buf.getChannelData(0);
    let env = 0;
    let target = 0;
    for (let i = 0; i < n; i++) {
      if (Math.random() < 0.004) target = Math.random() < 0.7 ? 0.35 + Math.random() * 0.65 : 0.08;
      env += (target - env) * 0.02;
      d[i] = (Math.random() * 2 - 1) * env * (Math.random() < 0.02 ? 2.2 : 1);
    }
    grit = ac.createBufferSource();
    grit.buffer = buf;
    grit.loop = true;
    tone = ac.createBiquadFilter();
    tone.type = 'bandpass';
    tone.frequency.value = 1400;
    tone.Q.value = 0.7;
    // (Its top cut: the shrill part is what hurt.)
    const soft = ac.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 3200;
    const air = ac.createBiquadFilter();
    air.type = 'highpass';
    air.frequency.value = 400;
    level = ac.createGain();
    level.gain.value = 0;
    grit.connect(tone).connect(soft).connect(air).connect(level).connect(ac.destination);
    grit.start();
  }
  if (ac.state !== 'running') {
    ac.resume().catch(() => {});
    // (A silent sample inside the touch: what unlocks an older iPhone.)
    try {
      const s = ac.createBufferSource();
      s.buffer = ac.createBuffer(1, 1, 22050);
      s.connect(ac.destination);
      s.start(0);
    } catch {}
  }
}

// The finger's speed (CSS px a millisecond): 0 stops it.
export function rub(speed) {
  if (!ac || !level) return;
  const now = ac.currentTime;
  const v = on ? Math.min(1, speed / 1.6) : 0;
  level.gain.setTargetAtTime(v * 0.1, now, v ? 0.03 : 0.05);
  tone.frequency.setTargetAtTime(1200 + v * 700, now, 0.05);
  grit.playbackRate.setTargetAtTime(0.85 + v * 0.4 + Math.random() * 0.08, now, 0.05);
}

// A short click: a scratch-off coming off.
export function tick() {
  if (!on || !ac) return;
  const now = ac.currentTime;
  const len = Math.floor(ac.sampleRate * 0.025);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1200;
  const g = ac.createGain();
  g.gain.value = 0.06;
  src.connect(hp).connect(g).connect(ac.destination);
  src.start(now);
}

// A win showing (big: the card's prize, a little rising run).
export function chime(big = false) {
  if (!on || !ac) return;
  const now = ac.currentTime;
  const notes = big ? [784, 988, 1175, 1568] : [1175, 1568];
  notes.forEach((f, i) => {
    const t = now + i * (big ? 0.09 : 0.07);
    const o = ac.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(big ? 0.06 : 0.04, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 0.9 : 0.45));
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + 1);
  });
}

// The sheet closed: quiet, and the audio let go.
export function rest() {
  rub(0);
  if (ac && ac.state === 'running') setTimeout(() => ac?.state === 'running' && level?.gain.value < 0.01 && ac.suspend().catch(() => {}), 300);
  // (Other apps' music back as it was.)
  session('auto');
}
