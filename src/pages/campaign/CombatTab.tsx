import { useEffect, useMemo, useState } from 'react';
import { Play, Square, SkipForward, Plus, Trash2, Eye, EyeOff, Dices, Sparkles, HeartCrack, Heart, Swords, Search, ImagePlus } from 'lucide-react';
import type { MonsterDef } from '../../data/monsters';
import { loadMonsters } from '../../data/monsters';
import { useCampaignSrd } from '../../cloud/campaignHomebrew';
import { addEnemy, addPlayerCombatant, nextTurn, removeCombatant, setEncounter, updateCombatant, updateSecrets, useEncounter, type Combatant, type Secrets } from '../../cloud/combat';
import type { Effect } from '../../cloud/combatLogic';
import { gmApply } from '../../cloud/campaigns';
import { partySummary } from '../../cloud/party';
import { abilityMod, CONDITION_PT } from '../../engine/rules';
import { BAND_COLOR, BAND_LABEL, hpBand, type HpBand } from '../../engine/hpBand';
import { fmtMod } from '../../engine/dice';
import { uid } from '../../engine/character';
import { useDice } from '../../store';
import { Markdown, Modal, NumInput, useFlash } from '../../ui/ui';
import { fileToPortrait } from '../Creator';
import { useParty } from './TableTab';
import type { CampaignProps } from '../Campaign';

export function CombatTab({ campaign, members, isGm }: CampaignProps) {
  const { encounter, list, secrets, reloadSecrets } = useEncounter(campaign.id, isGm);
  const srd = useCampaignSrd(campaign.id, campaign.edition);
  const party = useParty(members.map((m) => m.character_id).filter((x): x is string => !!x));
  const roll = useDice((s) => s.roll);
  const flash = useFlash((s) => s.show);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [amt, setAmt] = useState<Record<string, number | undefined>>({});

  if (!encounter || !srd) return <div className="empty">Carregando combate…</div>;
  const active = encounter.active;
  const current = list[encounter.turn]?.id;
  const safe = (p: Promise<unknown>) => p.catch((e) => alert((e as Error).message));

  const rollMonsterInit = async () => {
    for (const c of list.filter((x) => x.kind !== 'player')) {
      const dex = secrets[c.id]?.stat?.scores.dex ?? 10;
      const r = roll(`${c.name}: iniciativa`, `1d20${fmtMod(abilityMod(dex))}`);
      await updateCombatant(c.id, { initiative: r.total });
    }
    flash('Iniciativa dos inimigos rolada');
  };
  const addAllPlayers = async () => {
    for (const m of members.filter((x) => x.role === 'player' && x.character_id)) {
      if (list.some((c) => c.character_id === m.character_id)) continue;
      const ch = party[m.character_id!];
      await addPlayerCombatant(campaign.id, m.character_id!, ch?.name || m.display_name, ch?.portrait);
    }
  };

  const hpOf = (c: Combatant): { band: HpBand; text?: string } => {
    if (c.kind === 'player' && c.character_id && party[c.character_id]) {
      const s = partySummary(party[c.character_id], srd);
      return { band: s.band, text: `${s.hp}/${s.maxHp}${s.temp ? ` +${s.temp}` : ''}` };
    }
    const s = secrets[c.id];
    if (isGm && s) return { band: hpBand(s.hp_current, s.hp_max), text: `${s.hp_current}/${s.hp_max}${s.hp_temp ? ` +${s.hp_temp}` : ''}` };
    return { band: c.hp_band as HpBand };
  };

  const hurt = async (c: Combatant, delta: number) => {
    if (c.kind === 'player' && c.character_id && party[c.character_id]) {
      await safe(gmApply(c.character_id, campaign.id, { deltaHp: delta, maxHp: partySummary(party[c.character_id], srd).maxHp }));
    } else {
      const s = secrets[c.id];
      if (!s) return;
      let cur = s.hp_current, tmp = s.hp_temp;
      if (delta < 0) { const t = Math.min(tmp, -delta); tmp -= t; cur = Math.max(0, cur - (-delta - t)); } else cur = Math.min(s.hp_max, cur + delta);
      await safe(updateSecrets(c.id, { hp_current: cur, hp_temp: tmp }));
      await reloadSecrets();
    }
    setAmt((a) => ({ ...a, [c.id]: undefined }));
  };

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="panel row wrap">
        <div className="grow">
          <div className="display" style={{ fontSize: 22, fontWeight: 900 }}>{active ? `Rodada ${encounter.round}` : 'Fora de combate'}</div>
          {active && list[encounter.turn] && <div className="small muted">Vez de <b>{list[encounter.turn].name}</b></div>}
        </div>
        {isGm && (
          <>
            <button className="btn sm" onClick={() => setAdding(true)}><Plus size={14} /> Inimigo</button>
            <button className="btn sm" onClick={() => safe(addAllPlayers())}><Plus size={14} /> Jogadores</button>
            <button className="btn sm" disabled={!list.some((c) => c.kind !== 'player')} onClick={() => safe(rollMonsterInit())}><Dices size={14} /> Iniciativa dos inimigos</button>
            {active ? (
              <>
                <button className="btn sm primary" disabled={!list.length} onClick={() => safe(nextTurn(encounter, list))}><SkipForward size={14} /> Próximo turno</button>
                <button className="btn sm" onClick={() => safe(setEncounter(campaign.id, { active: false }))}><Square size={14} /> Encerrar</button>
              </>
            ) : (
              <button className="btn sm primary" disabled={!list.length} onClick={() => safe(setEncounter(campaign.id, { active: true, round: 1, turn: 0 }))}><Play size={14} /> Começar combate</button>
            )}
          </>
        )}
      </div>

      {list.length === 0 && <div className="panel empty">{isGm ? 'Adicione jogadores e inimigos para montar o combate.' : 'Nenhum combate em andamento.'}</div>}

      <div className="col" style={{ gap: 8 }}>
        {list.map((c) => {
          const hp = hpOf(c);
          const turn = active && c.id === current;
          const shownEffects = c.effects.filter((e) => isGm || e.visible);
          return (
            <div key={c.id} className="panel" style={{ padding: 12, borderColor: turn ? 'var(--accent)' : undefined, boxShadow: turn ? '0 0 24px var(--glow)' : undefined, opacity: c.visible ? 1 : 0.6 }}>
              <div className="row wrap" style={{ gap: 12 }}>
                <div className="avatar" style={{ width: 46, height: 46, fontSize: 20, ...(c.image ? { backgroundImage: `url(${c.image})` } : {}) }}>{!c.image && c.name[0]}</div>
                <div className="grow" style={{ minWidth: 140 }}>
                  <div style={{ fontWeight: 700 }}>{c.name} {c.kind === 'player' ? <span className="tag accent">jogador</span> : <span className="tag">inimigo</span>} {!c.visible && <span className="tag"><EyeOff size={11} /> oculto</span>}</div>
                  <div className="row small" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <span className="tag" style={{ color: BAND_COLOR[hp.band] }}>{BAND_LABEL[hp.band]}{hp.text ? ` · ${hp.text}` : ''}</span>
                    {isGm && secrets[c.id]?.ac != null && <span className="tag">CA {secrets[c.id].ac}</span>}
                    {c.conditions.map((x) => <span key={x} className="cond on" style={{ padding: '2px 8px' }}>{CONDITION_PT[x] || x}</span>)}
                    {shownEffects.map((e) => <span key={e.id} className={'tag ' + (e.kind === 'buff' ? 'good' : 'bad')}>{e.name}{e.rounds != null ? ` (${e.rounds})` : ''}{!e.visible ? ' 👁‍🗨' : ''}</span>)}
                  </div>
                </div>
                <div className="center" style={{ minWidth: 56 }}>
                  {isGm ? <NumInput value={c.initiative ?? undefined} placeholder="Init" onChange={(n) => safe(updateCombatant(c.id, { initiative: n }))} style={{ width: 56 }} /> : <b className="display" style={{ fontSize: 22 }}>{c.initiative ?? '–'}</b>}
                  <div className="tiny faint">init</div>
                </div>
                {isGm && (
                  <div className="row" style={{ gap: 4 }}>
                    <NumInput value={amt[c.id]} min={0} placeholder="PV" onChange={(n) => setAmt((a) => ({ ...a, [c.id]: n }))} style={{ width: 56 }} />
                    <button className="btn icon sm hurt" disabled={!amt[c.id]} onClick={() => hurt(c, -amt[c.id]!)} title="Dano"><HeartCrack size={13} /></button>
                    <button className="btn icon sm heal" disabled={!amt[c.id]} onClick={() => hurt(c, amt[c.id]!)} title="Cura"><Heart size={13} /></button>
                    <button className="btn icon sm ghost" title={c.visible ? 'Esconder dos jogadores' : 'Mostrar aos jogadores'} onClick={() => safe(updateCombatant(c.id, { visible: !c.visible }))}>{c.visible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                    <button className="btn icon sm ghost" title="Detalhes, ataques e efeitos" onClick={() => setOpen(c.id)}><Swords size={14} /></button>
                    <button className="btn icon sm ghost danger" title="Remover" onClick={() => confirm(`Remover ${c.name} do combate?`) && safe(removeCombatant(c.id))}><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {adding && <AddEnemy campaignId={campaign.id} edition={campaign.edition} onClose={() => setAdding(false)} onAdded={() => void reloadSecrets()} />}
      {open && list.find((c) => c.id === open) && (
        <EnemyDetail c={list.find((c) => c.id === open)!} s={secrets[open]} conditionIds={srd.conditions.filter((x) => x.id !== 'exhaustion').map((x) => x.id)} onClose={() => setOpen(null)} onSaved={() => void reloadSecrets()} />
      )}
    </div>
  );
}

export function AddEnemy({ campaignId, edition, onClose, onAdded }: { campaignId: string; edition: CampaignProps['campaign']['edition']; onClose: () => void; onAdded: () => void }) {
  const [monsters, setMonsters] = useState<MonsterDef[]>([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<MonsterDef | null>(null);
  const [name, setName] = useState('');
  const [hp, setHp] = useState(10);
  const [ac, setAc] = useState(12);
  const [count, setCount] = useState(1);
  const [visible, setVisible] = useState(true);
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => void loadMonsters(edition).then(setMonsters), [edition]);
  const list = useMemo(() => monsters.filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase())).slice(0, 80), [monsters, q]);

  const pick = (m: MonsterDef) => { setSel(m); setName(m.name); setHp(m.hp); setAc(m.ac); };
  const add = async () => {
    setBusy(true);
    try {
      for (let i = 1; i <= count; i++) await addEnemy(campaignId, { name: count > 1 ? `${name} ${i}` : name, hp, ac, image, stat: sel, visible });
      onAdded();
      onClose();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal wide title="Adicionar inimigo" onClose={onClose} footer={<button className="btn primary" disabled={!name.trim() || busy} onClick={add}><Plus size={14} /> Adicionar {count > 1 ? `${count}×` : ''}</button>}>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(220px, 1fr) 1.2fr', alignItems: 'start' }}>
        <div className="col">
          <div className="row" style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, color: 'var(--faint)' }} />
            <input className="input" style={{ paddingLeft: 32 }} placeholder="Buscar monstro do SRD…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="pick-list" style={{ maxHeight: '45vh', overflow: 'auto' }}>
            {list.map((m) => (
              <div key={m.id} className={'pick-item' + (sel?.id === m.id ? ' sel' : '')} onClick={() => pick(m)}>
                <span className="grow">{m.name}</span><span className="small faint">ND {m.cr} · PV {m.hp}</span>
              </div>
            ))}
          </div>
          <button className="btn sm ghost" onClick={() => { setSel(null); setName(''); }}>Criar do zero (sem ficha do SRD)</button>
        </div>
        <div className="col">
          <div className="row">
            <label style={{ cursor: 'pointer' }} title="Foto">
              <div className="avatar lg" style={image ? { backgroundImage: `url(${image})` } : undefined}>{!image && <ImagePlus size={26} />}</div>
              <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImage(await fileToPortrait(f)); }} />
            </label>
            <label className="field grow">Nome<input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Lorde Vampiro" /></label>
          </div>
          <div className="row wrap">
            <label className="field" style={{ width: 90 }}>PV<NumInput value={hp} min={1} onChange={setHp} /></label>
            <label className="field" style={{ width: 90 }}>CA<NumInput value={ac} min={0} onChange={setAc} /></label>
            <label className="field" style={{ width: 90 }}>Quantos<NumInput value={count} min={1} max={20} onChange={setCount} /></label>
            <label className="row small" style={{ gap: 6, marginTop: 18 }}><input type="checkbox" checked={!visible} onChange={(e) => setVisible(!e.target.checked)} /> Começar oculto</label>
          </div>
          {sel && <MonsterBlock m={sel} />}
        </div>
      </div>
    </Modal>
  );
}

function MonsterBlock({ m, onAttack }: { m: MonsterDef; onAttack?: (a: MonsterDef['actions'][number]) => void }) {
  const line = (k: string, v?: string) => v ? <div className="small"><b>{k}</b> <span className="muted">{v}</span></div> : null;
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="small muted">{m.size} {m.type} · ND {m.cr}{m.xp ? ` (${m.xp} XP)` : ''} · {m.speed}</div>
      <div className="row wrap small">{(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((a) => <span key={a} className="tag">{a.toUpperCase()} {m.scores[a]} ({fmtMod(abilityMod(m.scores[a]))})</span>)}</div>
      {line('Sentidos', m.senses)}{line('Resistências', m.resist)}{line('Imunidades', m.immune)}{line('Imune a condições', m.condImmune)}
      {m.traits.map((t) => <Markdown key={t.name} text={`**${t.name}.** ${t.desc}`} />)}
      {([['Ações', m.actions], ['Ações bônus', m.bonus], ['Reações', m.reactions], ['Lendárias', m.legendary]] as const).map(([title, arr]) => arr?.length ? (
        <div key={title}>
          <div className="tiny muted" style={{ margin: '6px 0' }}>{title}</div>
          {arr.map((a) => (
            <div key={a.name} className="row" style={{ alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
              <div className="grow"><Markdown text={`**${a.name}.** ${a.desc}`} /></div>
              {onAttack && (a.toHit != null || a.damage) && <button className="btn sm" onClick={() => onAttack(a)}><Dices size={13} /> Rolar</button>}
            </div>
          ))}
        </div>
      ) : null)}
    </div>
  );
}

function EnemyDetail({ c, s, conditionIds, onClose, onSaved }: { c: Combatant; s?: Secrets; conditionIds: string[]; onClose: () => void; onSaved: () => void }) {
  const roll = useDice((st) => st.roll);
  const [fx, setFx] = useState<Effect>({ id: '', name: '', kind: 'debuff', rounds: undefined, visible: true });
  const [notes, setNotes] = useState(s?.notes ?? '');
  const safe = (p: Promise<unknown>) => p.then(onSaved).catch((e) => alert((e as Error).message));
  const attack = (a: MonsterDef['actions'][number]) => {
    // monster rolls go to the feed hidden (the GM's table default), revealable later
    if (a.toHit != null) {
      const r = roll(`${c.name}: ${a.name} (ataque)`, `1d20${fmtMod(a.toHit)}`);
      if (a.damage && r.rolls[0] !== 1) setTimeout(() => roll(`${c.name}: ${a.name} (dano${r.rolls[0] === 20 ? ' CRÍTICO' : ''})`, a.damage!, { crit: r.rolls[0] === 20 }), 1300);
    } else if (a.damage) roll(`${c.name}: ${a.name}`, a.damage);
  };
  return (
    <Modal wide title={c.name} onClose={onClose}>
      <div className="col">
        <div className="panel col" style={{ padding: 12 }}>
          <b className="small">Condições</b>
          <div className="cond-grid">
            {conditionIds.map((id) => {
              const on = c.conditions.includes(id);
              return <button key={id} className={'cond' + (on ? ' on' : '')} onClick={() => safe(updateCombatant(c.id, { conditions: on ? c.conditions.filter((x) => x !== id) : [...c.conditions, id] }))}>{CONDITION_PT[id] || id}</button>;
            })}
          </div>
        </div>
        <div className="panel col" style={{ padding: 12 }}>
          <b className="small"><Sparkles size={13} /> Efeitos (buffs e debuffs)</b>
          {c.effects.map((e) => (
            <div key={e.id} className="row small">
              <span className={'tag ' + (e.kind === 'buff' ? 'good' : 'bad')}>{e.name}</span>
              <span className="grow muted">{e.rounds != null ? `${e.rounds} rodada(s)` : 'até remover'} · {e.visible ? 'jogadores veem' : 'só o mestre'}</span>
              <button className="btn icon sm ghost danger" onClick={() => safe(updateCombatant(c.id, { effects: c.effects.filter((x) => x.id !== e.id) }))}><Trash2 size={12} /></button>
            </div>
          ))}
          <div className="row wrap">
            <input className="input" style={{ width: 180 }} placeholder="Ex.: Abençoado, Envenenado…" value={fx.name} onChange={(e) => setFx({ ...fx, name: e.target.value })} />
            <div className="seg"><button className={fx.kind === 'buff' ? 'on' : ''} onClick={() => setFx({ ...fx, kind: 'buff' })}>Buff</button><button className={fx.kind === 'debuff' ? 'on' : ''} onClick={() => setFx({ ...fx, kind: 'debuff' })}>Debuff</button></div>
            <NumInput value={fx.rounds} min={0} placeholder="rodadas" onChange={(n) => setFx({ ...fx, rounds: n || undefined })} style={{ width: 80 }} />
            <label className="row small" style={{ gap: 4 }}><input type="checkbox" checked={!fx.visible} onChange={(e) => setFx({ ...fx, visible: !e.target.checked })} /> secreto</label>
            <button className="btn sm" disabled={!fx.name.trim()} onClick={() => { void safe(updateCombatant(c.id, { effects: [...c.effects, { ...fx, id: uid(), name: fx.name.trim() }] })); setFx({ ...fx, name: '' }); }}><Plus size={13} /> Efeito</button>
          </div>
        </div>
        {s && c.kind !== 'player' && (
          <div className="panel col" style={{ padding: 12 }}>
            <div className="row wrap">
              <label className="field" style={{ width: 90 }}>PV atuais<NumInput value={s.hp_current} min={0} onChange={(n) => safe(updateSecrets(c.id, { hp_current: n }))} /></label>
              <label className="field" style={{ width: 90 }}>PV máx<NumInput value={s.hp_max} min={1} onChange={(n) => safe(updateSecrets(c.id, { hp_max: n }))} /></label>
              <label className="field" style={{ width: 90 }}>PV temp<NumInput value={s.hp_temp} min={0} onChange={(n) => safe(updateSecrets(c.id, { hp_temp: n }))} /></label>
              <label className="field" style={{ width: 90 }}>CA<NumInput value={s.ac ?? 0} min={0} onChange={(n) => safe(updateSecrets(c.id, { ac: n }))} /></label>
            </div>
            <label className="field">Notas do mestre<textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== s.notes && safe(updateSecrets(c.id, { notes }))} /></label>
            {s.stat ? <MonsterBlock m={s.stat} onAttack={attack} /> : <div className="small muted">Inimigo criado do zero: use a bandeja de dados para os ataques.</div>}
          </div>
        )}
      </div>
    </Modal>
  );
}
