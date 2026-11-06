import { Plus, Upload, Copy, Trash2, Download } from 'lucide-react';
import { useApp } from '../store';
import type { Edition } from '../data/types';
import { useSrd } from '../data/srd';
import { go, pickFile, useFlash, download } from '../ui/ui';
import { armorClass, classSummary, maxHp, speciesName } from '../engine/rules';

export function Avatar({ name, portrait, size }: { name: string; portrait?: string; size?: 'lg' }) {
  return (
    <div className={'avatar' + (size ? ' ' + size : '')} style={portrait ? { backgroundImage: `url(${portrait})` } : undefined}>
      {!portrait && (name.trim()[0]?.toUpperCase() || '?')}
    </div>
  );
}

export function Roster({ edition }: { edition: Edition }) {
  const srd = useSrd(edition);
  const all = useApp((s) => s.characters);
  const { importCharacter, duplicateCharacter, removeCharacter } = useApp();
  const flash = useFlash((s) => s.show);
  const chars = all.filter((c) => c.edition === edition).sort((a, b) => b.updatedAt - a.updatedAt);

  const onImport = async () => {
    const f = await pickFile();
    if (!f) return;
    try {
      const raw = JSON.parse(await f.text());
      if (raw.edition && raw.edition !== edition) {
        if (!confirm(`Esta ficha é da edição ${raw.edition}. Importar mesmo assim para a mesa ${raw.edition}?`)) return;
      }
      const c = importCharacter(raw);
      flash(`${c.name || 'Personagem'} importado!`);
      go(`${c.edition}/c/${c.id}`);
    } catch (e) {
      alert('Não consegui ler esse arquivo: ' + (e as Error).message);
    }
  };

  return (
    <main className="page">
      <div className="roster-head">
        <div className="grow">
          <div className="tiny muted">Mesa {edition}</div>
          <h1>Seus personagens</h1>
        </div>
        <button className="btn" onClick={onImport}><Upload size={16} /> Importar ficha</button>
        <button className="btn primary" onClick={() => go(edition + '/novo')}><Plus size={16} /> Novo personagem</button>
      </div>
      <div className="cards">
        {chars.map((c) => {
          const max = srd ? maxHp(c, srd) : 1;
          const pct = Math.max(0, Math.min(100, (c.hp.current / max) * 100));
          return (
            <div key={c.id} className="char-card" onClick={() => go(`${edition}/c/${c.id}`)}>
              <div className="top">
                <Avatar name={c.name} portrait={c.portrait} />
                <div className="grow">
                  <div className="display" style={{ fontSize: 19, fontWeight: 700 }}>{c.name || 'Sem nome'}</div>
                  <div className="small muted">{[speciesName(c.speciesId, srd || undefined), classSummary(c, srd || undefined)].filter(Boolean).join(' · ')}</div>
                </div>
              </div>
              {srd && (
                <>
                  <div className="row small">
                    <span className="tag">CA {armorClass(c, srd).value}</span>
                    <span className="tag">PV {c.hp.current}/{max}</span>
                    {c.conditions.length > 0 && <span className="tag bad">{c.conditions.length} condição</span>}
                  </div>
                  <div className={'hpbar' + (pct < 30 ? ' low' : pct < 60 ? ' mid' : '')}><span style={{ width: pct + '%' }} /></div>
                </>
              )}
              <div className="row" onClick={(e) => e.stopPropagation()}>
                <span className="faint small grow">Editado {new Date(c.updatedAt).toLocaleDateString()}</span>
                <button className="btn icon sm ghost" title="Exportar" onClick={() => download(`${c.name || 'personagem'}.json`, c)}><Download size={14} /></button>
                <button className="btn icon sm ghost" title="Duplicar" onClick={() => duplicateCharacter(c.id)}><Copy size={14} /></button>
                <button className="btn icon sm ghost danger" title="Excluir" onClick={() => confirm(`Excluir ${c.name || 'este personagem'}? Não dá para desfazer.`) && removeCharacter(c.id)}><Trash2 size={14} /></button>
              </div>
            </div>
          );
        })}
        <button className="char-card new-card" onClick={() => go(edition + '/novo')}>
          <Plus size={30} />
          <div style={{ fontWeight: 600 }}>Criar personagem</div>
          <div className="small faint">Passo a passo, com tudo calculado</div>
        </button>
      </div>
    </main>
  );
}
