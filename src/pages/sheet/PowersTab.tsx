import { useMemo, useState } from 'react';
import { HelpCircle, Minus, Plus, Search, Sparkle, Trash2 } from 'lucide-react';
import type { PowerDef, PowerListDef } from '../../data/types';
import { classCounters, knownPowers, listPowers, powerPool } from '../../engine/classData';
import { Detail } from '../../ui/Detail';
import { Markdown, Modal, clickable } from '../../ui/ui';
import { PowerMeta, PowerUse } from './PowerUse';
import type { SheetProps } from '../Sheet';

/**
 * One tab per power list of the class (disciplines, talents…): the pool that pays for them, the
 * powers the character knows as cards, and a picker to add one. A click opens cost, range and effect.
 */
export function PowersTab({ c, srd, upd, list }: SheetProps & { list: PowerListDef }) {
  const [open, setOpen] = useState<PowerDef | null>(null);
  const [adding, setAdding] = useState(false);
  const mine = knownPowers(c, srd, list.id);
  const pool = powerPool(c, srd, list);
  // the counter the list names as "how many you know" is shown as "4 de 4"
  const known = list.known ? classCounters(c, srd).find((x) => x.def.id === list.known) : undefined;

  return (
    <div className="col g16">
      <div className="panel">
        <div className="panel-title">
          <h3>{list.name}</h3>
          {list.desc && <span className="tip" title={list.desc} aria-label={list.desc}><HelpCircle size={14} /></span>}
          <span className="spacer" />
          {/* the class count; a subclass may give extra ones on top, so it isn't a hard cap */}
          {known && <span className={'tag' + (mine.length < known.value ? ' gold' : '')} title={(known.def.desc ? known.def.desc + ' ' : '') + (mine.length < known.value ? 'Falta escolher.' : 'Subclasses e talentos podem dar outros além destes.')}>{known.def.name} pela classe: {known.value}</span>}
          <button className="btn sm primary edit-only" onClick={() => setAdding(true)}><Plus size={14} /> Adicionar</button>
        </div>
        {pool && (
          <div className="row wrap g8 power-pool">
            <b title={`O que você tem para gastar nos poderes desta lista. ${pool.resource.reset === 'long' ? 'Volta toda no descanso longo.' : pool.resource.reset === 'short' ? 'Volta no descanso curto.' : ''}`}>{pool.resource.name}</b>
            <button className="btn icon sm" disabled={pool.left <= 0} onClick={() => upd((d) => { const r = d.resources.find((x) => x.uid === pool.resource.uid); if (r) r.used = Math.min(r.max, r.used + 1); })} aria-label={`Gastar 1 ${pool.unit}`}><Minus size={13} /></button>
            <span className="pool-num">{pool.left}<small>/{pool.max}</small></span>
            <button className="btn icon sm" disabled={pool.left >= pool.max} onClick={() => upd((d) => { const r = d.resources.find((x) => x.uid === pool.resource.uid); if (r) r.used = Math.max(0, r.used - 1); })} aria-label={`Recuperar 1 ${pool.unit}`}><Plus size={13} /></button>
            <div className="pool-bar grow"><i style={{ width: (pool.max ? (pool.left / pool.max) * 100 : 0) + '%' }} /></div>
            {pool.limit != null && <span className="small muted" title="O máximo que um único uso de um poder pode gastar">até {pool.limit} por uso</span>}
          </div>
        )}
      </div>

      {mine.length === 0 && <div className="panel empty small">Nenhum poder desta lista ainda. <span className="edit-only">Use <b>Adicionar</b> ou escolha ao subir de nível.</span></div>}
      <div className="power-grid">
        {mine.map((p) => (
          <div key={p.id} className={'power-card' + (c.psychicFocus === p.name ? ' focused' : '')} {...clickable(() => setOpen(p), `Abrir ${p.name}`)}>
            <div className="row g6">
              <b className="grow">{p.name}</b>
              {c.psychicFocus === p.name && <span className="tag gold" title="Foco ativo"><Sparkle size={11} /> foco</span>}
              <button className="btn icon sm ghost danger edit-only" onClick={(e) => { e.stopPropagation(); upd((d) => (d.powers = (d.powers || []).filter((x) => x !== p.id))); }} aria-label={`Tirar ${p.name}`} title="Tirar da ficha"><Trash2 size={13} /></button>
            </div>
            <PowerMeta p={p} unit={pool?.unit || list.unit} />
            {p.options?.length ? <div className="small muted">{p.options.map((o) => o.name).join(' · ')}</div> : <div className="small muted clamp2">{p.desc.replace(/\*\*/g, '')}</div>}
          </div>
        ))}
      </div>

      {open && (
        <Detail title={open.name} onClose={() => setOpen(null)}>
          <PowerUse c={c} srd={srd} upd={upd} power={open} list={list} />
        </Detail>
      )}
      {adding && <PowerPicker options={listPowers(srd, list.id).filter((p) => !(c.powers || []).includes(p.id))} title={`Adicionar: ${list.name}`} onClose={() => setAdding(false)} onPick={(p) => { upd((d) => (d.powers = [...(d.powers || []), p.id])); setAdding(false); }} />}
    </div>
  );
}

/** A searchable list of powers with the text of the selected one (also used when leveling up). */
export function PowerPicker({ options, title, onPick, onClose }: { options: PowerDef[]; title: string; onPick: (p: PowerDef) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<PowerDef | null>(options[0] || null);
  const shown = useMemo(() => options.filter((p) => !q || (p.name + ' ' + (p.tags || []).join(' ')).toLowerCase().includes(q.toLowerCase())), [options, q]);
  return (
    <Modal wide title={title} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!sel} onClick={() => sel && onPick(sel)}>Adicionar {sel?.name || ''}</button></>}>
      <div className="picker2">
        <div className="col g6">
          <label className="row g6 input-icon"><Search size={14} /><input className="input" autoFocus placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <div className="picker2-list">
            {shown.map((p) => (
              <button key={p.id} className={'picker2-item' + (sel?.id === p.id ? ' on' : '')} onClick={() => setSel(p)} onDoubleClick={() => onPick(p)}>
                <span className="grow">{p.name}</span>{p.tags?.[0] && <span className="tag">{p.tags[0]}</span>}
              </button>
            ))}
            {!shown.length && <div className="small faint">Nada encontrado.</div>}
          </div>
        </div>
        <div className="picker2-view">
          {sel ? (<><h3 style={{ marginTop: 0 }}>{sel.name}</h3><PowerMeta p={sel} /><Markdown text={sel.desc} />{sel.focus && <p className="small"><b>Foco:</b> {sel.focus}</p>}{sel.options?.map((o) => <p key={o.name} className="small"><b>{o.name}</b>{o.cost ? ` (${o.cost}${o.costMax ? '–' + o.costMax : ''})` : ''}: {o.desc}</p>)}</>) : <div className="faint small">Escolha um poder.</div>}
        </div>
      </div>
    </Modal>
  );
}
