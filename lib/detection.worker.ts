import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// Runs MediaPipe Face Landmarker off the main thread. The page sends one
// camera frame at a time (as a transferred ImageBitmap) and gets the 478
// landmarks back as a flat [x0, y0, x1, y1, ...] Float32Array.

type Incoming =
  | { type: "init"; delegate: "GPU" | "CPU"; wasmUrl: string; model: ArrayBuffer }
  | { type: "frame"; frame: ImageBitmap; timestamp: number };

const post = (message: unknown, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(message, transfer);

let landmarker: FaceLandmarker | null = null;
let lastTimestamp = 0;

async function init(delegate: "GPU" | "CPU", wasmUrl: string, model: ArrayBuffer) {
  try {
    const fileset = await FilesetResolver.forVisionTasks(wasmUrl);
    landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: new Uint8Array(model), delegate },
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
    const tesselation = FaceLandmarker.FACE_LANDMARKS_TESSELATION.map(({ start, end }) => [start, end]);
    post({ type: "ready", tesselation });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
}

function detect(frame: ImageBitmap, timestamp: number) {
  try {
    if (!landmarker) throw new Error("not ready");
    // VIDEO mode needs strictly increasing timestamps; frames can arrive a
    // fraction of a millisecond out of order when two are queued.
    lastTimestamp = Math.max(timestamp, lastTimestamp + 1);
    const start = performance.now();
    const face = landmarker.detectForVideo(frame, lastTimestamp).faceLandmarks[0];
    const ms = performance.now() - start;
    if (!face) return post({ type: "result", landmarks: null, ms });
    const landmarks = new Float32Array(face.length * 2);
    for (let i = 0; i < face.length; i++) {
      landmarks[i * 2] = face[i].x;
      landmarks[i * 2 + 1] = face[i].y;
    }
    post({ type: "result", landmarks, ms }, [landmarks.buffer]);
  } catch (err) {
    post({ type: "failed", message: err instanceof Error ? err.message : String(err) });
  } finally {
    frame.close();
  }
}

self.onmessage = (event: MessageEvent<Incoming>) => {
  const msg = event.data;
  if (msg.type === "init") void init(msg.delegate, msg.wasmUrl, msg.model);
  else detect(msg.frame, msg.timestamp);
};
