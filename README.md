# Driver Drowsiness Detection — Live Web Demo

A browser version of my Final Year Project (BS Artificial Intelligence). It detects eye closure, yawning and head pose in real time from your webcam, and the whole thing runs on your own device.

- **Live demo:** https://drowsiness-web-demo.vercel.app
- **Original Python + OpenCV project:** ORIGINAL_REPO_URL

This repo is a visual showcase that portfolio visitors can try in one click. The full system is still the original Python project.

## Features

- Live webcam feed (mirrored) with eye and mouth landmarks drawn on top, green when normal and red when closed or yawning
- Optional full 478-point face mesh overlay
- Driver status: **Awake**, **Drowsy**, **Yawning**, **Looking Away**, **No Face Detected**
- Drowsiness alarm: pulsing red screen border and a beep made with the Web Audio API. It stops as soon as the eyes reopen, and there is a mute toggle.
- Live EAR and MAR values with bars, yaw / pitch / roll in degrees, closed-eye frame counter and FPS
- Graph of EAR over the last 10 seconds with a dashed threshold line
- Sliders for the EAR threshold, MAR threshold, consecutive frames and head angle limit
- Handles a blocked camera, a missing webcam, model loading, no face in frame and hidden tabs, and releases the camera when you stop

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript
- Tailwind CSS
- [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) (`@mediapipe/tasks-vision`), running client-side with WebGL (GPU) and a CPU fallback
- Canvas 2D for the overlay and the live graph
- Web Audio API for the alarm, so there are no audio files

There is no backend, no API routes, no database and no environment variables.

## How it works

```
Webcam → Face Landmarks → EAR / MAR / Pose → Threshold Logic → Alert
```

### Eye Aspect Ratio (EAR)

Six landmarks around each eye (p1 to p6):

```
EAR = (|p2 − p6| + |p3 − p5|) / (2 × |p1 − p4|)
```

| Eye   | p1  | p2  | p3  | p4  | p5  | p6  |
| ----- | --- | --- | --- | --- | --- | --- |
| Left  | 33  | 160 | 158 | 133 | 153 | 144 |
| Right | 362 | 385 | 387 | 263 | 373 | 380 |

The two eyes are averaged. An open eye scores around 0.3. When the lids close the vertical distances collapse while the width stays the same, so EAR falls. The driver is **drowsy** when the smoothed EAR stays below **0.25** for **20 consecutive frames**.

### Mouth Aspect Ratio (MAR)

```
MAR = mean(|13−14|, |81−178|, |311−402|) / |78−308|
```

A yawn opens the mouth wide and holds it. MAR above **0.6** for **15 consecutive frames** counts as **yawning**.

### Head pose

The Face Landmarker returns a 4×4 facial transformation matrix. Its rotation part is decomposed into yaw, pitch and roll in degrees. If |yaw| or |pitch| goes above **25°**, the driver is **looking away**.

### Smoothing and frames

EAR, MAR and the angles are smoothed with a 5-frame moving average. Detection only runs when the camera delivers a new frame, so the frame counters follow the camera rate (usually 30 FPS) rather than the screen refresh rate. When no face is visible, the counters pause and the alarm stops.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000 and click **Start Camera**. Browsers only allow webcam access on `localhost` or over HTTPS.

```bash
npm run build   # production build
npm start       # serve the production build
```

## Deploy

Import the repository on [Vercel](https://vercel.com/new) and keep the defaults. No configuration is needed.

## Privacy

Everything runs in your browser. No video or images are uploaded or stored. The page downloads only the MediaPipe runtime (from jsDelivr) and the face landmark model (from Google's model storage). Your camera frames never leave your device.

## Author

**Husnain Abbasi**: GITHUB_REPO_URL · LINKEDIN_URL
