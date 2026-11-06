import type { Character, Edition } from './types';
import { mergeHomebrew, sanitizeHomebrew, type Homebrew } from './homebrew';
import { normalizeCharacter } from '../engine/character';

export interface BackupFile {
  app: 'grimorio';
  kind: 'backup';
  version: 1;
  exportedAt: string;
  characters: Character[];
  homebrew: Record<Edition, Homebrew>;
}

export const makeBackup = (characters: Character[], homebrew: Record<Edition, Homebrew>): BackupFile => ({
  app: 'grimorio',
  kind: 'backup',
  version: 1,
  exportedAt: new Date().toISOString(),
  characters,
  homebrew,
});

export const isBackupFile = (x: unknown): x is BackupFile =>
  !!x && typeof x === 'object' && (x as BackupFile).app === 'grimorio' && (x as BackupFile).kind === 'backup';

export interface RestoreResult {
  characters: Character[];
  homebrew: Record<Edition, Homebrew>;
  added: number;
  updated: number;
  kept: number;
}

/**
 * Merges a backup into the current data without losing anything:
 * new characters are added; for a character present in both, the most recently edited copy wins.
 * Homebrew from the backup is validated and merged (backup entries replace same-id entries).
 */
export function restoreBackup(current: { characters: Character[]; homebrew: Record<Edition, Homebrew> }, backup: BackupFile): RestoreResult {
  const byId = new Map(current.characters.map((c) => [c.id, c]));
  let added = 0;
  let updated = 0;
  let kept = 0;
  for (const raw of Array.isArray(backup.characters) ? backup.characters : []) {
    if (!raw || (raw.edition !== '2014' && raw.edition !== '2024') || typeof raw.id !== 'string') continue;
    const c = normalizeCharacter(raw);
    const mine = byId.get(c.id);
    if (!mine) {
      byId.set(c.id, c);
      added++;
    } else if ((c.updatedAt || 0) > (mine.updatedAt || 0)) {
      byId.set(c.id, c);
      updated++;
    } else kept++;
  }
  const homebrew = { ...current.homebrew };
  for (const ed of ['2014', '2024'] as Edition[]) {
    homebrew[ed] = mergeHomebrew(current.homebrew[ed] || {}, sanitizeHomebrew(backup.homebrew?.[ed]).homebrew);
  }
  return { characters: [...byId.values()], homebrew, added, updated, kept };
}
