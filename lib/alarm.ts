const BEEP_EVERY_MS = 450;
const BEEP_LENGTH_S = 0.25;
const BEEP_HZ = 880;

export class Alarm {
  private ctx: AudioContext | null = null;
  private timer: number | null = null;
  muted = false;

  // Must be called from a user gesture, otherwise browsers keep audio blocked.
  unlock(): void {
    if (!this.ctx) this.ctx = new AudioContext();
    void this.ctx.resume();
  }

  get playing(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer !== null) return;
    this.beep();
    this.timer = window.setInterval(() => this.beep(), BEEP_EVERY_MS);
  }

  stop(): void {
    if (this.timer === null) return;
    window.clearInterval(this.timer);
    this.timer = null;
  }

  dispose(): void {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
  }

  private beep(): void {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== "running") return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = BEEP_HZ;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + BEEP_LENGTH_S);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + BEEP_LENGTH_S + 0.01);
  }
}
