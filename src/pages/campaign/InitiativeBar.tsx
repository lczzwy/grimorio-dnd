import { useEffect, useRef, useState } from 'react';
import { Dices, Play, Plus, SkipForward, Square, Trash2, EyeOff, Megaphone, ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { callInitiative, nextTurn, removeCombatant, reorderCombatants, rollMyInitiative, setEncounter, updateCombatant, useEncounter, type Combatant } from '../../cloud/combat';
import { useCampaignSrd } from '../../cloud/campaignHomebrew';
import { initiative } from '../../engine/rules';
import { fmtMod } from '../../engine/dice';
import { useDice } from '../../store';
import { NumInput, useFlash } from '../../ui/ui';
import { useParty } from './TableTab';
import { AddEnemy } from './CombatTab';
import type { CampaignProps } from '../Campaign';
import { confirmBox } from '../../ui/dialogs';

/**
 * Turn order under the dice table, on every campaign tab.
 * The GM calls for initiative, edits numbers, adds creatures and runs the turns; each player gets
 * a button to roll their own initiative, which joins the order by itself.
 */
export function InitiativeBar({ campaign, members, isGm, uid }: CampaignProps) {
  const { encounter, list, reloadSecrets } = useEncounter(campaign.id, isGm);
  const srd = useCampaignSrd(campaign.id, campaign.edition);
  const party = useParty(members.map((m) => m.character_id).filter((x): x is string => !!x));
  const roll = useDice((s) => s.roll);
  const flash = useFlash((s) => s.show);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  // folded: only the title line (the "roll initiative" call still shows when it's your turn to roll)
  const [folded, setFolded] = useState(() => { try { return localStorage.getItem('init-folded') !== '0'; } catch { return true; } });
  const toggleFold = () => setFolded((v) => { try { localStorage.setItem('init-folded', v ? '0' : '1'); } catch { /* private mode */ } return !v; });

  if (!encounter) return null;
  const me = members.find((m) => m.user_id === uid);
  const myChar = me?.character_id ? party[me.character_id] : undefined;
  const mine = me?.character_id ? list.find((c) => c.character_id === me.character_id) : undefined;
  const calling = !!encounter.init_call;
  const needsRoll = !isGm && calling && !!myChar && (mine?.initiative == null);
  const active = encounter.active;
  const current = active ? list[encounter.turn]?.id : undefined;
  const players = members.filter((m) => m.role === 'player' && m.character_id);
  const waiting = calling ? players.filter((m) => list.find((c) => c.character_id === m.character_id)?.initiative == null) : [];

  // players see nothing when there is no fight going on
  if (!isGm && !list.length && !calling) return null;

  const safe = async (p: Promise<unknown>) => {
    setBusy(true);
    try { await p; } catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  };

  const rollMine = async () => {
    if (!myChar || !srd) return;
    const mod = initiative(myChar, srd);
    const r = await roll('Iniciativa', `1d20${fmtMod(mod)}`, { charName: myChar.name });
    if (r) void safe(rollMyInitiative(campaign.id, r.id));
  };

  const ask = () => safe(callInitiative(campaign.id, list, players.map((m) => ({ character_id: m.character_id!, name: party[m.character_id!]?.name || m.display_name, image: party[m.character_id!]?.portrait }))));
  const start = () => safe(setEncounter(campaign.id, { active: true, round: 1, turn: 0, init_call: false }));
  const stop = () => safe(setEncounter(campaign.id, { active: false, init_call: false }));

  return (
    <section className={'init-bar' + (folded ? ' folded' : '')}>
      <header className="init-head">
        <span className="init-title">{active ? `Rodada ${encounter.round}` : 'Ordem de iniciativa'}</span>
        <button className="btn ghost sm icon" onClick={toggleFold} aria-expanded={!folded} title={folded ? 'Abrir a ordem de iniciativa' : 'Recolher'} aria-label={folded ? 'Abrir a ordem de iniciativa' : 'Recolher a ordem de iniciativa'}>
          {folded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        {active && list[encounter.turn] && <span className="init-now">vez de <b>{list[encounter.turn].name}</b></span>}
        {calling && !active && <span className="init-now">{waiting.length ? `aguardando ${waiting.length} jogador${waiting.length > 1 ? 'es' : ''}…` : 'todos rolaram'}</span>}
        <span className="spacer" />
        {isGm && !folded && (
          <span className="row g4">
            <button className="btn sm" disabled={busy || !players.length} onClick={ask} title="Coloca todos os jogadores na ordem e pede que rolem"><Megaphone size={14} /> Pedir iniciativa</button>
            <button className="btn sm" disabled={busy} onClick={() => setAdding(true)}><Plus size={14} /> Criatura</button>
            {active ? (
              <>
                <button className="btn sm primary" disabled={busy || !list.length} onClick={() => safe(nextTurn(encounter, list))}><SkipForward size={14} /> Próximo</button>
                <button className="btn sm icon" disabled={busy} title="Encerrar combate" onClick={stop}><Square size={14} /></button>
              </>
            ) : (
              <button className="btn sm primary" disabled={busy || !list.length} onClick={start}><Play size={14} /> Começar</button>
            )}
          </span>
        )}
      </header>

      {needsRoll && (
        <button className="init-call" onClick={rollMine} disabled={busy}>
          <Dices size={18} /> Rolar iniciativa <b>1d20{fmtMod(srd ? initiative(myChar!, srd) : 0)}</b>
        </button>
      )}

      {folded ? null : list.length > 0 ? (
        <ol className="init-list">
          {list.map((c, i) => (
            <Entry
              key={c.id}
              drag={isGm ? {
                over: dragOver === i && dragFrom !== null && dragFrom !== i,
                onStart: () => setDragFrom(i),
                onOver: () => setDragOver(i),
                onEnd: () => { setDragFrom(null); setDragOver(null); },
                onDrop: () => { if (dragFrom !== null && encounter) void safe(reorderCombatants(encounter, list, dragFrom, i)); setDragFrom(null); setDragOver(null); },
                onKey: (dir: -1 | 1) => { if (encounter && i + dir >= 0 && i + dir < list.length) void safe(reorderCombatants(encounter, list, i, i + dir)); },
              } : undefined}
              c={c}
              pos={i + 1}
              now={c.id === current}
              mine={!!mine && c.id === mine.id}
              isGm={isGm}
              editing={editing === c.id}
              onEdit={() => setEditing(c.id)}
              onSet={(n) => { setEditing(null); void safe(updateCombatant(c.id, { initiative: n ?? null })); }}
              onRemove={async () => (await confirmBox(`Tirar ${c.name} da ordem?`, { danger: true, ok: 'Tirar' })) && void safe(removeCombatant(c.id))}
            />
          ))}
        </ol>
      ) : (
        isGm && <div className="tiny muted" style={{ padding: '2px 2px 4px' }}><b>Pedir iniciativa</b> chama os jogadores para rolar; <b>Criatura</b> coloca inimigos na ordem.</div>
      )}

      {adding && <AddEnemy campaignId={campaign.id} edition={campaign.edition} onClose={() => setAdding(false)} onAdded={() => void reloadSecrets()} />}
    </section>
  );
}

interface DragProps { over: boolean; onStart: () => void; onOver: () => void; onEnd: () => void; onDrop: () => void; onKey: (dir: -1 | 1) => void }

function Entry({ c, pos, now, mine, isGm, editing, onEdit, onSet, onRemove, drag }: { c: Combatant; pos: number; now: boolean; mine: boolean; isGm: boolean; editing: boolean; onEdit: () => void; onSet: (n: number | undefined) => void; onRemove: () => void; drag?: DragProps }) {
  const [val, setVal] = useState<number | undefined>(c.initiative ?? undefined);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!editing) return;
    setVal(c.initiative ?? undefined);
    const input = box.current?.querySelector('input');
    input?.focus();
    input?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  return (
    <li
      className={'init-item' + (now ? ' now' : '') + (mine ? ' mine' : '') + (c.kind === 'player' ? ' player' : ' enemy') + (c.visible ? '' : ' hidden') + (drag ? ' draggable' : '') + (drag?.over ? ' drop-here' : '')}
      draggable={!!drag && !editing}
      onDragStart={drag && ((e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id); drag.onStart(); })}
      onDragOver={drag && ((e) => { e.preventDefault(); drag.onOver(); })}
      onDragEnd={drag?.onEnd}
      onDrop={drag && ((e) => { e.preventDefault(); drag.onDrop(); })}
    >
      {drag
        ? <button className="init-grip" title="Arraste para mudar a ordem (ou use as setas ↑ ↓)" aria-label={`Mudar a posição de ${c.name}`} onKeyDown={(e) => { if (e.key === 'ArrowUp') { e.preventDefault(); drag.onKey(-1); } if (e.key === 'ArrowDown') { e.preventDefault(); drag.onKey(1); } }}><GripVertical size={12} /></button>
        : null}
      <span className="init-pos">{pos}</span>
      <span className="init-av" style={c.image ? { backgroundImage: `url(${c.image})` } : undefined}>{!c.image && (c.name[0] || '?')}</span>
      <span className="init-name">{c.name}{!c.visible && <EyeOff size={11} className="faint" style={{ marginLeft: 4 }} />}</span>
      {isGm && editing ? (
        <span ref={box} onKeyDown={(e) => { if (e.key === 'Enter') onSet(val); if (e.key === 'Escape') onSet(c.initiative ?? undefined); }} onBlur={() => onSet(val)}>
          <NumInput value={val} min={-10} max={60} onChange={setVal} style={{ width: 52 }} />
        </span>
      ) : (
        <button className="init-val" disabled={!isGm} title={isGm ? 'Editar iniciativa' : undefined} onClick={onEdit}>{c.initiative ?? '…'}</button>
      )}
      {isGm && <button className="init-x" title="Tirar da ordem" onClick={onRemove}><Trash2 size={12} /></button>}
    </li>
  );
}
