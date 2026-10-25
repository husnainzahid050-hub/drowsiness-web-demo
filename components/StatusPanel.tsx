"use client";

import { useEffect, useState } from "react";
import type { Snapshot } from "@/lib/detector";
import { Settings } from "@/lib/settings";
import { BellIcon, EyeIcon, HeadIcon, MouthIcon } from "./icons";
import { describeStatus, type Tone } from "./status";

interface Props {
  snapshot: Snapshot;
  live: boolean;
  modelReady: boolean;
  sessionStart: number | null;
  muted: boolean;
}

const TONE: Record<Tone, { box: string; dot: string }> = {
  ok: { box: "from-emerald-500/15 ring-emerald-500/30 text-emerald-200", dot: "bg-emerald-400" },
  alert: { box: "from-rose-600/30 ring-rose-500/60 text-rose-100", dot: "bg-rose-400" },
  warn: { box: "from-amber-500/15 ring-amber-500/30 text-amber-200", dot: "bg-amber-400" },
  idle: { box: "from-zinc-700/20 ring-white/10 text-zinc-300", dot: "bg-zinc-500" },
};

export default function StatusPanel({ snapshot: s, live, modelReady, sessionStart, muted }: Props) {
  const status = describeStatus(s, live, modelReady);
  const tone = TONE[status.tone];
  const on = live && modelReady && s.faceDetected;

  return (
    <div className="flex flex-col gap-4">
      <div className={`rounded-3xl bg-gradient-to-br to-transparent p-5 ring-1 ${tone.box}`} aria-live="polite">
        <p className="eyebrow opacity-80">Driver state</p>
        <div className="mt-2 flex items-center gap-3">
          <span className="relative flex h-3.5 w-3.5">
            {status.tone === "alert" && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${tone.dot}`} />}
            <span className={`relative inline-flex h-3.5 w-3.5 rounded-full ${tone.dot}`} />
          </span>
          <p className="text-3xl font-semibold tracking-tight text-white">{status.label}</p>
        </div>
        <p className="mt-1.5 text-sm opacity-90">{status.detail}</p>
      </div>

      <Card icon={<EyeIcon />} title="Eyes" note={s.glasses ? "Glasses mode: threshold relaxed" : "Eye Aspect Ratio"}>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Left" value={on ? s.leftEar.toFixed(3) : "--"} />
          <Stat label="Right" value={on ? s.rightEar.toFixed(3) : "--"} />
          <Stat label="Average" value={on ? s.avgEar.toFixed(3) : "--"} alert={on && s.avgEar < s.earThreshold} strong />
        </div>
        <Progress
          label="Closed frames"
          value={on ? s.closedFrames : 0}
          max={s.closedFramesNeeded}
          hint={`EAR < ${s.earThreshold.toFixed(2)}`}
        />
      </Card>

      <Card icon={<MouthIcon />} title="Mouth" note="Mouth Aspect Ratio · yawn vs surprise">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="MAR" value={on ? s.mar.toFixed(3) : "--"} alert={on && s.yawnActive} strong />
          <Stat
            label="State"
            value={!on ? "--" : s.yawnActive ? "Yawn" : s.surpriseActive ? "Surprise" : s.yawnFrames > 0 ? "Open" : "Closed"}
            alert={on && s.yawnActive}
          />
          <Stat label="Yawns" value={live ? String(s.totalYawns) : "--"} />
        </div>
        <Progress label="Wide-open frames" value={on ? s.yawnFrames : 0} max={s.yawnFramesNeeded} hint="MAR ≥ threshold" />
        {on && s.yawnCues && <p className="mt-2 truncate font-mono text-[11px] text-zinc-500" title={s.yawnCues}>{s.yawnCues}</p>}
      </Card>

      <Card icon={<HeadIcon />} title="Head pose" note={on && s.poseValid ? s.poseStatus : "solvePnP · degrees"}>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Pitch" value={on ? `${s.pitch.toFixed(1)}°` : "--"} alert={on && s.poseStatus === "Nodding"} strong />
          <Stat label="Yaw" value={on ? `${s.yaw.toFixed(1)}°` : "--"} />
          <Stat label="Roll" value={on ? `${s.roll.toFixed(1)}°` : "--"} alert={on && s.poseStatus === "Tilting"} />
        </div>
        <Progress label="Bad-pose frames" value={on ? s.poseFrames : 0} max={s.poseFramesNeeded} hint="nod or tilt" />
      </Card>

      <Card icon={<BellIcon />} title="Alerts" note={muted ? "Sound muted" : "Beep + seat vibration"}>
        <SeatVibration active={live && s.vibrating} />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label="Alerts" value={live ? String(s.totalAlerts) : "--"} alert={live && s.totalAlerts > 0} />
          <Stat label="Session" value={<Duration start={sessionStart} />} />
          <Stat label="Frames" value={live ? String(s.frames) : "--"} />
        </div>
      </Card>
    </div>
  );
}

function Card({ icon, title, note, children }: { icon: React.ReactNode; title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-white">
          <span className="text-emerald-300">{icon}</span>
          {title}
        </p>
        <p className="truncate text-xs text-zinc-500">{note}</p>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, alert, strong }: { label: string; value: React.ReactNode; alert?: boolean; strong?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2 ring-1 ${alert ? "bg-rose-500/15 ring-rose-500/40" : "bg-white/[0.03] ring-white/5"}`}>
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className={`font-mono tabular-nums ${strong ? "text-lg" : "text-base"} ${alert ? "text-rose-200" : "text-zinc-100"}`}>{value}</p>
    </div>
  );
}

function Progress({ label, value, max, hint }: { label: string; value: number; max: number; hint: string }) {
  const pct = Math.min(100, (value / Math.max(1, max)) * 100);
  const full = value >= max;
  return (
    <div className="mt-3">
      <div className="flex justify-between text-[11px] text-zinc-500">
        <span>
          {label} <span className="text-zinc-600">({hint})</span>
        </span>
        <span className="font-mono tabular-nums text-zinc-300">
          {Math.min(value, 999)} / {max}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
        <div
          className={`h-full rounded-full transition-[width] duration-100 ${full ? "bg-rose-500" : pct > 50 ? "bg-amber-400" : "bg-emerald-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SeatVibration({ active }: { active: boolean }) {
  return (
    <div className={`flex items-center gap-4 rounded-2xl p-3 ring-1 ${active ? "bg-rose-500/10 ring-rose-500/40" : "bg-white/[0.03] ring-white/5"}`}>
      <svg viewBox="0 0 48 48" className={`h-11 w-11 shrink-0 ${active ? "seat-shake text-rose-300" : "text-zinc-500"}`} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 6h10a3 3 0 013 3v17H14a3 3 0 01-3-3V9a3 3 0 013-3z" />
        <path d="M11 30h22a3 3 0 013 3v3H11z" />
        <path d="M16 36v6M32 36v6" />
      </svg>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${active ? "text-rose-200" : "text-zinc-300"}`}>
          {active ? "Seat vibrating" : "Seat vibration standby"}
        </p>
        <div className="mt-2 flex h-4 items-end gap-1">
          {Array.from({ length: 10 }, (_, i) => (
            <span
              key={i}
              className={`w-full rounded-sm ${active && i < Settings.VIBRATION_INTENSITY ? "vibe-bar bg-rose-400" : "bg-white/10"}`}
              style={{ height: `${30 + i * 7}%`, animationDelay: `${i * 40}ms` }}
            />
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-500">Simulated: no hardware. Phones vibrate for real.</p>
      </div>
    </div>
  );
}

function Duration({ start }: { start: number | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (start === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [start]);
  if (start === null) return <>--</>;
  const sec = Math.max(0, Math.floor(((now ?? start) - start) / 1000));
  return (
    <>
      {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, "0")}
    </>
  );
}
