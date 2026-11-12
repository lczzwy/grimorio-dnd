import type { Character, PowerDef, PowerListDef, SpellDef, SrdData } from '../data/types';
import { allFeatures, weaponAttacks, type AttackLine } from './rules';
import { featuresShownAsPowers, knownPowers, powerLists } from './classData';

export type TurnSlot = 'action' | 'bonus' | 'reaction';

export type TurnOption =
  | { kind: 'attack'; name: string; attack: AttackLine }
  | { kind: 'spell'; name: string; spell: SpellDef }
  | { kind: 'feature'; name: string; source: string; desc: string }
  | { kind: 'power'; name: string; power: PowerDef; list?: PowerListDef }
  | { kind: 'basic'; name: string; desc: string };

const BASIC: Record<TurnSlot, { name: string; desc: string }[]> = {
  action: [
    { name: 'Disparada', desc: 'Você ganha deslocamento extra igual ao seu deslocamento neste turno.' },
    { name: 'Desengajar', desc: 'Seu movimento não provoca ataques de oportunidade pelo resto do turno.' },
    { name: 'Esquivar', desc: 'Até o início do seu próximo turno, ataques contra você que você possa ver têm desvantagem, e você tem vantagem em salvaguardas de Destreza.' },
    { name: 'Ajudar', desc: 'Um aliado tem vantagem no próximo teste de atributo para uma tarefa, ou no próximo ataque contra uma criatura a até 1,5 m de você.' },
    { name: 'Esconder', desc: 'Faça um teste de Destreza (Furtividade) para se esconder.' },
    { name: 'Preparar', desc: 'Escolha um gatilho e uma ação; quando o gatilho acontecer, use sua reação para agir.' },
    { name: 'Procurar', desc: 'Dedique sua atenção a encontrar algo: teste de Sabedoria (Percepção) ou Inteligência (Investigação).' },
    { name: 'Usar um Objeto', desc: 'Interaja com um segundo objeto ou use um item que exija uma ação.' },
  ],
  bonus: [],
  reaction: [{ name: 'Ataque de Oportunidade', desc: 'Quando uma criatura hostil que você pode ver sai do seu alcance, você pode usar sua reação para fazer um ataque corpo a corpo contra ela.' }],
};

/** Which part of the turn a spell's casting time uses. */
export function spellSlotKind(time = ''): TurnSlot | null {
  const t = time.toLowerCase();
  if (t.includes('bonus action') || t.includes('ação bônus')) return 'bonus';
  if (t.includes('reaction') || t.includes('reação')) return 'reaction';
  if (/^(1 )?action|^ação|^1 ação/.test(t)) return 'action';
  return null; // minutes, hours…
}

const FEATURE_PATTERNS: [TurnSlot, RegExp][] = [
  ['bonus', /\bbonus action\b|\bação bônus\b/i],
  ['reaction', /\breaction\b|\breação\b|\bsua reação\b/i],
  ['action', /\b(as an|use your|take the|magic) action\b|\bcomo uma ação\b|\busar sua ação\b/i],
];

/** Everything the character can do on a turn, grouped by action type. */
export function turnOptions(c: Character, srd: SrdData): Record<TurnSlot, TurnOption[]> {
  const out: Record<TurnSlot, TurnOption[]> = { action: [], bonus: [], reaction: [] };

  for (const a of weaponAttacks(c, srd)) out.action.push({ kind: 'attack', name: a.name, attack: a });

  for (const k of c.spells) {
    const sp = srd.spells.find((s) => s.id === k.id);
    if (!sp) continue;
    if (sp.level > 0 && !k.prepared && !k.alwaysPrepared) continue;
    const slot = spellSlotKind(sp.time);
    if (slot) out[slot].push({ kind: 'spell', name: sp.name, spell: sp });
  }

  // powers (disciplines, talents…): by their casting time, or the time of their first option
  const lists = powerLists(c, srd);
  for (const p of knownPowers(c, srd)) {
    const slot = spellSlotKind(p.time || p.options?.find((o) => o.time)?.time);
    if (slot) out[slot].push({ kind: 'power', name: p.name, power: p, list: lists.find((l) => l.id === p.list) });
  }

  const asPowers = featuresShownAsPowers(c, srd);
  const seen = new Set<string>();
  for (const g of allFeatures(c, srd)) {
    for (const f of g.items) {
      // one place per feature: the first that fits (bonus action, then reaction, then action), so a
      // feature whose text mentions several kinds of action doesn't show up two or three times
      if (!f.desc || seen.has(f.name) || (f.id && asPowers.has(f.id))) continue;
      // a type set in the data wins over reading the text
      const typed = f.type === 'action' || f.type === 'bonus' || f.type === 'reaction' ? f.type : null;
      const hit = typed ?? (f.type ? undefined : FEATURE_PATTERNS.find(([, re]) => re.test(f.desc!))?.[0]);
      if (!hit) continue;
      seen.add(f.name);
      out[hit].push({ kind: 'feature', name: f.name, source: g.source, desc: f.desc });
    }
  }

  for (const slot of ['action', 'bonus', 'reaction'] as TurnSlot[]) out[slot].push(...BASIC[slot].map((b) => ({ kind: 'basic' as const, ...b })));
  return out;
}
