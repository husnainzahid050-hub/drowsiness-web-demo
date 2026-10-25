import { median, variance } from "./geometry";
import { Settings, type Tuning } from "./settings";

// Glasses frames hide part of the eye, so EAR sits low but steady even when
// the driver is awake. Glasses are assumed when, over ~3 s of frames:
//   1. the median EAR is inside the "glasses zone" (0.13–0.21),
//   2. its variance is low (flat suppression, not a drowsy drop),
//   3. the head is upright,
// for several evaluations in a row. Then the EAR threshold is relaxed and
// more closed frames are needed, so head pose carries more of the decision.
export class GlassesDetector {
  glassesDetected = false;

  private earHistory: number[] = [];
  private pitchHistory: number[] = [];
  private confirmFrames = 0;
  private framesSinceCheck = 0;

  update(avgEar: number, pitch: number): boolean {
    this.earHistory.push(avgEar);
    this.pitchHistory.push(pitch);
    if (this.earHistory.length > Settings.GLASSES_HISTORY_FRAMES) this.earHistory.shift();
    if (this.pitchHistory.length > Settings.GLASSES_HISTORY_FRAMES) this.pitchHistory.shift();
    this.framesSinceCheck += 1;

    if (this.earHistory.length < Settings.GLASSES_HISTORY_FRAMES) return this.glassesDetected;
    if (this.framesSinceCheck < Settings.GLASSES_RECHECK_INTERVAL && this.glassesDetected) {
      return this.glassesDetected;
    }
    this.framesSinceCheck = 0;
    this.evaluate();
    return this.glassesDetected;
  }

  adjustedEarThreshold(tuning: Tuning): number {
    return this.glassesDetected
      ? tuning.earThreshold - Settings.GLASSES_EAR_THRESHOLD_REDUCTION
      : tuning.earThreshold;
  }

  reset() {
    this.earHistory = [];
    this.pitchHistory = [];
    this.confirmFrames = 0;
  }

  private evaluate() {
    const medianEar = median(this.earHistory);
    const earVariance = variance(this.earHistory);
    const medianPitch = median(this.pitchHistory.map(Math.abs));

    const suppressed = medianEar >= Settings.GLASSES_EAR_LOW && medianEar <= Settings.GLASSES_EAR_HIGH;
    const lowVariance = earVariance < Settings.GLASSES_EAR_VARIANCE_THRESHOLD;
    const upright = medianPitch < 20;

    if (suppressed && lowVariance && upright) {
      this.confirmFrames += 1;
      if (this.confirmFrames >= Settings.GLASSES_CONFIRM_FRAMES) this.glassesDetected = true;
    } else {
      this.confirmFrames = Math.max(0, this.confirmFrames - 1);
      if (this.confirmFrames === 0) this.glassesDetected = false;
    }
  }
}
