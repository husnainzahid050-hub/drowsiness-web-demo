"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alarm } from "@/lib/alarm";
import { MovingAverage, type HeadPose } from "@/lib/metrics";

export type DetectorStatus = "awake" | "drowsy" | "yawning" | "away" | "noface";

export interface DetectorSettings {
  earThreshold: number;
  marThreshold: number;
  consecFrames: number;
  headThreshold: number;
}

export const DEFAULT_SETTINGS: DetectorSettings = {
  earThreshold: 0.25,
  marThreshold: 0.6,
  consecFrames: 20,
  headThreshold: 25,
};

export const YAWN_FRAMES = 15;
export const HISTORY_MS = 10_000;
const SMOOTHING_WINDOW = 5;
const PUBLISH_EVERY_MS = 100;

export interface FrameMetrics {
  ear: number;
  mar: number;
  pose: HeadPose | null;
}

export interface FrameVerdict {
  eyesClosed: boolean;
  mouthOpen: boolean;
}

export interface EarSample {
  t: number;
  ear: number;
}

export interface DetectorStats {
  status: DetectorStatus;
  ear: number | null;
  mar: number | null;
  pose: HeadPose | null;
  closedFrames: number;
  fps: number;
}

const IDLE_STATS: DetectorStats = {
  status: "noface",
  ear: null,
  mar: null,
  pose: null,
  closedFrames: 0,
  fps: 0,
};

function createState() {
  return {
    ear: new MovingAverage(SMOOTHING_WINDOW),
    mar: new MovingAverage(SMOOTHING_WINDOW),
    yaw: new MovingAverage(SMOOTHING_WINDOW),
    pitch: new MovingAverage(SMOOTHING_WINDOW),
    roll: new MovingAverage(SMOOTHING_WINDOW),
    closedFrames: 0,
    yawnFrames: 0,
    status: "noface" as DetectorStatus,
    lastPublish: 0,
    fpsWindowStart: 0,
    fpsFrames: 0,
    fps: 0,
  };
}

export function useDrowsinessDetector(settings: DetectorSettings) {
  const [stats, setStats] = useState<DetectorStats>(IDLE_STATS);
  const [muted, setMutedState] = useState(false);
  const settingsRef = useRef(settings);
  const stateRef = useRef<ReturnType<typeof createState> | null>(null);
  const alarmRef = useRef<Alarm | null>(null);
  const historyRef = useRef<EarSample[]>([]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => () => alarmRef.current?.dispose(), []);

  const getState = () => (stateRef.current ??= createState());

  const armAudio = useCallback(() => {
    alarmRef.current ??= new Alarm();
    alarmRef.current.muted = muted;
    alarmRef.current.unlock();
  }, [muted]);

  const setMuted = useCallback((value: boolean) => {
    if (alarmRef.current) alarmRef.current.muted = value;
    setMutedState(value);
  }, []);

  const pause = useCallback(() => alarmRef.current?.stop(), []);

  const reset = useCallback(() => {
    alarmRef.current?.stop();
    stateRef.current = createState();
    historyRef.current = [];
    setStats(IDLE_STATS);
  }, []);

  const update = useCallback((metrics: FrameMetrics | null, now: number): FrameVerdict => {
    const s = getState();
    const cfg = settingsRef.current;

    s.fpsFrames += 1;
    if (now - s.fpsWindowStart >= 1000) {
      if (s.fpsWindowStart > 0) s.fps = (s.fpsFrames * 1000) / (now - s.fpsWindowStart);
      s.fpsWindowStart = now;
      s.fpsFrames = 0;
    }

    const publish = (next: DetectorStats) => {
      if (next.status !== s.status || now - s.lastPublish >= PUBLISH_EVERY_MS) {
        s.lastPublish = now;
        setStats(next);
      }
      s.status = next.status;
    };

    const history = historyRef.current;
    while (history.length && history[0].t < now - HISTORY_MS) history.shift();

    if (!metrics) {
      // Counters are kept as they are and resume once the face is back.
      alarmRef.current?.stop();
      for (const avg of [s.ear, s.mar, s.yaw, s.pitch, s.roll]) avg.clear();
      history.push({ t: now, ear: Number.NaN });
      publish({ ...IDLE_STATS, closedFrames: s.closedFrames, fps: s.fps });
      return { eyesClosed: false, mouthOpen: false };
    }

    const ear = s.ear.push(metrics.ear);
    const mar = s.mar.push(metrics.mar);
    const pose = metrics.pose
      ? {
          yaw: s.yaw.push(metrics.pose.yaw),
          pitch: s.pitch.push(metrics.pose.pitch),
          roll: s.roll.push(metrics.pose.roll),
        }
      : null;

    const eyesClosed = ear < cfg.earThreshold;
    const mouthOpen = mar > cfg.marThreshold;
    s.closedFrames = eyesClosed ? s.closedFrames + 1 : 0;
    s.yawnFrames = mouthOpen ? s.yawnFrames + 1 : 0;
    const lookingAway =
      pose !== null && (Math.abs(pose.yaw) > cfg.headThreshold || Math.abs(pose.pitch) > cfg.headThreshold);

    let status: DetectorStatus = "awake";
    if (s.closedFrames >= cfg.consecFrames) status = "drowsy";
    else if (s.yawnFrames >= YAWN_FRAMES) status = "yawning";
    else if (lookingAway) status = "away";

    if (status === "drowsy") alarmRef.current?.start();
    else alarmRef.current?.stop();

    history.push({ t: now, ear });
    publish({ status, ear, mar, pose, closedFrames: s.closedFrames, fps: s.fps });
    return { eyesClosed, mouthOpen };
  }, []);

  return { stats, muted, setMuted, armAudio, pause, reset, update, historyRef };
}
