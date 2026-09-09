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
    auctionTimer?: TimestampTimer | null;
    taskTimer?: TimestampTimer | null;
    extraTimer?: TimestampTimer | null;
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
    const auc = this.snapshot(this.biddingTimer);
    const task = this.snapshot(this.mainTaskTimer);
    const exp = this.snapshot(this.explicitTimer);
    return {
      biddingTimer: auc,
      mainTaskTimer: task,
      explicitTimer: exp,
      sideTaskTimer: exp, // alias
      auctionTimer: auc,
      taskTimer: task,
      extraTimer: exp,
    };
  }

  public setTickCallback(cb: (timers: {
    biddingTimer: TimestampTimer | null;
    mainTaskTimer: TimestampTimer | null;
    explicitTimer: TimestampTimer | null;
    sideTaskTimer?: TimestampTimer | null;
    auctionTimer?: TimestampTimer | null;
    taskTimer?: TimestampTimer | null;
    extraTimer?: TimestampTimer | null;
  }) => void) {
    this.onTickCb = cb;
  }

  // ─── Auction Timer (Auto, 60s, stops on win or expiry) ───
  public startBidding(duration: number = 60, onExpire?: () => void): TimestampTimer {
    this.stopBidding();
    this.onBiddingExpireCb = onExpire || null;
    this.biddingTimer = {
      startTime: Date.now(),
      duration,
      remaining: duration,
      isRunning: true,
      label: "Auction",
    };
    return this.snapshot(this.biddingTimer)!;
  }

  public stopBidding(): void {
    this.biddingTimer = null;
    this.onBiddingExpireCb = null;
  }

  // ─── Task Timer (Manual, only allowed if winner exists, NEVER auto-start) ───
  public startMainTask(duration: number, onExpire?: () => void): TimestampTimer {
    this.stopExtraTimer(); // Timer safety: stop extra timer before starting task timer
    if (this.mainTaskTimer && !this.mainTaskTimer.isRunning && this.mainTaskTimer.remaining > 0 && duration <= 0) {
      const remaining = this.mainTaskTimer.remaining;
      this.mainTaskTimer = {
        startTime: Date.now(),
        duration: remaining,
        remaining,
        isRunning: true,
        label: "Task Time Remaining",
      };
    } else {
      this.mainTaskTimer = {
        startTime: Date.now(),
        duration,
        remaining: duration,
        isRunning: true,
        label: "Task Time Remaining",
      };
    }
    if (onExpire) this.onMainTaskExpireCb = onExpire;
    return this.snapshot(this.mainTaskTimer)!;
  }

  public pauseMainTask(): TimestampTimer | null {
    if (!this.mainTaskTimer) return null;
    if (this.mainTaskTimer.isRunning) {
      const remaining = this.calcRemaining(this.mainTaskTimer);
      this.mainTaskTimer = {
        startTime: Date.now(),
        duration: remaining,
        remaining,
        isRunning: false,
        label: "Task Time Remaining",
      };
    } else {
      const remaining = this.mainTaskTimer.remaining;
      this.mainTaskTimer = {
        startTime: Date.now(),
        duration: remaining,
        remaining,
        isRunning: true,
        label: "Task Time Remaining",
      };
    }
    return this.snapshot(this.mainTaskTimer);
  }

  public adjustMainTask(seconds: number): TimestampTimer | null {
    if (!this.mainTaskTimer) {
      return this.startMainTask(Math.max(0, seconds));
    }
    const currentRemaining = this.calcRemaining(this.mainTaskTimer);
    const newRemaining = Math.max(0, currentRemaining + seconds);
    this.mainTaskTimer = {
      startTime: Date.now(),
      duration: newRemaining,
      remaining: newRemaining,
      isRunning: this.mainTaskTimer.isRunning,
      label: "Task Time Remaining",
    };
    return this.snapshot(this.mainTaskTimer);
  }

  public stopMainTask(): void {
    this.mainTaskTimer = null;
    this.onMainTaskExpireCb = null;
  }

  // ─── Extra Timer (Manual, used for fallback, editable label) ───
  public startExtraTimer(duration: number = 60, label: string = "Extra Timer", onExpire?: () => void): TimestampTimer {
    this.stopMainTask(); // Timer safety: stop task timer before starting extra timer
    if (this.explicitTimer && !this.explicitTimer.isRunning && this.explicitTimer.remaining > 0 && duration <= 0) {
      const remaining = this.explicitTimer.remaining;
      this.explicitTimer = {
        startTime: Date.now(),
        duration: remaining,
        remaining,
        isRunning: true,
        label: label || this.explicitTimer.label || "Extra Timer",
      };
    } else {
      this.explicitTimer = {
        startTime: Date.now(),
        duration,
        remaining: duration,
        isRunning: true,
        label: label || "Extra Timer",
      };
    }
    if (onExpire) this.onExplicitExpireCb = onExpire;
    return this.snapshot(this.explicitTimer)!;
  }

  public pauseExtraTimer(): TimestampTimer | null {
    if (!this.explicitTimer) return null;
    if (this.explicitTimer.isRunning) {
      const remaining = this.calcRemaining(this.explicitTimer);
      this.explicitTimer = {
        startTime: Date.now(),
        duration: remaining,
        remaining,
        isRunning: false,
        label: this.explicitTimer.label || "Extra Timer",
      };
    } else {
      const remaining = this.explicitTimer.remaining;
      this.explicitTimer = {
        startTime: Date.now(),
        duration: remaining,
        remaining,
        isRunning: true,
        label: this.explicitTimer.label || "Extra Timer",
      };
    }
    return this.snapshot(this.explicitTimer);
  }

  public adjustExtraTimer(seconds: number): TimestampTimer | null {
    if (!this.explicitTimer) {
      return this.startExtraTimer(Math.max(0, seconds), "Extra Timer");
    }
    const currentRemaining = this.calcRemaining(this.explicitTimer);
    const newRemaining = Math.max(0, currentRemaining + seconds);
    this.explicitTimer = {
      startTime: Date.now(),
      duration: newRemaining,
      remaining: newRemaining,
      isRunning: this.explicitTimer.isRunning,
      label: this.explicitTimer.label || "Extra Timer",
    };
    return this.snapshot(this.explicitTimer);
  }

  public stopExtraTimer(): void {
    this.explicitTimer = null;
    this.onExplicitExpireCb = null;
  }

  // Backwards compatibility aliases
  public startExplicitTimer(duration: number = 60, onExpire?: () => void): TimestampTimer {
    return this.startExtraTimer(duration, "Open Challenge", onExpire);
  }
  public pauseExplicitTimer(): TimestampTimer | null {
    return this.pauseExtraTimer();
  }
  public adjustExplicitTimer(seconds: number): TimestampTimer | null {
    return this.adjustExtraTimer(seconds);
  }
  public stopExplicitTimer(): void {
    this.stopExtraTimer();
  }
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
    this.stopExtraTimer();
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
          this.onMainTaskExpireCb = null; // fire once
          cb?.();
        }
      }

      if (this.explicitTimer && this.explicitTimer.isRunning) {
        const rem = this.calcRemaining(this.explicitTimer);
        this.explicitTimer.remaining = rem;
        if (rem <= 0) {
          this.explicitTimer.isRunning = false;
          const cb = this.onExplicitExpireCb;
          this.onExplicitExpireCb = null; // fire once
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
