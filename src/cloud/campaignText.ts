export function inviteLink(code: string, loc: { origin: string; pathname: string } = window.location) {
  return `${loc.origin}${loc.pathname}#/convite/${code}`;
}

/** Database / network error → message in Portuguese. */
export function campaignErrorPt(message: string): string {
  if (message.includes('invalid_invite')) return 'Convite inválido ou expirado. Peça um link novo ao mestre.';
  if (message.includes('edition_mismatch')) return 'Esse personagem é de outra edição. Escolha um da mesma edição da campanha.';
  if (message.includes('not_owner')) return 'Você só pode usar personagens seus.';
  if (message.includes('forbidden')) return 'Só o mestre da campanha pode fazer isso.';
  if (message.includes('not_authenticated')) return 'Entre na sua conta primeiro.';
  if (/failed to fetch|network/i.test(message)) return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  return 'Não deu certo: ' + message;
}
