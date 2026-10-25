"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FaceTracker, type TrackerStatus } from "@/lib/faceTracker";
import type { Landmark } from "@/lib/geometry";
import { clearOverlay, drawOverlay } from "@/lib/draw";
import { DEFAULT_TUNING, Settings, type Tuning } from "@/lib/settings";
import { START_DEMO_EVENT } from "@/lib/site";
import { useDrowsinessDetector } from "@/hooks/useDrowsinessDetector";
import VideoHud from "./VideoHud";
import StatusPanel from "./StatusPanel";
import EarChart from "./EarChart";
import Sensitivity from "./Sensitivity";
import { CameraIcon, LockIcon, Spinner } from "./icons";

type Phase = "idle" | "starting" | "live" | "error";
type CameraError = "denied" | "nodevice" | "busy" | "unsupported" | "unknown";

const ERRORS: Record<CameraError, { title: string; body: string }> = {
  denied: {
    title: "Camera access was blocked",
    body: "Allow camera access for this site (camera icon in the address bar), then press Try again.",
  },
  nodevice: { title: "No webcam found", body: "This demo needs a webcam. Connect a camera and try again." },
  busy: {
    title: "Camera is busy",
    body: "Another app or browser tab is using the camera. Close it and try again.",
  },
  unsupported: {
    title: "Camera not available",
    body: "This browser does not allow camera access here. Use a recent Chrome, Edge or Firefox over HTTPS.",
  },
  unknown: { title: "Could not start the camera", body: "Something went wrong while opening the camera. Please try again." },
};

function cameraErrorKind(err: unknown): CameraError {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "nodevice";
  if (name === "NotReadableError" || name === "AbortError") return "busy";
  return "unknown";
}

type FrameHandle = { kind: "vfc" | "raf"; id: number } | null;

const IDLE_TRACKER: TrackerStatus = { state: "idle", progress: 0, delegate: null, gpuWarming: false };

function toLandmarks(flat: Float32Array): Landmark[] {
  const out: Landmark[] = new Array(flat.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = { x: flat[i * 2], y: flat[i * 2 + 1] };
  return out;
}

export default function DemoCamera() {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackerRef = useRef<FaceTracker | null>(null);
  const handleRef = useRef<FrameHandle>(null);
  const runningRef = useRef(false);
  const startingRef = useRef(false);
  const mountedRef = useRef(true);
  const meshRef = useRef(false);
  const inferMsRef = useRef(0);
  const inferPublishRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [cameraError, setCameraError] = useState<CameraError | null>(null);
  const [tracker, setTracker] = useState<TrackerStatus>(IDLE_TRACKER);
  const [inferMs, setInferMs] = useState(0);
  const [resolution, setResolution] = useState("");
  const [tuning, setTuning] = useState<Tuning>(DEFAULT_TUNING);
  const [showMesh, setShowMesh] = useState(false);

  const detector = useDrowsinessDetector(tuning);
  const { snapshot, muted, setMuted, sessionStart, newSession, endSession, resetState, pauseAlerts, processFrame, historyRef } =
    detector;

  useEffect(() => {
    meshRef.current = showMesh;
  }, [showMesh]);

  const ensureModel = useCallback(() => {
    trackerRef.current ??= new FaceTracker((status) => mountedRef.current && setTracker(status));
    trackerRef.current.load().catch(() => undefined);
  }, []);

  const stopLoop = useCallback(() => {
    const handle = handleRef.current;
    const video = videoRef.current;
    if (handle?.kind === "vfc") video?.cancelVideoFrameCallback(handle.id);
    if (handle?.kind === "raf") cancelAnimationFrame(handle.id);
    handleRef.current = null;
  }, []);

  const startLoop = useCallback(() => {
    stopLoop();
    const video = videoRef.current;
    if (!video) return;
    let lastTime = -1;

    // One callback per camera frame. Detection runs in a worker; when its queue
    // is full the frame is skipped, so results never lag behind the camera.
    const schedule = () => {
      handleRef.current =
        typeof video.requestVideoFrameCallback === "function"
          ? { kind: "vfc", id: video.requestVideoFrameCallback(onFrame) }
          : { kind: "raf", id: requestAnimationFrame(onFrame) };
    };

    const onFrame = () => {
      if (!runningRef.current) return;
      schedule();
      const faceTracker = trackerRef.current;
      if (!faceTracker?.canDetect) return;
      if (video.readyState < 2 || video.videoWidth === 0 || video.currentTime === lastTime) return;
      lastTime = video.currentTime;

      const w = video.videoWidth;
      const h = video.videoHeight;
      faceTracker.detect(video, performance.now()).then(
        (result) => {
          const canvas = canvasRef.current;
          if (!result || !runningRef.current || !canvas) return;
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
          }

          inferMsRef.current = inferMsRef.current ? inferMsRef.current * 0.8 + result.ms * 0.2 : result.ms;
          const now = performance.now();
          if (now - inferPublishRef.current > 500) {
            inferPublishRef.current = now;
            setInferMs(inferMsRef.current);
          }

          const landmarks = result.landmarks ? toLandmarks(result.landmarks) : null;
          const out = processFrame(landmarks, w, h);
          if (landmarks && out) {
            drawOverlay(canvas, landmarks, out.draw, out.headPose, meshRef.current ? faceTracker.tesselation : null);
          } else {
            clearOverlay(canvas);
          }
        },
        () => undefined,
      );
    };

    schedule();
  }, [stopLoop, processFrame]);

  const releaseCamera = useCallback(() => {
    runningRef.current = false;
    stopLoop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    if (canvasRef.current) clearOverlay(canvasRef.current);
    endSession();
  }, [stopLoop, endSession]);

  const stopCamera = useCallback(() => {
    releaseCamera();
    setPhase("idle");
  }, [releaseCamera]);

  const startCamera = useCallback(async () => {
    if (startingRef.current || runningRef.current) return;
    startingRef.current = true;
    newSession();
    setCameraError(null);
    setPhase("starting");
    ensureModel();

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new DOMException("", "NotSupportedError");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: Settings.FRAME_WIDTH },
          height: { ideal: Settings.FRAME_HEIGHT },
          frameRate: { ideal: Settings.TARGET_FPS, max: Settings.TARGET_FPS },
        },
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) throw new Error("no video element");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      setResolution(`${video.videoWidth}×${video.videoHeight}`);

      runningRef.current = true;
      setPhase("live");
      if (!document.hidden) startLoop();
    } catch (err) {
      releaseCamera();
      const unsupported = err instanceof DOMException && err.name === "NotSupportedError";
      setCameraError(unsupported ? "unsupported" : cameraErrorKind(err));
      setPhase("error");
    } finally {
      startingRef.current = false;
    }
  }, [newSession, ensureModel, startLoop, releaseCamera]);

  // Start downloading and compiling the model as soon as the page is idle,
  // so it is usually ready before the visitor clicks Start Camera.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = idle(() => ensureModel());
    return () => cancel(id);
  }, [ensureModel]);

  useEffect(
    () => () => {
      trackerRef.current?.dispose();
      trackerRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const onStart = () => {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      void startCamera();
    };
    window.addEventListener(START_DEMO_EVENT, onStart);
    return () => window.removeEventListener(START_DEMO_EVENT, onStart);
  }, [startCamera]);

  useEffect(() => {
    const onVisibility = () => {
      if (!runningRef.current) return;
      if (document.hidden) {
        stopLoop();
        pauseAlerts();
      } else {
        startLoop();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [startLoop, stopLoop, pauseAlerts]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      releaseCamera();
    };
  }, [releaseCamera]);

  const live = phase === "live";
  const alarm = live && snapshot.alertActive;

  return (
    <section ref={sectionRef} id="demo" className="scroll-mt-6">
      {alarm && (
        <div aria-hidden className="alarm-flash pointer-events-none">
          <span className="fixed inset-x-0 top-0 z-50 h-3 bg-rose-500" />
          <span className="fixed inset-x-0 bottom-0 z-50 h-3 bg-rose-500" />
          <span className="fixed inset-y-0 left-0 z-50 w-3 bg-rose-500" />
          <span className="fixed inset-y-0 right-0 z-50 w-3 bg-rose-500" />
        </div>
      )}

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow">Live demo</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight text-white">Try it with your webcam</h2>
          <p className="mt-2 max-w-xl text-sm text-zinc-400">
            Close your eyes for about a second, yawn slowly, or nod your head forward. The alarm and the seat vibration
            start exactly as in the desktop version.
          </p>
        </div>
        <p className="flex items-center gap-2 self-start rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-xs text-emerald-200 md:self-auto">
          <LockIcon className="h-3.5 w-3.5" />
          100% in your browser. Nothing is uploaded, recorded or saved.
        </p>
      </div>

      <p className="mb-4 rounded-xl border border-white/5 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-400 md:hidden">
        Best experienced on desktop Chrome or Edge.
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          <div
            className={`relative aspect-[4/3] overflow-hidden rounded-3xl bg-zinc-950 ring-1 transition-shadow ${
              alarm ? "ring-2 ring-rose-500 shadow-[0_0_60px_-10px_rgba(244,63,94,0.8)]" : "ring-white/10"
            }`}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              className={`absolute inset-0 h-full w-full -scale-x-100 object-cover ${live ? "" : "invisible"}`}
            />
            <canvas
              ref={canvasRef}
              className={`pointer-events-none absolute inset-0 h-full w-full -scale-x-100 object-cover ${live ? "" : "invisible"}`}
            />

            {live && (
              <VideoHud
                snapshot={snapshot}
                tracker={tracker}
                inferMs={inferMs}
                resolution={resolution}
                onRetryModel={() => ensureModel()}
              />
            )}

            {phase === "idle" && (
              <Overlay>
                <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/5 ring-1 ring-white/10">
                  <CameraIcon className="h-8 w-8 text-zinc-400" />
                </div>
                <div>
                  <p className="text-lg font-medium text-white">Camera is off</p>
                  <p className="mt-1 max-w-sm text-sm text-zinc-400">
                    Your video stays on this device. Detection runs on every frame, in real time.
                  </p>
                </div>
                <button type="button" onClick={() => void startCamera()} className="btn-primary px-6 py-3 text-base">
                  <CameraIcon className="h-5 w-5" />
                  Start Camera
                </button>
                <ModelBadge state={tracker.state} progress={tracker.progress} />
              </Overlay>
            )}

            {phase === "starting" && (
              <Overlay>
                <Spinner />
                <p className="text-sm text-zinc-300">Opening camera…</p>
                <p className="text-xs text-zinc-500">Allow camera access if your browser asks.</p>
              </Overlay>
            )}

            {phase === "error" && cameraError && (
              <Overlay>
                <p className="text-lg font-medium text-white">{ERRORS[cameraError].title}</p>
                <p className="max-w-sm text-sm text-zinc-400">{ERRORS[cameraError].body}</p>
                <button type="button" onClick={() => void startCamera()} className="btn-primary">
                  Try again
                </button>
              </Overlay>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {live || phase === "starting" ? (
              <button type="button" onClick={stopCamera} className="btn-danger">
                <StopIcon />
                Stop Camera
              </button>
            ) : (
              <button type="button" onClick={() => void startCamera()} className="btn-primary">
                <CameraIcon className="h-4 w-4" />
                Start Camera
              </button>
            )}
            <button type="button" onClick={resetState} disabled={!live} className="btn-ghost">
              Reset
            </button>
            <ToggleChip label="Sound" on={!muted} onChange={(v) => setMuted(!v)} />
            <ToggleChip label="Face mesh" on={showMesh} onChange={setShowMesh} />
          </div>

          <EarChart historyRef={historyRef} active={live && tracker.state === "ready"} />
        </div>

        <div className="flex flex-col gap-4">
          <StatusPanel snapshot={snapshot} live={live} modelReady={tracker.state === "ready"} sessionStart={sessionStart} muted={muted} />
          <Sensitivity tuning={tuning} onChange={setTuning} />
        </div>
      </div>
    </section>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.08),transparent_60%)] p-6 text-center">
      {children}
    </div>
  );
}

function ModelBadge({ state, progress }: { state: TrackerStatus["state"]; progress: number }) {
  if (state === "idle") return null;
  const text =
    state === "ready"
      ? "AI model ready"
      : state === "error"
        ? "AI model will load when you start"
        : progress < 1
          ? `Preparing AI model… ${Math.round(progress * 100)}%`
          : "Starting AI engine…";
  return (
    <p className="flex items-center gap-2 text-xs text-zinc-500">
      <span className={`h-1.5 w-1.5 rounded-full ${state === "ready" ? "bg-emerald-400" : "bg-zinc-500"}`} />
      {text}
    </p>
  );
}

function ToggleChip({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium ring-1 transition-colors ${
        on ? "bg-emerald-500/10 text-emerald-200 ring-emerald-500/30" : "bg-zinc-900 text-zinc-400 ring-white/10 hover:text-zinc-200"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${on ? "bg-emerald-400" : "bg-zinc-600"}`} />
      {label} {on ? "on" : "off"}
    </button>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}
