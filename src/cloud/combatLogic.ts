export interface Effect { id: string; name: string; kind: 'buff' | 'debuff'; rounds?: number; visible: boolean }

/** Initiative order: highest first, not-yet-rolled last, ties by manual `sort`. */
export function sortCombatants<T extends { initiative: number | null; sort: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.initiative == null && b.initiative == null) return a.sort - b.sort;
    if (a.initiative == null) return 1;
    if (b.initiative == null) return -1;
    return b.initiative - a.initiative || a.sort - b.sort;
  });
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
