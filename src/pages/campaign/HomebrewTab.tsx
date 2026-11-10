import { useState } from 'react';
import { Upload, ClipboardPaste, Trash2 } from 'lucide-react';
import { publishPack, removeItem, useCampaignHomebrew } from '../../cloud/campaignHomebrew';
import { HOMEBREW_KINDS } from '../../data/homebrew';
import { useApp } from '../../store';
import { Modal, pickFile, useFlash } from '../../ui/ui';
import type { CampaignProps } from '../Campaign';
import { alertBox, confirmBox, showError } from '../../ui/dialogs';

const LABEL: Record<string, string> = { species: 'Raças / Espécies', classes: 'Classes', subclasses: 'Subclasses', backgrounds: 'Antecedentes', feats: 'Talentos', spells: 'Magias', equipment: 'Equipamento', magicItems: 'Itens mágicos' };

export function HomebrewTab({ campaign, isGm, uid }: CampaignProps) {
  const { rows } = useCampaignHomebrew(campaign.id);
  const mine = useApp((s) => s.homebrew[campaign.edition]);
  const flash = useFlash((s) => s.show);
  const [paste, setPaste] = useState<string | null>(null);
  const publish = async (raw: unknown) => {
    try {
      const r = await publishPack(campaign.id, raw, { uid, isGm });
      if (!r.kept && !r.skipped) return void alertBox('Nada para publicar: o arquivo não tem itens de homebrew reconhecíveis.');
      const notes = [r.dropped ? `${r.dropped} ignorado(s)` : '', r.skipped ? `${r.skipped} de outra pessoa mantido(s) como estava(m)` : ''].filter(Boolean).join(', ');
      flash(`${r.kept} item(ns) publicado(s) para a campanha${notes ? ` (${notes})` : ''}`);
      setPaste(null);
    } catch (e) {
      showError(e);
    }
  };
  const mineCount = Object.values(mine).reduce((n, a) => n + (a?.length || 0), 0);

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="panel row wrap">
        <div className="grow small muted">O que você publica aqui vale para todos desta campanha e aparece nas fichas em jogo. Não vai para o site público.</div>
        <button className="btn sm" onClick={async () => { const f = await pickFile('.json'); if (f) try { await publish(JSON.parse(await f.text())); } catch (e) { void alertBox('JSON inválido: ' + (e as Error).message); } }}><Upload size={14} /> Publicar pacote</button>
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
                  {(isGm || r.created_by === uid) && <button className="btn icon sm ghost danger" title="Remover da campanha" onClick={async () => (await confirmBox(`Remover ${r.item.name} da campanha?`, { danger: true, ok: 'Remover' })) && removeItem(campaign.id, k, r.id).catch(showError)}><Trash2 size={12} /></button>}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {paste !== null && (
        <Modal title="Colar pacote JSON" onClose={() => setPaste(null)} footer={<button className="btn primary" disabled={!paste.trim()} onClick={() => { try { void publish(JSON.parse(paste)); } catch (e) { void alertBox('JSON inválido: ' + (e as Error).message); } }}>Publicar</button>}>
          <textarea className="textarea" style={{ minHeight: 220, fontFamily: 'monospace', fontSize: 13 }} value={paste} onChange={(e) => setPaste(e.target.value)} />
        </Modal>
      )}
    </div>
  );
}
