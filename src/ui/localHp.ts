/**
 * When the player damages their own sheet, the sheet already asks for the concentration save;
 * the watcher for damage coming from the GM skips changes made here a moment ago.
 */
let localAt = 0;
export const markLocalHpChange = () => { localAt = Date.now(); };
export const changedHereRecently = (ms = 2000) => Date.now() - localAt < ms;
