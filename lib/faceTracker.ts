// Face landmark detection in Web Workers, so the page never freezes.
//
// Two workers start together: CPU (ready in about a second) and GPU. The GPU
// compiles its shaders on the first frame with a face, which can take several
// seconds; meanwhile the CPU worker is already detecting. Once the GPU is warm
// it takes over for a short trial, and whichever delegate is faster on this
// device is kept. The other worker is shut down.

// Served from this site (copied from node_modules by scripts/copy-mediapipe.mjs).
const MEDIAPIPE_VERSION = "1.1.1";
const WASM_PATH = `/mediapipe/${MEDIAPIPE_VERSION}`;
const MODEL_PATH = "/models/face_landmarker_float16_v1.task";
const MODEL_BYTES = 3_758_596;
const LOAD_TIMEOUT_MS = 90_000;
const GPU_TRIAL_FRAMES = 12;
const MAX_FAILURES = 5;
// Two frames may be queued at the worker, so it starts the next frame as soon
// as it finishes one instead of waiting for the page to send it.
const MAX_QUEUED_FRAMES = 2;

export type Delegate = "GPU" | "CPU";

export interface Connection {
  start: number;
  end: number;
}

export interface TrackerStatus {
  state: "idle" | "loading" | "ready" | "error";
  progress: number;
  delegate: Delegate | null;
  gpuWarming: boolean;
}

export interface Detection {
  landmarks: Float32Array | null;
  ms: number;
  delegate: Delegate;
}

interface WorkerResult {
  landmarks: Float32Array | null;
  ms: number;
}

class LandmarkWorker {
  readonly ready: Promise<void>;
  isReady = false;
  failed = false;
  warmed: boolean;
  tesselation: Connection[] = [];

  private worker: Worker;
  private pending: ((r: WorkerResult | null) => void)[] = [];
  private samples: number[] = [];
  private failures = 0;

  constructor(
    readonly delegate: Delegate,
    wasmUrl: string,
    model: ArrayBuffer,
  ) {
    this.warmed = delegate === "CPU";
    this.worker = new Worker(new URL("./detection.worker.ts", import.meta.url), {
      type: "module",
      name: `landmarks-${delegate.toLowerCase()}`,
    });
    this.ready = new Promise((resolve, reject) => {
      this.worker.onmessage = (event) => {
        const msg = event.data;
        if (msg.type === "ready") {
          this.isReady = true;
          this.tesselation = (msg.tesselation as [number, number][]).map(([start, end]) => ({ start, end }));
          resolve();
        } else if (msg.type === "error") {
          console.warn(`[face tracker] ${delegate} worker failed to start: ${msg.message}`);
          this.terminate();
          reject(new Error(msg.message));
        } else {
          this.failures = msg.type === "failed" ? this.failures + 1 : 0;
          if (this.failures >= MAX_FAILURES) this.terminate();
          this.settle(msg.type === "result" ? { landmarks: msg.landmarks, ms: msg.ms } : null);
        }
      };
      this.worker.onerror = (event) => {
        event.preventDefault();
        this.terminate();
        reject(new Error(event.message || "worker error"));
      };
    });
    this.ready.catch(() => undefined);
    this.worker.postMessage({ type: "init", delegate, wasmUrl, model }, [model]);
  }

  get usable() {
    return this.isReady && !this.failed;
  }

  get inFlight() {
    return this.pending.length;
  }

  detect(frame: ImageBitmap, timestamp: number): Promise<WorkerResult | null> {
    if (!this.usable) {
      frame.close();
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      this.pending.push(resolve);
      this.worker.postMessage({ type: "frame", frame, timestamp }, [frame]);
    });
  }

  record(ms: number) {
    this.samples.push(ms);
    if (this.samples.length > 15) this.samples.shift();
  }

  averageMs() {
    return this.samples.length ? this.samples.reduce((a, b) => a + b, 0) / this.samples.length : 0;
  }

  terminate() {
    this.failed = true;
    this.worker.terminate();
    const pending = this.pending;
    this.pending = [];
    pending.forEach((resolve) => resolve(null));
  }

  private settle(result: WorkerResult | null) {
    this.pending.shift()?.(result);
  }
}

async function fetchModel(onProgress: (fraction: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(MODEL_PATH);
  if (!res.ok || !res.body) throw new Error(`Model download failed (${res.status})`);
  const total = Number(res.headers.get("content-length")) || MODEL_BYTES;
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
  return out.buffer;
}

// A software WebGL renderer is slower than the CPU (XNNPACK) path.
function hasHardwareWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return false;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return !/swiftshader|llvmpipe|software|basic render/i.test(renderer);
  } catch {
    return false;
  }
}

function timeout(ms: number) {
  return new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("timed out")), ms));
}

export class FaceTracker {
  status: TrackerStatus = { state: "idle", progress: 0, delegate: null, gpuWarming: false };

  private cpu: LandmarkWorker | null = null;
  private gpu: LandmarkWorker | null = null;
  private gpuTrial = 0;
  private queued = 0;
  private warming = false;
  private loading: Promise<void> | null = null;
  private disposed = false;

  constructor(private readonly onStatus: (status: TrackerStatus) => void) {}

  get tesselation(): Connection[] {
    return (this.gpu?.usable ? this.gpu : this.cpu)?.tesselation ?? [];
  }

  // Safe to call many times; starts downloading and compiling only once.
  load(): Promise<void> {
    if (this.loading) return this.loading;
    this.update({ state: "loading" });
    this.loading = (async () => {
      const model = await fetchModel((progress) => this.update({ progress }));
      if (this.disposed) return;
      const wasmUrl = new URL(WASM_PATH, window.location.href).href;
      this.cpu = new LandmarkWorker("CPU", wasmUrl, model.slice(0));
      if (hasHardwareWebGL()) this.gpu = new LandmarkWorker("GPU", wasmUrl, model);

      const workers = [this.cpu, this.gpu].filter((w): w is LandmarkWorker => w !== null);
      workers.forEach((w) => w.ready.then(() => this.refresh(), () => this.refresh()));
      await Promise.race([Promise.any(workers.map((w) => w.ready)), timeout(LOAD_TIMEOUT_MS)]);
      this.refresh();
    })().catch((err) => {
      this.loading = null;
      this.cpu?.terminate();
      this.gpu?.terminate();
      this.cpu = this.gpu = null;
      this.update({ state: "error" });
      throw err;
    });
    return this.loading;
  }

  get canDetect() {
    return this.primary() !== null && this.queued < MAX_QUEUED_FRAMES;
  }

  async detect(video: HTMLVideoElement, timestamp: number): Promise<Detection | null> {
    const worker = this.primary();
    if (!worker || this.queued >= MAX_QUEUED_FRAMES) return null;

    const gpu = this.gpu;
    if (gpu && gpu !== worker && gpu.usable && !gpu.warmed && !this.warming) {
      void this.warmGpu(gpu, video, timestamp);
    }

    this.queued += 1;
    let result: WorkerResult | null;
    try {
      const frame = await createImageBitmap(video);
      result = await worker.detect(frame, timestamp);
    } finally {
      this.queued -= 1;
    }
    if (!result) {
      this.refresh();
      return null;
    }
    if (worker === this.gpu && !worker.warmed) {
      // Only happens when the CPU worker failed: this frame compiled the shaders.
      if (result.landmarks) worker.warmed = true;
      this.refresh();
    } else {
      worker.record(result.ms);
      if (worker === this.gpu && this.cpu) this.judgeGpu();
    }
    return { landmarks: result.landmarks, ms: result.ms, delegate: worker.delegate };
  }

  dispose() {
    this.disposed = true;
    this.cpu?.terminate();
    this.gpu?.terminate();
    this.cpu = this.gpu = null;
  }

  private primary(): LandmarkWorker | null {
    const gpu = this.gpu?.usable ? this.gpu : null;
    const cpu = this.cpu?.usable ? this.cpu : null;
    if (gpu?.warmed) return gpu;
    return cpu ?? gpu;
  }

  // Real camera frames go to the GPU worker in the background until its
  // shaders are compiled (first frame that contains a face).
  private async warmGpu(gpu: LandmarkWorker, video: HTMLVideoElement, timestamp: number) {
    this.warming = true;
    try {
      const frame = await createImageBitmap(video);
      const result = await gpu.detect(frame, timestamp);
      if (result?.landmarks) {
        gpu.warmed = true;
        this.gpuTrial = 0;
      }
    } catch {
      // ignore: the next frame tries again
    } finally {
      this.warming = false;
    }
    this.refresh();
  }

  private judgeGpu() {
    const gpu = this.gpu;
    const cpu = this.cpu;
    if (!gpu || !cpu) return;
    this.gpuTrial += 1;
    if (this.gpuTrial < GPU_TRIAL_FRAMES) return;
    const cpuMs = cpu.averageMs();
    if (cpuMs > 0 && gpu.averageMs() > cpuMs * 1.15) {
      gpu.terminate();
      this.gpu = null;
    } else {
      cpu.terminate();
      this.cpu = null;
    }
    this.refresh();
  }

  private refresh() {
    if (this.cpu?.failed) this.cpu = null;
    if (this.gpu?.failed) this.gpu = null;
    const primary = this.primary();
    const gpuWarming = !!this.gpu && this.gpu.usable && !this.gpu.warmed;
    if (primary) this.update({ state: "ready", delegate: primary.delegate, gpuWarming });
    else if (!this.cpu && !this.gpu) this.update({ state: "error", delegate: null, gpuWarming: false });
  }

  private update(patch: Partial<TrackerStatus>) {
    const next = { ...this.status, ...patch };
    if (
      next.state === this.status.state &&
      next.delegate === this.status.delegate &&
      next.gpuWarming === this.status.gpuWarming &&
      Math.round(next.progress * 100) === Math.round(this.status.progress * 100)
    ) {
      return;
    }
    this.status = next;
    if (!this.disposed) this.onStatus(next);
  }
}
