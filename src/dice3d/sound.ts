// Dice clatter synthesised with Web Audio: short filtered noise clicks that thin out as the dice settle.
// No audio files are shipped.

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function click(at: number, gain: number, pitch: number) {
  const a = ctx!;
  const src = a.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.8 + Math.random() * 0.5;
  const band = a.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = pitch;
  band.Q.value = 2.5;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.06);
  src.connect(band).connect(g).connect(a.destination);
  src.start(at);
}

/** Plays the sound of `count` dice hitting the table and settling (~1.3 s). */
export function playDiceSound(count: number, volume = 0.6) {
  const a = audio();
  if (!a || !noise) return;
  const now = a.currentTime + 0.25; // dice enter from the edge before the first hit
  const dice = Math.min(count, 8);
  for (let d = 0; d < dice; d++) {
    const pitch = 1800 + Math.random() * 1600;
    let t = now + Math.random() * 0.15;
    let gap = 0.09;
    let g = volume * (0.7 + Math.random() * 0.3);
    // bounces get closer together and quieter
    for (let b = 0; b < 7 && g > 0.02; b++) {
      click(t, g, pitch * (1 + (Math.random() - 0.5) * 0.3));
      t += gap + Math.random() * 0.04;
      gap *= 0.78;
      g *= 0.6;
    }
  }
}

/** Browsers only allow audio after a user gesture: call from any click to unlock it early. */
export function unlockAudio() {
  audio();
}

/** Natural 20: a short bright chime, two bell-like partials rising. */
export function playCritSound(volume = 0.35) {
  const a = audio();
  if (!a) return;
  const now = a.currentTime + 0.02;
  [[880, 0], [1318.5, 0.09], [1760, 0.18]].forEach(([f, dt]) => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'triangle';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, now + dt);
    g.gain.exponentialRampToValueAtTime(volume, now + dt + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dt + 0.9);
    o.connect(g).connect(a.destination);
    o.start(now + dt);
    o.stop(now + dt + 1);
  });
}

/** Natural 1: a dull low thud sliding down. */
export function playFumbleSound(volume = 0.45) {
  const a = audio();
  if (!a) return;
  const now = a.currentTime + 0.02;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(140, now);
  o.frequency.exponentialRampToValueAtTime(55, now + 0.5);
  g.gain.setValueAtTime(volume, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
  o.connect(g).connect(a.destination);
  o.start(now);
  o.stop(now + 0.65);
}

/** New chat message while the tab is in the background: a soft two-note "pop". */
export function playMessageSound(volume = 0.18) {
  const a = audio();
  if (!a) return;
  const now = a.currentTime + 0.02;
  [[660, 0], [990, 0.08]].forEach(([f, dt]) => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, now + dt);
    g.gain.exponentialRampToValueAtTime(volume, now + dt + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dt + 0.22);
    o.connect(g).connect(a.destination);
    o.start(now + dt);
    o.stop(now + dt + 0.25);
  });
}
