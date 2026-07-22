import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  getSessions, getAllLogs, getStructure, sessionDay, weekRange, STATUS_COMPLETED,
  sessionFocusLabel, deleteSessionCascade,
  type WorkoutSession, type ExerciseLog, type SplitDay,
} from '../lib/fitness';
import { useApp } from '../lib/appContext';
import { fromLb } from '../lib/units';
import { Loader, Empty, StatusBadge } from '../ui/common';
import { SwipeRow } from '../ui/SwipeRow';

export function Progress() {
  const nav = useNavigate();
  const { unit, toast } = useApp();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [logs, setLogs] = useState<ExerciseLog[]>([]);
  const [daysById, setDaysById] = useState<Record<string, SplitDay>>({});

  useEffect(() => {
    const t0 = performance.now();
    (async () => {
      try {
        const [s, l, structure] = await Promise.all([getSessions(300), getAllLogs(2000), getStructure()]);
        setSessions(s);
        setLogs(l);
        const m: Record<string, SplitDay> = {};
        structure.presets.forEach((p) => { m[p.fit_splitdayid] = p; });
        setDaysById(m);
      } catch (e) {
        toast((e as Error).message, 'err');
      } finally {
        setLoading(false);
        console.log('[telemetry] screen_load_ms', { screen: 'progress', ms: Math.round(performance.now() - t0) });
      }
    })();
  }, [toast]);

  async function removeSession(s: WorkoutSession) {
    const prev = sessions;
    setSessions((cur) => cur.filter((x) => x.fit_workoutsessionid !== s.fit_workoutsessionid));
    setLogs((cur) => cur.filter((l) => l._fit_session_value !== s.fit_workoutsessionid));
    try {
      await deleteSessionCascade(s.fit_workoutsessionid);
      toast('Workout deleted');
    } catch (e) {
      setSessions(prev);
      toast((e as Error).message, 'err');
    }
  }

  const sessionDate = useMemo(() => {
    const m: Record<string, string> = {};
    sessions.forEach((s) => { m[s.fit_workoutsessionid] = s.fit_sessiondate || ''; });
    return m;
  }, [sessions]);

  const weekly = useMemo(() => {
    const weeks: { label: string; start: dayjs.Dayjs }[] = [];
    for (let i = 5; i >= 0; i--) weeks.push({ label: dayjs().subtract(i, 'week').startOf('week').format('MMM D'), start: dayjs().subtract(i, 'week').startOf('week') });
    const vols = weeks.map((w) => {
      let vol = 0;
      logs.forEach((l) => {
        const d = sessionDate[l._fit_session_value || ''];
        if (!d) return;
        const dd = dayjs(d);
        if (dd.isAfter(w.start.subtract(1, 'day')) && dd.isBefore(w.start.add(7, 'day'))) {
          vol += (l.fit_reps || 0) * (l.fit_weightlb || 0);
        }
      });
      return vol;
    });
    const max = Math.max(1, ...vols);
    return weeks.map((w, i) => ({ label: w.label, vol: vols[i], pct: (vols[i] / max) * 100 }));
  }, [logs, sessionDate]);

  const topEx = useMemo(() => {
    const m: Record<string, number> = {};
    logs.forEach((l) => { const n = l.fit_exercisename || 'Unknown'; m[n] = (m[n] || 0) + (l.fit_reps || 0) * (l.fit_weightlb || 0); });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [logs]);

  const totalVolLb = useMemo(() => logs.reduce((sum, l) => sum + (l.fit_reps || 0) * (l.fit_weightlb || 0), 0), [logs]);

  const stats = useMemo(() => {
    const completed = sessions.filter((s) => s.fit_status === STATUS_COMPLETED).length;
    const startOfWeek = weekRange().start;
    const thisWeek = sessions.filter((s) => sessionDay(s.fit_sessiondate).isAfter(startOfWeek.subtract(1, 'second'))).length;
    return { total: sessions.length, completed, thisWeek };
  }, [sessions]);

  // 49-day heatmap (7 weeks).
  const heat = useMemo(() => {
    const counts: Record<string, number> = {};
    const labels: Record<string, string[]> = {};
    sessions.forEach((s) => {
      const d = sessionDay(s.fit_sessiondate).format('YYYY-MM-DD');
      counts[d] = (counts[d] || 0) + 1;
      (labels[d] ||= []).push(sessionFocusLabel(s, daysById));
    });
    const cells: { date: string; n: number; label: string }[] = [];
    const start = dayjs().subtract(48, 'day');
    for (let i = 0; i < 49; i++) {
      const d = start.add(i, 'day').format('YYYY-MM-DD');
      const uniq = Array.from(new Set(labels[d] || []));
      cells.push({ date: d, n: counts[d] || 0, label: uniq.join(' + ') });
    }
    return cells;
  }, [sessions, daysById]);

  const fmtVol = (lb: number) => `${Math.round(fromLb(lb, unit)).toLocaleString()} ${unit}`;

  if (loading) return <Loader label="Crunching your numbers…" />;

  return (
    <div className="screen">
      <header className="screen-head">
        <div className="eyebrow">Your training</div>
        <h1>Progress</h1>
        <p>Volume = reps × weight · {stats.total} sessions logged.</p>
      </header>

      <section className="section" style={{ marginTop: 16 }}>
        <div className="stat-row">
          <div className="stat"><div className="v">{fmtVol(totalVolLb)}</div><div className="l">Total volume</div></div>
          <div className="stat"><div className="v">{logs.length}</div><div className="l">Sets done</div></div>
          <div className="stat"><div className="v">{stats.completed}</div><div className="l">Completed</div></div>
          <div className="stat"><div className="v">{stats.thisWeek}<span style={{ fontSize: '0.9rem', color: 'var(--ink-3)' }}>/4</span></div><div className="l">This week</div></div>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>Consistency · last 7 weeks</h2></div>
        <div className="card"><div className="heatmap">
          {heat.map((c) => (
            <div key={c.date} className={`cell ${c.n >= 2 ? 'l3' : c.n === 1 ? 'l2' : ''}`} title={`${c.date}: ${c.n} workout${c.n === 1 ? '' : 's'}${c.label ? ' · ' + c.label : ''}`}>
              {c.n > 0 && c.label && <span className="cell-label">{c.label}</span>}
            </div>
          ))}
        </div></div>
      </section>

      {logs.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Weekly volume ({unit})</h2></div>
          <div className="card">
            <div className="bar-chart">
              {weekly.map((w) => (
                <div key={w.label} className="bar-col">
                  <div className="bv">{w.vol ? Math.round(fromLb(w.vol, unit) / 1000) + 'k' : ''}</div>
                  <div className="bar" style={{ height: `${Math.max(2, w.pct)}%` }} />
                  <div className="bl">{w.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head"><h2>History</h2></div>
        {!sessions.length ? (
          <Empty title="No workouts yet" sub="Start one from the Home tab.">
            <button className="btn" onClick={() => nav('/')} data-telemetry-name="go-today">Go to Home</button>
          </Empty>
        ) : (
          <div className="list">
            {sessions.map((s) => (
              <SwipeRow key={s.fit_workoutsessionid} onDelete={() => removeSession(s)}>
                <div className="list-row tappable" onClick={() => nav(`/session/${s.fit_workoutsessionid}`)} data-telemetry-name="open-session">
                  <div className="grow">
                    <div className="t">{sessionFocusLabel(s, daysById)}</div>
                    <div className="s">{sessionDay(s.fit_sessiondate).format('ddd, MMM D')}{s.fit_durationmin ? ` · ${s.fit_durationmin} min` : ''}</div>
                  </div>
                  {s.fit_status != null && <StatusBadge status={s.fit_status} />}
                </div>
              </SwipeRow>
            ))}
          </div>
        )}
      </section>

      {logs.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Top exercises by volume</h2></div>
          <div className="list">
            {topEx.map(([name, vol]) => (
              <div key={name} className="list-row">
                <div className="grow"><div className="t">{name}</div></div>
                <span className="pill red">{fmtVol(vol)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
