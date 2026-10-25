export type Px = readonly [number, number];

export interface Landmark {
  x: number;
  y: number;
}

export const distance = (a: Px, b: Px) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export const round = (value: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

export const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length;

export function variance(values: readonly number[]) {
  const m = mean(values);
  return mean(values.map((v) => (v - m) ** 2));
}

export function median(values: readonly number[]) {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Integer pixel coordinates, like int(lm.x * w) in the Python version.
export function pixelCoords(landmarks: readonly Landmark[], indices: readonly number[], w: number, h: number): Px[] {
  return indices.map((i) => [Math.trunc(landmarks[i].x * w), Math.trunc(landmarks[i].y * h)] as const);
}
