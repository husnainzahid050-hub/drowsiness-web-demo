import { distance, mean, round, type Px } from "./geometry";

// EAR = (|p2 - p6| + |p3 - p5|) / (2 * |p1 - p4|)
// p1/p4 are the eye corners, p2/p3 the upper lid, p6/p5 the lower lid.
// Open eye ≈ 0.25–0.35, closed ≈ 0.0–0.15. A blink lasts 2–4 frames,
// so only a run of low values (CONSEC_FRAMES) counts as drowsiness.
export function computeEar(eye: readonly Px[]): number {
  const a = distance(eye[1], eye[5]);
  const b = distance(eye[2], eye[4]);
  const c = distance(eye[0], eye[3]);
  if (c === 0) return 0;
  return round((a + b) / (2 * c), 4);
}

export const averageEar = (left: number, right: number) => round((left + right) / 2, 4);

// Moving average over the last few frames to remove landmark jitter.
export class EarSmoother {
  private history: number[] = [];

  constructor(private readonly windowSize = 5) {}

  smooth(ear: number): number {
    this.history.push(ear);
    if (this.history.length > this.windowSize) this.history.shift();
    return round(mean(this.history), 4);
  }

  reset() {
    this.history = [];
  }
}
