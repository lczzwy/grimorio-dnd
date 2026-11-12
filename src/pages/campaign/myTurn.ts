import { useEffect, useRef, useState } from 'react';

const SOUND_KEY = 'my-turn-sound';

/** Two soft notes, made on the spot (no sound file to load). */
function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new Ctx();
    [[660, 0], [880, 0.16]].forEach(([f, t]) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ac.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t + 0.35);
      o.connect(g).connect(ac.destination);
      o.start(ac.currentTime + t);
      o.stop(ac.currentTime + t + 0.4);
    });
    window.setTimeout(() => void ac.close(), 900);
  } catch { /* no audio here */ }
}

/**
 * "É a sua vez": when the turn reaches the player's character, a notice on screen for a few
 * seconds, a short chime (can be turned off) and the tab title blinks while the tab is in the back.
 * `turnKey` is null when it isn't this player's turn; it changes on each new turn of theirs.
 */
export function useMyTurn(turnKey: string | null) {
  const [show, setShow] = useState(false);
  const [sound, setSound] = useState(() => { try { return localStorage.getItem(SOUND_KEY) !== '0'; } catch { return true; } });
  const seen = useRef<string | null | undefined>(undefined);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  useEffect(() => {
    const first = seen.current === undefined;
    seen.current = turnKey;
    // opening the page in the middle of your own turn shows the notice too, without the chime
    if (!turnKey) { setShow(false); return; }
    setShow(true);
    if (!first && soundRef.current) chime();
    const hide = window.setTimeout(() => setShow(false), 6000);
    let blink: number | undefined;
    const title = document.title;
    if (document.hidden) {
      let on = false;
      blink = window.setInterval(() => { on = !on; document.title = on ? '\u2694 Sua vez!' : title; }, 900);
    }
    const back = () => { if (!document.hidden && blink) { window.clearInterval(blink); blink = undefined; document.title = title; } };
    document.addEventListener('visibilitychange', back);
    return () => {
      window.clearTimeout(hide);
      if (blink) { window.clearInterval(blink); document.title = title; }
      document.removeEventListener('visibilitychange', back);
    };
  }, [turnKey]);

  const toggleSound = () => setSound((v) => {
    try { localStorage.setItem(SOUND_KEY, v ? '0' : '1'); } catch { /* private mode */ }
    if (!v) chime();
    return !v;
  });
  return { show, dismiss: () => setShow(false), sound, toggleSound };
}
