import { mean, round, type Landmark } from "./geometry";
import { Settings, type Tuning } from "./settings";

type Vec3 = [number, number, number];
type Mat3 = [Vec3, Vec3, Vec3];

// Average face geometry in millimetres, OpenCV camera axes (X right, Y down,
// Z away from the camera), so a driver looking at the camera gives pitch ≈ 0.
const FACE_3D_MODEL: readonly Vec3[] = [
  [0.0, 0.0, 0.0], // nose tip (4)
  [0.0, 63.6, 12.5], // chin (152)
  [-43.3, -32.7, 26.0], // left eye left corner (33)
  [43.3, -32.7, 26.0], // right eye right corner (263)
  [-28.9, 28.9, 24.1], // left mouth corner (61)
  [28.9, 28.9, 24.1], // right mouth corner (291)
];
export const POSE_LANDMARK_INDICES = [4, 152, 33, 263, 61, 291];

interface Camera {
  f: number;
  cx: number;
  cy: number;
}

export interface Pose {
  rvec: Vec3;
  tvec: Vec3;
}

// Rotation vector (axis * angle) to rotation matrix, like cv2.Rodrigues.
export function rodrigues(r: Vec3): Mat3 {
  const theta = Math.hypot(r[0], r[1], r[2]);
  if (theta < 1e-12) {
    return [
      [1, -r[2], r[1]],
      [r[2], 1, -r[0]],
      [-r[1], r[0], 1],
    ];
  }
  const [x, y, z] = r.map((v) => v / theta);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const v = 1 - c;
  return [
    [c + x * x * v, x * y * v - z * s, x * z * v + y * s],
    [y * x * v + z * s, c + y * y * v, y * z * v - x * s],
    [z * x * v - y * s, z * y * v + x * s, c + z * z * v],
  ];
}

function project(point: Vec3, R: Mat3, t: Vec3, cam: Camera): [number, number] {
  const X = R[0][0] * point[0] + R[0][1] * point[1] + R[0][2] * point[2] + t[0];
  const Y = R[1][0] * point[0] + R[1][1] * point[1] + R[1][2] * point[2] + t[1];
  const Z = R[2][0] * point[0] + R[2][1] * point[1] + R[2][2] * point[2] + t[2];
  return [(cam.f * X) / Z + cam.cx, (cam.f * Y) / Z + cam.cy];
}

function residuals(p: number[], image: readonly [number, number][], cam: Camera): number[] {
  const R = rodrigues([p[0], p[1], p[2]]);
  const t: Vec3 = [p[3], p[4], p[5]];
  const out: number[] = [];
  FACE_3D_MODEL.forEach((pt, i) => {
    const [u, v] = project(pt, R, t, cam);
    out.push(u - image[i][0], v - image[i][1]);
  });
  return out;
}

const sumSq = (r: number[]) => r.reduce((a, b) => a + b * b, 0);

function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-14) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

// Levenberg–Marquardt minimisation of the reprojection error, the same
// objective cv2.solvePnP solves. 6 points and 6 unknowns: a few microseconds.
function refine(start: number[], image: readonly [number, number][], cam: Camera) {
  let p = [...start];
  let r = residuals(p, image, cam);
  let cost = sumSq(r);
  let lambda = 1e-3;

  for (let iter = 0; iter < 40; iter++) {
    const J: number[][] = r.map(() => new Array(6).fill(0));
    for (let k = 0; k < 6; k++) {
      const h = k < 3 ? 1e-6 : 1e-4 * Math.max(1, Math.abs(p[k]));
      const q = [...p];
      q[k] += h;
      const rq = residuals(q, image, cam);
      for (let i = 0; i < r.length; i++) J[i][k] = (rq[i] - r[i]) / h;
    }
    const JtJ = Array.from({ length: 6 }, (_, a) =>
      Array.from({ length: 6 }, (_, b) => J.reduce((s, row) => s + row[a] * row[b], 0)),
    );
    const Jtr = Array.from({ length: 6 }, (_, a) => J.reduce((s, row, i) => s + row[a] * r[i], 0));

    let improved = false;
    for (let attempt = 0; attempt < 8; attempt++) {
      const A = JtJ.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) + 1e-12 : v)));
      const delta = solveLinear(
        A,
        Jtr.map((v) => -v),
      );
      if (!delta) break;
      const q = p.map((v, i) => v + delta[i]);
      if (q[5] <= 0) {
        lambda *= 10;
        continue;
      }
      const rq = residuals(q, image, cam);
      const cq = sumSq(rq);
      if (cq < cost) {
        const step = Math.hypot(...delta);
        p = q;
        r = rq;
        const gain = cost - cq;
        cost = cq;
        lambda = Math.max(lambda / 10, 1e-9);
        improved = true;
        if (step < 1e-9 || gain < 1e-12) return { p, cost };
        break;
      }
      lambda *= 10;
    }
    if (!improved) break;
  }
  return { p, cost };
}

export function solvePnP(image: readonly [number, number][], cam: Camera, previous: Pose | null): Pose | null {
  if (image.some(([u, v]) => !Number.isFinite(u) || !Number.isFinite(v))) return null;

  // Frontal start: no rotation, distance from the eye-corner spacing.
  const eyePx = Math.hypot(image[3][0] - image[2][0], image[3][1] - image[2][1]);
  if (eyePx < 1) return null;
  const tz = (cam.f * 86.6) / eyePx;
  const frontal = [0, 0, 0, ((image[0][0] - cam.cx) * tz) / cam.f, ((image[0][1] - cam.cy) * tz) / cam.f, tz];

  let best = refine(frontal, image, cam);
  if (previous) {
    const warm = refine([...previous.rvec, ...previous.tvec], image, cam);
    if (warm.cost < best.cost) best = warm;
  }
  const p = best.p;
  if (!p.every(Number.isFinite) || p[5] <= 0) return null;
  return { rvec: [p[0], p[1], p[2]], tvec: [p[3], p[4], p[5]] };
}

// Tait–Bryan decomposition, identical to head_pose.py.
export function eulerFromRotation(R: Mat3): { pitch: number; yaw: number; roll: number } {
  const deg = (r: number) => (r * 180) / Math.PI;
  const sy = Math.hypot(R[0][0], R[1][0]);
  if (sy >= 1e-6) {
    return {
      pitch: deg(Math.atan2(R[2][1], R[2][2])),
      yaw: deg(Math.atan2(-R[2][0], sy)),
      roll: deg(Math.atan2(R[1][0], R[0][0])),
    };
  }
  return { pitch: deg(Math.atan2(-R[1][2], R[1][1])), yaw: deg(Math.atan2(-R[2][0], sy)), roll: 0 };
}

export type PoseStatus = "No Pose" | "Nodding" | "Tilting" | "Normal";

// Positive pitch = head nodding forward (towards the chest).
export class HeadPoseEstimator {
  pitch = 0;
  yaw = 0;
  roll = 0;
  poseValid = false;
  pose: Pose | null = null;

  private pitchHistory: number[] = [];
  private camera: Camera | null = null;

  estimate(landmarks: readonly Landmark[], w: number, h: number): [number, number, number] {
    if (!this.camera || this.camera.cx !== w / 2 || this.camera.cy !== h / 2) {
      this.camera = { f: w, cx: w / 2, cy: h / 2 };
    }
    const image = POSE_LANDMARK_INDICES.map((i) => [landmarks[i].x * w, landmarks[i].y * h] as [number, number]);
    const pose = solvePnP(image, this.camera, this.pose);
    if (!pose) {
      this.poseValid = false;
      return [this.pitch, this.yaw, this.roll];
    }
    this.pose = pose;
    const { pitch, yaw, roll } = eulerFromRotation(rodrigues(pose.rvec));

    this.pitchHistory.push(pitch);
    if (this.pitchHistory.length > Settings.PITCH_SMOOTHING_WINDOW) this.pitchHistory.shift();
    this.pitch = round(mean(this.pitchHistory), 1);
    this.yaw = round(yaw, 1);
    this.roll = round(roll, 1);
    this.poseValid = true;
    return [this.pitch, this.yaw, this.roll];
  }

  isDrowsyPose(tuning: Tuning): boolean {
    if (!this.poseValid) return false;
    return this.pitch > tuning.pitchThreshold || Math.abs(this.roll) > tuning.rollThreshold;
  }

  status(tuning: Tuning): PoseStatus {
    if (!this.poseValid) return "No Pose";
    if (this.pitch > tuning.pitchThreshold) return "Nodding";
    if (Math.abs(this.roll) > tuning.rollThreshold) return "Tilting";
    return "Normal";
  }

  // Nose-origin X/Y/Z axes projected onto the image, for the overlay.
  axes(length = 60): { origin: [number, number]; x: [number, number]; y: [number, number]; z: [number, number] } | null {
    if (!this.poseValid || !this.pose || !this.camera) return null;
    const R = rodrigues(this.pose.rvec);
    const t = this.pose.tvec;
    return {
      origin: project([0, 0, 0], R, t, this.camera),
      x: project([length, 0, 0], R, t, this.camera),
      y: project([0, length, 0], R, t, this.camera),
      z: project([0, 0, length], R, t, this.camera),
    };
  }

  reset() {
    this.pitchHistory = [];
    this.pitch = this.yaw = this.roll = 0;
    this.poseValid = false;
    this.pose = null;
  }
}
