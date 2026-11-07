import type { Character, SrdData } from '../data/types';
import { armorClass, classSummary, maxHp, passivePerception } from '../engine/rules';
import { hpBand, type HpBand } from '../engine/hpBand';

export interface PartySummary { name: string; summary: string; hp: number; maxHp: number; temp: number; ac: number; passive: number; conditions: string[]; concentration?: string; dying: boolean; band: HpBand }

export function partySummary(c: Character, srd: SrdData): PartySummary {
  const max = maxHp(c, srd);
  const conc = c.concentration ? srd.spells.find((s) => s.id === c.concentration)?.name ?? c.concentration : undefined;
  return {
    name: c.name || 'Sem nome',
    summary: classSummary(c, srd),
    hp: c.hp.current,
    maxHp: max,
    temp: c.hp.temp,
    ac: armorClass(c, srd).value,
    passive: passivePerception(c, srd),
    conditions: c.conditions,
    concentration: conc,
    dying: c.hp.current <= 0,
    band: hpBand(c.hp.current, max),
  };
}
