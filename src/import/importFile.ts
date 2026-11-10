import { loadSrd } from '../data/srd';
import { useApp } from '../store';
import type { CompanionFile } from './companion';

/** Imports a 5e Companion export as a 2014 character, registering its non-SRD content as homebrew. */
export async function importCompanionCharacter(raw: CompanionFile) {
  const { importCompanion } = await import('./companion');
  const { character, homebrew, warnings } = importCompanion(raw, await loadSrd('2014'));
  const app = useApp.getState();
  // keep content the user already has (e.g. a translated feat) instead of the sheet's copy
  const before = app.homebrew['2014'];
  app.importHomebrew('2014', homebrew, { keepExisting: true });
  app.addCharacter(character);
  const had = new Set(Object.values(before).flat().map((x) => (x as { id: string }).id));
  const created = Object.values(homebrew).flat().filter((x) => !had.has((x as { id: string }).id)).map((x) => (x as { name: string }).name);
  return { character, created, warnings };
}

export function companionReport(created: string[], warnings: string[]) {
  return [
    created.length ? `Conteúdo novo cadastrado no Homebrew (2014):\n• ${created.join('\n• ')}` : '',
    warnings.length ? `Avisos:\n• ${warnings.join('\n• ')}` : '',
  ].filter(Boolean).join('\n\n');
}
