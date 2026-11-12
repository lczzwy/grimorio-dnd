/** D&D in Portuguese counts 5 feet as 1.5 m (one square): 30 ft = 9 m. */
export function feetToMeters(ft: number): string {
  return (Math.round((ft / 5) * 1.5 * 10) / 10).toLocaleString('pt-BR');
}

/** The Portuguese books round a pound to half a kilo. */
export function lbToKg(lb: number): string {
  return (Math.round(lb * 0.5 * 10) / 10).toLocaleString('pt-BR');
}
