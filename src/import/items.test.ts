import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { SrdData } from '../data/types';
import { newCharacter, uid } from '../engine/character';
import { armorClass, weaponAttacks } from '../engine/rules';
import { applyGuess, findEquipment, guessItem, itemSuggestions, readItemText, splitItemLine } from './items';

const srd = JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/data/srd-2014.json'), 'utf8')) as SrdData;

describe('item recognition', () => {
  it('finds official weapons and armor by the Portuguese or English name', () => {
    expect(findEquipment(srd, 'Espada longa')?.id).toBe('longsword');
    expect(findEquipment(srd, 'Longsword +1')?.id).toBe('longsword');
    expect(findEquipment(srd, 'Rapieira')?.id).toBe('rapier');
    expect(findEquipment(srd, 'Armadura de couro batido')?.id).toBe('studded-leather-armor');
    expect(findEquipment(srd, 'Cota de malha')?.id).toBe('chain-mail');
    expect(findEquipment(srd, 'Escudo')?.id).toBe('shield');
    expect(findEquipment(srd, 'Adagas')?.id).toBe('dagger');
    expect(findEquipment(srd, 'Espada de Plasma')).toBeUndefined();
  });

  it('reads a homebrew weapon written like the table', () => {
    const r = readItemText('Espada de Plasma', '2d6 fogo · Versátil (2d8), Acuidade');
    expect(r).toMatchObject({ damage: '2d6', type: 'Fogo', versatile: '2d8' });
    expect(r.props).toEqual(expect.arrayContaining(['versatile', 'finesse']));
    expect(readItemText('Blaster', 'Dano: 1d10 de dano elétrico, distância 30/90').ranged).toEqual({ normal: 30, long: 90 });
    expect(readItemText('Lâmina', '1d8 slashing, versatile (1d10)')).toMatchObject({ damage: '1d8', type: 'Cortante', versatile: '1d10' });
    // healing isn't damage
    expect(readItemText('Poção', 'Recupera 2d4+2 pontos de vida').damage).toBeUndefined();
  });

  it('reads armor, shields, AC bonuses and uses', () => {
    expect(readItemText('Traje de Combate', 'CA 13 + Des (máx. 2)').armor).toEqual({ cat: 'Medium', base: 13, dex: true, max: 2 });
    expect(readItemText('Exo-armadura', 'CA 17, desvantagem em Furtividade').armor).toEqual({ cat: 'Heavy', base: 17, dex: false, stealth: true });
    expect(readItemText('Jaqueta', 'CA 12 + modificador de Destreza').armor).toEqual({ cat: 'Light', base: 12, dex: true });
    expect(readItemText('Escudo de Energia', '+2 na CA').armor).toEqual({ cat: 'Shield', base: 2 });
    expect(readItemText('Anel de Proteção', '+1 na CA e nos testes de resistência').acBonus).toBe(1);
    expect(readItemText('Kit de Reparo', '5 usos').uses).toEqual({ max: 5, reset: 'none' });
    expect(readItemText('Varinha', '7 cargas, recupera 1d6+1 ao amanhecer').uses).toEqual({ max: 7, reset: 'long' });
    expect(readItemText('Gerador de Campo Pessoal', 'Ganha 10 PV temporários, uma vez por descanso curto').uses).toEqual({ max: 1, reset: 'short' });
    expect(readItemText('Amuleto', '2/dia').uses).toEqual({ max: 2, reset: 'long' });
    expect(readItemText('Tradutor Universal', 'Entende qualquer idioma falado').uses).toBeUndefined();
  });

  it('splits the text in parentheses from the name only when it is game text', () => {
    expect(splitItemLine('Espada de Plasma (2d6 fogo, versátil 2d8)')).toEqual({ name: 'Espada de Plasma', notes: '2d6 fogo, versátil 2d8' });
    expect(splitItemLine('Corda de cânhamo (15 m)')).toEqual({ name: 'Corda de cânhamo (15 m)' });
  });

  it('an official weapon becomes an equipped weapon with its versatile damage', () => {
    const c = newCharacter('2014');
    c.base.str = 16;
    c.inventory.push({ uid: 'w', name: 'Espada longa', qty: 1 });
    const [s] = itemSuggestions(c, srd);
    expect(s.guess.label).toMatch(/1d8.*1d10 com duas m/);
    applyGuess(c, 'w', s.guess);
    const atk = weaponAttacks(c, srd).find((a) => a.uid === 'w')!;
    expect(atk).toMatchObject({ damage: '1d8+3', altDamage: '1d10+3' });
  });

  it('a homebrew weapon, an armor and an item with uses work on the sheet', () => {
    const c = newCharacter('2014');
    c.base.dex = 14;
    c.inventory.push(
      { uid: 'p', name: 'Espada de Plasma', qty: 1, notes: '2d6 fogo. Versátil (2d8), Acuidade' },
      { uid: 'a', name: 'Traje Tático', qty: 1, notes: 'CA 13 + Des (máx. 2)' },
      { uid: 'g', name: 'Gerador de Campo Pessoal', qty: 1, notes: '10 PV temporários por descanso curto' },
      { uid: 't', name: 'Tradutor Universal', qty: 1, notes: 'Traduz idiomas' },
    );
    const sug = itemSuggestions(c, srd);
    expect(sug.map((x) => x.uid)).toEqual(['p', 'a', 'g']);
    for (const s of sug) applyGuess(c, s.uid, s.guess);
    expect(weaponAttacks(c, srd).find((a) => a.uid === 'p')).toMatchObject({ damage: '2d6+2', altDamage: '2d8+2', type: 'Fogo', ability: 'dex' });
    expect(armorClass(c, srd).value).toBe(15);
    expect(c.resources).toEqual([expect.objectContaining({ name: 'Gerador de Campo Pessoal', max: 1, reset: 'short' })]);
    // once applied, nothing more to suggest
    expect(itemSuggestions(c, srd)).toEqual([]);
  });

  it('a second body armor stays in the bag; an AC bonus adds up', () => {
    const c = newCharacter('2014');
    c.inventory.push({ uid: 'a1', name: 'Cota de malha', qty: 1, equipped: true, armor: { cat: 'Heavy', base: 16, dex: false } }, { uid: 'a2', name: 'Armadura de couro', qty: 1 }, { uid: 'r', name: 'Anel de Proteção', qty: 1, notes: '+1 na CA' });
    for (const s of itemSuggestions(c, srd)) applyGuess(c, s.uid, s.guess);
    expect(c.inventory.find((x) => x.uid === 'a2')?.equipped).toBe(false);
    expect(armorClass(c, srd).value).toBe(17);
  });

  it('nothing to suggest for plain gear', () => {
    expect(guessItem({ name: 'Corda de cânhamo', notes: '15 m' }, srd)).toBeNull();
    expect(guessItem({ name: 'Mochila' }, srd)).toBeNull();
    expect(uid()).toBeTruthy();
  });
});

describe('items in a PDF sheet', () => {
  it('a weapon that matches its attack line takes it over; a different one keeps the line with two hands', async () => {
    const { mapPdfSheet, finishPdfImport } = await import('./pdfSheet');
    const r = mapPdfSheet({
      CharacterName: 'Teste', 'ClassLevel': 'Fighter 1', STR: '16', DEX: '14', AC: '13',
      Equipment: 'Espada longa\nArmadura de couro\nEspada de Plasma (2d6 fogo, versátil 2d8)\nCorda (15 m)',
      'Wpn Name': 'Espada longa', 'Wpn1 AtkBonus': '+5', 'Wpn1 Damage': '1d8+3 cortante',
      'Wpn Name 2': 'Espada de Plasma', 'Wpn2 AtkBonus': '+7', 'Wpn2 Damage': '2d6+3 fogo',
    }, srd);
    const { character: c } = finishPdfImport(r, { classes: ['fighter'], race: null }, srd);
    expect(c.attacks.map((a) => a.name)).toEqual(['Espada de Plasma']);
    expect(c.attacks[0].versatile).toBe('2d8');
    expect(c.inventory.find((x) => x.name === 'Espada longa')).toMatchObject({ equipped: true, refId: 'longsword' });
    expect(c.inventory.find((x) => x.name === 'Espada de Plasma')?.equipped).toBe(false);
    expect(c.inventory.find((x) => x.name === 'Corda (15 m)')?.weapon).toBeUndefined();
    expect(c.acOverride).toBeUndefined();
    expect(armorClass(c, srd).value).toBe(13);
    expect(weaponAttacks(c, srd).find((a) => a.name === 'Espada longa')).toMatchObject({ toHit: 5, damage: '1d8+3', altDamage: '1d10+3' });
  });

  it('unchecked items stay plain', async () => {
    const { mapPdfSheet, finishPdfImport } = await import('./pdfSheet');
    const r = mapPdfSheet({ CharacterName: 'X', 'ClassLevel': 'Fighter 1', Equipment: 'Espada longa' }, srd);
    const { character: c } = finishPdfImport(r, { classes: ['fighter'], race: null, items: [] }, srd);
    expect(c.inventory[0].weapon).toBeUndefined();
  });
});
