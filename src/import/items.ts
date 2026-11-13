import type { ArmorStats, Character, EquipmentDef, InventoryItem, SrdData, WeaponStats } from '../data/types';
import { uid } from '../engine/character';
import { fold } from '../engine/classData';

/**
 * Recognizes what an item is from its name and its text, so an imported or hand-written item
 * becomes something the sheet uses: a weapon (an attack, with two hands when versatile), an armor
 * (the AC is calculated), a pool of uses (spend and recover on rests) or a bonus to the AC.
 * Official items are found by name (Portuguese or English); homebrew ones are read from the
 * table-like text ("2d6 fogo · Versátil (2d8), Acuidade", "CA 13 + Des (máx. 2)", "5 usos").
 */

/** Portuguese names of the official weapons and armor (several spellings each). */
export const ITEM_PT: Record<string, string[]> = {
  club: ['Clava', 'Porrete'], dagger: ['Adaga', 'Punhal'], greatclub: ['Clava Grande', 'Grande Clava'], handaxe: ['Machadinha', 'Machado de Mão'],
  javelin: ['Azagaia', 'Dardo de Arremesso', 'Lança de Arremesso'], 'light-hammer': ['Martelo Leve'], mace: ['Maça'], quarterstaff: ['Bordão', 'Cajado'],
  sickle: ['Foice Curta', 'Foice'], spear: ['Lança'], 'crossbow-light': ['Besta Leve'], 'light-crossbow': ['Besta Leve'], dart: ['Dardo'],
  shortbow: ['Arco Curto'], sling: ['Funda', 'Estilingue'], battleaxe: ['Machado de Batalha', 'Machado de Guerra'], flail: ['Mangual'],
  glaive: ['Glaive', 'Glaive de Guerra'], greataxe: ['Machado Grande', 'Grande Machado'], greatsword: ['Espada Grande', 'Montante', 'Espadão'],
  halberd: ['Alabarda'], lance: ['Lança de Montaria', 'Lança de Cavalaria'], longsword: ['Espada Longa'], maul: ['Malho', 'Marreta'],
  morningstar: ['Maça Estrela', 'Estrela da Manhã', 'Maça-Estrela'], pike: ['Pique'], rapier: ['Rapieira', 'Florete'], scimitar: ['Cimitarra'],
  shortsword: ['Espada Curta'], trident: ['Tridente'], 'war-pick': ['Picareta de Guerra', 'Picão de Guerra'], warhammer: ['Martelo de Guerra'],
  whip: ['Chicote'], blowgun: ['Zarabatana'], 'crossbow-hand': ['Besta de Mão'], 'hand-crossbow': ['Besta de Mão'], 'crossbow-heavy': ['Besta Pesada'],
  'heavy-crossbow': ['Besta Pesada'], longbow: ['Arco Longo'], net: ['Rede'], musket: ['Mosquete'], pistol: ['Pistola'],
  'padded-armor': ['Armadura Acolchoada', 'Acolchoada'], 'leather-armor': ['Armadura de Couro', 'Couro'], 'studded-leather-armor': ['Couro Batido', 'Armadura de Couro Batido', 'Couro Cravejado'],
  'hide-armor': ['Armadura de Peles', 'Gibão de Peles', 'Peles'], 'chain-shirt': ['Camisão de Malha', 'Camisa de Malha', 'Camisa de Cota de Malha'],
  'scale-mail': ['Brunea', 'Cota de Escamas', 'Armadura de Escamas'], breastplate: ['Peitoral', 'Couraça'], 'half-plate-armor': ['Meia Armadura', 'Meia-Armadura', 'Meia Placa'],
  'ring-mail': ['Cota de Anéis', 'Armadura de Anéis'], 'chain-mail': ['Cota de Malha'], 'splint-armor': ['Cota de Talas', 'Armadura de Talas'],
  'plate-armor': ['Armadura de Placas', 'Placas', 'Armadura Completa', 'Placa Completa'], shield: ['Escudo'],
};

/** lower case without accents, punctuation kept */
const low = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const key = (s: string) => fold(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
/** "Espada Longa +1 (prateada)" → "espada longa" */
const bare = (name: string) => key(name.replace(/\([^)]*\)/g, ' ').replace(/[+-]\s*\d\b/g, ' ').replace(/\b(de|da|do)\s*$/i, ''));
const sing = (x: string) => x.split(' ').map((w) => (w.length > 3 ? w.replace(/(oes|aes)$/, 'ao').replace(/s$/, '') : w)).join(' ');

/** The official weapon or armor with this name, in Portuguese or English. */
export function findEquipment(srd: SrdData, name: string): EquipmentDef | undefined {
  const want = sing(bare(name));
  if (!want) return undefined;
  const names = (e: EquipmentDef) => [e.name, e.id.replace(/-/g, ' '), ...(ITEM_PT[e.id] || [])].map((n) => sing(key(n)));
  const gear = srd.equipment.filter((e) => e.weapon || e.armor);
  return gear.find((e) => names(e).includes(want)) || srd.equipment.find((e) => sing(key(e.name)) === want);
}

/* ---------------- reading the text ---------------- */

const DMG_TYPES: [RegExp, string][] = [
  [/\b(?:acido|acid)\b/, 'Ácido'], [/\b(?:concussao|contundente|esmagamento|bludgeoning)\b/, 'Concussão'], [/\b(?:cortante|corte|slashing)\b/, 'Cortante'],
  [/\b(?:perfurante|perfuracao|piercing)\b/, 'Perfurante'], [/\b(?:fogo|fire)\b/, 'Fogo'], [/\b(?:frio|gelo|cold)\b/, 'Frio'],
  [/\b(?:eletrico|eletricidade|relampago|lightning)\b/, 'Elétrico'], [/\b(?:trovao|trovejante|thunder)\b/, 'Trovão'], [/\b(?:veneno|venenoso|poison)\b/, 'Veneno'],
  [/\b(?:necrotico|necrotic)\b/, 'Necrótico'], [/\b(?:radiante|radiant)\b/, 'Radiante'], [/\b(?:psiquico|psychic)\b/, 'Psíquico'], [/\b(?:forca|force)\b/, 'Força'],
];

export interface ItemText {
  damage?: string;
  type?: string;
  versatile?: string;
  props: string[];
  ranged?: { normal?: number; long?: number };
  cat?: 'Simple' | 'Martial';
  armor?: ArmorStats;
  acBonus?: number;
  uses?: { max: number; reset: 'short' | 'long' | 'none' };
  magicBonus?: number;
}

/** What the text of an item says, in the usual table style (Portuguese or English). */
export function readItemText(name: string, text = ''): ItemText {
  const all = low(`${name} ${text}`);
  const t = low(text);
  const out: ItemText = { props: [] };

  // damage: dice followed (closely) by a damage type; healing and temporary hit points don't count
  const dm = /(\d+d\d+)(?:\s*[+-]\s*\d+)?\s*(?:pontos?\s+)?(?:de\s+)?(?:dano\s+)?(?:de\s+)?([a-z]+)/g;
  for (let m; (m = dm.exec(all)); ) {
    const before = all.slice(Math.max(0, m.index - 25), m.index);
    if (/(cura|recupera|heal|regain|temporari|temp)/.test(before + ' ' + m[2])) continue;
    const ty = DMG_TYPES.find(([re]) => re.test(m![2]));
    if (ty) { out.damage = m[1]; out.type = ty[1]; break; }
  }
  const vers = /(?:versatil|versatile)\s*\(?\s*(\d+d\d+)/.exec(all) || /(\d+d\d+)\s*(?:com|a|usando)?\s*(?:as\s+)?duas\s+maos/.exec(all) || /(\d+d\d+)\s*two[- ]handed/.exec(all);
  if (vers && out.damage) { out.versatile = vers[1]; out.props.push('versatile'); }
  if (/\b(?:acuidade|finesse)\b/.test(all)) out.props.push('finesse');
  if (/\b(?:leve|light)\b/.test(t) && out.damage) out.props.push('light');
  if (/\b(?:pesad[ao]|heavy)\b/.test(t) && out.damage) out.props.push('heavy');
  if (!out.versatile && /\b(?:duas maos|two[- ]handed)\b/.test(t) && out.damage) out.props.push('two-handed');
  const rng = /(?:distancia|alcance|range|municao|ammunition)[^0-9]{0,20}(\d+)\s*\/\s*(\d+)/.exec(all) || /\b(\d+)\s*\/\s*(\d+)\s*(?:m|ft|pes)\b/.exec(all);
  if (rng) out.ranged = { normal: +rng[1], long: +rng[2] };
  else if (/\b(?:a distancia|ranged|municao|ammunition|disparo|arco|besta|pistola|rifle|blaster)\b/.test(all) && out.damage && !/arremesso|thrown/.test(all)) out.ranged = {};
  if (/\b(?:arremesso|thrown)\b/.test(all) && out.damage) out.props.push('thrown');
  if (/\b(?:simples|simple)\b/.test(t)) out.cat = 'Simple';
  else if (/\b(?:marcial|martial)\b/.test(t)) out.cat = 'Martial';

  // armor: "CA 13 + Des (máx. 2)", "AC 16", a shield "+2 CA"
  const shieldName = /\b(?:escudo|shield)\b/.test(low(name));
  const ac = /\b(?:ca|ac|classe de armadura|armor class)\s*(?:base\s*)?(?:de\s*)?[:=]?\s*(\d{1,2})\b/.exec(all);
  const plus = /\+\s*(\d)\s*(?:na|a|em|de|to|no)?\s*(?:sua\s+)?\b(?:ca|ac|classe de armadura|armor class)\b/.exec(all) || /\b(?:ca|ac)\s*\+\s*(\d)\b/.exec(all) || /bonus de \+?(\d) (?:na|a) (?:ca|classe de armadura)/.exec(all);
  if (ac && +ac[1] >= 10) {
    const dex = /\+\s*(?:o\s+)?(?:mod(?:ificador)?\.?\s*(?:de\s+)?)?(?:des|dex|destreza|dexterity)\b/.test(all);
    const max = /max(?:imo|\.)?\s*(?:de\s*)?\+?(\d)/.exec(all);
    out.armor = dex ? (max ? { cat: 'Medium', base: +ac[1], dex: true, max: +max[1] } : { cat: 'Light', base: +ac[1], dex: true }) : { cat: 'Heavy', base: +ac[1], dex: false };
    if (/desvantagem em furtividade|disadvantage on stealth|furtividade:?\s*desvantagem/.test(all)) out.armor.stealth = true;
  } else if (plus && shieldName) out.armor = { cat: 'Shield', base: +plus[1] };
  else if (plus) out.acBonus = +plus[1];

  // uses: "5 usos", "3 cargas", "2/dia", "1 vez por descanso curto", "por descanso longo"
  const reset = (s: string): 'short' | 'long' | 'none' => (/(descanso curto|short rest)/.test(s) ? 'short' : /(descanso longo|long rest|dia|day|amanhecer|alvorada|dawn)/.test(s) ? 'long' : 'none');
  const u1 = /(\d+)\s*(?:usos|uso|cargas|carga|uses|charges)\b([^.;]{0,60})/.exec(all);
  const u2 = /(\d+|uma|duas|tres|once|twice)\s*(?:x|vez|vezes|times?)?\s*(?:\/|por|per|a cada|each)\s*(dia|day|descanso curto|descanso longo|short rest|long rest)/.exec(all);
  const u3 = /(?:uma vez )?(?:por|a cada|per)\s+(descanso curto|descanso longo|short rest|long rest)/.exec(all);
  const word: Record<string, number> = { uma: 1, once: 1, duas: 2, twice: 2, tres: 3 };
  if (u1) out.uses = { max: +u1[1], reset: reset(u1[2]) };
  else if (u2) out.uses = { max: word[u2[1]] ?? +u2[1], reset: reset(u2[2]) };
  else if (u3) out.uses = { max: 1, reset: reset(u3[1]) };
  if (out.uses && (out.uses.max < 1 || out.uses.max > 50)) out.uses = undefined;

  const mb = /(?:^|\s)\+([1-3])(?:\s|$)/.exec(name);
  if (mb) out.magicBonus = +mb[1];
  return out;
}

/* ---------------- what an item becomes ---------------- */

export interface ItemGuess {
  /** official item it is */
  refId?: string;
  weapon?: WeaponStats;
  armor?: ArmorStats;
  weight?: number;
  magicBonus?: number;
  uses?: { max: number; reset: 'short' | 'long' | 'none' };
  acBonus?: number;
  /** what will change, in words */
  label: string;
}

const RESET_PT = { short: 'volta no descanso curto', long: 'volta no descanso longo', none: 'não volta sozinho' };
const signed = (n: number) => (n >= 0 ? '+' : '') + n;

const TYPE_PT: Record<string, string> = { Slashing: 'cortante', Piercing: 'perfurante', Bludgeoning: 'concussão' };
export function describeWeapon(w: WeaponStats) {
  return `${w.dmg} ${w.type ? TYPE_PT[w.type] ?? w.type.toLowerCase() : ''}`.trim() + (w.twoHanded ? `, ${w.twoHanded} com duas mãos` : '') + (w.props?.includes('finesse') ? ', acuidade' : '') + (w.range === 'Ranged' ? ', à distância' : '');
}
export function describeArmor(a: ArmorStats) {
  return a.cat === 'Shield' ? `escudo, CA +${a.base}` : `CA ${a.base}${a.dex ? (a.max != null ? ` + Des (máx. ${a.max})` : ' + Des') : ''}`;
}

/** What this item can become, or nothing when there's nothing new to add. */
export function guessItem(it: Pick<InventoryItem, 'name' | 'notes' | 'weapon' | 'armor' | 'refId'>, srd: SrdData, hasResource = false): ItemGuess | null {
  const g: Partial<ItemGuess> = {};
  const words: string[] = [];
  const read = readItemText(it.name, it.notes);
  const eq = !it.weapon && !it.armor ? findEquipment(srd, it.name) : undefined;
  if (eq && (eq.weapon || eq.armor)) {
    g.refId = eq.id;
    g.weapon = eq.weapon;
    g.armor = eq.armor;
    g.weight = eq.weight;
    words.push(eq.weapon ? `arma oficial (${eq.name}), ` + describeWeapon(eq.weapon) : `armadura oficial (${eq.name}), ` + describeArmor(eq.armor!));
  } else if (!it.weapon && !it.armor) {
    if (read.damage) {
      const props = [...new Set(read.props)];
      g.weapon = {
        cat: read.cat || 'Martial', range: read.ranged ? 'Ranged' : 'Melee', dmg: read.damage, type: read.type, props,
        ...(read.versatile ? { twoHanded: read.versatile } : {}),
        ...(read.ranged ? { normal: read.ranged.normal, long: read.ranged.long } : { normal: 5 }),
      };
      words.push('arma, ' + describeWeapon(g.weapon));
    } else if (read.armor) {
      g.armor = read.armor;
      words.push(read.armor.cat === 'Shield' ? describeArmor(read.armor) : 'armadura, ' + describeArmor(read.armor));
    }
  }
  if (read.magicBonus && (g.weapon || g.armor || it.weapon || it.armor)) { g.magicBonus = read.magicBonus; words.push(`bônus mágico ${signed(read.magicBonus)}`); }
  if (read.acBonus && !g.armor && !it.armor) { g.acBonus = read.acBonus; words.push(`${signed(read.acBonus)} na CA`); }
  if (read.uses && !hasResource) { g.uses = read.uses; words.push(`${read.uses.max} uso${read.uses.max > 1 ? 's' : ''} (${RESET_PT[read.uses.reset]})`); }
  if (!words.length) return null;
  return { ...g, label: words.join(' · ') };
}

/** Turns the item into what was recognized (in place). Weapons and armor come equipped. */
export function applyGuess(c: Character, itemUid: string, g: ItemGuess) {
  const it = c.inventory.find((x) => x.uid === itemUid);
  if (!it) return;
  if (g.refId) it.refId = g.refId;
  if (g.weapon) it.weapon = structuredClone(g.weapon);
  if (g.armor) it.armor = structuredClone(g.armor);
  if (g.weight != null && !it.weight) it.weight = g.weight;
  if (g.magicBonus) { it.magicBonus = g.magicBonus; it.magic = true; }
  if (g.weapon) it.equipped = true;
  if (g.armor) {
    const shield = g.armor.cat === 'Shield';
    // a second body armor (or shield) waits in the bag
    it.equipped = !c.inventory.some((x) => x !== it && x.equipped && x.armor && (x.armor.cat === 'Shield') === shield);
  }
  if (g.uses && !c.resources.some((r) => fold(r.name) === fold(it.name))) c.resources.push({ uid: uid(), name: it.name, max: g.uses.max, used: 0, reset: g.uses.reset });
  if (g.acBonus) c.acBonus = (c.acBonus || 0) + g.acBonus;
}

/** Every item of the sheet that can become something more (for the import review). */
export function itemSuggestions(c: Character, srd: SrdData): { uid: string; name: string; guess: ItemGuess }[] {
  return c.inventory.flatMap((it) => {
    const guess = guessItem(it, srd, c.resources.some((r) => fold(r.name) === fold(it.name)));
    return guess ? [{ uid: it.uid, name: it.name, guess }] : [];
  });
}

/** Splits "Espada de Plasma (2d6 fogo, versátil 2d8)" into the name and the text in parentheses. */
export function splitItemLine(line: string): { name: string; notes?: string } {
  const m = /^(.*?)\s*\((.+)\)\s*$/.exec(line.trim());
  if (!m || !m[1].trim()) return { name: line.trim() };
  // "+1" or a short tag stays in the name; game text goes to the notes
  if (!/\d+d\d+|\bca\b|\bac\b|uso|carga|vers|acuidade|finesse|descanso|dia/i.test(m[2])) return { name: line.trim() };
  return { name: m[1].trim(), notes: m[2].trim() };
}
