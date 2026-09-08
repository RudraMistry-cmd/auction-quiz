/**
 * Manual timer — server-authoritative countdown.
 * Independent admin-controlled timer.
 * Ticks every second, broadcasts via dedicated callback ("manual_timer:update").
 * 
 * SINGLE SOURCE OF TRUTH: endAt (timestamp when timer expires)
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
    if (!this.isRunning || !this.endAt) return 0;
    return Math.max(0, Math.ceil((this.endAt - Date.now()) / 1000));
  }

  /** Bind the broadcast callback (called once from socket handler). */
  startBroadcasting(cb: (state: ManualTimerState) => void) {
    this.onTick = cb;
  }

  setDuration(seconds: number): ManualTimerState {
    this.duration = Math.max(0, Math.round(seconds));
    if (!this.isRunning) {
      this.endAt = null;
    }
    return this.getState();
  }

  start(seconds?: number): ManualTimerState {
    // If already running -> ignore
    if (this.isRunning) {
      return this.getState();
    }
    const dur = seconds && seconds > 0 ? Math.round(seconds) : this.duration;
    if (dur <= 0) {
      return this.getState();
    }
    this.duration = dur;
    this.endAt = Date.now() + this.duration * 1000;
    this.isRunning = true;
    console.log("Manual Timer Started");
    this.startTicking();
    return this.getState();
  }

  stop(): ManualTimerState {
    const wasRunning = this.isRunning;
    this.duration = 0;
    this.endAt = null;
    this.isRunning = false;
    this.stopTicking();
    if (wasRunning) {
      console.log("Manual Timer Stopped");
    }
    return this.getState();
  }

  pause(): ManualTimerState {
    if (!this.isRunning) return this.getState();
    this.duration = Math.max(0, Math.ceil(((this.endAt ?? 0) - Date.now()) / 1000));
    this.endAt = null;
    this.isRunning = false;
    this.stopTicking();
    console.log("Manual Timer Stopped");
    return this.getState();
  }

  reset(): ManualTimerState {
    const wasRunning = this.isRunning;
    this.duration = 0;
    this.endAt = null;
    this.isRunning = false;
    this.stopTicking();
    if (wasRunning) {
      console.log("Manual Timer Stopped");
    }
    return this.getState();
  }

  adjust(seconds: number): ManualTimerState {
    if (this.isRunning && this.endAt) {
      this.endAt += seconds * 1000;
      this.duration = Math.max(0, Math.ceil((this.endAt - Date.now()) / 1000));
    } else {
      this.duration = Math.max(0, this.duration + seconds);
    }
    return this.getState();
  }

  private startTicking() {
    this.stopTicking();
    this.tickInterval = setInterval(() => {
      const left = this.computeTimeLeft();
      if (left <= 0) {
        this.isRunning = false;
        this.endAt = null;
        this.duration = 0;
        this.stopTicking();
        console.log("Manual Timer Stopped");
        this.onTick?.(this.getState());
        return;
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
