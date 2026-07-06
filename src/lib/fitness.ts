import { list, create, update, remove, getOne } from './dataverse';
import dayjs from 'dayjs';

// Dataverse "Date Only" values come back as UTC midnight (e.g. 2026-06-27T00:00:00Z).
// Parsing that with a local timezone shifts the calendar day backwards, so read just
// the YYYY-MM-DD portion and treat it as a local date.
export const sessionDay = (iso?: string) => dayjs((iso || '').slice(0, 10) || undefined);

// ---- Entity set names (note Dataverse irregular plural for splitday) ----
const ES = {
  plan: 'fit_workoutplans',
  day: 'fit_splitdaies',
  exercise: 'fit_plannedexercises',
  session: 'fit_workoutsessions',
  log: 'fit_exerciselogs',
  cache: 'fit_exercisecaches',
  pr: 'fit_personalrecords',
} as const;

// ---- Choice maps ----
export const FOCUS = ['Push', 'Pull', 'Legs', 'Upper', 'Lower', 'Chest', 'Back', 'Shoulders', 'Arms', 'Core', 'Full Body'];
export const DAY_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const STATUS = ['Planned', 'In Progress', 'Completed', 'Skipped'];
const BASE = 100000000;
export const focusLabel = (v?: number) => (v == null ? '' : FOCUS[v - BASE] ?? '');
export const dowLabel = (v?: number) => (v == null ? '' : DAY_OF_WEEK[v - BASE] ?? '');
export const statusLabel = (v?: number) => (v == null ? 'Planned' : STATUS[v - BASE] ?? 'Planned');
export const focusValue = (label: string) => BASE + FOCUS.indexOf(label);
export const dowValue = (label: string) => BASE + DAY_OF_WEEK.indexOf(label);
export const statusValue = (label: string) => BASE + STATUS.indexOf(label);
export const STATUS_PLANNED = BASE;
export const STATUS_INPROGRESS = BASE + 1;
export const STATUS_COMPLETED = BASE + 2;
export const STATUS_SKIPPED = BASE + 3;

// ---- Models ----
export interface WorkoutPlan {
  fit_workoutplanid: string;
  fit_name: string;
  fit_isactive?: boolean;
  fit_daysperweek?: number;
  fit_notes?: string;
}
export interface SplitDay {
  fit_splitdayid: string;
  fit_name: string;
  fit_focus?: number;
  fit_dayofweek?: number;
  fit_sortorder?: number;
  _fit_plan_value?: string;
}
export interface PlannedExercise {
  fit_plannedexerciseid: string;
  fit_name: string;
  fit_exerciseexternalid?: string;
  fit_primarymuscle?: string;
  fit_equipment?: string;
  fit_targetsets?: number;
  fit_targetreps?: string;
  fit_imageurl?: string;
  fit_sortorder?: number;
  _fit_splitday_value?: string;
}
export interface WorkoutSession {
  fit_workoutsessionid: string;
  fit_name: string;
  fit_sessiondate?: string;
  fit_status?: number;
  fit_durationmin?: number;
  fit_notes?: string;
  _fit_splitday_value?: string;
  createdon?: string;
}
export interface ExerciseLog {
  fit_exerciselogid: string;
  fit_name: string;
  fit_exercisename?: string;
  fit_exerciseexternalid?: string;
  fit_setnumber?: number;
  fit_reps?: number;
  fit_weightlb?: number;
  fit_iscompleted?: boolean;
  _fit_session_value?: string;
}

// ---- Plans & split days ----
export const getPlans = () =>
  list<WorkoutPlan>(ES.plan, 'fit_workoutplanid,fit_name,fit_isactive,fit_daysperweek,fit_notes', undefined, 'fit_name asc');

export async function getActivePlan(): Promise<WorkoutPlan | null> {
  const rows = await list<WorkoutPlan>(ES.plan, 'fit_workoutplanid,fit_name,fit_isactive,fit_daysperweek,fit_notes', 'fit_isactive eq true', undefined, 1);
  if (rows.length) return rows[0];
  const all = await getPlans();
  return all[0] ?? null;
}

export const getSplitDays = (planId: string) =>
  list<SplitDay>(ES.day, 'fit_splitdayid,fit_name,fit_focus,fit_dayofweek,fit_sortorder,_fit_plan_value', `_fit_plan_value eq ${planId}`, 'fit_sortorder asc');

export const updatePlan = (id: string, body: Partial<WorkoutPlan>) => update(ES.plan, id, body);

// A "preset" is a muscle-group workout template (a split day under the hidden
// container plan). No day numbering — the preset's name is its muscle group.
export const getPresets = getSplitDays;
export const createPreset = (planId: string, focus: number, name: string, sortorder: number) =>
  createSplitDay(planId, { fit_focus: focus, fit_name: name, fit_sortorder: sortorder });

// Week runs Monday 00:00 → next Monday 00:00 (Sunday is the last day).
export function weekRange(ref = dayjs()): { start: dayjs.Dayjs; end: dayjs.Dayjs } {
  const dow = ref.day(); // 0 Sun .. 6 Sat
  const monday = ref.subtract((dow + 6) % 7, 'day').startOf('day');
  return { start: monday, end: monday.add(7, 'day') };
}
export function inThisWeek(iso?: string): boolean {
  const d = sessionDay(iso);
  const { start, end } = weekRange();
  return d.isAfter(start.subtract(1, 'second')) && d.isBefore(end);
}

export const getSplitDay = (id: string) =>
  getOne<SplitDay>(ES.day, 'fit_splitdayid', id, 'fit_splitdayid,fit_name,fit_focus,fit_dayofweek,fit_sortorder,_fit_plan_value');

export const createSplitDay = (planId: string, body: Partial<SplitDay>) =>
  create(ES.day, { 'fit_plan@odata.bind': `/${ES.plan}(${planId})`, ...stripNav(body) });

export const updateSplitDay = (id: string, body: Partial<SplitDay>) => update(ES.day, id, stripNav(body));
export const deleteSplitDay = (id: string) => remove(ES.day, id);

// ---- Planned exercises ----
export const getPlannedExercises = (splitDayId: string) =>
  list<PlannedExercise>(ES.exercise,
    'fit_plannedexerciseid,fit_name,fit_exerciseexternalid,fit_primarymuscle,fit_equipment,fit_targetsets,fit_targetreps,fit_imageurl,fit_sortorder,_fit_splitday_value',
    `_fit_splitday_value eq ${splitDayId}`, 'fit_sortorder asc');

export const createPlannedExercise = (splitDayId: string, body: Partial<PlannedExercise>) =>
  create(ES.exercise, { 'fit_splitday@odata.bind': `/${ES.day}(${splitDayId})`, ...stripNav(body) });

export const updatePlannedExercise = (id: string, body: Partial<PlannedExercise>) => update(ES.exercise, id, stripNav(body));
export const deletePlannedExercise = (id: string) => remove(ES.exercise, id);

// All planned exercises for the (single) active plan in ONE query, grouped by split day.
// Collapses the previous N+1 (one call per preset) into a single round-trip.
export const getAllPlannedExercises = () =>
  list<PlannedExercise>(ES.exercise,
    'fit_plannedexerciseid,fit_name,fit_exerciseexternalid,fit_primarymuscle,fit_equipment,fit_targetsets,fit_targetreps,fit_imageurl,fit_sortorder,_fit_splitday_value',
    undefined, 'fit_sortorder asc', 500);

// ---- In-memory structure cache (plan + presets + exercises) ----
// The preset structure changes rarely, so cache it across navigations to avoid
// refetching ~10 records every tab switch. Invalidated on any preset/exercise edit.
export interface Structure { plan: WorkoutPlan | null; presets: SplitDay[]; exByDay: Record<string, PlannedExercise[]>; }
let _structure: Structure | null = null;
let _structurePromise: Promise<Structure> | null = null;

export function invalidateStructure(): void { _structure = null; _structurePromise = null; }

export async function getStructure(force = false): Promise<Structure> {
  if (!force && _structure) return _structure;
  if (!force && _structurePromise) return _structurePromise;
  _structurePromise = (async () => {
    const plan = await getActivePlan();
    let presets: SplitDay[] = [];
    const exByDay: Record<string, PlannedExercise[]> = {};
    if (plan) {
      const [days, allEx] = await Promise.all([getPresets(plan.fit_workoutplanid), getAllPlannedExercises()]);
      presets = days;
      for (const ex of allEx) {
        const k = ex._fit_splitday_value || '';
        (exByDay[k] = exByDay[k] || []).push(ex);
      }
    }
    _structure = { plan, presets, exByDay };
    return _structure;
  })();
  return _structurePromise;
}

// ---- Sessions ----
export const getSessions = (top = 100) =>
  list<WorkoutSession>(ES.session, 'fit_workoutsessionid,fit_name,fit_sessiondate,fit_status,fit_durationmin,fit_notes,_fit_splitday_value', undefined, 'fit_sessiondate desc', top);

export const getSession = (id: string) =>
  getOne<WorkoutSession>(ES.session, 'fit_workoutsessionid', id, 'fit_workoutsessionid,fit_name,fit_sessiondate,fit_status,fit_durationmin,fit_notes,_fit_splitday_value,createdon');

export const getSessionsForDate = (dateISO: string) =>
  list<WorkoutSession>(ES.session, 'fit_workoutsessionid,fit_name,fit_sessiondate,fit_status,_fit_splitday_value', `fit_sessiondate eq ${dateISO}`, undefined, 5);

export const createSession = (splitDayId: string, body: Partial<WorkoutSession>) =>
  create(ES.session, { 'fit_splitday@odata.bind': `/${ES.day}(${splitDayId})`, ...stripNav(body) });

export const updateSession = (id: string, body: Partial<WorkoutSession>) => update(ES.session, id, stripNav(body));
export const deleteSession = (id: string) => remove(ES.session, id);

// A session's live workout label. Sessions store a name snapshot (e.g. "Push · Jul 1")
// that goes stale if the linked preset is later renamed/re-focused, so prefer the
// linked split day's CURRENT focus. Falls back to the stored name's leading token.
export function sessionFocusLabel(session: WorkoutSession, daysById: Record<string, SplitDay>): string {
  const day = session._fit_splitday_value ? daysById[session._fit_splitday_value] : undefined;
  if (day) return focusLabel(day.fit_focus) || (session.fit_name || '').split('·')[0].trim() || 'Workout';
  return (session.fit_name || '').split('·')[0].trim() || 'Workout';
}

// Delete a session and all of its set logs (the relationship is referential, not
// cascade-delete, so children must be removed explicitly first).
export async function deleteSessionCascade(sessionId: string): Promise<void> {
  const logs = await getLogs(sessionId);
  await Promise.all(logs.map((l) => deleteLog(l.fit_exerciselogid)));
  await deleteSession(sessionId);
}

// ---- Exercise logs ----
export const getLogs = (sessionId: string) =>
  list<ExerciseLog>(ES.log, 'fit_exerciselogid,fit_name,fit_exercisename,fit_exerciseexternalid,fit_setnumber,fit_reps,fit_weightlb,fit_iscompleted,_fit_session_value', `_fit_session_value eq ${sessionId}`, 'fit_setnumber asc', 500);

export const getAllLogs = (top = 1000) =>
  list<ExerciseLog>(ES.log, 'fit_exerciselogid,fit_exercisename,fit_exerciseexternalid,fit_setnumber,fit_reps,fit_weightlb,fit_iscompleted,_fit_session_value', 'fit_iscompleted eq true', undefined, top);

export const createLog = (sessionId: string, body: Partial<ExerciseLog>) =>
  create(ES.log, { 'fit_session@odata.bind': `/${ES.session}(${sessionId})`, ...stripNav(body) });

export const updateLog = (id: string, body: Partial<ExerciseLog>) => update(ES.log, id, stripNav(body));
export const deleteLog = (id: string) => remove(ES.log, id);

// ---- Personal Records (max PR per exercise) ----
export interface PersonalRecord {
  fit_personalrecordid?: string;
  fit_name: string;
  fit_exerciseexternalid?: string;
  fit_exercisename?: string;
  fit_musclegroup?: string;
  fit_maxweightlb?: number;
  fit_reps?: number;
  fit_est1rm?: number;
  fit_achievedon?: string;
}

export const getPRs = () =>
  list<PersonalRecord>(ES.pr, 'fit_personalrecordid,fit_name,fit_exerciseexternalid,fit_exercisename,fit_musclegroup,fit_maxweightlb,fit_reps,fit_est1rm,fit_achievedon', undefined, 'fit_est1rm desc', 500);

export const createPR = (body: Partial<PersonalRecord>) => create(ES.pr, stripNav(body));
export const updatePR = (id: string, body: Partial<PersonalRecord>) => update(ES.pr, id, stripNav(body));

// Epley estimated 1-rep max.
export const est1RM = (weightLb: number, reps: number) => Math.round(weightLb * (1 + (reps || 1) / 30) * 10) / 10;

// ---- Per-exercise personal bests (derived from completed set logs) ----
// Heaviest set ever lifted + best estimated 1RM, keyed by exercise external id
// (falls back to exercise name). Used to surface "past best" inside the player.
export interface ExerciseBest {
  topWeightLb: number;   // heaviest weight lifted
  topWeightReps: number; // reps at that heaviest set
  best1rm: number;       // best Epley estimated 1RM across all sets
  best1rmWeightLb: number;
  best1rmReps: number;
  lastDoneSession?: string;
}

export function exerciseBests(logs: ExerciseLog[], excludeSessionId?: string): Record<string, ExerciseBest> {
  const out: Record<string, ExerciseBest> = {};
  for (const l of logs) {
    if (!l.fit_iscompleted) continue;
    if (excludeSessionId && l._fit_session_value === excludeSessionId) continue;
    const w = l.fit_weightlb || 0;
    const reps = l.fit_reps || 0;
    if (w <= 0 || reps <= 0) continue;
    const k = l.fit_exerciseexternalid || l.fit_exercisename || '';
    if (!k) continue;
    const e = out[k] || { topWeightLb: 0, topWeightReps: 0, best1rm: 0, best1rmWeightLb: 0, best1rmReps: 0 };
    if (w > e.topWeightLb || (w === e.topWeightLb && reps > e.topWeightReps)) {
      e.topWeightLb = w; e.topWeightReps = reps;
    }
    const oneRm = est1RM(w, reps);
    if (oneRm > e.best1rm) { e.best1rm = oneRm; e.best1rmWeightLb = w; e.best1rmReps = reps; }
    out[k] = e;
  }
  return out;
}

// Remove read-only nav/value props (e.g. _fit_plan_value) before write
function stripNav(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(body)) {
    if (!k.startsWith('_')) out[k] = body[k];
  }
  return out;
}
