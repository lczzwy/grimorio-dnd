import { useMemo, useState } from 'react';
import { Search, Sparkles, Users, BookMarked, Award, Sword, Gem, AlertTriangle, Scale, ChevronRight, Crown } from 'lucide-react';
import type { Edition, SrdData, SpellDef, EquipmentDef, MagicItemDef } from '../data/types';
import { useSrd } from '../data/srd';
import { ABILITY_PT, CONDITION_PT, SCHOOL_PT, SKILL_PT, className, speciesName } from '../engine/rules';
import { Markdown, go } from '../ui/ui';
import { SpellCard } from './sheet/SpellsTab';
import { ItemDetail } from './sheet/InventoryTab';

type Sec = 'magias' | 'classes' | 'subclasses' | 'especies' | 'antecedentes' | 'talentos' | 'equipamento' | 'itens' | 'condicoes' | 'regras';

interface Entry { id: string; name: string; sub?: string; custom?: boolean; render: () => React.ReactNode; filterKey?: string }

function sections(srd: SrdData, ed: Edition): { k: Sec; label: string; icon: typeof Search; entries: Entry[] }[] {
  const out: { k: Sec; label: string; icon: typeof Search; entries: Entry[] }[] = [
    {
      k: 'magias', label: 'Magias', icon: Sparkles,
      entries: srd.spells.map((s: SpellDef) => ({ id: s.id, name: s.name, custom: s.custom, sub: `${s.level === 0 ? 'Truque' : s.level + 'º'} · ${SCHOOL_PT[s.school || ''] || s.school || ''}${s.en ? ` · ${s.en}` : ''}`, filterKey: String(s.level) + '|' + (s.classes || []).join(','), render: () => <SpellCard sp={s} srd={srd} /> })),
    },
    {
      k: 'classes', label: 'Classes', icon: Crown,
      entries: srd.classes.map((c) => ({
        id: c.id, name: className(c.id, srd), sub: `d${c.hitDie}${c.spellcasting ? ' · conjurador' : ''}`, custom: c.custom,
        render: () => (
          <div className="col">
            <div className="row wrap">
              <span className="tag accent">Dado de Vida d{c.hitDie}</span>
              <span className="tag">Salvaguardas: {c.saves.map((a) => ABILITY_PT[a].short).join(', ')}</span>
              {c.spellcasting && <span className="tag gold">Conjuração: {ABILITY_PT[c.spellcasting.ability].name}</span>}
            </div>
            <div className="small"><b>Proficiências:</b> <span className="muted">{c.profs.join(', ')}</span></div>
            {c.skillChoice && <div className="small"><b>Perícias:</b> <span className="muted">escolha {c.skillChoice.choose} entre {c.skillChoice.from.map((s) => SKILL_PT[s] || s).join(', ')}</span></div>}
            {c.equipment?.length ? <div className="small"><b>Equipamento:</b> <span className="muted">{c.equipment.join('; ')}</span></div> : null}
            <ClassTable c={c} />
            {c.spellcasting?.info.map((i) => <details key={i.name} className="feature"><summary><ChevronRight className="chev" size={16} />{i.name}</summary><div className="body"><Markdown text={i.desc} /></div></details>)}
            {c.levels.flatMap((l) => (l.features || []).map((f) => (
              <details key={l.level + f.name} className="feature"><summary><ChevronRight className="chev" size={16} /><span className="tag">{l.level}</span>{f.name}</summary><div className="body"><Markdown text={f.desc} /></div></details>
            )))}
          </div>
        ),
      })),
    },
    {
      k: 'subclasses', label: 'Subclasses', icon: Award,
      entries: srd.subclasses.map((s) => ({
        id: s.id, name: s.name, sub: className(s.class, srd), custom: s.custom,
        render: () => (
          <div className="col">
            <span className="tag accent" style={{ alignSelf: 'flex-start' }}>{className(s.class, srd)}{s.flavor ? ` · ${s.flavor}` : ''}</span>
            {s.summary && <i className="muted">{s.summary}</i>}
            <Markdown text={s.desc} />
            {s.features.map((f, i) => <details key={i} className="feature"><summary><ChevronRight className="chev" size={16} /><span className="tag">{f.level}</span>{f.name}</summary><div className="body"><Markdown text={f.desc} /></div></details>)}
          </div>
        ),
      })),
    },
    {
      k: 'especies', label: ed === '2014' ? 'Raças' : 'Espécies', icon: Users,
      entries: srd.species.map((s) => ({
        id: s.id, name: speciesName(s.id, srd), sub: s.name, custom: s.custom,
        render: () => (
          <div className="col">
            <div className="row wrap">
              {s.size && <span className="tag">{s.size}</span>}<span className="tag">{s.speed ?? 30} ft</span>
              {(s.bonuses || []).map((b) => <span key={b.ability} className="tag accent">{ABILITY_PT[b.ability].short} +{b.bonus}</span>)}
              {s.bonusChoice && <span className="tag accent">+1 em {s.bonusChoice.choose} à escolha</span>}
            </div>
            {s.age && <Markdown text={`**Idade.** ${s.age}`} />}
            {s.alignment && <Markdown text={`**Tendência.** ${s.alignment}`} />}
            {s.sizeDesc && <Markdown text={`**Tamanho.** ${s.sizeDesc}`} />}
            {s.languages && <Markdown text={`**Idiomas.** ${s.languages}`} />}
            {(s.traits || []).map((t) => <details key={t.name} className="feature" open><summary><ChevronRight className="chev" size={16} />{t.name}</summary><div className="body"><Markdown text={t.desc} /></div></details>)}
            {(s.subraces || []).map((sr) => (
              <div key={sr.id} className="panel">
                <h3 style={{ marginBottom: 6 }}>{sr.name}</h3>
                <div className="row wrap">{(sr.bonuses || []).map((b) => <span key={b.ability} className="tag accent">{ABILITY_PT[b.ability].short} +{b.bonus}</span>)}</div>
                <Markdown text={sr.desc} />
                {(sr.traits || []).map((t) => <Markdown key={t.name} text={`**${t.name}.** ${t.desc}`} />)}
              </div>
            ))}
          </div>
        ),
      })),
    },
    {
      k: 'antecedentes', label: 'Antecedentes', icon: BookMarked,
      entries: srd.backgrounds.map((b) => ({
        id: b.id, name: b.name, custom: b.custom, sub: (b.skills || []).map((s) => SKILL_PT[s]).join(', '),
        render: () => (
          <div className="col">
            <div className="row wrap">
              {b.skills?.map((s) => <span key={s} className="tag accent">{SKILL_PT[s] || s}</span>)}
              {b.tools?.map((t) => <span key={t} className="tag">{t}</span>)}
              {b.abilities?.length ? <span className="tag gold">Atributos: {b.abilities.map((a) => ABILITY_PT[a].short).join(', ')}</span> : null}
              {b.feat && <span className="tag gold">Talento: {b.feat.name}</span>}
            </div>
            <Markdown text={b.desc} />
            {b.feature && <Markdown text={`**${b.feature.name}.** ${b.feature.desc}`} />}
            {b.equipment?.length ? <div className="small"><b>Equipamento:</b> <span className="muted">{b.equipment.join('; ')}</span></div> : null}
            {b.personality?.length ? <><h3>Traços de personalidade</h3><ul className="prose">{b.personality.map((p) => <li key={p}>{p}</li>)}</ul></> : null}
          </div>
        ),
      })),
    },
    {
      k: 'talentos', label: 'Talentos', icon: Award,
      entries: srd.feats.map((f) => ({ id: f.id, name: f.name, sub: f.type, custom: f.custom, render: () => <div className="col">{f.prereq && <span className="tag bad" style={{ alignSelf: 'flex-start' }}>Pré-requisito: {f.prereq}</span>}<Markdown text={f.desc} />{f.repeatable && <i className="small muted">{f.repeatable}</i>}</div> })),
    },
    {
      k: 'equipamento', label: 'Equipamento', icon: Sword,
      entries: srd.equipment.map((e: EquipmentDef) => ({ id: e.id, name: e.name, sub: [e.category, e.cost].filter(Boolean).join(' · '), custom: e.custom, filterKey: e.category, render: () => <ItemDetail x={e} /> })),
    },
    {
      k: 'itens', label: 'Itens mágicos', icon: Gem,
      entries: srd.magicItems.map((m: MagicItemDef) => ({ id: m.id, name: m.name, sub: m.rarity, custom: m.custom, filterKey: m.rarity, render: () => <ItemDetail x={m} /> })),
    },
    {
      k: 'condicoes', label: 'Condições', icon: AlertTriangle,
      entries: srd.conditions.map((x) => ({ id: x.id, name: CONDITION_PT[x.id] || x.name, sub: x.name, render: () => <Markdown text={x.desc} /> })),
    },
  ];
  const rules = [
    ...srd.rules.map((r) => ({ id: r.id, name: r.name, sub: 'Regra', render: () => <Markdown text={r.desc} /> })),
    ...srd.weaponProps.map((r) => ({ id: 'wp-' + r.id, name: r.name, sub: 'Propriedade de arma', render: () => <Markdown text={r.desc} /> })),
    ...srd.masteries.map((r) => ({ id: 'wm-' + r.id, name: r.name, sub: 'Maestria de arma', render: () => <Markdown text={r.desc} /> })),
    ...srd.schools.map((r) => ({ id: 'sc-' + r.id, name: SCHOOL_PT[r.name] || r.name, sub: 'Escola de magia', render: () => <Markdown text={r.desc} /> })),
    ...srd.damageTypes.map((r) => ({ id: 'dt-' + r.id, name: r.name, sub: 'Tipo de dano', render: () => <Markdown text={r.desc} /> })),
  ];
  out.push({ k: 'regras', label: 'Regras', icon: Scale, entries: rules });
  return out;
}

function ClassTable({ c }: { c: SrdData['classes'][number] }) {
  const caster = c.levels.some((l) => l.spellcasting?.slots.some(Boolean));
  const maxSlot = caster ? Math.max(...c.levels.map((l) => (l.spellcasting?.slots || []).reduce((m, v, i) => (v ? i + 1 : m), 0))) : 0;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="prose" style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr><th>Nv</th><th>Prof.</th><th>Características</th>{caster && <th>Truq.</th>}{Array.from({ length: maxSlot }, (_, i) => <th key={i}>{i + 1}º</th>)}</tr></thead>
        <tbody>
          {c.levels.map((l) => (
            <tr key={l.level}>
              <td>{l.level}</td><td>+{l.prof ?? 2 + Math.floor((l.level - 1) / 4)}</td>
              <td>{(l.features || []).map((f) => f.name).join(', ') || '—'}</td>
              {caster && <td>{l.spellcasting?.cantrips ?? '—'}</td>}
              {Array.from({ length: maxSlot }, (_, i) => <td key={i}>{l.spellcasting?.slots[i] || '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Compendium({ edition, section }: { edition: Edition; section?: string }) {
  const srd = useSrd(edition);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [lvl, setLvl] = useState('');
  const [cls, setCls] = useState('');
  const secs = useMemo(() => (srd ? sections(srd, edition) : []), [srd, edition]);
  if (!srd) return <main className="page"><div className="empty">Abrindo o grimório…</div></main>;
  const cur = secs.find((s) => s.k === section) || secs[0];
  const list = cur.entries
    .filter((e) => !q || (e.name + ' ' + (e.sub || '')).toLowerCase().includes(q.toLowerCase()))
    .filter((e) => cur.k !== 'magias' || ((!lvl || e.filterKey?.split('|')[0] === lvl) && (!cls || e.filterKey?.split('|')[1].split(',').includes(cls))))
    .sort((a, b) => a.name.localeCompare(b.name));
  const entry = cur.entries.find((e) => e.id === sel) || list[0];

  return (
    <main className="page" style={{ maxWidth: 1500 }}>
      <div className="comp-layout">
        <nav className="comp-nav panel" style={{ padding: 8 }}>
          {secs.map((s) => (
            <button key={s.k} className={cur.k === s.k ? 'on' : ''} onClick={() => { go(`${edition}/compendio/${s.k}`); setSel(null); setQ(''); }}>
              <s.icon size={16} /> {s.label} <span className="n">{s.entries.length}</span>
            </button>
          ))}
        </nav>
        <div className="panel" style={{ padding: 10 }}>
          <div className="row" style={{ position: 'relative', marginBottom: 8 }}>
            <Search size={15} style={{ position: 'absolute', left: 10, color: 'var(--faint)' }} />
            <input className="input" style={{ paddingLeft: 32 }} placeholder={`Buscar em ${cur.label.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {cur.k === 'magias' && (
            <div className="row" style={{ marginBottom: 8 }}>
              <select className="select" value={lvl} onChange={(e) => setLvl(e.target.value)}>
                <option value="">Nível</option>{Array.from({ length: 10 }, (_, i) => <option key={i} value={i}>{i === 0 ? 'Truque' : i + 'º'}</option>)}
              </select>
              <select className="select" value={cls} onChange={(e) => setCls(e.target.value)}>
                <option value="">Classe</option>{srd.classes.map((c) => <option key={c.id} value={c.id}>{className(c.id, srd)}</option>)}
              </select>
            </div>
          )}
          <div className="small faint" style={{ margin: '0 4px 6px' }}>{list.length} resultado(s)</div>
          <div className="pick-list">
            {list.map((e) => (
              <div key={e.id} className={'pick-item' + (entry?.id === e.id ? ' sel' : '')} onClick={() => setSel(e.id)}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{e.name} {e.custom && <span className="tag good" style={{ padding: '0 6px' }}>homebrew</span>}</div>
                  {e.sub && <div className="small muted">{e.sub}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          {entry ? <><h1 style={{ fontSize: 28, marginBottom: 12 }}>{entry.name}</h1>{entry.render()}</> : <div className="empty">Nada aqui.</div>}
        </div>
      </div>
    </main>
  );
}
