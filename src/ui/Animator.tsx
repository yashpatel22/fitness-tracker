import React, { useEffect, useState } from 'react';

// Auto-playing exercise animation: crossfades the start/end position frames so the
// movement plays on its own (no hover needed). Works on touch + mouse.
export function Animator({ a, b, alt, className = 'pl-anim' }: { a: string; b: string; alt: string; className?: string }) {
  const [f, setF] = useState(0);
  useEffect(() => {
    if (!b) return;
    const id = window.setInterval(() => setF((x) => (x ? 0 : 1)), 720);
    return () => clearInterval(id);
  }, [b]);
  return (
    <div className={className}>
      {a
        ? <>
            <img src={a} alt={alt} style={{ opacity: f === 0 ? 1 : 0 }} />
            {b && <img src={b} alt="" aria-hidden="true" style={{ opacity: f === 1 ? 1 : 0 }} />}
          </>
        : <div className="pl-anim-empty">No preview</div>}
    </div>
  );
}
