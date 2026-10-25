import { DEFAULT_TUNING, type Tuning } from "@/lib/settings";

interface Props {
  tuning: Tuning;
  onChange: (tuning: Tuning) => void;
}

const SLIDERS: {
  key: keyof Tuning;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}[] = [
  { key: "earThreshold", label: "EAR threshold", hint: "Eyes count as closed below this", min: 0.15, max: 0.3, step: 0.01, format: (v) => v.toFixed(2) },
  { key: "consecFrames", label: "Closed-eye frames", hint: "At 30 FPS, 20 frames ≈ 0.7 s", min: 5, max: 60, step: 1, format: (v) => `${v}` },
  { key: "marThreshold", label: "MAR threshold", hint: "Mouth counts as wide open above this", min: 0.35, max: 0.8, step: 0.05, format: (v) => v.toFixed(2) },
  { key: "yawnFrames", label: "Yawn frames", hint: "Wide-open frames before a yawn is judged", min: 10, max: 60, step: 1, format: (v) => `${v}` },
  { key: "pitchThreshold", label: "Nod limit (pitch)", hint: "Forward head drop that counts as a nod", min: 10, max: 45, step: 1, format: (v) => `${v}°` },
  { key: "rollThreshold", label: "Tilt limit (roll)", hint: "Sideways tilt that counts as losing control", min: 15, max: 45, step: 1, format: (v) => `${v}°` },
];

export default function Sensitivity({ tuning, onChange }: Props) {
  const changed = SLIDERS.some(({ key }) => tuning[key] !== DEFAULT_TUNING[key]);
  return (
    <details className="card group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <span className="text-sm font-semibold text-white">Sensitivity</span>
        <span className="text-xs text-zinc-500">
          {changed ? "Custom" : "Defaults from the Python project"}
          <span className="ml-2 inline-block transition-transform group-open:rotate-180">▾</span>
        </span>
      </summary>
      <div className="mt-4 flex flex-col gap-4">
        {SLIDERS.map((s) => (
          <label key={s.key} className="block">
            <span className="flex items-baseline justify-between">
              <span className="text-sm text-zinc-200">{s.label}</span>
              <span className="font-mono text-sm tabular-nums text-emerald-300">{s.format(tuning[s.key])}</span>
            </span>
            <span className="block text-xs text-zinc-500">{s.hint}</span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={tuning[s.key]}
              onChange={(e) => onChange({ ...tuning, [s.key]: Number(e.target.value) })}
              className="mt-2 w-full accent-emerald-400"
            />
          </label>
        ))}
        <button type="button" onClick={() => onChange(DEFAULT_TUNING)} disabled={!changed} className="btn-ghost self-start">
          Reset to defaults
        </button>
      </div>
    </details>
  );
}
