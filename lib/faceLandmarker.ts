import type { FaceLandmarker } from "@mediapipe/tasks-vision";

export interface Connection {
  start: number;
  end: number;
}

// Keep in sync with the exact version of @mediapipe/tasks-vision in package.json.
const MEDIAPIPE_VERSION = "1.1.1";
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export interface FaceConnections {
  tesselation: Connection[];
  leftEye: Connection[];
  rightEye: Connection[];
  lips: Connection[];
}

export interface FaceModel {
  landmarker: FaceLandmarker;
  connections: FaceConnections;
  delegate: "GPU" | "CPU";
}

let cached: Promise<FaceModel> | null = null;

async function load(): Promise<FaceModel> {
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);

  const create = (delegate: "GPU" | "CPU") =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFacialTransformationMatrixes: true,
    });

  const connections: FaceConnections = {
    tesselation: FaceLandmarker.FACE_LANDMARKS_TESSELATION,
    leftEye: FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
    rightEye: FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
    lips: FaceLandmarker.FACE_LANDMARKS_LIPS,
  };

  try {
    return { landmarker: await create("GPU"), connections, delegate: "GPU" };
  } catch {
    return { landmarker: await create("CPU"), connections, delegate: "CPU" };
  }
}

// Loaded once per page and reused across camera restarts.
export function createFaceLandmarker(): Promise<FaceModel> {
  if (!cached) {
    cached = load().catch((err) => {
      cached = null;
      throw err;
    });
  }
  return cached;
}
