import type { SrdData } from './types';

export type HomebrewKind = 'spells' | 'feats' | 'species' | 'backgrounds' | 'equipment' | 'magicItems' | 'subclasses' | 'classes';
export type Homebrew = Partial<Pick<SrdData, HomebrewKind>>;

export const HOMEBREW_KINDS: HomebrewKind[] = ['species', 'classes', 'subclasses', 'backgrounds', 'feats', 'spells', 'equipment', 'magicItems'];

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown) => typeof x === 'string';
const arr = (x: unknown) => Array.isArray(x);

const slug = (s: string) =>
  'hb-' + s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Fields each kind needs so the rest of the app can render it without crashing. */
const REQUIRED: Record<HomebrewKind, (x: Obj) => boolean> = {
  species: () => true,
  backgrounds: () => true,
  feats: (x) => str(x.desc),
  spells: (x) => typeof x.level === 'number' && str(x.desc),
  equipment: (x) => str(x.category),
  magicItems: (x) => str(x.desc),
  subclasses: (x) => str(x.class) && arr(x.features),
  classes: (x) => typeof x.hitDie === 'number' && arr(x.levels) && arr(x.saves) && arr(x.profs),
};

export interface SanitizeResult { homebrew: Homebrew; kept: number; dropped: number; ignoredKeys: string[] }

/**
 * Keeps only known homebrew kinds and well-formed entries (string name + required fields).
 * Missing ids are derived from the name. Anything else is dropped and counted.
 */
export function sanitizeHomebrew(input: unknown): SanitizeResult {
  const out: Homebrew = {};
  let kept = 0;
  let dropped = 0;
  const ignoredKeys: string[] = [];
  if (!isObj(input)) return { homebrew: out, kept, dropped, ignoredKeys };
  for (const [key, value] of Object.entries(input)) {
    if (!HOMEBREW_KINDS.includes(key as HomebrewKind)) {
      ignoredKeys.push(key);
      continue;
    }
    const kind = key as HomebrewKind;
    if (!arr(value)) {
      ignoredKeys.push(key);
      continue;
    }
    const items: Obj[] = [];
    const seen = new Set<string>();
    for (const raw of value as unknown[]) {
      if (!isObj(raw) || !str(raw.name) || !(raw.name as string).trim() || !REQUIRED[kind](raw)) {
        dropped++;
        continue;
      }
      const id = str(raw.id) && (raw.id as string) ? (raw.id as string) : slug(raw.name as string);
      if (seen.has(id)) continue;
      seen.add(id);
      items.push({ ...raw, id, custom: true });
    }
    if (items.length) (out as Record<string, Obj[]>)[kind] = items;
    kept += items.length;
  }
  return { homebrew: out, kept, dropped, ignoredKeys };
}

/**
 * Merges sanitized homebrew into existing homebrew.
 * `keepExisting`: entries already present (same id) win — used by character imports so a
 * re-imported sheet never replaces content the user edited or translated.
 */
export function mergeHomebrew(existing: Homebrew, incoming: Homebrew, keepExisting = false): Homebrew {
  const out: Record<string, { id: string }[]> = { ...(existing as Record<string, { id: string }[]>) };
  for (const [k, list] of Object.entries(incoming) as [string, { id: string }[]][]) {
    const cur = out[k] || [];
    if (keepExisting) {
      const have = new Set(cur.map((x) => x.id));
      out[k] = [...cur, ...list.filter((x) => !have.has(x.id))];
    } else {
      const ids = new Set(list.map((x) => x.id));
      out[k] = [...cur.filter((x) => !ids.has(x.id)), ...list];
    }
  }
  return out as Homebrew;
}
