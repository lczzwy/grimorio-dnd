import { describe, expect, it } from 'vitest';
import { diceOfRoll, droppedFlags, forcedNotation, inkFor } from './notation';

describe('dice of a stored roll', () => {
  it('keeps formula order and ignores the flat modifier', () => {
    expect(diceOfRoll('1d20+2d6+3', [17, 3, 5])).toEqual([{ sides: 20, value: 17 }, { sides: 6, value: 3 }, { sides: 6, value: 5 }]);
  });
  it('draws both d20 of advantage', () => {
    expect(diceOfRoll('1d20+5', [18], [12])).toEqual([{ sides: 20, value: 18 }, { sides: 20, value: 12, dropped: true }]);
  });
  it('doubles dice on a critical hit', () => {
    expect(diceOfRoll('1d8+3', [4, 7]).map((d) => d.value)).toEqual([4, 7]);
  });
  it('skips dice the table cannot draw and garbage', () => {
    expect(diceOfRoll('1d3+1d6', [2, 6])).toEqual([{ sides: 6, value: 6 }]);
    expect(diceOfRoll('banana', [1])).toEqual([]);
  });
});

describe('forced notation', () => {
  it('groups consecutive dice of the same size', () => {
    expect(forcedNotation([{ sides: 20, value: 17 }, { sides: 6, value: 3 }, { sides: 6, value: 5 }])).toBe('1d20+2d6@17,3,5');
  });
  it('splits a d100 into tens and units', () => {
    expect(forcedNotation([{ sides: 100, value: 57 }])).toBe('1d100+1d10@50,7');
    expect(forcedNotation([{ sides: 100, value: 100 }])).toBe('1d100+1d10@100,10');
    expect(forcedNotation([{ sides: 100, value: 7 }])).toBe('1d100+1d10@100,7');
    expect(forcedNotation([{ sides: 100, value: 60 }])).toBe('1d100+1d10@60,10');
  });
  it('nothing to draw → null', () => {
    expect(forcedNotation([])).toBeNull();
  });
});

describe('ink', () => {
  it('contrasts with the die colour', () => {
    expect(inkFor('#e0e0e0')).toBe('#111111');
    expect(inkFor('#7a68d9')).toBe('#ffffff');
  });
});

describe('dropped flags', () => {
  it('marks the discarded d20 in library order', () => {
    expect(droppedFlags(diceOfRoll('1d20+5', [18], [12]))).toEqual([false, true]);
    // 1d20+1d4 with advantage: the dropped d20 sits next to the kept one
    const dice = diceOfRoll('1d20+1d4', [15, 3], [9]);
    expect(forcedNotation(dice)).toBe('2d20+1d4@15,9,3');
    expect(droppedFlags(dice)).toEqual([false, true, false]);
  });
  it('a d100 counts as two dice', () => {
    expect(droppedFlags([{ sides: 100, value: 57 }, { sides: 6, value: 2 }])).toEqual([false, false, false]);
  });
});
