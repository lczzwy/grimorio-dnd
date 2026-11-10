import { useEffect, useState } from 'react';
import { CloudOff, CloudUpload, RefreshCw } from 'lucide-react';
import { useApp } from '../store';
import { useAuth } from '../cloud/auth';
import { uploadAll, uploader, useSyncStatus } from '../cloud/sync';
import { Modal, useFlash } from './ui';

/** A strip under the top bar while some sheet keeps failing to save online, or the server is down. */
export function SyncBanner() {
  const failed = useSyncStatus((s) => s.failed);
  const serverDown = useAuth((s) => s.serverDown);
  const chars = useApp((s) => s.characters);
  const [busy, setBusy] = useState(false);
  const ids = Object.keys(failed);
  if (serverDown) {
    return (
      <div className="sync-banner" role="status">
        <CloudOff size={16} />
        <span className="grow">O servidor da mesa não está respondendo (pode estar pausado). As fichas funcionam neste aparelho; campanhas e chat voltam quando ele voltar.</span>
      </div>
    );
  }
  if (!ids.length) return null;
  const names = ids.map((id) => chars.find((c) => c.id === id)?.name || 'Sem nome');
  const reason = failed[ids[0]];
  return (
    <div className="sync-banner" role="status">
      <CloudOff size={16} />
      <span className="grow">
        {ids.length === 1 ? <>A ficha <b>{names[0]}</b> não está salvando online</> : <>{ids.length} fichas não estão salvando online ({names.join(', ')})</>}
        {reason ? `: ${reason}` : ''}. As mudanças continuam guardadas neste aparelho e vou tentando de novo.
      </span>
      <button className="btn sm" disabled={busy} onClick={async () => { setBusy(true); try { await uploader.flush(); } finally { setBusy(false); } }}>
        <RefreshCw size={14} /> Tentar agora
      </button>
    </div>
  );
}

const offerKey = (uid: string) => 'grimorio-offer-upload-' + uid;

/** Right after logging in: offers to send the sheets that only exist in this browser. */
export function FirstLoginUpload() {
  const uid = useAuth((s) => s.user?.id);
  const chars = useApp((s) => s.characters);
  const flash = useFlash((s) => s.show);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const localOnly = chars.filter((c) => !c.cloud);

  useEffect(() => {
    if (!uid || !localOnly.length) return;
    let asked = false;
    try { asked = localStorage.getItem(offerKey(uid)) === '1'; } catch { /* private mode */ }
    if (!asked) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  if (!open || !uid) return null;
  const done = () => {
    try { localStorage.setItem(offerKey(uid), '1'); } catch { /* private mode */ }
    setOpen(false);
  };
  return (
    <Modal
      title="Levar suas fichas para a conta?"
      onClose={done}
      footer={<>
        <button className="btn" onClick={done}>Agora não</button>
        <button className="btn primary" disabled={busy} onClick={async () => {
          setBusy(true);
          try { const n = await uploadAll(); flash(`${n} ficha(s) enviada(s) para a sua conta`); } catch { flash('Não consegui enviar agora; vou tentar de novo sozinho.'); } finally { setBusy(false); done(); }
        }}><CloudUpload size={15} /> Enviar {localOnly.length} ficha(s)</button>
      </>}
    >
      <p style={{ marginTop: 0 }}>
        Este navegador tem {localOnly.length} ficha(s) que ainda não estão na sua conta: <b>{localOnly.map((c) => c.name || 'Sem nome').join(', ')}</b>.
      </p>
      <p className="small muted" style={{ marginBottom: 0 }}>Na conta, elas ficam salvas online, aparecem nos seus outros aparelhos e podem entrar nas campanhas. Dá para fazer isso depois em <b>Sua conta</b>.</p>
    </Modal>
  );
}
