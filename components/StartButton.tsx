"use client";

import { START_DEMO_EVENT } from "@/lib/site";

export default function StartButton() {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(START_DEMO_EVENT))} className="btn-primary">
      Start Camera
    </button>
  );
}
