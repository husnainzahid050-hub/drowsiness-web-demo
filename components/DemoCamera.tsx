"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { createFaceLandmarker, type FaceModel } from "@/lib/faceLandmarker";
import { computeEar, computeMar, headPoseFromMatrix, toPixels } from "@/lib/metrics";
import { clearOverlay, drawOverlay } from "@/lib/draw";
import { START_DEMO_EVENT } from "@/lib/site";
import { DEFAULT_SETTINGS, useDrowsinessDetector, type DetectorSettings } from "@/hooks/useDrowsinessDetector";
import StatsPanel from "./StatsPanel";
import EarChart from "./EarChart";
import Controls from "./Controls";

type Phase = "idle" | "loading" | "running" | "error";
type CameraError = "denied" | "nodevice" | "busy" | "unsupported" | "model" | "unknown";

const ERRORS: Record<CameraError, { title: string; body: string }> = {
  denied: {
    title: "Camera access was blocked",
    body: "Allow camera access for this site in your browser (usually the camera icon in the address bar), then try again.",
  },
  nodevice: {
    title: "No webcam found",
    body: "This demo needs a webcam to see your face. Connect a camera and try again.",
  },
  busy: {
    title: "Camera is in use",
    body: "Another app or tab is using your camera. Close it and try again.",
  },
  unsupported: {
    title: "Camera not available",
    body: "Your browser does not allow camera access here. Open the page over HTTPS in a recent Chrome, Edge or Firefox.",
  },
  model: {
    title: "Could not load the AI model",
    body: "The face landmark model failed to download. Check your connection and try again.",
  },
  unknown: {
    title: "Something went wrong",
    body: "The camera could not be started. Please try again.",
  },
};

class CameraFailure extends Error {
  constructor(readonly kind: CameraError) {
    super(kind);
  }
}

function cameraErrorKind(err: unknown): CameraError {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "nodevice";
  if (name === "NotReadableError" || name === "AbortError") return "busy";
  return "unknown";
}

export default function DemoCamera() {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const modelRef = useRef<FaceModel | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const runningRef = useRef(false);
  const startingRef = useRef(false);
  const mountedRef = useRef(true);
  const showMeshRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<CameraError | null>(null);
  const [settings, setSettings] = useState<DetectorSettings>(DEFAULT_SETTINGS);
  const [showMesh, setShowMesh] = useState(false);
  const { stats, muted, setMuted, armAudio, pause, reset, update, historyRef } = useDrowsinessDetector(settings);

  useEffect(() => {
    showMeshRef.current = showMesh;
  }, [showMesh]);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const startLoop = useCallback(() => {
    stopLoop();
    lastVideoTimeRef.current = -1;

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const model = modelRef.current;
      if (!video || !canvas || !model || video.readyState < 2) return;
      // Only run detection when the camera delivered a new frame, so frame
      // counters follow the camera rate rather than the display refresh rate.
      if (video.currentTime === lastVideoTimeRef.current) return;
      lastVideoTimeRef.current = video.currentTime;

      const now = performance.now();
      let result: FaceLandmarkerResult;
      try {
        result = model.landmarker.detectForVideo(video, now);
      } catch {
        return;
      }

      const landmarks = result.faceLandmarks[0];
      if (!landmarks) {
        update(null, now);
        clearOverlay(canvas);
        return;
      }

      const width = video.videoWidth;
      const height = video.videoHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const pts = toPixels(landmarks, width, height);
      const matrix = result.facialTransformationMatrixes?.[0];
      const verdict = update(
        {
          ear: computeEar(pts),
          mar: computeMar(pts),
          pose: matrix ? headPoseFromMatrix(matrix.data) : null,
        },
        now,
      );
      drawOverlay(canvas, pts, model.connections, { ...verdict, showMesh: showMeshRef.current });
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [stopLoop, update]);

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
    reset();
  }, [stopLoop, reset]);

  const stopCamera = useCallback(() => {
    releaseCamera();
    setPhase("idle");
  }, [releaseCamera]);

  const startCamera = useCallback(async () => {
    if (startingRef.current || runningRef.current) return;
    startingRef.current = true;
    armAudio();
    setError(null);
    setPhase("loading");

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new CameraFailure("unsupported");

      const modelPromise = createFaceLandmarker();
      modelPromise.catch(() => undefined);

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
      } catch (err) {
        throw new CameraFailure(cameraErrorKind(err));
      }
      streamRef.current = stream;
      if (!mountedRef.current) return releaseCamera();

      try {
        modelRef.current = await modelPromise;
      } catch {
        throw new CameraFailure("model");
      }
      if (!mountedRef.current || !streamRef.current) return releaseCamera();

      const video = videoRef.current;
      if (!video) throw new CameraFailure("unknown");
      video.srcObject = stream;
      await video.play();

      runningRef.current = true;
      setPhase("running");
      if (!document.hidden) startLoop();
    } catch (err) {
      releaseCamera();
      setError(err instanceof CameraFailure ? err.kind : "unknown");
      setPhase("error");
    } finally {
      startingRef.current = false;
    }
  }, [armAudio, releaseCamera, startLoop]);

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
        pause();
      } else {
        startLoop();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [startLoop, stopLoop, pause]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      releaseCamera();
    };
  }, [releaseCamera]);

  const drowsy = phase === "running" && stats.status === "drowsy";

  return (
    <section ref={sectionRef} id="demo" className="scroll-mt-6">
      {drowsy && (
        <div
          aria-hidden
          className="alarm-flash pointer-events-none fixed inset-0 z-50 border-[10px] border-red-500 bg-red-500/10"
        />
      )}

      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">Live demo</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Look at the camera, then close your eyes for a second or two, yawn, or turn your head.
          </p>
        </div>
        <p className="flex items-center gap-2 text-xs text-zinc-400">
          <LockIcon />
          Everything runs in your browser. No video or images are uploaded or stored.
        </p>
      </div>

      <p className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-400 md:hidden">
        Best experienced on desktop Chrome.
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <div
            className={`relative aspect-[4/3] overflow-hidden rounded-2xl border bg-zinc-900 transition-colors ${
              drowsy ? "border-red-500 shadow-[0_0_40px_-8px_rgba(239,68,68,0.7)]" : "border-zinc-800"
            }`}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              className={`absolute inset-0 h-full w-full -scale-x-100 object-cover ${phase === "running" ? "" : "invisible"}`}
            />
            <canvas
              ref={canvasRef}
              className={`absolute inset-0 h-full w-full -scale-x-100 object-cover ${phase === "running" ? "" : "invisible"}`}
            />

            {phase === "running" && (
              <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-zinc-200 backdrop-blur">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                Live
              </span>
            )}

            {phase === "idle" && (
              <Overlay>
                <CameraIcon />
                <p className="max-w-xs text-sm text-zinc-400">
                  Start the camera to run face landmark detection on your webcam, right here in the browser.
                </p>
                <button type="button" onClick={() => void startCamera()} className="btn-primary">
                  Start Camera
                </button>
              </Overlay>
            )}

            {phase === "loading" && (
              <Overlay>
                <span className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
                <p className="text-sm text-zinc-300">Loading AI model...</p>
                <p className="text-xs text-zinc-500">Allow camera access if your browser asks.</p>
              </Overlay>
            )}

            {phase === "error" && error && (
              <Overlay>
                <p className="text-base font-medium text-zinc-100">{ERRORS[error].title}</p>
                <p className="max-w-sm text-sm text-zinc-400">{ERRORS[error].body}</p>
                <button type="button" onClick={() => void startCamera()} className="btn-primary">
                  Try again
                </button>
              </Overlay>
            )}
          </div>

          <EarChart historyRef={historyRef} threshold={settings.earThreshold} active={phase === "running"} />
        </div>

        <div className="flex flex-col gap-6">
          <StatsPanel stats={stats} settings={settings} active={phase === "running"} />
          <Controls
            settings={settings}
            onChange={setSettings}
            showMesh={showMesh}
            onShowMesh={setShowMesh}
            muted={muted}
            onMute={setMuted}
            running={phase === "running"}
            onStop={stopCamera}
          />
        </div>
      </div>
    </section>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">{children}</div>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-12 w-12 text-zinc-600" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M15 10l4.55-2.28A1 1 0 0121 8.62v6.76a1 1 0 01-1.45.9L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  );
}
