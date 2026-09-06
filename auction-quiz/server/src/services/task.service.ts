import { v4 as uuidv4 } from "uuid";
import { getDb, persistDb } from "../db/database";
import { stateManager } from "./phase.service";
import type { Task, TaskResultDecision, Team } from "../types";

/** Task window: winner has 5 minutes to complete the assigned task. */
export const TASK_DURATION_S = 300;
/** Undo window: admin may revert the last recorded result within 30s. */
export const UNDO_WINDOW_MS = 30000;


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

/** Parse a stored options JSON string; null when empty/invalid. */
function parseOptionsJson(raw: unknown): Task["options"] {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  try {
    const parsed: unknown = JSON.parse(String(raw));
    if (parsed === null || typeof parsed !== "object") return null;
    return parsed as Task["options"];
  } catch {
    return null;
  }
}

export interface TaskResolution {
  task: Task;
  team: Team;
  appliedReward: number;
  appliedDeduction: number;
}

export class TaskService {
  private activeTask: Task | null = null;
  private timerInterval: NodeJS.Timeout | null = null;
  private lock: Promise<void> = Promise.resolve();
  /** Frozen countdown while paused (seconds). endAt is rewritten on resume. */
  private pausedRemaining: number = 0;

  /** Serializes task mutations so concurrent admin actions can't interleave. */
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.lock;
    this.lock = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  getActiveTask(): Task | null {
    return this.activeTask;
  }

  /** Current task-state version (ms stamp of the last mutation). */
  getVersion(): number {
    return this.activeTask?.version ?? 0;
  }

  /** Stamp the active task so snapshots/events can be ordered. */
  private stamp(t: Task): Task {
    this.activeTask = { ...t, version: Date.now() };
    return this.activeTask;
  }

  /**
   * Create a task for the auction winner. Only valid when an auction
   * just ended (phase === 'auction'). Moves phase auction → task.
   */
  async assignTask(params: {
    auctionId: string;
    teamId: string;
    teamName: string;
    finalBid: number;
  }): Promise<Task> {
    return this.withLock(async () => {
      if (stateManager.getPhase() !== "auction" || stateManager.getAuctionId() !== params.auctionId) {
        throw new Error("Cannot assign task: no auction just ended");
      }

      const db = await getDb();
      const now = Date.now();
      // Carry the round's question + default reward onto the task so every
      // screen can show them the moment the task is assigned.
      const round = queryOne(db, `
        SELECT question, defaultReward, questionId FROM auctions WHERE auctionId = ?
      `, [params.auctionId]);
      if (!round?.questionId) {
        throw new Error("Cannot assign task: auction has no bank question");
      }
      const bankQ = queryOne(db, `
        SELECT reward_points, options FROM questions WHERE id = ?
      `, [round.questionId]);
      const task: Task = {
        taskId: uuidv4(),
        auctionId: params.auctionId,
        teamId: params.teamId,
        teamName: params.teamName,
        finalBid: params.finalBid,
        question: (round?.question as string) ?? null,
        defaultReward: typeof bankQ?.reward_points === "number"
          ? bankQ.reward_points
          : typeof round?.defaultReward === "number" ? round.defaultReward : 1,
        questionId: round.questionId as string,
        options: parseOptionsJson(bankQ?.options),
        startAt: now,
        endAt: now + TASK_DURATION_S * 1000,
        status: "active",
        result: null,
        created_at: new Date().toISOString(),
      };

      run(db, `
        INSERT INTO tasks (taskId, auctionId, teamId, finalBid, question, defaultReward, questionId, options, startAt, endAt, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `, [task.taskId, task.auctionId, task.teamId, task.finalBid, task.question, task.defaultReward, task.questionId,
          task.options === null || task.options === undefined ? null : JSON.stringify(task.options),
          task.startAt, task.endAt]);
      persistDb();

      this.pausedRemaining = 0;

      this.activeTask = task;
      this.stamp(task);
      stateManager.auctionClosedToTask(params.auctionId, task.taskId);
      return this.activeTask;
    });
  }

  /**
   * Mark the active task's timer as expired. The admin may still submit
   * a result afterwards — expiry never resolves the task by itself.
   */
  async expireTask(taskId: string): Promise<Task | null> {
    return this.withLock(async () => {
      // Transition-only: returns null when nothing changed, so callers
      // emit task:ended exactly once per actual expiry.
      if (!this.activeTask || this.activeTask.taskId !== taskId) return null;
      if (this.activeTask.status !== "active") return null;
      const db = await getDb();
      run(db, `
        UPDATE tasks SET status = 'ended' WHERE taskId = ? AND status = 'active'
      `, [taskId]);
      persistDb();
      return this.stamp({ ...this.activeTask, status: "ended" });
    });
  }

  /**
   * Server-authoritative task countdown. Emits every second from the
   * stored endAt timestamp; never trusts client timers.
   */
  startTaskTimer(onTick: (timeLeft: number) => void, onComplete: () => void) {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    this.timerInterval = setInterval(() => {
      if (!this.activeTask) {
        this.stopTaskTimer();
        return;
      }

      const timeLeft = Math.max(0, Math.ceil((this.activeTask.endAt - Date.now()) / 1000));
      onTick(timeLeft);

      if (timeLeft <= 0) {
        this.stopTaskTimer();
        onComplete();
      }
    }, 1000);
  }

  stopTaskTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Freeze the countdown. Ticks stop; remaining seconds are held in
   * memory until resume. Only valid while the timer is running.
   */
  async pauseTask(taskId: string): Promise<{ task: Task; timeLeft: number }> {
    return this.withLock(async () => {
      const t = this.activeTask;
      if (!t || t.taskId !== taskId) throw new Error("No active task to pause");
      if (t.status !== "active") throw new Error("Timer already expired — add time to extend it");
      if (t.paused) throw new Error("Timer is already paused");
      const timeLeft = Math.max(0, Math.ceil((t.endAt - Date.now()) / 1000));
      this.pausedRemaining = timeLeft;
      this.stopTaskTimer();
      const stamped = this.stamp({ ...t, paused: true });
      return { task: stamped, timeLeft };
    });
  }

  /**
   * Resume a paused countdown from the frozen remaining time.
   * Rewrites endAt so all displays stay consistent. Caller restarts ticks.
   */
  async resumeTask(taskId: string): Promise<{ task: Task; timeLeft: number }> {
    return this.withLock(async () => {
      const t = this.activeTask;
      if (!t || t.taskId !== taskId) throw new Error("No active task to resume");
      if (!t.paused) throw new Error("Timer is not paused");
      const db = await getDb();
      const endAt = Date.now() + this.pausedRemaining * 1000;
      run(db, `UPDATE tasks SET endAt = ? WHERE taskId = ?`, [endAt, taskId]);
      persistDb();
      const stamped = this.stamp({ ...t, endAt, paused: false });
      return { task: stamped, timeLeft: this.pausedRemaining };
    });
  }

  /**
   * Shift the deadline by whole seconds (e.g. +30). Works running or
   * paused; revives an expired task back to active when time remains.
   */
  async adjustTask(taskId: string, seconds: number): Promise<{ task: Task; timeLeft: number; revived: boolean }> {
    return this.withLock(async () => {
      if (!Number.isInteger(seconds) || seconds === 0 || Math.abs(seconds) > 300) {
        throw new Error("Adjust by a non-zero whole number of seconds (max ±300)");
      }
      const t = this.activeTask;
      if (!t || t.taskId !== taskId) throw new Error("No active task to adjust");
      if (t.status !== "active" && t.status !== "ended") throw new Error("Task is already resolved");
      const db = await getDb();
      let timeLeft: number;
      let revived = false;
      if (t.paused) {
        timeLeft = Math.max(0, this.pausedRemaining + seconds);
        this.pausedRemaining = timeLeft;
        this.stamp({ ...t });
      } else {
        const endAt = t.endAt + seconds * 1000;
        timeLeft = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
        run(db, `UPDATE tasks SET endAt = ? WHERE taskId = ?`, [endAt, taskId]);
        if (t.status === "ended" && timeLeft > 0) {
          run(db, `UPDATE tasks SET status = 'active' WHERE taskId = ?`, [taskId]);
          revived = true;
        }
        persistDb();
        this.stamp({ ...t, endAt, status: revived ? "active" : t.status });
      }
      return { task: this.activeTask!, timeLeft, revived };
    });
  }

  /**
   * (Re)start the full TASK_DURATION_S countdown on demand — e.g. the
   * winner wasn't ready when the task auto-started. Revives expired
   * tasks. Caller restarts ticks.
   */
  async restartTask(taskId: string): Promise<{ task: Task; timeLeft: number }> {
    return this.withLock(async () => {
      const t = this.activeTask;
      if (!t || t.taskId !== taskId) throw new Error("No active task to start");
      const db = await getDb();
      const endAt = Date.now() + TASK_DURATION_S * 1000;
      run(db, `UPDATE tasks SET endAt = ?, status = 'active' WHERE taskId = ?`, [endAt, taskId]);
      persistDb();
      const stamped = this.stamp({ ...t, endAt, status: "active", paused: false });
      return { task: stamped, timeLeft: TASK_DURATION_S };
    });
  }

  /**
   * Record the admin's verdict. Deterministic settlement:
   *   PASS → team.reward_points += rewardPoints (explicit, else bank default)
   *   FAIL → no balance change (the winner already paid finalBid at
   *          auction end; the verdict only denies points)
   *
   * Guarantees:
   * - Idempotent: an exact replay of a committed verdict returns the
   *   committed state instead of erroring (safe ack-loss retries).
   * - Atomic: validate → INSERT result row → mutate balances → close
   *   task, all inside one transaction. A failed INSERT aborts with
   *   zero mutation (fixes the resubmit-after-undo double-charge).
   * - Re-verdict after undo is allowed: undone rows don't block, and
   *   undo() resets the task row to a decidable state.
   * Moves phase task → idle (stays idle on the re-verdict path).
   */
  async submitResult(params: {
    taskId: string;
    result: TaskResultDecision;
    rewardPoints?: number;
  }): Promise<TaskResolution> {
    return this.withLock(async () => {
      if (params.result !== "pass" && params.result !== "fail") {
        throw new Error("Invalid result: must be 'pass' or 'fail'");
      }
      const db = await getDb();

      // Task row first: source of truth for the bank default reward.
      const trow = queryOne(db, `
        SELECT * FROM tasks WHERE taskId = ?
      `, [params.taskId]);
      const taskDefault = typeof trow?.defaultReward === "number" ? (trow.defaultReward as number) : 1;
      // Explicit override wins; otherwise the bank default. Any grant is
      // a whole non-negative number of points.
      const finalReward = params.result === "pass"
        ? (params.rewardPoints !== undefined ? params.rewardPoints : taskDefault)
        : 0;
      if (params.result === "pass" && (!Number.isInteger(finalReward) || finalReward < 0)) {
        throw new Error("Invalid rewardPoints: must be an integer >= 0");
      }
      const wantReward = finalReward;

      // Idempotent replay: the exact verdict is already committed.
      const recorded = queryOne(db, `
        SELECT * FROM task_results WHERE taskId = ? AND undone = 0
      `, [params.taskId]);
      if (recorded) {
        const same = recorded.result === params.result &&
          (params.result === "fail" || (recorded.rewardPoints as number) === wantReward);
        if (!same) {
          throw new Error("Result already recorded for this task");
        }
        const trow = queryOne(db, `
          SELECT t.*, tm.teamName FROM tasks t
          LEFT JOIN teams tm ON tm.teamId = t.teamId
          WHERE t.taskId = ?
        `, [params.taskId]);
        const replayTeam = queryOne(db, `
          SELECT * FROM teams WHERE teamId = ?
        `, [trow.teamId]) as Team;
        const replayTask: Task = {
          taskId: trow.taskId,
          auctionId: trow.auctionId,
          teamId: trow.teamId,
          teamName: trow.teamName ?? undefined,
          finalBid: trow.finalBid,
          question: trow.question ?? undefined,
          defaultReward: taskDefault,
          questionId: trow.questionId ?? undefined,
          options: parseOptionsJson(trow.options ?? null),
          startAt: trow.startAt,
          endAt: trow.endAt,
          status: trow.status,
          result: recorded.result,
          created_at: trow.created_at,
        };
        return {
          task: replayTask,
          team: replayTeam,
          appliedReward: recorded.rewardPoints as number,
          appliedDeduction: recorded.coinsDeducted as number,
        };
      }

      // Fresh verdict: task row must be decidable…
      if (!trow || (trow.status !== "active" && trow.status !== "ended")) {
        throw new Error("Cannot mark result: no decidable task");
      }
      // …and authorized: live task phase, or idle re-verdict after undo.
      const livePath = stateManager.getPhase() === "task" &&
        stateManager.getTaskId() === params.taskId &&
        this.activeTask?.taskId === params.taskId;
      const reVerdictPath = stateManager.getPhase() === "idle" && trow.status === "ended";
      if (!livePath && !reVerdictPath) {
        throw new Error("Cannot mark result: no active task");
      }

      const team = queryOne(db, `
        SELECT * FROM teams WHERE teamId = ?
      `, [trow.teamId]);
      if (!team) {
        throw new Error("Team not found");
      }

      const prevReward = team.reward_points as number;
      const prevCoins = team.bid_coins as number;
      const appliedReward = params.result === "pass" ? wantReward : 0;
      // Coins are NOT touched here: the winner already paid finalBid at
      // auction end. FAIL only denies points.
      const appliedDeduction = 0;
      const decidedAt = Date.now();

      run(db, "BEGIN IMMEDIATE");
      try {
        // Result row FIRST: any constraint failure aborts with zero mutation.
        try {
          run(db, `
            INSERT INTO task_results
              (resultId, taskId, result, rewardPoints, coinsDeducted, prevReward, prevCoins, decidedAt, undone)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
          `, [uuidv4(), params.taskId, params.result, appliedReward, appliedDeduction, prevReward, prevCoins, decidedAt]);
        } catch (err: any) {
          if (/UNIQUE constraint failed/i.test(err?.message || "")) {
            throw new Error("Result already recorded for this task");
          }
          throw err;
        }
        // Verdicts move only reward points — the win payment happened at
        // auction end and stands regardless of pass/fail.
        if (params.result === "pass") {
          run(db, `
            UPDATE teams SET reward_points = reward_points + ? WHERE teamId = ?
          `, [appliedReward, team.teamId]);
        }
        run(db, `
          UPDATE tasks SET status = 'completed', result = ? WHERE taskId = ?
        `, [params.result, params.taskId]);
        run(db, "COMMIT");
      } catch (err) {
        try { run(db, "ROLLBACK"); } catch { /* already clean */ }
        throw err;
      }
      persistDb();

      const version = Date.now();
      const finished: Task = {
        taskId: trow.taskId,
        auctionId: trow.auctionId,
        teamId: trow.teamId,
        finalBid: trow.finalBid,
        startAt: trow.startAt,
        endAt: trow.endAt,
        status: "completed",
        result: params.result,
        version,
        created_at: trow.created_at,
      };
      if (livePath) {
        this.activeTask = null;
        this.stopTaskTimer();
        stateManager.taskResolved(params.taskId);
      }

      const updatedTeam = queryOne(db, `
        SELECT * FROM teams WHERE teamId = ?
      `, [team.teamId]) as Team;

      return { task: finished, team: updatedTeam, appliedReward, appliedDeduction };
    });
  }

  /**
   * Revert the most recently recorded (non-undone) result, if it is
   * still inside the undo window. Restores exact pre-result balances.
   * Only allowed while idle — never mid-auction or mid-task. Repeat
   * undos are rejected: an undone result can't be undone again.
   */
  async undo(taskId?: string): Promise<{ taskId: string; result: TaskResultDecision; team: Team }> {
    return this.withLock(async () => {
      if (stateManager.getPhase() !== "idle") {
        throw new Error("Undo only allowed while idle (no auction or task running)");
      }

      const db = await getDb();
      const row = taskId
        ? queryOne(db, `
            SELECT * FROM task_results WHERE taskId = ? AND undone = 0
            ORDER BY decidedAt DESC LIMIT 1
          `, [taskId])
        : queryOne(db, `
            SELECT * FROM task_results WHERE undone = 0
            ORDER BY decidedAt DESC LIMIT 1
          `);
      if (!row) {
        throw new Error("Nothing to undo");
      }
      if (Date.now() - (row.decidedAt as number) > UNDO_WINDOW_MS) {
        throw new Error("Undo window expired (30s)");
      }

      const taskRow = queryOne(db, `
        SELECT teamId FROM tasks WHERE taskId = ?
      `, [row.taskId]);
      if (!taskRow) {
        throw new Error("Task not found");
      }

      run(db, "BEGIN IMMEDIATE");
      try {
        run(db, `
          UPDATE teams SET reward_points = ?, bid_coins = ? WHERE teamId = ?
        `, [row.prevReward, row.prevCoins, taskRow.teamId]);
        run(db, `
          UPDATE task_results SET undone = 1 WHERE resultId = ?
        `, [row.resultId]);
        // Return the task to a decidable state so the admin can
        // re-submit the verdict (no dead end).
        run(db, `
          UPDATE tasks SET status = 'ended', result = NULL WHERE taskId = ?
        `, [row.taskId]);
        run(db, "COMMIT");
      } catch (err) {
        try { run(db, "ROLLBACK"); } catch { /* already clean */ }
        throw err;
      }
      persistDb();

      const team = queryOne(db, `
        SELECT * FROM teams WHERE teamId = ?
      `, [taskRow.teamId]) as Team;

      return { taskId: row.taskId as string, result: row.result as TaskResultDecision, team };
    });
  }

  /** Snapshot for reconnects and the public REST endpoint. */
  async getTaskState(): Promise<{
    phase: "idle" | "auction" | "task";
    task: (Task & { timeLeft: number }) | null;
  }> {
    const t = this.activeTask;
    if (!t) return { phase: stateManager.getPhase(), task: null };
    const timeLeft = t.paused
      ? this.pausedRemaining
      : Math.max(0, Math.ceil((t.endAt - Date.now()) / 1000));
    return {
      phase: stateManager.getPhase(),
      task: { ...t, timeLeft },
    };
  }

  /**
   * Boot reconciliation: a restart kills the in-memory task timer.
   * Stale 'active' tasks become 'ended' — the admin can still resolve
   * them, matching the delayed-result tolerance.
   */
  async reconcileOnBoot(): Promise<number> {
    const db = await getDb();
    const stale = queryAll(db, `
      SELECT taskId FROM tasks WHERE status = 'active'
    `);
    for (const row of stale) {
      run(db, `
        UPDATE tasks SET status = 'ended' WHERE taskId = ?
      `, [row.taskId]);
    }
    if (stale.length > 0) {
      console.warn(`[Task] Reconciled ${stale.length} stale active task(s) from before restart.`);
      persistDb();
    }
    return stale.length;
  }
}

export const taskService = new TaskService();
