import { distance, mean, round, type Px } from "./geometry";
import { marExitThreshold, Settings, type Tuning } from "./settings";

// [left corner, upper outer, upper inner, right corner, lower inner, lower outer]
export const MOUTH_INDICES = [61, 82, 13, 291, 14, 87];
export const MOUTH_OUTLINE_INDICES = [
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146, 61,
];

// MAR = (|p2 - p6| + |p3 - p5|) / (2 * |p1 - p4|), the EAR formula applied to the mouth.
// Closed ≈ 0.0–0.3, speech ≈ 0.3–0.5, yawn > 0.5 held for about a second.
export function computeMar(mouth: readonly Px[]): number {
  const a = distance(mouth[1], mouth[5]);
  const b = distance(mouth[2], mouth[4]);
  const c = distance(mouth[0], mouth[3]);
  if (c === 0) return 0;
  return round((a + b) / (2 * c), 4);
}

// A wide-open mouth is a yawn or a surprise. They are told apart by three cues:
//   opening speed  yawn: slow             surprise: sudden
//   head           yawn: tilts up/back    surprise: slightly forward
//   eyes           yawn: half-closed      surprise: wide open (counts double)
// More yawn votes means yawn. On a tie it is a yawn unless the eyes are wide.
export class YawnDetector {
  consecFrames = 0;
  totalYawns = 0;
  yawnActive = false;
  surpriseActive = false;
  lastCues = "";

  private marHistory: number[] = [];
  private gapFrames = 0;
  private riseFrames = 0;
  private onsetFrames: number | null = null;
  private baseEar: number | null = null;
  private basePitch: number | null = null;
  private openEars: number[] = [];
  private minPitch: number | null = null;
  private maxPitch: number | null = null;
  private suddenLimit: number = Settings.YAWN_SUDDEN_ONSET_FRAMES;

  update(mar: number, pitch: number | null, ear: number | null, fps: number, tuning: Tuning): boolean {
    const exit = marExitThreshold(tuning);
    this.suddenLimit = Settings.YAWN_SUDDEN_ONSET_FRAMES;
    if (fps > 0) this.suddenLimit *= fps / Settings.TARGET_FPS;

    this.marHistory.push(mar);
    if (this.marHistory.length > 5) this.marHistory.shift();
    const smoothMar = mean(this.marHistory);

    if (this.consecFrames === 0) {
      // Opening speed uses the raw MAR: smoothing would hide a sudden jump.
      if (mar < Settings.MAR_OPEN_START) {
        this.riseFrames = 0;
        this.onsetFrames = null;
      } else if (this.onsetFrames === null) {
        if (mar >= tuning.marThreshold) this.onsetFrames = this.riseFrames;
        else this.riseFrames += 1;
      }
      if (smoothMar < exit) this.updateBaseline(pitch, ear, tuning);
    }

    if (smoothMar >= tuning.marThreshold) {
      this.consecFrames += 1;
      this.gapFrames = 0;
      if (ear !== null) this.openEars.push(ear);
      if (pitch !== null) {
        this.minPitch = this.minPitch === null ? pitch : Math.min(this.minPitch, pitch);
        this.maxPitch = this.maxPitch === null ? pitch : Math.max(this.maxPitch, pitch);
      }
    } else if (smoothMar >= exit) {
      this.gapFrames = 0;
    } else if (this.consecFrames > 0) {
      this.gapFrames += 1;
      if (this.gapFrames > Settings.YAWN_GAP_FRAMES) this.endOpening();
    }

    // Re-checked every frame: a yawn's head tilt or squint can come late.
    if (this.consecFrames >= tuning.yawnFrames && !this.yawnActive) {
      if (this.looksLikeYawn()) {
        this.yawnActive = true;
        this.surpriseActive = false;
        this.totalYawns += 1;
      } else {
        this.surpriseActive = true;
      }
    }
    return this.yawnActive;
  }

  get smoothMar(): number {
    return this.marHistory.length ? round(mean(this.marHistory), 4) : 0;
  }

  reset() {
    this.endOpening();
    this.marHistory = [];
    this.baseEar = null;
    this.basePitch = null;
  }

  private updateBaseline(pitch: number | null, ear: number | null, tuning: Tuning) {
    const alpha = 0.05;
    if (pitch !== null) {
      this.basePitch = this.basePitch === null ? pitch : (1 - alpha) * this.basePitch + alpha * pitch;
    }
    // Ignore blinks only: some drivers have naturally narrow eyes.
    if (ear !== null && ear >= tuning.earThreshold * 0.7) {
      this.baseEar = this.baseEar === null ? ear : (1 - alpha) * this.baseEar + alpha * ear;
    }
  }

  private looksLikeYawn(): boolean {
    let yawnVotes = 0;
    let surpriseVotes = 0;
    let speed = "?";
    let head = "?";
    let eyes = "?";

    if (this.onsetFrames !== null) {
      if (this.onsetFrames <= this.suddenLimit) {
        surpriseVotes += 1;
        speed = `sudden (${this.onsetFrames}f)`;
      } else {
        yawnVotes += 1;
        speed = `slow (${this.onsetFrames}f)`;
      }
    }

    if (this.basePitch !== null && this.minPitch !== null && this.maxPitch !== null) {
      const back = this.basePitch - this.minPitch;
      const fwd = this.maxPitch - this.basePitch;
      head = "still";
      if (back >= Settings.YAWN_HEAD_TILT_DEG && back >= fwd) {
        yawnVotes += 1;
        head = `back ${back.toFixed(0)}°`;
      } else if (fwd >= Settings.SURPRISE_HEAD_FORWARD_DEG) {
        surpriseVotes += 1;
        head = `forward ${fwd.toFixed(0)}°`;
      }
    }

    let eyesWide = false;
    if (this.baseEar && this.openEars.length) {
      const ratio = mean(this.openEars) / this.baseEar;
      eyes = "normal";
      if (ratio > 1 + Settings.YAWN_EYE_CHANGE_RATIO) {
        surpriseVotes += 2;
        eyesWide = true;
        eyes = `wide ×${ratio.toFixed(2)}`;
      } else if (ratio < 1 - Settings.YAWN_EYE_CHANGE_RATIO) {
        yawnVotes += 2;
        eyes = `sleepy ×${ratio.toFixed(2)}`;
      }
    }

    this.lastCues = `speed ${speed} · head ${head} · eyes ${eyes} (yawn ${yawnVotes} : surprise ${surpriseVotes})`;
    if (yawnVotes === surpriseVotes) return !eyesWide;
    return yawnVotes > surpriseVotes;
  }

  private endOpening() {
    this.yawnActive = false;
    this.surpriseActive = false;
    this.consecFrames = 0;
    this.gapFrames = 0;
    this.riseFrames = 0;
    this.onsetFrames = null;
    this.openEars = [];
    this.minPitch = null;
    this.maxPitch = null;
  }
}
