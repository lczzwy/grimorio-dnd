import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import { supabase, SUPABASE_KEY, SUPABASE_URL } from './client';
import { authErrorPt, authRedirectError, siteUrl } from './authText';
import { go } from '../ui/ui';

export interface Profile { id: string; display_name: string }

interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /** a message for the account page (failed reset link, cancelled Discord login…) */
  notice?: string;
  /** whether "Entrar com Discord" is switched on in Supabase (unknown until checked) */
  discordEnabled?: boolean;
}

export const useAuth = create<AuthState>(() => ({ user: null, profile: null, loading: true }));

async function loadProfile(user: User | null) {
  if (!user) return useAuth.setState({ user: null, profile: null, loading: false });
  const { data } = await supabase.from('profiles').select('id, display_name').eq('id', user.id).maybeSingle();
  useAuth.setState({ user, profile: data ?? { id: user.id, display_name: (user.user_metadata?.display_name as string) || user.email?.split('@')[0] || '' }, loading: false });
}

/** Where to go after coming back from Discord (kept across the redirect). */
const AFTER_LOGIN = 'grimorio-after-login';

let started = false;
/** Restores the saved session and follows login/logout. Call once at startup. */
export function initAuth() {
  if (started) return;
  started = true;
  // a failed e-mail link or a cancelled Discord login comes back as "#error=…"
  const failed = authRedirectError(window.location.hash);
  if (failed) {
    useAuth.setState({ notice: failed });
    go('conta');
  }
  supabase.auth.getSession().then(({ data }) => loadProfile(data.session?.user ?? null));
  // public settings: only offer Discord once it is enabled (otherwise the button opens an error page)
  fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } })
    .then((r) => r.json())
    .then((j: { external?: Record<string, boolean> }) => useAuth.setState({ discordEnabled: !!j.external?.discord }))
    .catch(() => undefined);
  supabase.auth.onAuthStateChange((event, session) => {
    const prev = useAuth.getState().user?.id;
    if (prev !== session?.user?.id || event === 'USER_UPDATED') loadProfile(session?.user ?? null);
    // the link from "esqueci minha senha": ask for the new password
    if (event === 'PASSWORD_RECOVERY') return go('conta/nova-senha');
    if (event === 'SIGNED_IN') {
      let next: string | null = null;
      try { next = sessionStorage.getItem(AFTER_LOGIN); sessionStorage.removeItem(AFTER_LOGIN); } catch { /* private mode */ }
      if (next) go(next);
    }
  });
}

export function clearNotice() {
  useAuth.setState({ notice: undefined });
}

const fail = (e: { message: string } | null) => {
  if (e) throw new Error(authErrorPt(e.message));
};

/** Creates an account. Returns 'confirm' when Supabase asks the person to confirm the e-mail first. */
export async function signUp(email: string, password: string, displayName: string): Promise<'ok' | 'confirm'> {
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName }, emailRedirectTo: siteUrl() } });
  fail(error);
  return data.session ? 'ok' : 'confirm';
}

/** Sends the "esqueci minha senha" e-mail. The link brings the person back to #/conta/nova-senha. */
export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() });
  fail(error);
}

/** Sets a new password for the signed-in account (also used after the reset link). */
export async function setNewPassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  fail(error);
}

/** Signs in with Discord; after coming back, the site opens `next` (e.g. an invite). */
export async function signInWithDiscord(next = 'campanhas') {
  try { sessionStorage.setItem(AFTER_LOGIN, next); } catch { /* private mode */ }
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: siteUrl() } });
  fail(error);
}

/** Connects Discord to the account already signed in, so both ways open the same account. */
export async function linkDiscord() {
  try { sessionStorage.setItem(AFTER_LOGIN, 'conta'); } catch { /* private mode */ }
  const { error } = await supabase.auth.linkIdentity({ provider: 'discord', options: { redirectTo: siteUrl() } });
  fail(error);
}

export const hasDiscord = (u: User | null) => !!u?.identities?.some((i) => i.provider === 'discord');
export const hasPassword = (u: User | null) => !!u?.identities?.some((i) => i.provider === 'email');

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  fail(error);
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function updateDisplayName(name: string) {
  const user = useAuth.getState().user;
  if (!user) return;
  const { error } = await supabase.from('profiles').update({ display_name: name }).eq('id', user.id);
  fail(error);
  useAuth.setState({ profile: { id: user.id, display_name: name } });
}
