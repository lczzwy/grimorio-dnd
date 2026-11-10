import type { CompanionFile } from './companion';

/** Cheap check kept apart from the importer, so the importer itself loads only when a file is used. */
export const isCompanionFile = (x: unknown): x is CompanionFile =>
  !!x && typeof x === 'object' && (x as CompanionFile).jsonType === 'character' && 'strength' in (x as object) && ('jobs' in (x as object) || 'allRequiredClasses' in (x as object));
