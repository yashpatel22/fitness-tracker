// Exercise catalog — bundled INTO the app with images embedded as base64 data: URIs.
// The Power Apps host corrupts binary assets in transit, but data: URIs decode fine
// (img-src 'self' data:). No runtime fetch, no external images.
import bundled from '../data/exercises.bundled.json';

export interface Exercise {
  id: string;
  name: string;
  force?: string | null;
  level?: string;
  mechanic?: string | null;
  equipment?: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  images: string[]; // base64 data: URIs
}

const DATA = bundled as unknown as Exercise[];
const BY_ID = new Map(DATA.map((e) => [e.id, e]));

// Async signature kept for call-site compatibility; resolves instantly from the bundle.
export async function loadExercises(): Promise<Exercise[]> {
  return DATA;
}

export function exerciseImage(e: Exercise, idx = 0): string {
  return e.images[idx] || '';
}

// data: URI for a planned/logged exercise by its external id (or '' if not bundled).
export function plannedImage(externalId?: string, idx = 0): string {
  if (!externalId) return '';
  return BY_ID.get(externalId)?.images[idx] || '';
}

export function getExerciseByIdSync(id: string): Exercise | undefined {
  return BY_ID.get(id);
}

export async function getExerciseById(id: string): Promise<Exercise | undefined> {
  return BY_ID.get(id);
}

export function titleCase(s?: string): string {
  return (s || '').replace(/\b\w/g, (c) => c.toUpperCase());
}
