import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Character, Edition, RollEntry } from './data/types';
import { normalizeCharacter, uid } from './engine/character';
import { rollFormula, type RollMode } from './engine/dice';

import { mergeHomebrew, sanitizeHomebrew, type Homebrew, type HomebrewKind, type SanitizeResult } from './data/homebrew';
export type { Homebrew, HomebrewKind } from './data/homebrew';
import { restoreBackup, type BackupFile, type RestoreResult } from './data/backup';

interface AppState {
  characters: Character[];
  homebrew: Record<Edition, Homebrew>;
  addCharacter: (c: Character) => void;
  updateCharacter: (id: string, fn: (c: Character) => void) => void;
  removeCharacter: (id: string) => void;
  duplicateCharacter: (id: string) => string | undefined;
  importCharacter: (raw: unknown) => Character;
  addHomebrew: (ed: Edition, kind: HomebrewKind, item: { id: string; name: string }) => void;
  removeHomebrew: (ed: Edition, kind: HomebrewKind, id: string) => void;
  importHomebrew: (ed: Edition, hb: unknown, opts?: { keepExisting?: boolean }) => SanitizeResult;
  lastBackupAt?: number;
  markBackup: () => void;
  restore: (b: BackupFile) => RestoreResult;
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      characters: [],
      homebrew: { '2014': {}, '2024': {} },
      markBackup: () => set({ lastBackupAt: Date.now() }),
      restore: (b) => {
        const r = restoreBackup({ characters: get().characters, homebrew: get().homebrew }, b);
        set({ characters: r.characters, homebrew: r.homebrew });
        return r;
      },
      addCharacter: (c) => set((s) => ({ characters: [...s.characters, c] })),
      updateCharacter: (id, fn) =>
        set((s) => ({
          characters: s.characters.map((c) => {
            if (c.id !== id) return c;
            const copy = structuredClone(c);
            fn(copy);
            copy.updatedAt = Date.now();
            return copy;
          }),
        })),
      removeCharacter: (id) => set((s) => ({ characters: s.characters.filter((c) => c.id !== id) })),
      duplicateCharacter: (id) => {
        const src = get().characters.find((c) => c.id === id);
        if (!src) return;
        const copy = { ...structuredClone(src), id: uid(), name: src.name + ' (cópia)', createdAt: Date.now(), updatedAt: Date.now() };
        set((s) => ({ characters: [...s.characters, copy] }));
        return copy.id;
      },
      importCharacter: (raw) => {
        const r = raw as Partial<Character>;
        if (!r || typeof r !== 'object' || (r.edition !== '2014' && r.edition !== '2024')) throw new Error('Arquivo não é uma ficha válida.');
        const c = normalizeCharacter({ ...r, edition: r.edition, id: uid(), updatedAt: Date.now() });
        set((s) => ({ characters: [...s.characters, c] }));
        return c;
      },
      addHomebrew: (ed, kind, item) =>
        set((s) => {
          const hb = { ...s.homebrew[ed] };
          const list = ((hb[kind] as { id: string }[] | undefined) || []).filter((x) => x.id !== item.id);
          (hb as Record<string, unknown>)[kind] = [...list, { ...item, custom: true }];
          return { homebrew: { ...s.homebrew, [ed]: hb } };
        }),
      removeHomebrew: (ed, kind, id) =>
        set((s) => {
          const hb = { ...s.homebrew[ed] };
          (hb as Record<string, unknown>)[kind] = ((hb[kind] as { id: string }[] | undefined) || []).filter((x) => x.id !== id);
          return { homebrew: { ...s.homebrew, [ed]: hb } };
        }),
      importHomebrew: (ed, incoming, opts) => {
        const result = sanitizeHomebrew(incoming);
        set((s) => ({ homebrew: { ...s.homebrew, [ed]: mergeHomebrew(s.homebrew[ed], result.homebrew, opts?.keepExisting) } }));
        return result;
      },
    }),
    {
      name: 'grimorio-v1',
      storage: createJSONStorage(() => localStorage),
      version: 2,
      // v1 → v2: drop malformed homebrew (e.g. a character file pasted as a homebrew pack),
      // which used to break the edition's pages on load
      migrate: (persisted) => {
        const st = (persisted || {}) as { characters?: Character[]; homebrew?: Record<string, unknown> };
        return {
          ...st,
          characters: Array.isArray(st.characters) ? st.characters : [],
          homebrew: { '2014': sanitizeHomebrew(st.homebrew?.['2014']).homebrew, '2024': sanitizeHomebrew(st.homebrew?.['2024']).homebrew },
        } as unknown as AppState;
      },
    },
  ),
);

/* ---------------- dice (not persisted) ---------------- */

export interface ActiveRoll extends RollEntry { mode?: RollMode; key: number; charName?: string }

interface DiceState {
  log: ActiveRoll[];
  current?: ActiveRoll;
  mode: RollMode;
  setMode: (m: RollMode) => void;
  /** Rolls dice. At a campaign table the server draws the numbers (null if it could not be reached). */
  roll: (label: string, formula: string, opts?: { mode?: RollMode; crit?: boolean; charName?: string }) => Promise<ActiveRoll | null>;
  dismiss: () => void;
  clear: () => void;
  /** Campaign that receives this page's rolls (set by the sheet / campaign pages). */
  table?: { campaignId: string; hidden: boolean; isGm: boolean };
  setTable: (t?: { campaignId: string; hidden: boolean; isGm: boolean }) => void;
  setHidden: (hidden: boolean) => void;
}

/** A roll as the server drew it (a row of the campaign's rolls table). */
export interface ServerRoll { id: string; formula: string; rolls: number[]; dropped: number[] | null; total: number; kind: string | null }
export type ServerRoller = (table: NonNullable<DiceState['table']>, req: { label: string; formula: string; mode: RollMode; crit: boolean }) => Promise<ServerRoll>;
let serverRoller: ServerRoller | null = null;
/** At a campaign table, dice are drawn by the server so nobody can send a made-up result. */
export function setServerRoller(fn: ServerRoller) {
  serverRoller = fn;
}

let rollKey = 0;
export const useDice = create<DiceState>((set, get) => ({
  log: [],
  mode: 'normal',
  setMode: (m) => set({ mode: m }),
  roll: async (label, formula, opts = {}) => {
    const mode = opts.mode ?? get().mode;
    // advantage toggle is one-shot, like tapping the button before a roll at the table
    set({ mode: 'normal' });
    const table = get().table;
    let entry: ActiveRoll;
    if (table) {
      // at a table only the server may draw: never fall back to a browser roll there
      if (!serverRoller) return null;
      let row: ServerRoll;
      try {
        row = await serverRoller(table, { label, formula, mode, crit: !!opts.crit });
      } catch {
        return null; // the roller already told the player why
      }
      entry = {
        id: row.id,
        key: ++rollKey,
        label,
        formula: row.formula,
        rolls: row.rolls,
        dropped: row.dropped ?? undefined,
        total: row.total,
        kind: row.kind === 'crit' || row.kind === 'fumble' ? row.kind : undefined,
        at: Date.now(),
        mode: row.dropped?.length ? mode : 'normal',
        charName: opts.charName,
      };
    } else {
      // a sheet used on its own: nobody to cheat, the browser draws
      const r = rollFormula(formula, { mode, crit: opts.crit });
      entry = {
        id: uid(),
        key: ++rollKey,
        label,
        formula,
        rolls: r.rolls,
        dropped: r.dropped,
        total: r.total,
        kind: r.natural === 20 ? 'crit' : r.natural === 1 ? 'fumble' : undefined,
        at: Date.now(),
        mode: r.natural != null ? mode : 'normal',
        charName: opts.charName,
      };
    }
    set((s) => ({ current: entry, log: [entry, ...s.log].slice(0, 80) }));
    return entry;
  },
  setTable: (t) => set({ table: t }),
  setHidden: (hidden) => set((s) => (s.table ? { table: { ...s.table, hidden } } : {})),
  dismiss: () => set({ current: undefined }),
  clear: () => set({ log: [] }),
}));
