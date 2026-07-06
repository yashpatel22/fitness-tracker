import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getExerciseByIdSync, exerciseImage, titleCase } from '../lib/exerciseDb';
import { Animator } from '../ui/Animator';
import { Empty } from '../ui/common';
import { IconBack } from '../ui/icons';

export function ExerciseDetail() {
  const { exId = '' } = useParams();
  const nav = useNavigate();
  const ex = useMemo(() => getExerciseByIdSync(decodeURIComponent(exId)), [exId]);

  if (!ex) {
    return (
      <div className="screen">
        <button className="btn ghost sm" onClick={() => nav(-1)} data-telemetry-name="ex-detail-back"><IconBack size={16} /> Back</button>
        <div style={{ marginTop: 16 }}><Empty title="Exercise not found" sub="This exercise isn’t in the bundled library." /></div>
      </div>
    );
  }

  return (
    <div className="screen ex-detail">
      <button className="btn ghost sm" onClick={() => nav(-1)} data-telemetry-name="ex-detail-back"><IconBack size={16} /> Back</button>

      <Animator a={exerciseImage(ex, 0)} b={exerciseImage(ex, 1)} alt={ex.name} className="ex-detail-anim" />

      <h1>{ex.name}</h1>
      <div className="ex-detail-meta">
        <span className="pill red">{titleCase(ex.category)}</span>
        {ex.equipment && <span className="pill">{titleCase(ex.equipment)}</span>}
        {ex.level && <span className="pill">{titleCase(ex.level)}</span>}
        {ex.mechanic && <span className="pill">{titleCase(ex.mechanic)}</span>}
        {ex.force && <span className="pill">{titleCase(ex.force)}</span>}
      </div>

      {(ex.primaryMuscles.length > 0 || ex.secondaryMuscles.length > 0) && (
        <div className="ex-detail-muscles">
          {ex.primaryMuscles.map((m) => <span key={m} className="pill red">{titleCase(m)}</span>)}
          {ex.secondaryMuscles.map((m) => <span key={m} className="pill">{titleCase(m)}</span>)}
        </div>
      )}

      <div className="section-head"><h2>How to do it</h2></div>
      <div className="card ex-detail-steps">
        {ex.instructions.length ? (
          <ol>
            {ex.instructions.map((step, i) => (
              <li key={i}><span className="step-n">{i + 1}</span><span>{step}</span></li>
            ))}
          </ol>
        ) : (
          <p style={{ color: 'var(--ink-2)', margin: 0 }}>No written instructions — follow the animation above.</p>
        )}
      </div>
    </div>
  );
}
