import type { Ability, Edition, FeatureRef } from './types';

export interface MonsterAction { name: string; desc: string; toHit?: number; damage?: string; dc?: string }
export interface MonsterDef {
  id: string; name: string; size: string; type: string; ac: number; hp: number; hpDice: string; speed: string;
  scores: Record<Ability, number>; cr: string; xp?: number; senses?: string; languages?: string;
  traits: FeatureRef[]; actions: MonsterAction[]; bonus?: MonsterAction[]; reactions?: MonsterAction[]; legendary?: MonsterAction[];
  resist?: string; immune?: string; vulnerable?: string; condImmune?: string;
}

const cache: Partial<Record<Edition, Promise<MonsterDef[]>>> = {};
export function loadMonsters(ed: Edition): Promise<MonsterDef[]> {
  cache[ed] ||= fetch(`${import.meta.env.BASE_URL}data/monsters-${ed}.json`).then((r) => r.json());
  return cache[ed]!;
}
