import { useApp } from '../store';
import { Download, Upload, HardDrive } from 'lucide-react';
import { download, go, pickFile, useFlash } from '../ui/ui';
import { isBackupFile, makeBackup } from '../data/backup';
import { alertBox } from '../ui/dialogs';

export function Home() {
  const chars = useApp((s) => s.characters);
  const n14 = chars.filter((c) => c.edition === '2014').length;
  const n24 = chars.filter((c) => c.edition === '2024').length;
  return (
    <main className="page">
      <section className="hero grim">
        <div className="ornament">✦ Diário de bordo da tripulação ✦</div>
        <h1>Grimório</h1>
        <p>Entre a bordo. Cada edição é uma rota pelas estrelas, com suas próprias regras, tripulantes e mundos.</p>
      </section>
      <div className="portals">
        <button className="portal p2014" onClick={() => go('2014')}>
          <span className="art" aria-hidden />
          <span className="count tag gold">{n14} personagem{n14 === 1 ? '' : 's'}</span>
          <div className="tiny" style={{ color: '#d9a08f' }}>Carta I · Regras clássicas</div>
          <h2>D&D 2014</h2>
          <p>A 5ª edição original. Bônus de atributo vêm da raça, subraças, antecedentes com característica própria.</p>
          <div className="meta">
            <span className="tag">319 magias</span><span className="tag">12 classes</span><span className="tag">9 raças</span><span className="tag">SRD 5.1</span>
          </div>
        </button>
        <button className="portal p2024" onClick={() => go('2024')}>
          <span className="art" aria-hidden />
          <span className="count tag gold">{n24} personagem{n24 === 1 ? '' : 's'}</span>
          <div className="tiny" style={{ color: '#9cc4b8' }}>Carta II · Regras revisadas</div>
          <h2>D&D 2024</h2>
          <p>O novo Livro do Jogador. Atributos e talento de origem vêm do antecedente, maestria de armas, espécies.</p>
          <div className="meta">
            <span className="tag">339 magias</span><span className="tag">12 classes</span><span className="tag">9 espécies</span><span className="tag">SRD 5.2</span>
          </div>
        </button>
      </div>
      <BackupPanel />
      <p className="center small faint" style={{ marginTop: 24, maxWidth: 680, marginInline: 'auto' }}>
        Conteúdo de regras do System Reference Document 5.1 e 5.2 da Wizards of the Coast LLC, sob licença CC-BY-4.0. Dados via 5e-bits/5e-database. Este site não é afiliado à Wizards of the Coast.
        Com uma conta, suas fichas ficam salvas online; sem conta, só neste navegador (use o backup).
      </p>
      <p className="center credit" style={{ maxWidth: 680, marginInline: 'auto' }}>
        Gravuras em domínio público (Wikimedia Commons): gravura de Flammarion (1888); Gustave Doré, A Balada do Velho Marinheiro; Andreas Cellarius, Harmonia Macrocosmica (1660).
      </p>
    </main>
  );
}

function BackupPanel() {
  const { characters, homebrew, lastBackupAt, markBackup, restore } = useApp();
  const flash = useFlash((s) => s.show);
  const hbCount = Object.values(homebrew).reduce((s, h) => s + Object.values(h).reduce((t, a) => t + (a?.length || 0), 0), 0);
  const days = lastBackupAt ? Math.floor((Date.now() - lastBackupAt) / 86400000) : null;
  const stale = characters.length > 0 && (days === null || days >= 7);

  const save = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    download(`grimorio-backup-${stamp}.json`, makeBackup(characters, homebrew));
    markBackup();
    flash('Backup baixado!');
  };
  const load = async () => {
    const f = await pickFile();
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!isBackupFile(data)) {
        void alertBox('Esse arquivo não é um backup do Grimório. Para fichas avulsas, use "Importar ficha" dentro da mesa.');
        return;
      }
      const r = restore(data);
      void alertBox(`Backup restaurado.\n\n• ${r.added} personagem(ns) novo(s)\n• ${r.updated} atualizado(s) com a versão do backup\n• ${r.kept} mantido(s) (a versão daqui era mais recente)\n\nNada foi apagado.`);
    } catch (e) {
      void alertBox('Não consegui ler o backup: ' + (e as Error).message);
    }
  };

  return (
    <section className="panel row wrap" style={{ marginTop: 28, gap: 14, borderColor: stale ? 'var(--warn)' : undefined }}>
      <div className="grow" style={{ minWidth: 220 }}>
        <h3 style={{ marginBottom: 4 }}><HardDrive size={17} className="ic-inline" /> Backup</h3>
        <div className="small muted">
          {characters.length} personagem(ns) · {hbCount} item(ns) de homebrew ·{' '}
          {days === null ? 'nenhum backup feito ainda' : days === 0 ? 'último backup hoje' : `último backup há ${days} dia(s)`}
        </div>
        {stale && <div className="small" style={{ color: 'var(--warn)', marginTop: 4 }}>Suas fichas só existem neste navegador. Baixe um backup de vez em quando.</div>}
      </div>
      <button className="btn" onClick={load}><Upload size={16} /> Restaurar backup</button>
      <button className="btn primary" disabled={!characters.length && !hbCount} onClick={save}><Download size={16} /> Baixar backup</button>
    </section>
  );
}
