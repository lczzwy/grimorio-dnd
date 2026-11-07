import { create } from 'zustand';

/**
 * Holds back a new roll from the chat while its 3D dice are still tumbling, so the table sees the
 * dice settle first and the result lands in the chat at that moment.
 */
interface RevealState {
  /** a dice table is on screen and animating rolls */
  active: boolean;
  hidden: Record<string, true>;
  setActive: (on: boolean) => void;
  hide: (id: string) => void;
  reveal: (id: string) => void;
}

const SAFETY_MS = 12000;

export const useReveal = create<RevealState>((set, get) => ({
  active: false,
  hidden: {},
  setActive: (active) => set(active ? { active } : { active, hidden: {} }),
  hide: (id) => {
    if (!get().active) return;
    set((s) => ({ hidden: { ...s.hidden, [id]: true } }));
    // never keep a roll out of the chat for long, whatever happens to the animation
    setTimeout(() => get().reveal(id), SAFETY_MS);
  },
  reveal: (id) => {
    if (!get().hidden[id]) return;
    set((s) => {
      const hidden = { ...s.hidden };
      delete hidden[id];
      return { hidden };
    });
  },
}));
