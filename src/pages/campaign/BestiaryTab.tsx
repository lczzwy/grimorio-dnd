import { useEffect, useMemo, useState } from 'react';
import { Copy, Dices, ImagePlus, Pencil, Plus, Search, Swords, Trash2, BookOpen, X } from 'lucide-react';
import type { Ability, Edition } from '../../data/types';
import { loadMonsters, type MonsterAction, type MonsterDef } from '../../data/monsters';
import { useBestiary, saveCreature, deleteCreature } from '../../cloud/bestiary';
import { averageHp, blankCreature, copyNames, creatureFromSrd, normalizeCreature, type Creature } from '../../cloud/bestiaryLogic';
import { addEnemy } from '../../cloud/combat';
import { abilityMod } from '../../engine/rules';
import { fmtMod, rollFormula } from '../../engine/dice';
import { useDice } from '../../store';
import { Modal, NumInput, useFlash, clickable } from '../../ui/ui';
import { fileToPortrait } from '../Creator';
import { MonsterBlock } from './CombatTab';
import type { CampaignProps } from '../Campaign';
import { confirmBox } from '../../ui/dialogs';

const ABILITIES: [Ability, string][] = [['str', 'FOR'], ['dex', 'DES'], ['con', 'CON'], ['int', 'INT'], ['wis', 'SAB'], ['cha', 'CAR']];
const SIZES = ['Miúdo', 'Pequeno', 'Médio', 'Grande', 'Enorme', 'Imenso'];

/** Rolls an attack the way the combat tracker does: to-hit, then damage (doubled dice on a 20). */
export async function rollCreatureAttack(roll: ReturnType<typeof useDice.getState>['roll'], who: string, a: MonsterAction) {
  if (a.toHit != null) {
    const r = await roll(`${who}: ${a.name} (ataque)`, `1d20${fmtMod(a.toHit)}`);
    if (r && a.damage && r.rolls[0] !== 1) setTimeout(() => roll(`${who}: ${a.name} (dano${r.rolls[0] === 20 ? ' CRÍTICO' : ''})`, a.damage!, { crit: r.rolls[0] === 20 }), 1300);
  } else if (a.damage) roll(`${who}: ${a.name}`, a.damage);
}

/** GM-only tab: the GM's own creatures, kept in their account and usable in every campaign. */
export function BestiaryTab({ campaign }: CampaignProps) {
  const { list, reload } = useBestiary(campaign.edition);
  const flash = useFlash((s) => s.show);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Creature | null>(null);
  const [placing, setPlacing] = useState<Creature | null>(null);
  const [fromSrd, setFromSrd] = useState(false);

  const shown = useMemo(() => (list || []).filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase())), [list, q]);

  const remove = async (c: Creature) => {
    if (!(await confirmBox(`Apagar "${c.name}" do seu bestiário? Isso não tira as cópias que já estão em combate.`, { danger: true, ok: 'Apagar' }))) return;
    try { await deleteCreature(c.id); await reload(); flash(`${c.name} apagada`); } catch (e) { flash((e as Error).message); }
  };
  const duplicate = (c: Creature) => setEditing({ ...c, id: '', name: `${c.name} (cópia)` });

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="panel row wrap g8">
        <div className="grow" style={{ minWidth: 200 }}>
          <div className="display" style={{ fontSize: 20 }}><BookOpen size={18} /> Meu bestiário</div>
          <div className="small muted">Suas criaturas ficam na sua conta e servem em todas as suas campanhas de D&amp;D {campaign.edition}. Só você vê.</div>
        </div>
        <div className="row" style={{ position: 'relative' }}>
          <Search size={15} className="search-ic" />
          <input className="input" style={{ paddingLeft: 32, width: 180 }} placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn sm" onClick={() => setFromSrd(true)}><Copy size={14} /> Copiar do SRD</button>
        <button className="btn sm primary" onClick={() => setEditing(blankCreature())}><Plus size={14} /> Nova criatura</button>
      </div>

      {list === null && <div className="empty">Abrindo o bestiário…</div>}
      {list && !list.length && (
        <div className="panel empty">
          Nenhuma criatura ainda. Crie do zero em <b>Nova criatura</b>, ou pegue um monstro do SRD em <b>Copiar do SRD</b> e ajuste do seu jeito.
        </div>
      )}

      <div className="bestiary-grid">
        {shown.map((c) => (
          <div key={c.id} className="beast-card">
            <div className="beast-top">
              <span className="beast-av" style={c.image ? { backgroundImage: `url(${c.image})` } : undefined}>{!c.image && c.name[0]}</span>
              <div className="grow min0">
                <div className="beast-name">{c.name}</div>
                <div className="small muted">{c.size} {c.type} · ND {c.cr}</div>
              </div>
            </div>
            <div className="row small" style={{ gap: 6, flexWrap: 'wrap' }}>
              <span className="tag">PV {c.hp}{c.hpDice ? ` (${c.hpDice})` : ''}</span>
              <span className="tag">CA {c.ac}</span>
              <span className="tag">{c.actions.length} ataque{c.actions.length === 1 ? '' : 's'}</span>
            </div>
            <div className="row g4">
              <button className="btn sm primary grow" onClick={() => setPlacing(c)}><Swords size={13} /> Na mesa</button>
              <button className="btn icon sm" title="Editar" onClick={() => setEditing(c)}><Pencil size={13} /></button>
              <button className="btn icon sm" title="Duplicar" onClick={() => duplicate(c)}><Copy size={13} /></button>
              <button className="btn icon sm danger" title="Apagar" onClick={() => remove(c)}><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </div>

      {fromSrd && <SrdPicker edition={campaign.edition} onClose={() => setFromSrd(false)} onPick={(m) => { setFromSrd(false); setEditing(creatureFromSrd(m)); }} />}
      {editing && (
        <CreatureEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (c) => {
            const saved = await saveCreature(c, campaign.edition);
            await reload();
            setEditing(null);
            flash(`${saved.name} salva no bestiário`);
          }}
        />
      )}
      {placing && <PlaceOnTable campaignId={campaign.id} creature={placing} onClose={() => setPlacing(null)} />}
    </div>
  );
}

/* ---------------- put copies of a creature in the fight ---------------- */

export function PlaceOnTable({ campaignId, creature, onClose, onPlaced }: { campaignId: string; creature: Creature; onClose: () => void; onPlaced?: () => void }) {
  const flash = useFlash((s) => s.show);
  const [count, setCount] = useState(1);
  const [hidden, setHidden] = useState(false);
  const [rollHp, setRollHp] = useState(false);
  const [busy, setBusy] = useState(false);
  const canRoll = !!creature.hpDice && averageHp(creature.hpDice) != null;
  const place = async () => {
    setBusy(true);
    try {
      const stat: Creature = { ...creature };
      delete stat.image;
      delete stat.notes;
      const image = creature.image;
      for (const name of copyNames(creature.name, count)) {
        const hp = rollHp && canRoll ? Math.max(1, rollFormula(creature.hpDice).total) : creature.hp;
        await addEnemy(campaignId, { name, hp, ac: creature.ac, image: image ?? null, stat: { ...stat, id: 'bestiary', name } as MonsterDef, visible: !hidden });
      }
      flash(`${count > 1 ? `${count}× ` : ''}${creature.name} na ordem de iniciativa`);
      onPlaced?.();
      onClose();
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`Colocar na mesa · ${creature.name}`} onClose={onClose} footer={<button className="btn primary" disabled={busy} onClick={place}><Swords size={14} /> Colocar {count > 1 ? `${count}×` : ''}</button>}>
      <div className="col">
        <label className="field" style={{ width: 120 }}>Quantas<NumInput value={count} min={1} max={20} onChange={setCount} /></label>
        <label className="row small g6"><input type="checkbox" checked={rollHp} disabled={!canRoll} onChange={(e) => setRollHp(e.target.checked)} /> Rolar os PV de cada uma ({creature.hpDice || 'sem dados de vida'}) em vez de usar {creature.hp}</label>
        <label className="row small g6"><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Começar oculta (os jogadores não veem até você mostrar)</label>
        <div className="tiny muted">Entra na ordem de iniciativa e na aba Combate, com os ataques prontos para rolar.</div>
      </div>
    </Modal>
  );
}

/* ---------------- pick an SRD monster as a base ---------------- */

function SrdPicker({ edition, onClose, onPick }: { edition: Edition; onClose: () => void; onPick: (m: MonsterDef) => void }) {
  const [all, setAll] = useState<MonsterDef[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => void loadMonsters(edition).then(setAll), [edition]);
  const list = useMemo(() => all.filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase())).slice(0, 100), [all, q]);
  return (
    <Modal title="Copiar um monstro do SRD" onClose={onClose}>
      <div className="col">
        <input className="input" autoFocus placeholder="Buscar monstro…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="pick-list" style={{ maxHeight: '55vh', overflow: 'auto' }}>
          {list.map((m) => (
            <div key={m.id} className="pick-item" {...clickable(() => onPick(m))}>
              <span className="grow">{m.name}</span><span className="small faint">ND {m.cr} · PV {m.hp} · CA {m.ac}</span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- the editor ---------------- */

function CreatureEditor({ initial, onClose, onSave }: { initial: Creature; onClose: () => void; onSave: (c: Creature) => Promise<void> }) {
  const [c, setC] = useState<Creature>(() => normalizeCreature(initial));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const roll = useDice((s) => s.roll);
  const set = <K extends keyof Creature>(k: K, v: Creature[K]) => setC((x) => ({ ...x, [k]: v }));
  const avg = averageHp(c.hpDice);

  const save = async () => {
    setBusy(true);
    setErr('');
    try { await onSave(c); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Modal
      wide
      title={initial.id ? `Editar · ${initial.name}` : 'Nova criatura'}
      onClose={onClose}
      footer={<>{err && <span className="small" style={{ color: 'var(--bad)', marginRight: 'auto' }}>{err}</span>}<button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy || !c.name.trim()} onClick={save}>Salvar no bestiário</button></>}
    >
      <div className="beast-editor">
        <div className="col" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
            <label style={{ cursor: 'pointer' }} title="Foto da criatura">
              <div className="avatar lg" style={c.image ? { backgroundImage: `url(${c.image})` } : undefined}>{!c.image && <ImagePlus size={26} />}</div>
              <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) set('image', await fileToPortrait(f)); }} />
            </label>
            <div className="col grow g8">
              <label className="field">Nome<input className="input" value={c.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Lobo Sombrio" /></label>
              <div className="row wrap g8">
                <label className="field" style={{ width: 120 }}>Tamanho<select className="select" value={c.size} onChange={(e) => set('size', e.target.value)}>{[...new Set([...SIZES, c.size])].map((s) => <option key={s}>{s}</option>)}</select></label>
                <label className="field grow">Tipo<input className="input" value={c.type} onChange={(e) => set('type', e.target.value)} placeholder="fera, morto-vivo…" /></label>
                <label className="field" style={{ width: 70 }}>ND<input className="input" value={c.cr} onChange={(e) => set('cr', e.target.value)} /></label>
              </div>
            </div>
          </div>
          {c.image && <button className="btn sm ghost self-start" onClick={() => set('image', null)}><X size={12} /> Tirar a foto</button>}

          <div className="row wrap g8">
            <label className="field" style={{ width: 70 }}>CA<NumInput value={c.ac} min={0} max={40} onChange={(n) => set('ac', n)} /></label>
            <label className="field" style={{ width: 80 }}>PV<NumInput value={c.hp} min={1} onChange={(n) => set('hp', n)} /></label>
            <label className="field" style={{ width: 130 }}>Dados de vida<input className="input" value={c.hpDice} onChange={(e) => set('hpDice', e.target.value)} placeholder="7d8+14" /></label>
            {avg != null && avg !== c.hp && <button className="btn sm ghost" style={{ marginTop: 18 }} onClick={() => set('hp', avg)}>usar média ({avg})</button>}
            <label className="field grow">Deslocamento<input className="input" value={c.speed} onChange={(e) => set('speed', e.target.value)} placeholder="9 m, voo 18 m" /></label>
          </div>

          <div className="beast-scores">
            {ABILITIES.map(([a, label]) => (
              <label key={a} className="field center">{label}
                <NumInput value={c.scores[a]} min={1} max={30} onChange={(n) => set('scores', { ...c.scores, [a]: n })} />
                <span className="tiny muted">{fmtMod(abilityMod(c.scores[a]))}</span>
              </label>
            ))}
          </div>

          <div className="row wrap g8">
            <label className="field grow">Sentidos<input className="input" value={c.senses || ''} onChange={(e) => set('senses', e.target.value)} placeholder="visão no escuro 18 m" /></label>
            <label className="field grow">Idiomas<input className="input" value={c.languages || ''} onChange={(e) => set('languages', e.target.value)} /></label>
          </div>
          <div className="row wrap g8">
            <label className="field grow">Resistências<input className="input" value={c.resist || ''} onChange={(e) => set('resist', e.target.value)} /></label>
            <label className="field grow">Imunidades<input className="input" value={c.immune || ''} onChange={(e) => set('immune', e.target.value)} /></label>
          </div>

          <TraitsEditor traits={c.traits} onChange={(t) => set('traits', t)} />
          <ActionsEditor title="Ações e ataques" list={c.actions} onChange={(l) => set('actions', l)} />
          <ActionsEditor title="Reações" list={c.reactions || []} onChange={(l) => set('reactions', l)} compact />
          <ActionsEditor title="Ações lendárias" list={c.legendary || []} onChange={(l) => set('legendary', l)} compact />
          <label className="field">Notas do mestre<textarea className="textarea" value={c.notes || ''} onChange={(e) => set('notes', e.target.value)} placeholder="Táticas, segredos, onde aparece…" /></label>
        </div>

        <div className="beast-preview">
          <div className="tiny muted mb6">Prévia · clique em Rolar para testar um ataque</div>
          <div className="row" style={{ gap: 10, marginBottom: 8 }}>
            <span className="beast-av" style={c.image ? { backgroundImage: `url(${c.image})` } : undefined}>{!c.image && (c.name[0] || '?')}</span>
            <div>
              <div className="beast-name">{c.name || 'Sem nome'}</div>
              <div className="small muted">CA {c.ac} · PV {c.hp}{c.hpDice ? ` (${c.hpDice})` : ''}</div>
            </div>
          </div>
          <MonsterBlock m={normalizeCreature(c)} onAttack={(a) => rollCreatureAttack(roll, c.name || 'Criatura', a)} />
        </div>
      </div>
    </Modal>
  );
}

function TraitsEditor({ traits, onChange }: { traits: Creature['traits']; onChange: (t: Creature['traits']) => void }) {
  const upd = (i: number, k: 'name' | 'desc', v: string) => onChange(traits.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
  return (
    <div className="beast-section">
      <div className="row"><b className="small grow">Habilidades e características</b><button className="btn sm ghost" onClick={() => onChange([...traits, { name: '', desc: '' }])}><Plus size={13} /> Habilidade</button></div>
      {traits.map((t, i) => (
        <div key={i} className="beast-row">
          <input className="input" style={{ width: 180 }} value={t.name} placeholder="Nome (ex.: Faro Aguçado)" onChange={(e) => upd(i, 'name', e.target.value)} />
          <textarea className="textarea grow" rows={2} value={t.desc} placeholder="O que faz" onChange={(e) => upd(i, 'desc', e.target.value)} />
          <button className="btn icon sm ghost danger" onClick={() => onChange(traits.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
        </div>
      ))}
    </div>
  );
}

function ActionsEditor({ title, list, onChange, compact }: { title: string; list: MonsterAction[]; onChange: (l: MonsterAction[]) => void; compact?: boolean }) {
  const upd = (i: number, patch: Partial<MonsterAction>) => onChange(list.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  return (
    <div className="beast-section">
      <div className="row"><b className="small grow">{title}</b><button className="btn sm ghost" onClick={() => onChange([...list, { name: '', desc: '', toHit: compact ? undefined : 4, damage: compact ? undefined : '1d6+2' }])}><Plus size={13} /> Adicionar</button></div>
      {!list.length && !compact && <div className="tiny muted">Sem ataques: use a bandeja de dados durante o combate.</div>}
      {list.map((a, i) => (
        <div key={i} className="beast-action">
          <div className="row wrap g6">
            <input className="input grow" style={{ minWidth: 140 }} value={a.name} placeholder="Nome (ex.: Mordida)" onChange={(e) => upd(i, { name: e.target.value })} />
            <label className="row small g4">Acerto
              <input className="input num" style={{ width: 56 }} value={a.toHit ?? ''} placeholder="—" onChange={(e) => upd(i, { toHit: e.target.value === '' || e.target.value === '-' ? undefined : parseInt(e.target.value, 10) || 0 })} />
            </label>
            <label className="row small g4"><Dices size={13} />
              <input className="input" style={{ width: 96 }} value={a.damage ?? ''} placeholder="2d6+3" onChange={(e) => upd(i, { damage: e.target.value || undefined })} />
            </label>
            <button className="btn icon sm ghost danger" onClick={() => onChange(list.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
          </div>
          <textarea className="textarea" rows={2} value={a.desc} placeholder="Descrição (alcance, tipo de dano, efeitos, CD…)" onChange={(e) => upd(i, { desc: e.target.value })} />
        </div>
      ))}
    </div>
  );
}
