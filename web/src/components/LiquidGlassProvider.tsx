"use client";

import React, { useEffect, useRef } from "react";

type LiquidGlassProviderProps = {
  children: React.ReactNode;
};

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function percent01(n: number): string {
  const v = clamp(n, 0, 1) * 100;
  return `${v.toFixed(2)}%`;
}

export function LiquidGlassProvider({ children }: LiquidGlassProviderProps) {
  const rafRef = useRef<number | null>(null);
  const lastX01 = useRef<number>(0.5);
  const lastY01 = useRef<number>(0.5);
  const lastTiltX = useRef<number>(0);
  const lastTiltY = useRef<number>(0);
  const isReducedMotion = useRef<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    isReducedMotion.current = Boolean(mq?.matches);

    const root = document.documentElement;
    const apply = () => {
      rafRef.current = null;
      root.style.setProperty("--lg-x", percent01(lastX01.current));
      root.style.setProperty("--lg-y", percent01(lastY01.current));
      root.style.setProperty("--lg-tilt-x", `${lastTiltX.current.toFixed(3)}deg`);
      root.style.setProperty("--lg-tilt-y", `${lastTiltY.current.toFixed(3)}deg`);
    };

    const scheduleApply = () => {
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(apply);
    };

    const handleMove = (clientX: number, clientY: number) => {
      if (isReducedMotion.current) return;
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      const x01 = clamp(clientX / w, 0, 1);
      const y01 = clamp(clientY / h, 0, 1);
      lastX01.current = x01;
      lastY01.current = y01;

      const dx = x01 - 0.5;
      const dy = y01 - 0.5;
      const maxDeg = 1.8;
      lastTiltX.current = clamp(dx * maxDeg * 2, -maxDeg, maxDeg);
      lastTiltY.current = clamp(-dy * maxDeg * 2, -maxDeg, maxDeg);
      scheduleApply();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      handleMove(e.clientX, e.clientY);
    };

    const onPointerLeave = () => {
      if (isReducedMotion.current) return;
      lastX01.current = 0.5;
      lastY01.current = 0.5;
      lastTiltX.current = 0;
      lastTiltY.current = 0;
      scheduleApply();
    };

    const onChange = () => {
      isReducedMotion.current = Boolean(mq?.matches);
      if (isReducedMotion.current) {
        lastX01.current = 0.5;
        lastY01.current = 0.5;
        lastTiltX.current = 0;
        lastTiltY.current = 0;
        scheduleApply();
      }
    };

    root.style.setProperty("--lg-x", percent01(0.5));
    root.style.setProperty("--lg-y", percent01(0.5));
    root.style.setProperty("--lg-tilt-x", "0deg");
    root.style.setProperty("--lg-tilt-y", "0deg");

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave, { passive: true } as AddEventListenerOptions);
    mq?.addEventListener?.("change", onChange);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave as unknown as EventListener);
      mq?.removeEventListener?.("change", onChange);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  return <>{children}</>;
}

