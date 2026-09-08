import type { TimestampTimer } from "../types";

export class TimerEngineService {
  private biddingTimer: TimestampTimer | null = null;
  private mainTaskTimer: TimestampTimer | null = null;
  private explicitTimer: TimestampTimer | null = null;

  private onBiddingExpireCb: (() => void) | null = null;
  private onMainTaskExpireCb: (() => void) | null = null;
  private onExplicitExpireCb: (() => void) | null = null;
  private onTickCb: ((timers: {
    biddingTimer: TimestampTimer | null;
    mainTaskTimer: TimestampTimer | null;
    explicitTimer: TimestampTimer | null;
    sideTaskTimer?: TimestampTimer | null;
  }) => void) | null = null;

  private interval: NodeJS.Timeout | null = null;

  constructor() {
    this.startHeartbeat();
  }

  private calcRemaining(timer: TimestampTimer | null): number {
    if (!timer) return 0;
    if (!timer.isRunning) return Math.max(0, timer.remaining);
    const elapsedSec = (Date.now() - timer.startTime) / 1000;
    return Math.max(0, Math.ceil(timer.duration - elapsedSec));
  }

  private snapshot(timer: TimestampTimer | null): TimestampTimer | null {
    if (!timer) return null;
    return {
      startTime: timer.startTime,
      duration: timer.duration,
      remaining: this.calcRemaining(timer),
      isRunning: timer.isRunning,
      label: timer.label,
    };
  }

  public getTimers() {
    const exp = this.snapshot(this.explicitTimer);
    return {
      biddingTimer: this.snapshot(this.biddingTimer),
      mainTaskTimer: this.snapshot(this.mainTaskTimer),
      explicitTimer: exp,
      sideTaskTimer: exp, // alias
    };
  }

  public setTickCallback(cb: (timers: {
    biddingTimer: TimestampTimer | null;
    mainTaskTimer: TimestampTimer | null;
    explicitTimer: TimestampTimer | null;
    sideTaskTimer?: TimestampTimer | null;
  }) => void) {
    this.onTickCb = cb;
  }

  // --- Bidding Timer (singleton: cancels previous bidding timer) ---
  public startBidding(duration: number = 60, onExpire?: () => void): TimestampTimer {
    this.stopBidding();
    this.onBiddingExpireCb = onExpire || null;
    this.biddingTimer = {
      startTime: Date.now(),
      duration,
      remaining: duration,
      isRunning: true,
      label: "Bidding",
    };
    return this.snapshot(this.biddingTimer)!;
  }

  public stopBidding(): void {
    this.biddingTimer = null;
    this.onBiddingExpireCb = null;
  }

  // --- Main Task Timer (singleton: cancels previous main task timer) ---
  public startMainTask(duration: number, onExpire?: () => void): TimestampTimer {
    this.stopMainTask();
    this.onMainTaskExpireCb = onExpire || null;
    this.mainTaskTimer = {
      startTime: Date.now(),
      duration,
      remaining: duration,
      isRunning: true,
      label: "Main Task",
    };
    return this.snapshot(this.mainTaskTimer)!;
  }

  public stopMainTask(): void {
    this.mainTaskTimer = null;
    this.onMainTaskExpireCb = null;
  }

  // --- Explicit Timer (Admin-controlled, optional "Open Challenge" / "Side Task") ---
  public startExplicitTimer(duration: number = 60, onExpire?: () => void): TimestampTimer {
    // If paused and has remaining time, resume from remaining time unless a new duration was passed
    if (this.explicitTimer && !this.explicitTimer.isRunning && this.explicitTimer.remaining > 0 && duration === 60) {
      const remaining = this.explicitTimer.remaining;
      this.explicitTimer = {
        startTime: Date.now(),
        duration: remaining,
        remaining,
        isRunning: true,
        label: "Open Challenge",
      };
    } else {
      this.explicitTimer = {
        startTime: Date.now(),
        duration,
        remaining: duration,
        isRunning: true,
        label: "Open Challenge",
      };
    }
    if (onExpire) this.onExplicitExpireCb = onExpire;
    return this.snapshot(this.explicitTimer)!;
  }

  public pauseExplicitTimer(): TimestampTimer | null {
    if (!this.explicitTimer) return null;
    const remaining = this.calcRemaining(this.explicitTimer);
    this.explicitTimer = {
      startTime: Date.now(),
      duration: remaining,
      remaining,
      isRunning: false,
      label: "Open Challenge",
    };
    return this.snapshot(this.explicitTimer);
  }

  public adjustExplicitTimer(seconds: number): TimestampTimer | null {
    if (!this.explicitTimer) {
      return this.startExplicitTimer(Math.max(0, seconds));
    }
    const currentRemaining = this.calcRemaining(this.explicitTimer);
    const newRemaining = Math.max(0, currentRemaining + seconds);
    this.explicitTimer = {
      startTime: Date.now(),
      duration: newRemaining,
      remaining: newRemaining,
      isRunning: this.explicitTimer.isRunning,
      label: "Open Challenge",
    };
    return this.snapshot(this.explicitTimer);
  }

  public stopExplicitTimer(): void {
    this.explicitTimer = null;
    this.onExplicitExpireCb = null;
  }

  // --- Aliases for side timer (backwards compatibility) ---
  public startSideTimer(duration: number = 60, onExpire?: () => void): TimestampTimer {
    return this.startExplicitTimer(duration, onExpire);
  }
  public pauseSideTimer(): TimestampTimer | null {
    return this.pauseExplicitTimer();
  }
  public adjustSideTimer(seconds: number): TimestampTimer | null {
    return this.adjustExplicitTimer(seconds);
  }
  public stopSideTimer(): void {
    this.stopExplicitTimer();
  }

  public resetAll(): void {
    this.stopBidding();
    this.stopMainTask();
    this.stopExplicitTimer();
  }

  private startHeartbeat(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => {
      if (this.biddingTimer && this.biddingTimer.isRunning) {
        const rem = this.calcRemaining(this.biddingTimer);
        this.biddingTimer.remaining = rem;
        if (rem <= 0) {
          this.biddingTimer.isRunning = false;
          const cb = this.onBiddingExpireCb;
          this.stopBidding();
          cb?.();
        }
      }

      if (this.mainTaskTimer && this.mainTaskTimer.isRunning) {
        const rem = this.calcRemaining(this.mainTaskTimer);
        this.mainTaskTimer.remaining = rem;
        if (rem <= 0) {
          this.mainTaskTimer.isRunning = false;
          const cb = this.onMainTaskExpireCb;
          cb?.();
        }
      }

      if (this.explicitTimer && this.explicitTimer.isRunning) {
        const rem = this.calcRemaining(this.explicitTimer);
        this.explicitTimer.remaining = rem;
        if (rem <= 0) {
          this.explicitTimer.isRunning = false;
          const cb = this.onExplicitExpireCb;
          cb?.();
        }
      }

      // Always broadcast snapshot
      if (this.onTickCb) {
        this.onTickCb(this.getTimers());
      }
    }, 1000);
  }
}

export const timerEngineService = new TimerEngineService();
