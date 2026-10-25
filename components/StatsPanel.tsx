import type { DetectorSettings, DetectorStats, DetectorStatus } from "@/hooks/useDrowsinessDetector";

const STATUS: Record<DetectorStatus, { label: string; hint: string; className: string; dot: string }> = {
  awake: {
    label: "Awake",
    hint: "Eyes open, attention on the road.",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    dot: "bg-emerald-400",
  },
  drowsy: {
    label: "Drowsy",
    hint: "Eyes closed too long. Wake up!",
    className: "border-red-500/60 bg-red-500/15 text-red-300",
    dot: "bg-red-400 animate-ping",
  },
  yawning: {
    label: "Yawning",
    hint: "A yawn is an early sign of fatigue.",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    dot: "bg-amber-400",
  },
  away: {
    label: "Looking Away",
    hint: "Head turned or tilted away from the road.",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    dot: "bg-amber-400",
  },
  noface: {
    label: "No Face Detected",
    hint: "Move into the frame and face the camera.",
    className: "border-zinc-700 bg-zinc-800/60 text-zinc-300",
    dot: "bg-zinc-500",
  },
};

interface Props {
  stats: DetectorStats;
  settings: DetectorSettings;
  active: boolean;
}

export default function StatsPanel({ stats, settings, active }: Props) {
  const status = STATUS[active ? stats.status : "noface"];
  const ear = active ? stats.ear : null;
  const mar = active ? stats.mar : null;
  const pose = active ? stats.pose : null;

  return (
    <div className="card flex flex-col gap-5">
      <div className={`rounded-xl border px-4 py-4 ${status.className}`} aria-live="polite">
        <p className="text-xs font-medium uppercase tracking-wider opacity-70">Driver status</p>
        <p className="mt-1 flex items-center gap-2.5 text-3xl font-semibold tracking-tight">
          <span className="relative flex h-3 w-3">
            <span className={`absolute inline-flex h-full w-full rounded-full ${status.dot}`} />
            <span className={`relative inline-flex h-3 w-3 rounded-full ${status.dot.split(" ")[0]}`} />
          </span>
          {active ? status.label : "Camera off"}
        </p>
        <p className="mt-1 text-sm opacity-80">{active ? status.hint : "Start the camera to begin."}</p>
      </div>

      <Meter
        label="EAR"
        title="Eye Aspect Ratio"
        value={ear}
        max={0.45}
        threshold={settings.earThreshold}
        alert={ear !== null && ear < settings.earThreshold}
      />
      <Meter
        label="MAR"
        title="Mouth Aspect Ratio"
        value={mar}
        max={1.2}
        threshold={settings.marThreshold}
        alert={mar !== null && mar > settings.marThreshold}
      />

      <div className="grid grid-cols-3 gap-2">
        <Angle label="Yaw" value={pose?.yaw} limit={settings.headThreshold} />
        <Angle label="Pitch" value={pose?.pitch} limit={settings.headThreshold} />
        <Angle label="Roll" value={pose?.roll} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Tile label="Closed-eye frames" value={active ? `${stats.closedFrames} / ${settings.consecFrames}` : "--"} />
        <Tile label="FPS" value={active && stats.fps > 0 ? stats.fps.toFixed(0) : "--"} />
      </div>
    </div>
  );
}

function Meter(props: {
  label: string;
  title: string;
  value: number | null;
  max: number;
  threshold: number;
  alert: boolean;
}) {
  const pct = props.value === null ? 0 : Math.min(100, (props.value / props.max) * 100);
  const thresholdPct = Math.min(100, (props.threshold / props.max) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-zinc-300">
          <span className="font-semibold text-zinc-100">{props.label}</span>
          <span className="ml-2 text-xs text-zinc-500">{props.title}</span>
        </p>
        <p className={`font-mono text-lg tabular-nums ${props.alert ? "text-red-400" : "text-zinc-100"}`}>
          {props.value === null ? "--" : props.value.toFixed(3)}
        </p>
      </div>
      <div className="relative mt-2 h-2 rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-[width] duration-100 ${props.alert ? "bg-red-400" : "bg-emerald-400"}`}
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute -top-1 h-4 w-0.5 rounded bg-amber-400"
          style={{ left: `${thresholdPct}%` }}
          title={`Threshold ${props.threshold.toFixed(2)}`}
        />
      </div>
    </div>
  );
}

function Angle({ label, value, limit }: { label: string; value?: number; limit?: number }) {
  const over = value !== undefined && limit !== undefined && Math.abs(value) > limit;
  return (
    <div className="rounded-lg bg-zinc-800/60 px-3 py-2">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`font-mono text-lg tabular-nums ${over ? "text-amber-300" : "text-zinc-100"}`}>
        {value === undefined ? "--" : `${value.toFixed(1)}°`}
      </p>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-800/60 px-3 py-2">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="font-mono text-lg tabular-nums text-zinc-100">{value}</p>
    </div>
  );
}
