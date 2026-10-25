import { Settings } from "./settings";

// Audio + seat-vibration alerts, ported from alert_manager.py.
// The beep is an 880 Hz tone repeated every ALERT_REPEAT_INTERVAL frames while
// the driver is drowsy. The seat vibration is simulated: a low buzzing sound
// following VIBRATION_PATTERN (ms on / off), an on-screen intensity meter, and
// a real vibration on phones that support navigator.vibrate.
export class AlertManager {
  alertActive = false;
  vibrating = false;
  muted = false;

  private ctx: AudioContext | null = null;
  private lastAudioFrame = -999;
  private vibrationTimer: number | null = null;
  private buzzStop: (() => void) | null = null;

  // Must run inside a click handler: browsers block audio until a user gesture.
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) this.ctx = new Ctor();
    }
    void this.ctx?.resume();
  }

  trigger(frameCount: number, repeatEvery: number = Settings.ALERT_REPEAT_INTERVAL) {
    this.alertActive = true;
    if (frameCount - this.lastAudioFrame >= repeatEvery) {
      this.lastAudioFrame = frameCount;
      this.beep();
    }
    if (!this.vibrating) this.startVibration();
  }

  clear() {
    this.alertActive = false;
    this.stopVibration();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) this.stopBuzz();
  }

  reset() {
    this.clear();
    this.lastAudioFrame = -999;
  }

  dispose() {
    this.reset();
    void this.ctx?.close();
    this.ctx = null;
  }

  private audio(): AudioContext | null {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== "running") return null;
    return ctx;
  }

  private beep(freq = 880, duration = 0.6) {
    const ctx = this.audio();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 0.01);
    gain.gain.setValueAtTime(0.5, t + duration - 0.01);
    gain.gain.linearRampToValueAtTime(0, t + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration);
  }

  // Low rumble with 5 Hz amplitude modulation, like a seat motor.
  private buzz(ms: number) {
    const ctx = this.audio();
    if (!ctx) return;
    this.stopBuzz();
    const t = ctx.currentTime;
    const motor = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    const out = ctx.createGain();
    motor.type = "square";
    motor.frequency.value = 80;
    lfo.frequency.value = 5;
    depth.gain.value = 0.06;
    out.gain.value = 0.06;
    lfo.connect(depth).connect(out.gain);
    motor.connect(out).connect(ctx.destination);
    motor.start(t);
    lfo.start(t);
    motor.stop(t + ms / 1000);
    lfo.stop(t + ms / 1000);
    this.buzzStop = () => {
      try {
        motor.stop();
        lfo.stop();
      } catch {}
    };
  }

  private stopBuzz() {
    this.buzzStop?.();
    this.buzzStop = null;
  }

  private startVibration() {
    this.vibrating = true;
    let step = 0;
    const run = () => {
      if (!this.vibrating) return;
      const pattern = Settings.VIBRATION_PATTERN;
      const ms = pattern[step % pattern.length];
      if (step % 2 === 0) {
        this.buzz(ms);
        if (!this.muted) navigator.vibrate?.(ms);
      }
      step += 1;
      this.vibrationTimer = window.setTimeout(run, ms);
    };
    run();
  }

  private stopVibration() {
    this.vibrating = false;
    if (this.vibrationTimer !== null) window.clearTimeout(this.vibrationTimer);
    this.vibrationTimer = null;
    this.stopBuzz();
    navigator.vibrate?.(0);
  }
}
