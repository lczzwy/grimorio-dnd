import { useEffect } from 'react';
import type { Character, SrdData } from '../../data/types';
import { uid } from '../../engine/character';
import { sheetMigration } from '../../engine/classData';

/**
 * Brings the sheet up to the class data once it is open by its owner (powers from the old
 * hand-written disciplines, pools that follow the class table). Only adds: see sheetMigration.
 */
export function useSheetMigration(c: Character | undefined, srd: SrdData | null, upd: ((fn: (d: Character) => void) => void) | undefined) {
  const fix = c && srd && upd ? sheetMigration(c, srd, uid) : null;
  useEffect(() => {
    if (fix && upd) upd(fix);
    // runs when the sheet or the rules change; once applied, sheetMigration returns null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!fix, c?.id]);
}
