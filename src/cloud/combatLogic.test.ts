import { describe, expect, it } from 'vitest';
import { MANUAL_ORDER, nextTurnState, turnIndex, reorder, sortCombatants, tickEffects, type Effect } from './combatLogic';

describe('combat logic', () => {
  it('orders by initiative (desc), unrolled last, ties by sort', () => {
    const list = [{ id: 'a', initiative: 12, sort: 1 }, { id: 'b', initiative: null, sort: 0 }, { id: 'c', initiative: 18, sort: 2 }, { id: 'd', initiative: 12, sort: 0 }];
    expect(sortCombatants(list).map((x) => x.id)).toEqual(['c', 'd', 'a', 'b']);
  });
  it('advances turn and wraps into a new round', () => {
    expect(nextTurnState({ round: 1, turn: 0 }, 3)).toEqual({ round: 1, turn: 1, newRound: false });
    expect(nextTurnState({ round: 1, turn: 2 }, 3)).toEqual({ round: 2, turn: 0, newRound: true });
    expect(nextTurnState({ round: 4, turn: 9 }, 0)).toEqual({ round: 4, turn: 0, newRound: false });
  });
  it('finds the acting creature by id, so a list without hidden enemies still points at the right one', () => {
    const gm = [{ id: 'orc' }, { id: 'ana' }, { id: 'bia' }];
    const player = [{ id: 'ana' }, { id: 'bia' }];
    const e = { active: true, turn: 1, turn_id: 'ana' };
    expect(turnIndex(e, gm, true)).toBe(1);
    expect(turnIndex(e, player, false)).toBe(0);
    // a hidden enemy acting: the player sees nobody, the GM sees it
    expect(turnIndex({ active: true, turn: 0, turn_id: 'orc' }, player, false)).toBe(-1);
    expect(turnIndex({ active: true, turn: 0, turn_id: 'orc' }, gm, true)).toBe(0);
    // removed creature: the GM goes on by position; old fights without an id use the position
    expect(turnIndex({ active: true, turn: 2, turn_id: 'gone' }, gm, true)).toBe(2);
    expect(turnIndex({ active: true, turn: 1 }, player, false)).toBe(1);
    expect(turnIndex({ active: false, turn: 0, turn_id: 'ana' }, gm, true)).toBe(-1);
  });
  it('effects with a duration lose a round and disappear at 0; permanent ones stay', () => {
    const fx: Effect[] = [{ id: '1', name: 'Bênção', kind: 'buff', rounds: 2, visible: true }, { id: '2', name: 'Veneno', kind: 'debuff', rounds: 1, visible: true }, { id: '3', name: 'Maldição', kind: 'debuff', visible: false }];
    expect(tickEffects(fx).map((e) => [e.name, e.rounds])).toEqual([['Bênção', 1], ['Maldição', undefined]]);
  });
  it('the GM can drag the order by hand, and that wins over the initiative numbers', () => {
    const list = [{ id: 'orc', initiative: 18, sort: 0 }, { id: 'ana', initiative: 12, sort: 0 }, { id: 'kai', initiative: 5, sort: 0 }];
    const { order, sorts } = reorder(list, 2, 0);
    expect(order.map((x) => x.id)).toEqual(['kai', 'orc', 'ana']);
    const after = list.map((c) => ({ ...c, sort: sorts[c.id] }));
    expect(sortCombatants(after).map((x) => x.id)).toEqual(['kai', 'orc', 'ana']);
    expect(Math.min(...Object.values(sorts))).toBe(MANUAL_ORDER);
  });
});
