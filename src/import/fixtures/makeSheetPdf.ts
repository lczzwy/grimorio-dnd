import { PDFDocument } from 'pdf-lib';

/** A fillable PDF with field names like the official 5e sheet (trailing spaces included). */
export async function makeSheetPdf(values: Record<string, string>, checks: string[] = []): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();
  let y = 760;
  for (const [name, value] of Object.entries(values)) {
    const t = form.createTextField(name);
    t.setText(value);
    t.addToPage(page, { x: 20, y, width: 200, height: 12 });
    y -= 13;
    if (y < 20) y = 760;
  }
  for (const name of checks) {
    const c = form.createCheckBox(name);
    c.addToPage(page, { x: 300, y: 700, width: 10, height: 10 });
    c.check();
  }
  return doc.save();
}

/** A Mystic 4 with a homebrew race, like a sheet a player would bring. */
export const SAMPLE: Record<string, string> = {
  CharacterName: 'Kael',
  ClassLevel: 'Mystic 4',
  Background: 'Hermit',
  PlayerName: 'Ana',
  'Race ': 'Mind Flayer',
  Alignment: 'Leal e Neutro',
  XP: '2700',
  STR: '8', DEX: '14', CON: '12', INT: '18', WIS: '13', CHA: '10',
  'STRmod': '-1', 'DEXmod ': '+2',
  ProfBonus: '+2',
  AC: '12', Initiative: '+2', Speed: '30ft',
  HPMax: '27', HPCurrent: '20', HPTemp: '3', HDTotal: '4d8',
  'ST Intelligence': '+6', 'ST Wisdom': '+3', 'ST Strength': '-1',
  Arcana: '+6', 'History ': '+4', 'Insight': '+3', 'Perception ': '+1', 'Stealth ': '+2', Investigation: '+8',
  'Wpn Name': 'Adaga', 'Wpn1 AtkBonus': '+4', 'Wpn1 Damage': '1d4+2 perfurante',
  Equipment: '2 Adagas\nMochila\nCorda de seda (15 m)',
  GP: '15', SP: '3',
  'PersonalityTraits ': 'Calado.', Ideals: 'Conhecimento.', Backstory: 'Fugiu de uma colônia.',
  'Features and Traits': 'Telepatia 36 m.',
  ProficienciesLang: 'Comum, Dialeto Subterrâneo',
  'Spells 1014': 'Mage Hand', 'Spells 1015': 'Feitiço Inventado',
  Allies: 'Ordem do Olho',
  CampoEstranho: 'algo que ninguém usa',
};
