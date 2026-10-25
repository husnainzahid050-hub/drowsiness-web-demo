const CARDS = [
  {
    title: "Eye Aspect Ratio (EAR)",
    tag: "Eye closure",
    body: "Six points around each eye give its height and width. Open eyes score around 0.3. When the lids close the height collapses and EAR drops below the threshold. If it stays there for enough frames in a row, the driver is drowsy.",
  },
  {
    title: "Mouth Aspect Ratio (MAR)",
    tag: "Yawning",
    body: "Three vertical distances between the inner lips are averaged and divided by the mouth width. Talking barely moves it, but a yawn opens the mouth wide and holds it, pushing MAR over the threshold for many frames.",
  },
  {
    title: "Head pose",
    tag: "Attention",
    body: "MediaPipe estimates a 3D transformation matrix for the face. Its rotation part is converted into yaw (left/right), pitch (up/down) and roll (tilt). Large yaw or pitch means the driver is not looking at the road.",
  },
];

const PIPELINE = ["Webcam", "Face Landmarks", "EAR / MAR / Pose", "Threshold Logic", "Alert"];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-6">
      <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">How it works</h2>
      <p className="mt-1 max-w-2xl text-sm text-zinc-400">
        MediaPipe Face Landmarker finds 478 points on your face in every frame. Three simple geometric measures
        turn those points into a driver state.
      </p>

      <ol className="mt-8 flex flex-wrap items-center gap-2">
        {PIPELINE.map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            <span className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200">
              <span className="mr-2 font-mono text-xs text-emerald-400">{i + 1}</span>
              {step}
            </span>
            {i < PIPELINE.length - 1 && <span className="text-zinc-600">→</span>}
          </li>
        ))}
      </ol>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {CARDS.map((card) => (
          <article key={card.title} className="card">
            <p className="text-xs font-medium uppercase tracking-wider text-emerald-400">{card.tag}</p>
            <h3 className="mt-2 text-lg font-semibold text-zinc-100">{card.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{card.body}</p>
          </article>
        ))}
      </div>

      <div className="card mt-4 grid items-center gap-6 md:grid-cols-2">
        <EyeDiagram />
        <div>
          <h3 className="text-lg font-semibold text-zinc-100">The EAR formula</h3>
          <p className="mt-3 rounded-lg bg-zinc-950 px-4 py-3 text-center font-mono text-sm text-zinc-100">
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
            <li>The value for both eyes is averaged and smoothed over the last few frames to remove jitter.</li>
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
