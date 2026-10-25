// Same values as config/settings.py in the original Python project.
export const Settings = {
  EAR_THRESHOLD: 0.21,
  CONSEC_FRAMES: 20,
  EAR_SMOOTHING_WINDOW: 5,

  TARGET_FPS: 30,
  FRAME_WIDTH: 640,
  FRAME_HEIGHT: 480,

  LEFT_EYE_INDICES: [362, 385, 387, 263, 373, 380],
  RIGHT_EYE_INDICES: [33, 160, 158, 133, 153, 144],
  LEFT_EYE_OUTLINE: [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398],
  RIGHT_EYE_OUTLINE: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],

  ALERT_REPEAT_INTERVAL: 60,
  VIBRATION_PATTERN: [300, 100, 300, 100, 800],
  VIBRATION_INTENSITY: 8,

  MAR_THRESHOLD: 0.5,
  MAR_EXIT_THRESHOLD: 0.4,
  YAWN_CONSEC_FRAMES: 30,
  YAWN_GAP_FRAMES: 6,
  MAR_OPEN_START: 0.3,
  YAWN_SUDDEN_ONSET_FRAMES: 4,
  YAWN_HEAD_TILT_DEG: 5,
  SURPRISE_HEAD_FORWARD_DEG: 4,
  YAWN_EYE_CHANGE_RATIO: 0.1,

  HEAD_PITCH_THRESHOLD: 25,
  HEAD_ROLL_THRESHOLD: 30,
  HEAD_POSE_CONSEC_FRAMES: 25,
  PITCH_SMOOTHING_WINDOW: 8,

  GLASSES_EAR_LOW: 0.13,
  GLASSES_EAR_HIGH: 0.21,
  GLASSES_EAR_VARIANCE_THRESHOLD: 0.0008,
  GLASSES_HISTORY_FRAMES: 90,
  GLASSES_CONFIRM_FRAMES: 3,
  GLASSES_RECHECK_INTERVAL: 150,
  GLASSES_EAR_THRESHOLD_REDUCTION: 0.04,
  GLASSES_CONSEC_MULTIPLIER: 1.5,
} as const;

// The values a visitor can change with the sliders.
export interface Tuning {
  earThreshold: number;
  consecFrames: number;
  marThreshold: number;
  yawnFrames: number;
  pitchThreshold: number;
  rollThreshold: number;
}

export const DEFAULT_TUNING: Tuning = {
  earThreshold: Settings.EAR_THRESHOLD,
  consecFrames: Settings.CONSEC_FRAMES,
  marThreshold: Settings.MAR_THRESHOLD,
  yawnFrames: Settings.YAWN_CONSEC_FRAMES,
  pitchThreshold: Settings.HEAD_PITCH_THRESHOLD,
  rollThreshold: Settings.HEAD_ROLL_THRESHOLD,
};

// The yawn exit threshold keeps the same 0.10 gap below the entry threshold.
export const marExitThreshold = (t: Tuning) =>
  t.marThreshold - (Settings.MAR_THRESHOLD - Settings.MAR_EXIT_THRESHOLD);
