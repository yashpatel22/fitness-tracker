// Equipment domain: canonical list + "what I own" preference (localStorage).
export const EQUIPMENT = [
  'Barbell', 'Dumbbell', 'Cable', 'Machine', 'Body Only', 'Bands', 'Kettlebells', 'E-Z Curl Bar',
];

const ALIAS: Record<string, string> = {
  'barbell': 'Barbell',
  'dumbbell': 'Dumbbell',
  'cable': 'Cable',
  'machine': 'Machine',
  'body only': 'Body Only',
  'bodyweight': 'Body Only',
  'bands': 'Bands',
  'kettlebells': 'Kettlebells',
  'kettlebell': 'Kettlebells',
  'e-z curl bar': 'E-Z Curl Bar',
  'ez curl bar': 'E-Z Curl Bar',
};

// Normalize a stored equipment string to a canonical label.
export function normEquip(s?: string): string {
  if (!s) return '';
  return ALIAS[s.trim().toLowerCase()] || s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Distinct, canonical equipment needed for a set of planned exercises.
export function distinctEquipment(items: { fit_equipment?: string }[]): string[] {
  const seen = new Set<string>();
  for (const it of items) {
    const e = normEquip(it.fit_equipment);
    if (e) seen.add(e);
  }
  // keep canonical order
  return EQUIPMENT.filter((e) => seen.has(e));
}

const KEY = 'fit_equipment_have';

export function getEquipmentHave(): string[] {
  try {
    const v = localStorage.getItem(KEY);
    if (v) return JSON.parse(v) as string[];
  } catch { /* ignore */ }
  return [...EQUIPMENT]; // default: assume you own everything until you customize
}

export function setEquipmentHave(list: string[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}
