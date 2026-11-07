import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import { supabase } from './client';
import { authErrorPt } from './authText';

export interface Profile { id: string; display_name: string }

interface AuthState { user: User | null; profile: Profile | null; loading: boolean }

export const useAuth = create<AuthState>(() => ({ user: null, profile: null, loading: true }));

async function loadProfile(user: User | null) {
  if (!user) return useAuth.setState({ user: null, profile: null, loading: false });
  const { data } = await supabase.from('profiles').select('id, display_name').eq('id', user.id).maybeSingle();
  useAuth.setState({ user, profile: data ?? { id: user.id, display_name: (user.user_metadata?.display_name as string) || user.email?.split('@')[0] || '' }, loading: false });
}

let started = false;
/** Restores the saved session and follows login/logout. Call once at startup. */
export function initAuth() {
  if (started) return;
  started = true;
  supabase.auth.getSession().then(({ data }) => loadProfile(data.session?.user ?? null));
  supabase.auth.onAuthStateChange((_event, session) => {
    const prev = useAuth.getState().user?.id;
    if (prev !== session?.user?.id) loadProfile(session?.user ?? null);
  });
}

const fail = (e: { message: string } | null) => {
  if (e) throw new Error(authErrorPt(e.message));
};

export async function signUp(email: string, password: string, displayName: string) {
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
  fail(error);
  if (!data.session) throw new Error(authErrorPt('Email not confirmed'));
}

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
