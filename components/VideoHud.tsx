import type { Snapshot } from "@/lib/detector";
import type { TrackerStatus } from "@/lib/faceTracker";
import { describeStatus } from "./status";

interface Props {
  snapshot: Snapshot;
  tracker: TrackerStatus;
  inferMs: number;
  resolution: string;
  onRetryModel: () => void;
}

export default function VideoHud({ snapshot, tracker, inferMs, resolution, onRetryModel }: Props) {
  const ready = tracker.state === "ready";
  const status = describeStatus(snapshot, true, ready);

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Chip>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
            LIVE
          </Chip>
          {ready && (
            <Chip className="font-mono">
              {snapshot.fps > 0 ? `${snapshot.fps.toFixed(0)} FPS` : "-- FPS"} · {inferMs.toFixed(0)} ms · {tracker.delegate}
            </Chip>
          )}
          {resolution && <Chip className="hidden font-mono sm:inline-flex">{resolution}</Chip>}
          {ready && tracker.gpuWarming && (
            <Chip className="text-zinc-300">
              <span className="h-2.5 w-2.5 animate-spin rounded-full border border-zinc-500 border-t-emerald-400" />
              GPU warming up
            </Chip>
          )}
          {snapshot.glasses && <Chip className="bg-sky-500/20 text-sky-200">Glasses mode</Chip>}
        </div>
        {ready && (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${status.pill}`}>{status.label}</span>
        )}
      </div>

      {snapshot.alertActive && (
        <div className="mx-auto rounded-2xl bg-rose-600/90 px-5 py-3 text-center shadow-2xl">
          <p className="text-base font-bold tracking-wide text-white sm:text-xl">⚠ DROWSINESS DETECTED!</p>
          <p className="text-xs text-rose-100 sm:text-sm">{status.detail}</p>
        </div>
      )}

      {ready && !snapshot.faceDetected && !snapshot.alertActive && (
        <div className="mx-auto rounded-xl bg-black/70 px-4 py-2 text-sm text-zinc-200">
          No face detected. Look at the camera.
        </div>
      )}

      <div className="flex items-end justify-between gap-2">
        {ready && snapshot.faceDetected ? (
          <div className="flex gap-1.5">
            <Readout label="EAR" value={snapshot.avgEar.toFixed(3)} alert={snapshot.avgEar < snapshot.earThreshold} />
            <Readout label="MAR" value={snapshot.mar.toFixed(3)} alert={snapshot.yawnActive} />
            <Readout label="PITCH" value={`${snapshot.pitch.toFixed(0)}°`} alert={snapshot.poseStatus !== "Normal"} />
          </div>
        ) : (
          <span />
        )}

        {(tracker.state === "loading" || tracker.state === "idle") && (
          <div className="w-56 rounded-xl bg-black/70 p-3">
            <p className="text-xs text-zinc-200">
              {tracker.progress < 1 ? `Loading AI model… ${Math.round(tracker.progress * 100)}%` : "Starting AI engine…"}
            </p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full bg-emerald-400 transition-[width] ${tracker.progress >= 1 ? "animate-pulse" : ""}`}
                style={{ width: `${Math.max(4, tracker.progress * 100)}%` }}
              />
            </div>
          </div>
        )}
        {tracker.state === "error" && (
          <div className="pointer-events-auto rounded-xl bg-black/75 p-3 text-xs text-zinc-200">
            <p>The AI model could not load. Check your connection.</p>
            <button type="button" onClick={onRetryModel} className="mt-2 font-semibold text-emerald-300 hover:text-emerald-200">
              Retry loading
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-medium text-zinc-200 ${className}`}>
      {children}
    </span>
  );
}

function Readout({ label, value, alert }: { label: string; value: string; alert: boolean }) {
  return (
    <div className={`rounded-lg px-2.5 py-1.5 ${alert ? "bg-rose-600/80" : "bg-black/65"}`}>
      <p className="text-[10px] font-medium tracking-wider text-zinc-300">{label}</p>
      <p className="font-mono text-sm font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}
