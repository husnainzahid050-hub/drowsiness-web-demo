import type { Connection, FaceConnections } from "./faceLandmarker";
import { LEFT_EYE, MOUTH_POINTS, RIGHT_EYE, type Point } from "./metrics";

const OK = "#34d399";
const ALERT = "#f87171";
const MESH = "rgba(148, 163, 184, 0.28)";

export interface OverlayState {
  eyesClosed: boolean;
  mouthOpen: boolean;
  showMesh: boolean;
}

function strokeConnections(
  ctx: CanvasRenderingContext2D,
  pts: Point[],
  connections: Connection[],
  color: string,
  width: number,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (const { start, end } of connections) {
    const a = pts[start];
    const b = pts[end];
    if (!a || !b) continue;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
}

function dots(ctx: CanvasRenderingContext2D, pts: Point[], idx: readonly number[], color: string, r: number) {
  ctx.fillStyle = color;
  for (const i of idx) {
    const p = pts[i];
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function clearOverlay(canvas: HTMLCanvasElement) {
  canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
}

export function drawOverlay(
  canvas: HTMLCanvasElement,
  pts: Point[],
  connections: FaceConnections,
  state: OverlayState,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scale = Math.max(1, canvas.width / 640);
  if (state.showMesh) strokeConnections(ctx, pts, connections.tesselation, MESH, 0.6 * scale);

  const eyeColor = state.eyesClosed ? ALERT : OK;
  strokeConnections(ctx, pts, connections.leftEye, eyeColor, 1.5 * scale);
  strokeConnections(ctx, pts, connections.rightEye, eyeColor, 1.5 * scale);
  dots(ctx, pts, LEFT_EYE, eyeColor, 2.5 * scale);
  dots(ctx, pts, RIGHT_EYE, eyeColor, 2.5 * scale);

  const mouthColor = state.mouthOpen ? ALERT : OK;
  strokeConnections(ctx, pts, connections.lips, mouthColor, 1.2 * scale);
  dots(ctx, pts, MOUTH_POINTS, mouthColor, 2.5 * scale);
}
