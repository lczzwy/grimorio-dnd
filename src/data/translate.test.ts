import { describe, expect, it } from 'vitest';
import { applyTranslation } from './translate';
import type { SrdData } from './types';

const base = {
  spells: [{ id: 'fire-bolt', name: 'Fire Bolt', level: 0, desc: 'You hurl a mote of fire.', time: '1 action', range: '120 feet', duration: 'Instantaneous' }, { id: 'wish', name: 'Wish', level: 9, desc: 'The mightiest spell.' }],
  conditions: [{ id: 'prone', name: 'Prone', desc: 'A prone creature…' }],
} as unknown as SrdData;

describe('applyTranslation', () => {
  it('replaces translated fields and keeps the English name for search', () => {
    const t = applyTranslation(base, {
      spells: { 'fire-bolt': { name: 'Raio de Fogo', desc: 'Você arremessa uma partícula de fogo.', time: '1 ação', range: '36 metros (120 pés)', duration: 'Instantânea' } },
      conditions: { prone: { name: 'Caído', desc: 'Uma criatura caída…' } },
    });
    expect(t.spells[0]).toMatchObject({ name: 'Raio de Fogo', en: 'Fire Bolt', desc: 'Você arremessa uma partícula de fogo.', time: '1 ação', level: 0 });
    expect(t.spells[1]).toMatchObject({ name: 'Wish', desc: 'The mightiest spell.' });
    expect(t.conditions[0]).toMatchObject({ name: 'Caído', desc: 'Uma criatura caída…' });
    expect(base.spells[0].name).toBe('Fire Bolt');
  });
  it('no overlay = same data', () => {
    expect(applyTranslation(base, undefined)).toBe(base);
  });
});

import { ptMeta } from './translate';
describe('ptMeta (automatic for every spell)', () => {
  it('casting time', () => {
    expect(ptMeta.time('1 action')).toBe('1 ação');
    expect(ptMeta.time('Action')).toBe('Ação');
    expect(ptMeta.time('1 bonus action')).toBe('1 ação bônus');
    expect(ptMeta.time('Bonus Action')).toBe('Ação bônus');
    expect(ptMeta.time('1 reaction, which you take when you are hit')).toBe('1 reação');
    expect(ptMeta.time('10 minutes')).toBe('10 minutos');
    expect(ptMeta.time('1 hour')).toBe('1 hora');
  });
  it('range in meters with feet', () => {
    expect(ptMeta.range('60 feet')).toBe('18 m (60 pés)');
    expect(ptMeta.range('5 feet')).toBe('1,5 m (5 pés)');
    expect(ptMeta.range('Touch')).toBe('Toque');
    expect(ptMeta.range('Self')).toBe('Pessoal');
    expect(ptMeta.range('1 mile')).toBe('1,6 km (1 milha)');
    expect(ptMeta.range('Sight')).toBe('Visão');
    expect(ptMeta.range('Unlimited')).toBe('Ilimitado');
  });
  it('duration', () => {
    expect(ptMeta.duration('Instantaneous')).toBe('Instantânea');
    expect(ptMeta.duration('Up to 1 minute')).toBe('Até 1 minuto');
    expect(ptMeta.duration('1 round')).toBe('1 rodada');
    expect(ptMeta.duration('8 hours')).toBe('8 horas');
    expect(ptMeta.duration('Until dispelled')).toBe('Até ser dissipada');
    expect(ptMeta.duration('24 hours')).toBe('24 horas');
  });
});
