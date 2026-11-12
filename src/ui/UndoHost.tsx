import { useEffect, useState } from 'react';
import { Undo2, X } from 'lucide-react';
import { showError } from './dialogs';
import { STAY_MS, useUndo } from './undo';

/** The notice with the "Desfazer" button (see offerUndo). */
export function UndoHost() {
  const offer = useUndo((s) => s.offer);
  const clear = useUndo((s) => s.set);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!offer) return;
    const t = window.setTimeout(() => { if (useUndo.getState().offer?.key === offer.key) clear(null); }, STAY_MS);
    return () => window.clearTimeout(t);
  }, [offer, clear]);
  if (!offer) return null;
  return (
    <div className="undo-toast" role="status" key={offer.key}>
      <span className="grow">{offer.label}</span>
      <button className="btn sm" disabled={busy} onClick={async () => {
        setBusy(true);
        try { await offer.run(); clear(null); } catch (e) { showError(e); } finally { setBusy(false); }
      }}><Undo2 size={14} /> Desfazer</button>
      <button className="btn icon sm ghost" onClick={() => clear(null)} aria-label="Fechar"><X size={14} /></button>
    </div>
  );
}
