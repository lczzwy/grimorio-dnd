import { useMemo, useState } from 'react';
import { Plus, Search, Trash2, Wand2, Check, Brain } from 'lucide-react';
import type { Character, SpellDef, SrdData } from '../../data/types';
import { useDice } from '../../store';
import { ABILITY_PT, SCHOOL_PT, className, spellAttack, spellLimits, spellSaveDc, spellSlots, spellcastingClasses, totalLevel } from '../../engine/rules';
import { fmtMod } from '../../engine/dice';
import { Markdown, Modal, useFlash } from '../../ui/ui';
import type { SheetProps } from '../Sheet';

const LVL = (l: number) => (l === 0 ? 'Truques' : `${l}º círculo`);

/** Damage/heal dice for a spell cast at a given slot (or character level for cantrips). */
export function spellDice(sp: SpellDef, slot: number, charLevel: number): { formula: string; kind: 'dano' | 'cura' } | null {
  if (sp.dmgSlot) {
    const keys = Object.keys(sp.dmgSlot).map(Number).sort((a, b) => a - b);
    const k = keys.filter((x) => x <= slot).pop() ?? keys[0];
    return { formula: sp.dmgSlot[k].replace(/\s/g, ''), kind: 'dano' };
  }
  if (sp.dmgChar) {
    const keys = Object.keys(sp.dmgChar).map(Number).sort((a, b) => a - b);
    const k = keys.filter((x) => x <= charLevel).pop() ?? keys[0];
    return { formula: sp.dmgChar[k].replace(/\s/g, ''), kind: 'dano' };
  }
  if (sp.heal) {
    const keys = Object.keys(sp.heal).map(Number).sort((a, b) => a - b);
    const k = keys.filter((x) => x <= slot).pop() ?? keys[0];
    return { formula: sp.heal[k].replace(/\s/g, ''), kind: 'cura' };
  }
  return null;
}

export function SpellCard({ sp, srd, c, actions }: { sp: SpellDef; srd: SrdData; c?: Character; actions?: React.ReactNode }) {
  const roll = useDice((s) => s.roll);
  const lvl = c ? totalLevel(c) : 1;
  const dice = spellDice(sp, sp.level, lvl);
  // modifiers like "+ MOD" aren't rolled automatically; we strip them for the dice button
  const clean = dice?.formula.replace(/\+?MOD/gi, '').replace(/\+$/, '');
  return (
    <div className="col">
      <div className="row wrap">
        <span className="tag accent">{sp.level === 0 ? 'Truque' : `${sp.level}º círculo`}</span>
        {sp.school && <span className="tag">{SCHOOL_PT[sp.school] || sp.school}</span>}
        {sp.conc && <span className="tag gold">Concentração</span>}
        {sp.ritual && <span className="tag gold">Ritual</span>}
        {sp.custom && <span className="tag good">homebrew</span>}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        {[['Tempo de conjuração', sp.time], ['Alcance', sp.range + (sp.area ? ` (${sp.area})` : '')], ['Componentes', sp.comp + (sp.material ? ` (${sp.material})` : '')], ['Duração', sp.duration]].map(([k, v]) => (
          <div key={k} className="panel" style={{ padding: 10 }}><div className="tiny muted">{k}</div><div className="small" style={{ fontWeight: 600 }}>{v || '—'}</div></div>
        ))}
      </div>
      <Markdown text={sp.desc} />
      {sp.higher && <Markdown text={`**Em níveis superiores.** ${sp.higher}`} />}
      {sp.classes?.length ? <div className="small muted">Classes: {sp.classes.map((x) => className(x, srd)).join(', ')}</div> : null}
      <div className="row wrap">
        {sp.save && <span className="tag">Salvaguarda: {ABILITY_PT[sp.save]?.name || sp.save}</span>}
        {sp.attack && <span className="tag">Ataque {sp.attack === 'melee' ? 'corpo a corpo' : 'à distância'}</span>}
        {clean && <button className="roll-chip" onClick={() => roll(`${sp.name} (${dice!.kind})`, clean)}>🎲 {dice!.formula} {sp.dmgType || ''}</button>}
        {actions}
      </div>
    </div>
  );
}

export function SpellPicker({ srd, c, onPick, onClose, title = 'Adicionar magia' }: { srd: SrdData; c?: Character; onPick: (sp: SpellDef) => void; onClose: () => void; title?: string }) {
  const myClasses = c ? c.classes.map((e) => e.classId) : [];
  const [q, setQ] = useState('');
  const [cls, setCls] = useState<string>(myClasses.find((id) => srd.spells.some((s) => s.classes?.includes(id))) || '');
  const [lvl, setLvl] = useState<number | ''>('');
  const [sel, setSel] = useState<SpellDef | null>(null);
  const known = new Set(c?.spells.map((s) => s.id));
  const list = useMemo(() => srd.spells
    .filter((s) => (!cls || s.classes?.includes(cls)) && (lvl === '' || s.level === lvl) && (!q || s.name.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)), [srd, cls, lvl, q]);
  return (
    <Modal wide title={title} onClose={onClose}>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <div className="row grow" style={{ position: 'relative', minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, color: 'var(--faint)' }} />
          <input className="input" style={{ paddingLeft: 32 }} autoFocus placeholder="Buscar magia (nome em inglês)…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="select" style={{ width: 150 }} value={cls} onChange={(e) => setCls(e.target.value)}>
          <option value="">Todas as classes</option>
          {srd.classes.filter((k) => srd.spells.some((s) => s.classes?.includes(k.id))).map((k) => <option key={k.id} value={k.id}>{className(k.id, srd)}</option>)}
        </select>
        <select className="select" style={{ width: 130 }} value={lvl} onChange={(e) => setLvl(e.target.value === '' ? '' : +e.target.value)}>
          <option value="">Todos os níveis</option>
          {Array.from({ length: 10 }, (_, i) => <option key={i} value={i}>{LVL(i)}</option>)}
        </select>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(220px, 1fr) 1.4fr', alignItems: 'start' }}>
        <div className="pick-list" style={{ maxHeight: '55vh', overflow: 'auto' }}>
          {list.map((s) => (
            <div key={s.id} className={'pick-item' + (sel?.id === s.id ? ' sel' : '')} onClick={() => setSel(s)}>
              <span className="tag" style={{ width: 30, justifyContent: 'center' }}>{s.level || 'T'}</span>
              <span className="grow">{s.name}</span>
              {known.has(s.id) ? <Check size={15} color="var(--good)" /> : (
                <button className="btn icon sm" onClick={(e) => { e.stopPropagation(); onPick(s); }} title="Adicionar"><Plus size={14} /></button>
              )}
            </div>
          ))}
          {!list.length && <div className="empty small">Nada encontrado.</div>}
        </div>
        <div className="panel" style={{ position: 'sticky', top: 0 }}>
          {sel ? <><h2 style={{ marginBottom: 10 }}>{sel.name}</h2><SpellCard sp={sel} srd={srd} c={c} actions={!known.has(sel.id) && <button className="btn primary sm" onClick={() => onPick(sel)}><Plus size={14} /> Adicionar</button>} /></> : <div className="empty">Selecione uma magia para ler.</div>}
        </div>
      </div>
    </Modal>
  );
}

export function SpellsTab({ c, srd, upd }: SheetProps) {
  const roll = useDice((s) => s.roll);
  const flash = useFlash((s) => s.show);
  const [picker, setPicker] = useState(false);
  const [view, setView] = useState<SpellDef | null>(null);
  const [cast, setCast] = useState<SpellDef | null>(null);
  const casters = spellcastingClasses(c, srd);
  const { slots, pact } = spellSlots(c, srd);
  const who = c.name || 'Personagem';
  const spells = c.spells.map((k) => ({ k, sp: srd.spells.find((s) => s.id === k.id) })).filter((x): x is { k: typeof x.k; sp: SpellDef } => !!x.sp);
  const byLevel = new Map<number, typeof spells>();
  spells.sort((a, b) => a.sp.name.localeCompare(b.sp.name)).forEach((x) => byLevel.set(x.sp.level, [...(byLevel.get(x.sp.level) || []), x]));
  const conc = c.concentration ? srd.spells.find((s) => s.id === c.concentration) : undefined;

  const doCast = (sp: SpellDef, slotLevel: number, usePact: boolean) => {
    upd((d) => {
      if (sp.level > 0) {
        if (usePact) d.pactUsed += 1;
        else d.slotsUsed[slotLevel - 1] += 1;
      }
      if (sp.conc) d.concentration = sp.id;
    });
    const dice = spellDice(sp, slotLevel, totalLevel(c));
    const f = dice?.formula.replace(/\+?MOD/gi, '').replace(/\+$/, '');
    if (sp.attack) roll(`${who}: ${sp.name} (ataque mágico)`, `1d20${fmtMod(spellAttack(c, srd))}`);
    if (f) setTimeout(() => roll(`${who}: ${sp.name} (${dice!.kind}, ${slotLevel ? slotLevel + 'º' : 'truque'})`, f), sp.attack ? 900 : 0);
    if (!f && !sp.attack) flash(`${sp.name} conjurada${sp.save ? ` · CD ${spellSaveDc(c, srd)} (${ABILITY_PT[sp.save]?.short})` : ''}`);
    setCast(null);
  };

  return (
    <div className="col" style={{ gap: 16 }}>
      {casters.length === 0 && c.spells.length === 0 && (
        <div className="panel empty">
          <Wand2 size={28} />
          <p>Sua classe não conjura magias, mas você pode adicionar magias de raça, talento ou itens.</p>
          <button className="btn" onClick={() => setPicker(true)}><Plus size={15} /> Adicionar magia</button>
        </div>
      )}

      {casters.length > 0 && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {casters.map((k) => {
            const lim = spellLimits(c, srd, k.id);
            const ab = k.spellcasting!.ability;
            return (
              <div key={k.id} className="panel">
                <div className="panel-title"><h3>{className(k.id, srd)}</h3><span className="spacer" /><span className="tag accent">{ABILITY_PT[ab].name}</span></div>
                <div className="row" style={{ justifyContent: 'space-around' }}>
                  <div className="center"><div className="display" style={{ fontSize: 28, fontWeight: 900 }}>{spellSaveDc(c, srd, ab)}</div><div className="tiny muted">CD</div></div>
                  <button className="roll-chip" style={{ flexDirection: 'column', padding: '6px 14px' }} onClick={() => roll(`${who}: ataque mágico`, `1d20${fmtMod(spellAttack(c, srd, ab))}`)}>
                    <span className="display" style={{ fontSize: 24 }}>{fmtMod(spellAttack(c, srd, ab))}</span><span className="tiny muted">Ataque</span>
                  </button>
                  <div className="center small">
                    {lim.cantrips != null && <div>Truques: <b>{lim.cantrips}</b></div>}
                    {lim.known != null && <div>Conhecidas: <b>{lim.known}</b></div>}
                    {lim.prepared != null && <div>Preparadas: <b>{c.spells.filter((s) => s.prepared && (srd.spells.find((x) => x.id === s.id)?.level ?? 0) > 0).length}/{lim.prepared}</b></div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(slots.some((x) => x > 0) || pact) && (
        <div className="panel">
          <div className="panel-title"><h3>Espaços de magia</h3><span className="spacer" />
            {conc && <span className="tag gold"><Brain size={12} /> Concentrando: {conc.name} <button className="btn icon sm ghost" style={{ width: 18, height: 18 }} onClick={() => upd((d) => (d.concentration = undefined))}>×</button></span>}
          </div>
          {slots.map((n, i) => n > 0 && (
            <div key={i} className="slot-row">
              <span className="slot-lvl">{i + 1}º</span>
              <div className="boxes grow">
                {Array.from({ length: n }, (_, j) => {
                  const avail = j < n - c.slotsUsed[i];
                  return <button key={j} className={'box' + (avail ? ' on' : ' used')} onClick={() => upd((d) => (d.slotsUsed[i] = avail ? d.slotsUsed[i] + 1 : Math.max(0, d.slotsUsed[i] - 1)))} />;
                })}
              </div>
              <span className="small muted">{n - c.slotsUsed[i]}/{n}</span>
            </div>
          ))}
          {pact && (
            <div className="slot-row">
              <span className="slot-lvl" style={{ color: 'var(--accent-2)' }}>Pacto {pact.level}º</span>
              <div className="boxes grow">
                {Array.from({ length: pact.count }, (_, j) => {
                  const avail = j < pact.count - c.pactUsed;
                  return <button key={j} className={'box diamond' + (avail ? ' on' : ' used')} onClick={() => upd((d) => (d.pactUsed = avail ? d.pactUsed + 1 : Math.max(0, d.pactUsed - 1)))} />;
                })}
              </div>
              <span className="small muted">recupera no descanso curto</span>
            </div>
          )}
        </div>
      )}

      <div className="panel">
        <div className="panel-title"><h3>Magias</h3><span className="spacer" /><button className="btn sm primary" onClick={() => setPicker(true)}><Plus size={14} /> Adicionar magia</button></div>
        {spells.length === 0 && <div className="empty small">Nenhuma magia ainda.</div>}
        {[...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([lvl, arr]) => (
          <div key={lvl} style={{ marginBottom: 12 }}>
            <div className="tiny muted" style={{ margin: '6px 0' }}>{LVL(lvl)}</div>
            {arr.map(({ k, sp }) => (
              <div key={sp.id} className="spell" onClick={() => setView(sp)}>
                {lvl > 0 ? (
                  <button className={'prep' + (k.alwaysPrepared ? ' always' : k.prepared ? ' on' : '')} title="Preparada" onClick={(e) => { e.stopPropagation(); if (!k.alwaysPrepared) upd((d) => { const x = d.spells.find((y) => y.id === sp.id)!; x.prepared = !x.prepared; }); }} />
                ) : <span style={{ width: 18 }} />}
                <div style={{ minWidth: 0 }}>
                  <div className="sn">{sp.name} {sp.conc && <span className="tag gold" style={{ padding: '0 5px' }}>C</span>} {sp.ritual && <span className="tag" style={{ padding: '0 5px' }}>R</span>}</div>
                  <div className="meta">{[sp.time, sp.range, sp.dmgType, sp.save && `TR ${ABILITY_PT[sp.save]?.short}`].filter(Boolean).join(' · ')}</div>
                </div>
                <button className="btn sm" onClick={(e) => { e.stopPropagation(); if (sp.level === 0) doCast(sp, 0, false); else setCast(sp); }}><Wand2 size={13} /> Conjurar</button>
              </div>
            ))}
          </div>
        ))}
      </div>

      {picker && <SpellPicker srd={srd} c={c} onClose={() => setPicker(false)} onPick={(sp) => { upd((d) => { if (!d.spells.some((s) => s.id === sp.id)) d.spells.push({ id: sp.id, prepared: sp.level === 0 }); }); flash(`${sp.name} adicionada`); }} />}
      {view && (
        <Modal title={view.name} onClose={() => setView(null)} footer={<>
          <button className="btn danger" onClick={() => { upd((d) => (d.spells = d.spells.filter((s) => s.id !== view.id))); setView(null); }}><Trash2 size={14} /> Remover</button>
          <span className="spacer" />
          <button className="btn primary" onClick={() => { const v = view; setView(null); if (v.level === 0) doCast(v, 0, false); else setCast(v); }}><Wand2 size={14} /> Conjurar</button>
        </>}>
          <SpellCard sp={view} srd={srd} c={c} />
        </Modal>
      )}
      {cast && (
        <Modal title={`Conjurar ${cast.name}`} onClose={() => setCast(null)}>
          <div className="col">
            <p className="muted" style={{ margin: 0 }}>Escolha o espaço de magia a gastar:</p>
            {cast.ritual && <button className="btn" onClick={() => { upd((d) => cast.conc && (d.concentration = cast.id)); flash(`${cast.name} conjurada como ritual (+10 min)`); setCast(null); }}>📿 Como ritual (sem gastar espaço)</button>}
            <div className="row wrap">
              {slots.map((n, i) => i + 1 >= cast.level && n > 0 && (
                <button key={i} className="btn" disabled={n - c.slotsUsed[i] <= 0} onClick={() => doCast(cast, i + 1, false)}>{i + 1}º círculo ({n - c.slotsUsed[i]})</button>
              ))}
              {pact && pact.level >= cast.level && <button className="btn" disabled={pact.count - c.pactUsed <= 0} onClick={() => doCast(cast, pact.level, true)}>Pacto {pact.level}º ({pact.count - c.pactUsed})</button>}
              <button className="btn ghost" onClick={() => doCast({ ...cast, level: 0 } as SpellDef, cast.level, false)}>Sem gastar (item/característica)</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
