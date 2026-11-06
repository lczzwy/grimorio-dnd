import { useState } from 'react';
import { Plus, Trash2, Pencil, Download, Upload, ClipboardPaste, Hammer } from 'lucide-react';
import type { Ability, ClassDef, ClassLevel, Edition, FeatureRef, SrdData } from '../data/types';
import { ABILITIES } from '../data/types';
import { useSrd } from '../data/srd';
import { useApp, type HomebrewKind } from '../store';
import { ABILITY_PT, SCHOOL_PT, SKILL_PT, className, profBonus } from '../engine/rules';
import { Modal, NumInput, download, go, pickFile, useFlash } from '../ui/ui';
import { isCompanionFile } from '../import/companion';
import { importCompanionCharacter, companionReport } from '../import/importFile';

type AnyItem = { id: string; name: string } & Record<string, unknown>;

const KINDS: { k: HomebrewKind; label: string; hint: string }[] = [
  { k: 'species', label: 'Raças / Espécies', hint: 'Ex.: Mind Flayer, Aasimar, Tabaxi' },
  { k: 'classes', label: 'Classes', hint: 'Ex.: Místico, Artífice, Caçador de Sangue' },
  { k: 'subclasses', label: 'Subclasses', hint: 'Ex.: Domínio da Forja, Mestre de Batalha' },
  { k: 'backgrounds', label: 'Antecedentes', hint: 'Ex.: Nobre, Soldado, Charlatão' },
  { k: 'feats', label: 'Talentos', hint: 'Ex.: Sentinela, Mestre em Armas Grandes' },
  { k: 'spells', label: 'Magias', hint: 'Ex.: Toll the Dead, Booming Blade' },
  { k: 'equipment', label: 'Equipamento', hint: 'Armas, armaduras e itens comuns' },
  { k: 'magicItems', label: 'Itens mágicos', hint: 'Ex.: Espada Vorpal personalizada' },
];

const slug = (s: string) => 'hb-' + s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function blank(kind: HomebrewKind): AnyItem {
  switch (kind) {
    case 'species': return { id: '', name: '', speed: 30, size: 'Medium', bonuses: [], traits: [], languages: '' };
    case 'classes': return { id: '', name: '', hitDie: 8, saves: [], profs: [], profIds: [], levels: [], _caster: 'none', _features: [], _skills: { choose: 2, from: [] }, _ability: '' };
    case 'subclasses': return { id: '', name: '', class: 'fighter', desc: '', features: [] };
    case 'backgrounds': return { id: '', name: '', skills: [], tools: [], abilities: [], desc: '' };
    case 'feats': return { id: '', name: '', type: 'general', desc: '', prereq: '' };
    case 'spells': return { id: '', name: '', level: 1, school: 'Evocation', classes: [], time: '1 action', range: '60 feet', comp: 'V, S', duration: 'Instantaneous', desc: '', higher: '' };
    case 'equipment': return { id: '', name: '', category: 'Gear', weight: 0, cost: '' };
    case 'magicItems': return { id: '', name: '', rarity: 'Uncommon', desc: '', attune: false };
  }
}

/** Builds the 20-level table for a homebrew class from its features and a caster template. */
function buildClassLevels(d: AnyItem, srd: SrdData): ClassLevel[] {
  const template = { full: 'wizard', half: 'paladin', pact: 'warlock', none: '' }[d._caster as string] || '';
  const tpl = srd.classes.find((c) => c.id === template);
  const feats = (d._features as FeatureRef[]) || [];
  return Array.from({ length: 20 }, (_, i) => {
    const level = i + 1;
    const sc = tpl?.levels.find((l) => l.level === level)?.spellcasting;
    return {
      level,
      prof: profBonus(level),
      features: feats.filter((f) => (f.level || 1) === level).map((f) => ({ name: f.name, desc: f.desc })),
      spellcasting: sc ? { ...sc } : undefined,
    };
  });
}

function FeatureList({ value, onChange, withLevel = true, label = 'Características' }: { value: FeatureRef[]; onChange: (v: FeatureRef[]) => void; withLevel?: boolean; label?: string }) {
  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="row"><span className="tiny muted grow">{label}</span><button className="btn sm" onClick={() => onChange([...value, { name: '', desc: '', level: withLevel ? 1 : undefined }])}><Plus size={13} /> Adicionar</button></div>
      {value.map((f, i) => (
        <div key={i} className="panel col" style={{ padding: 10, gap: 6 }}>
          <div className="row">
            {withLevel && <label className="row small" style={{ gap: 4 }}>Nv<NumInput value={f.level || 1} min={1} max={20} style={{ width: 50 }} onChange={(n) => onChange(value.map((x, j) => (j === i ? { ...x, level: n } : x)))} /></label>}
            <input className="input grow" placeholder="Nome" value={f.name} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <button className="btn icon sm ghost danger" onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
          </div>
          <textarea className="textarea" style={{ minHeight: 70, fontSize: 14 }} placeholder="Descrição (aceita **negrito**)" value={f.desc} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)))} />
        </div>
      ))}
    </div>
  );
}

function MultiPick<T extends string>({ options, value, onChange, max }: { options: { v: T; l: string }[]; value: T[]; onChange: (v: T[]) => void; max?: number }) {
  return (
    <div className="row wrap" style={{ gap: 5 }}>
      {options.map((o) => {
        const on = value.includes(o.v);
        return <button key={o.v} type="button" className={'btn sm' + (on ? ' active' : '')} onClick={() => onChange(on ? value.filter((x) => x !== o.v) : max && value.length >= max ? [...value.slice(1), o.v] : [...value, o.v])}>{o.l}</button>;
      })}
    </div>
  );
}

function Editor({ kind, init, srd, edition, onClose }: { kind: HomebrewKind; init: AnyItem; srd: SrdData; edition: Edition; onClose: () => void }) {
  const add = useApp((s) => s.addHomebrew);
  const flash = useFlash((s) => s.show);
  const [d, setD] = useState<AnyItem>(() => structuredClone(init));
  const set = (patch: Record<string, unknown>) => setD((x) => ({ ...x, ...patch }));
  const abOpts = ABILITIES.map((a) => ({ v: a, l: ABILITY_PT[a].short }));
  const skillOpts = srd.skills.map((s) => ({ v: s.key, l: SKILL_PT[s.key] || s.name }));

  const save = () => {
    const out: AnyItem = { ...d, id: d.id || slug(d.name) };
    if (kind === 'classes') {
      out.levels = buildClassLevels(d, srd);
      out.skillChoice = (d._skills as { from: string[] }).from.length ? d._skills : undefined;
      out.spellcasting = d._ability ? { ability: d._ability, level: 1, info: [] } : undefined;
      out.profs = String(d._profText ?? (d.profs as string[]).join(', ')).split(',').map((s) => s.trim()).filter(Boolean);
    }
    add(edition, kind, out);
    flash(`${out.name} salvo no homebrew`);
    onClose();
  };

  const name = <label className="field">Nome<input className="input" autoFocus value={d.name} onChange={(e) => set({ name: e.target.value })} /></label>;
  const descField = (k = 'desc', lbl = 'Descrição') => <label className="field">{lbl}<textarea className="textarea" style={{ minHeight: 140 }} value={(d[k] as string) || ''} onChange={(e) => set({ [k]: e.target.value })} /></label>;

  return (
    <Modal wide title={(init.id ? 'Editar: ' : 'Novo: ') + (KINDS.find((x) => x.k === kind)?.label || '')} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!d.name.trim()} onClick={save}>Salvar</button></>}>
      <div className="col">
        {name}
        {kind === 'species' && (<>
          <div className="row wrap">
            <label className="field">Tamanho<input className="input" value={(d.size as string) || ''} onChange={(e) => set({ size: e.target.value })} /></label>
            <label className="field">Deslocamento (ft)<NumInput value={d.speed as number} onChange={(n) => set({ speed: n })} /></label>
            {edition === '2024' && <label className="field">Tipo de criatura<input className="input" value={(d.creatureType as string) || ''} onChange={(e) => set({ creatureType: e.target.value })} placeholder="Humanoid, Aberration…" /></label>}
          </div>
          {edition === '2014' && (
            <div className="col" style={{ gap: 6 }}>
              <span className="tiny muted">Bônus de atributo</span>
              <div className="row wrap">
                {ABILITIES.map((a) => {
                  const b = ((d.bonuses as { ability: Ability; bonus: number }[]) || []).find((x) => x.ability === a)?.bonus || 0;
                  return <label key={a} className="row small" style={{ gap: 4 }}>{ABILITY_PT[a].short}<NumInput value={b} min={-4} max={4} style={{ width: 46 }} onChange={(n) => set({ bonuses: [...((d.bonuses as { ability: Ability }[]) || []).filter((x) => x.ability !== a), ...(n ? [{ ability: a, bonus: n }] : [])] })} /></label>;
                })}
              </div>
            </div>
          )}
          <label className="field">Idiomas<input className="input" value={(d.languages as string) || ''} onChange={(e) => set({ languages: e.target.value })} /></label>
          <FeatureList withLevel={false} label="Traços raciais" value={(d.traits as FeatureRef[]) || []} onChange={(v) => set({ traits: v })} />
        </>)}

        {kind === 'classes' && (<>
          <div className="row wrap">
            <label className="field">Dado de Vida
              <select className="select" value={d.hitDie as number} onChange={(e) => set({ hitDie: +e.target.value })}>{[6, 8, 10, 12].map((n) => <option key={n} value={n}>d{n}</option>)}</select>
            </label>
            <label className="field">Conjuração
              <select className="select" value={d._caster as string} onChange={(e) => set({ _caster: e.target.value })}>
                <option value="none">Não conjura</option><option value="full">Conjurador pleno (como Mago)</option><option value="half">Meio-conjurador (como Paladino)</option><option value="pact">Pacto (como Bruxo)</option>
              </select>
            </label>
            <label className="field">Atributo de conjuração
              <select className="select" value={d._ability as string} onChange={(e) => set({ _ability: e.target.value })}><option value="">—</option>{ABILITIES.map((a) => <option key={a} value={a}>{ABILITY_PT[a].name}</option>)}</select>
            </label>
          </div>
          <div className="col" style={{ gap: 6 }}><span className="tiny muted">Salvaguardas (2)</span><MultiPick options={abOpts} value={d.saves as Ability[]} max={2} onChange={(v) => set({ saves: v })} /></div>
          <label className="field">Proficiências (separadas por vírgula)<input className="input" value={(d._profText as string) ?? (d.profs as string[]).join(', ')} onChange={(e) => set({ _profText: e.target.value })} placeholder="Light Armor, Simple Weapons, Martial Weapons…" /></label>
          <div className="col" style={{ gap: 6 }}>
            <div className="row"><span className="tiny muted grow">Perícias à escolha</span>Escolher<NumInput value={(d._skills as { choose: number }).choose} min={0} max={6} style={{ width: 46 }} onChange={(n) => set({ _skills: { ...(d._skills as object), choose: n } })} /></div>
            <MultiPick options={skillOpts} value={(d._skills as { from: string[] }).from} onChange={(v) => set({ _skills: { ...(d._skills as object), from: v } })} />
          </div>
          <FeatureList label="Características por nível" value={(d._features as FeatureRef[]) || []} onChange={(v) => set({ _features: v })} />
        </>)}

        {kind === 'subclasses' && (<>
          <label className="field">Classe
            <select className="select" value={d.class as string} onChange={(e) => set({ class: e.target.value })}>{srd.classes.map((c) => <option key={c.id} value={c.id}>{className(c.id, srd)}</option>)}</select>
          </label>
          {descField()}
          <FeatureList value={(d.features as FeatureRef[]) || []} onChange={(v) => set({ features: v })} />
        </>)}

        {kind === 'backgrounds' && (<>
          <div className="col" style={{ gap: 6 }}><span className="tiny muted">Perícias</span><MultiPick options={skillOpts} value={(d.skills as string[]) || []} onChange={(v) => set({ skills: v })} /></div>
          <label className="field">Ferramentas (vírgula)<input className="input" value={((d.tools as string[]) || []).join(', ')} onChange={(e) => set({ tools: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} /></label>
          {edition === '2024' ? (<>
            <div className="col" style={{ gap: 6 }}><span className="tiny muted">Atributos que pode aumentar (3)</span><MultiPick options={abOpts} value={(d.abilities as Ability[]) || []} max={3} onChange={(v) => set({ abilities: v })} /></div>
            <label className="field">Talento de origem
              <select className="select" value={(d.feat as { id: string })?.id || ''} onChange={(e) => { const f = srd.feats.find((x) => x.id === e.target.value); set({ feat: f ? { id: f.id, name: f.name } : undefined }); }}>
                <option value="">—</option>{srd.feats.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </label>
          </>) : (
            <div className="row wrap">
              <label className="field grow">Característica (nome)<input className="input" value={(d.feature as { name: string })?.name || ''} onChange={(e) => set({ feature: { ...(d.feature as object), name: e.target.value } })} /></label>
              <label className="field" style={{ width: '100%' }}>Característica (texto)<textarea className="textarea" value={(d.feature as { desc: string })?.desc || ''} onChange={(e) => set({ feature: { ...(d.feature as object), desc: e.target.value } })} /></label>
            </div>
          )}
          <label className="field">Equipamento<input className="input" value={((d.equipment as string[]) || []).join('; ')} onChange={(e) => set({ equipment: [e.target.value] })} /></label>
          {descField()}
        </>)}

        {kind === 'feats' && (<>
          <div className="row wrap">
            <label className="field">Tipo<select className="select" value={d.type as string} onChange={(e) => set({ type: e.target.value })}>{['origin', 'general', 'fighting-style', 'epic-boon'].map((t) => <option key={t}>{t}</option>)}</select></label>
            <label className="field grow">Pré-requisito<input className="input" value={(d.prereq as string) || ''} onChange={(e) => set({ prereq: e.target.value })} /></label>
          </div>
          {descField()}
        </>)}

        {kind === 'spells' && (<>
          <div className="row wrap">
            <label className="field">Círculo<select className="select" value={d.level as number} onChange={(e) => set({ level: +e.target.value })}>{Array.from({ length: 10 }, (_, i) => <option key={i} value={i}>{i === 0 ? 'Truque' : i + 'º'}</option>)}</select></label>
            <label className="field">Escola<select className="select" value={d.school as string} onChange={(e) => set({ school: e.target.value })}>{Object.keys(SCHOOL_PT).map((s) => <option key={s} value={s}>{SCHOOL_PT[s]}</option>)}</select></label>
            <label className="field">Tempo<input className="input" value={d.time as string} onChange={(e) => set({ time: e.target.value })} /></label>
            <label className="field">Alcance<input className="input" value={d.range as string} onChange={(e) => set({ range: e.target.value })} /></label>
            <label className="field">Componentes<input className="input" value={d.comp as string} onChange={(e) => set({ comp: e.target.value })} /></label>
            <label className="field">Duração<input className="input" value={d.duration as string} onChange={(e) => set({ duration: e.target.value })} /></label>
          </div>
          <div className="row wrap">
            <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={!!d.conc} onChange={(e) => set({ conc: e.target.checked || undefined })} /> Concentração</label>
            <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={!!d.ritual} onChange={(e) => set({ ritual: e.target.checked || undefined })} /> Ritual</label>
            <label className="field">Salvaguarda<select className="select" value={(d.save as string) || ''} onChange={(e) => set({ save: e.target.value || undefined })}><option value="">—</option>{ABILITIES.map((a) => <option key={a} value={a}>{ABILITY_PT[a].short}</option>)}</select></label>
            <label className="field">Ataque<select className="select" value={(d.attack as string) || ''} onChange={(e) => set({ attack: e.target.value || undefined })}><option value="">—</option><option value="melee">Corpo a corpo</option><option value="ranged">À distância</option></select></label>
            <label className="field">Dano (ex.: 3d6)<input className="input" value={(d.dmgSlot as Record<string, string>)?.[String(d.level || 1)] || ''} onChange={(e) => set({ dmgSlot: e.target.value ? { [String(d.level || 1)]: e.target.value } : undefined })} /></label>
            <label className="field">Tipo de dano<input className="input" value={(d.dmgType as string) || ''} onChange={(e) => set({ dmgType: e.target.value })} /></label>
          </div>
          <div className="col" style={{ gap: 6 }}><span className="tiny muted">Classes</span><MultiPick options={srd.classes.map((c) => ({ v: c.id, l: className(c.id, srd) }))} value={(d.classes as string[]) || []} onChange={(v) => set({ classes: v })} /></div>
          {descField()}
          {descField('higher', 'Em níveis superiores')}
        </>)}

        {kind === 'equipment' && (<>
          <div className="row wrap">
            <label className="field">Categoria<select className="select" value={d.category as string} onChange={(e) => set({ category: e.target.value, weapon: e.target.value === 'Weapon' ? d.weapon || { cat: 'Simple', range: 'Melee', dmg: '1d6', type: 'Slashing', props: [] } : undefined, armor: e.target.value === 'Armor' ? d.armor || { cat: 'Light', base: 11, dex: true } : undefined })}>{['Gear', 'Weapon', 'Armor', 'Tool'].map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className="field">Peso (lb)<NumInput value={d.weight as number} onChange={(n) => set({ weight: n })} /></label>
            <label className="field">Custo<input className="input" value={(d.cost as string) || ''} onChange={(e) => set({ cost: e.target.value })} /></label>
          </div>
          {d.category === 'Weapon' && (() => { const w = d.weapon as Record<string, unknown>; const sw = (p: object) => set({ weapon: { ...w, ...p } }); return (
            <div className="row wrap">
              <label className="field">Tipo<select className="select" value={w.cat as string} onChange={(e) => sw({ cat: e.target.value })}><option>Simple</option><option>Martial</option></select></label>
              <label className="field">Alcance<select className="select" value={w.range as string} onChange={(e) => sw({ range: e.target.value })}><option>Melee</option><option>Ranged</option></select></label>
              <label className="field">Dano<input className="input" value={w.dmg as string} onChange={(e) => sw({ dmg: e.target.value })} /></label>
              <label className="field">Tipo de dano<input className="input" value={w.type as string} onChange={(e) => sw({ type: e.target.value })} /></label>
              <label className="field">Propriedades (vírgula)<input className="input" value={((w.props as string[]) || []).join(', ')} onChange={(e) => sw({ props: e.target.value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) })} placeholder="finesse, light, thrown" /></label>
            </div>); })()}
          {d.category === 'Armor' && (() => { const a = d.armor as Record<string, unknown>; const sa = (p: object) => set({ armor: { ...a, ...p } }); return (
            <div className="row wrap">
              <label className="field">Tipo<select className="select" value={a.cat as string} onChange={(e) => sa({ cat: e.target.value, dex: e.target.value !== 'Heavy' && e.target.value !== 'Shield', max: e.target.value === 'Medium' ? 2 : undefined })}>{['Light', 'Medium', 'Heavy', 'Shield'].map((x) => <option key={x}>{x}</option>)}</select></label>
              <label className="field">CA base<NumInput value={a.base as number} onChange={(n) => sa({ base: n })} /></label>
              <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={!!a.stealth} onChange={(e) => sa({ stealth: e.target.checked })} /> Desvantagem em Furtividade</label>
            </div>); })()}
          {descField()}
        </>)}

        {kind === 'magicItems' && (<>
          <div className="row wrap">
            <label className="field">Raridade<select className="select" value={d.rarity as string} onChange={(e) => set({ rarity: e.target.value })}>{['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'].map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className="field">Categoria<input className="input" value={(d.category as string) || ''} onChange={(e) => set({ category: e.target.value })} placeholder="Wondrous Item, Weapon…" /></label>
            <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={!!d.attune} onChange={(e) => set({ attune: e.target.checked })} /> Requer sintonização</label>
          </div>
          {descField()}
        </>)}
      </div>
    </Modal>
  );
}

const PASTE_HELP = `Cole um pacote JSON. Formato:
{
  "species": [{ "id": "mind-flayer", "name": "Mind Flayer", "speed": 30, "size": "Medium",
    "bonuses": [{ "ability": "int", "bonus": 2 }],
    "traits": [{ "name": "Telepatia", "desc": "..." }] }],
  "classes": [...], "subclasses": [...], "backgrounds": [...],
  "feats": [...], "spells": [...], "equipment": [...], "magicItems": [...]
}`;

export function HomebrewPage({ edition }: { edition: Edition }) {
  const srd = useSrd(edition);
  const hb = useApp((s) => s.homebrew[edition]);
  const remove = useApp((s) => s.removeHomebrew);
  const importHb = useApp((s) => s.importHomebrew);
  const flash = useFlash((s) => s.show);
  const [edit, setEdit] = useState<{ kind: HomebrewKind; item: AnyItem } | null>(null);
  const [paste, setPaste] = useState<string | null>(null);
  if (!srd) return <main className="page"><div className="empty">Abrindo o grimório…</div></main>;

  const total = Object.values(hb || {}).reduce((s, a) => s + (a?.length || 0), 0);

  const doImport = async (txt: string) => {
    let data: unknown;
    try {
      data = JSON.parse(txt);
    } catch (e) {
      alert('JSON inválido: ' + (e as Error).message);
      return;
    }
    if (isCompanionFile(data)) {
      // a character sheet, not a content pack: route it to the character importer
      if (!confirm(`Isso é uma ficha de personagem do 5e Companion, não um pacote de homebrew.

Importar como personagem na mesa D&D 2014?`)) return;
      setPaste(null);
      const { character, created, warnings } = await importCompanionCharacter(data);
      flash(`${character.name} importado do 5e Companion!`);
      if (created.length || warnings.length) alert(companionReport(created, warnings));
      go(`2014/c/${character.id}`);
      return;
    }
    const r = importHb(edition, data);
    if (!r.kept) {
      alert('Nada foi importado: o arquivo não tem itens de homebrew reconhecíveis (species, classes, subclasses, backgrounds, feats, spells, equipment ou magicItems, cada um com "name").');
      return;
    }
    setPaste(null);
    flash(`${r.kept} item(ns) importado(s)${r.dropped ? `, ${r.dropped} ignorado(s) por formato inválido` : ''}.`);
  };

  const openEdit = (kind: HomebrewKind, item: AnyItem) => {
    if (kind === 'classes') {
      const c = item as unknown as ClassDef;
      const feats = c.levels?.flatMap((l) => (l.features || []).map((f) => ({ ...f, level: l.level }))) || [];
      const caster = c.levels?.some((l) => l.spellcasting) ? (c.levels.find((l) => l.level === 1)?.spellcasting?.slots[0] ? 'full' : 'half') : 'none';
      setEdit({ kind, item: { ...item, _features: feats, _caster: (item._caster as string) || caster, _skills: c.skillChoice || { choose: 2, from: [] }, _ability: c.spellcasting?.ability || '' } });
    } else setEdit({ kind, item });
  };

  return (
    <main className="page">
      <div className="roster-head">
        <div className="grow">
          <div className="tiny muted">Mesa {edition} · conteúdo da sua mesa</div>
          <h1><Hammer size={28} style={{ verticalAlign: '-3px' }} /> Homebrew</h1>
          <p className="muted" style={{ margin: '6px 0 0', maxWidth: 720 }}>Cadastre raças, classes, magias e itens de outros livros ou criados por vocês. Tudo aparece no criador de personagem e no compêndio. Exporte o pacote para compartilhar com a mesa.</p>
        </div>
        <button className="btn" onClick={() => setPaste('')}><ClipboardPaste size={16} /> Colar JSON</button>
        <button className="btn" onClick={async () => { const f = await pickFile('.json,.cah'); if (f) doImport(await f.text()); }}><Upload size={16} /> Importar pacote</button>
        <button className="btn" disabled={!total} onClick={() => download(`homebrew-${edition}.json`, hb)}><Download size={16} /> Exportar ({total})</button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {KINDS.map(({ k, label, hint }) => {
          const items = ((hb?.[k] as AnyItem[] | undefined) || []);
          return (
            <div key={k} className="panel col">
              <div className="panel-title" style={{ marginBottom: 0 }}><h3>{label}</h3><span className="spacer" /><button className="btn sm primary" onClick={() => setEdit({ kind: k, item: blank(k) })}><Plus size={14} /> Novo</button></div>
              <div className="small faint">{hint}</div>
              {items.length === 0 && <div className="empty small" style={{ padding: 12 }}>Nada ainda.</div>}
              {items.map((it) => (
                <div key={it.id} className="row" style={{ padding: '6px 8px', borderRadius: 8, background: 'var(--bg-2)' }}>
                  <span className="grow" style={{ fontWeight: 600 }}>{it.name}</span>
                  <button className="btn icon sm ghost" onClick={() => openEdit(k, it)}><Pencil size={13} /></button>
                  <button className="btn icon sm ghost danger" onClick={() => confirm(`Excluir ${it.name}?`) && remove(edition, k, it.id)}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {edit && <Editor kind={edit.kind} init={edit.item} srd={srd} edition={edition} onClose={() => setEdit(null)} />}
      {paste !== null && (
        <Modal title="Colar pacote JSON" onClose={() => setPaste(null)} footer={<button className="btn primary" disabled={!paste.trim()} onClick={() => doImport(paste)}>Importar</button>}>
          <pre className="small muted" style={{ whiteSpace: 'pre-wrap', background: 'var(--bg-2)', padding: 10, borderRadius: 8, marginTop: 0 }}>{PASTE_HELP}</pre>
          <textarea className="textarea" style={{ minHeight: 220, fontFamily: 'monospace', fontSize: 13 }} value={paste} onChange={(e) => setPaste(e.target.value)} />
        </Modal>
      )}
    </main>
  );
}
