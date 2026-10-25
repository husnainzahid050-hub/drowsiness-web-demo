"use client";

import { useEffect, useRef, type RefObject } from "react";
import { HISTORY_MS, type EarSample } from "@/hooks/useDrowsinessDetector";

const Y_MAX = 0.45;
const PAD = { left: 36, right: 10, top: 10, bottom: 22 };

interface Props {
  historyRef: RefObject<EarSample[]>;
  active: boolean;
}

export default function EarChart({ historyRef, active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0;
    let lastDraw = 0;
    let drewIdle = false;

    // 20 redraws per second is smooth enough and leaves the GPU to the model.
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - lastDraw < 50) return;
      lastDraw = now;
      if (!activeRef.current) {
        if (drewIdle) return;
        drewIdle = true;
      } else {
        drewIdle = false;
      }
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const plotW = w - PAD.left - PAD.right;
      const plotH = h - PAD.top - PAD.bottom;
      const y = (v: number) => PAD.top + plotH * (1 - Math.min(Math.max(v, 0), Y_MAX) / Y_MAX);
      const end = performance.now();
      const x = (t: number) => PAD.left + plotW * (1 - (end - t) / HISTORY_MS);
      const samples = historyRef.current;

      ctx.font = "10px ui-monospace, monospace";
      ctx.lineWidth = 1;
      for (let v = 0; v <= Y_MAX + 1e-9; v += 0.1) {
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.beginPath();
        ctx.moveTo(PAD.left, y(v));
        ctx.lineTo(w - PAD.right, y(v));
        ctx.stroke();
        ctx.fillStyle = "#71717a";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(v.toFixed(1), PAD.left - 6, y(v));
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("-10s", PAD.left + 12, h - PAD.bottom + 6);
      ctx.fillText("-5s", PAD.left + plotW / 2, h - PAD.bottom + 6);
      ctx.fillText("now", w - PAD.right - 12, h - PAD.bottom + 6);

      ctx.save();
      ctx.beginPath();
      ctx.rect(PAD.left, PAD.top, plotW, plotH);
      ctx.clip();

      const lastThreshold = samples.length ? samples[samples.length - 1].threshold : 0.21;
      ctx.strokeStyle = "#fbbf24";
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(PAD.left, y(lastThreshold));
      ctx.lineTo(w - PAD.right, y(lastThreshold));
      ctx.stroke();
      ctx.setLineDash([]);

      // Line coloured red where EAR is below the threshold in use.
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      let prev: EarSample | null = null;
      for (const s of samples) {
        if (Number.isNaN(s.ear)) {
          prev = null;
          continue;
        }
        if (prev) {
          ctx.strokeStyle = s.ear < s.threshold ? "#f43f5e" : "#34d399";
          ctx.beginPath();
          ctx.moveTo(x(prev.t), y(prev.ear));
          ctx.lineTo(x(s.t), y(s.ear));
          ctx.stroke();
        }
        prev = s;
      }
      ctx.restore();
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [historyRef]);

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-white">EAR, last 10 seconds</p>
        <div className="flex items-center gap-4 text-xs text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-emerald-400" />
            open
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-rose-500" />
            closed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-amber-400" />
            threshold
          </span>
        </div>
      </div>
      <div className="relative h-40">
        <canvas ref={canvasRef} className="h-full w-full" />
        {!active && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
            The graph starts when the camera is on.
          </p>
        )}
      </div>
    </div>
  );
}
