import DemoCamera from "@/components/DemoCamera";
import HowItWorks from "@/components/HowItWorks";
import StartButton from "@/components/StartButton";
import { GITHUB_REPO_URL, LINKEDIN_URL } from "@/lib/site";

const BADGES = ["Computer Vision", "MediaPipe", "Next.js", "Final Year Project"];

const FACTS = [
  { value: "EAR < 0.21", label: "for 20 frames = eyes closed" },
  { value: "MAR ≥ 0.50", label: "for 30 frames = yawn" },
  { value: "Pitch > 25°", label: "for 25 frames = nodding" },
  { value: "0 bytes", label: "of video leave your device" },
];

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-24 px-4 sm:px-6 lg:px-8">
      <header className="pt-14 sm:pt-20">
        <div className="flex flex-wrap gap-2">
          {BADGES.map((badge) => (
            <span key={badge} className="rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-zinc-300 ring-1 ring-white/10">
              {badge}
            </span>
          ))}
        </div>
        <h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">
          Driver Drowsiness Detection
          <span className="block bg-gradient-to-r from-emerald-300 to-sky-300 bg-clip-text text-transparent">Live Demo</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-zinc-400">
          Real-time eye closure, yawn and head pose detection running fully in your browser, using the same logic and
          thresholds as the original Python + OpenCV system.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <StartButton />
          <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="btn-secondary">
            View GitHub Repo
          </a>
        </div>

        <dl className="mt-12 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {FACTS.map((f) => (
            <div key={f.value} className="rounded-2xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/5">
              <dt className="font-mono text-lg text-white">{f.value}</dt>
              <dd className="text-xs text-zinc-500">{f.label}</dd>
            </div>
          ))}
        </dl>
      </header>

      <DemoCamera />

      <HowItWorks />

      <footer className="flex flex-col gap-4 border-t border-white/5 py-10 text-sm text-zinc-400 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-medium text-zinc-200">Husnain Abbasi</p>
          <p className="mt-1 max-w-md">
            Original system built in Python + OpenCV as my Final Year Project (BS Artificial Intelligence).
          </p>
        </div>
        <div className="flex gap-5">
          <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white">
            GitHub
          </a>
          {LINKEDIN_URL.startsWith("http") && (
            <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white">
              LinkedIn
            </a>
          )}
        </div>
      </footer>
    </div>
  );
}
