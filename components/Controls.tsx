import { DEFAULT_SETTINGS, type DetectorSettings } from "@/hooks/useDrowsinessDetector";

interface Props {
  settings: DetectorSettings;
  onChange: (settings: DetectorSettings) => void;
  showMesh: boolean;
  onShowMesh: (value: boolean) => void;
  muted: boolean;
  onMute: (value: boolean) => void;
  running: boolean;
  onStop: () => void;
}

export default function Controls(props: Props) {
  const { settings, onChange } = props;
  const set = (key: keyof DetectorSettings) => (value: number) => onChange({ ...settings, [key]: value });

  return (
    <div className="card flex flex-col gap-5">
      <p className="text-sm font-semibold text-zinc-100">Controls</p>

      <Slider
        label="EAR threshold"
        hint="Eyes count as closed below this"
        value={settings.earThreshold}
        min={0.15}
        max={0.35}
        step={0.01}
        format={(v) => v.toFixed(2)}
        onChange={set("earThreshold")}
      />
      <Slider
        label="MAR threshold"
        hint="Mouth counts as yawning above this"
        value={settings.marThreshold}
        min={0.3}
        max={1}
        step={0.05}
        format={(v) => v.toFixed(2)}
        onChange={set("marThreshold")}
      />
      <Slider
        label="Consecutive frames"
        hint="Closed-eye frames before the alarm"
        value={settings.consecFrames}
        min={5}
        max={60}
        step={1}
        format={(v) => `${v}`}
        onChange={set("consecFrames")}
      />
      <Slider
        label="Head angle limit"
        hint="Yaw or pitch beyond this is looking away"
        value={settings.headThreshold}
        min={10}
        max={45}
        step={1}
        format={(v) => `${v}°`}
        onChange={set("headThreshold")}
      />

      <div className="flex flex-col gap-3 border-t border-zinc-800 pt-4">
        <Toggle label="Show full face mesh" checked={props.showMesh} onChange={props.onShowMesh} />
        <Toggle label="Mute alarm" checked={props.muted} onChange={props.onMute} />
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={() => onChange(DEFAULT_SETTINGS)} className="btn-secondary flex-1">
          Reset defaults
        </button>
        <button
          type="button"
          onClick={props.onStop}
          disabled={!props.running}
          className="btn-secondary flex-1 hover:border-red-500/60 hover:text-red-300 disabled:pointer-events-none disabled:opacity-40"
        >
          Stop Camera
        </button>
      </div>
    </div>
  );
}

function Slider(props: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className="text-sm text-zinc-200">{props.label}</span>
        <span className="font-mono text-sm tabular-nums text-emerald-300">{props.format(props.value)}</span>
      </span>
      <span className="block text-xs text-zinc-500">{props.hint}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="mt-2 w-full accent-emerald-400"
      />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="text-sm text-zinc-200">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-emerald-500" : "bg-zinc-700"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}
