const PIPELINE = ["Webcam frame", "468 face landmarks", "EAR · MAR · head pose", "Frame counters", "Beep + seat vibration"];

const CARDS = [
  {
    tag: "Eye closure",
    title: "Eye Aspect Ratio (EAR)",
    body: "Six points per eye give its height and width. Open eyes sit around 0.25–0.35 and closed eyes near 0.1. The average of both eyes is smoothed over 5 frames. A blink lasts 2–4 frames, so the alarm only fires after 20 frames in a row below 0.21.",
  },
  {
    tag: "Yawning",
    title: "Mouth Aspect Ratio (MAR)",
    body: "The same formula on six mouth points (61, 82, 13, 291, 14, 87). Above 0.50 the mouth counts as wide open, and it only ends below 0.40 so it does not flicker. After 30 open frames the system decides between a yawn and surprise.",
  },
  {
    tag: "Yawn or surprise?",
    title: "Three-cue vote",
    body: "Opening speed (yawn slow, surprise sudden), head movement (yawn tilts back, surprise jerks forward) and the eyes (sleepy vs wide open, counted twice) each vote against your own baseline. Only a real yawn raises the alarm.",
  },
  {
    tag: "Nodding",
    title: "Head pose (solvePnP)",
    body: "Six landmarks (nose, chin, eye and mouth corners) are matched to a 3D face model, and the camera pose is solved by minimising reprojection error. Pitch above 25° (head dropping) or roll above 30° (tilting) for 25 frames is drowsy.",
  },
  {
    tag: "Glasses",
    title: "Automatic glasses mode",
    body: "Frames hide part of the eye, which keeps EAR low but steady. When 3 s of EAR stay inside 0.13–0.21 with very low variance and the head is upright, the threshold drops by 0.04 and 1.5× more closed frames are needed.",
  },
  {
    tag: "Alerts",
    title: "Beep + seat vibration",
    body: "Any trigger (eyes, head or yawn) starts an 880 Hz beep that repeats every 60 frames, plus a simulated seat motor following a 300/100/300/100/800 ms pattern. On phones the device really vibrates. Everything stops as soon as you recover.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-6">
      <p className="eyebrow">How it works</p>
      <h2 className="mt-1 text-3xl font-semibold tracking-tight text-white">Same logic as the Python system</h2>
      <p className="mt-2 max-w-2xl text-sm text-zinc-400">
        MediaPipe finds the face landmarks in every frame, in a background worker so the page stays smooth. Everything
        after that (ratios, counters, pose, glasses mode, alerts) is a direct port of the original OpenCV project, with
        the same thresholds. Frame counts are defined at 30 FPS and scaled to your device&apos;s real rate.
      </p>

      <ol className="mt-8 flex flex-wrap items-center gap-2">
        {PIPELINE.map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            <span className="rounded-xl bg-white/[0.03] px-3 py-2 text-sm text-zinc-200 ring-1 ring-white/10">
              <span className="mr-2 font-mono text-xs text-emerald-300">{i + 1}</span>
              {step}
            </span>
            {i < PIPELINE.length - 1 && <span className="text-zinc-600">→</span>}
          </li>
        ))}
      </ol>

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((card) => (
          <article key={card.title} className="card">
            <p className="eyebrow">{card.tag}</p>
            <h3 className="mt-2 text-lg font-semibold text-white">{card.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{card.body}</p>
          </article>
        ))}
      </div>

      <div className="card mt-4 grid items-center gap-8 md:grid-cols-2">
        <EyeDiagram />
        <div>
          <h3 className="text-lg font-semibold text-white">The EAR formula</h3>
          <p className="mt-3 rounded-xl bg-black/40 px-4 py-3 text-center font-mono text-sm text-zinc-100 ring-1 ring-white/5">
            EAR = (|p2 − p6| + |p3 − p5|) / (2 × |p1 − p4|)
          </p>
          <ul className="mt-4 space-y-2 text-sm text-zinc-400">
            <li>
              <span className="text-sky-300">p2–p6</span> and <span className="text-sky-300">p3–p5</span> measure how
              open the eye is.
            </li>
            <li>
              <span className="text-amber-300">p1–p4</span> is the eye width, which stays the same when you blink.
            </li>
            <li>MAR uses the same formula on the mouth: corners 61–291, lips 82–87 and 13–14.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function EyeDiagram() {
  const points = [
    { id: "p1", x: 40, y: 100, lx: 18, ly: 104 },
    { id: "p2", x: 120, y: 58, lx: 112, ly: 44 },
    { id: "p3", x: 200, y: 58, lx: 192, ly: 44 },
    { id: "p4", x: 280, y: 100, lx: 290, ly: 104 },
    { id: "p5", x: 200, y: 142, lx: 192, ly: 166 },
    { id: "p6", x: 120, y: 142, lx: 112, ly: 166 },
  ];
  return (
    <svg viewBox="0 0 320 200" className="w-full" role="img" aria-label="Six eye landmarks p1 to p6 used for EAR">
      <path d="M40 100 Q160 10 280 100 Q160 190 40 100 Z" fill="#18181b" stroke="#3f3f46" strokeWidth={2} />
      <circle cx="160" cy="100" r="30" fill="#27272a" />
      <circle cx="160" cy="100" r="13" fill="#09090b" />
      <line x1="40" y1="100" x2="280" y2="100" stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="5 4" />
      <line x1="120" y1="58" x2="120" y2="142" stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="5 4" />
      <line x1="200" y1="58" x2="200" y2="142" stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="5 4" />
      {points.map((p) => (
        <g key={p.id}>
          <circle cx={p.x} cy={p.y} r={5} fill="#34d399" />
          <text x={p.lx} y={p.ly} fill="#e4e4e7" fontSize={13} fontFamily="ui-monospace, monospace">
            {p.id}
          </text>
        </g>
      ))}
    </svg>
  );
}
