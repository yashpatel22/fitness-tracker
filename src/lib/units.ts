// Weight unit helpers. Storage is ALWAYS native lb; UI can display kg.
const LB_PER_KG = 2.2046226218;

export type Unit = 'lb' | 'kg';

const KEY = 'fit_unit_pref';

export function getUnit(): Unit {
  return (localStorage.getItem(KEY) as Unit) || 'lb';
}

export function setUnit(u: Unit): void {
  localStorage.setItem(KEY, u);
}

// Convert a stored lb value to the display unit.
export function fromLb(lb: number, unit: Unit): number {
  if (unit === 'kg') return Math.round((lb / LB_PER_KG) * 10) / 10;
  return Math.round(lb * 10) / 10;
}

// Convert a user-entered display value back to lb for storage.
export function toLb(value: number, unit: Unit): number {
  if (unit === 'kg') return Math.round(value * LB_PER_KG * 10) / 10;
  return value;
}

export function formatWeight(lb: number | undefined, unit: Unit): string {
  if (lb == null) return '—';
  return `${fromLb(lb, unit)} ${unit}`;
}
