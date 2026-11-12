import type { Ability, Character, ClassDef, SrdData } from '../data/types';
import { levelGains } from './classData';
import { ABILITY_PT, computeScores, maxHp, syncResources } from './rules';

/** What the player chose in the level-up wizard. */
export interface LevelPlan {
  classId: string;
  subclassId?: string;
  hp: { mode: 'avg' | 'roll'; rolled?: number };
  /** choice key (from levelGains) → picked ids (powers, or feats for a 'feats' choice) */
  picks: Record<string, string[]>;
  asi?: { mode: 'plus2' | 'split' | 'feat' | 'later'; a?: Ability; b?: Ability; feat?: string };
}

export const hpAverage = (die: number) => Math.floor(die / 2) + 1;

/** Multiclass rule: meet the new class' minimums and those of every class already taken. */
export function multiclassBlocks(c: Character, srd: SrdData, classId: string): { cls: ClassDef; ability: Ability; min: number }[] {
  if (!c.classes.length || c.classes.some((e) => e.classId === classId)) return [];
  const scores = computeScores(c, srd);
  const out: { cls: ClassDef; ability: Ability; min: number }[] = [];
  for (const id of [classId, ...c.classes.map((e) => e.classId)]) {
    const cls = srd.classes.find((k) => k.id === id);
    const mc = cls?.multiclass;
    if (!cls || !mc) continue;
    for (const p of mc.prereq || []) if (scores[p.ability] < p.min) out.push({ cls, ...p });
    if (mc.prereqAny?.length && !mc.prereqAny.some((p) => scores[p.ability] >= p.min)) out.push({ cls, ...mc.prereqAny[0] });
  }
  return out;
}

/** The sheet after the level, plus a line for the history. Nothing is written yet. */
export function applyLevel(c: Character, srd: SrdData, plan: LevelPlan, mkId: () => string): { next: Character; summary: string; hpGain: number } {
  const g = levelGains(c, srd, plan.classId, plan.subclassId);
  if (!g) throw new Error('Classe não encontrada');
  const d = structuredClone(c);
  const avg = hpAverage(g.cls.hitDie);
  const e = d.classes.find((x) => x.classId === plan.classId);
  if (e) {
    e.level += 1;
    if (plan.subclassId && !e.subclassId) e.subclassId = plan.subclassId;
  } else {
    d.classes.push({ classId: plan.classId, level: 1, subclassId: plan.subclassId || undefined });
    if (c.classes.length && g.cls.multiclass?.profs?.length) d.proficienciesText = [d.proficienciesText, ...g.cls.multiclass.profs].filter(Boolean).join(', ');
  }
  // the max HP adds the class average per level; a roll shifts it by the difference
  if (plan.hp.mode === 'roll' && plan.hp.rolled != null) d.hp.maxBonus += plan.hp.rolled - avg;
  const picked: string[] = [];
  for (const ch of g.choices) {
    for (const id of plan.picks[ch.key] || []) {
      if (ch.choice.list === 'feats') { d.feats.push(id); picked.push(srd.feats.find((f) => f.id === id)?.name || id); }
      else if (!(d.powers || []).includes(id)) { d.powers = [...(d.powers || []), id]; picked.push(srd.powers?.find((p) => p.id === id)?.name || id); }
    }
  }
  const asiText: string[] = [];
  if (g.asi && plan.asi) {
    const scores = computeScores(c, srd);
    const room = (a: Ability) => Math.max(0, 20 - scores[a]);
    const add = (a: Ability | undefined, n: number) => {
      if (!a) return;
      const v = Math.min(n, room(a));
      if (v) { d.extra[a] = (d.extra[a] || 0) + v; asiText.push(`${ABILITY_PT[a].short} +${v}`); }
    };
    if (plan.asi.mode === 'plus2') add(plan.asi.a, 2);
    if (plan.asi.mode === 'split' && plan.asi.a !== plan.asi.b) { add(plan.asi.a, 1); add(plan.asi.b, 1); }
    if (plan.asi.mode === 'feat' && plan.asi.feat) { d.feats.push(plan.asi.feat); picked.push(srd.feats.find((f) => f.id === plan.asi!.feat)?.name || plan.asi.feat); }
  }
  d.resources = syncResources(d, srd, mkId);
  // the gain is counted without a fixed max HP (e.g. imported from another app), which then
  // grows by it too; CON raised by the ASI counts
  const free = (x: Character) => maxHp({ ...x, hp: { ...x.hp, maxOverride: undefined } }, srd);
  const hpGain = free(d) - free(c);
  if (d.hp.maxOverride) d.hp.maxOverride += hpGain;
  d.hp.current = Math.max(0, Math.min(maxHp(d, srd), d.hp.current + hpGain));
  const level = e ? e.level : 1;
  const summary = [`${g.cls.name.replace(/\s*\(.*\)$/, '')} ${level}`, `+${hpGain} PV`, ...asiText, ...picked].join(' · ');
  const { levelHistory, ...snapshot } = c;
  d.levelHistory = [...(levelHistory || []), { at: Date.now(), classId: plan.classId, level, summary, before: structuredClone(snapshot) }].slice(-20);
  return { next: d, summary, hpGain };
}

/** Back to the sheet as it was before the last level (later changes go back too). */
export function undoLevel(c: Character): Character | null {
  const h = c.levelHistory || [];
  const last = h.at(-1);
  if (!last) return null;
  return { ...structuredClone(last.before), levelHistory: h.slice(0, -1) } as Character;
}
