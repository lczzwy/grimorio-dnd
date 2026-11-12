/**
 * The connection watch, as plain steps (tested on its own). Every check says whether the live
 * connection is up; a short blip is ignored, a real drop shows "Reconectando…", and coming back
 * after a real drop asks for a fresh load of the table (what changed meanwhile was missed).
 */
export interface ConnState { badSince: number | null; down: boolean }
export const CONN_START: ConnState = { badSince: null, down: false };
/** how long the connection must stay down before the notice shows */
export const DOWN_AFTER = 3000;

export function connStep(s: ConnState, ok: boolean, now: number): { state: ConnState; recovered: boolean } {
  if (ok) return { state: CONN_START, recovered: s.down };
  const badSince = s.badSince ?? now;
  return { state: { badSince, down: s.down || now - badSince >= DOWN_AFTER }, recovered: false };
}
