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

// Bump when the seeded OOB preset content changes. On upgrade we reconcile the
// out-of-the-box presets to match seed.json WITHOUT touching the user's custom
// presets, sessions, set logs, PRs, or preferences.
const SEED_VERSION = 3;
// Every split-day GUID that ships in the current seed = the OOB preset set.
const SEED_DAY_IDS = new Set((seed.splitDays as { fit_splitdayid: string }[]).map((d) => d.fit_splitdayid));
// OOB split-day GUIDs that existed in an earlier seed but have since been
// removed/merged (v1 shipped a duplicate "Arms" preset). Purge these on upgrade.
const DEPRECATED_DAY_IDS = new Set<string>(['f8d4cabe-1973-f111-ab0f-6045bd049ce0']);

// Reconcile the OOB presets to the current seed. Custom presets (GUIDs not in the
// seed / deprecated sets) and ALL history are preserved; only OOB split days and
// their planned exercises are replaced. Safe because set logs snapshot the
// exercise (no FK to planned-exercise rows) and sessions link split days by GUID.
async function reseedOOBPresets(): Promise<void> {
  const idOf = (r: Row) => r.fit_splitdayid as string;
  const managed = new Set<string>([...SEED_DAY_IDS, ...DEPRECATED_DAY_IDS]);

  const customDays = table('fit_splitdaies').filter((d) => !managed.has(idOf(d)));
  cache.fit_splitdaies = customDays.concat((seed.splitDays as Row[]).map((d) => ({ ...d })));

  const customEx = table('fit_plannedexercises').filter(
    (e) => !managed.has((e._fit_splitday_value as string) || ''),
  );
  cache.fit_plannedexercises = customEx.concat((seed.plannedExercises as Row[]).map((e) => ({ ...e })));

  await persist('fit_splitdaies');
  await persist('fit_plannedexercises');
}

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
      await localforage.setItem('__seed_ver__', SEED_VERSION);
    } else {
      const ver = (await localforage.getItem<number>('__seed_ver__')) ?? 1;
      if (ver < SEED_VERSION) {
        await reseedOOBPresets();
        await localforage.setItem('__seed_ver__', SEED_VERSION);
      }
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

// --- Backup helpers (used by Profile export/import + weekly auto-backup) ---

// Preferences live in localStorage (not IndexedDB), so include them explicitly
// to make a backup a complete snapshot of the app.
const PREF_KEYS = ['fit_unit_pref', 'fit_theme', 'fit_equipment_have', 'fit_display_name'];

export async function exportAll(): Promise<string> {
  await ensureReady();
  const dump: Record<string, Row[]> = {};
  for (const es of Object.keys(ID_FIELD)) dump[es] = table(es);
  const prefs: Record<string, string> = {};
  for (const k of PREF_KEYS) {
    const v = localStorage.getItem(k);
    if (v != null) prefs[k] = v;
  }
  return JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), tables: dump, prefs }, null, 2);
}

export async function importAll(json: string): Promise<void> {
  const parsed = JSON.parse(json) as { tables?: Record<string, Row[]>; prefs?: Record<string, string> };
  if (!parsed.tables) throw new Error('Invalid backup file');
  await ensureReady();
  for (const es of Object.keys(ID_FIELD)) {
    if (parsed.tables[es]) {
      cache[es] = parsed.tables[es];
      await persist(es);
    }
  }
  if (parsed.prefs) {
    for (const [k, v] of Object.entries(parsed.prefs)) {
      try { localStorage.setItem(k, v); } catch { /* ignore */ }
    }
  }
}
