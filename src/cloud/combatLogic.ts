export interface Effect { id: string; name: string; kind: 'buff' | 'debuff'; rounds?: number; visible: boolean }

/** Initiative order: highest first, not-yet-rolled last, ties by manual `sort`. */
/** `sort` values from here up mean "the GM put it here by hand": that order wins over the numbers. */
export const MANUAL_ORDER = 1000;

export function sortCombatants<T extends { initiative: number | null; sort: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.sort >= MANUAL_ORDER && b.sort >= MANUAL_ORDER) return a.sort - b.sort;
    if (a.initiative == null && b.initiative == null) return a.sort - b.sort;
    if (a.initiative == null) return 1;
    if (b.initiative == null) return -1;
    return b.initiative - a.initiative || a.sort - b.sort;
  });
}

/** Moves one entry to a new place; returns the new `sort` for each one (all become manual). */
export function reorder<T extends { id: string }>(list: T[], from: number, to: number): { order: T[]; sorts: Record<string, number> } {
  const order = [...list];
  const [moved] = order.splice(from, 1);
  order.splice(Math.max(0, Math.min(order.length, to)), 0, moved);
  return { order, sorts: Object.fromEntries(order.map((c, i) => [c.id, MANUAL_ORDER + i * 10])) };
}

/**
 * Where the acting creature is in this list. By id when the GM saved one (a player's list has no
 * hidden enemies, so the positions differ): -1 when it's someone this list can't see. The GM's
 * full list falls back to the position (old fights, or the acting creature was removed).
 */
export function turnIndex(e: { active: boolean; turn: number; turn_id?: string | null } | null | undefined, list: { id: string }[], full: boolean): number {
  if (!e?.active || !list.length) return -1;
  if (e.turn_id) {
    const i = list.findIndex((c) => c.id === e.turn_id);
    if (i >= 0 || !full) return i;
  } else if (!full) {
    return e.turn < list.length ? e.turn : -1;
  }
  return Math.min(Math.max(0, e.turn), list.length - 1);
}

export function nextTurnState(s: { round: number; turn: number }, count: number) {
  if (count <= 0) return { round: s.round, turn: 0, newRound: false };
  const turn = s.turn + 1;
  return turn >= count ? { round: s.round + 1, turn: 0, newRound: true } : { round: s.round, turn, newRound: false };
}

/** Called at the start of a new round. */
export function tickEffects(effects: Effect[]): Effect[] {
  return effects
    .map((e) => (e.rounds == null ? e : { ...e, rounds: e.rounds - 1 }))
    .filter((e) => e.rounds == null || e.rounds > 0);
}
