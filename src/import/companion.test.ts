import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { SrdData } from '../data/types';
import { importCompanion, isCompanionFile, type CompanionFile } from './companion';
import { armorClass, computeScores, maxHp, skillMod, spellSlots } from '../engine/rules';

const srd = JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/data/srd-2014.json'), 'utf8')) as SrdData;

const feat = (name: string, desc: string, level = 1) => ({ level, feat: { name, descriptionModels: [{ description: desc, level }] } });

// Trimmed-down export in the 5e Companion App shape: a homebrew class + race, SRD items/spells.
const sample: CompanionFile = {
  jsonType: 'character',
  name: 'Voss',
  alignmentName: 'LAWFUL_NEUTRAL',
  exp: 2700,
  hp: 30,
  gold: 5,
  strength: { score: 16, save: false },
  dexterity: { score: 18, save: false },
  constitution: { score: 16, save: false },
  intelligence: { score: 20, save: true },
  wisdom: { score: 20, save: true },
  charisma: { score: 13, save: false },
  skills: [{ typeName: 'ARCANA', proficiencyName: 'FULL' }, { typeName: 'SLEIGHT_OF_HAND', proficiencyName: 'EXPERTISE' }],
  proficiencies: [{ name: 'Light Armor', typeName: 'ARMOR' }, { name: 'Dagger', typeName: 'WEAPON' }],
  jobs: [{ jobId: 'mystic', archetypeId: 'mystic_order_of_the_immortal', level: 4 }],
  allRequiredClasses: {
    jobs: [JSON.stringify({
      id: 'mystic', name: 'Mystic', hitDie: 'D8', savingThrows: { intelligence: true, wis: true, str: false },
      spellcastingAbility: 'Intelligence',
      features: [feat('Psionic Talents', 'You know 1 psionic talent.'), feat('Telepathy', 'You can speak telepathically.', 2)],
      archetypes: [{ id: 'mystic_order_of_the_immortal', name: 'Order of the Immortal', features: [feat('Immortal Durability', 'Your hit point maximum increases by 1 per mystic level. In addition, while you aren\'t wearing armor or wielding a shield, your base AC equals 10 + your Dexterity modifier + your Constitution modifier')] }],
      weaponProficiencies: [{ proficiency: 'all_simple' }],
      classSkills: [{ amountOfChoice: 2, skillsModels: [{ name: 'Arcana' }, { name: 'History' }] }],
    })],
  },
  requiredRace: JSON.stringify({ name: 'Mind Flayer', abilityScores: { intelligence: 2, str: 0 }, speed: { normal: 30 }, traits: [feat('Telepathy', 'Mind to mind.')] }),
  requiredBackground: JSON.stringify({ name: 'Hermit', features: [feat('Discovery', 'You found a secret.')], skills: [{ skillsModels: [{ name: 'Medicine' }] }] }),
  equipment: [{ name: 'Spear', amount: 1 }, { name: 'Wand of the Tiny', item: { name: 'Wand of the Tiny', description: 'Custom wand' }, amount: 1 }],
  feats: [{ name: 'Telekinetic [TCE]', descriptions: [{ description: 'Move things with your mind.' }] }],
  spells: [{ name: 'Levitate', level: 2 }, { name: 'Psychic Lance', level: 0, description: 'Ouch', school: 'ENCHANTMENT' }],
  specialAbilities: [{ name: 'Psi Points', usesLeft: 10, associatedValueName: 'Psi Limit', amountsPerLevel: [{ amount: 4, level: 1, associatedValue: '2' }, { amount: 17, level: 4, associatedValue: '3' }, { amount: 27, level: 5, associatedValue: '5' }] }],
  selectableFeatures: [{ name: 'Psionic Talents', selectedFeatures: [{ name: 'Mind Thrust', descriptions: [{ description: 'Psychic damage.', level: 1 }] }] }],
  notes: [{ text: 'Swipe this message to dismiss' }, { text: 'Lembrar do ASI' }],
};

describe('5e Companion import', () => {
  const { character: c, homebrew, warnings } = importCompanion(sample, srd);
  const merged = { ...srd, classes: [...srd.classes, ...(homebrew.classes || [])], subclasses: [...srd.subclasses, ...(homebrew.subclasses || [])], species: [...srd.species, ...(homebrew.species || [])], backgrounds: [...srd.backgrounds, ...(homebrew.backgrounds || [])], feats: [...srd.feats, ...(homebrew.feats || [])], spells: [...srd.spells, ...(homebrew.spells || [])] } as SrdData;

  it('detects the format', () => {
    expect(isCompanionFile(sample)).toBe(true);
    expect(isCompanionFile({ edition: '2014' })).toBe(false);
  });

  it('creates homebrew for content outside the SRD', () => {
    expect(homebrew.classes?.[0]).toMatchObject({ id: 'hb-mystic', name: 'Mystic', hitDie: 8, saves: ['int', 'wis'] });
    expect(homebrew.subclasses?.[0].name).toBe('Order of the Immortal');
    expect(homebrew.species?.[0]).toMatchObject({ name: 'Mind Flayer', bonuses: [{ ability: 'int', bonus: 2 }] });
    expect(homebrew.backgrounds?.[0].name).toBe('Hermit');
    expect(homebrew.feats?.[0].name).toBe('Telekinetic');
    expect(homebrew.spells?.map((s) => s.name)).toEqual(['Psychic Lance']); // Levitate is in the SRD
  });

  it('keeps the final ability scores from the file', () => {
    expect(computeScores(c, merged)).toEqual({ str: 16, dex: 18, con: 16, int: 20, wis: 20, cha: 13 });
    expect(warnings.filter((w) => w.includes('arquivo'))).toEqual([]);
  });

  it('class, subclass, saves, skills', () => {
    expect(c.classes).toEqual([{ classId: 'hb-mystic', level: 4, subclassId: 'hb-mystic-order-of-the-immortal' }]);
    expect(c.saveProfs).toEqual(['int', 'wis']);
    expect(skillMod(c, merged, 'arcana')).toBe(5 + 2);
    expect(skillMod(c, merged, 'sleight-of-hand')).toBe(4 + 4);
  });

  it('Immortal Durability: AC 10+DEX+CON and +1 hp/level', () => {
    expect(armorClass(c, merged).value).toBe(10 + 4 + 3);
    // d8: 8+3, then 3×(5+3) = 35, +4 durability
    expect(maxHp(c, merged)).toBe(39);
    expect(c.hp.current).toBe(30);
  });

  it('a custom caster without slot table gets no spell slots', () => {
    expect(spellSlots(c, merged).slots.every((x) => x === 0)).toBe(true);
  });

  it('items, spells, resources, chosen features, notes', () => {
    expect(c.inventory.find((i) => i.name === 'Spear')?.weapon?.dmg).toBe('1d6');
    expect(c.inventory.find((i) => i.name === 'Wand of the Tiny')?.notes).toBe('Custom wand');
    expect(c.spells.map((s) => s.id)).toEqual(['levitate', 'hb-psychic-lance']);
    expect(c.resources[0]).toMatchObject({ name: 'Psi Points', max: 17, used: 7 });
    expect(c.customFeatures.map((f) => f.name)).toEqual(['Psi Limit: 3', 'Mind Thrust']);
    expect(c.notes).toBe('Lembrar do ASI');
    expect(c.alignment).toBe('Leal e Neutro');
    expect(c.currency.gp).toBe(5);
  });
});
