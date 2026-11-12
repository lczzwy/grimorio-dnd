import { useEffect, useRef, useState } from 'react';

const PIN_KEY = 'tm-bar-pinned';
const HIDE_AFTER = 3000;
/** the pointer this close to the top brings the bar back */
const EDGE = 10;
/** the pointer this far down counts as "away from the bar" */
const AWAY = 70;

/**
 * The table-mode top bar steps aside when nobody is using it, so the map gets the room: it hides
 * a few seconds after the mouse leaves it, and comes back with the mouse at the top edge, with the
 * keyboard (Tab into it) or from the small tab left at the top. It can be pinned to always show.
 * Touch screens keep it: there is no "mouse at the top" there.
 */
export function useAutoHideBar() {
  const canHover = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
  const [pinned, setPinned] = useState(() => { try { return localStorage.getItem(PIN_KEY) === '1'; } catch { return false; } });
  const [hidden, setHidden] = useState(false);
  const bar = useRef<HTMLElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const active = canHover && !pinned;

  useEffect(() => {
    if (!active) { setHidden(false); return; }
    const cancel = () => { window.clearTimeout(timer.current); timer.current = undefined; };
    // counts once from the moment the pointer left: moving around the map doesn't restart it
    const later = () => {
      if (timer.current !== undefined) return;
      timer.current = window.setTimeout(() => {
        timer.current = undefined;
        // not while someone is using it with the keyboard (a mouse click leaves focus there too,
        // but that one doesn't show as :focus-visible and mustn't keep the bar up)
        const f = document.activeElement;
        if (f && bar.current?.contains(f) && f.matches(':focus-visible')) return;
        setHidden(true);
      }, HIDE_AFTER);
    };
    const move = (e: PointerEvent) => {
      if (e.clientY <= EDGE) { cancel(); setHidden(false); return; }
      const over = bar.current?.contains(e.target as Node);
      if (over) { cancel(); return; }
      if (e.clientY > AWAY) later();
    };
    const focus = (e: FocusEvent) => { if (bar.current?.contains(e.target as Node)) { cancel(); setHidden(false); } };
    window.addEventListener('pointermove', move);
    window.addEventListener('focusin', focus);
    later(); // shown when the table opens, then out of the way
    return () => {
      cancel();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('focusin', focus);
    };
  }, [active]);

  const togglePin = () => setPinned((v) => {
    try { localStorage.setItem(PIN_KEY, v ? '0' : '1'); } catch { /* private mode */ }
    return !v;
  });
  return { bar, hidden: active && hidden, pinned, canHover, togglePin, show: () => setHidden(false) };
}
