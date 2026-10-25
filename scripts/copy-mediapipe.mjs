import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const pkgDir = join("node_modules", "@mediapipe", "tasks-vision");
const { version } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const target = join("public", "mediapipe", version);
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

// The bundled detection worker is a classic worker: it loads the runtime with importScripts.
for (const file of [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
]) {
  copyFileSync(join(pkgDir, "wasm", file), join(target, file));
}
console.log(`MediaPipe ${version} runtime copied to ${target}`);
