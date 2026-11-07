import type { SrdData } from './types';

type Fields = Partial<Record<'name' | 'desc' | 'higher' | 'time' | 'range' | 'duration' | 'comp' | 'material', string>>;
/** Portuguese overlay: id → translated fields. Untranslated entries keep the English text. */
export interface Translation { spells?: Record<string, Fields>; conditions?: Record<string, Fields> }

export function applyTranslation(srd: SrdData, t: Translation | undefined): SrdData {
  if (!t) return srd;
  const over = <T extends { id: string; name: string }>(list: T[], map?: Record<string, Fields>) =>
    map ? list.map((x) => (map[x.id] ? { ...x, ...map[x.id], en: x.name } : x)) : list;
  // every spell gets Portuguese time/range/duration; translated ones get the rest too
  const spells = srd.spells.map((sp) => ({ ...sp, time: sp.time && ptMeta.time(sp.time), range: sp.range && ptMeta.range(sp.range), duration: sp.duration && ptMeta.duration(sp.duration), area: sp.area && ptMeta.area(sp.area) }));
  return { ...srd, spells: over(spells, t.spells), conditions: over(srd.conditions, t.conditions) };
}

const UNIT: Record<string, [string, string]> = { minute: ['minuto', 'minutos'], hour: ['hora', 'horas'], day: ['dia', 'dias'], round: ['rodada', 'rodadas'], year: ['ano', 'anos'], turn: ['turno', 'turnos'] };
const unit = (n: string, u: string) => { const k = u.replace(/s$/, '').toLowerCase(); const w = UNIT[k]; return w ? `${n} ${n === '1' ? w[0] : w[1]}` : `${n} ${u}`; };
const meters = (ft: number) => (ft * 0.3).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/** Automatic Portuguese for spell casting time / range / duration (all spells, translated or not). */
export const ptMeta = {
  time(t: string): string {
    const s = t.trim();
    let m = /^(\d+)?\s*(bonus action|action|reaction)/i.exec(s);
    if (m) {
      const kind = m[2].toLowerCase() === 'bonus action' ? 'ação bônus' : m[2].toLowerCase() === 'reaction' ? 'reação' : 'ação';
      return m[1] ? `${m[1]} ${kind}` : kind[0].toUpperCase() + kind.slice(1);
    }
    m = /^(\d+)\s+(\w+)/.exec(s);
    return m ? unit(m[1], m[2]) : s;
  },
  range(r: string): string {
    const s = r.trim();
    const fixed: Record<string, string> = { touch: 'Toque', self: 'Pessoal', sight: 'Visão', unlimited: 'Ilimitado', special: 'Especial' };
    if (fixed[s.toLowerCase()]) return fixed[s.toLowerCase()];
    let m = /^(\d+)\s*(feet|foot|ft\.?)$/i.exec(s);
    if (m) return `${meters(+m[1])} m (${m[1]} pés)`;
    m = /^(\d+)\s*miles?$/i.exec(s);
    if (m) return `${(+m[1] * 1.6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km (${m[1]} milha${m[1] === '1' ? '' : 's'})`;
    m = /^self\s*\((.+)\)$/i.exec(s);
    if (m) return `Pessoal (${m[1].replace(/(\d+)-foot/g, (_, n) => `${meters(+n)} m`).replace('radius', 'raio').replace('cone', 'cone').replace('line', 'linha').replace('cube', 'cubo').replace('sphere', 'esfera').replace('hemisphere', 'hemisfério')})`;
    return s;
  },
  area(a: string): string {
    const m = /^(\d+)\s*ft\s+(\w+)/i.exec(a.trim());
    const shapes: Record<string, string> = { sphere: 'esfera', cone: 'cone', cube: 'cubo', cylinder: 'cilindro', line: 'linha', square: 'quadrado', emanation: 'emanação' };
    return m ? `${shapes[m[2].toLowerCase()] ?? m[2]} de ${meters(+m[1])} m` : a;
  },
  duration(d: string): string {
    const s = d.trim();
    if (/^instantaneous$/i.test(s)) return 'Instantânea';
    if (/^until dispelled/i.test(s)) return s.toLowerCase().includes('triggered') ? 'Até ser dissipada ou ativada' : 'Até ser dissipada';
    if (/^special$/i.test(s)) return 'Especial';
    let m = /^up to (\d+)\s+(\w+)/i.exec(s);
    if (m) return 'Até ' + unit(m[1], m[2]);
    m = /^(\d+)\s+(\w+)/.exec(s);
    return m ? unit(m[1], m[2]) : s;
  },
};
