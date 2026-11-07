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
  return 'Não deu certo: ' + message;
}

/** Route to return to after logging in, from "#/conta?next=<rota>". */
export function nextRouteFrom(hash: string): string {
  const q = hash.split('?')[1];
  if (!q) return '';
  return decodeURIComponent(new URLSearchParams(q).get('next') || '');
}
