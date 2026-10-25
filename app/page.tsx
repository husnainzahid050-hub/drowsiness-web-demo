import DemoCamera from "@/components/DemoCamera";
import HowItWorks from "@/components/HowItWorks";
import StartButton from "@/components/StartButton";
import { GITHUB_REPO_URL, LINKEDIN_URL } from "@/lib/site";

const BADGES = ["Computer Vision", "MediaPipe", "Next.js", "Final Year Project"];

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-20 px-4 sm:px-6">
      <header className="pt-16 sm:pt-24">
        <div className="flex flex-wrap gap-2">
          {BADGES.map((badge) => (
            <span
              key={badge}
              className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-300"
            >
              {badge}
            </span>
          ))}
        </div>
        <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">
          Driver Drowsiness Detection <span className="text-emerald-400">— Live Demo</span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-zinc-400">
          Real-time eye closure, yawn and head pose detection running fully in your browser.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <StartButton />
          <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="btn-secondary">
            View GitHub Repo
          </a>
        </div>
      </header>

      <DemoCamera />

      <HowItWorks />

      <footer className="flex flex-col gap-4 border-t border-zinc-800 py-10 text-sm text-zinc-400 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-medium text-zinc-200">Husnain Abbasi</p>
          <p className="mt-1 max-w-md">
            Original system built in Python + OpenCV as my Final Year Project (BS Artificial Intelligence).
          </p>
        </div>
        <div className="flex gap-5">
          <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-100">
            GitHub
          </a>
          <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-100">
            LinkedIn
          </a>
        </div>
      </footer>
    </div>
  );
}
