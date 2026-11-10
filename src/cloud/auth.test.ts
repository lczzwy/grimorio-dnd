import { describe, expect, it } from 'vitest';
import { authErrorPt, authRedirectError, nextRouteFrom, siteUrl } from './authText';

describe('auth messages', () => {
  it('translates the common Supabase errors', () => {
    expect(authErrorPt('Invalid login credentials')).toBe('E-mail ou senha incorretos.');
    expect(authErrorPt('User already registered')).toBe('Já existe uma conta com esse e-mail. Use "Entrar".');
    expect(authErrorPt('Password should be at least 6 characters.')).toBe('A senha precisa ter pelo menos 6 caracteres.');
    expect(authErrorPt('Email not confirmed')).toMatch(/confirm/i);
    expect(authErrorPt('Unable to validate email address: invalid format')).toBe('E-mail inválido.');
    expect(authErrorPt('Failed to fetch')).toMatch(/conexão/);
    expect(authErrorPt('something else')).toBe('Não deu certo: something else');
  });

  it('explains password and Discord problems', () => {
    expect(authErrorPt('New password should be different from the old password.')).toBe('A nova senha precisa ser diferente da atual.');
    expect(authErrorPt('Identity is already linked to another user')).toMatch(/Discord já está ligado/);
    expect(authErrorPt('Manual linking is disabled')).toMatch(/Manual linking/);
    expect(authErrorPt('Error sending recovery email')).toMatch(/servidor de e-mail recusou/);
    expect(authErrorPt('Unsupported provider: provider is not enabled')).toMatch(/Discord ainda não foi ativado/);
  });

  it('reads an auth error left in the address by a failed link', () => {
    expect(authRedirectError('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')).toBe('Esse link expirou ou já foi usado. Peça um novo.');
    expect(authRedirectError('#error=access_denied&error_description=The+user+denied+the+request')).toBe('O acesso foi cancelado.');
    expect(authRedirectError('#/campanhas')).toBeNull();
    expect(authRedirectError('')).toBeNull();
  });

  it('builds the address to come back to', () => {
    expect(siteUrl({ origin: 'https://lczzwy.github.io', pathname: '/grimorio-dnd/' })).toBe('https://lczzwy.github.io/grimorio-dnd/');
  });

  it('reads the ?next= route after login', () => {
    expect(nextRouteFrom('#/conta?next=convite%2Fabc123')).toBe('convite/abc123');
    expect(nextRouteFrom('#/conta')).toBe('');
  });
});
