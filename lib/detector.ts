import { AlertManager } from "./alerts";
import { averageEar, computeEar, EarSmoother } from "./ear";
import { pixelCoords, type Landmark } from "./geometry";
import { GlassesDetector } from "./glasses";
import { HeadPoseEstimator, type PoseStatus } from "./headPose";
import { Settings, type Tuning } from "./settings";
import { computeMar, MOUTH_INDICES, YawnDetector } from "./yawn";

export type AlertReason = "eyes" | "head" | "yawn";

export interface Snapshot {
  faceDetected: boolean;
  leftEar: number;
  rightEar: number;
  avgEar: number;
  earThreshold: number;
  closedFrames: number;
  closedFramesNeeded: number;
  mar: number;
  smoothMar: number;
  yawnActive: boolean;
  surpriseActive: boolean;
  yawnFrames: number;
  yawnFramesNeeded: number;
  totalYawns: number;
  yawnCues: string;
  pitch: number;
  yaw: number;
  roll: number;
  poseValid: boolean;
  poseStatus: PoseStatus;
  poseFrames: number;
  glasses: boolean;
  alertActive: boolean;
  reasons: AlertReason[];
  totalAlerts: number;
  vibrating: boolean;
  fps: number;
  frames: number;
}

export interface FrameDrawInfo {
  eyesClosed: boolean;
  mouth: "normal" | "yawn" | "surprise";
}

export const EMPTY_SNAPSHOT: Snapshot = {
  faceDetected: false,
  leftEar: 0,
  rightEar: 0,
  avgEar: 0,
  earThreshold: Settings.EAR_THRESHOLD,
  closedFrames: 0,
  closedFramesNeeded: Settings.CONSEC_FRAMES,
  mar: 0,
  smoothMar: 0,
  yawnActive: false,
  surpriseActive: false,
  yawnFrames: 0,
  yawnFramesNeeded: Settings.YAWN_CONSEC_FRAMES,
  totalYawns: 0,
  yawnCues: "",
  pitch: 0,
  yaw: 0,
  roll: 0,
  poseValid: false,
  poseStatus: "No Pose",
  poseFrames: 0,
  glasses: false,
  alertActive: false,
  reasons: [],
  totalAlerts: 0,
  vibrating: false,
  fps: 0,
  frames: 0,
};

// Port of DrowsinessDetector (_analyse_frame + _update_state) from detector.py.
// The alarm fires when ANY of these holds:
//   • EAR below threshold for CONSEC_FRAMES frames (x1.5 and a lower threshold with glasses)
//   • head pitch > PITCH or |roll| > ROLL for HEAD_POSE_CONSEC_FRAMES frames
//   • a confirmed yawn
export class DrowsinessEngine {
  readonly alerts: AlertManager;
  readonly headPose = new HeadPoseEstimator();

  private smoother = new EarSmoother(Settings.EAR_SMOOTHING_WINDOW);
  private yawn = new YawnDetector();
  private glasses = new GlassesDetector();
  private consecFrames = 0;
  private poseConsec = 0;
  private alertActive = false;
  private totalAlerts = 0;
  private reasons: AlertReason[] = [];
  private frameCounter = 0;
  private fps = 0;
  private fpsCounter = 0;
  private fpsTimer = performance.now();
  private last: Snapshot = EMPTY_SNAPSHOT;

  constructor(alerts: AlertManager) {
    this.alerts = alerts;
  }

  process(landmarks: readonly Landmark[] | null, w: number, h: number, tuning: Tuning): { snapshot: Snapshot; draw: FrameDrawInfo } {
    this.frameCounter += 1;
    this.updateFps();

    if (!landmarks) {
      // Like the Python loop: no face means no state change, just no new data.
      this.last = { ...this.last, faceDetected: false, ...this.alertFields(), fps: this.fps, frames: this.frameCounter };
      return { snapshot: this.last, draw: { eyesClosed: false, mouth: "normal" } };
    }

    const leftEar = computeEar(pixelCoords(landmarks, Settings.LEFT_EYE_INDICES, w, h));
    const rightEar = computeEar(pixelCoords(landmarks, Settings.RIGHT_EYE_INDICES, w, h));
    const avgEar = this.smoother.smooth(averageEar(leftEar, rightEar));

    const [pitch, yaw, roll] = this.headPose.estimate(landmarks, w, h);
    this.glasses.update(avgEar, pitch);

    const mar = computeMar(pixelCoords(landmarks, MOUTH_INDICES, w, h));
    const yawnActive = this.yawn.update(mar, pitch, avgEar, this.fps, tuning);

    const glasses = this.glasses.glassesDetected;
    const earThreshold = this.glasses.adjustedEarThreshold(tuning);
    this.consecFrames = avgEar < earThreshold ? this.consecFrames + 1 : 0;
    this.poseConsec = this.headPose.isDrowsyPose(tuning) ? this.poseConsec + 1 : 0;

    const closedFramesNeeded = Math.trunc(tuning.consecFrames * (glasses ? Settings.GLASSES_CONSEC_MULTIPLIER : 1));
    const reasons: AlertReason[] = [];
    if (this.consecFrames >= closedFramesNeeded) reasons.push("eyes");
    if (this.poseConsec >= Settings.HEAD_POSE_CONSEC_FRAMES) reasons.push("head");
    if (yawnActive) reasons.push("yawn");

    if (reasons.length) {
      if (!this.alertActive) {
        this.alertActive = true;
        this.totalAlerts += 1;
      }
      this.alerts.trigger(this.frameCounter);
    } else {
      this.alertActive = false;
      this.alerts.clear();
    }
    this.reasons = reasons;

    this.last = {
      faceDetected: true,
      leftEar,
      rightEar,
      avgEar,
      earThreshold,
      closedFrames: this.consecFrames,
      closedFramesNeeded,
      mar,
      smoothMar: this.yawn.smoothMar,
      yawnActive,
      surpriseActive: this.yawn.surpriseActive,
      yawnFrames: this.yawn.consecFrames,
      yawnFramesNeeded: tuning.yawnFrames,
      totalYawns: this.yawn.totalYawns,
      yawnCues: this.yawn.lastCues,
      pitch,
      yaw,
      roll,
      poseValid: this.headPose.poseValid,
      poseStatus: this.headPose.status(tuning),
      poseFrames: this.poseConsec,
      glasses,
      ...this.alertFields(),
      fps: this.fps,
      frames: this.frameCounter,
    };

    return {
      snapshot: this.last,
      draw: {
        eyesClosed: avgEar < earThreshold,
        mouth: yawnActive ? "yawn" : this.yawn.surpriseActive ? "surprise" : "normal",
      },
    };
  }

  // Python's "R" key: clear the current episode, keep the session totals.
  resetState() {
    this.consecFrames = 0;
    this.poseConsec = 0;
    this.alertActive = false;
    this.reasons = [];
    this.alerts.clear();
    this.smoother.reset();
    this.yawn.reset();
    this.headPose.reset();
  }

  private alertFields() {
    return {
      alertActive: this.alertActive,
      reasons: this.reasons,
      totalAlerts: this.totalAlerts,
      vibrating: this.alerts.vibrating,
    };
  }

  private updateFps() {
    this.fpsCounter += 1;
    if (this.fpsCounter >= 30) {
      const now = performance.now();
      this.fps = (this.fpsCounter * 1000) / (now - this.fpsTimer);
      this.fpsTimer = now;
      this.fpsCounter = 0;
    }
  }
}
