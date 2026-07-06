// Local, offline data backend — a drop-in replacement for the Dataverse
// connector. Implements the same 5 primitives fitness.ts depends on
// (list/getOne/create/update/remove) against IndexedDB via localForage, so the
// rest of the app is unchanged. Preset content is seeded once on first run.
import localforage from 'localforage';
import seed from '../data/seed.json';

localforage.config({ name: 'fitness-tracker', storeName: 'fit' });

// Primary-key field per entity set (Dataverse plural is irregular for splitday).
const ID_FIELD: Record<string, string> = {
  fit_workoutplans: 'fit_workoutplanid',
  fit_splitdaies: 'fit_splitdayid',
  fit_plannedexercises: 'fit_plannedexerciseid',
  fit_workoutsessions: 'fit_workoutsessionid',
  fit_exerciselogs: 'fit_exerciselogid',
  fit_personalrecords: 'fit_personalrecordid',
  fit_exercisecaches: 'fit_exercisecacheid',
};

type Row = Record<string, unknown>;

const cache: Record<string, Row[]> = {};
let ready: Promise<void> | null = null;

function genId(): string {
  const c = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function table(es: string): Row[] {
  return cache[es] || (cache[es] = []);
}

async function persist(es: string): Promise<void> {
  await localforage.setItem(es, cache[es] || []);
}

// Load every known table into memory once, and seed preset content on first run.
async function ensureReady(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    for (const es of Object.keys(ID_FIELD)) {
      cache[es] = (await localforage.getItem<Row[]>(es)) || [];
    }
    const seeded = await localforage.getItem<boolean>('__seeded__');
    if (!seeded) {
      cache.fit_workoutplans = [seed.plan as Row];
      cache.fit_splitdaies = (seed.splitDays as Row[]).slice();
      cache.fit_plannedexercises = (seed.plannedExercises as Row[]).slice();
      await persist('fit_workoutplans');
      await persist('fit_splitdaies');
      await persist('fit_plannedexercises');
      await localforage.setItem('__seeded__', true);
    }
    // Best-effort: ask the browser to keep our data durable (reduces eviction).
    try { await navigator.storage?.persist?.(); } catch { /* ignore */ }
  })();
  return ready;
}

// --- OData-lite helpers (only the subset fitness.ts actually uses) ---

// A single "<field> eq <value>" predicate (true/false/number/quoted-string/guid).
function parseFilter(filter: string): ((r: Row) => boolean) | null {
  const m = filter.match(/^\s*(\S+)\s+eq\s+(.+?)\s*$/);
  if (!m) return null;
  const field = m[1];
  let raw: string | number | boolean = m[2].trim();
  if (raw === 'true') raw = true;
  else if (raw === 'false') raw = false;
  else if (/^'(.*)'$/.test(raw as string)) raw = (raw as string).slice(1, -1);
  else if (/^-?\d+(\.\d+)?$/.test(raw as string)) raw = Number(raw);
  return (r) => {
    const rv = r[field];
    if (typeof raw === 'string' && typeof rv === 'string') return rv.toLowerCase() === raw.toLowerCase();
    return rv === raw;
  };
}

// "<field> asc|desc"
function applyOrder(rows: Row[], orderby: string): Row[] {
  const parts = orderby.trim().split(/\s+/);
  const field = parts[0];
  const desc = (parts[1] || 'asc').toLowerCase() === 'desc';
  const sorted = [...rows].sort((a, b) => {
    const av = a[field] as string | number | undefined;
    const bv = b[field] as string | number | undefined;
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av < bv) return -1;
    if (av > bv) return 1;
    return 0;
  });
  return desc ? sorted.reverse() : sorted;
}

// Turn "<nav>@odata.bind": "/set(<id>)" into "_<nav>_value": "<id>".
function applyBinds(body: Record<string, unknown>): Row {
  const rec: Row = {};
  for (const [k, v] of Object.entries(body)) {
    const bind = k.match(/^(.*)@odata\.bind$/);
    if (bind) {
      const idMatch = String(v).match(/\(([^)]+)\)/);
      rec[`_${bind[1]}_value`] = idMatch ? idMatch[1] : v;
    } else {
      rec[k] = v;
    }
  }
  return rec;
}

// --- Public API (mirrors the old dataverse.ts) ---

export async function list<T>(
  entitySet: string,
  _select?: string,
  filter?: string,
  orderby?: string,
  top?: number,
): Promise<T[]> {
  await ensureReady();
  let rows = [...table(entitySet)];
  if (filter) {
    const pred = parseFilter(filter);
    if (pred) rows = rows.filter(pred);
  }
  if (orderby) rows = applyOrder(rows, orderby);
  if (top != null) rows = rows.slice(0, top);
  return rows as T[];
}

export async function getById<T>(entitySet: string, id: string): Promise<T | null> {
  await ensureReady();
  const idf = ID_FIELD[entitySet];
  return (table(entitySet).find((r) => r[idf] === id) as T) || null;
}

export async function getOne<T>(entitySet: string, idField: string, id: string, _select?: string): Promise<T | null> {
  await ensureReady();
  const match = table(entitySet).find((r) => String(r[idField]).toLowerCase() === String(id).toLowerCase());
  return (match as T) || null;
}

export async function create(entitySet: string, body: Record<string, unknown>): Promise<string> {
  await ensureReady();
  const idf = ID_FIELD[entitySet] || `${entitySet}id`;
  const rec = applyBinds(body);
  rec[idf] = genId();
  rec.createdon = new Date().toISOString();
  table(entitySet).push(rec);
  await persist(entitySet);
  return rec[idf] as string;
}

export async function update(entitySet: string, id: string, body: Record<string, unknown>): Promise<void> {
  await ensureReady();
  const idf = ID_FIELD[entitySet];
  const t = table(entitySet);
  const i = t.findIndex((r) => r[idf] === id);
  if (i < 0) return;
  t[i] = { ...t[i], ...applyBinds(body), modifiedon: new Date().toISOString() };
  await persist(entitySet);
}

export async function remove(entitySet: string, id: string): Promise<void> {
  await ensureReady();
  const idf = ID_FIELD[entitySet];
  cache[entitySet] = table(entitySet).filter((r) => r[idf] !== id);
  await persist(entitySet);
}

// --- Backup helpers (used by Profile export/import) ---

export async function exportAll(): Promise<string> {
  await ensureReady();
  const dump: Record<string, Row[]> = {};
  for (const es of Object.keys(ID_FIELD)) dump[es] = table(es);
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), tables: dump }, null, 2);
}

export async function importAll(json: string): Promise<void> {
  const parsed = JSON.parse(json) as { tables?: Record<string, Row[]> };
  if (!parsed.tables) throw new Error('Invalid backup file');
  await ensureReady();
  for (const es of Object.keys(ID_FIELD)) {
    if (parsed.tables[es]) {
      cache[es] = parsed.tables[es];
      await persist(es);
    }
  }
}
