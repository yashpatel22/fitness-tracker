import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  updatePlannedExercise, deletePlannedExercise,
  updateSplitDay, deleteSplitDay, createPreset, getStructure, invalidateStructure,
  FOCUS, focusLabel, focusValue, presetLabel, isCustomPreset, restOf, restSummary,
  type WorkoutPlan, type SplitDay, type PlannedExercise,
} from '../lib/fitness';
import { useApp } from '../lib/appContext';
import { plannedImage } from '../lib/exerciseDb';
import { Loader, Empty, Thumb, Modal } from '../ui/common';
import { IconTrash, IconPlus, IconEdit, IconCheck, IconX, IconGrip } from '../ui/icons';

// A staged copy of one exercise while its preset is being edited. Nothing is
// written to the backend until "Save preset" — so removals/edits are reversible
// with Cancel and the user gets a clear, explicit save.
interface EditEx {
  id: string;
  name: string;
  extId?: string;
  muscle?: string;
  equipment?: string;
  sets: string;
  reps: string;
  rest: string;
  origSets?: number;
  origReps?: string;
  origRest?: number;
  origSort?: number;
  removed: boolean;
}

export function MySplit() {
  const nav = useNavigate();
  const { toast } = useApp();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [presets, setPresets] = useState<SplitDay[]>([]);
  const [exMap, setExMap] = useState<Record<string, PlannedExercise[]>>({});

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editFocus, setEditFocus] = useState('Arms');
  const [editExs, setEditExs] = useState<EditEx[]>([]);
  const [saving, setSaving] = useState(false);

  const [creating, setCreating] = useState(false);
  const [newFocus, setNewFocus] = useState('Arms');
  const [newName, setNewName] = useState('');

  // ---- Drag-to-reorder (edit mode only) ----
  // Pointer-based so it works with touch on the installed PWA. A grip handle
  // captures the pointer; as it moves over other rows we splice the staged
  // editExs into the new order. Order is committed (fit_sortorder) on Save.
  const listRef = useRef<HTMLDivElement>(null);
  const dragIdRef = useRef<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  function onGripDown(e: React.PointerEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    dragIdRef.current = id;
    setDragId(id);
  }
  function onGripMove(e: React.PointerEvent) {
    if (!dragIdRef.current || !listRef.current) return;
    const rows = Array.from(listRef.current.querySelectorAll<HTMLElement>('.ms-row'));
    const y = e.clientY;
    let target = rows.length - 1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) { target = i; break; }
    }
    setEditExs((prev) => {
      const from = prev.findIndex((x) => x.id === dragIdRef.current);
      if (from < 0 || target < 0 || target >= prev.length || from === target) return prev;
      const next = prev.slice();
      const [it] = next.splice(from, 1);
      next.splice(target, 0, it);
      return next;
    });
  }
  function onGripUp(e: React.PointerEvent) {
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    dragIdRef.current = null;
    setDragId(null);
  }

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

  // ---- Edit mode (one preset at a time; all changes staged until Save) ----
  function startEdit(d: SplitDay) {
    setEditingId(d.fit_splitdayid);
    setEditName(presetLabel(d));
    setEditFocus(focusLabel(d.fit_focus) || 'Arms');
    setEditExs((exMap[d.fit_splitdayid] || []).map((e) => ({
      id: e.fit_plannedexerciseid,
      name: e.fit_name,
      extId: e.fit_exerciseexternalid,
      muscle: e.fit_primarymuscle,
      equipment: e.fit_equipment,
      sets: String(e.fit_targetsets ?? 3),
      reps: e.fit_targetreps ?? '8-12',
      rest: String(restOf(e)),
      origSets: e.fit_targetsets,
      origReps: e.fit_targetreps,
      origRest: restOf(e),
      origSort: e.fit_sortorder,
      removed: false,
    })));
  }
  function cancelEdit() {
    setEditingId(null);
    setEditExs([]);
  }
  function patchEx(id: string, patch: Partial<EditEx>) {
    setEditExs((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }
  function bumpEditRest(id: string, delta: number) {
    setEditExs((prev) => prev.map((e) => {
      if (e.id !== id) return e;
      const next = Math.max(15, Math.min(600, (parseInt(e.rest, 10) || 0) + delta));
      return { ...e, rest: String(next) };
    }));
  }
  function toggleRemove(id: string) {
    setEditExs((prev) => prev.map((e) => (e.id === id ? { ...e, removed: !e.removed } : e)));
  }

  async function saveEdit(d: SplitDay): Promise<boolean> {
    setSaving(true);
    try {
      let pos = 0;
      for (const ex of editExs) {
        if (ex.removed) { await deletePlannedExercise(ex.id); continue; }
        pos += 1;
        const sets = parseInt(ex.sets, 10) || 0;
        const rest = parseInt(ex.rest, 10) || 0;
        const body: Partial<PlannedExercise> = {};
        if (sets !== ex.origSets || ex.reps !== ex.origReps || rest !== ex.origRest) {
          body.fit_targetsets = sets; body.fit_targetreps = ex.reps; body.fit_restsec = rest;
        }
        if (pos !== ex.origSort) body.fit_sortorder = pos;
        if (Object.keys(body).length) await updatePlannedExercise(ex.id, body);
      }
      await updateSplitDay(d.fit_splitdayid, {
        fit_name: editName.trim() || focusLabel(focusValue(editFocus)),
        fit_focus: focusValue(editFocus),
      });
      invalidateStructure();
      await reload(true);
      toast('Preset saved');
      setEditingId(null);
      setEditExs([]);
      return true;
    } catch (e) {
      toast((e as Error).message, 'err');
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Persist current staged edits first (so nothing is lost), then jump to the
  // Library to add exercises to this preset.
  async function addExercises(d: SplitDay) {
    const ok = await saveEdit(d);
    if (ok) nav(`/library?preset=${d.fit_splitdayid}`);
  }

  async function deletePreset(d: SplitDay) {
    if (!confirm(`Delete the “${presetLabel(d)}” preset? This can’t be undone.`)) return;
    setPresets((prev) => prev.filter((x) => x.fit_splitdayid !== d.fit_splitdayid));
    setEditingId(null);
    try { await deleteSplitDay(d.fit_splitdayid); invalidateStructure(); toast('Preset deleted'); }
    catch (e) { toast((e as Error).message, 'err'); await reload(true); }
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
  if (!plan) return <Empty title="No presets yet" sub="Your preset library should have been seeded." />;

  const kept = editExs.filter((e) => !e.removed).length;

  return (
    <div className="screen">
      <header className="screen-head">
        <div className="eyebrow">Your templates</div>
        <h1>Presets</h1>
        <p>{presets.length} workout presets · tap Edit to change one.</p>
      </header>

      <button className="btn block" style={{ marginTop: 14 }} onClick={() => setCreating(true)} data-telemetry-name="create-preset"><IconPlus size={16} /> Create a preset</button>

      {presets.map((d) => {
        const exs = exMap[d.fit_splitdayid] || [];
        const isEditing = editingId === d.fit_splitdayid;

        if (!isEditing) {
          return (
            <section className="section" key={d.fit_splitdayid}>
              <div className={`card ms-card${isCustomPreset(d) ? ' custom' : ''}`}>
                <div className="ms-head">
                  <div className="ms-head-main">
                    <div className="ms-title">{presetLabel(d)}{isCustomPreset(d) && <span className="ms-badge">Custom</span>}</div>
                    <div className="ms-sub">{focusLabel(d.fit_focus)} · {exs.length} exercise{exs.length === 1 ? '' : 's'}{exs.length ? ` · ${restSummary(exs)}` : ''}</div>
                  </div>
                  <button className="btn secondary sm" onClick={() => startEdit(d)} disabled={!!editingId} data-telemetry-name="edit-preset"><IconEdit size={15} /> Edit</button>
                </div>
                <div className="list ms-ro-list">
                  {exs.map((ex) => (
                    <div key={ex.fit_plannedexerciseid} className="list-row tappable ms-ro-row" onClick={() => ex.fit_exerciseexternalid && nav(`/exercise/${encodeURIComponent(ex.fit_exerciseexternalid)}`)} data-telemetry-name="open-exercise">
                      <Thumb url={plannedImage(ex.fit_exerciseexternalid)} alt={ex.fit_name} />
                      <div className="grow">
                        <div className="t">{ex.fit_name}</div>
                        <div className="s">{ex.fit_targetsets} × {ex.fit_targetreps} · {ex.fit_primarymuscle}</div>
                      </div>
                      <span className="ms-rest-ro">{restOf(ex)}s<em>rest</em></span>
                    </div>
                  ))}
                  {!exs.length && <div className="ms-empty">No exercises yet — tap Edit to add some.</div>}
                </div>
              </div>
            </section>
          );
        }

        return (
          <section className="section" key={d.fit_splitdayid}>
            <div className="card ms-card ms-editing">
              <div className="field">
                <label>Preset name</label>
                <input className="input" value={editName} placeholder={editFocus} onChange={(e) => setEditName(e.target.value)} data-telemetry-name="edit-name" />
              </div>
              <div className="field">
                <label>Muscle group</label>
                <select className="select" value={editFocus} onChange={(e) => setEditFocus(e.target.value)} data-telemetry-name="edit-focus">
                  {FOCUS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>

              <div className="ms-edit-exhead"><span>Exercises</span><span className="pill">{kept}</span></div>
              <div className="list" ref={listRef}>
                {editExs.map((ex) => (
                  <div key={ex.id} className={`list-row ms-row ${ex.removed ? 'removed' : ''} ${dragId === ex.id ? 'dragging' : ''}`}>
                    <button className="ms-grip" onPointerDown={(e) => onGripDown(e, ex.id)} onPointerMove={onGripMove} onPointerUp={onGripUp} onClick={(e) => e.stopPropagation()} disabled={ex.removed} aria-label="Drag to reorder" title="Drag to reorder" data-telemetry-name="reorder-grip">
                      <IconGrip size={18} />
                    </button>
                    <div className="ms-exinfo" onClick={() => ex.extId && nav(`/exercise/${encodeURIComponent(ex.extId)}`)} data-telemetry-name="open-exercise">
                      <Thumb url={plannedImage(ex.extId)} alt={ex.name} />
                      <div className="grow">
                        <div className="t">{ex.name}</div>
                        <div className="s">{ex.muscle}{ex.equipment ? ` · ${ex.equipment}` : ''}</div>
                      </div>
                    </div>
                    <div className="ms-controls">
                      <input className="input" value={ex.sets} title="Sets" disabled={ex.removed}
                        onChange={(e) => patchEx(ex.id, { sets: e.target.value })} data-telemetry-name="edit-sets" />
                      <span style={{ color: 'var(--ink-3)' }}>×</span>
                      <input className="input reps" value={ex.reps} title="Reps" disabled={ex.removed}
                        onChange={(e) => patchEx(ex.id, { reps: e.target.value })} data-telemetry-name="edit-reps" />
                      <div className="ms-rest-step" title="Rest between sets">
                        <button onClick={() => bumpEditRest(ex.id, -15)} disabled={ex.removed} aria-label="Less rest" data-telemetry-name="edit-rest-minus">−</button>
                        <span className="ms-rest-val">{ex.rest}s<em>rest</em></span>
                        <button onClick={() => bumpEditRest(ex.id, 15)} disabled={ex.removed} aria-label="More rest" data-telemetry-name="edit-rest-plus">+</button>
                      </div>
                      <span className="spacer" style={{ flex: 1 }} />
                      <button className="btn ghost sm" onClick={() => toggleRemove(ex.id)} title={ex.removed ? 'Keep' : 'Remove'} data-telemetry-name="remove-exercise">
                        {ex.removed ? <IconPlus size={16} /> : <IconTrash size={16} />}
                      </button>
                    </div>
                  </div>
                ))}
                {!editExs.length && <div className="ms-empty">No exercises — add some below.</div>}
              </div>

              <button className="btn secondary block" style={{ marginTop: 12 }} onClick={() => addExercises(d)} data-telemetry-name="add-exercises"><IconPlus size={15} /> Add exercises</button>

              <div className="ms-save-row">
                <button className="btn ghost" onClick={cancelEdit} data-telemetry-name="cancel-edit"><IconX size={15} /> Cancel</button>
                <button className="btn" disabled={saving} onClick={() => saveEdit(d)} data-telemetry-name="save-preset"><IconCheck size={16} /> Save preset</button>
              </div>

              <button className="ms-delete" onClick={() => deletePreset(d)} data-telemetry-name="delete-preset"><IconTrash size={14} /> Delete preset</button>
            </div>
          </section>
        );
      })}

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
