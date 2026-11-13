import { useMemo, useState } from 'react';
import { Detail } from '../../ui/Detail';
import { lbToKg } from '../../engine/units';
import { Plus, Search, Trash2, Sword, Shield, Gem, Package, Wand2 } from 'lucide-react';
import type { EquipmentDef, InventoryItem, MagicItemDef, SrdData } from '../../data/types';
import { uid } from '../../engine/character';
import { carriedWeight, carryCapacity } from '../../engine/rules';
import { Markdown, Modal, NumInput, useFlash, clickable } from '../../ui/ui';
import type { SheetProps } from '../Sheet';
import { applyGuess, guessItem } from '../../import/items';
import { fold } from '../../engine/classData';

const COINS = [
  ['pp', 'Platina', '#cfd8e3'],
  ['gp', 'Ouro', '#e6c15a'],
  ['ep', 'Electro', '#b9c7a6'],
  ['sp', 'Prata', '#bfc4cc'],
  ['cp', 'Cobre', '#c98a5a'],
] as const;

export function ItemPicker({ srd, onPick, onClose }: { srd: SrdData; onPick: (it: InventoryItem) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'eq' | 'magic' | 'custom'>('eq');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<EquipmentDef | MagicItemDef | null>(null);
  const [custom, setCustom] = useState({ name: '', weight: 0, qty: 1, notes: '' });
  const list = useMemo(() => {
    const src = tab === 'eq' ? srd.equipment : srd.magicItems;
    return (src as (EquipmentDef | MagicItemDef)[]).filter((x) => !q || x.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  }, [srd, tab, q]);
  const toItem = (x: EquipmentDef | MagicItemDef): InventoryItem => {
    const e = x as EquipmentDef;
    const m = x as MagicItemDef;
    const bonus = /\+(\d)/.exec(x.name)?.[1];
    return { uid: uid(), refId: x.id, name: x.name, qty: 1, weight: e.weight, weapon: e.weapon, armor: e.armor, equipped: !!(e.weapon || e.armor), magic: tab === 'magic', magicBonus: bonus ? +bonus : undefined, notes: m.rarity };
  };
  return (
    <Modal wide title="Adicionar item" onClose={onClose}>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <div className="seg">
          <button className={tab === 'eq' ? 'on' : ''} onClick={() => { setTab('eq'); setSel(null); }}>Equipamento</button>
          <button className={tab === 'magic' ? 'on' : ''} onClick={() => { setTab('magic'); setSel(null); }}>Itens mágicos</button>
          <button className={tab === 'custom' ? 'on' : ''} onClick={() => setTab('custom')}>Personalizado</button>
        </div>
        {tab !== 'custom' && <div className="row grow" style={{ position: 'relative', minWidth: 200 }}>
          <Search size={15} className="search-ic" />
          <input className="input pl-search" autoFocus placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>}
      </div>
      {tab === 'custom' ? (
        <div className="col">
          <label className="field">Nome<input className="input" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} /></label>
          <div className="row">
            <label className="field">Quantidade<NumInput value={custom.qty} min={1} onChange={(n) => setCustom({ ...custom, qty: n })} /></label>
            <label className="field">Peso (lb)<NumInput value={custom.weight} min={0} onChange={(n) => setCustom({ ...custom, weight: n })} /></label>
          </div>
          <label className="field">Notas<textarea className="textarea" value={custom.notes} onChange={(e) => setCustom({ ...custom, notes: e.target.value })} /></label>
          <button className="btn primary" disabled={!custom.name} onClick={() => onPick({ uid: uid(), ...custom })}><Plus size={14} /> Adicionar</button>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(220px, 1fr) 1.3fr', alignItems: 'start' }}>
          <div className="pick-list" style={{ maxHeight: '55vh', overflow: 'auto' }}>
            {list.map((x) => (
              <div key={x.id} className={'pick-item' + (sel?.id === x.id ? ' sel' : '')} {...clickable(() => setSel(x))}>
                {(x as EquipmentDef).weapon ? <Sword size={14} /> : (x as EquipmentDef).armor ? <Shield size={14} /> : tab === 'magic' ? <Gem size={14} /> : <Package size={14} />}
                <span className="grow">{x.name}</span>
                <span className="small faint">{(x as EquipmentDef).cost || (x as MagicItemDef).rarity}</span>
                <button className="btn icon sm" onClick={(e) => { e.stopPropagation(); onPick(toItem(x)); }}><Plus size={14} /></button>
              </div>
            ))}
          </div>
          <div className="panel">
            {sel ? <ItemDetail x={sel} /> : <div className="empty">Selecione um item.</div>}
            {sel && <button className="btn primary" style={{ marginTop: 12 }} onClick={() => onPick(toItem(sel))}><Plus size={14} /> Adicionar</button>}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function ItemDetail({ x }: { x: EquipmentDef | MagicItemDef }) {
  const e = x as EquipmentDef;
  const m = x as MagicItemDef;
  return (
    <div className="col">
      <h2>{x.name}</h2>
      <div className="row wrap">
        {e.category && <span className="tag">{e.category}</span>}
        {m.rarity && <span className="tag gold">{m.rarity}</span>}
        {m.attune && <span className="tag accent">Sintonização</span>}
        {e.cost && <span className="tag">{e.cost}</span>}
        {e.weight != null && <span className="tag" title={`${e.weight} lb`}>{lbToKg(e.weight)} kg</span>}
      </div>
      {e.weapon && <div className="small"><Sword size={12} className="ic-inline" /> <b>{e.weapon.dmg} {e.weapon.type}</b> · {e.weapon.cat} {e.weapon.range}{e.weapon.props?.length ? ' · ' + e.weapon.props.join(', ') : ''}{e.weapon.twoHanded ? ` · 2 mãos ${e.weapon.twoHanded}` : ''}{e.weapon.normal && e.weapon.range === 'Ranged' ? ` · ${e.weapon.normal}/${e.weapon.long} ft` : ''}{e.weapon.mastery ? ` · Maestria: ${e.weapon.mastery}` : ''}</div>}
      {e.armor && <div className="small"><Shield size={12} className="ic-inline" /> <b>CA {e.armor.cat === 'Shield' ? '+' : ''}{e.armor.base}{e.armor.dex ? (e.armor.max ? ` + DES (máx ${e.armor.max})` : ' + DES') : ''}</b> · {e.armor.cat}{e.armor.str ? ` · FOR ${e.armor.str}` : ''}{e.armor.stealth ? ' · desvantagem em Furtividade' : ''}</div>}
      <Markdown text={x.desc} />
    </div>
  );
}

/** Equipping a body armor (or shield) unequips the previous one of the same slot. */
function exclusiveArmor(inv: InventoryItem[], it: InventoryItem) {
  if (!it.armor || !it.equipped) return;
  const shield = it.armor.cat === 'Shield';
  inv.forEach((x) => { if (x !== it && x.armor && x.equipped && (x.armor.cat === 'Shield') === shield) x.equipped = false; });
}

export function InventoryTab({ c, srd, upd }: SheetProps) {
  const flash = useFlash((s) => s.show);
  const [picker, setPicker] = useState(false);
  const [open, setOpen] = useState<InventoryItem | null>(null);
  const w = carriedWeight(c);
  const cap = carryCapacity(c, srd);
  const attuned = c.inventory.filter((i) => i.attuned).length;
  const setItem = (id: string, fn: (i: InventoryItem) => void) => upd((d) => { const it = d.inventory.find((x) => x.uid === id); if (it) { fn(it); exclusiveArmor(d.inventory, it); } });

  return (
    <div className="sheet-grid" style={{ gridTemplateColumns: '1fr 300px' }}>
      <div className="panel">
        <div className="panel-title"><h3>Inventário</h3><span className="spacer" /><button className="btn sm primary" onClick={() => setPicker(true)}><Plus size={14} /> Item</button></div>
        {c.inventory.length === 0 && <div className="empty small">Mochila vazia.</div>}
        {c.inventory.map((it) => (
          <div key={it.uid} className="spell" style={{ gridTemplateColumns: 'auto 1fr auto auto' }} {...clickable(() => setOpen(it))}>
            {it.weapon || it.armor ? (
              <button className={'prep' + (it.equipped ? ' on' : '')} title="Equipado" onClick={(e) => { e.stopPropagation(); setItem(it.uid, (x) => (x.equipped = !x.equipped)); }} />
            ) : <span style={{ width: 18, display: 'grid', placeItems: 'center' }}>{it.magic ? <Gem size={14} color="var(--gold)" /> : <Package size={14} color="var(--faint)" />}</span>}
            <div className="min0">
              <div className="sn">{it.name}{it.magicBonus ? ` (+${it.magicBonus})` : ''} {it.attuned && <span className="tag gold" style={{ padding: '0 6px' }}>sintonizado</span>}</div>
              <div className="meta clamp2" title={it.notes && it.notes.length > 140 ? 'Clique para ver tudo' : undefined}>{[it.weapon && `${it.weapon.dmg} ${it.weapon.type ?? ''}`, it.armor && `CA ${it.armor.base}`, it.weight && `${lbToKg(it.weight)} kg`, it.notes].filter(Boolean).join(' · ')}</div>
            </div>
            <div className="row" style={{ gap: 3 }} onClick={(e) => e.stopPropagation()}>
              <button className="btn icon sm ghost" onClick={() => setItem(it.uid, (x) => (x.qty = Math.max(0, x.qty - 1)))}>−</button>
              <b className="mono" style={{ width: 26, textAlign: 'center' }}>{it.qty}</b>
              <button className="btn icon sm ghost" onClick={() => setItem(it.uid, (x) => (x.qty += 1))}>+</button>
            </div>
            <button className="btn icon sm ghost danger" onClick={(e) => { e.stopPropagation(); upd((d) => (d.inventory = d.inventory.filter((x) => x.uid !== it.uid))); }}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
      <div className="col g16">
        <div className="panel">
          <div className="panel-title"><h3>Moedas</h3></div>
          {COINS.map(([k, label, col]) => (
            <div key={k} className="row" style={{ marginBottom: 8 }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: `radial-gradient(circle at 35% 30%, #fff8, ${col})`, boxShadow: 'inset 0 -2px 3px #0005' }} />
              <span className="grow small">{label} <span className="faint">({k.toUpperCase()})</span></span>
              <NumInput value={c.currency[k]} min={0} onChange={(n) => upd((d) => (d.currency[k] = n))} style={{ width: 90 }} />
            </div>
          ))}
          <div className="small faint">Total ≈ {Math.round((c.currency.pp * 10 + c.currency.gp + c.currency.ep / 2 + c.currency.sp / 10 + c.currency.cp / 100) * 100) / 100} po</div>
        </div>
        <div className="panel">
          <div className="panel-title"><h3>Carga</h3></div>
          <div className="row small"><span className="grow">Peso carregado</span><b title={`${w} / ${cap} lb`}>{lbToKg(w)} / {lbToKg(cap)} kg</b></div>
          <div className={'hpbar' + (w > cap ? ' low' : w > cap * 0.66 ? ' mid' : '')} style={{ marginTop: 8 }}><span style={{ width: Math.min(100, (w / cap) * 100) + '%' }} /></div>
          <div className="row small" style={{ marginTop: 10 }}><span className="grow">Sintonização</span><b style={{ color: attuned > 3 ? 'var(--bad)' : undefined }}>{attuned}/3</b></div>
        </div>
      </div>

      {picker && <ItemPicker srd={srd} onClose={() => setPicker(false)} onPick={(it) => { upd((d) => { const same = d.inventory.find((x) => x.refId && x.refId === it.refId && !it.weapon && !it.armor); if (same) same.qty += it.qty; else { d.inventory.push(it); exclusiveArmor(d.inventory, it); } }); flash(`${it.name} adicionado`); }} />}
      {open && (() => {
        const it = c.inventory.find((x) => x.uid === open.uid) || open;
        const ref = srd.equipment.find((e) => e.id === it.refId) || srd.magicItems.find((e) => e.id === it.refId);
        const guess = guessItem(it, srd, c.resources.some((r) => fold(r.name) === fold(it.name)));
        return (
          <Detail title={it.name} onClose={() => setOpen(null)}>
            <div className="col">
              <label className="field">Nome<input className="input" value={it.name} onChange={(e) => setItem(it.uid, (x) => (x.name = e.target.value))} /></label>
              <div className="row wrap">
                <label className="field" style={{ width: 100 }}>Qtd.<NumInput value={it.qty} min={0} onChange={(n) => setItem(it.uid, (x) => (x.qty = n))} /></label>
                <label className="field" style={{ width: 100 }}>Peso (lb)<NumInput value={it.weight || 0} min={0} onChange={(n) => setItem(it.uid, (x) => (x.weight = n))} /></label>
                <label className="field" style={{ width: 120 }}>Bônus mágico<NumInput value={it.magicBonus || 0} min={0} max={5} onChange={(n) => setItem(it.uid, (x) => (x.magicBonus = n || undefined))} /></label>
              </div>
              <div className="row wrap">
                {(it.weapon || it.armor) && <label className="row small g6"><input type="checkbox" checked={!!it.equipped} onChange={(e) => setItem(it.uid, (x) => (x.equipped = e.target.checked))} /> Equipado</label>}
                <label className="row small g6"><input type="checkbox" checked={!!it.attuned} onChange={(e) => setItem(it.uid, (x) => (x.attuned = e.target.checked))} /> Sintonizado</label>
                {it.weapon && <label className="row small g6"><input type="checkbox" checked={!!it.proficient} onChange={(e) => setItem(it.uid, (x) => (x.proficient = e.target.checked))} /> Forçar proficiência</label>}
              </div>
              {it.weapon && (
                <div className="row wrap">
                  <label className="field">Dano<input className="input" value={it.weapon.dmg || ''} onChange={(e) => setItem(it.uid, (x) => (x.weapon!.dmg = e.target.value))} /></label>
                  <label className="field">Tipo<input className="input" value={it.weapon.type || ''} onChange={(e) => setItem(it.uid, (x) => (x.weapon!.type = e.target.value))} /></label>
                </div>
              )}
              <label className="field">Notas<textarea className="textarea" value={it.notes || ''} onChange={(e) => setItem(it.uid, (x) => (x.notes = e.target.value))} /></label>
              {guess && (
                <div className="panel col g6 item-guess">
                  <div className="small"><Wand2 size={13} className="ic-inline" /> O site entendeu: <b>{guess.label}</b></div>
                  <div className="tiny muted">Arma vira ataque (pergunta uma ou duas mãos quando versátil), armadura calcula a CA, usos viram um contador que volta no descanso.</div>
                  <button className="btn sm primary" style={{ alignSelf: 'flex-start' }} onClick={() => { upd((d) => applyGuess(d, it.uid, guess)); flash(`${it.name}: ${guess.label}`); }}>Aplicar</button>
                </div>
              )}
              {ref && <><div className="divider" /><ItemDetail x={ref} /></>}
            </div>
          </Detail>
        );
      })()}
    </div>
  );
}
