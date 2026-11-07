import { describe, expect, it } from 'vitest';
import { campaignErrorPt, inviteLink } from './campaignText';

describe('campaign helpers', () => {
  it('builds the invite link from the current page', () => {
    expect(inviteLink('abc123', { origin: 'https://lczzwy.github.io', pathname: '/grimorio-dnd/' })).toBe('https://lczzwy.github.io/grimorio-dnd/#/convite/abc123');
  });

  it('translates database errors', () => {
    expect(campaignErrorPt('invalid_invite')).toBe('Convite inválido ou expirado. Peça um link novo ao mestre.');
    expect(campaignErrorPt('ERROR: edition_mismatch')).toBe('Esse personagem é de outra edição. Escolha um da mesma edição da campanha.');
    expect(campaignErrorPt('not_owner')).toBe('Você só pode usar personagens seus.');
    expect(campaignErrorPt('forbidden')).toBe('Só o mestre da campanha pode fazer isso.');
    expect(campaignErrorPt('not_authenticated')).toBe('Entre na sua conta primeiro.');
    expect(campaignErrorPt('Failed to fetch')).toMatch(/conexão/);
  });
});
