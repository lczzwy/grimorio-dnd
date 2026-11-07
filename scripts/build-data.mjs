// Converts raw 5e-database SRD JSON (data-raw/) into compact bundles in public/data/.
// Content: System Reference Document 5.1 and 5.2 by Wizards of the Coast LLC, CC-BY-4.0.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const RAW = path.join(ROOT, 'data-raw');
const OUT = path.join(ROOT, 'public', 'data');
fs.mkdirSync(OUT, { recursive: true });

const load = (ed, name) => {
  const f = path.join(RAW, ed, name + '.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
};
const text = (x) => (Array.isArray(x) ? x.join('\n\n') : x || '');
const desc = (o) => text(o.desc ?? o.description);
const ab = (ref) => ref?.index; // 'str'
const skillKey = (profIndex) => profIndex.replace(/^skill-/, '');
const compact = (o) => {
  for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === null || (Array.isArray(o[k]) && !o[k].length) || o[k] === '') delete o[k];
  return o;
};

function optionsToText(opts) {
  if (!opts) return [];
  return opts.map((o) => o.desc).filter(Boolean);
}

function slotsOf(sc) {
  if (!sc) return undefined;
  const slots = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => sc['spell_slots_level_' + l] || 0);
  return compact({
    cantrips: sc.cantrips_known,
    known: sc.spells_known,
    prepared: sc.prepared_spells,
    slots,
  });
}

function build(ed) {
  const featuresRaw = load(ed, 'Features');
  const featureByIndex = Object.fromEntries(featuresRaw.map((f) => [f.index, f]));
  const levelsRaw = load(ed, 'Levels');
  const traitsRaw = load(ed, 'Traits');
  const traitByIndex = Object.fromEntries(traitsRaw.map((t) => [t.index, t]));
  const traitOut = (ref) => {
    const t = traitByIndex[ref.index];
    return compact({ name: t?.name || ref.name, desc: t ? desc(t) : '', level: ref.level });
  };

  const abilities = load(ed, 'Ability-Scores').map((a) => ({ key: a.index, name: a.full_name, short: a.name, desc: desc(a) }));
  const skills = load(ed, 'Skills').map((s) => ({ key: s.index, name: s.name, ability: ab(s.ability_score), desc: desc(s) }));

  const featureOut = (ref) => {
    const f = featureByIndex[ref.index];
    return compact({ id: ref.index, name: f?.name || ref.name, desc: f ? desc(f) : '' });
  };

  // ---------- classes ----------
  const classes = load(ed, 'Classes').map((c) => {
    const lv = levelsRaw
      .filter((l) => l.class?.index === c.index && !l.subclass)
      .sort((a, b) => a.level - b.level)
      .map((l) =>
        compact({
          level: l.level,
          prof: l.prof_bonus,
          asi: l.ability_score_bonuses,
          features: (l.features || []).map(featureOut),
          spellcasting: slotsOf(l.spellcasting),
          specific: l.class_specific,
        }),
      );
    const skillChoice = (c.proficiency_choices || []).find((p) =>
      (p.from?.options || []).some((o) => o.item?.index?.startsWith('skill-')),
    );
    const otherChoices = (c.proficiency_choices || []).filter((p) => p !== skillChoice).map((p) => p.desc);
    const profs = (c.proficiencies || []).filter((p) => !p.index.startsWith('saving-throw')).map((p) => p.name);
    return compact({
      id: c.index,
      name: c.name,
      hitDie: c.hit_die,
      primary: c.primary_ability?.desc,
      saves: (c.saving_throws || []).map(ab),
      profs,
      profIds: (c.proficiencies || []).map((p) => p.index),
      skillChoice: skillChoice
        ? {
            choose: skillChoice.choose,
            from: skillChoice.from.options.map((o) => o.item?.index).filter(Boolean).map(skillKey),
          }
        : undefined,
      otherChoices,
      equipment: [
        ...(c.starting_equipment || []).map((e) => `${e.quantity}× ${e.equipment.name}`),
        ...optionsToText(c.starting_equipment_options),
      ],
      spellcasting: c.spellcasting
        ? { ability: ab(c.spellcasting.spellcasting_ability), level: c.spellcasting.level, info: c.spellcasting.info.map((i) => ({ name: i.name, desc: text(i.desc) })) }
        : undefined,
      multiclass: c.multi_classing
        ? compact({
            prereq: (c.multi_classing.prerequisites || []).map((p) => ({ ability: ab(p.ability_score), min: p.minimum_score })),
            prereqAny: c.multi_classing.prerequisite_options
              ? c.multi_classing.prerequisite_options.from.options.map((p) => ({ ability: ab(p.ability_score), min: p.minimum_score }))
              : undefined,
            profs: (c.multi_classing.proficiencies || []).map((p) => p.name),
          })
        : undefined,
      levels: lv,
    });
  });

  // ---------- subclasses ----------
  const subclasses = load(ed, 'Subclasses').map((s) => {
    let features;
    if (s.features) {
      features = s.features.map((f) => ({ level: f.level, name: f.name, desc: f.description || desc(f) }));
    } else {
      features = [];
      levelsRaw
        .filter((l) => l.subclass?.index === s.index)
        .sort((a, b) => a.level - b.level)
        .forEach((l) => (l.features || []).forEach((r) => features.push({ level: l.level, ...featureOut(r) })));
    }
    const subLevels = levelsRaw
      .filter((l) => l.subclass?.index === s.index && l.subclass_specific)
      .map((l) => ({ level: l.level, specific: l.subclass_specific }));
    return compact({
      id: s.index,
      name: s.name,
      class: s.class.index,
      flavor: s.subclass_flavor,
      summary: s.summary,
      desc: desc(s),
      features,
      spells: (s.spells || []).map((sp) => ({
        spell: sp.spell.index,
        level: (sp.prerequisites || []).find((p) => p.type === 'level')?.name,
      })),
      specific: subLevels,
    });
  });

  // ---------- species / races ----------
  let species;
  if (ed === '2014') {
    const subraces = load(ed, 'Subraces');
    species = load(ed, 'Races').map((r) =>
      compact({
        id: r.index,
        name: r.name,
        speed: r.speed,
        size: r.size,
        sizeDesc: r.size_description,
        age: r.age,
        alignment: r.alignment,
        bonuses: (r.ability_bonuses || []).map((b) => ({ ability: ab(b.ability_score), bonus: b.bonus })),
        bonusChoice: r.ability_bonus_options
          ? { choose: r.ability_bonus_options.choose, from: r.ability_bonus_options.from.options.map((o) => ab(o.ability_score)), bonus: 1 }
          : undefined,
        languages: r.language_desc,
        traits: (r.traits || []).map(traitOut),
        subraces: subraces
          .filter((s) => s.race.index === r.index)
          .map((s) =>
            compact({
              id: s.index,
              name: s.name,
              desc: desc(s),
              bonuses: (s.ability_bonuses || []).map((b) => ({ ability: ab(b.ability_score), bonus: b.bonus })),
              traits: (s.racial_traits || []).map(traitOut),
            }),
          ),
      }),
    );
  } else {
    const subspecies = load(ed, 'Subspecies');
    species = load(ed, 'Species').map((r) =>
      compact({
        id: r.index,
        name: r.name,
        speed: r.speed,
        size: r.size || (r.size_options ? r.size_options.from?.options?.map((o) => o.string || o).join(' or ') : undefined),
        creatureType: r.type,
        traits: (r.traits || []).map(traitOut),
        subraces: subspecies
          .filter((s) => s.species.index === r.index)
          .map((s) => compact({ id: s.index, name: s.name, desc: desc(s), traits: (s.traits || []).map(traitOut) })),
      }),
    );
  }

  // ---------- backgrounds ----------
  const backgrounds = load(ed, 'Backgrounds').map((b) => {
    const profs = b.starting_proficiencies || b.proficiencies || [];
    const pickStrings = (x) => (x?.from?.options || []).map((o) => o.string || o.desc).filter(Boolean);
    return compact({
      id: b.index,
      name: b.name,
      skills: profs.filter((p) => p.index.startsWith('skill-')).map((p) => skillKey(p.index)),
      tools: profs.filter((p) => !p.index.startsWith('skill-')).map((p) => p.name.replace(/^Tool: /, '')),
      abilities: (b.ability_scores || []).map(ab),
      feat: b.feat ? { id: b.feat.index, name: b.feat.name + (b.feat.note ? ` (${b.feat.note})` : '') } : undefined,
      languages: b.language_options?.choose,
      feature: b.feature ? { name: b.feature.name, desc: text(b.feature.desc) } : undefined,
      equipment: [
        ...(b.starting_equipment || []).map((e) => `${e.quantity}× ${e.equipment.name}`),
        ...optionsToText(b.equipment_options),
        ...(b.starting_gold ? [`${b.starting_gold.quantity} ${b.starting_gold.unit}`] : []),
      ],
      personality: pickStrings(b.personality_traits),
      ideals: (b.ideals?.from?.options || []).map((o) => o.desc).filter(Boolean),
      bonds: pickStrings(b.bonds),
      flaws: pickStrings(b.flaws),
    });
  });

  // ---------- feats ----------
  const feats = load(ed, 'Feats').map((f) =>
    compact({
      id: f.index,
      name: f.name,
      type: f.type,
      desc: desc(f),
      repeatable: f.repeatable,
      prereq:
        (f.prerequisites && !Array.isArray(f.prerequisites)
          ? Object.entries(f.prerequisites).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(', ')
          : (f.prerequisites || []).map((p) => (p.ability_score ? `${p.ability_score.name} ${p.minimum_score}+` : JSON.stringify(p))).join(', ')) || undefined,
    }),
  );

  // ---------- spells ----------
  const spells = load(ed, 'Spells').map((s) => {
    const dmg = Array.isArray(s.damage) ? s.damage[0] : s.damage;
    return compact({
      id: s.index,
      name: s.name,
      level: s.level,
      school: s.school?.name,
      classes: (s.classes || []).map((c) => c.index),
      time: s.casting_time,
      range: s.range,
      comp: (s.components || []).join(', '),
      material: s.material,
      duration: s.duration,
      conc: s.concentration || undefined,
      ritual: s.ritual || undefined,
      attack: s.attack_type,
      save: s.dc?.dc_type?.index,
      dmgType: dmg?.damage_type?.name,
      dmgSlot: dmg?.damage_at_slot_level,
      dmgChar: dmg?.damage_at_character_level,
      heal: s.heal_at_slot_level,
      area: s.area_of_effect ? `${s.area_of_effect.size} ft ${s.area_of_effect.type}` : undefined,
      desc: desc(s),
      higher: text(s.higher_level),
    });
  });

  // ---------- equipment ----------
  const equipment = load(ed, 'Equipment').map((e) => {
    const cats = e.equipment_categories ? e.equipment_categories.map((c) => c.index) : [e.equipment_category?.index];
    let weapon, armor;
    if (e.damage || cats.includes('weapon') || cats.includes('weapons')) {
      const props = (e.properties || []).map((p) => p.index);
      const cat = e.weapon_category || (cats.some((c) => c.startsWith('martial')) ? 'Martial' : 'Simple');
      const rng = e.weapon_range || (cats.some((c) => c.includes('ranged')) ? 'Ranged' : 'Melee');
      weapon = compact({
        cat,
        range: rng,
        dmg: e.damage?.damage_dice,
        type: e.damage?.damage_type?.name,
        twoHanded: e.two_handed_damage?.damage_dice,
        props,
        normal: e.range?.normal,
        long: e.range?.long,
        thrown: e.throw_range ? `${e.throw_range.normal}/${e.throw_range.long}` : undefined,
        mastery: e.mastery?.name,
      });
    }
    if (e.armor_class) {
      const c = e.armor_category || (cats.includes('shields') ? 'Shield' : cats.find((x) => /light|medium|heavy/.test(x))?.replace('-armor', ''));
      let catName = c ? c[0].toUpperCase() + c.slice(1) : 'Armor';
      // upstream data lists 2024 Hide Armor as light; a capped Dex bonus means medium armor
      if (catName === 'Light' && e.armor_class.max_bonus) catName = 'Medium';
      armor = compact({
        cat: catName,
        base: e.armor_class.base,
        dex: e.armor_class.dex_bonus,
        max: e.armor_class.max_bonus || (catName === 'Medium' ? 2 : undefined),
        stealth: e.stealth_disadvantage || undefined,
        str: e.str_minimum || undefined,
      });
    }
    const category = weapon ? 'Weapon' : armor ? 'Armor' : e.gear_category?.name || e.tool_category || e.vehicle_category || (e.equipment_category?.name ?? e.equipment_categories?.[0]?.name) || 'Gear';
    return compact({
      id: e.index,
      name: e.name,
      category,
      cost: e.cost ? `${e.cost.quantity} ${e.cost.unit}` : undefined,
      weight: e.weight,
      weapon,
      armor,
      desc: text(e.desc ?? e.description) + (e.special ? '\n\n' + text(e.special) : '') + (e.notes ? '\n\n' + text(e.notes) : ''),
    });
  });

  const magicItems = load(ed, 'Magic-Items')
    .filter((m) => !m.variant)
    .map((m) =>
      compact({
        id: m.index,
        name: m.name,
        category: m.equipment_category?.name,
        rarity: m.rarity?.name,
        attune: m.attunement || (/requires attunement/i.test(text(m.desc)) ? true : undefined),
        desc: desc(m),
      }),
    );

  const simple = (name) => load(ed, name).map((x) => compact({ id: x.index, name: x.name, desc: desc(x) }));

  const rules = ed === '2014' ? load(ed, 'Rule-Sections').map((r) => ({ id: r.index, name: r.name, desc: desc(r) })) : [];
  const languages = load(ed, 'Languages').map((l) => compact({ id: l.index, name: l.name, type: l.type || (l.is_rare ? 'Rare' : 'Standard'), desc: l.desc || l.note }));

  return {
    edition: ed,
    abilities,
    skills,
    classes,
    subclasses,
    species,
    backgrounds,
    feats,
    spells,
    equipment,
    magicItems,
    conditions: simple('Conditions'),
    weaponProps: simple('Weapon-Properties'),
    masteries: simple('Weapon-Mastery-Properties'),
    damageTypes: simple('Damage-Types'),
    schools: simple('Magic-Schools'),
    languages,
    rules,
  };
}

const CR = (n) => (n === 0.125 ? '1/8' : n === 0.25 ? '1/4' : n === 0.5 ? '1/2' : String(n));
const join = (arr) => (arr || []).map((x) => (typeof x === 'string' ? x : x.name || x.index)).join(', ') || undefined;
const act = (a) => compact({
  name: a.name,
  desc: a.desc || '',
  toHit: a.attack_bonus,
  damage: (a.damage || []).find((d) => d.damage_dice)?.damage_dice?.replace(/\s/g, ''),
  dc: a.dc ? `CD ${a.dc.dc_value} ${a.dc.dc_type?.name ?? ''}`.trim() : undefined,
});
function buildMonsters(ed) {
  return load(ed, 'Monsters').map((m) => compact({
    id: m.index,
    name: m.name,
    size: m.size,
    type: [m.type, m.subtype].filter(Boolean).join(' '),
    ac: (m.armor_class || [])[0]?.value ?? 10,
    hp: m.hit_points,
    hpDice: m.hit_points_roll || m.hit_dice,
    speed: Object.entries(m.speed || {}).map(([k, v]) => (k === 'walk' ? v : `${k} ${v}`)).join(', '),
    scores: { str: m.strength, dex: m.dexterity, con: m.constitution, int: m.intelligence, wis: m.wisdom, cha: m.charisma },
    cr: CR(m.challenge_rating),
    xp: m.xp,
    senses: Object.entries(m.senses || {}).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(', '),
    languages: m.languages,
    resist: join(m.damage_resistances), immune: join(m.damage_immunities), vulnerable: join(m.damage_vulnerabilities), condImmune: join(m.condition_immunities),
    traits: (m.special_abilities || []).map((t) => ({ name: t.name, desc: t.desc })),
    actions: (m.actions || []).map(act),
    bonus: (m.bonus_actions || []).map(act),
    reactions: (m.reactions || []).map(act),
    legendary: (m.legendary_actions || []).map(act),
  }));
}

for (const ed of ['2014', '2024']) {
  const mon = buildMonsters(ed);
  fs.writeFileSync(path.join(OUT, `monsters-${ed}.json`), JSON.stringify(mon));
  console.log(ed, 'monsters', mon.length, (fs.statSync(path.join(OUT, `monsters-${ed}.json`)).size / 1024).toFixed(0) + 'KB');
  const data = build(ed);
  const file = path.join(OUT, `srd-${ed}.json`);
  fs.writeFileSync(file, JSON.stringify(data));
  const counts = Object.entries(data)
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => `${k}:${v.length}`)
    .join(' ');
  console.log(ed, (fs.statSync(file).size / 1024).toFixed(0) + 'KB', counts);
}
