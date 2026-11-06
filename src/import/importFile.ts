import { loadSrd } from '../data/srd';
import { useApp } from '../store';
import { importCompanion, type CompanionFile } from './companion';

/** Imports a 5e Companion export as a 2014 character, registering its non-SRD content as homebrew. */
export async function importCompanionCharacter(raw: CompanionFile) {
  const { character, homebrew, warnings } = importCompanion(raw, await loadSrd('2014'));
  const app = useApp.getState();
  app.importHomebrew('2014', homebrew);
  app.addCharacter(character);
  const created = Object.values(homebrew).flat().map((x) => (x as { name: string }).name);
  return { character, created, warnings };
}

export function companionReport(created: string[], warnings: string[]) {
  return [
    created.length ? `Conteúdo novo cadastrado no Homebrew (2014):\n• ${created.join('\n• ')}` : '',
    warnings.length ? `Avisos:\n• ${warnings.join('\n• ')}` : '',
  ].filter(Boolean).join('\n\n');
}
