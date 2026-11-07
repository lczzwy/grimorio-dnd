export type HpBand = 'ileso' | 'ferido' | 'sangrando' | 'quase morto' | 'caido';

/** Same thresholds as the SQL hp_band() function. */
export function hpBand(cur: number, max: number): HpBand {
  if (cur <= 0) return 'caido';
  if (max <= 0 || cur >= max) return 'ileso';
  if (cur * 2 >= max) return 'ferido';
  if (cur * 4 >= max) return 'sangrando';
  return 'quase morto';
}

export const BAND_LABEL: Record<HpBand, string> = { ileso: 'Ileso', ferido: 'Ferido', sangrando: 'Sangrando', 'quase morto': 'Quase morto', caido: 'Caído' };
export const BAND_COLOR: Record<HpBand, string> = { ileso: 'var(--good)', ferido: '#e2b33b', sangrando: '#f2a541', 'quase morto': 'var(--bad)', caido: 'var(--faint)' };
