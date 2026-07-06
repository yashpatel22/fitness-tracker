import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  getAllLogs, getSessions, getPRs, createPR, updatePR, est1RM, sessionDay,
  type ExerciseLog, type WorkoutSession, type PersonalRecord,
} from '../lib/fitness';
import { exportAll, importAll } from '../lib/dataverse';
import { useApp } from '../lib/appContext';
import { fromLb } from '../lib/units';
import { EQUIPMENT } from '../lib/equipment';
import { getExerciseByIdSync, titleCase } from '../lib/exerciseDb';
import { Loader } from '../ui/common';
import { IconCheck, IconTrophy } from '../ui/icons';

interface Best {
  extId: string;
  name: string;
  muscle: string;
  weightLb: number;
  reps: number;
  e1rm: number;
  date: string;
}

export function Profile() {
  const { displayName, setDisplayName, unit, setUnit, equipment, setEquipment, toast } = useApp();
  const [loading, setLoading] = useState(true);
  const [bests, setBests] = useState<Best[]>([]);
  const [nameDraft, setNameDraft] = useState(displayName);
  const fileRef = useRef<HTMLInputElement>(null);

  const toggleEquip = (eq: string) => {
    const has = equipment.includes(eq);
    setEquipment(has ? equipment.filter((e) => e !== eq) : [...equipment, eq]);
  };

  async function exportData() {
    try {
      const json = await exportAll();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fitness-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Backup downloaded');
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  }

  async function importData(file: File) {
    try {
      const text = await file.text();
      await importAll(text);
      toast('Backup restored — reloading…');
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  }

  useEffect(() => {
    const t0 = performance.now();
    (async () => {
      try {
        const [logs, sessions, prs] = await Promise.all([getAllLogs(2000), getSessions(300), getPRs()]);
        const dateOf: Record<string, string> = {};
        sessions.forEach((s: WorkoutSession) => { dateOf[s.fit_workoutsessionid] = s.fit_sessiondate || ''; });

        // Best weight per exercise from completed logs (tie-break on reps).
        const byEx = new Map<string, Best>();
        for (const l of logs as ExerciseLog[]) {
          const w = l.fit_weightlb || 0;
          if (w <= 0) continue;
          const extId = l.fit_exerciseexternalid || l.fit_exercisename || '';
          if (!extId) continue;
          const bundle = getExerciseByIdSync(l.fit_exerciseexternalid || '');
          const muscle = titleCase(bundle?.primaryMuscles?.[0] || 'Other');
          const cur = byEx.get(extId);
          const better = !cur || w > cur.weightLb || (w === cur.weightLb && (l.fit_reps || 0) > cur.reps);
          if (better) {
            byEx.set(extId, {
              extId,
              name: l.fit_exercisename || bundle?.name || extId,
              muscle,
              weightLb: w,
              reps: l.fit_reps || 0,
              e1rm: est1RM(w, l.fit_reps || 1),
              date: sessionDay(dateOf[l._fit_session_value || ''] || '').format('YYYY-MM-DD'),
            });
          }
        }
        const computed = Array.from(byEx.values());
        setBests(computed);
        setLoading(false);
        console.log('[telemetry] screen_load_ms', { screen: 'profile', ms: Math.round(performance.now() - t0) });

        // Persist to the PR table in the background (non-blocking): create new / update when heavier.
        const stored = new Map((prs as PersonalRecord[]).map((p) => [p.fit_exerciseexternalid || '', p]));
        void Promise.all(computed.map((b) => {
          const row = stored.get(b.extId);
          const body: Partial<PersonalRecord> = {
            fit_name: b.name,
            fit_exerciseexternalid: b.extId,
            fit_exercisename: b.name,
            fit_musclegroup: b.muscle,
            fit_maxweightlb: b.weightLb,
            fit_reps: b.reps,
            fit_est1rm: b.e1rm,
            ...(b.date ? { fit_achievedon: b.date } : {}),
          };
          if (!row) return createPR(body).catch(() => {});
          if ((row.fit_maxweightlb || 0) < b.weightLb) return updatePR(row.fit_personalrecordid!, body).catch(() => {});
          return Promise.resolve();
        }));
      } catch (e) {
        toast((e as Error).message, 'err');
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Group PRs by muscle group, each sorted by est 1RM desc.
  const groups = useMemo(() => {
    const m = new Map<string, Best[]>();
    for (const b of bests) {
      const arr = m.get(b.muscle) || [];
      arr.push(b);
      m.set(b.muscle, arr);
    }
    return Array.from(m.entries())
      .map(([muscle, items]) => ({ muscle, items: items.sort((a, b) => b.e1rm - a.e1rm) }))
      .sort((a, b) => b.items[0].e1rm - a.items[0].e1rm);
  }, [bests]);

  const fmt = (lb: number) => `${Math.round(fromLb(lb, unit) * 10) / 10} ${unit}`;

  return (
    <div className="screen">
      <header className="screen-head">
        <div className="eyebrow">{displayName}</div>
        <h1>Profile</h1>
        <p>Your units, equipment, and personal records.</p>
      </header>

      <section className="section" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="section-head"><h2>Your name</h2></div>
          <div className="row" style={{ alignItems: 'center', gap: 8 }}>
            <input
              className="input"
              style={{ flex: 1 }}
              value={nameDraft}
              placeholder="Athlete"
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => setDisplayName(nameDraft)}
              data-telemetry-name="name-input"
            />
            <button className="btn secondary sm" onClick={() => setDisplayName(nameDraft)} data-telemetry-name="name-save">Save</button>
          </div>
          <p style={{ margin: '10px 0 0', color: 'var(--ink-3)', fontSize: '0.78rem' }}>Shown on the Home greeting. Stored only on this device.</p>
        </div>
      </section>

      <section className="section">
        <div className="card">
          <div className="section-head"><h2>Units</h2></div>
          <div className="row" style={{ alignItems: 'center' }}>
            <span style={{ flex: 1, color: 'var(--ink-2)', fontSize: '0.88rem' }}>Display weights in</span>
            <div className="toggle">
              <button className={unit === 'lb' ? 'on' : ''} onClick={() => setUnit('lb')} data-telemetry-name="unit-lb">lb</button>
              <button className={unit === 'kg' ? 'on' : ''} onClick={() => setUnit('kg')} data-telemetry-name="unit-kg">kg</button>
            </div>
          </div>
          <p style={{ margin: '10px 0 0', color: 'var(--ink-3)', fontSize: '0.78rem' }}>Weights are always stored in lb and converted for display.</p>
        </div>
      </section>

      <section className="section">
        <div className="card">
          <div className="section-head"><h2>Equipment I have</h2><span className="spacer" /><span className="pill">{equipment.length}/{EQUIPMENT.length}</span></div>
          <p style={{ margin: '0 0 12px', color: 'var(--ink-2)', fontSize: '0.82rem' }}>Tap what you own. Workouts flag exercises you can’t do yet.</p>
          <div className="equip-grid">
            {EQUIPMENT.map((eq) => {
              const on = equipment.includes(eq);
              return (
                <button key={eq} className={`equip-chip ${on ? 'on' : ''}`} onClick={() => toggleEquip(eq)} data-telemetry-name="toggle-equipment">
                  <span className="ec-box">{on && <IconCheck size={13} />}</span> {eq}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><IconTrophy size={16} /><h2>Personal records</h2></div>
        {loading ? (
          <Loader label="Finding your PRs…" />
        ) : !bests.length ? (
          <div className="card"><p style={{ margin: 0, color: 'var(--ink-2)', fontSize: '0.88rem' }}>Log some sets with weight to start tracking PRs by muscle group and exercise.</p></div>
        ) : (
          groups.map((g) => (
            <div className="card pr-group" key={g.muscle}>
              <div className="pr-group-head">
                <span className="pr-muscle">{g.muscle}</span>
                <span className="pr-top">Top: {fmt(g.items[0].weightLb)}</span>
              </div>
              <div className="list">
                {g.items.map((b, i) => (
                  <div className={`pr-row ${i === 0 ? 'best' : ''}`} key={b.extId}>
                    <div className="grow">
                      <div className="t">{b.name}</div>
                      <div className="s">{b.reps} reps · est 1RM {fmt(b.e1rm)}{b.date ? ` · ${b.date}` : ''}</div>
                    </div>
                    <span className="pr-weight">{fmt(b.weightLb)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <section className="section">
        <div className="card">
          <div className="section-head"><h2>Backup &amp; data</h2></div>
          <p style={{ margin: '0 0 12px', color: 'var(--ink-2)', fontSize: '0.82rem' }}>
            Your workouts live only on this device. Export a backup you can save or move to another device.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" style={{ flex: 1 }} onClick={exportData} data-telemetry-name="export-data">Export backup</button>
            <button className="btn secondary" style={{ flex: 1 }} onClick={() => fileRef.current?.click()} data-telemetry-name="import-data">Import backup</button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importData(f); e.target.value = ''; }}
          />
          <p style={{ margin: '10px 0 0', color: 'var(--ink-3)', fontSize: '0.78rem' }}>Importing replaces your current data with the backup’s contents.</p>
        </div>
      </section>
    </div>
  );
}
