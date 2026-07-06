import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { loadExercises, titleCase, plannedImage, type Exercise } from '../lib/exerciseDb';
import {
  getStructure, invalidateStructure, createPlannedExercise, getPlannedExercises, deletePlannedExercise,
  focusLabel, presetLabel, type SplitDay, type PlannedExercise,
} from '../lib/fitness';
import { useApp } from '../lib/appContext';
import { Loader, ExerciseCard, Modal, Thumb } from '../ui/common';
import { IconSearch, IconPlus, IconCheck, IconTrash } from '../ui/icons';

export function Library() {
  const { toast } = useApp();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const presetId = sp.get('preset') || '';
  const [loading, setLoading] = useState(true);
  const [all, setAll] = useState<Exercise[]>([]);
  const [muscle, setMuscle] = useState('');
  const [equipment, setEquipment] = useState('');
  const [level, setLevel] = useState('');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState<Exercise | null>(null);
  const [days, setDays] = useState<SplitDay[]>([]);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [presetExs, setPresetExs] = useState<PlannedExercise[]>([]);

  useEffect(() => {
    const t0 = performance.now();
    (async () => {
      try {
        const [ex, structure] = await Promise.all([loadExercises(), getStructure()]);
        setAll(ex);
        setDays(structure.presets);
        if (presetId) {
          const cur = await getPlannedExercises(presetId);
          setPresetExs(cur);
          setAddedIds(new Set(cur.map((e) => e.fit_exerciseexternalid || '')));
        }
      } catch (e) {
        toast((e as Error).message, 'err');
      } finally {
        setLoading(false);
        console.log('[telemetry] screen_load_ms', { screen: 'library', ms: Math.round(performance.now() - t0) });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, presetId]);

  const targetPreset = days.find((d) => d.fit_splitdayid === presetId) || null;

  const muscles = useMemo(() => Array.from(new Set(all.flatMap((e) => e.primaryMuscles))).sort(), [all]);
  const equipments = useMemo(() => Array.from(new Set(all.map((e) => e.equipment).filter(Boolean) as string[])).sort(), [all]);

  const filtered = useMemo(() => all.filter((e) => {
    if (muscle && !e.primaryMuscles.includes(muscle)) return false;
    if (equipment && e.equipment !== equipment) return false;
    if (level && e.level !== level) return false;
    if (q && !e.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [all, muscle, equipment, level, q]);

  async function addToDay(dayId: string, ex: Exercise) {
    try {
      const existing = await getPlannedExercises(dayId);
      await createPlannedExercise(dayId, {
        fit_name: ex.name,
        fit_exerciseexternalid: ex.id,
        fit_primarymuscle: ex.primaryMuscles[0] || '',
        fit_equipment: ex.equipment || '',
        fit_targetsets: 3,
        fit_targetreps: '8-12',
        fit_imageurl: '',
        fit_sortorder: existing.length + 1,
      });
      invalidateStructure();
      toast(`Added ${ex.name} to ${focusLabel(days.find((d) => d.fit_splitdayid === dayId)?.fit_focus)}`);
      setAdding(null);
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  }

  // When arriving with ?preset=, the Add button adds straight to that preset.
  async function quickAdd(ex: Exercise) {
    await addToDay(presetId, ex);
    setAddedIds((prev) => new Set(prev).add(ex.id));
    try { setPresetExs(await getPlannedExercises(presetId)); } catch { /* ignore */ }
  }

  async function removeFromPreset(pe: PlannedExercise) {
    setPresetExs((prev) => prev.filter((x) => x.fit_plannedexerciseid !== pe.fit_plannedexerciseid));
    setAddedIds((prev) => { const n = new Set(prev); n.delete(pe.fit_exerciseexternalid || ''); return n; });
    try { await deletePlannedExercise(pe.fit_plannedexerciseid); invalidateStructure(); }
    catch (e) { toast((e as Error).message, 'err'); }
  }

  if (loading) return <Loader label="Loading exercise library…" />;

  return (
    <div className="screen">
      <header className="screen-head">
        <div className="eyebrow">Browse</div>
        <h1>Library</h1>
        <p>{all.length} exercises with animated diagrams &amp; instructions.</p>
      </header>

      {targetPreset && (
        <section className="section" style={{ marginTop: 14 }}>
          <div className="start">
            <div className="eyebrow">Building preset</div>
            <h2>Adding to {presetLabel(targetPreset)}</h2>
            <p>Tap “Add” on any exercise below. Your picks show here — remove any before you finish.</p>
            <div className="start-actions">
              <button className="btn" onClick={() => nav('/plan')} data-telemetry-name="done-adding"><IconCheck size={16} /> Done</button>
            </div>
          </div>

          <div className="card lib-chosen">
            <div className="section-head"><h2>In this preset</h2><span className="spacer" /><span className="pill">{presetExs.length}</span></div>
            {presetExs.length ? (
              <div className="list">
                {presetExs.map((pe) => (
                  <div key={pe.fit_plannedexerciseid} className="list-row">
                    <Thumb url={plannedImage(pe.fit_exerciseexternalid)} alt={pe.fit_name} />
                    <div className="grow">
                      <div className="t">{pe.fit_name}</div>
                      <div className="s">{pe.fit_primarymuscle}{pe.fit_equipment ? ` · ${pe.fit_equipment}` : ''}</div>
                    </div>
                    <button className="btn ghost sm" onClick={() => removeFromPreset(pe)} title="Remove" data-telemetry-name="remove-chosen"><IconTrash size={16} /></button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: '0.85rem' }}>No exercises chosen yet — add some below.</p>
            )}
          </div>
        </section>
      )}

      <section className="section" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="field">
            <label>Search</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: 11, color: 'var(--ink-3)' }}><IconSearch size={17} /></span>
              <input className="input" style={{ paddingLeft: 34 }} value={q} placeholder="squat, bench, row…"
                onChange={(e) => setQ(e.target.value)} data-telemetry-name="library-search" />
            </div>
          </div>
          <div className="row">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Muscle</label>
              <select className="select" value={muscle} onChange={(e) => setMuscle(e.target.value)} data-telemetry-name="filter-muscle">
                <option value="">Any</option>
                {muscles.map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Equipment</label>
              <select className="select" value={equipment} onChange={(e) => setEquipment(e.target.value)} data-telemetry-name="filter-equipment">
                <option value="">Any</option>
                {equipments.map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Level</label>
              <select className="select" value={level} onChange={(e) => setLevel(e.target.value)} data-telemetry-name="filter-level">
                <option value="">Any</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="expert">Expert</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>{filtered.length} exercises</h2></div>
        <div className="grid cols-3">
          {filtered.slice(0, 120).map((ex) => (
            <ExerciseCard key={ex.id} ex={ex} onOpen={() => nav(`/exercise/${encodeURIComponent(ex.id)}`)}
              footer={targetPreset ? (
                <button className={`btn sm block ${addedIds.has(ex.id) ? 'secondary' : ''}`} onClick={() => quickAdd(ex)} data-telemetry-name="quick-add">
                  {addedIds.has(ex.id) ? <><IconCheck size={15} /> Added</> : <><IconPlus size={15} /> Add</>}
                </button>
              ) : days.length ? (
                <button className="btn secondary sm block" onClick={() => setAdding(ex)} data-telemetry-name="add-to-split">
                  <IconPlus size={15} /> Add
                </button>
              ) : undefined} />
          ))}
        </div>
        {filtered.length > 120 && <p style={{ textAlign: 'center', marginTop: 16, color: 'var(--ink-3)', fontSize: '0.85rem' }}>Showing first 120 — refine filters to see more.</p>}
      </section>

      {adding && (
        <Modal title={`Add “${adding.name}”`} onClose={() => setAdding(null)}>
          <p style={{ marginTop: 0, color: 'var(--ink-2)', fontSize: '0.88rem' }}>Pick a preset (3 × 8–12 default).</p>
          <div className="list">
            {days.map((d) => (
              <div key={d.fit_splitdayid} className="list-row tappable" onClick={() => addToDay(d.fit_splitdayid, adding)} data-telemetry-name="pick-day">
                <div className="grow"><div className="t">{presetLabel(d)}</div><div className="s">{focusLabel(d.fit_focus)}</div></div>
                <span className="btn sm"><IconPlus size={14} /> Add</span>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
