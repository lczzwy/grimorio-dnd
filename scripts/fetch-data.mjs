// Downloads the raw SRD JSON (5e-bits/5e-database) into data-raw/. Run `npm run data` to refresh.
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://raw.githubusercontent.com/5e-bits/5e-database/main/src';
const FILES = {
  '2014': ['Ability-Scores', 'Alignments', 'Backgrounds', 'Classes', 'Conditions', 'Damage-Types', 'Equipment', 'Feats', 'Features', 'Languages', 'Levels', 'Magic-Items', 'Magic-Schools', 'Proficiencies', 'Races', 'Rule-Sections', 'Rules', 'Skills', 'Spells', 'Subclasses', 'Subraces', 'Traits', 'Weapon-Properties'],
  '2024': ['Ability-Scores', 'Alignments', 'Backgrounds', 'Classes', 'Conditions', 'Damage-Types', 'Equipment', 'Feats', 'Features', 'Languages', 'Levels', 'Magic-Items', 'Magic-Schools', 'Proficiencies', 'Skills', 'Species', 'Spells', 'Subclasses', 'Subspecies', 'Traits', 'Weapon-Mastery-Properties', 'Weapon-Properties'],
};
for (const [ed, names] of Object.entries(FILES)) {
  const dir = path.join('data-raw', ed);
  fs.mkdirSync(dir, { recursive: true });
  await Promise.all(names.map(async (n) => {
    const res = await fetch(`${BASE}/${ed}/en/5e-SRD-${n}.json`);
    if (!res.ok) throw new Error(`${ed}/${n}: HTTP ${res.status}`);
    fs.writeFileSync(path.join(dir, n + '.json'), await res.text());
  }));
  console.log(ed, names.length, 'arquivos');
}
