import { useState } from 'react';
import { Upload, ClipboardPaste, Trash2 } from 'lucide-react';
import { publishPack, removeItem, useCampaignHomebrew } from '../../cloud/campaignHomebrew';
import { HOMEBREW_KINDS } from '../../data/homebrew';
import { useApp } from '../../store';
import { Modal, pickFile, useFlash } from '../../ui/ui';
import type { CampaignProps } from '../Campaign';

const LABEL: Record<string, string> = { species: 'Raças / Espécies', classes: 'Classes', subclasses: 'Subclasses', backgrounds: 'Antecedentes', feats: 'Talentos', spells: 'Magias', equipment: 'Equipamento', magicItems: 'Itens mágicos' };

export function HomebrewTab({ campaign, isGm }: CampaignProps) {
  const { rows } = useCampaignHomebrew(campaign.id);
  const mine = useApp((s) => s.homebrew[campaign.edition]);
  const flash = useFlash((s) => s.show);
  const [paste, setPaste] = useState<string | null>(null);
  const publish = async (raw: unknown) => {
    try {
      const r = await publishPack(campaign.id, raw);
      if (!r.kept) return alert('Nada para publicar: o arquivo não tem itens de homebrew reconhecíveis.');
      flash(`${r.kept} item(ns) publicado(s) para a campanha${r.dropped ? ` (${r.dropped} ignorado(s))` : ''}`);
      setPaste(null);
    } catch (e) {
      alert((e as Error).message);
    }
  };
  const mineCount = Object.values(mine).reduce((n, a) => n + (a?.length || 0), 0);

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="panel row wrap">
        <div className="grow small muted">Conteúdo publicado aqui vale para todos os membros desta campanha: aparece nas fichas em jogo e nos cards da mesa. Fica só nesta campanha, nunca no site público.</div>
        <button className="btn sm" onClick={async () => { const f = await pickFile('.json'); if (f) try { await publish(JSON.parse(await f.text())); } catch (e) { alert('JSON inválido: ' + (e as Error).message); } }}><Upload size={14} /> Publicar pacote</button>
        <button className="btn sm" onClick={() => setPaste('')}><ClipboardPaste size={14} /> Colar JSON</button>
        <button className="btn sm primary" disabled={!mineCount} onClick={() => publish(mine)} title="Publica o homebrew deste navegador">Publicar meu homebrew ({mineCount})</button>
      </div>
      {rows.length === 0 && <div className="panel empty">Nenhum homebrew na campanha ainda.</div>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {HOMEBREW_KINDS.map((k) => {
          const list = rows.filter((r) => r.kind === k);
          if (!list.length) return null;
          return (
            <div key={k} className="panel col">
              <h3>{LABEL[k]} ({list.length})</h3>
              {list.map((r) => (
                <div key={r.id} className="row small" style={{ padding: '4px 6px', borderRadius: 8, background: 'var(--bg-2)' }}>
                  <span className="grow">{r.item.name}</span>
                  {isGm && <button className="btn icon sm ghost danger" title="Remover da campanha" onClick={() => confirm(`Remover ${r.item.name} da campanha?`) && removeItem(campaign.id, k, r.id).catch((e) => alert(e.message))}><Trash2 size={12} /></button>}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {paste !== null && (
        <Modal title="Colar pacote JSON" onClose={() => setPaste(null)} footer={<button className="btn primary" disabled={!paste.trim()} onClick={() => { try { void publish(JSON.parse(paste)); } catch (e) { alert('JSON inválido: ' + (e as Error).message); } }}>Publicar</button>}>
          <textarea className="textarea" style={{ minHeight: 220, fontFamily: 'monospace', fontSize: 13 }} value={paste} onChange={(e) => setPaste(e.target.value)} />
        </Modal>
      )}
    </div>
  );
}
