import React, { useRef, useState } from 'react';
import { IconTrash } from './icons';

// A list row that reveals a Delete action when swiped left (touch) or dragged
// left with the mouse. A tap that didn't move passes through to the row's own
// onClick; a swipe is suppressed so it never accidentally opens the row.
// Horizontal intent is handled in JS; `touch-action: pan-y` (CSS) lets the
// browser keep native vertical scrolling without us calling preventDefault
// (which throws inside React's passive touch listeners).
const REVEAL = 88;

export function SwipeRow({ children, onDelete, label = 'Delete' }: {
  children: React.ReactNode;
  onDelete: () => void;
  label?: string;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dxRef = useRef(0);
  const openRef = useRef(false);
  const startX = useRef<number | null>(null);
  const startY = useRef(0);
  const baseDx = useRef(0);
  const moved = useRef(false);
  const axis = useRef<null | 'x' | 'y'>(null);

  function setDxBoth(v: number) { dxRef.current = v; setDx(v); }

  function begin(x: number, y: number) {
    startX.current = x;
    startY.current = y;
    baseDx.current = openRef.current ? -REVEAL : 0;
    moved.current = false;
    axis.current = null;
    setDragging(true);
  }
  function drag(x: number, y: number) {
    if (startX.current == null) return;
    const ddx = x - startX.current;
    const ddy = y - startY.current;
    if (axis.current == null && (Math.abs(ddx) > 6 || Math.abs(ddy) > 6)) {
      axis.current = Math.abs(ddx) > Math.abs(ddy) ? 'x' : 'y';
    }
    if (axis.current === 'y') { startX.current = null; setDragging(false); setDxBoth(openRef.current ? -REVEAL : 0); return; }
    if (axis.current === 'x') {
      moved.current = true;
      setDxBoth(Math.max(-REVEAL, Math.min(0, baseDx.current + ddx)));
    }
  }
  function end() {
    if (startX.current == null) return;
    const shouldOpen = dxRef.current < -REVEAL / 2;
    openRef.current = shouldOpen;
    setDxBoth(shouldOpen ? -REVEAL : 0);
    startX.current = null;
    setDragging(false);
  }

  return (
    <div className="swipe-row">
      <button className="swipe-del" style={{ width: REVEAL }} onClick={onDelete} data-telemetry-name="swipe-delete">
        <IconTrash size={18} /><span>{label}</span>
      </button>
      <div
        className="swipe-fg"
        style={{ transform: `translateX(${dx}px)`, transition: dragging ? 'none' : 'transform 0.18s ease' }}
        onTouchStart={(e) => begin(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={(e) => drag(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchEnd={end}
        onPointerDown={(e) => { if (e.pointerType === 'mouse') begin(e.clientX, e.clientY); }}
        onPointerMove={(e) => { if (e.pointerType === 'mouse') drag(e.clientX, e.clientY); }}
        onPointerUp={(e) => { if (e.pointerType === 'mouse') end(); }}
        onClickCapture={(e) => {
          // A swipe (or a tap while open) must not fall through to the row's onClick.
          if (moved.current || openRef.current) { e.stopPropagation(); e.preventDefault(); if (openRef.current) { openRef.current = false; setDxBoth(0); } moved.current = false; }
        }}
      >
        {children}
      </div>
    </div>
  );
}
