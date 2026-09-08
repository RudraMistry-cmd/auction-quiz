/**
 * Manual timer — server-authoritative countdown.
 * Ticks every second, broadcasts via callback (socket handler wires io.emit).
 * 
 * SINGLE SOURCE OF TRUTH: endAt (timestamp when timer expires)
 * - duration: the original duration set by user (used for resume after pause)
 * - endAt: the actual expiry timestamp (used for all time calculations)
 */

export interface ManualTimerState {
  duration: number;
  endAt: number | null;
  isRunning: boolean;
  timeLeft: number;
}

class ManualTimerService {
  private duration: number = 0;
  private endAt: number | null = null;
  private isRunning: boolean = false;
  private tickInterval: NodeJS.Timeout | null = null;
  private onTick: ((state: ManualTimerState) => void) | null = null;

  getState(): ManualTimerState {
    return {
      duration: this.duration,
      endAt: this.endAt,
      isRunning: this.isRunning,
      timeLeft: this.computeTimeLeft(),
    };
  }

  private computeTimeLeft(): number {
    if (!this.isRunning || !this.endAt) return Math.max(0, this.duration);
    return Math.max(0, Math.ceil((this.endAt - Date.now()) / 1000));
  }

  /** Bind the broadcast callback (called once from socket handler). */
  startBroadcasting(cb: (state: ManualTimerState) => void) {
    this.onTick = cb;
  }

  setDuration(seconds: number): ManualTimerState {
    this.duration = Math.max(0, Math.round(seconds));
    if (!this.isRunning) this.endAt = null;
    return this.getState();
  }

  start(): ManualTimerState {
    if (this.isRunning) return this.getState();
    if (this.duration <= 0) return this.getState();
    this.endAt = Date.now() + this.duration * 1000;
    this.isRunning = true;
    this.startTicking();
    return this.getState();
  }

  pause(): ManualTimerState {
    if (!this.isRunning) return this.getState();
    // Save the current time left as duration for resume
    this.duration = this.computeTimeLeft();
    this.endAt = null;
    this.isRunning = false;
    this.stopTicking();
    return this.getState();
  }

  reset(): ManualTimerState {
    this.duration = 0;
    this.endAt = null;
    this.isRunning = false;
    this.stopTicking();
    return this.getState();
  }

  adjust(seconds: number): ManualTimerState {
    if (this.isRunning && this.endAt) {
      // SINGLE SOURCE OF TRUTH: modify endAt directly
      this.endAt += seconds * 1000;
      // Update duration to reflect new time left (for display purposes)
      this.duration = Math.max(0, Math.ceil((this.endAt - Date.now()) / 1000));
    } else {
      // Timer is paused or not started: modify duration directly
      this.duration = Math.max(0, this.duration + seconds);
    }
    return this.getState();
  }

  private startTicking() {
    this.stopTicking();
    this.tickInterval = setInterval(() => {
      const state = this.getState();
      if (state.timeLeft <= 0) {
        this.isRunning = false;
        this.endAt = null;
        this.duration = 0;
        this.stopTicking();
      }
      this.onTick?.(this.getState());
    }, 1000);
  }

  private stopTicking() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }
}

export const manualTimerService = new ManualTimerService();
