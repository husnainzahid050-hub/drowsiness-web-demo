"use client";

import { useEffect, useRef, type RefObject } from "react";
import { HISTORY_MS, type EarSample } from "@/hooks/useDrowsinessDetector";

const Y_MAX = 0.5;
const PAD = { left: 36, right: 10, top: 10, bottom: 22 };

interface Props {
  historyRef: RefObject<EarSample[]>;
  threshold: number;
  active: boolean;
}

export default function EarChart({ historyRef, threshold, active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thresholdRef = useRef(threshold);

  useEffect(() => {
    thresholdRef.current = threshold;
  }, [threshold]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
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

      ctx.font = "11px ui-monospace, monospace";
      ctx.lineWidth = 1;
      for (let v = 0; v <= Y_MAX + 1e-9; v += 0.1) {
        ctx.strokeStyle = "rgba(63, 63, 70, 0.6)";
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
      ctx.fillText("-10s", PAD.left, h - PAD.bottom + 6);
      ctx.fillText("-5s", PAD.left + plotW / 2, h - PAD.bottom + 6);
      ctx.fillText("now", w - PAD.right - 10, h - PAD.bottom + 6);

      const ty = y(thresholdRef.current);
      ctx.strokeStyle = "#fbbf24";
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(PAD.left, ty);
      ctx.lineTo(w - PAD.right, ty);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.save();
      ctx.beginPath();
      ctx.rect(PAD.left, PAD.top, plotW, plotH);
      ctx.clip();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.beginPath();
      let drawing = false;
      for (const s of historyRef.current) {
        if (Number.isNaN(s.ear)) {
          drawing = false;
          continue;
        }
        if (drawing) ctx.lineTo(x(s.t), y(s.ear));
        else ctx.moveTo(x(s.t), y(s.ear));
        drawing = true;
      }
      ctx.stroke();
      ctx.restore();
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [historyRef]);

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-100">EAR over the last 10 seconds</p>
        <div className="flex items-center gap-4 text-xs text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-sky-400" />
            EAR
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-amber-400" />
            Threshold
          </span>
        </div>
      </div>
      <div className="relative h-44">
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
