import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  updatePlannedExercise, deletePlannedExercise,
  updateSplitDay, deleteSplitDay, createPreset, getStructure, invalidateStructure,
  FOCUS, focusLabel, focusValue,
  type WorkoutPlan, type SplitDay, type PlannedExercise,
} from '../lib/fitness';
import { useApp } from '../lib/appContext';
import { plannedImage } from '../lib/exerciseDb';
import { Loader, Empty, Thumb, Modal } from '../ui/common';
import { IconTrash, IconPlus } from '../ui/icons';

export function MySplit() {
  const nav = useNavigate();
  const { toast } = useApp();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [presets, setPresets] = useState<SplitDay[]>([]);
  const [exMap, setExMap] = useState<Record<string, PlannedExercise[]>>({});
  const [creating, setCreating] = useState(false);
  const [newFocus, setNewFocus] = useState('Arms');
  const [newName, setNewName] = useState('');

  async function reload(force = false) {
    const s = await getStructure(force);
    setPlan(s.plan);
    setPresets(s.presets);
    setExMap(s.exByDay);
  }

  useEffect(() => {
    const t0 = performance.now();
    (async () => {
      try { await reload(); }
      catch (e) { toast((e as Error).message, 'err'); }
      finally { setLoading(false); console.log('[telemetry] screen_load_ms', { screen: 'plan', ms: Math.round(performance.now() - t0) }); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function changeFocus(d: SplitDay, focus: number) {
    setPresets((prev) => prev.map((x) => (x.fit_splitdayid === d.fit_splitdayid ? { ...x, fit_focus: focus, fit_name: focusLabel(focus) } : x)));
    try { await updateSplitDay(d.fit_splitdayid, { fit_focus: focus, fit_name: focusLabel(focus) }); invalidateStructure(); }
    catch (e) { toast((e as Error).message, 'err'); }
  }

  function editEx(dayId: string, exId: string, patch: Partial<PlannedExercise>) {
    setExMap((prev) => ({ ...prev, [dayId]: prev[dayId].map((e) => (e.fit_plannedexerciseid === exId ? { ...e, ...patch } : e)) }));
  }
  async function persistEx(exId: string, patch: Partial<PlannedExercise>) {
    try { await updatePlannedExercise(exId, patch); invalidateStructure(); } catch (e) { toast((e as Error).message, 'err'); }
  }
  async function removeEx(dayId: string, exId: string) {
    setExMap((prev) => ({ ...prev, [dayId]: prev[dayId].filter((e) => e.fit_plannedexerciseid !== exId) }));
    try { await deletePlannedExercise(exId); invalidateStructure(); toast('Exercise removed'); } catch (e) { toast((e as Error).message, 'err'); }
  }
  async function removePreset(d: SplitDay) {
    if (!confirm(`Delete the “${focusLabel(d.fit_focus)}” preset?`)) return;
    setPresets((prev) => prev.filter((x) => x.fit_splitdayid !== d.fit_splitdayid));
    try { await deleteSplitDay(d.fit_splitdayid); invalidateStructure(); toast('Preset deleted'); } catch (e) { toast((e as Error).message, 'err'); }
  }
  async function createNew() {
    if (!plan) return;
    try {
      const id = await createPreset(plan.fit_workoutplanid, focusValue(newFocus), newName.trim() || newFocus, presets.length + 1);
      invalidateStructure();
      toast('Preset created — add exercises');
      setCreating(false); setNewName('');
      nav(`/library?preset=${id}`);
    } catch (e) { toast((e as Error).message, 'err'); }
  }

  if (loading) return <Loader label="Loading your presets…" />;
  if (!plan) return <Empty title="No presets yet" sub="Your preset library should have been seeded — check Dataverse." />;

  return (
    <div className="screen">
      <header className="screen-head">
        <div className="eyebrow">Your templates</div>
        <h1>Presets</h1>
        <p>{presets.length} workout presets · edit exercises or build your own.</p>
      </header>

      <button className="btn block" style={{ marginTop: 14 }} onClick={() => setCreating(true)} data-telemetry-name="create-preset"><IconPlus size={16} /> Create a preset</button>

      {presets.map((d) => (
        <section className="section" key={d.fit_splitdayid}>
          <div className="card">
            <div className="row" style={{ marginBottom: 14, alignItems: 'center' }}>
              <div className="field" style={{ marginBottom: 0, flex: 1 }}>
                <label>Muscle group</label>
                <select className="select" value={focusLabel(d.fit_focus)} onChange={(e) => changeFocus(d, focusValue(e.target.value))} data-telemetry-name="edit-focus">
                  {FOCUS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <button className="btn ghost sm" onClick={() => removePreset(d)} title="Delete preset" data-telemetry-name="delete-preset"><IconTrash size={16} /></button>
            </div>

            <div className="list">
              {(exMap[d.fit_splitdayid] || []).map((ex) => (
                <div key={ex.fit_plannedexerciseid} className="list-row ms-row">
                  <div className="ms-exinfo" onClick={() => ex.fit_exerciseexternalid && nav(`/exercise/${encodeURIComponent(ex.fit_exerciseexternalid)}`)} data-telemetry-name="open-exercise">
                    <Thumb url={plannedImage(ex.fit_exerciseexternalid)} alt={ex.fit_name} />
                    <div className="grow">
                      <div className="t">{ex.fit_name}</div>
                      <div className="s">{ex.fit_primarymuscle} · {ex.fit_equipment}</div>
                    </div>
                  </div>
                  <div className="ms-controls">
                    <input className="input" value={ex.fit_targetsets ?? ''} title="Sets"
                      onChange={(e) => editEx(d.fit_splitdayid, ex.fit_plannedexerciseid, { fit_targetsets: parseInt(e.target.value, 10) || 0 })}
                      onBlur={() => persistEx(ex.fit_plannedexerciseid, { fit_targetsets: ex.fit_targetsets })}
                      data-telemetry-name="edit-sets" />
                    <span style={{ color: 'var(--ink-3)' }}>×</span>
                    <input className="input reps" value={ex.fit_targetreps ?? ''} title="Reps"
                      onChange={(e) => editEx(d.fit_splitdayid, ex.fit_plannedexerciseid, { fit_targetreps: e.target.value })}
                      onBlur={() => persistEx(ex.fit_plannedexerciseid, { fit_targetreps: ex.fit_targetreps })}
                      data-telemetry-name="edit-reps" />
                    <span className="spacer" style={{ flex: 1 }} />
                    <button className="btn ghost sm" onClick={() => removeEx(d.fit_splitdayid, ex.fit_plannedexerciseid)} title="Remove" data-telemetry-name="remove-exercise"><IconTrash size={16} /></button>
                  </div>
                </div>
              ))}
              {!(exMap[d.fit_splitdayid] || []).length && (
                <div className="row" style={{ alignItems: 'center' }}>
                  <span style={{ color: 'var(--ink-3)', fontSize: '0.85rem', flex: 1 }}>No exercises yet.</span>
                  <button className="btn secondary sm" onClick={() => nav(`/library?preset=${d.fit_splitdayid}`)} data-telemetry-name="add-exercises"><IconPlus size={14} /> Add</button>
                </div>
              )}
            </div>
          </div>
        </section>
      ))}

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
