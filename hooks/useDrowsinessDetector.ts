"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertManager } from "@/lib/alerts";
import { DrowsinessEngine, EMPTY_SNAPSHOT, type FrameDrawInfo, type Snapshot } from "@/lib/detector";
import type { Landmark } from "@/lib/geometry";
import type { HeadPoseEstimator } from "@/lib/headPose";
import type { Tuning } from "@/lib/settings";

export const HISTORY_MS = 10_000;
const PUBLISH_EVERY_MS = 100;

export interface EarSample {
  t: number;
  ear: number;
  threshold: number;
}

export function useDrowsinessDetector(tuning: Tuning) {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [muted, setMutedState] = useState(false);
  const [sessionStart, setSessionStart] = useState<number | null>(null);

  const tuningRef = useRef(tuning);
  const alertsRef = useRef<AlertManager | null>(null);
  const engineRef = useRef<DrowsinessEngine | null>(null);
  const historyRef = useRef<EarSample[]>([]);
  const lastPublishRef = useRef(0);
  const lastKeyRef = useRef("");

  useEffect(() => {
    tuningRef.current = tuning;
  }, [tuning]);

  useEffect(() => () => alertsRef.current?.dispose(), []);

  // Called from the Start button click so audio is allowed to play.
  const newSession = useCallback(() => {
    const manager = (alertsRef.current ??= new AlertManager());
    manager.unlock();
    manager.reset();
    engineRef.current = new DrowsinessEngine(manager);
    historyRef.current = [];
    lastKeyRef.current = "";
    setSnapshot(EMPTY_SNAPSHOT);
    setSessionStart(Date.now());
  }, []);

  const endSession = useCallback(() => {
    alertsRef.current?.reset();
    engineRef.current = null;
    historyRef.current = [];
    setSnapshot(EMPTY_SNAPSHOT);
    setSessionStart(null);
  }, []);

  const resetState = useCallback(() => {
    engineRef.current?.resetState();
    historyRef.current = [];
  }, []);

  const pauseAlerts = useCallback(() => alertsRef.current?.reset(), []);

  const setMuted = useCallback((value: boolean) => {
    (alertsRef.current ??= new AlertManager()).setMuted(value);
    setMutedState(value);
  }, []);

  const processFrame = useCallback(
    (landmarks: readonly Landmark[] | null, w: number, h: number): { draw: FrameDrawInfo; headPose: HeadPoseEstimator } | null => {
      const engine = engineRef.current;
      if (!engine) return null;
      const now = performance.now();
      const { snapshot: snap, draw } = engine.process(landmarks, w, h, tuningRef.current);

      const history = historyRef.current;
      while (history.length && history[0].t < now - HISTORY_MS) history.shift();
      history.push({ t: now, ear: snap.faceDetected ? snap.avgEar : Number.NaN, threshold: snap.earThreshold });

      const key = `${snap.faceDetected}|${snap.alertActive}|${snap.reasons.join()}|${snap.surpriseActive}|${snap.glasses}`;
      if (key !== lastKeyRef.current || now - lastPublishRef.current >= PUBLISH_EVERY_MS) {
        lastKeyRef.current = key;
        lastPublishRef.current = now;
        setSnapshot(snap);
      }
      return { draw, headPose: engine.headPose };
    },
    [],
  );

  return { snapshot, muted, setMuted, sessionStart, newSession, endSession, resetState, pauseAlerts, processFrame, historyRef };
}
