import { Component, type ReactNode } from 'react';
import { reportError } from '../cloud/errorLog';

/** Shows a recoverable error screen instead of a blank page, with a way to back up saved data. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    reportError(error);
  }

  backup = () => {
    const raw = localStorage.getItem('grimorio-v1') || '{}';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    a.download = 'grimorio-backup.json';
    a.click();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="page" style={{ maxWidth: 640 }}>
        <div className="panel col" style={{ marginTop: 40 }}>
          <h2>Algo deu errado nesta tela</h2>
          <p className="muted m0">Suas fichas continuam salvas neste navegador. O erro já foi registrado para quem cuida do site. Tente voltar ao início; se continuar, baixe um backup das fichas.</p>
          <pre className="small" style={{ whiteSpace: 'pre-wrap', background: 'var(--bg-2)', padding: 10, borderRadius: 8, color: 'var(--bad)' }}>{this.state.error.message}</pre>
          <div className="row wrap">
            <button className="btn primary" onClick={() => { this.setState({ error: undefined }); window.location.hash = '#/'; }}>Voltar ao início</button>
            <button className="btn" onClick={() => window.location.reload()}>Recarregar</button>
            <button className="btn" onClick={this.backup}>Baixar backup das fichas</button>
          </div>
        </div>
      </main>
    );
  }
}
