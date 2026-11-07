import { createClient } from '@supabase/supabase-js';

// The publishable key is meant to ship in the browser: access is enforced by RLS in supabase/schema.sql.
export const SUPABASE_URL = 'https://lnvrptqcjcmvsmeprkfk.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_HN9cHvf4pyr2euRV5hkBBA_tStDi1z8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'grimorio-auth' },
});
