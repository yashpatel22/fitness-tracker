import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  getSession, getSplitDay, getPlannedExercises, getLogs, getAllLogs, createLog, updateLog, updateSession,
  focusLabel, STATUS_COMPLETED, sessionDay, exerciseBests,
  type WorkoutSession, type SplitDay, type PlannedExercise, type ExerciseLog, type ExerciseBest,
} from '../lib/fitness';
import { useApp } from '../lib/appContext';
import { fromLb, toLb } from '../lib/units';
import { Loader } from '../ui/common';
import { Modal } from '../ui/common';
import { Animator } from '../ui/Animator';
import { plannedImage, getExerciseByIdSync, titleCase, type Exercise } from '../lib/exerciseDb';
import { IconBack, IconCheck, IconX, IconInfo, IconTrophy, IconEdit } from '../ui/icons';

const DEFAULT_REST = 90;

interface SetState { reps: string; weight: string; completed: boolean; logId?: string; }
interface Rest { exId: string; endAt: number; total: number; remaining: number; done: boolean; }

const firstNum = (s?: string): string => (s ? (s.match(/\d+/)?.[0] ?? '') : '');
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// ---- Audio: one shared context, unlocked on a user gesture (set tick) so the
// rest-end beep can fire later without an autoplay block. ----
let _ac: AudioContext | null = null;
function unlockAudio() {
  try {
    if (!_ac) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) _ac = new AC();
    }
    if (_ac && _ac.state === 'suspended') void _ac.resume();
  } catch { /* ignore */ }
}
function beep() {
  try {
    if (!_ac) return;
    const t0 = _ac.currentTime;
    [0, 0.26, 0.52].forEach((t, i) => {
      const o = _ac!.createOscillator();
      const g = _ac!.createGain();
      o.type = 'sine';
      o.frequency.value = i === 2 ? 1180 : 880;
      o.connect(g); g.connect(_ac!.destination);
      g.gain.setValueAtTime(0.0001, t0 + t);
      g.gain.exponentialRampToValueAtTime(0.4, t0 + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + t + 0.2);
      o.start(t0 + t); o.stop(t0 + t + 0.22);
    });
    (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.([140, 70, 140]);
  } catch { /* ignore */ }
}

// ---- Auto-playing exercise animation lives in ui/Animator (shared with detail). ----

export function Session() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { unit, toast } = useApp();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [day, setDay] = useState<SplitDay | null>(null);
  const [exercises, setExercises] = useState<PlannedExercise[]>([]);
  const [sets, setSets] = useState<Record<string, SetState>>({});
  const [active, setActive] = useState<Record<string, number>>({});
  const [rest, setRest] = useState<Rest | null>(null);
  const [restLen, setRestLen] = useState(DEFAULT_REST);
  const [curEx, setCurEx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [bests, setBests] = useState<Record<string, ExerciseBest>>({});
  const [howto, setHowto] = useState<Exercise | null>(null);
  const [editingDate, setEditingDate] = useState(false);
  const [dateVal, setDateVal] = useState('');
  const [savingDate, setSavingDate] = useState(false);

  const trackRef = useRef<HTMLDivElement>(null);
  const restRef = useRef<number | null>(null);
  // Synchronous mirror of `sets` so event handlers (onBlur, tick onClick) always
  // read the latest set state instead of a stale render-closure snapshot.
  const setsRef = useRef<Record<string, SetState>>({});
  // Tracks an in-flight createLog per set key so two near-simultaneous saves for the
  // same set (e.g. input onBlur racing the tick onClick) can never create two rows.
  const creatingRef = useRef<Record<string, Promise<string> | undefined>>({});

  const key = (exId: string, n: number) => `${exId}__${n}`;
  const totalOf = (ex: PlannedExercise) => ex.fit_targetsets || 3;

  useEffect(() => {
    const t0 = performance.now();
    (async () => {
      try {
        const s = await getSession(id);
        setSession(s);
        if (s?._fit_splitday_value) {
          const [sd, logs, allLogs] = await Promise.all([getSplitDay(s._fit_splitday_value), getLogs(id), getAllLogs()]);
          setDay(sd);
          setBests(exerciseBests(allLogs, id));
          const exs = sd ? await getPlannedExercises(sd.fit_splitdayid) : [];
          setExercises(exs);
          const initSets: Record<string, SetState> = {};
          const initActive: Record<string, number> = {};
          for (const ex of exs) {
            const exKey = ex.fit_exerciseexternalid || ex.fit_name;
            const total = totalOf(ex);
            let firstOpen = 0;
            for (let n = 1; n <= total; n++) {
              const log = logs.find((l) => (l.fit_exerciseexternalid || l.fit_exercisename) === exKey && l.fit_setnumber === n);
              const done = !!log?.fit_iscompleted;
              if (!done && !firstOpen) firstOpen = n;
              initSets[key(ex.fit_plannedexerciseid, n)] = {
                reps: log?.fit_reps != null ? String(log.fit_reps) : firstNum(ex.fit_targetreps),
                weight: log?.fit_weightlb != null ? String(fromLb(log.fit_weightlb, unit)) : '',
                completed: done,
                logId: log?.fit_exerciselogid,
              };
            }
            initActive[ex.fit_plannedexerciseid] = firstOpen || total;
          }
          setSets(initSets);
          setsRef.current = initSets;
          setActive(initActive);
        }
      } catch (e) {
        toast((e as Error).message, 'err');
      } finally {
        setLoading(false);
        console.log('[telemetry] screen_load_ms', { screen: 'session', ms: Math.round(performance.now() - t0) });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Wall-clock rest countdown. iOS freezes JS timers (setInterval) the moment a
  // home-screen web app is backgrounded, so we never *decrement* — we recompute
  // the remaining seconds from an absolute end time (rest.endAt). That keeps the
  // countdown accurate after you switch apps, and a visibilitychange/focus/pageshow
  // listener re-syncs it the instant you return (and fires the end beep if the rest
  // already elapsed while you were away).
  const restActive = !!(rest && !rest.done);
  useEffect(() => {
    if (!restActive) {
      if (restRef.current) { clearInterval(restRef.current); restRef.current = null; }
      return;
    }
    const tick = () => {
      setRest((r) => {
        if (!r || r.done) return r;
        const remaining = Math.max(0, Math.ceil((r.endAt - Date.now()) / 1000));
        if (remaining <= 0) {
          beep();
          return { ...r, remaining: 0, done: true };
        }
        return remaining === r.remaining ? r : { ...r, remaining };
      });
    };
    restRef.current = window.setInterval(tick, 250);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('pageshow', onVisible);
    tick(); // immediate sync on (re)start
    return () => {
      if (restRef.current) { clearInterval(restRef.current); restRef.current = null; }
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('pageshow', onVisible);
    };
  }, [restActive]);

  useEffect(() => () => { if (restRef.current) clearInterval(restRef.current); }, []);

  const persist = useCallback(async (ex: PlannedExercise, setNo: number) => {
    const k = `${ex.fit_plannedexerciseid}__${setNo}`;
    const st = setsRef.current[k];
    if (!st) return;
    const body: Partial<ExerciseLog> = {
      fit_name: `${ex.fit_name} · Set ${setNo}`,
      fit_exercisename: ex.fit_name,
      fit_exerciseexternalid: ex.fit_exerciseexternalid || ex.fit_name,
      fit_setnumber: setNo,
      fit_reps: st.reps ? parseInt(st.reps, 10) : 0,
      fit_weightlb: st.weight ? toLb(parseFloat(st.weight), unit) : 0,
      fit_iscompleted: st.completed,
    };
    try {
      // Resolve the freshest logId: from state, or from an in-flight create for the
      // same set (so a racing save reuses that row instead of creating a duplicate).
      let logId = st.logId;
      if (!logId && creatingRef.current[k]) logId = await creatingRef.current[k];
      if (logId) {
        await updateLog(logId, body);
      } else {
        const p = createLog(id, body);
        creatingRef.current[k] = p;
        try {
          const newId = await p;
          const merged = { ...setsRef.current, [k]: { ...setsRef.current[k], logId: newId } };
          setsRef.current = merged;
          setSets(merged);
        } finally {
          delete creatingRef.current[k];
        }
      }
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  }, [id, unit, toast]);

  function edit(exId: string, n: number, patch: Partial<SetState>) {
    const k = key(exId, n);
    const merged = { ...setsRef.current, [k]: { ...setsRef.current[k], ...patch } };
    setsRef.current = merged;
    setSets(merged);
  }

  async function completeSet(ex: PlannedExercise, n: number) {
    unlockAudio();
    const k = key(ex.fit_plannedexerciseid, n);
    edit(ex.fit_plannedexerciseid, n, { completed: true }); // sync-updates setsRef too
    const cur = setsRef.current[k];
    await persist(ex, n);
    if (n < totalOf(ex)) {
      // Carry the reps/weight I just did forward as the default for the next set,
      // so I don't have to retype the same load every set.
      const nx = setsRef.current[key(ex.fit_plannedexerciseid, n + 1)];
      if (nx && !nx.completed) {
        const patch: Partial<SetState> = {};
        if (!nx.weight && cur?.weight) patch.weight = cur.weight;
        if (cur?.reps) patch.reps = cur.reps;
        if (Object.keys(patch).length) edit(ex.fit_plannedexerciseid, n + 1, patch);
      }
      setRest({ exId: ex.fit_plannedexerciseid, endAt: Date.now() + restLen * 1000, total: restLen, remaining: restLen, done: false });
    } else {
      setActive((prev) => ({ ...prev, [ex.fit_plannedexerciseid]: n }));
    }
  }

  function uncompleteSet(ex: PlannedExercise, n: number) {
    const k = key(ex.fit_plannedexerciseid, n);
    if (!setsRef.current[k]) return;
    edit(ex.fit_plannedexerciseid, n, { completed: false });
    setActive((prev) => ({ ...prev, [ex.fit_plannedexerciseid]: n }));
    void persist(ex, n);
  }

  function dismissRest() {
    setRest((r) => {
      if (r) {
        setActive((prev) => {
          const ex = exercises.find((e) => e.fit_plannedexerciseid === r.exId);
          const max = ex ? totalOf(ex) : (prev[r.exId] || 1);
          return { ...prev, [r.exId]: Math.min((prev[r.exId] || 1) + 1, max) };
        });
      }
      return null;
    });
    if (restRef.current) { clearInterval(restRef.current); restRef.current = null; }
  }

  function bumpRest(delta: number) {
    setRestLen((v) => Math.max(15, Math.min(300, v + delta)));
    setRest((r) => {
      if (!r || r.done) return r;
      const endAt = Math.max(Date.now() + 1000, r.endAt + delta * 1000);
      const total = Math.max(15, r.total + delta);
      const remaining = Math.max(1, Math.ceil((endAt - Date.now()) / 1000));
      return { ...r, endAt, total, remaining };
    });
  }

  function onScroll() {
    const el = trackRef.current; if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== curEx) setCurEx(i);
  }
  function goEx(i: number) {
    const el = trackRef.current; if (!el) return;
    const idx = Math.max(0, Math.min(exercises.length - 1, i));
    el.scrollTo({ left: idx * el.clientWidth, behavior: 'smooth' });
  }

  function openEditDate() {
    setDateVal(sessionDay(session?.fit_sessiondate).format('YYYY-MM-DD'));
    setEditingDate(true);
  }

  async function saveDate() {
    if (!dateVal) return;
    setSavingDate(true);
    try {
      // Send an explicit UTC-midnight ISO so the DateOnly/UserLocal column can't
      // drift by a day across timezone conversion (and stays stable if edited twice).
      const iso = `${dateVal}T00:00:00Z`;
      await updateSession(id, { fit_sessiondate: iso });
      setSession((s) => (s ? { ...s, fit_sessiondate: iso } : s));
      // Every set log rolls up to this session's date, so all child sets move with it.
      toast('Workout date updated');
      setEditingDate(false);
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setSavingDate(false);
    }
  }

  async function finish() {
    setSaving(true);
    try {
      const start = session?.createdon ? dayjs(session.createdon) : null;
      const mins = start ? Math.max(1, dayjs().diff(start, 'minute')) : undefined;
      try {
        await updateSession(id, { fit_status: STATUS_COMPLETED, ...(mins ? { fit_durationmin: mins } : {}) });
      } catch {
        // Duration can exceed the column's numeric cap when a session spans days.
        // Never let that block finishing — mark complete without the duration.
        await updateSession(id, { fit_status: STATUS_COMPLETED });
      }
      toast('Workout complete! 🎉');
      nav('/history');
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="player"><Loader label="Loading session…" /></div>;
  }
  if (!session) {
    return (
      <div className="player">
        <div className="pl-top">
          <button className="pl-icon" onClick={() => nav('/')} aria-label="Back" data-telemetry-name="session-back"><IconBack size={20} /></button>
          <div className="pl-title"><strong>Not found</strong></div>
          <span style={{ width: 40 }} />
        </div>
        <div className="pl-empty">This workout session no longer exists.</div>
      </div>
    );
  }

  const totalSets = Object.keys(sets).length;
  const doneSets = Object.values(sets).filter((s) => s.completed).length;
  const restPct = rest && rest.total > 0 ? Math.round(((rest.total - rest.remaining) / rest.total) * 100) : 0;

  return (
    <div className="player">
      <div className="pl-top">
        <button className="pl-icon" onClick={() => nav(session._fit_splitday_value ? `/day/${session._fit_splitday_value}` : '/')} aria-label="Back to workout start" data-telemetry-name="session-back"><IconBack size={20} /></button>
        <div className="pl-title">
          <strong>{day ? focusLabel(day.fit_focus) : 'Workout'}</strong>
          <span>{doneSets}/{totalSets} sets · {sessionDay(session.fit_sessiondate).format('ddd, MMM D')}</span>
        </div>
        <button className="pl-icon" onClick={openEditDate} aria-label="Edit workout date" data-telemetry-name="edit-date"><IconEdit size={18} /></button>
        <button className="pl-finish" disabled={saving} onClick={finish} data-telemetry-name="finish-workout"><IconCheck size={16} /> Finish</button>
      </div>

      <div className="pl-segs">
        {exercises.map((ex, i) => (
          <span key={ex.fit_plannedexerciseid} className={`pl-seg ${i === curEx ? 'on' : ''}`} onClick={() => goEx(i)} />
        ))}
      </div>

      <div className="pl-track" ref={trackRef} onScroll={onScroll}>
        {exercises.map((ex) => {
          const total = totalOf(ex);
          const act = active[ex.fit_plannedexerciseid] || 1;
          const exDone = Array.from({ length: total }, (_, i) => i + 1).every((n) => sets[key(ex.fit_plannedexerciseid, n)]?.completed);
          return (
            <section className="pl-pane" key={ex.fit_plannedexerciseid}>
              <Animator a={plannedImage(ex.fit_exerciseexternalid, 0)} b={plannedImage(ex.fit_exerciseexternalid, 1)} alt={ex.fit_name} />
              <div className="pl-head">
                <div className="pl-head-row">
                  <h2>{ex.fit_name}</h2>
                  {ex.fit_exerciseexternalid && getExerciseByIdSync(ex.fit_exerciseexternalid) && (
                    <button className="pl-howto" onClick={() => setHowto(getExerciseByIdSync(ex.fit_exerciseexternalid!) || null)} data-telemetry-name="player-howto">
                      <IconInfo size={15} /> How to
                    </button>
                  )}
                </div>
                <div className="pl-meta">{ex.fit_primarymuscle}{ex.fit_equipment ? ` · ${ex.fit_equipment}` : ''} · target {total} × {ex.fit_targetreps}</div>
              </div>

              {(() => {
                const b = bests[ex.fit_exerciseexternalid || ex.fit_name];
                const w = (lb: number) => {
                  const v = fromLb(lb, unit);
                  return Math.round(v * 10) / 10;
                };
                if (!b) {
                  return <div className="pl-pr empty"><IconTrophy size={14} /> No past records yet — today could be your first PR.</div>;
                }
                return (
                  <div className="pl-pr">
                    <IconTrophy size={15} />
                    <span className="pl-pr-main">Past best <strong>{w(b.topWeightLb)} {unit}</strong> × {b.topWeightReps}</span>
                    <span className="pl-pr-sub">est 1RM {w(b.best1rm)} {unit}</span>
                  </div>
                );
              })()}

              <div className="pl-sets">
                {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
                  const st = sets[key(ex.fit_plannedexerciseid, n)] || { reps: firstNum(ex.fit_targetreps), weight: '', completed: false };
                  const isActive = n === act && !st.completed;
                  return (
                    <div className={`pl-set ${st.completed ? 'done' : ''} ${isActive ? 'active' : ''}`} key={n}>
                      <span className="pl-setno">{n}</span>
                      <label className="pl-fld">
                        <span>Reps</span>
                        <input inputMode="numeric" value={st.reps} placeholder={ex.fit_targetreps}
                          onChange={(e) => edit(ex.fit_plannedexerciseid, n, { reps: e.target.value })}
                          onBlur={() => persist(ex, n)}
                          data-telemetry-name="set-reps" />
                      </label>
                      <label className="pl-fld">
                        <span>{unit}</span>
                        <input inputMode="decimal" value={st.weight} placeholder="0"
                          onChange={(e) => edit(ex.fit_plannedexerciseid, n, { weight: e.target.value })}
                          onBlur={() => persist(ex, n)}
                          data-telemetry-name="set-weight" />
                      </label>
                      <button className={`pl-tick ${st.completed ? 'on' : ''}`}
                        onClick={() => (st.completed ? uncompleteSet(ex, n) : completeSet(ex, n))}
                        aria-label={st.completed ? 'Mark set incomplete' : 'Complete set'}
                        data-telemetry-name="complete-set">
                        <IconCheck size={20} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {exDone && <div className="pl-exdone"><IconCheck size={16} /> Exercise complete — swipe for the next one</div>}

              {rest && rest.exId === ex.fit_plannedexerciseid && (
                <div className={`pl-rest ${rest.done ? 'done' : ''}`} onClick={dismissRest} data-telemetry-name="rest-advance">
                  <div className="pl-rest-inner" onClick={(e) => e.stopPropagation()}>
                    <div className="pl-rest-label">{rest.done ? 'Rest complete' : 'Rest'}</div>
                    <div className="pl-rest-time">{mmss(rest.remaining)}</div>
                    <div className="pl-rest-bar"><span style={{ width: `${restPct}%` }} /></div>
                    {rest.done ? (
                      <button className="pl-rest-go" onClick={dismissRest} data-telemetry-name="rest-next-set">Tap to start next set</button>
                    ) : (
                      <div className="pl-rest-ctrls">
                        <button onClick={() => bumpRest(-15)} data-telemetry-name="rest-minus">−15s</button>
                        <button className="skip" onClick={dismissRest} data-telemetry-name="rest-skip"><IconX size={15} /> Skip</button>
                        <button onClick={() => bumpRest(15)} data-telemetry-name="rest-plus">+15s</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="pl-nav">
        <button onClick={() => goEx(curEx - 1)} disabled={curEx === 0} data-telemetry-name="prev-exercise">‹ Prev</button>
        <span className="pl-count">Exercise {curEx + 1} of {exercises.length}</span>
        <button onClick={() => goEx(curEx + 1)} disabled={curEx >= exercises.length - 1} data-telemetry-name="next-exercise">Next ›</button>
      </div>

      {editingDate && (
        <Modal title="Edit workout date" onClose={() => setEditingDate(false)}>
          <div className="field">
            <label>Date</label>
            <input className="input" type="date" value={dateVal} onChange={(e) => setDateVal(e.target.value)} data-telemetry-name="date-input" />
          </div>
          <p className="modal-note">All sets logged in this workout move with it — they inherit the workout’s date.</p>
          <button className="btn block" disabled={savingDate} onClick={saveDate} data-telemetry-name="date-save"><IconCheck size={16} /> Save date</button>
        </Modal>
      )}

      {howto && (
        <div className="pl-howto-sheet" onClick={() => setHowto(null)} data-telemetry-name="howto-backdrop">
          <div className="pl-howto-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`How to: ${howto.name}`}>
            <div className="pl-howto-top">
              <strong>{howto.name}</strong>
              <button className="pl-howto-x" onClick={() => setHowto(null)} aria-label="Close" data-telemetry-name="howto-close"><IconX size={18} /></button>
            </div>
            <div className="pl-howto-body">
              <Animator a={plannedImage(howto.id, 0)} b={plannedImage(howto.id, 1)} alt={howto.name} />
              <div className="pl-howto-pills">
                <span className="pill red">{titleCase(howto.category)}</span>
                {howto.equipment && <span className="pill">{titleCase(howto.equipment)}</span>}
                {howto.level && <span className="pill">{titleCase(howto.level)}</span>}
                {howto.primaryMuscles.map((m) => <span key={m} className="pill">{titleCase(m)}</span>)}
              </div>
              <h3>How to do it</h3>
              {howto.instructions.length ? (
                <ol className="pl-howto-steps">
                  {howto.instructions.map((step, i) => (
                    <li key={i}><span className="step-n">{i + 1}</span><span>{step}</span></li>
                  ))}
                </ol>
              ) : (
                <p className="pl-howto-none">No written instructions — follow the animation above.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
