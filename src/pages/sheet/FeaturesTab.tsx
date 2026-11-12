import { useState } from 'react';
import { ChevronRight, Plus, Trash2, ArrowUpCircle, Undo2 } from 'lucide-react';
import type { FeatDef } from '../../data/types';
import { uid } from '../../engine/character';
import { featuresShownAsPowers } from '../../engine/classData';
import { undoLevel } from '../../engine/levelUp';
import { confirmBox } from '../../ui/dialogs';
import { ABILITY_PT, XP_TABLE, allFeatures, className, speciesName, syncResources, totalLevel } from '../../engine/rules';
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
          <div className="panel-title"><h3>Classes e nível</h3><span className="spacer" />
            {!!c.levelHistory?.length && (
              <button className="btn sm" title={'Desfazer: ' + c.levelHistory[c.levelHistory.length - 1].summary} onClick={async () => {
                const last = c.levelHistory![c.levelHistory!.length - 1];
                if (!(await confirmBox(`Desfazer o último nível (${last.summary})?

A ficha volta exatamente como estava antes de subir, incluindo PV, recursos e o que você mudou depois disso.`, { ok: 'Desfazer', danger: true }))) return;
                const back = undoLevel(c);
                if (back) upd((d) => { for (const k of Object.keys(d)) if (!(k in back)) delete (d as unknown as Record<string, unknown>)[k]; Object.assign(d, back); });
              }}><Undo2 size={14} /> Desfazer nível</button>
            )}
            <button className="btn sm primary" onClick={onLevelUp}><ArrowUpCircle size={14} /> Subir</button>
          </div>
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
