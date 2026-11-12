import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Ability, ChoiceDef, CounterDef, FeatureRef, FeatureType, PowerListDef, PowerOption } from '../../data/types';
import { ABILITIES } from '../../data/types';
import { ABILITY_PT } from '../../engine/rules';
import { NumInput } from '../../ui/ui';

/**
 * Editors for the parts of a class that are data, not text: the type and pick of each feature,
 * numbers that grow with the level, power lists, multiclassing, and the powers themselves.
 * Short labels, a hint on each field, nothing that needs code.
 */

export const FEATURE_TYPES: { v: FeatureType | ''; l: string; hint: string }[] = [
  { v: '', l: 'Automático', hint: 'O site lê o texto para saber se é ação, ação bônus ou reação' },
  { v: 'passive', l: 'Passiva', hint: 'Sempre ligada, não se usa no turno' },
  { v: 'action', l: 'Ação', hint: 'Aparece na coluna Ação do turno' },
  { v: 'bonus', l: 'Ação bônus', hint: 'Aparece na coluna Ação bônus do turno' },
  { v: 'reaction', l: 'Reação', hint: 'Aparece na coluna Reação do turno' },
  { v: 'resource', l: 'Recurso', hint: 'Usos ou pontos que se gastam (crie o contador abaixo)' },
];

const slugId = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';

/** "4, 6, 14" ↔ [4, 6, 14]; the last value repeats up to level 20. */
const parseValues = (t: string) => t.split(/[,;\s]+/).map((x) => parseInt(x, 10)).filter((n) => !isNaN(n)).slice(0, 20);

export interface ListChoice { v: string; l: string }

/** Features with their type and, if the feature gives one, a pick ("choose 1 discipline"). */
export function RichFeatureList({ value, onChange, withLevel = true, label = 'Características', lists, markers = false }: {
  value: FeatureRef[]; onChange: (v: FeatureRef[]) => void; withLevel?: boolean; label?: string; lists: ListChoice[]; markers?: boolean;
}) {
  const put = (i: number, patch: Partial<FeatureRef>) => onChange(value.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const sorted = withLevel ? [...value.keys()].sort((a, b) => (value[a].level || 1) - (value[b].level || 1)) : [...value.keys()];
  return (
    <div className="col g8">
      <div className="row"><span className="tiny muted grow">{label}</span><button className="btn sm" onClick={() => onChange([...value, { name: '', desc: '', level: withLevel ? 1 : undefined }])}><Plus size={13} /> Adicionar</button></div>
      {sorted.map((i) => {
        const f = value[i];
        const ch = f.choice;
        return (
          <div key={i} className="panel col hb-feat" style={{ padding: 10, gap: 6 }}>
            <div className="row wrap g6">
              {withLevel && <label className="row small g4" title="Nível da classe em que se ganha">Nv<NumInput value={f.level || 1} min={1} max={20} style={{ width: 50 }} onChange={(n) => put(i, { level: n })} /></label>}
              <input className="input grow" placeholder="Nome" value={f.name} onChange={(e) => put(i, { name: e.target.value })} aria-label="Nome da característica" />
              <select className="select" style={{ width: 'auto' }} value={f.type || ''} onChange={(e) => put(i, { type: (e.target.value || undefined) as FeatureType | undefined })} title={FEATURE_TYPES.find((t) => t.v === (f.type || ''))?.hint} aria-label="Tipo">
                {FEATURE_TYPES.map((t) => <option key={t.v} value={t.v} title={t.hint}>{t.l}</option>)}
              </select>
              <button className="btn icon sm ghost danger" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Excluir característica"><Trash2 size={13} /></button>
            </div>
            <textarea className="textarea" style={{ minHeight: 70, fontSize: 14 }} placeholder="Descrição (aceita **negrito**)" value={f.desc} onChange={(e) => put(i, { desc: e.target.value })} />
            <div className="row wrap g8 small">
              <label className="row g4" title="Ao ganhar esta característica, o jogador escolhe opções de uma lista">
                <input type="checkbox" checked={!!ch} onChange={(e) => put(i, { choice: e.target.checked ? { list: lists[0]?.v || 'feats', count: 1 } : undefined })} /> Tem escolha
              </label>
              {ch && (
                <>
                  <label className="row g4">Escolher<NumInput value={ch.count} min={1} max={10} style={{ width: 46 }} onChange={(n) => put(i, { choice: { ...ch, count: n } })} /></label>
                  <label className="row g4">de
                    <select className="select" style={{ width: 'auto' }} value={ch.list} onChange={(e) => put(i, { choice: { ...ch, list: e.target.value } })}>
                      {lists.map((l) => <option key={l.v} value={l.v}>{l.l}</option>)}
                      <option value="feats">Talentos</option>
                    </select>
                  </label>
                  <input className="input" style={{ width: 130 }} placeholder="Etiqueta (opcional)" title="Só opções com esta etiqueta, ex.: as disciplinas de uma ordem" value={ch.tag || ''} onChange={(e) => put(i, { choice: { ...ch, tag: e.target.value || undefined } as ChoiceDef })} />
                </>
              )}
              {markers && (
                <>
                  <label className="row g4" title="Neste nível o jogador aumenta atributos ou pega um talento"><input type="checkbox" checked={!!f.asi} onChange={(e) => put(i, { asi: e.target.checked || undefined })} /> Aumento de atributo</label>
                  <label className="row g4" title="Neste nível o jogador escolhe a subclasse"><input type="checkbox" checked={!!f.subclass} onChange={(e) => put(i, { subclass: e.target.checked || undefined })} /> Escolhe subclasse</label>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Numbers that grow with the class level; the ones with a rest become pools on the sheet. */
export function CountersEditor({ value, onChange }: { value: CounterDef[]; onChange: (v: CounterDef[]) => void }) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const put = (i: number, patch: Partial<CounterDef>) => onChange(value.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="col g8">
      <div className="row">
        <span className="tiny muted grow" title="Ex.: Pontos de Psi 4, 6, 14…; usos por dia; dado que cresce">Contadores por nível (pontos, usos, quantidades)</span>
        <button className="btn sm" onClick={() => onChange([...value, { id: '', name: '', values: [] }])}><Plus size={13} /> Adicionar</button>
      </div>
      {value.map((c, i) => (
        <div key={i} className="panel col" style={{ padding: 10, gap: 6 }}>
          <div className="row wrap g6">
            <input className="input grow" placeholder="Nome (ex.: Pontos de Psi)" value={c.name} onChange={(e) => put(i, { name: e.target.value, id: c.id || '' })} aria-label="Nome do contador" />
            <select className="select" style={{ width: 'auto' }} value={c.reset || ''} onChange={(e) => put(i, { reset: (e.target.value || undefined) as CounterDef['reset'] })} title="Com descanso, vira um recurso que se gasta e recupera na ficha">
              <option value="">Só um número</option>
              <option value="short">Recurso: volta no descanso curto</option>
              <option value="long">Recurso: volta no descanso longo</option>
            </select>
            <button className="btn icon sm ghost danger" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Excluir contador"><Trash2 size={13} /></button>
          </div>
          <label className="field small">Valor do nível 1 ao 20, separado por vírgula (o último se repete)
            <input className="input" value={drafts[i] ?? c.values.join(', ')} placeholder="4, 6, 14, 17, 27…" onChange={(e) => setDrafts({ ...drafts, [i]: e.target.value })} onBlur={() => { if (drafts[i] != null) { put(i, { values: parseValues(drafts[i]) }); setDrafts({ ...drafts, [i]: undefined as never }); } }} />
          </label>
          {c.values.length > 0 && <div className="tiny faint">Nv 1: {c.values[0]} · Nv 5: {c.values[Math.min(4, c.values.length - 1)]} · Nv 10: {c.values[Math.min(9, c.values.length - 1)]} · Nv 20: {c.values[Math.min(19, c.values.length - 1)]}</div>}
          <div className="row wrap g8 small">
            <input className="input grow" placeholder="Explicação curta (aparece ao passar o mouse)" value={c.desc || ''} onChange={(e) => put(i, { desc: e.target.value || undefined })} />
            <label className="row g4" title="Este número é o máximo que um único uso pode gastar de outro contador (ex.: Limite de Psi)">Limite de
              <select className="select" style={{ width: 'auto' }} value={c.limitOf || ''} onChange={(e) => put(i, { limitOf: e.target.value || undefined })}>
                <option value="">—</option>
                {value.filter((x, j) => j !== i && x.reset).map((x) => <option key={x.id || x.name} value={x.id || slugId(x.name)}>{x.name}</option>)}
              </select>
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Lists of powers the class uses; each one gets its own tab on the sheet. */
export function PowerListsEditor({ value, onChange, counters }: { value: PowerListDef[]; onChange: (v: PowerListDef[]) => void; counters: CounterDef[] }) {
  const put = (i: number, patch: Partial<PowerListDef>) => onChange(value.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="col g8">
      <div className="row">
        <span className="tiny muted grow" title="Disciplinas, talentos psiônicos, invocações, manobras… Cada lista vira uma aba na ficha de quem tem a classe">Listas de poderes</span>
        <button className="btn sm" onClick={() => onChange([...value, { id: '', name: '' }])}><Plus size={13} /> Adicionar</button>
      </div>
      {value.map((l, i) => (
        <div key={i} className="row wrap g6 panel" style={{ padding: 10 }}>
          <input className="input grow" placeholder="Nome (ex.: Disciplinas)" value={l.name} onChange={(e) => put(i, { name: e.target.value })} aria-label="Nome da lista" />
          <label className="row small g4" title="Contador que paga o custo dos poderes desta lista">Custa
            <select className="select" style={{ width: 'auto' }} value={l.resource || ''} onChange={(e) => put(i, { resource: e.target.value || undefined })}>
              <option value="">nada</option>
              {counters.filter((c) => c.reset).map((c) => <option key={c.id || c.name} value={c.id || slugId(c.name)}>{c.name}</option>)}
            </select>
          </label>
          {l.resource && <input className="input" style={{ width: 80 }} placeholder="Unidade" title="Nome curto do custo, ex.: psi" value={l.unit || ''} onChange={(e) => put(i, { unit: e.target.value || undefined })} />}
          <label className="row small g4" title="Contador com quantos poderes desta lista o personagem conhece em cada nível">Conhece
            <select className="select" style={{ width: 'auto' }} value={l.known || ''} onChange={(e) => put(i, { known: e.target.value || undefined })}>
              <option value="">—</option>
              {counters.filter((c) => !c.reset).map((c) => <option key={c.id || c.name} value={c.id || slugId(c.name)}>{c.name}</option>)}
            </select>
          </label>
          <button className="btn icon sm ghost danger" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Excluir lista"><Trash2 size={13} /></button>
          <input className="input" style={{ width: '100%' }} placeholder="Explicação curta" value={l.desc || ''} onChange={(e) => put(i, { desc: e.target.value || undefined })} />
        </div>
      ))}
    </div>
  );
}

/** Ids for new counters and lists, from their names (kept when they already have one). */
export function withIds<T extends { id: string; name: string }>(list: T[]): T[] {
  const used = new Set<string>();
  return list.filter((x) => x.name.trim()).map((x) => {
    let id = x.id || slugId(x.name);
    while (used.has(id)) id += '-2';
    used.add(id);
    return { ...x, id };
  });
}

type Prereq = { ability: Ability; min: number };
export function MulticlassEditor({ value, onChange }: { value: Prereq[]; onChange: (v: Prereq[]) => void }) {
  return (
    <div className="row wrap g8 small">
      <span className="tiny muted" title="Atributo mínimo para entrar nesta classe por multiclasse (e para sair da classe atual)">Multiclasse exige</span>
      {value.map((p, i) => (
        <span key={i} className="row g4">
          <select className="select" style={{ width: 'auto' }} value={p.ability} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, ability: e.target.value as Ability } : x)))}>
            {ABILITIES.map((a) => <option key={a} value={a}>{ABILITY_PT[a].short}</option>)}
          </select>
          <NumInput value={p.min} min={1} max={20} style={{ width: 46 }} onChange={(n) => onChange(value.map((x, j) => (j === i ? { ...x, min: n } : x)))} />
          <button className="btn icon sm ghost danger" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Tirar requisito"><Trash2 size={12} /></button>
        </span>
      ))}
      <button className="btn sm" onClick={() => onChange([...value, { ability: 'int', min: 13 }])}><Plus size={12} /> Requisito</button>
    </div>
  );
}

/** The ways to use a power, each with its cost. */
export function PowerOptionsEditor({ value, onChange, unit }: { value: PowerOption[]; onChange: (v: PowerOption[]) => void; unit?: string }) {
  const put = (i: number, patch: Partial<PowerOption>) => onChange(value.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="col g8">
      <div className="row"><span className="tiny muted grow" title="Cada modo aparece com um botão de gastar na ficha">Modos de uso</span><button className="btn sm" onClick={() => onChange([...value, { name: '', cost: 1 }])}><Plus size={13} /> Adicionar</button></div>
      {value.map((o, i) => (
        <div key={i} className="panel col" style={{ padding: 10, gap: 6 }}>
          <div className="row wrap g6">
            <input className="input grow" placeholder="Nome do modo" value={o.name} onChange={(e) => put(i, { name: e.target.value })} aria-label="Nome do modo" />
            <label className="row small g4" title="Custo mínimo">Custo<NumInput value={o.cost} min={0} max={99} style={{ width: 46 }} onChange={(n) => put(i, { cost: n })} /></label>
            <label className="row small g4" title="Se o jogador pode gastar mais, até quanto (deixe vazio se for fixo)">até<NumInput value={o.costMax} min={0} max={99} style={{ width: 46 }} onChange={(n) => put(i, { costMax: n > (o.cost ?? 0) ? n : undefined })} /></label>
            {unit && <span className="small muted">{unit}</span>}
            <select className="select" style={{ width: 'auto' }} value={o.time || ''} onChange={(e) => put(i, { time: e.target.value || undefined })} aria-label="Tempo">
              <option value="">Tempo —</option><option>Ação</option><option>Ação bônus</option><option>Reação</option>
            </select>
            <label className="row small g4"><input type="checkbox" checked={!!o.conc} onChange={(e) => put(i, { conc: e.target.checked || undefined })} /> Conc.</label>
            <button className="btn icon sm ghost danger" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Excluir modo"><Trash2 size={13} /></button>
          </div>
          <textarea className="textarea" style={{ minHeight: 56, fontSize: 14 }} placeholder="O que acontece" value={o.desc || ''} onChange={(e) => put(i, { desc: e.target.value || undefined })} />
        </div>
      ))}
    </div>
  );
}
