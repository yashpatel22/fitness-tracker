import React from 'react';
import { exerciseImage, titleCase, type Exercise } from '../lib/exerciseDb';
import { Diagram } from './Diagram';

export function Loader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="center-load">
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" />
        {label}
      </div>
    </div>
  );
}

export function Empty({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="big">{title}</div>
      {sub && <p>{sub}</p>}
      <div style={{ marginTop: 14 }}>{children}</div>
    </div>
  );
}

export function StatusBadge({ status }: { status: number }) {
  const map: Record<number, { cls: string; label: string }> = {
    100000000: { cls: 'planned', label: 'Planned' },
    100000001: { cls: 'inprogress', label: 'In Progress' },
    100000002: { cls: 'completed', label: 'Completed' },
    100000003: { cls: 'skipped', label: 'Skipped' },
  };
  const s = map[status] || map[100000000];
  return <span className={`badge ${s.cls}`}><span className="dot" />{s.label}</span>;
}

// Reusable exercise diagram card (start image default, 2nd angle on hover/tap-through).
export function ExerciseCard({
  ex, scheme, footer, onOpen,
}: { ex: Exercise; scheme?: string; footer?: React.ReactNode; onOpen?: () => void }) {
  return (
    <article className={`card ex-card ${onOpen ? 'tappable' : ''}`} onClick={onOpen} data-telemetry-name={onOpen ? 'open-exercise' : undefined}>
      <div className="ex-fig">
        <span className="tag">{titleCase(ex.category)}</span>
        <Diagram src={exerciseImage(ex, 0)} alt={`${ex.name} start position`} className="ex-img-a" />
        {ex.images[1] && <Diagram src={exerciseImage(ex, 1)} alt={`${ex.name} end position`} className="ex-img-b b" />}
      </div>
      <div className="ex-body">
        <h4>{ex.name}</h4>
        {scheme && <div className="ex-scheme">{scheme}</div>}
        <div className="ex-meta">
          {ex.primaryMuscles.map((m) => <span key={m} className="pill red">{titleCase(m)}</span>)}
          {ex.equipment && <span className="pill">{titleCase(ex.equipment)}</span>}
          {ex.level && <span className="pill">{titleCase(ex.level)}</span>}
        </div>
        {footer && <div className="ex-foot" onClick={(e) => e.stopPropagation()}>{footer}</div>}
      </div>
    </article>
  );
}

// Thumbnail-only image with CSP-safe data-URI loading (for list rows).
export function Thumb({ url, alt }: { url?: string; alt: string }) {
  return <Diagram src={url} alt={alt} className="thumb" />;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" style={wide ? { maxWidth: 920 } : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn ghost sm" onClick={onClose} data-telemetry-name="close-modal">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
