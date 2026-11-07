import { useState } from 'react';
import { CloudUpload as CloudIcon, Check } from 'lucide-react';
import { useApp } from '../../store';
import { uploadAll } from '../../cloud/sync';
import { useFlash } from '../../ui/ui';

/** Offers to send the characters that only exist in this browser to the account. */
export function CloudUpload() {
  const chars = useApp((s) => s.characters);
  const flash = useFlash((s) => s.show);
  const [busy, setBusy] = useState(false);
  const localOnly = chars.filter((c) => !c.cloud);
  const synced = chars.length - localOnly.length;

  return (
    <div className="panel col" style={{ marginTop: 16 }}>
      <h3>☁️ Fichas na nuvem</h3>
      <div className="small muted">{synced} sincronizada(s) com a sua conta · {localOnly.length} só neste navegador</div>
      {localOnly.length > 0 ? (
        <>
          <div className="small">{localOnly.map((c) => c.name || 'Sem nome').join(', ')}</div>
          <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              const n = await uploadAll();
              flash(`${n} ficha(s) enviada(s) para a nuvem!`);
            } catch (e) {
              alert('Não consegui enviar agora: ' + (e as Error).message + '\nVou tentar de novo sozinho quando a conexão voltar.');
            } finally {
              setBusy(false);
            }
          }}><CloudIcon size={15} /> Enviar {localOnly.length} ficha(s) para a nuvem</button>
        </>
      ) : (
        <div className="small" style={{ color: 'var(--good)' }}><Check size={14} /> Tudo sincronizado. Fichas novas criadas com a conta aberta já vão para a nuvem.</div>
      )}
    </div>
  );
}
