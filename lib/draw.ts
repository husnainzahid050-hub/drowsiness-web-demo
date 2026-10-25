import type { FrameDrawInfo } from "./detector";
import type { Connection } from "./faceLandmarker";
import type { Landmark } from "./geometry";
import type { HeadPoseEstimator } from "./headPose";
import { Settings } from "./settings";
import { MOUTH_INDICES, MOUTH_OUTLINE_INDICES } from "./yawn";

const OK = "#34d399";
const ALERT = "#f43f5e";
const WARNING = "#fb923c";
const MOUTH_OK = "#2dd4bf";
const MESH = "rgba(148, 163, 184, 0.22)";
const AXIS = { x: "#f43f5e", y: "#34d399", z: "#60a5fa" };

export function clearOverlay(canvas: HTMLCanvasElement) {
  canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
}

function polyline(ctx: CanvasRenderingContext2D, lm: readonly Landmark[], idx: readonly number[], w: number, h: number, close: boolean) {
  ctx.beginPath();
  idx.forEach((i, n) => {
    const x = lm[i].x * w;
    const y = lm[i].y * h;
    if (n === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  if (close) ctx.closePath();
  ctx.stroke();
}

function dots(ctx: CanvasRenderingContext2D, lm: readonly Landmark[], idx: readonly number[], w: number, h: number, r: number) {
  ctx.beginPath();
  for (const i of idx) {
    const x = lm[i].x * w;
    const y = lm[i].y * h;
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fill();
}

export function drawOverlay(
  canvas: HTMLCanvasElement,
  lm: readonly Landmark[],
  info: FrameDrawInfo,
  headPose: HeadPoseEstimator,
  mesh: Connection[] | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const s = Math.max(1, w / 640);
  ctx.clearRect(0, 0, w, h);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (mesh) {
    ctx.strokeStyle = MESH;
    ctx.lineWidth = 0.6 * s;
    ctx.beginPath();
    for (const { start, end } of mesh) {
      ctx.moveTo(lm[start].x * w, lm[start].y * h);
      ctx.lineTo(lm[end].x * w, lm[end].y * h);
    }
    ctx.stroke();
  }

  const eye = info.eyesClosed ? ALERT : OK;
  ctx.strokeStyle = eye;
  ctx.fillStyle = eye;
  ctx.lineWidth = 1.6 * s;
  polyline(ctx, lm, Settings.LEFT_EYE_OUTLINE, w, h, true);
  polyline(ctx, lm, Settings.RIGHT_EYE_OUTLINE, w, h, true);
  dots(ctx, lm, Settings.LEFT_EYE_INDICES, w, h, 2.2 * s);
  dots(ctx, lm, Settings.RIGHT_EYE_INDICES, w, h, 2.2 * s);

  const mouth = info.mouth === "yawn" ? ALERT : info.mouth === "surprise" ? WARNING : MOUTH_OK;
  ctx.strokeStyle = mouth;
  ctx.fillStyle = mouth;
  ctx.lineWidth = 1.6 * s;
  polyline(ctx, lm, MOUTH_OUTLINE_INDICES, w, h, false);
  dots(ctx, lm, MOUTH_INDICES, w, h, 2.2 * s);

  const axes = headPose.axes();
  if (axes) {
    ctx.lineWidth = 2.5 * s;
    for (const key of ["x", "y", "z"] as const) {
      ctx.strokeStyle = AXIS[key];
      ctx.beginPath();
      ctx.moveTo(axes.origin[0], axes.origin[1]);
      ctx.lineTo(axes[key][0], axes[key][1]);
      ctx.stroke();
    }
  }
}
