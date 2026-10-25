"use client";

import { START_DEMO_EVENT } from "@/lib/site";
import { CameraIcon } from "./icons";

export default function StartButton() {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(START_DEMO_EVENT))} className="btn-primary">
      <CameraIcon className="h-4 w-4" />
      Start Camera
    </button>
  );
}
