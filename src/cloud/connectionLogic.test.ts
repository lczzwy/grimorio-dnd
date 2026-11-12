import { describe, expect, it } from 'vitest';
import { CONN_START, connStep, DOWN_AFTER } from './connectionLogic';

describe('connection watch', () => {
  it('ignores a short blip', () => {
    let r = connStep(CONN_START, false, 1000);
    expect(r.state.down).toBe(false);
    r = connStep(r.state, true, 2000);
    expect(r).toEqual({ state: CONN_START, recovered: false });
  });
  it('shows the notice after a real drop and asks for a fresh load when it comes back', () => {
    let r = connStep(CONN_START, false, 1000);
    r = connStep(r.state, false, 1000 + DOWN_AFTER - 1);
    expect(r.state.down).toBe(false);
    r = connStep(r.state, false, 1000 + DOWN_AFTER);
    expect(r.state.down).toBe(true);
    r = connStep(r.state, false, 99999);
    expect(r.state).toEqual({ badSince: 1000, down: true });
    r = connStep(r.state, true, 100000);
    expect(r).toEqual({ state: CONN_START, recovered: true });
  });
});
