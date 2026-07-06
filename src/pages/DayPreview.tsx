import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  getSplitDay, getPlannedExercises, getSessions, createSession, getStructure,
  presetLabel, weekRange, sessionDay, STATUS_INPROGRESS, STATUS_COMPLETED,
  type SplitDay, type PlannedExercise,
} from '../lib/fitness';
import { useApp } from '../lib/appContext';
import { Loader } from '../ui/common';
import { Animator } from '../ui/Animator';
import { plannedImage, getExerciseByIdSync } from '../lib/exerciseDb';
import { normEquip, distinctEquipment } from '../lib/equipment';
import { IconBack, IconPlay, IconCheck } from '../ui/icons';

// Read-only preview of a day's workout. Same swipe-through-exercises navigation
// as the live player (animation + instructions), but no set logging. Also the
// "start page" the live workout's Back button returns to.
export function DayPreview() {
  const { dayId = '' } = useParams();
  const [sp] = useSearchParams();
  const startIdx = Math.max(0, parseInt(sp.get('ex') || '0', 10) || 0);
  const nav = useNavigate();
  const { toast, equipment } = useApp();
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState<SplitDay | null>(null);
  const [exs, setExs] = useState<PlannedExercise[]>([]);
  const [cur, setCur] = useState(startIdx);
  const [starting, setStarting] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t0 = performance.now();
    (async () => {
      try {
        const s = await getStructure();
        const d = s.presets.find((p) => p.fit_splitdayid === dayId) || null;
        if (d) {
          setDay(d);
          setExs(s.exByDay[d.fit_splitdayid] || []);
        } else {
          // Fallback for a day not in the active plan's cache.
          const fd = await getSplitDay(dayId);
          setDay(fd);
          setExs(fd ? await getPlannedExercises(fd.fit_splitdayid) : []);
        }
      } catch (e) {
        toast((e as Error).message, 'err');
      } finally {
        setLoading(false);
        console.log('[telemetry] screen_load_ms', { screen: 'day-preview', ms: Math.round(performance.now() - t0) });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayId]);

  // Jump to the tapped exercise once the panes are laid out.
  useEffect(() => {
    if (!loading && startIdx && trackRef.current) {
      trackRef.current.scrollLeft = startIdx * trackRef.current.clientWidth;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  function onScroll() {
    const el = trackRef.current; if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== cur) setCur(i);
  }
  function go(i: number) {
    const el = trackRef.current; if (!el) return;
    const idx = Math.max(0, Math.min(exs.length - 1, i));
    el.scrollTo({ left: idx * el.clientWidth, behavior: 'smooth' });
  }

  async function start() {
    if (!day) return;
    setStarting(true);
    try {
      const wkStart = weekRange().start;
      const wkEnd = wkStart.add(7, 'day');
      const sess = await getSessions(80);
      const open = sess.find((s) => {
        if (s._fit_splitday_value !== day.fit_splitdayid || s.fit_status === STATUS_COMPLETED) return false;
        const dd = sessionDay(s.fit_sessiondate);
        return dd.isAfter(wkStart.subtract(1, 'second')) && dd.isBefore(wkEnd);
      });
      if (open) { nav(`/session/${open.fit_workoutsessionid}`); return; }
      const id = await createSession(day.fit_splitdayid, {
        fit_name: `${presetLabel(day)} · ${dayjs().format('MMM D')}`,
        fit_sessiondate: `${dayjs().format('YYYY-MM-DD')}T00:00:00Z`,
        fit_status: STATUS_INPROGRESS,
      });
      toast('Workout started 💪');
      nav(`/session/${id}`);
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setStarting(false);
    }
  }

  if (loading) return <div className="player"><Loader label="Loading…" /></div>;
  if (!day) {
    return (
      <div className="player">
        <div className="pl-top">
          <button className="pl-icon" onClick={() => nav('/')} aria-label="Back" data-telemetry-name="day-back"><IconBack size={20} /></button>
          <div className="pl-title"><strong>Not found</strong></div>
          <span style={{ width: 40 }} />
        </div>
        <div className="pl-empty">This day no longer exists.</div>
      </div>
    );
  }

  const neededEquip = distinctEquipment(exs);
  const have = new Set(equipment);
  const missingEquip = neededEquip.filter((e) => !have.has(e));

  return (
    <div className="player">
      <div className="pl-top">
        <button className="pl-icon" onClick={() => nav('/')} aria-label="Back to home" data-telemetry-name="day-back"><IconBack size={20} /></button>
        <div className="pl-title">
          <strong>{presetLabel(day)}</strong>
          <span>{exs.length} exercises · preview</span>
        </div>
        <button className="pl-finish" disabled={starting} onClick={start} data-telemetry-name="start-from-preview"><IconPlay size={16} /> Start</button>
      </div>

      <div className="pl-segs">
        {exs.map((e, i) => <span key={e.fit_plannedexerciseid} className={`pl-seg ${i === cur ? 'on' : ''}`} onClick={() => go(i)} />)}
      </div>

      {neededEquip.length > 0 && (
        <div className="pl-gear">
          <span className="pl-gear-label">Gear{missingEquip.length ? ` · missing ${missingEquip.length}` : ' ready'}</span>
          <div className="pl-gear-chips">
            {neededEquip.map((eq) => {
              const owned = have.has(eq);
              return <span key={eq} className={`gear-chip ${owned ? 'have' : 'missing'}`}>{owned ? <IconCheck size={12} /> : '!'} {eq}</span>;
            })}
          </div>
        </div>
      )}

      <div className="pl-track" ref={trackRef} onScroll={onScroll}>
        {exs.map((ex) => {
          const b = getExerciseByIdSync(ex.fit_exerciseexternalid || '');
          const eq = normEquip(ex.fit_equipment);
          const missing = eq && !have.has(eq);
          return (
            <section className="pl-pane" key={ex.fit_plannedexerciseid}>
              <Animator a={plannedImage(ex.fit_exerciseexternalid, 0)} b={plannedImage(ex.fit_exerciseexternalid, 1)} alt={ex.fit_name} />
              <div className="pl-head">
                <div className="pl-head-row">
                  <h2>{ex.fit_name}</h2>
                  {missing && <span className="gear-chip missing sm">! {eq}</span>}
                </div>
                <div className="pl-meta">{ex.fit_primarymuscle}{ex.fit_equipment ? ` · ${ex.fit_equipment}` : ''} · target {ex.fit_targetsets} × {ex.fit_targetreps}</div>
              </div>
              <div className="section-head"><h2>How to do it</h2></div>
              <div className="card ex-detail-steps">
                {b && b.instructions.length ? (
                  <ol>{b.instructions.map((s, i) => <li key={i}><span className="step-n">{i + 1}</span><span>{s}</span></li>)}</ol>
                ) : <p style={{ color: 'var(--ink-2)', margin: 0 }}>Follow the animation above.</p>}
              </div>
            </section>
          );
        })}
      </div>

      <div className="pl-nav">
        <button onClick={() => go(cur - 1)} disabled={cur === 0} data-telemetry-name="prev-exercise">‹ Prev</button>
        <span className="pl-count">Exercise {cur + 1} of {exs.length}</span>
        <button onClick={() => go(cur + 1)} disabled={cur >= exs.length - 1} data-telemetry-name="next-exercise">Next ›</button>
      </div>
    </div>
  );
}
