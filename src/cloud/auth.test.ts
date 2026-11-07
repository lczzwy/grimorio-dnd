import { describe, expect, it } from 'vitest';
import { authErrorPt, nextRouteFrom } from './authText';

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

  it('reads the ?next= route after login', () => {
    expect(nextRouteFrom('#/conta?next=convite%2Fabc123')).toBe('convite/abc123');
    expect(nextRouteFrom('#/conta')).toBe('');
  });
});
