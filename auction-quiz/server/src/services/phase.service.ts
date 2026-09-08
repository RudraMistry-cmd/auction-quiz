/**
 * Global game state machine.
 *
 *   IDLE → AUCTION_ACTIVE → TASK_ACTIVE → RESULT_RECORDED → IDLE
 *   idle → auction       → task          → (transient)    → idle
 *
 * No invalid transitions allowed — every transition throws unless the
 * machine is in the exact expected state. Single process, synchronous
 * transitions: atomic by construction.
 */
export type Phase = "idle" | "auction" | "task";

class StateManager {
  private phase: Phase = "idle";
  private currentAuctionId: string | null = null;
  private currentTaskId: string | null = null;
  private currentQuestionImage: string | null = null;
  private usedImages: Set<string> = new Set();

  getPhase(): Phase {
    return this.phase;
  }

  getAuctionId(): string | null {
    return this.currentAuctionId;
  }

  getTaskId(): string | null {
    return this.currentTaskId;
  }

  getQuestionImage(): string | null {
    return this.currentQuestionImage;
  }

  setQuestionImage(imagePath: string | null): void {
    this.currentQuestionImage = imagePath;
  }

  markImageUsed(imagePath: string): void {
    this.usedImages.add(imagePath);
  }

  isImageUsed(imagePath: string): boolean {
    return this.usedImages.has(imagePath);
  }

  getUsedImages(): string[] {
    return Array.from(this.usedImages);
  }

  clearUsedImages(): void {
    this.usedImages.clear();
  }

  snapshot(): { phase: Phase; currentAuctionId: string | null; currentTaskId: string | null } {
    return {
      phase: this.phase,
      currentAuctionId: this.currentAuctionId,
      currentTaskId: this.currentTaskId,
    };
  }

  /** IDLE → AUCTION_ACTIVE. Throws unless phase is idle. */
  beginAuction(auctionId: string): void {
    if (this.phase !== "idle") {
      throw new Error(`Cannot start auction while phase is '${this.phase}'`);
    }
    this.phase = "auction";
    this.currentAuctionId = auctionId;
  }

  /** AUCTION_ACTIVE → TASK_ACTIVE. Throws unless this auction just ended. */
  auctionClosedToTask(auctionId: string, taskId: string): void {
    if (this.phase !== "auction" || this.currentAuctionId !== auctionId) {
      throw new Error("Cannot assign task: no auction just ended");
    }
    this.phase = "task";
    this.currentAuctionId = null;
    this.currentTaskId = taskId;
  }

  /** AUCTION_ACTIVE → IDLE (auction ended with no winner, so no task). */
  auctionClosedIdle(auctionId: string): void {
    if (this.phase !== "auction" || this.currentAuctionId !== auctionId) {
      throw new Error("Cannot close auction: phase mismatch");
    }
    this.phase = "idle";
    this.currentAuctionId = null;
  }

  /** TASK_ACTIVE → IDLE (result recorded). Throws unless this task is active. */
  taskResolved(taskId: string): void {
    if (this.phase !== "task" || this.currentTaskId !== taskId) {
      throw new Error("Cannot mark result: no active task");
    }
    this.phase = "idle";
    this.currentTaskId = null;
  }
}

export const stateManager = new StateManager();
