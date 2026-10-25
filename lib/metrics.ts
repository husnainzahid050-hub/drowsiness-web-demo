export interface Point {
  x: number;
  y: number;
}

export interface HeadPose {
  yaw: number;
  pitch: number;
  roll: number;
}

// Face mesh indices in p1..p6 order: p1/p4 are the eye corners,
// p2/p3 sit on the upper lid and p6/p5 directly below them on the lower lid.
export const LEFT_EYE = [33, 160, 158, 133, 153, 144] as const;
export const RIGHT_EYE = [362, 385, 387, 263, 373, 380] as const;

export const MOUTH_VERTICAL = [
  [13, 14],
  [81, 178],
  [311, 402],
] as const;
export const MOUTH_HORIZONTAL = [78, 308] as const;
export const MOUTH_POINTS = [...MOUTH_VERTICAL.flat(), ...MOUTH_HORIZONTAL];

// Landmarks are normalised to 0..1 on each axis. Scaling to pixels keeps the
// ratios honest when the video is not square.
export function toPixels(
  landmarks: ReadonlyArray<{ x: number; y: number }>,
  width: number,
  height: number,
): Point[] {
  return landmarks.map((p) => ({ x: p.x * width, y: p.y * height }));
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// EAR = (|p2 - p6| + |p3 - p5|) / (2 * |p1 - p4|)
// The eye height shrinks towards 0 when the lid closes while the width stays
// constant, so the ratio drops sharply on a blink and stays low when eyes close.
export function eyeAspectRatio(pts: Point[], idx: readonly number[]): number {
  const [p1, p2, p3, p4, p5, p6] = idx.map((i) => pts[i]);
  const width = distance(p1, p4);
  if (width === 0) return 0;
  return (distance(p2, p6) + distance(p3, p5)) / (2 * width);
}

export function computeEar(pts: Point[]): number {
  return (eyeAspectRatio(pts, LEFT_EYE) + eyeAspectRatio(pts, RIGHT_EYE)) / 2;
}

// MAR = mean inner-lip opening over three vertical pairs / mouth width.
// A yawn opens the mouth far more than talking or smiling does.
export function computeMar(pts: Point[]): number {
  const width = distance(pts[MOUTH_HORIZONTAL[0]], pts[MOUTH_HORIZONTAL[1]]);
  if (width === 0) return 0;
  const opening =
    MOUTH_VERTICAL.reduce((sum, [a, b]) => sum + distance(pts[a], pts[b]), 0) /
    MOUTH_VERTICAL.length;
  return opening / width;
}

const toDegrees = (rad: number) => (rad * 180) / Math.PI;

// The facial transformation matrix is a 4x4 column-major pose matrix; its
// upper-left 3x3 block is the head rotation R. Decomposing R as Rz·Ry·Rx gives
//   pitch (x) = atan2(R21, R22)
//   yaw   (y) = atan2(-R20, sqrt(R00² + R10²))
//   roll  (z) = atan2(R10, R00)
export function headPoseFromMatrix(data: ArrayLike<number>): HeadPose {
  const r = (row: number, col: number) => data[col * 4 + row];
  const sy = Math.hypot(r(0, 0), r(1, 0));
  if (sy < 1e-6) {
    return {
      yaw: toDegrees(Math.atan2(-r(2, 0), sy)),
      pitch: toDegrees(Math.atan2(-r(1, 2), r(1, 1))),
      roll: 0,
    };
  }
  return {
    yaw: toDegrees(Math.atan2(-r(2, 0), sy)),
    pitch: toDegrees(Math.atan2(r(2, 1), r(2, 2))),
    roll: toDegrees(Math.atan2(r(1, 0), r(0, 0))),
  };
}

// Mean of the last `size` values, used to damp landmark jitter.
export class MovingAverage {
  private values: number[] = [];

  constructor(private readonly size: number) {}

  push(value: number): number {
    this.values.push(value);
    if (this.values.length > this.size) this.values.shift();
    return this.values.reduce((a, b) => a + b, 0) / this.values.length;
  }

  clear(): void {
    this.values = [];
  }
}
