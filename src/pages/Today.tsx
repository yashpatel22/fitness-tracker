import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  getSessions, createPreset, getStructure, invalidateStructure,
  presetLabel, isCustomPreset, restSummary, FOCUS, focusValue, weekRange, sessionDay,
  STATUS_COMPLETED,
  type WorkoutPlan, type SplitDay, type PlannedExercise, type WorkoutSession,
} from '../lib/fitness';
import { useApp } from '../lib/appContext';
import { distinctEquipment } from '../lib/equipment';
import { Loader, Modal } from '../ui/common';
import { IconPlay, IconPlus } from '../ui/icons';

const WEEK_GOAL = 4;
const DOW_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function Today() {
  const nav = useNavigate();
  const { displayName, toast, equipment } = useApp();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [presets, setPresets] = useState<SplitDay[]>([]);
  const [exCount, setExCount] = useState<Record<string, number>>({});
  const [restMap, setRestMap] = useState<Record<string, string>>({});
  const [missingMap, setMissingMap] = useState<Record<string, number>>({});
  const [weekSessions, setWeekSessions] = useState<WorkoutSession[]>([]);
  const [creating, setCreating] = useState(false);
  const [newFocus, setNewFocus] = useState('Arms');
  const [newName, setNewName] = useState('');

  const { start: monday } = weekRange();

  async function load() {
    const [structure, sess] = await Promise.all([getStructure(), getSessions(100)]);
    setPlan(structure.plan);
    setWeekSessions(sess.filter((s) => {
      const d = sessionDay(s.fit_sessiondate);
      return d.isAfter(monday.subtract(1, 'second')) && d.isBefore(monday.add(7, 'day'));
    }));
    if (structure.plan) {
      setPresets(structure.presets);
      const haveSet = new Set(equipment);
      const counts: Record<string, number> = {};
      const rests: Record<string, string> = {};
      const missing: Record<string, number> = {};
      for (const sd of structure.presets) {
        const exs = structure.exByDay[sd.fit_splitdayid] || [];
        counts[sd.fit_splitdayid] = exs.length;
        rests[sd.fit_splitdayid] = restSummary(exs);
        missing[sd.fit_splitdayid] = distinctEquipment(exs).filter((e) => !haveSet.has(e)).length;
      }
      setExCount(counts);
      setRestMap(rests);
      setMissingMap(missing);
    }
  }

  useEffect(() => {
    const t0 = performance.now();
    (async () => {
      try { await load(); }
      catch (e) { toast((e as Error).message, 'err'); }
      finally { setLoading(false); console.log('[telemetry] screen_load_ms', { screen: 'today', ms: Math.round(performance.now() - t0) }); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Distinct days worked out this week (completed sessions) + the day-dot map.
  const workedDates = new Set(weekSessions.filter((s) => s.fit_status === STATUS_COMPLETED).map((s) => sessionDay(s.fit_sessiondate).format('YYYY-MM-DD')));
  const daysDone = workedDates.size;
  // Any session (completed or in-progress) per day so a day-dot can open it.
  const sessionByDate: Record<string, WorkoutSession> = {};
  weekSessions.forEach((s) => {
    const d = sessionDay(s.fit_sessiondate).format('YYYY-MM-DD');
    if (!sessionByDate[d] || s.fit_status === STATUS_COMPLETED) sessionByDate[d] = s;
  });
  const dots = Array.from({ length: 7 }, (_, i) => {
    const d = monday.add(i, 'day');
    const key = d.format('YYYY-MM-DD');
    const sess = sessionByDate[key];
    const preset = sess ? presets.find((x) => x.fit_splitdayid === sess._fit_splitday_value) : undefined;
    return { letter: DOW_LETTERS[i], done: workedDates.has(key), isToday: d.isSame(dayjs(), 'day'), session: sess, preset: preset ? presetLabel(preset) : '' };
  });
  const inProgress = weekSessions.find((s) => s.fit_status !== STATUS_COMPLETED);

  async function createNew() {
    if (!plan) return;
    try {
      const id = await createPreset(plan.fit_workoutplanid, focusValue(newFocus), newName.trim() || newFocus, presets.length + 1);
      invalidateStructure();
      toast('Preset created — add exercises');
      setCreating(false); setNewName('');
      nav(`/library?preset=${id}`);
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  }

  if (loading) return <Loader label="Loading…" />;
  if (!plan) {
    return (
      <div className="screen">
        <header className="screen-head"><div className="eyebrow">Welcome</div><h1>Setting up…</h1><p>Your preset library is being prepared.</p></header>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <div className="eyebrow">Hi {displayName.split(' ')[0]}</div>
        <h1>This week</h1>
        <p>{monday.format('MMM D')} – {monday.add(6, 'day').format('MMM D')} · goal {WEEK_GOAL} workouts</p>
      </header>

      <section className="section" style={{ marginTop: 16 }}>
        <div className="card week-card">
          <div className="week-top">
            <div className="week-count"><strong>{daysDone}</strong><span>/ {WEEK_GOAL} days</span></div>
            <div className="week-note">{daysDone >= WEEK_GOAL ? 'Goal hit! 🎉' : `${WEEK_GOAL - daysDone} to go`}</div>
          </div>
          <div className="week-dots">
            {dots.map((d, i) => (
              <div
                key={i}
                className={`wd ${d.done ? 'on' : ''} ${d.isToday ? 'today' : ''} ${d.session ? 'has' : ''}`}
                onClick={d.session ? () => nav(`/session/${d.session!.fit_workoutsessionid}`) : undefined}
                role={d.session ? 'button' : undefined}
                data-telemetry-name={d.session ? 'open-day-session' : undefined}
              >
                <span className="wd-dot">{d.preset ? <span className="wd-name">{d.preset}</span> : (d.done ? '✓' : '')}</span>
                <span className="wd-l">{d.letter}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {inProgress && (
        <section className="section">
          <div className="start">
            <div className="eyebrow">In progress</div>
            <h2>Continue {(() => { const p = presets.find((x) => x.fit_splitdayid === inProgress._fit_splitday_value); return p ? presetLabel(p) : 'workout'; })()}</h2>
            <p>You started this earlier in the week — pick up where you left off.</p>
            <div className="start-actions">
              <button className="btn" onClick={() => nav(`/session/${inProgress.fit_workoutsessionid}`)} data-telemetry-name="resume-workout"><IconPlay size={18} /> Resume</button>
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head"><h2>Start a workout</h2><span className="spacer" /><span className="pill">pick a preset</span></div>
        <div className="preset-grid">
          {presets.map((p) => (
            <div key={p.fit_splitdayid} className={`preset-tile${isCustomPreset(p) ? ' custom' : ''}`} onClick={() => nav(`/day/${p.fit_splitdayid}`)} data-telemetry-name="open-preset">
              {isCustomPreset(p) && <span className="pt-badge">Custom</span>}
              <div className="pt-name">{presetLabel(p)}</div>
              <div className="pt-sub">{exCount[p.fit_splitdayid] ?? 0} exercises{restMap[p.fit_splitdayid] ? ` · ${restMap[p.fit_splitdayid]}` : ''}</div>
              {missingMap[p.fit_splitdayid] > 0 && <div className="pt-gear">⚠ missing {missingMap[p.fit_splitdayid]} gear</div>}
            </div>
          ))}
          <div className="preset-tile create" onClick={() => setCreating(true)} data-telemetry-name="create-preset">
            <div className="pt-plus"><IconPlus size={22} /></div>
            <div className="pt-name">Create</div>
            <div className="pt-sub">your own preset</div>
          </div>
        </div>
      </section>

      {creating && (
        <Modal title="Create a preset" onClose={() => setCreating(false)}>
          <div className="field">
            <label>Name</label>
            <input className="input" value={newName} placeholder={newFocus} onChange={(e) => setNewName(e.target.value)} data-telemetry-name="preset-name" />
          </div>
          <div className="field">
            <label>Muscle group</label>
            <select className="select" value={newFocus} onChange={(e) => setNewFocus(e.target.value)} data-telemetry-name="preset-focus">
              {FOCUS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <button className="btn block" onClick={createNew} data-telemetry-name="preset-create-confirm"><IconPlus size={16} /> Create &amp; add exercises</button>
        </Modal>
      )}
    </div>
  );
}
