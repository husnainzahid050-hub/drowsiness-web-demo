import type { FaceLandmarker } from "@mediapipe/tasks-vision";

// Served from this site (copied from node_modules by scripts/copy-mediapipe.mjs),
// so nothing depends on a third-party CDN being fast or reachable.
const MEDIAPIPE_VERSION = "1.1.1";
const WASM_PATH = `/mediapipe/${MEDIAPIPE_VERSION}`;
const MODEL_PATH = "/models/face_landmarker_float16_v1.task";

const GPU_INIT_TIMEOUT_MS = 20_000;
const LOAD_TIMEOUT_MS = 120_000;

export interface Connection {
  start: number;
  end: number;
}

export type Delegate = "GPU" | "CPU";

export interface FaceModel {
  landmarker: FaceLandmarker;
  tesselation: Connection[];
  delegate: Delegate;
  // The GPU path compiles its shaders on the first frame that contains a face,
  // which can block the page for a few seconds. Set once that has happened.
  warmed: boolean;
}

type Progress = (fraction: number) => void;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function fetchModel(onProgress: Progress): Promise<Uint8Array> {
  const res = await fetch(MODEL_PATH);
  if (!res.ok || !res.body) throw new Error(`Model download failed (${res.status})`);
  const total = Number(res.headers.get("content-length")) || 3_758_596;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(Math.min(received / total, 1));
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

const listeners = new Set<Progress>();
let lastProgress = 0;
const cache = new Map<Delegate, Promise<FaceModel>>();

async function load(preferred: Delegate): Promise<FaceModel> {
  const [{ FaceLandmarker, FilesetResolver }, model] = await Promise.all([
    import("@mediapipe/tasks-vision"),
    fetchModel((p) => {
      lastProgress = p;
      listeners.forEach((l) => l(p));
    }),
  ]);
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);

  const create = (delegate: Delegate) =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: model, delegate },
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputFacialTransformationMatrixes: false,
      outputFaceBlendshapes: false,
    });

  const tesselation = FaceLandmarker.FACE_LANDMARKS_TESSELATION;
  const cpu = async (): Promise<FaceModel> => ({ landmarker: await create("CPU"), tesselation, delegate: "CPU", warmed: true });

  // A software WebGL renderer is slower than the CPU (XNNPACK) path.
  if (preferred === "CPU" || softwareWebGL()) return cpu();
  try {
    const landmarker = await withTimeout(create("GPU"), GPU_INIT_TIMEOUT_MS, "GPU init");
    return { landmarker, tesselation, delegate: "GPU", warmed: false };
  } catch {
    return cpu();
  }
}

function softwareWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return true;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return /swiftshader|llvmpipe|software|basic render/i.test(renderer);
  } catch {
    return true;
  }
}

// Loaded once per page and shared by every camera start. Safe to call early
// (e.g. when the demo scrolls into view) to have the model ready on click.
export function loadFaceModel(delegate: Delegate = "GPU", onProgress?: Progress): Promise<FaceModel> {
  if (onProgress) {
    listeners.add(onProgress);
    onProgress(lastProgress);
  }
  let promise = cache.get(delegate);
  if (!promise) {
    promise = withTimeout(load(delegate), LOAD_TIMEOUT_MS, "Model load").catch((err) => {
      cache.delete(delegate);
      lastProgress = 0;
      throw err;
    });
    cache.set(delegate, promise);
  }
  return onProgress ? promise.finally(() => listeners.delete(onProgress)) : promise;
}
