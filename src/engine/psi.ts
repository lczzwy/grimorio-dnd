import type { Character, Resource } from '../data/types';

// Mystic table (Unearthed Arcana): psi points and psi limit by mystic level 1–20.
const PSI_POINTS = [4, 6, 14, 17, 27, 32, 38, 44, 57, 64, 64, 64, 64, 64, 64, 64, 64, 71, 71, 71];
const PSI_LIMIT = [2, 2, 3, 3, 5, 5, 6, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7];

export const isPsiResource = (r: Pick<Resource, 'name'>) => /psi point|pontos? ps[ií]quicos?/i.test(r.name);

/** Mystic level if the character has a mystic class, else total level. */
export function psiLevel(c: Character) {
  const mystic = c.classes.find((e) => /mystic|m[ií]stico/i.test(e.classId));
  const total = c.classes.reduce((t, e) => t + e.level, 0);
  return Math.min(20, Math.max(1, mystic?.level ?? total));
}

export const psiTable = (level: number) => ({ points: PSI_POINTS[level - 1], limit: PSI_LIMIT[level - 1] });

export function psiPool(c: Character) {
  const res = c.resources.find(isPsiResource);
  if (!res) return null;
  const { limit } = psiTable(psiLevel(c));
  return { resource: res, max: res.max, left: res.max - res.used, limit };
}

export interface PsiOption { name: string; min: number; max: number; conc: boolean; note?: string }

/**
 * Finds psi-costed options in a discipline text, e.g. "**Inertial Armor (2 psi).**",
 * "Combustion (1–7 psi; conc., 1 min.)" or "- Ethereal Weapon (1 psi): …".
 */
export function parsePsiOptions(desc: string): PsiOption[] {
  // \p{L}: option names may be translated (accents, e.g. "Barreira Telecinética")
  const re = /(\p{Lu}[\p{L}\d’' -]{1,45}?) \((\d+)(?:\s*[–-]\s*(\d+))? psi(?:;\s*([^)]*))?\)/gu;
  const out: PsiOption[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(desc))) {
    const name = m[1].replace(/^\*+|\*+$/g, '').trim();
    if (seen.has(name)) continue;
    seen.add(name);
    const min = +m[2];
    out.push({ name, min, max: m[3] ? +m[3] : min, conc: /conc/i.test(m[4] || ''), note: m[4]?.trim() || undefined });
  }
  return out;
}

export const hasPsychicFocus = (desc: string) => /psychic focus|foco ps[ií]quico/i.test(desc);
