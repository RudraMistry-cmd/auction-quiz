import { v4 as uuidv4 } from "uuid";
import { getDb, persistDb } from "../db/database";
import { stateManager } from "./phase.service";
import { taskService } from "./task.service";
import { questionService } from "./question.service";
import { manualTimerService } from "./manual-timer.service";
import type { Auction, Bid, QuestionPayload, Task } from "../types";

const ALLOWED_INCREMENTS = [20, 50];

function queryAll(db: any, sql: string, params: any[] = []): any[] {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(db: any, sql: string, params: any[] = []): any | undefined {
  return queryAll(db, sql, params)[0] || undefined;
}

function run(db: any, sql: string, params: any[] = []): { changes: number } {
  db.run(sql, params);
  return { changes: db.getRowsModified() };
}

export class AuctionService {
  private activeAuction: Auction | null = null;
  private seqCounter: number = 0;
  private lastBidTime: Map<string, number> = new Map();
  private timerInterval: NodeJS.Timeout | null = null;
  // Serializes bid processing so simultaneous bids can't read the
  // same current bid and produce duplicate amounts.
  private bidLock: Promise<void> = Promise.resolve();

  async init() {
    const db = await getDb();
    const last = queryOne(db, "SELECT MAX(seqNo) as maxSeq FROM auctions");
    this.seqCounter = last?.maxSeq || 0;
  }

  /**
   * Boot reconciliation: a restart mid-auction leaves rows stuck at
   * status='active' with no in-memory timer. Close them so the event
   * can continue with a fresh auction instead of a poisoned state.
   */
  async reconcileOnBoot(): Promise<number> {
    const db = await getDb();
    const stale = queryAll(db, `
      SELECT auctionId FROM auctions WHERE status = 'active'
    `);
    for (const row of stale) {
      run(db, `
        UPDATE auctions SET status = 'completed' WHERE auctionId = ?
      `, [row.auctionId]);
    }
    if (stale.length > 0) {
      console.warn(`[Auction] Reconciled ${stale.length} stale active auction(s) from before restart.`);
      persistDb();
    }
    return stale.length;
  }

  /**
   * Runs fn exclusively — serializes auction mutations (bids, starts,
   * ends) so concurrent operations can't interleave reads and writes.
   */
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.bidLock;
    this.bidLock = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  getActiveAuction(): Auction | null {
    return this.activeAuction;
  }

  async getCurrentBid(auctionId: string): Promise<number> {
    const db = await getDb();
    const auction = queryOne(db, `
      SELECT startBid, increment FROM auctions WHERE auctionId = ?
    `, [auctionId]);
    if (!auction) return 0;

    const lastBid = queryOne(db, `
      SELECT amount FROM bids WHERE auctionId = ? ORDER BY seqNo DESC LIMIT 1
    `, [auctionId]);

    return lastBid ? lastBid.amount : auction.startBid;
  }

  async getLastBid(auctionId: string): Promise<Bid | null> {
    const db = await getDb();
    const bid = queryOne(db, `
      SELECT * FROM bids WHERE auctionId = ? ORDER BY seqNo DESC LIMIT 1
    `, [auctionId]);
    return bid || null;
  }

  async startAuction(config: {
    startBid?: number;
    increment?: number;
    duration?: number;
  } = {}): Promise<Auction> {
    return this.withLock(async () => {
      if (this.activeAuction) {
        throw new Error("An auction is already active");
      }

      const curQ = stateManager.getCurrentQuestion();
      if (!curQ) {
        throw new Error("No question selected. Please select a question before starting the auction.");
      }

      const startBid = config.startBid ?? 100;
      const increment = config.increment ?? 20;
      const duration = config.duration ?? 60;

      const auctionId = uuidv4();
      // State machine: auctions may only start from idle or ended.
      stateManager.beginAuction(auctionId);

      const db = await getDb();
      this.seqCounter++;

      const endAt = Date.now() + duration * 1000;

      run(db, `
        INSERT INTO auctions (auctionId, seqNo, startBid, increment, duration, status, endAt, question, defaultReward, questionId, time_limit)
        VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
      `, [auctionId, this.seqCounter, startBid, increment, duration, endAt,
          curQ.image, curQ.reward, curQ.id, curQ.time]);
      persistDb();

      this.activeAuction = {
        auctionId,
        seqNo: this.seqCounter,
        startBid,
        increment,
        duration,
        status: "active",
        endAt,
        winnerId: null,
        question: curQ.image,
        defaultReward: curQ.reward,
        questionId: curQ.id,
        time_limit: curQ.time,
        created_at: new Date().toISOString(),
      };

      return this.activeAuction;
    });
  }

  async placeBid(
    teamId: string,
    auctionId: string,
    increment: number
  ): Promise<{ success: true; bid: Bid; nextBid: number } | { success: false; error: string }> {
    // Queue behind any in-flight bid so read-compute-write is atomic.
    return this.withLock(() => this.processBid(teamId, auctionId, increment));
  }

  private async processBid(
    teamId: string,
    auctionId: string,
    increment: number
  ): Promise<{ success: true; bid: Bid; nextBid: number } | { success: false; error: string }> {
    if (!ALLOWED_INCREMENTS.includes(increment)) {
      return { success: false, error: `Invalid increment. Must be ${ALLOWED_INCREMENTS.join(" or ")}.` };
    }
    if (stateManager.getPhase() !== "bidding") {
      return { success: false, error: "No live auction right now" };
    }
    if (!this.activeAuction || this.activeAuction.auctionId !== auctionId) {
      return { success: false, error: "No active auction for this ID" };
    }

    if (this.activeAuction.status !== "active") {
      return { success: false, error: "Auction is not active" };
    }

    if (Date.now() >= this.activeAuction.endAt) {
      return { success: false, error: "Auction has ended" };
    }

    const lastTime = this.lastBidTime.get(teamId);
    if (lastTime && Date.now() - lastTime < 800) {
      return { success: false, error: "Bidding too fast. Wait 800ms between bids." };
    }

    const db = await getDb();

    // Reject only if this team already holds the highest bid
    const lastBid = queryOne(db, `
      SELECT teamId FROM bids WHERE auctionId = ? ORDER BY seqNo DESC LIMIT 1
    `, [auctionId]);
    if (lastBid && lastBid.teamId === teamId) {
      return { success: false, error: "You already hold the highest bid. Wait for another team to outbid you." };
    }

    const currentBid = await this.getCurrentBid(auctionId);
    const nextBid = currentBid + increment;

    const team = queryOne(db, `
      SELECT bid_coins FROM teams WHERE teamId = ?
    `, [teamId]);

    if (!team) {
      return { success: false, error: "Team not found" };
    }

    if (team.bid_coins < nextBid) {
      return { success: false, error: `Insufficient coins. Need ${nextBid}, have ${team.bid_coins}` };
    }

    // NOTE: coins are NOT deducted here. Only the winning team's
    // coins are deducted once, in endAuction().

    const maxSeq = queryOne(db, `
      SELECT MAX(seqNo) as maxSeq FROM bids WHERE auctionId = ?
    `, [auctionId]);
    const bidSeq = (maxSeq?.maxSeq || 0) + 1;

    const bidId = uuidv4();
    run(db, `
      INSERT INTO bids (bidId, auctionId, teamId, amount, seqNo)
      VALUES (?, ?, ?, ?, ?)
    `, [bidId, auctionId, teamId, nextBid, bidSeq]);
    persistDb();

    this.lastBidTime.set(teamId, Date.now());
    stateManager.setCurrentBid(nextBid);

    const bid: Bid = {
      bidId,
      auctionId,
      teamId,
      amount: nextBid,
      seqNo: bidSeq,
      createdAt: new Date().toISOString(),
    };

    return { success: true, bid, nextBid };
  }

  async endAuction(): Promise<{ auction: Auction; winner: { teamId: string; teamName: string } | null; winningBid: number | null } | null> {
    // End through the same lock as bids: a bid arriving in the same
    // instant as the timer must not be inserted after completion.
    return this.withLock(() => this.finishAuction());
  }

  private async finishAuction(): Promise<{ auction: Auction; winner: { teamId: string; teamName: string } | null; winningBid: number | null } | null> {
    if (!this.activeAuction) return null;

    const db = await getDb();
    const auctionId = this.activeAuction.auctionId;

    const lastBid = queryOne(db, `
      SELECT b.*, t.teamName
      FROM bids b
      JOIN teams t ON b.teamId = t.teamId
      WHERE b.auctionId = ?
      ORDER BY b.seqNo DESC
      LIMIT 1
    `, [auctionId]);

    const winnerId = lastBid?.teamId || null;
    const winningBid = lastBid?.amount ?? null;

    // Settlement AT AUCTION END (transactional): the winner pays the
    // final bid immediately, clamped at zero. PASS/FAIL later move only
    // reward points — never coins. The phase transition to 'task' (or
    // back to 'idle' when there is no winner) happens in the caller.
    run(db, "BEGIN IMMEDIATE");
    try {
      run(db, `
        UPDATE auctions SET status = 'completed', winnerId = ?, finalBid = ? WHERE auctionId = ?
      `, [winnerId, winningBid, auctionId]);
      if (winnerId && winningBid != null) {
        const team = queryOne(db, `
          SELECT bid_coins FROM teams WHERE teamId = ?
        `, [winnerId]);
        const deduction = Math.min(team?.bid_coins ?? 0, winningBid);
        run(db, `
          UPDATE teams SET bid_coins = bid_coins - ? WHERE teamId = ?
        `, [deduction, winnerId]);
      }
      run(db, "COMMIT");
    } catch (err) {
      try { run(db, "ROLLBACK"); } catch { /* already clean */ }
      throw err;
    }
    persistDb();

    const questionId = this.activeAuction.questionId;
    if (questionId) {
      try {
        await questionService.markQuestionUsed(questionId);
      } catch (err) {
        console.error(`[AuctionService] Failed to mark question ${questionId} as used:`, err);
      }
    }

    const result = {
      auction: { ...this.activeAuction, status: "completed" as const, winnerId },
      winner: lastBid ? { teamId: lastBid.teamId, teamName: lastBid.teamName } : null,
      winningBid: lastBid?.amount || null,
    };

    this.activeAuction = null;
    this.lastBidTime.clear();

    return result;
  }

  startTimer(onTick: (remaining: number) => void, onComplete: () => void) {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    this.timerInterval = setInterval(() => {
      if (!this.activeAuction) {
        this.stopTimer();
        return;
      }

      const remaining = Math.max(0, Math.ceil((this.activeAuction.endAt - Date.now()) / 1000));
      onTick(remaining);

      if (remaining <= 0) {
        this.stopTimer();
        onComplete();
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  resetAuction() {
    this.stopTimer();
    this.activeAuction = null;
    this.lastBidTime.clear();
  }

  async getRecentBids(auctionId: string, limit: number = 10): Promise<Bid[]> {
    const db = await getDb();
    return queryAll(db, `
      SELECT * FROM bids WHERE auctionId = ? ORDER BY seqNo DESC LIMIT ?
    `, [auctionId, limit]) as Bid[];
  }

  async getAuction(auctionId: string): Promise<Auction | null> {
    const db = await getDb();
    const row = queryOne(db, `
      SELECT * FROM auctions WHERE auctionId = ?
    `, [auctionId]);
    return row || null;
  }

  /**
   * Public snapshot for display/admin screens (which hold no team
   * session and can't use client:reconnect). Lets a refreshed page
   * jump straight back into the live auction — or the last result.
   */
  async getPublicState(): Promise<{
    auction: Auction | null;
    currentBid?: number;
    remaining?: number;
    leadingTeam?: string | null;
    recentBids?: { amount: number; seqNo: number; teamName: string }[];
    lastResult?: { teamName: string; bid: number | null } | null;
    phase: "idle" | "auction" | "task";
    activeTask?: (Task & { timeLeft: number }) | null;
    activeQuestion?: QuestionPayload | null;
    upcomingQuestion?: QuestionPayload | null;
    currentQuestionImage?: string | null;
    manualTimer?: { duration: number; endAt: number | null; isRunning: boolean; timeLeft: number };
  }> {
    const db = await getDb();
    const auction = this.getActiveAuction();
    const taskState = await taskService.getTaskState();
    const selected = await questionService.getSelected();
    const upcomingQuestion = selected ? questionService.toPayload(selected) : null;
    const currentQuestionImage = stateManager.getQuestionImage();

    if (auction) {
      const lastBid = queryOne(db, `
        SELECT b.amount, t.teamName
        FROM bids b
        JOIN teams t ON t.teamId = b.teamId
        WHERE b.auctionId = ?
        ORDER BY b.seqNo DESC
        LIMIT 1
      `, [auction.auctionId]);
      const recentBids = queryAll(db, `
        SELECT b.amount, b.seqNo, t.teamName
        FROM bids b
        JOIN teams t ON t.teamId = b.teamId
        WHERE b.auctionId = ?
        ORDER BY b.seqNo DESC
        LIMIT 5
      `, [auction.auctionId]);
      let activeQuestion: QuestionPayload | null = null;
      if (auction.questionId) {
        const bankQ = await questionService.getQuestion(auction.questionId);
        if (bankQ) activeQuestion = questionService.toPayload(bankQ);
      }
      return {
        auction,
        currentBid: lastBid ? lastBid.amount : auction.startBid,
        remaining: Math.max(0, Math.ceil((auction.endAt - Date.now()) / 1000)),
        leadingTeam: lastBid ? lastBid.teamName : null,
        recentBids,
        phase: taskState.phase,
        activeTask: taskState.task,
        activeQuestion,
        upcomingQuestion,
        currentQuestionImage,
        manualTimer: manualTimerService.getState(),
      };
    }

    const last = queryOne(db, `
      SELECT a.auctionId, a.winnerId, t.teamName AS winnerName
      FROM auctions a
      LEFT JOIN teams t ON t.teamId = a.winnerId
      WHERE a.status = 'completed'
      ORDER BY a.seqNo DESC
      LIMIT 1
    `);
    if (!last || !last.winnerId) {
      return { auction: null, lastResult: null, phase: taskState.phase, activeTask: taskState.task, upcomingQuestion, currentQuestionImage, manualTimer: manualTimerService.getState() };
    }
    const winBid = queryOne(db, `
      SELECT amount FROM bids WHERE auctionId = ? ORDER BY seqNo DESC LIMIT 1
    `, [last.auctionId]);
    return {
      auction: null,
      lastResult: { teamName: last.winnerName, bid: winBid ? winBid.amount : null },
      phase: taskState.phase,
      activeTask: taskState.task,
      upcomingQuestion,
      currentQuestionImage,
      manualTimer: manualTimerService.getState(),
    };
  }
}

export const auctionService = new AuctionService();
