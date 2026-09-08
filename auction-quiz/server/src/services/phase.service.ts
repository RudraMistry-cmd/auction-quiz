import fs from "fs";
import path from "path";
import { timerEngineService } from "./timer-engine.service";
import type { GamePhase, GameState, QuestionManifestItem } from "../types";

export type Phase = GamePhase;

class StateManager {
  private phase: GamePhase = "idle";
  private currentAuctionId: string | null = null;
  private currentTaskId: string | null = null;
  private currentQuestionImage: string | null = null;
  private currentQuestion: QuestionManifestItem | null = null;
  private currentBid: number = 0;
  private winningTeam: { teamId: string; teamName: string } | null = null;
  private manifest: QuestionManifestItem[] = [];
  private manifestPath: string = path.join(__dirname, "../../../questions/manifest.json");

  constructor() {
    this.loadManifest();
  }

  public loadManifest(): QuestionManifestItem[] {
    try {
      if (fs.existsSync(this.manifestPath)) {
        const raw = fs.readFileSync(this.manifestPath, "utf-8");
        this.manifest = JSON.parse(raw);
      } else {
        this.manifest = [];
      }
    } catch (err) {
      console.error("[StateManager] Failed to load manifest.json:", err);
      this.manifest = [];
    }
    return this.manifest;
  }

  private saveManifest(): void {
    try {
      fs.writeFileSync(this.manifestPath, JSON.stringify(this.manifest, null, 2), "utf-8");
    } catch (err) {
      console.error("[StateManager] Failed to save manifest.json:", err);
    }
  }

  public getManifest(): QuestionManifestItem[] {
    if (this.manifest.length === 0) {
      this.loadManifest();
    }
    return this.manifest;
  }

  public selectQuestion(id: string): QuestionManifestItem | null {
    const q = this.getManifest().find((item) => item.id === id);
    if (!q) return null;
    this.currentQuestion = q;
    this.currentQuestionImage = q.image;
    return q;
  }

  public markQuestionUsed(id: string): void {
    const q = this.getManifest().find((item) => item.id === id);
    if (q) {
      q.used = true;
      this.saveManifest();
    }
  }

  public getGameState(): GameState {
    const timers = timerEngineService.getTimers();
    return {
      phase: this.phase,
      currentQuestion: this.currentQuestion,
      currentBid: this.currentBid,
      winningTeam: this.winningTeam,
      biddingTimer: timers.biddingTimer,
      mainTaskTimer: timers.mainTaskTimer,
      explicitTimer: timers.explicitTimer,
      sideTaskTimer: timers.explicitTimer,
    };
  }

  public getPhase(): GamePhase {
    return this.phase;
  }

  public setPhase(phase: GamePhase): void {
    this.phase = phase;
  }

  public getCurrentQuestion(): QuestionManifestItem | null {
    return this.currentQuestion;
  }

  public setCurrentQuestion(q: QuestionManifestItem | null): void {
    this.currentQuestion = q;
    this.currentQuestionImage = q ? q.image : null;
  }

  public getCurrentBid(): number {
    return this.currentBid;
  }

  public setCurrentBid(bid: number): void {
    this.currentBid = bid;
  }

  public getWinningTeam(): { teamId: string; teamName: string } | null {
    return this.winningTeam;
  }

  public setWinningTeam(team: { teamId: string; teamName: string } | null): void {
    this.winningTeam = team;
  }

  public getAuctionId(): string | null {
    return this.currentAuctionId;
  }

  public getTaskId(): string | null {
    return this.currentTaskId;
  }

  public getQuestionImage(): string | null {
    return this.currentQuestion ? this.currentQuestion.image : this.currentQuestionImage;
  }

  public setQuestionImage(imagePath: string | null): void {
    this.currentQuestionImage = imagePath;
    if (imagePath) {
      const q = this.getManifest().find((item) => item.image === imagePath);
      if (q) this.currentQuestion = q;
    }
  }

  public markImageUsed(imagePath: string): void {
    const q = this.getManifest().find((item) => item.image === imagePath);
    if (q) {
      this.markQuestionUsed(q.id);
    }
  }

  public isImageUsed(imagePath: string): boolean {
    const q = this.getManifest().find((item) => item.image === imagePath);
    return q ? !!q.used : false;
  }

  public snapshot(): GameState {
    return this.getGameState();
  }

  /** IDLE → BIDDING */
  public beginAuction(auctionId: string): void {
    if (this.phase !== "idle" && this.phase !== "ended") {
      throw new Error(`Cannot start auction while phase is '${this.phase}'`);
    }
    if (!this.currentQuestion) {
      throw new Error("Cannot start auction: No question selected");
    }
    this.phase = "bidding";
    this.currentAuctionId = auctionId;
    this.currentTaskId = null;
    this.winningTeam = null;
    this.currentBid = 0;
  }

  /** BIDDING → MAIN_TASK */
  public auctionClosedToTask(auctionId: string, taskId: string, winner: { teamId: string; teamName: string }, finalBid: number): void {
    this.phase = "main_task";
    this.currentAuctionId = null;
    this.currentTaskId = taskId;
    this.winningTeam = winner;
    this.currentBid = finalBid;
    if (this.currentQuestion) {
      this.markQuestionUsed(this.currentQuestion.id);
    }
  }

  /** BIDDING → ENDED (No winner / 0 bids) */
  public auctionClosedIdle(auctionId: string): void {
    this.phase = "ended";
    this.currentAuctionId = null;
    this.winningTeam = null;
    this.currentBid = 0;
  }

  /** On Main Task Fail (stops main timer, does not force phase change) */
  public markMainTaskFailed(): void {
    timerEngineService.stopMainTask();
  }

  /** Reset round to IDLE */
  public resetRound(): void {
    this.phase = "idle";
    this.currentAuctionId = null;
    this.currentTaskId = null;
    this.currentQuestion = null;
    this.currentQuestionImage = null;
    this.winningTeam = null;
    this.currentBid = 0;
    timerEngineService.resetAll();
  }

  /** MAIN_TASK / SIDE_TASK → IDLE (Task resolved) */
  public taskResolved(taskId: string): void {
    this.phase = "idle";
    this.currentTaskId = null;
    this.currentAuctionId = null;
    this.winningTeam = null;
    this.currentBid = 0;
    this.currentQuestion = null;
    this.currentQuestionImage = null;
    timerEngineService.resetAll();
  }
}

export const stateManager = new StateManager();
