import type { AlertReason, Snapshot } from "@/lib/detector";

export type Tone = "ok" | "alert" | "warn" | "idle";

export interface StatusView {
  label: string;
  detail: string;
  tone: Tone;
  pill: string;
}

const PILL: Record<Tone, string> = {
  ok: "bg-emerald-500/20 text-emerald-200 ring-emerald-400/40",
  alert: "bg-rose-600/80 text-white ring-rose-400/60",
  warn: "bg-amber-500/20 text-amber-200 ring-amber-400/40",
  idle: "bg-black/55 text-zinc-300 ring-white/10",
};

const REASON: Record<AlertReason, string> = {
  eyes: "Eyes closed too long",
  head: "Head nodding or tilting",
  yawn: "Yawning",
};

export function describeStatus(s: Snapshot, live: boolean, modelReady: boolean): StatusView {
  const view = (label: string, detail: string, tone: Tone): StatusView => ({ label, detail, tone, pill: PILL[tone] });

  if (!live) return view("Camera off", "Start the camera to begin monitoring.", "idle");
  if (!modelReady) return view("Starting", "Loading the face landmark model.", "idle");
  if (s.alertActive) {
    const why = s.reasons.map((r) => REASON[r]).join(" · ");
    return view("DROWSY", s.faceDetected ? why : `${why} · face lost`, "alert");
  }
  if (!s.faceDetected) return view("No Face Detected", "Move into the frame and face the camera.", "idle");
  if (s.surpriseActive) return view("Surprised", "Wide-open mouth judged as surprise, not a yawn.", "warn");
  if (s.poseStatus === "Nodding") return view("Nodding", "Head is dropping forward.", "warn");
  if (s.poseStatus === "Tilting") return view("Tilting", "Head is tilted sideways.", "warn");
  if (s.avgEar < s.earThreshold) return view("Eyes closing", "Keep them closed to trigger the alarm.", "warn");
  return view("Awake", "Eyes open, head upright.", "ok");
}
