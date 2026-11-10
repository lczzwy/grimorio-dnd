/** Supabase Auth error → message in Portuguese. */
export function authErrorPt(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('already registered')) return 'Já existe uma conta com esse e-mail. Use "Entrar".';
  if (m.includes('at least 6')) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (m.includes('email not confirmed')) return 'E-mail ainda não confirmado. Peça ao dono do site para desligar "Confirm email" no Supabase.';
  if (m.includes('invalid format') || m.includes('invalid email')) return 'E-mail inválido.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  if (m.includes('rate limit')) return 'Muitas tentativas seguidas. Espere um pouco e tente de novo.';
  if (m.includes('error sending')) return 'O servidor de e-mail recusou o envio. Confira o SMTP no Supabase (veja docs/CONFIGURAR-LOGIN.md) ou entre com o Discord.';
  if (m.includes('different from the old')) return 'A nova senha precisa ser diferente da atual.';
  if (m.includes('identity_already_exists') || m.includes('already linked')) return 'Esse Discord já está ligado a outra conta do Grimório.';
  if (m.includes('manual linking')) return 'Conectar o Discord a uma conta existente ainda não foi ativado. Peça ao dono do site para ligar "Manual linking" no Supabase.';
  if (m.includes('provider is not enabled') || m.includes('unsupported provider')) return 'O login com Discord ainda não foi ativado no Supabase.';
  if (m.includes('invalid or has expired') || m.includes('otp_expired') || m.includes('expired')) return 'Esse link expirou ou já foi usado. Peça um novo.';
  if (m.includes('access_denied')) return 'O acesso foi cancelado.';
  return 'Não deu certo: ' + message;
}

/** The site address the auth e-mails and Discord must send people back to (no hash). */
export function siteUrl(loc: { origin: string; pathname: string } = window.location) {
  return loc.origin + loc.pathname;
}

/**
 * When an auth link fails (expired reset link, Discord login cancelled), Supabase sends people back with
 * "#error=…&error_description=…" in the address. Returns the reason in Portuguese, or null.
 */
export function authRedirectError(hash: string): string | null {
  const h = hash.replace(/^#\/?/, '');
  if (!/(^|&)error(_description|_code)?=/.test(h)) return null;
  const p = new URLSearchParams(h);
  return authErrorPt([p.get('error_code'), p.get('error_description'), p.get('error')].filter(Boolean).join(' '));
}

/** Route to return to after logging in, from "#/conta?next=<rota>". */
export function nextRouteFrom(hash: string): string {
  const q = hash.split('?')[1];
  if (!q) return '';
  return decodeURIComponent(new URLSearchParams(q).get('next') || '');
}
