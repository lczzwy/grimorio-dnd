import { create } from 'zustand';

/**
 * "Desfazer" for the last life change (damage typed wrong, healed the wrong person): one notice
 * at the bottom for a few seconds with a button. A new change replaces the previous offer.
 */
interface Offer { label: string; run: () => unknown; key: number }
export const useUndo = create<{ offer: Offer | null; set: (o: Offer | null) => void }>((set) => ({ offer: null, set: (offer) => set({ offer }) }));

export const STAY_MS = 12000;

export function offerUndo(label: string, run: () => unknown) {
  useUndo.getState().set({ label, run, key: Date.now() });
}

