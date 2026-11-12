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
