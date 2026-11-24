"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

// Scales its content down (never up) so it fits the height of its container.
// The container must have a fixed height (for example a flex-1 child of a sized panel);
// when it does not, the content keeps its natural size.
export default function FitBox({ children, minScale = 0.4 }: { children: ReactNode; minScale?: number }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const fit = () => {
      const natural = i.offsetHeight; // layout height, not affected by the transform
      const room = o.clientHeight;
      const s = natural > room && room > 0 ? Math.max(minScale, room / natural) : 1;
      setScale(s);
      setHeight(natural * s);
    };
    const ro = new ResizeObserver(fit);
    ro.observe(o);
    ro.observe(i);
    fit();
    return () => ro.disconnect();
  }, [minScale]);

  return (
    <div ref={outer} className="h-full w-full overflow-hidden">
      <div style={{ height: height ?? undefined }}>
        <div ref={inner} className="mx-auto w-full origin-top transition-transform duration-150"
          style={{ transform: scale < 1 ? `scale(${scale})` : undefined }}>
          {children}
        </div>
      </div>
    </div>
  );
}
