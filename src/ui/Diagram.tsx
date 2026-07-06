import React, { useState, useEffect } from 'react';

// 'self'-hosted images are allowed by the host CSP (img-src 'self'). Render a single
// <img> that is ALWAYS in the DOM and visible (never display:none, which would deadlock
// with lazy loading). A background shimmer shows through until the image paints; on
// error we swap to a static placeholder. Opacity/hover are left to CSS classes.
export function Diagram({ src, alt, className, style }: {
  src?: string; alt: string; className?: string; style?: React.CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);

  if (!src || failed) {
    return <div className={`${className || ''} diagram-skeleton failed`} style={style} aria-label={alt} role="img" />;
  }
  return (
    <img
      className={`${className || ''} diagram-img`}
      style={style}
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
    />
  );
}
