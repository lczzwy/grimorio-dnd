import { useState } from 'react';
import { LogIn, LogOut, UserPlus, Save, KeyRound, MailCheck, Link2, CheckCircle2 } from 'lucide-react';
import { clearNotice, hasDiscord, hasPassword, linkDiscord, requestPasswordReset, setNewPassword, signIn, signInWithDiscord, signOut, signUp, updateDisplayName, useAuth } from '../cloud/auth';
import { nextRouteFrom } from '../cloud/authText';
import { go, useFlash } from '../ui/ui';
import { CloudUpload } from './account/CloudUpload';

/** Discord's mark, drawn inline (used only on the "Entrar com Discord" buttons). */
function DiscordMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1a19.9 19.9 0 0 0 6 3l1.3-2a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.7-3.6-13.7ZM8.5 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm7 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" />
    </svg>
  );
}

const nextRoute = () => nextRouteFrom(window.location.hash);

export function Account() {
  const { user, profile, loading, notice, discordEnabled } = useAuth();
  const flash = useFlash((s) => s.show);
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<null | 'reset' | 'confirm'>(null);
  const [newName, setNewName] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    clearNotice();
    try {
      if (mode === 'reset') {
        await requestPasswordReset(email.trim());
        setSent('reset');
        return;
      }
      if (mode === 'up') {
        const r = await signUp(email.trim(), password, name.trim() || email.split('@')[0]);
        if (r === 'confirm') { setSent('confirm'); return; }
      } else await signIn(email.trim(), password);
      flash(mode === 'up' ? 'Conta criada!' : 'Bem-vindo de volta!');
      const next = nextRoute();
      if (next) go(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const discord = async () => {
    setError('');
    try { await signInWithDiscord(nextRoute() || 'campanhas'); } catch (err) { setError((err as Error).message); }
  };

  if (loading) return <main className="page"><div className="empty">Carregando…</div></main>;

  if (user) {
    return (
      <main className="page" style={{ maxWidth: 640 }}>
        <h1 style={{ marginBottom: 16 }}>Sua conta</h1>
        {notice && <div className="tag bad" style={{ whiteSpace: 'normal', marginBottom: 12 }}>{notice}</div>}
        <div className="panel col">
          <div className="small muted">Conectado como <b>{user.email}</b></div>
          <label className="field">Nome que a mesa vê
            <div className="row">
              <input className="input" value={newName ?? profile?.display_name ?? ''} onChange={(e) => setNewName(e.target.value)} />
              <button className="btn" disabled={newName == null || !newName.trim()} onClick={async () => { try { await updateDisplayName(newName!.trim()); setNewName(null); flash('Nome salvo'); } catch (e) { alert((e as Error).message); } }}><Save size={15} /> Salvar</button>
            </div>
          </label>
          <div className="row">
            <button className="btn primary" onClick={() => go('campanhas')}>Minhas campanhas</button>
            <span className="spacer" />
            <button className="btn danger" onClick={() => signOut()}><LogOut size={15} /> Sair</button>
          </div>
        </div>
        <SecurityPanel />
        <CloudUpload />
      </main>
    );
  }

  if (sent) {
    return (
      <main className="page" style={{ maxWidth: 480 }}>
        <div className="panel col" style={{ alignItems: 'flex-start' }}>
          <h1 style={{ margin: 0 }}><MailCheck size={22} /> Confira seu e-mail</h1>
          <p className="muted" style={{ margin: 0 }}>
            {sent === 'reset'
              ? <>Se existir uma conta com <b>{email}</b>, enviamos um link para criar uma senha nova. Ele vale por 1 hora; abra no mesmo aparelho de preferência.</>
              : <>Enviamos um link de confirmação para <b>{email}</b>. Clique nele para ativar a conta e voltar ao site já conectado.</>}
          </p>
          <p className="tiny muted" style={{ margin: 0 }}>Não chegou? Veja a caixa de spam. O envio é limitado a poucos e-mails por hora.</p>
          <button className="btn" onClick={() => { setSent(null); setMode('in'); }}>Voltar para entrar</button>
        </div>
      </main>
    );
  }

  return (
    <main className="page" style={{ maxWidth: 480 }}>
      <h1 style={{ marginBottom: 6 }}>{mode === 'in' ? 'Entrar' : mode === 'up' ? 'Criar conta' : 'Esqueci minha senha'}</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {mode === 'reset'
          ? 'Digite o e-mail da sua conta. Mandamos um link para você criar uma senha nova.'
          : 'Com uma conta, suas fichas ficam salvas online e você joga em campanhas com o mestre. Sem conta, o site funciona só neste navegador.'}
      </p>
      {notice && <div className="tag bad" style={{ whiteSpace: 'normal', marginBottom: 12 }}>{notice}</div>}
      <form className="panel col" onSubmit={submit}>
        {mode !== 'reset' && (
          <>
            {discordEnabled && (
              <>
                <button type="button" className="btn discord" onClick={discord}><DiscordMark /> Entrar com Discord</button>
                <div className="or-line"><span>ou com e-mail</span></div>
              </>
            )}
            <div className="seg" style={{ alignSelf: 'flex-start' }}>
              <button type="button" className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>Entrar</button>
              <button type="button" className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>Criar conta</button>
            </div>
          </>
        )}
        {mode === 'up' && <label className="field">Seu nome (aparece para a mesa)<input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Arthur" /></label>}
        <label className="field">E-mail<input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        {mode !== 'reset' && (
          <label className="field">Senha<input className="input" type="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        )}
        {error && <div className="tag bad" style={{ whiteSpace: 'normal' }}>{error}</div>}
        <button className="btn primary" disabled={busy}>
          {mode === 'in' ? <><LogIn size={15} /> Entrar</> : mode === 'up' ? <><UserPlus size={15} /> Criar conta</> : <><KeyRound size={15} /> Enviar link</>}
        </button>
        {mode === 'in' && <button type="button" className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => { setMode('reset'); setError(''); }}>Esqueci minha senha</button>}
        {mode === 'reset' && <button type="button" className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => { setMode('in'); setError(''); }}>Voltar para entrar</button>}
      </form>
    </main>
  );
}

/** Logged-in account: change the password and connect Discord. */
function SecurityPanel() {
  const user = useAuth((s) => s.user);
  const discordEnabled = useAuth((s) => s.discordEnabled);
  const flash = useFlash((s) => s.show);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const withPassword = hasPassword(user);
  const withDiscord = hasDiscord(user);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (pw !== pw2) return setError('As duas senhas não são iguais.');
    setBusy(true);
    try { await setNewPassword(pw); setPw(''); setPw2(''); flash('Senha alterada'); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="panel col" style={{ marginTop: 16 }}>
      <h3 style={{ margin: 0 }}><KeyRound size={16} /> Segurança</h3>
      <div className="row wrap" style={{ gap: 8 }}>
        {withDiscord
          ? <span className="tag good"><CheckCircle2 size={12} /> Discord conectado: você pode entrar pelos dois jeitos</span>
          : discordEnabled && <button className="btn sm discord" onClick={() => linkDiscord().catch((e) => setError((e as Error).message))}><Link2 size={14} /> Conectar meu Discord a esta conta</button>}
      </div>
      <form className="col" onSubmit={save} style={{ gap: 8 }}>
        <b className="small">{withPassword ? 'Trocar a senha' : 'Criar uma senha (para entrar também por e-mail)'}</b>
        <div className="row wrap" style={{ gap: 8 }}>
          <input className="input grow" type="password" autoComplete="new-password" minLength={6} required placeholder="Senha nova" value={pw} onChange={(e) => setPw(e.target.value)} />
          <input className="input grow" type="password" autoComplete="new-password" minLength={6} required placeholder="Repita a senha" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          <button className="btn" disabled={busy}>Salvar senha</button>
        </div>
      </form>
      {error && <div className="tag bad" style={{ whiteSpace: 'normal' }}>{error}</div>}
    </div>
  );
}

/** #/conta/nova-senha — opened from the reset e-mail (the link already signs the person in). */
export function NewPassword() {
  const { user, loading } = useAuth();
  const flash = useFlash((s) => s.show);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <main className="page"><div className="empty">Carregando…</div></main>;
  if (!user) {
    return (
      <main className="page" style={{ maxWidth: 480 }}>
        <div className="panel col">
          <h1 style={{ margin: 0 }}>Link inválido</h1>
          <p className="muted" style={{ margin: 0 }}>Esse link de senha expirou ou já foi usado. Peça outro na tela de entrar.</p>
          <button className="btn primary" onClick={() => go('conta')}>Ir para entrar</button>
        </div>
      </main>
    );
  }
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (pw !== pw2) return setError('As duas senhas não são iguais.');
    setBusy(true);
    try { await setNewPassword(pw); flash('Senha nova salva. Você já está conectado.'); go('campanhas'); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <main className="page" style={{ maxWidth: 480 }}>
      <h1 style={{ marginBottom: 6 }}>Criar senha nova</h1>
      <p className="muted" style={{ marginTop: 0 }}>Conta: <b>{user.email}</b></p>
      <form className="panel col" onSubmit={save}>
        <label className="field">Senha nova<input className="input" type="password" autoComplete="new-password" minLength={6} required value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        <label className="field">Repita a senha<input className="input" type="password" autoComplete="new-password" minLength={6} required value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
        {error && <div className="tag bad" style={{ whiteSpace: 'normal' }}>{error}</div>}
        <button className="btn primary" disabled={busy}><KeyRound size={15} /> Salvar senha</button>
      </form>
    </main>
  );
}
