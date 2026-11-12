import { useState } from 'react';
import { ChevronRight, Plus, Trash2, ArrowUpCircle, Dices, Star } from 'lucide-react';
import type { Ability, Character, FeatDef } from '../../data/types';
import { ABILITIES } from '../../data/types';
import { useDice } from '../../store';
import { uid } from '../../engine/character';
import { featuresShownAsPowers } from '../../engine/classData';
import { ABILITY_PT, XP_TABLE, allFeatures, className, computeScores, findClass, maxHp, mods, speciesName, syncResources, totalLevel } from '../../engine/rules';
import { fmtMod } from '../../engine/dice';
import { Markdown, Modal, NumInput, clickable } from '../../ui/ui';
import type { SheetProps } from '../Sheet';

const TYPE_PT: Record<string, string> = { action: 'Ação', bonus: 'Ação bônus', reaction: 'Reação', resource: 'Recurso', passive: 'Passiva' };
const KIND_COLOR: Record<string, string> = { class: 'accent', subclass: 'accent', species: 'good', background: 'gold', feat: 'gold', custom: '' };

const CLASS_KINDS = new Set(['class', 'subclass', 'feat', 'custom']);

/** `scope`: the Classe tab (levels, feats, class features) or the Raça e origem tab (species, background). */
export function FeaturesTab({ c, srd, upd, onLevelUp, scope = 'class' }: SheetProps & { onLevelUp: () => void; scope?: 'class' | 'origin' }) {
  const [featPick, setFeatPick] = useState(false);
  const [newFeat, setNewFeat] = useState<{ name: string; source: string; desc: string } | null>(null);
  // a hand-written feature that is now a power (its own tab) isn't listed again here
  const asPowers = featuresShownAsPowers(c, srd);
  const groups = allFeatures(c, srd)
    .filter((g) => CLASS_KINDS.has(g.kind) === (scope === 'class'))
    .map((g) => (g.kind === 'custom' ? { ...g, items: g.items.filter((f) => !f.id || !asPowers.has(f.id)) } : g))
    .filter((g) => g.items.length);
  const species = srd.species.find((s) => s.id === c.speciesId);
  const lvl = totalLevel(c);
  const nextXp = XP_TABLE[Math.min(19, lvl)];

  return (
    <div className="sheet-grid" style={{ gridTemplateColumns: '340px 1fr' }}>
      <div className="col g16">
        {scope === 'class' && <div className="panel edit-only">
          <div className="panel-title"><h3>Classes e nível</h3><span className="spacer" /><button className="btn sm primary" onClick={onLevelUp}><ArrowUpCircle size={14} /> Subir</button></div>
          {c.classes.map((e, i) => {
            const subs = srd.subclasses.filter((s) => s.class === e.classId);
            return (
              <div key={i} className="col" style={{ gap: 6, marginBottom: 12, paddingBottom: 12, borderBottom: '1px dashed var(--line)' }}>
                <div className="row">
                  <b className="grow">{className(e.classId, srd)}</b>
                  <span className="small muted">nível</span>
                  <NumInput value={e.level} min={1} max={20} style={{ width: 54 }} onChange={(n) => upd((d) => { d.classes[i].level = n; d.resources = syncResources(d, srd, uid); })} />
                  {c.classes.length > 1 && <button className="btn icon sm ghost danger" onClick={() => upd((d) => d.classes.splice(i, 1))}><Trash2 size={13} /></button>}
                </div>
                {subs.length > 0 && (
                  <select className="select" value={e.subclassId || ''} onChange={(ev) => upd((d) => (d.classes[i].subclassId = ev.target.value || undefined))}>
                    <option value="">Subclasse: —</option>
                    {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
              </div>
            );
          })}
          <div className="row small"><span className="grow muted">Experiência</span><NumInput value={c.xp} min={0} style={{ width: 100 }} onChange={(n) => upd((d) => (d.xp = n))} /></div>
          {lvl < 20 && <div className="small faint" style={{ marginTop: 6 }}>Próximo nível: {nextXp.toLocaleString()} XP {c.xp >= nextXp && <span className="tag good">pronto para subir!</span>}</div>}
        </div>}

        {scope === 'origin' && <div className="panel col edit-only">
          <div className="panel-title mb0"><h3>Origem</h3></div>
          <label className="field">{c.edition === '2014' ? 'Raça' : 'Espécie'}
            <select className="select" value={c.speciesId || ''} onChange={(e) => upd((d) => { d.speciesId = e.target.value || undefined; d.subraceId = srd.species.find((s) => s.id === e.target.value)?.subraces?.[0]?.id; d.speciesChoice = []; })}>
              <option value="">—</option>{srd.species.map((s) => <option key={s.id} value={s.id}>{speciesName(s.id, srd)}</option>)}
            </select>
          </label>
          {!!species?.subraces?.length && (
            <select className="select" value={c.subraceId || ''} onChange={(e) => upd((d) => (d.subraceId = e.target.value || undefined))}>
              {species.subraces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          {species?.bonusChoice && (
            <div className="row wrap">
              {species.bonusChoice.from.map((a) => {
                const on = c.speciesChoice.includes(a);
                return <button key={a} className={'btn sm' + (on ? ' active' : '')} onClick={() => upd((d) => (d.speciesChoice = on ? d.speciesChoice.filter((x) => x !== a) : [...d.speciesChoice, a].slice(-species.bonusChoice!.choose)))}>{ABILITY_PT[a].short} +1</button>;
              })}
            </div>
          )}
          <label className="field">Antecedente
            <select className="select" value={c.backgroundId || ''} onChange={(e) => upd((d) => (d.backgroundId = e.target.value || undefined))}>
              <option value="">Personalizado</option>{srd.backgrounds.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          {c.edition === '2024' && (
            <div className="row wrap small">
              <span className="muted">Bônus do antecedente:</span>
              {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((a) => (
                <label key={a} className="row" style={{ gap: 3 }}>{ABILITY_PT[a].short}<NumInput value={c.backgroundBonus[a] || 0} min={0} max={2} style={{ width: 40, padding: 4 }} onChange={(n) => upd((d) => (d.backgroundBonus[a] = n))} /></label>
              ))}
            </div>
          )}
        </div>}
      </div>

      <div className="panel">
        <div className="panel-title"><h3>{scope === 'class' ? 'Características de classe e talentos' : 'Traços de raça e antecedente'}</h3><span className="spacer" />
          {scope === 'class' && <button className="btn sm" onClick={() => setFeatPick(true)}><Plus size={14} /> Talento</button>}
          {scope === 'class' && <button className="btn sm" onClick={() => setNewFeat({ name: '', source: '', desc: '' })}><Plus size={14} /> Característica própria</button>}
        </div>
        {!groups.length && <div className="small faint">{scope === 'class' ? 'Nada ainda.' : 'Escolha a raça e o antecedente (em Editar ficha) para ver os traços.'}</div>}
        {groups.map((g) => (
          <div key={g.source + g.kind} style={{ marginBottom: 14 }}>
            <div className="row mb6"><span className={'tag ' + KIND_COLOR[g.kind]}>{g.source}</span></div>
            {g.items.map((f, i) => (
              <details key={(f.id || f.name) + i} className="feature">
                <summary>
                  <ChevronRight className="chev" size={16} />
                  {f.level != null && <span className="tag" style={{ minWidth: 26, justifyContent: 'center' }}>{f.level}</span>}
                  <span className="grow">{f.name}</span>
                  {f.type && f.type !== 'passive' && <span className="tag" title="Quando se usa">{TYPE_PT[f.type]}</span>}
                  {c.psychicFocus === f.name && <span className="tag gold">foco</span>}
                  {g.kind === 'feat' && <button className="btn icon sm ghost danger edit-only" aria-label={'Tirar o talento ' + f.name} onClick={(e) => { e.preventDefault(); const id = srd.feats.find((x) => x.name === f.name)?.id; if (id) upd((d) => (d.feats = d.feats.filter((x) => x !== id))); }}><Trash2 size={13} /></button>}
                  {g.kind === 'custom' && <button className="btn icon sm ghost danger" onClick={(e) => { e.preventDefault(); upd((d) => (d.customFeatures = d.customFeatures.filter((x) => x.uid !== f.id))); }}><Trash2 size={13} /></button>}
                </summary>
                <div className="body"><Markdown text={f.desc} /></div>
              </details>
            ))}
          </div>
        ))}
      </div>

      {featPick && <FeatPicker feats={srd.feats} onClose={() => setFeatPick(false)} onPick={(f) => { upd((d) => { if (!d.feats.includes(f.id) || f.repeatable) d.feats.push(f.id); d.resources = syncResources(d, srd, uid); }); setFeatPick(false); }} />}
      {newFeat && (
        <Modal title="Nova característica" onClose={() => setNewFeat(null)} footer={<button className="btn primary" disabled={!newFeat.name} onClick={() => { upd((d) => d.customFeatures.push({ uid: uid(), ...newFeat })); setNewFeat(null); }}>Salvar</button>}>
          <div className="col">
            <label className="field">Nome<input className="input" value={newFeat.name} onChange={(e) => setNewFeat({ ...newFeat, name: e.target.value })} /></label>
            <label className="field">Origem<input className="input" value={newFeat.source} placeholder="Ex.: Item, Bênção, Homebrew…" onChange={(e) => setNewFeat({ ...newFeat, source: e.target.value })} /></label>
            <label className="field">Descrição (aceita **negrito**)<textarea className="textarea" style={{ minHeight: 160 }} value={newFeat.desc} onChange={(e) => setNewFeat({ ...newFeat, desc: e.target.value })} /></label>
          </div>
        </Modal>
      )}
    </div>
  );
}

function FeatPicker({ feats, onPick, onClose }: { feats: FeatDef[]; onPick: (f: FeatDef) => void; onClose: () => void }) {
  const [sel, setSel] = useState<FeatDef | null>(feats[0] || null);
  return (
    <Modal wide title="Escolher talento" onClose={onClose}>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(200px, 1fr) 1.4fr', alignItems: 'start' }}>
        <div className="pick-list">
          {feats.map((f) => (
            <div key={f.id} className={'pick-item' + (sel?.id === f.id ? ' sel' : '')} {...clickable(() => setSel(f))}>
              <span className="grow">{f.name}</span>{f.type && <span className="tag">{f.type}</span>}
            </div>
          ))}
          {feats.length <= 1 && <p className="small faint">O SRD 2014 só tem 1 talento gratuito. Cadastre outros em Homebrew.</p>}
        </div>
        <div className="panel">
          {sel && <div className="col"><h2>{sel.name}</h2>{sel.prereq && <span className="tag bad self-start">Pré-requisito: {sel.prereq}</span>}<Markdown text={sel.desc} /><button className="btn primary self-start" onClick={() => onPick(sel)}><Plus size={14} /> Escolher</button></div>}
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- level up ---------------- */

export function LevelUpModal({ c, srd, upd, onClose, onDone }: SheetProps & { onClose: () => void; onDone: (m: string) => void }) {
  const roll = useDice((s) => s.roll);
  const [classId, setClassId] = useState(c.classes[0]?.classId || srd.classes[0].id);
  const [hpMode, setHpMode] = useState<'avg' | 'roll'>('avg');
  const [rolled, setRolled] = useState<number | null>(null);
  const [sub, setSub] = useState<string>('');
  const cls = findClass(srd, classId)!;
  const entry = c.classes.find((e) => e.classId === classId);
  const newLevel = (entry?.level || 0) + 1;
  const total = totalLevel(c) + (c.classes.length ? 1 : 0);
  const con = mods(c, srd).con;
  const avg = Math.floor(cls.hitDie / 2) + 1;
  const row = cls.levels.find((l) => l.level === newLevel);
  const subNow = srd.subclasses.find((s) => s.id === (entry?.subclassId || sub));
  const subFeatures = subNow?.features.filter((f) => f.level === newLevel) || [];
  const needsSub = !entry?.subclassId && (row?.features || []).some((f) => /subclass|archetype|path|college|domain|circle|oath|tradition|origin|patron|conclave/i.test(f.name));
  const scores = computeScores(c, srd);
  const mcOk = entry || !cls.multiclass?.prereq?.length || cls.multiclass.prereq.every((p) => scores[p.ability] >= p.min);
  const gain = Math.max(1, (hpMode === 'avg' ? avg : rolled ?? avg) + con);

  // Ability Score Improvement: listed in the class table, or the usual levels for homebrew classes
  const hasAsi = (row?.features || []).some((f) => /ability score improvement|aumento de atributo/i.test(f.name)) || (!!cls.custom && [4, 8, 12, 16, 19].includes(newLevel));
  const [asiMode, setAsiMode] = useState<'plus2' | 'split' | 'feat' | 'later'>('plus2');
  const [asiA, setAsiA] = useState<Ability>('str');
  const [asiB, setAsiB] = useState<Ability>('dex');
  const [asiFeat, setAsiFeat] = useState('');
  const room = (a: Ability) => Math.max(0, 20 - scores[a]);
  const asiPlan: Partial<Record<Ability, number>> = !hasAsi ? {} : asiMode === 'plus2' ? { [asiA]: Math.min(2, room(asiA)) } : asiMode === 'split' ? { [asiA]: Math.min(1, room(asiA)), [asiB]: Math.min(1, room(asiB)) } : {};
  const asiReady = !hasAsi || asiMode === 'later' || (asiMode === 'feat' ? !!asiFeat : asiMode === 'split' ? asiA !== asiB : true);

  const mutate = (d: Character) => {
    const e = d.classes.find((x) => x.classId === classId);
    if (e) { e.level += 1; if (sub && !e.subclassId) e.subclassId = sub; }
    else {
      d.classes.push({ classId, level: 1, subclassId: sub || undefined });
      // multiclass: add the class' multiclass proficiencies to the text
      if (cls.multiclass?.profs?.length) d.proficienciesText = [d.proficienciesText, ...cls.multiclass.profs].filter(Boolean).join(', ');
    }
    if (hpMode === 'roll' && rolled != null) d.hp.maxBonus += rolled - avg;
    // a fixed max HP (e.g. imported from another app) still grows by this level's hit points
    if (d.hp.maxOverride) d.hp.maxOverride += gain;
    for (const [a, n] of Object.entries(asiPlan) as [Ability, number][]) if (n) d.extra[a] = (d.extra[a] || 0) + n;
    if (hasAsi && asiMode === 'feat' && asiFeat) d.feats.push(asiFeat);
    d.resources = syncResources(d, srd, uid);
  };

  const apply = () => {
    const before = maxHp(c, srd);
    const sim = structuredClone(c);
    mutate(sim);
    const after = maxHp(sim, srd); // includes CON increases from the ASI
    upd((d) => {
      mutate(d);
      d.hp.current = Math.min(after, d.hp.current + (after - before));
    });
    const asiText = Object.entries(asiPlan).filter(([, n]) => n).map(([a, n]) => `${ABILITY_PT[a as Ability].short} +${n}`).join(', ');
    onDone(`${c.name} agora é nível ${total}! +${after - before} PV${asiText ? ` · ${asiText}` : ''}${hasAsi && asiMode === 'feat' && asiFeat ? ` · talento ${srd.feats.find((f) => f.id === asiFeat)?.name}` : ''}`);
  };

  return (
    <Modal title={`Subir para o nível ${total}`} onClose={onClose} icon={<ArrowUpCircle color="var(--accent-2)" />}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!mcOk || (hpMode === "roll" && rolled == null) || !asiReady} onClick={apply}>Confirmar</button></>}>
      <div className="col">
        <label className="field">Classe que vai ganhar o nível
          <select className="select" value={classId} onChange={(e) => { setClassId(e.target.value); setSub(''); }}>
            {c.classes.map((e) => <option key={e.classId} value={e.classId}>{className(e.classId, srd)} → {e.level + 1}</option>)}
            <optgroup label="Multiclasse (nova classe)">
              {srd.classes.filter((k) => !c.classes.some((e) => e.classId === k.id)).map((k) => <option key={k.id} value={k.id}>{className(k.id, srd)} 1</option>)}
            </optgroup>
          </select>
        </label>
        {!mcOk && <div className="tag bad">Pré-requisito de multiclasse: {cls.multiclass?.prereq?.map((p) => `${ABILITY_PT[p.ability].short} ${p.min}`).join(', ')}</div>}

        <div className="panel">
          <div className="row">
            <span className="grow">Pontos de Vida (d{cls.hitDie} {fmtMod(con)})</span>
            <div className="seg">
              <button className={hpMode === 'avg' ? 'on' : ''} onClick={() => setHpMode('avg')}>Média ({avg})</button>
              <button className={hpMode === 'roll' ? 'on' : ''} onClick={() => setHpMode('roll')}>Rolar</button>
            </div>
          </div>
          {hpMode === 'roll' && (
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn" onClick={async () => { const r = await roll(`${c.name}: PV do nível ${total}`, `1d${cls.hitDie}`); if (r) setRolled(r.total); }}><Dices size={15} /> Rolar d{cls.hitDie}</button>
              {rolled != null && <b>Resultado: {rolled}</b>}
            </div>
          )}
          <div className="display" style={{ fontSize: 22, marginTop: 8 }}>+{gain} PV</div>
        </div>

        {needsSub && srd.subclasses.some((s) => s.class === classId) && (
          <label className="field">Escolha sua subclasse
            <select className="select" value={sub} onChange={(e) => setSub(e.target.value)}>
              <option value="">—</option>
              {srd.subclasses.filter((s) => s.class === classId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}

        <div className="tiny muted">Novidades no nível {newLevel} de {className(classId, srd)}</div>
        {[...(row?.features || []), ...subFeatures].map((f) => (
          <details key={f.name} className="feature">
            <summary><ChevronRight className="chev" size={16} />{f.name}</summary>
            <div className="body"><Markdown text={f.desc} /></div>
          </details>
        ))}
        {!(row?.features || []).length && !subFeatures.length && <div className="small faint">Nenhuma característica nova listada neste nível.</div>}
        {hasAsi && (
          <div className="panel col" style={{ borderColor: 'var(--gold)' }}>
            <div className="row"><span className="grow" style={{ fontWeight: 700 }}><Star size={14} className="ic-inline" /> Aumento de Atributo</span>
              <div className="seg">
                <button className={asiMode === 'plus2' ? 'on' : ''} onClick={() => setAsiMode('plus2')}>+2 em um</button>
                <button className={asiMode === 'split' ? 'on' : ''} onClick={() => setAsiMode('split')}>+1 em dois</button>
                <button className={asiMode === 'feat' ? 'on' : ''} onClick={() => setAsiMode('feat')}>Talento</button>
                <button className={asiMode === 'later' ? 'on' : ''} onClick={() => setAsiMode('later')}>Depois</button>
              </div>
            </div>
            {(asiMode === 'plus2' || asiMode === 'split') && (
              <div className="row wrap">
                {[asiA, ...(asiMode === 'split' ? [asiB] : [])].map((cur, i) => (
                  <select key={i} className="select" style={{ width: 'auto' }} value={cur} onChange={(e) => (i === 0 ? setAsiA : setAsiB)(e.target.value as Ability)}>
                    {ABILITIES.map((a) => <option key={a} value={a} disabled={room(a) === 0}>{ABILITY_PT[a].name} ({scores[a]}{room(a) === 0 ? ', máximo' : ` → ${Math.min(20, scores[a] + (asiMode === 'plus2' ? 2 : 1))}`})</option>)}
                  </select>
                ))}
                {asiMode === 'split' && asiA === asiB && <span className="tag bad">Escolha dois atributos diferentes</span>}
              </div>
            )}
            {asiMode === 'feat' && (
              <select className="select" value={asiFeat} onChange={(e) => setAsiFeat(e.target.value)}>
                <option value="">Escolha um talento…</option>
                {srd.feats.filter((f) => f.type !== 'origin' || c.edition === '2014').map((f) => <option key={f.id} value={f.id}>{f.name}{f.type ? ` (${f.type})` : ''}{f.prereq ? ` · requer ${f.prereq}` : ''}</option>)}
              </select>
            )}
            {asiMode === 'later' && <div className="small muted">Você pode ajustar depois em Principal → Editar atributos, ou em Habilidades → + Talento.</div>}
            <div className="small faint">Nenhum atributo passa de 20.</div>
          </div>
        )}
        {row?.spellcasting && <div className="small muted">Magias: {row.spellcasting.cantrips != null && `${row.spellcasting.cantrips} truques · `}{row.spellcasting.known != null && `${row.spellcasting.known} conhecidas · `}{row.spellcasting.prepared != null && `${row.spellcasting.prepared} preparadas · `}espaços {row.spellcasting.slots.filter(Boolean).join('/')}</div>}
      </div>
    </Modal>
  );
}
