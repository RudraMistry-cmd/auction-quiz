import { Server, Socket } from "socket.io";
import fs from "fs";
import path from "path";
import { teamService } from "../services/team.service";
import { teamPoolService } from "../services/team-pool.service";
import { auctionService } from "../services/auction.service";
import { taskService } from "../services/task.service";
import { questionService } from "../services/question.service";
import { stateManager } from "../services/phase.service";
import { timerEngineService } from "../services/timer-engine.service";
import { manualTimerService } from "../services/manual-timer.service";
import { ADMIN_SECRET, ALLOW_REMOTE_ADMIN, isLocalOrHostIp } from "../auth";
import { getDb, persistDb } from "../db/database";
import type { ServerEvents, ClientEvents, FullSyncState } from "../types";

function queryOne(db: any, sql: string, params: any[] = []): any | undefined {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : undefined;
  stmt.free();
  return row;
}

function run(db: any, sql: string, params: any[] = []): void {
  db.run(sql, params);
}

const AUCTION_CONFIG = {
  startBid: 50,
  increment: 10,
  duration: 60,
};

export function setupSocketHandlers(io: Server) {
  const socketTeamMap = new Map<string, string>();
  let currentTheme = "default"; // Server-stored theme state

  const resetManualTimer = () => {
    const s = manualTimerService.reset();
    io.emit("manual_timer:update", s);
  };

  let autoResetTimer: NodeJS.Timeout | null = null;
  const scheduleAutoReset = (delayMs: number = 5000) => {
    if (autoResetTimer) clearTimeout(autoResetTimer);
    autoResetTimer = setTimeout(async () => {
      try {
        stateManager.resetRound();
        auctionService.resetAuction();
        taskService.resetTask();
        timerEngineService.resetAll();
        io.emit("system:reset");
        io.emit("phase:changed", stateManager.getGameState());
        await broadcastFullState();
        console.log("[AutoReset] system:reset triggered: round returned to idle after 5s result display");
      } catch (e) {
        console.error("[AutoReset] Failed to execute system:reset:", e);
      }
    }, delayMs);
  };

  const getFullSyncState = async (): Promise<FullSyncState> => {
    const gameState = stateManager.getGameState();
    const timers = timerEngineService.getTimers();
    const manualTimer = manualTimerService.getState();
    const scoreboard = await teamService.getScoreboard();
    const activeAuction = auctionService.getActiveAuction();
    const taskState = await taskService.getTaskState();

    return {
      phase: gameState.phase,
      currentBid: stateManager.getCurrentBid(),
      leadingTeam: stateManager.getLeadingTeam(),
      winningTeam: stateManager.getWinningTeam(),
      timers: {
        bidding: timers.biddingTimer,
        main: timers.mainTaskTimer,
        side: timers.explicitTimer,
        explicit: timers.explicitTimer,
        auctionTimer: timers.auctionTimer,
        taskTimer: timers.taskTimer,
        extraTimer: timers.extraTimer,
        manual: manualTimer,
      },
      scoreboard: scoreboard as any,
      currentQuestion: stateManager.getCurrentQuestion(),
      activeAuction: activeAuction || null,
      activeTask: taskState.task || null,
      taskTimer: taskState.task ? taskState.task.timeLeft : undefined,
      theme: currentTheme,
      resultsReveal: stateManager.getResultsReveal(),
    };
  };

  const broadcastFullState = async () => {
    try {
      const state = await getFullSyncState();
      io.emit("state:full", state);
    } catch (err) {
      console.error("[Socket] Failed to broadcast state:full:", err);
    }
  };

  io.on("connection", (socket: Socket) => {
    const clientIp = socket.handshake.address;
    const isHost = isLocalOrHostIp(clientIp);
    const authSecret = socket.handshake.auth?.secret || socket.handshake.auth?.adminSecret;

    // Verify admin on connection handshake if secret was supplied
    if (authSecret === ADMIN_SECRET && (isHost || ALLOW_REMOTE_ADMIN)) {
      socket.data.isAdmin = true;
      console.log(`[Socket] Admin verified on handshake: ${socket.id} (${clientIp})`);
    } else {
      socket.data.isAdmin = false;
    }

    console.log(`[Socket] Client connected: ${socket.id} (ip: ${clientIp}, isAdmin: ${!!socket.data.isAdmin})`);

    // Send current theme and game state to new client immediately
    socket.emit("theme:changed", { theme: currentTheme });
    socket.emit("phase:changed", stateManager.getGameState());
    socket.emit("timer:update", timerEngineService.getTimers() as any);
    socket.emit("manual_timer:update", manualTimerService.getState());

    // Send proactive full state to newly connected client
    getFullSyncState().then((fullState) => {
      socket.emit("state:full", fullState);
    }).catch((err) => console.error("[Socket] Failed to send state:full on connect:", err));

    // Handle explicit state requests (e.g. on client reconnect)
    socket.on("state:request", async (cb) => {
      try {
        const fullState = await getFullSyncState();
        socket.emit("state:full", fullState);
        cb?.(fullState);
      } catch (err) {
        console.error("[Socket] state:request failed:", err);
      }
    });

    socket.on("client:register", async (data, cb) => {
      try {
        const result = await teamService.register(data);
        if ("error" in result) {
          cb({ success: false, error: result.error });
          return;
        }

        const { team, sessionToken } = result;
        socketTeamMap.set(socket.id, team.teamId);
        socket.data.teamId = team.teamId;

        cb({ success: true, team, sessionToken });
        console.log(`[Team] Registered: ${team.teamName} (${team.teamId})`);
      } catch (err) {
        console.error("[Socket] client:register failed:", err);
        cb({ success: false, error: "Registration failed. Please try again." });
      }
    });

    socket.on("client:reconnect", async (data, cb) => {
      try {
        const team = await teamService.validateSession(data.sessionToken);
        if (!team) {
          cb({ success: false, error: "Invalid session token" });
          return;
        }

        socketTeamMap.set(socket.id, team.teamId);
        socket.data.teamId = team.teamId;

        const activeAuction = auctionService.getActiveAuction();
        let timer: number | undefined;
        let currentBid: number | undefined;

        if (activeAuction) {
          timer = Math.max(0, Math.ceil((activeAuction.endAt - Date.now()) / 1000));
          currentBid = await auctionService.getCurrentBid(activeAuction.auctionId);
        }

        const taskState = await taskService.getTaskState();
        const gameState = stateManager.getGameState();

        // Display separation: team sockets never receive question content
        // (no activeQuestion / upcomingQuestion). Teams see only balances,
        // bids and timers. Projector/admin screens use the public snapshot.
        cb({
          success: true,
          team,
          currentAuction: activeAuction || undefined,
          currentBid,
          timer,
          phase: gameState.phase,
          gameState,
          activeTask: taskState.task || undefined,
          taskTimer: taskState.task ? taskState.task.timeLeft : undefined,
        });

        console.log(`[Team] Reconnected: ${team.teamName}`);
      } catch (err) {
        console.error("[Socket] client:reconnect failed:", err);
        cb({ success: false, error: "Reconnect failed. Please try again." });
      }
    });

    socket.on("client:restore_session", async (data, cb) => {
      try {
        let team: any = null;
        let sessionToken: string | undefined = data?.sessionToken;

        // 1. Primary Device Lock: Find team mapped to deviceId
        if (data?.deviceId) {
          const deviceResult = await teamService.getTeamByDevice(data.deviceId);
          if (deviceResult) {
            team = deviceResult.team;
            sessionToken = deviceResult.sessionToken;
          }
        }

        // 2. Fallback: Find team by sessionToken
        if (!team && sessionToken) {
          team = await teamService.validateSession(sessionToken);
        }

        if (!team) {
          cb({ success: false, registered: false, error: "No active session for this device" });
          return;
        }

        socketTeamMap.set(socket.id, team.teamId);
        socket.data.teamId = team.teamId;

        const activeAuction = auctionService.getActiveAuction();
        let timer: number | undefined;
        let currentBid: number | undefined;

        if (activeAuction) {
          timer = Math.max(0, Math.ceil((activeAuction.endAt - Date.now()) / 1000));
          currentBid = await auctionService.getCurrentBid(activeAuction.auctionId);
        }

        const taskState = await taskService.getTaskState();
        const gameState = stateManager.getGameState();

        cb({
          success: true,
          registered: true,
          team,
          sessionToken,
          currentAuction: activeAuction || undefined,
          currentBid,
          timer,
          phase: gameState.phase,
          gameState,
          activeTask: taskState.task || undefined,
          taskTimer: taskState.task ? taskState.task.timeLeft : undefined,
        });

        console.log(`[Team] Session restored for: ${team.teamName} (Device: ${data?.deviceId || "token"})`);
      } catch (err) {
        console.error("[Socket] client:restore_session failed:", err);
        cb({ success: false, registered: false, error: "Failed to restore session." });
      }
    });

    socket.on("admin:reset_team_pool", async (_data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const stats = await teamPoolService.resetPool();
        io.emit("team_pool:update", stats as any);
        cb({ success: true, stats });
      } catch (err: any) {
        cb({ success: false, error: err.message || "Failed to reset pool" });
      }
    });

    socket.on("admin:get_team_pool", async (cb) => {
      try {
        const stats = await teamPoolService.getPoolStats();
        cb({ success: true, stats });
      } catch (err: any) {
        cb({ success: false, error: err.message || "Failed to get pool stats" });
      }
    });

    socket.on("client:place_bid", async (data, cb) => {
      try {
        const teamId = socket.data.teamId;
        if (!teamId) {
          cb({ success: false, error: "Not connected. Please reconnect." });
          return;
        }

        const result = await auctionService.placeBid(teamId, data.auctionId, data.increment);
        if (!result.success) {
          cb({ success: false, error: result.error });
          return;
        }

        const team = await teamService.getTeam(teamId);
        cb({ success: true, bid: result.bid, remainingCoins: team?.bid_coins });

        // Update stateManager current bid and leading team
        stateManager.setCurrentBid(result.bid.amount);
        stateManager.setLeadingTeam(team?.teamName || "Unknown");

        io.emit("auction:bid_update", {
          auctionId: data.auctionId,
          bid: result.bid,
          teamName: team?.teamName || "Unknown",
          increment: data.increment,
        });
        io.emit("bid:update", {
          auctionId: data.auctionId,
          bid: result.bid,
          teamName: team?.teamName || "Unknown",
          increment: data.increment,
        });

        // Sound trigger for bid (global bus: Live Display plays, others silent)
        io.emit("sound:play", { type: "bid" });
        io.emit("sound:bid_updated", {
          teamName: team?.teamName || "Unknown",
          bidAmount: result.bid.amount,
          increment: data.increment,
        });

        const scoreboard = await teamService.getScoreboard();
        io.emit("scoreboard:update", { teams: scoreboard as any });
        io.emit("scoreboard:updated", { teams: scoreboard as any });
        if (team) {
          io.emit("team:update", { team });
        }
        await broadcastFullState();

        console.log(`[Bid] ${team?.teamName} bid ${result.bid.amount} (+${data.increment}) on auction ${data.auctionId}`);
      } catch (err) {
        console.error("[Socket] client:place_bid failed:", err);
        cb({ success: false, error: "Bid failed. Please try again." });
      }
    });

    // Global sound bus relay: triggers from anywhere (admin test buttons,
    // team clients, server events) are rebroadcast here. ONLY the Live
    // Display plays audio — every other screen stays silent.
    socket.on("sound:play", (data: { type?: string; id?: string }) => {
      const type = typeof data?.type === "string" ? data.type.trim().slice(0, 32) : "";
      if (!type) return;
      const id = typeof data?.id === "string" ? data.id.slice(0, 64) : undefined;
      io.emit("sound:play", id ? { type, id } : ({ type } as { type: string; id?: string }));
    });

    socket.on("client:get_scoreboard", async (cb) => {
      try {
        const scoreboard = await teamService.getScoreboard();
        cb({ teams: scoreboard as any });
      } catch (err) {
        console.error("[Socket] client:get_scoreboard failed:", err);
        cb({ teams: [] });
      }
    });

    socket.on("client:get_game_state", (cb) => {
      try {
        cb({ success: true, gameState: stateManager.getGameState() });
      } catch (err: any) {
        cb({ success: false, error: err.message });
      }
    });

    const requireAdmin = (cb?: (res: any) => void): boolean => {
      if (!socket.data.isAdmin) {
        console.warn(`[Socket] Blocked unauthorized admin action from ${socket.id}`);
        cb?.({ success: false, error: "Unauthorized: Admin access required" });
        return false;
      }
      return true;
    };

    socket.on("admin:auth", (data, cb) => {
      const clientIp = socket.handshake.address;
      const isHost = isLocalOrHostIp(clientIp);

      if (!isHost && !ALLOW_REMOTE_ADMIN) {
        console.warn(`[Socket] Rejected admin auth from non-host IP: ${clientIp}`);
        socket.data.isAdmin = false;
        cb({ success: false, error: "Admin access allowed only from localhost or host IP" });
        return;
      }

      if (!data || data.secret !== ADMIN_SECRET) {
        console.warn(`[Socket] Rejected admin auth: invalid secret from ${clientIp}`);
        socket.data.isAdmin = false;
        cb({ success: false, error: "Invalid admin secret" });
        return;
      }

      socket.data.isAdmin = true;
      console.log(`[Socket] Admin session verified: ${socket.id} (${clientIp})`);
      cb({ success: true });
    });

    socket.on("admin:submit_result", async (data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const r = await taskService.submitResult(data);
        const scoreboard = (await teamService.getScoreboard()) as any;
        io.emit("task:result", {
          taskId: r.task.taskId,
          result: r.task.result as "pass" | "fail",
          teamId: r.team.teamId,
          teamName: r.team.teamName,
          coins: r.team.bid_coins,
          rewardPoints: r.team.reward_points,
          rewardGranted: r.appliedReward,
          coinsDeducted: r.appliedDeduction,
        });
        io.emit("result:declared", {
          result: r.task.result as "pass" | "fail",
          teamName: r.team.teamName,
          points: r.appliedReward,
        });
        io.emit("sound:task_result", { result: r.task.result as "pass" | "fail" });
        io.emit("sound:play", { type: r.task.result === "pass" ? "pass" : "fail" });
        io.emit("scoreboard:updated", { teams: scoreboard });
        scheduleAutoReset();
        cb({ success: true, task: r.task as any, team: r.team as any });
        console.log(`[Task] Result recorded: ${r.task.taskId} → ${r.task.result} (${r.team.teamName})`);
      } catch (err: any) {
        console.error("[Socket] admin:submit_result failed:", err);
        cb({ success: false, error: err.message || "Failed to record result." });
      }
    });

    socket.on("admin:get_images", async (cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const questionsDir = path.join(__dirname, "../../../questions");
        const images: { name: string; path: string; folder: string; used: boolean }[] = [];
        const allowedExtensions = [".png", ".jpg", ".jpeg", ".webp"];
        
        const scanDir = (dir: string, relativePath: string) => {
          if (!fs.existsSync(dir)) return;
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              scanDir(fullPath, path.join(relativePath, entry.name));
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase();
              if (allowedExtensions.includes(ext)) {
                const imgPath = path.join(relativePath, entry.name).replace(/\\/g, "/");
                images.push({
                  name: entry.name,
                  path: imgPath,
                  folder: relativePath || ".",
                  used: stateManager.isImageUsed(imgPath),
                });
              }
            }
          }
        };
        
        scanDir(questionsDir, "");
        cb({ success: true, images });
      } catch (err: any) {
        console.error("[Socket] admin:get_images failed:", err);
        cb({ success: false, error: err.message || "Failed to scan images." });
      }
    });

    socket.on("admin:set_question_image", async (data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        if (!data || !data.imagePath) {
          cb({ success: false, error: "Missing imagePath" });
          return;
        }
        
        const allowedExtensions = [".png", ".jpg", ".jpeg", ".webp"];
        const ext = path.extname(data.imagePath).toLowerCase();
        if (!allowedExtensions.includes(ext)) {
          cb({ success: false, error: `Invalid image format. Allowed: ${allowedExtensions.join(", ")}` });
          return;
        }
        
        // Normalize and validate path (prevent directory traversal)
        const normalizedPath = path.normalize(data.imagePath).replace(/\\/g, "/");
        if (normalizedPath.includes("..")) {
          cb({ success: false, error: "Invalid image path" });
          return;
        }
        
        // Verify file exists
        const fullPath = path.join(__dirname, "../../../questions", normalizedPath);
        if (!fs.existsSync(fullPath)) {
          cb({ success: false, error: "Image file not found" });
          return;
        }
        
        stateManager.setQuestionImage(normalizedPath);
        stateManager.markImageUsed(normalizedPath);
        io.emit("question:image_set", { imagePath: normalizedPath });
        cb({ success: true, imagePath: normalizedPath });
        console.log(`[Image] Question image set: ${normalizedPath}`);
      } catch (err: any) {
        console.error("[Socket] admin:set_question_image failed:", err);
        cb({ success: false, error: err.message || "Failed to set image." });
      }
    });

    socket.on("admin:task_pause", async (data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const r = await taskService.pauseTask(data.taskId);
        io.emit("task:paused", { taskId: r.task.taskId, timeLeft: r.timeLeft, version: taskService.getVersion() });
        cb({ success: true, taskId: r.task.taskId, timeLeft: r.timeLeft, paused: true });
        console.log(`[Task] Paused: ${r.task.taskId} (${r.timeLeft}s left)`);
      } catch (err: any) {
        cb({ success: false, error: err.message || "Pause failed." });
      }
    });

    socket.on("admin:task_resume", async (data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const r = await taskService.resumeTask(data.taskId);
        beginTaskCountdown(r.task.taskId);
        io.emit("task:resumed", { taskId: r.task.taskId, timeLeft: r.timeLeft, version: taskService.getVersion() });
        io.emit("task:timer", { taskId: r.task.taskId, timeLeft: r.timeLeft, version: taskService.getVersion() });
        cb({ success: true, taskId: r.task.taskId, timeLeft: r.timeLeft, paused: false });
        console.log(`[Task] Resumed: ${r.task.taskId} (${r.timeLeft}s left)`);
      } catch (err: any) {
        cb({ success: false, error: err.message || "Resume failed." });
      }
    });

    socket.on("admin:task_adjust", async (data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const r = await taskService.adjustTask(data.taskId, data.seconds);
        if (!r.task.paused) beginTaskCountdown(r.task.taskId);
        io.emit("task:timer", { taskId: r.task.taskId, timeLeft: r.timeLeft, version: taskService.getVersion() });
        cb({ success: true, taskId: r.task.taskId, timeLeft: r.timeLeft, revived: r.revived });
        console.log(`[Task] Adjusted: ${r.task.taskId} (${r.timeLeft}s left${r.revived ? ", revived" : ""})`);
      } catch (err: any) {
        cb({ success: false, error: err.message || "Adjust failed." });
      }
    });

    socket.on("admin:task_start", async (data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const r = await taskService.restartTask(data.taskId);
        beginTaskCountdown(r.task.taskId);
        const timeLimit = r.task.time_limit || r.timeLeft;
        if (r.task.questionId) {
          await questionService.markQuestionUsed(r.task.questionId);
        }
        io.emit("task:started", {
          time_limit: timeLimit,
          endAt: r.task.endAt,
          taskId: r.task.taskId,
        });
        io.emit("task:resumed", { taskId: r.task.taskId, timeLeft: r.timeLeft, version: taskService.getVersion() });
        io.emit("task:timer", { taskId: r.task.taskId, timeLeft: r.timeLeft, version: taskService.getVersion() });
        cb({ success: true, taskId: r.task.taskId, timeLeft: r.timeLeft, paused: false });
        console.log(`[Task] (Re)started: ${r.task.taskId} (countdown: ${r.timeLeft}s)`);
      } catch (err: any) {
        cb({ success: false, error: err.message || "Start failed." });
      }
    });

    socket.on("admin:update_team", async (data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        if (!data?.teamId) {
          cb({ success: false, error: "teamId is required" });
          return;
        }
        const db = await getDb();
        const row = queryOne(db, `SELECT * FROM teams WHERE teamId = ?`, [data.teamId]);
        if (!row) {
          cb({ success: false, error: "Team not found" });
          return;
        }
        const updates: string[] = [];
        const params: any[] = [];
        if (data.bid_coins !== undefined) {
          if (!Number.isInteger(data.bid_coins) || data.bid_coins < 0) {
            cb({ success: false, error: "bid_coins must be an integer >= 0" });
            return;
          }
          updates.push("bid_coins = ?");
          params.push(data.bid_coins);
        }
        if (data.reward_points !== undefined) {
          if (!Number.isInteger(data.reward_points) || data.reward_points < 0) {
            cb({ success: false, error: "reward_points must be an integer >= 0" });
            return;
          }
          updates.push("reward_points = ?");
          params.push(data.reward_points);
        }
        if (updates.length === 0) {
          cb({ success: false, error: "No fields to update" });
          return;
        }
        params.push(data.teamId);
        run(db, `UPDATE teams SET ${updates.join(", ")} WHERE teamId = ?`, params);
        persistDb();
        const updated = queryOne(db, `SELECT * FROM teams WHERE teamId = ?`, [data.teamId]);
        console.log(`[Admin] Updated team ${row.teamName}: ${updates.join(", ")} → [${params.slice(0, -1).join(", ")}]`);
        const scoreboard = await teamService.getScoreboard();
        io.emit("scoreboard:update", { teams: scoreboard as any });
        io.emit("scoreboard:updated", { teams: scoreboard as any });
        if (updated) {
          io.emit("team:update", { team: updated });
        }
        await broadcastFullState();
        cb({ success: true, team: updated });
      } catch (err: any) {
        console.error("[Socket] admin:update_team failed:", err);
        cb({ success: false, error: err.message || "Update failed." });
      }
    });

    // Manual timer control — admin-only countdown
    socket.on("admin:timer_set_duration", async (data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const s = Math.max(0, Math.round(data?.duration ?? 0));
        const state = manualTimerService.setDuration(s);
        io.emit("manual_timer:update", state);
        cb({ success: true, ...state });
        console.log(`[Timer] Duration set: ${s}s`);
      } catch (err: any) {
        cb({ success: false, error: err.message || "Failed" });
      }
    });

    socket.on("admin:timer_start", async (data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        if (manualTimerService.getState().isRunning) {
          return cb({ success: true, ...manualTimerService.getState() });
        }
        const dur = typeof data?.duration === "number" && data.duration > 0 ? data.duration : undefined;
        const state = manualTimerService.start(dur);
        io.emit("manual_timer:update", state);
        io.emit("sound:timer_started");
        cb({ success: true, ...state });
        console.log(`[Timer] Started (${state.timeLeft}s left)`);
      } catch (err: any) {
        cb({ success: false, error: err.message || "Failed" });
      }
    });

    socket.on("admin:timer_pause", async (_data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const state = manualTimerService.pause();
        io.emit("manual_timer:update", state);
        io.emit("sound:timer_stopped");
        io.emit("sound:play", { type: "timer_end" });
        cb({ success: true, ...state });
        console.log(`[Timer] Paused (${state.timeLeft}s left)`);
      } catch (err: any) {
        cb({ success: false, error: err.message || "Failed" });
      }
    });

    socket.on("admin:timer_reset", async (_data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const state = manualTimerService.reset();
        io.emit("manual_timer:update", state);
        io.emit("sound:timer_stopped");
        io.emit("sound:play", { type: "timer_end" });
        cb({ success: true, ...state });
        console.log(`[Timer] Reset`);
      } catch (err: any) {
        cb({ success: false, error: err.message || "Failed" });
      }
    });

    socket.on("admin:timer_stop", async (_data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const state = manualTimerService.stop();
        io.emit("manual_timer:update", state);
        io.emit("sound:timer_stopped");
        io.emit("sound:play", { type: "timer_end" });
        cb({ success: true, ...state });
        console.log(`[Timer] Stopped`);
      } catch (err: any) {
        cb({ success: false, error: err.message || "Failed" });
      }
    });

    socket.on("admin:timer_adjust", async (data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const s = Math.round(data?.seconds ?? 0);
        if (s === 0) { cb({ success: false, error: "Non-zero seconds required" }); return; }
        const state = manualTimerService.adjust(s);
        io.emit("manual_timer:update", state);
        cb({ success: true, ...state });
        console.log(`[Timer] Adjusted ${s > 0 ? "+" : ""}${s}s → ${state.timeLeft}s left`);
      } catch (err: any) {
        cb({ success: false, error: err.message || "Failed" });
      }
    });

    socket.on("admin:sound_settings", async (data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const enabled = data?.enabled ?? true;
        const volume = Math.max(0, Math.min(100, data?.volume ?? 100));
        io.emit("sound:settings", { enabled, volume });
        cb({ success: true });
        console.log(`[Sound] Settings updated: enabled=${enabled}, volume=${volume}%`);
      } catch (err: any) {
        cb({ success: false, error: err.message || "Failed" });
      }
    });

    socket.on("admin:sound_per_setting", async (data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const { soundName, enabled } = data ?? {};
        if (!soundName || typeof enabled !== "boolean") {
          cb({ success: false, error: "Missing soundName or enabled" });
          return;
        }
        io.emit("sound:per_setting", { soundName, enabled });
        cb({ success: true });
        console.log(`[Sound] Per-sound setting: ${soundName}=${enabled}`);
      } catch (err: any) {
        cb({ success: false, error: err.message || "Failed" });
      }
    });

    socket.on("admin:theme", async (data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const { theme } = data ?? {};
        if (!theme || !["default", "bidforc"].includes(theme)) {
          cb({ success: false, error: "Invalid theme" });
          return;
        }
        currentTheme = theme; // Store in server memory
        io.emit("theme:changed", { theme });
        await broadcastFullState();
        cb({ success: true });
        console.log(`[Theme] Theme changed to: ${theme}`);
      } catch (err: any) {
        cb({ success: false, error: err.message || "Failed" });
      }
    });

    // ─── Final Results Reveal (admin-controlled, independent of round phase) ───
    socket.on("admin:set_winner_count", async (data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const count = Number(data?.count);
        if (!Number.isFinite(count)) {
          cb({ success: false, error: "Invalid winner count" });
          return;
        }
        const winnerCount = stateManager.setWinnerCount(count);
        const revealed = stateManager.getResultsReveal().revealed;
        io.emit("results:changed", { winnerCount, revealed });
        cb({ success: true, winnerCount });
        console.log(`[Results] Winner count set to ${winnerCount}`);
      } catch (err: any) {
        cb({ success: false, error: err.message || "Failed" });
      }
    });

    socket.on("admin:reveal_results", async (_data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        stateManager.setResultsRevealed(true);
        const { winnerCount } = stateManager.getResultsReveal();
        io.emit("results:changed", { winnerCount, revealed: true });
        cb({ success: true });
        console.log(`[Results] Final results revealed (top ${winnerCount})`);
      } catch (err: any) {
        cb({ success: false, error: err.message || "Failed" });
      }
    });

    socket.on("admin:hide_results", async (_data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        stateManager.setResultsRevealed(false);
        const { winnerCount } = stateManager.getResultsReveal();
        io.emit("results:changed", { winnerCount, revealed: false });
        cb({ success: true });
        console.log(`[Results] Reverted to live scoreboard`);
      } catch (err: any) {
        cb({ success: false, error: err.message || "Failed" });
      }
    });

    // ─── Phase & Transition Handlers ───
    socket.on("admin:start_auction", async (_data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const curQ = stateManager.getCurrentQuestion();
        if (!curQ) {
          cb({ success: false, error: "Please select a question before starting auction." });
          return;
        }
        await auctionControl.startAuction();
        cb({ success: true });
      } catch (err: any) {
        console.error("[Socket] admin:start_auction failed:", err);
        cb({ success: false, error: err.message || "Failed to start auction." });
      }
    });

    socket.on("admin:get_manifest", async (_data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const questions = stateManager.getManifest();
        const currentQuestion = stateManager.getCurrentQuestion();
        cb({ success: true, questions, currentQuestion });
      } catch (err: any) {
        cb({ success: false, questions: [], currentQuestion: null, error: err.message });
      }
    });

    socket.on("admin:select_question", async (data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        if (!data?.questionId) {
          cb({ success: false, error: "Missing questionId" });
          return;
        }
        const q = stateManager.selectQuestion(data.questionId);
        if (!q) {
          cb({ success: false, error: "Question not found in manifest" });
          return;
        }
        io.emit("question:image_set", { imagePath: q.image, question: q });
        io.emit("question:changed", { question: q, imagePath: q.image });
        io.emit("phase:changed", stateManager.getGameState());
        await broadcastFullState();
        cb({ success: true, question: q });
      } catch (err: any) {
        cb({ success: false, error: err.message || "Failed to select question" });
      }
    });

    // ─── Flow Control Handlers (Task Timer, Extra Timer, Results) ───

    socket.on("admin:start_task_timer", async (data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const winner = stateManager.getWinningTeam();
        if (!winner) {
          cb({ success: false, error: "No team has won the bid" });
          return;
        }
        const curPhase = stateManager.getPhase();
        if (curPhase !== "post_bid_idle" && curPhase !== "main_task") {
          cb({ success: false, error: `Cannot start task timer in phase '${curPhase}'` });
          return;
        }
        const activeTask = taskService.getActiveTask();
        if (!activeTask) {
          cb({ success: false, error: "No active task available" });
          return;
        }

        const curQ = stateManager.getCurrentQuestion();
        const duration = (data?.duration && data.duration > 0)
          ? data.duration
          : (curQ?.time || activeTask.time_limit || 60);

        stateManager.startMainTaskPhase(activeTask.taskId);

        const timer = timerEngineService.startMainTask(duration, () => {
          io.emit("timer:end", { timerType: "task" });
          io.emit("sound:timer_stopped");
          io.emit("sound:play", { type: "timer_end" });
          io.emit("task:ended", { taskId: activeTask.taskId });
          io.emit("task:end", { taskId: activeTask.taskId });
        });

        io.emit("timer:task:start", {
          startTime: timer.startTime,
          duration: timer.duration,
          remaining: timer.remaining,
          label: timer.label,
        });
        io.emit("timer:main:start", {
          startTime: timer.startTime,
          duration: timer.duration,
          remaining: timer.remaining,
        });
        io.emit("task:started", {
          time_limit: timer.duration,
          endAt: Date.now() + timer.duration * 1000,
          taskId: activeTask.taskId,
          teamName: activeTask.teamName,
          reward: curQ?.reward,
          questionImage: curQ?.image,
        });
        io.emit("task:start", {
          taskId: activeTask.taskId,
          teamName: activeTask.teamName,
          time_limit: timer.duration,
        });
        io.emit("sound:timer_started");
        io.emit("phase:changed", stateManager.getGameState());
        io.emit("timer:update", timerEngineService.getTimers() as any);
        await broadcastFullState();
        cb({ success: true });
        console.log(`[Flow] Admin started task timer: ${duration}s for ${activeTask.teamName}`);
      } catch (err: any) {
        console.error("[Socket] admin:start_task_timer failed:", err);
        cb({ success: false, error: err.message || "Failed to start task timer" });
      }
    });

    socket.on("admin:pause_task_timer", async (_data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        timerEngineService.pauseMainTask();
        io.emit("timer:update", timerEngineService.getTimers() as any);
        io.emit("sound:timer_stopped");
        io.emit("sound:play", { type: "timer_end" });
        await broadcastFullState();
        cb({ success: true });
      } catch (err: any) {
        cb({ success: false, error: err.message || "Failed to pause task timer" });
      }
    });

    socket.on("admin:adjust_task_timer", async (data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const s = data?.seconds || 30;
        timerEngineService.adjustMainTask(s);
        io.emit("timer:update", timerEngineService.getTimers() as any);
        await broadcastFullState();
        cb({ success: true });
      } catch (err: any) {
        cb({ success: false, error: err.message || "Failed to adjust task timer" });
      }
    });

    socket.on("admin:stop_task_timer", async (_data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        timerEngineService.stopMainTask();
        io.emit("timer:update", timerEngineService.getTimers() as any);
        io.emit("sound:timer_stopped");
        io.emit("sound:play", { type: "timer_end" });
        await broadcastFullState();
        cb({ success: true });
      } catch (err: any) {
        cb({ success: false, error: err.message || "Failed to stop task timer" });
      }
    });

    socket.on("admin:fail_with_fallback", async (_data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        resetManualTimer();
        timerEngineService.stopMainTask();
        timerEngineService.stopExtraTimer();
        const r = await taskService.failWithFallback();
        io.emit("sound:task_result", { result: "fail" });
        io.emit("sound:play", { type: "fail" });
        io.emit("phase:changed", stateManager.getGameState());
        io.emit("timer:update", timerEngineService.getTimers() as any);
        await broadcastFullState();
        cb({ success: true });
        console.log(`[Flow] Winner failed, fallback enabled. Phase: fallback_idle`);
      } catch (err: any) {
        console.error("[Socket] admin:fail_with_fallback failed:", err);
        cb({ success: false, error: err.message || "Fail with fallback failed" });
      }
    });

    socket.on("admin:start_extra_timer", async (data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const duration = (data?.duration && data.duration > 0) ? data.duration : 60;
        const label = data?.label || "Extra Timer";
        if (stateManager.getPhase() === "fallback_idle") {
          stateManager.startFallbackActive();
        }

        const timer = timerEngineService.startExtraTimer(duration, label, () => {
          io.emit("timer:end", { timerType: "extra" });
          io.emit("sound:timer_stopped");
          io.emit("sound:play", { type: "timer_end" });
        });

        io.emit("timer:extra:start", {
          startTime: timer.startTime,
          duration: timer.duration,
          remaining: timer.remaining,
          label: timer.label,
        });
        io.emit("timer:explicit:start", {
          startTime: timer.startTime,
          duration: timer.duration,
          remaining: timer.remaining,
        });
        io.emit("timer:side:start", {
          startTime: timer.startTime,
          duration: timer.duration,
          remaining: timer.remaining,
        });
        io.emit("sound:timer_started");
        io.emit("phase:changed", stateManager.getGameState());
        io.emit("timer:update", timerEngineService.getTimers() as any);
        await broadcastFullState();
        cb({ success: true });
        console.log(`[Flow] Extra timer started (${label}, ${duration}s). Phase: fallback_active`);
      } catch (err: any) {
        console.error("[Socket] admin:start_extra_timer failed:", err);
        cb({ success: false, error: err.message || "Failed to start extra timer" });
      }
    });

    socket.on("admin:pause_extra_timer", async (_data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        timerEngineService.pauseExtraTimer();
        io.emit("timer:update", timerEngineService.getTimers() as any);
        io.emit("sound:timer_stopped");
        io.emit("sound:play", { type: "timer_end" });
        await broadcastFullState();
        cb({ success: true });
      } catch (err: any) {
        cb({ success: false, error: err.message || "Failed to pause extra timer" });
      }
    });

    socket.on("admin:adjust_extra_timer", async (data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const s = data?.seconds || 30;
        timerEngineService.adjustExtraTimer(s);
        io.emit("timer:update", timerEngineService.getTimers() as any);
        await broadcastFullState();
        cb({ success: true });
      } catch (err: any) {
        cb({ success: false, error: err.message || "Failed to adjust extra timer" });
      }
    });

    socket.on("admin:stop_extra_timer", async (_data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        timerEngineService.stopExtraTimer();
        io.emit("timer:update", timerEngineService.getTimers() as any);
        io.emit("sound:timer_stopped");
        io.emit("sound:play", { type: "timer_end" });
        await broadcastFullState();
        cb({ success: true });
      } catch (err: any) {
        cb({ success: false, error: err.message || "Failed to stop extra timer" });
      }
    });

    socket.on("admin:pass_task", async (_data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        resetManualTimer();
        timerEngineService.stopMainTask();
        timerEngineService.stopExtraTimer();
        const r = await taskService.passWinningTask();
        const scoreboard = await teamService.getScoreboard();
        io.emit("task:result", {
          taskId: r.task.taskId,
          result: "pass",
          teamId: r.team.teamId,
          teamName: r.team.teamName,
          coins: r.team.bid_coins,
          rewardPoints: r.team.reward_points,
          rewardGranted: r.appliedReward,
          coinsDeducted: 0,
        });
        io.emit("result:declared", {
          result: "pass",
          teamName: r.team.teamName,
          points: r.appliedReward,
        });
        io.emit("sound:task_result", { result: "pass" });
        io.emit("sound:play", { type: "pass" });
        io.emit("scoreboard:update", { teams: scoreboard as any });
        io.emit("scoreboard:updated", { teams: scoreboard as any });
        io.emit("team:update", { team: r.team });
        io.emit("phase:changed", stateManager.getGameState());
        io.emit("timer:update", timerEngineService.getTimers() as any);
        await broadcastFullState();
        scheduleAutoReset(5000);
        cb({ success: true });
      } catch (err: any) {
        cb({ success: false, error: err.message || "Pass failed" });
      }
    });

    socket.on("admin:fail_task", async (_data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        resetManualTimer();
        timerEngineService.stopMainTask();
        timerEngineService.stopExtraTimer();
        const r = await taskService.failWinningTask();
        io.emit("task:result", {
          taskId: r.task.taskId,
          result: "fail",
          teamId: r.winningTeam.teamId,
          teamName: r.winningTeam.teamName,
          coins: r.winningTeam.bid_coins,
          rewardPoints: r.winningTeam.reward_points,
          rewardGranted: 0,
          coinsDeducted: 0,
        });
        io.emit("result:declared", {
          result: "fail",
          teamName: r.winningTeam.teamName,
          points: 0,
        });
        io.emit("sound:task_result", { result: "fail" });
        io.emit("sound:play", { type: "fail" });
        io.emit("phase:changed", stateManager.getGameState());
        io.emit("timer:update", timerEngineService.getTimers() as any);
        await broadcastFullState();
        scheduleAutoReset(5000);
        cb({ success: true });
      } catch (err: any) {
        cb({ success: false, error: err.message || "Fail failed" });
      }
    });

    socket.on("admin:fallback_pass", async (data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        if (!data?.teamId) {
          cb({ success: false, error: "Missing teamId" });
          return;
        }
        resetManualTimer();
        timerEngineService.stopMainTask();
        timerEngineService.stopExtraTimer();
        const winner = stateManager.getWinningTeam();
        const r = await taskService.assignFallbackTeam(data.teamId);
        const scoreboard = await teamService.getScoreboard();
        io.emit("task:result", {
          taskId: r.task.taskId,
          result: "pass",
          teamId: r.fallbackTeam.teamId,
          teamName: r.fallbackTeam.teamName,
          coins: r.fallbackTeam.bid_coins,
          rewardPoints: r.fallbackTeam.reward_points,
          rewardGranted: r.rewardPoints,
          coinsDeducted: 0,
        });
        io.emit("result:declared", {
          result: "fallback_pass",
          teamName: r.fallbackTeam.teamName,
          points: r.rewardPoints,
          winningTeamName: winner?.teamName,
        });
        io.emit("sound:task_result", { result: "pass" });
        io.emit("sound:play", { type: "pass" });
        io.emit("scoreboard:update", { teams: scoreboard as any });
        io.emit("scoreboard:updated", { teams: scoreboard as any });
        io.emit("team:update", { team: r.fallbackTeam });
        io.emit("phase:changed", stateManager.getGameState());
        io.emit("timer:update", timerEngineService.getTimers() as any);
        await broadcastFullState();
        scheduleAutoReset(5000);
        cb({ success: true });
      } catch (err: any) {
        cb({ success: false, error: err.message || "Fallback pass failed" });
      }
    });

    socket.on("admin:assign_fallback", async (data, cb) => {
      // Alias to admin:fallback_pass
      if (!requireAdmin(cb)) return;
      try {
        if (!data?.teamId) {
          cb({ success: false, error: "Missing teamId" });
          return;
        }
        resetManualTimer();
        timerEngineService.stopMainTask();
        timerEngineService.stopExtraTimer();
        const winner = stateManager.getWinningTeam();
        const r = await taskService.assignFallbackTeam(data.teamId);
        const scoreboard = await teamService.getScoreboard();
        io.emit("task:result", {
          taskId: r.task.taskId,
          result: "pass",
          teamId: r.fallbackTeam.teamId,
          teamName: r.fallbackTeam.teamName,
          coins: r.fallbackTeam.bid_coins,
          rewardPoints: r.fallbackTeam.reward_points,
          rewardGranted: r.rewardPoints,
          coinsDeducted: 0,
        });
        io.emit("result:declared", {
          result: "fallback_pass",
          teamName: r.fallbackTeam.teamName,
          points: r.rewardPoints,
          winningTeamName: winner?.teamName,
        });
        io.emit("sound:task_result", { result: "pass" });
        io.emit("sound:play", { type: "pass" });
        io.emit("scoreboard:update", { teams: scoreboard as any });
        io.emit("scoreboard:updated", { teams: scoreboard as any });
        io.emit("team:update", { team: r.fallbackTeam });
        io.emit("phase:changed", stateManager.getGameState());
        io.emit("timer:update", timerEngineService.getTimers() as any);
        await broadcastFullState();
        scheduleAutoReset(5000);
        cb({ success: true });
      } catch (err: any) {
        cb({ success: false, error: err.message || "Assign fallback failed" });
      }
    });

    socket.on("admin:fallback_fail", async (_data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        resetManualTimer();
        timerEngineService.stopMainTask();
        timerEngineService.stopExtraTimer();
        const winner = stateManager.getWinningTeam();
        const r = await taskService.endFailedTaskNormally();
        io.emit("result:declared", {
          result: "fallback_fail",
          teamName: winner?.teamName || "Winning Team",
          points: 0,
        });
        io.emit("sound:task_result", { result: "fail" });
        io.emit("sound:play", { type: "fail" });
        io.emit("phase:changed", stateManager.getGameState());
        io.emit("timer:update", timerEngineService.getTimers() as any);
        await broadcastFullState();
        scheduleAutoReset(5000);
        cb({ success: true });
      } catch (err: any) {
        cb({ success: false, error: err.message || "Fallback fail failed" });
      }
    });

    socket.on("admin:end_failed_task", async (_data, cb) => {
      // Alias to admin:fallback_fail
      if (!requireAdmin(cb)) return;
      try {
        resetManualTimer();
        timerEngineService.stopMainTask();
        timerEngineService.stopExtraTimer();
        const winner = stateManager.getWinningTeam();
        const r = await taskService.endFailedTaskNormally();
        io.emit("result:declared", {
          result: "fallback_fail",
          teamName: winner?.teamName || "Winning Team",
          points: 0,
        });
        io.emit("sound:task_result", { result: "fail" });
        io.emit("sound:play", { type: "fail" });
        io.emit("phase:changed", stateManager.getGameState());
        io.emit("timer:update", timerEngineService.getTimers() as any);
        await broadcastFullState();
        scheduleAutoReset(5000);
        cb({ success: true });
      } catch (err: any) {
        cb({ success: false, error: err.message || "End failed task failed" });
      }
    });

    socket.on("admin:reset_system", async (_data, cb) => {
      if (!requireAdmin(cb)) return;
      if (autoResetTimer) clearTimeout(autoResetTimer);
      stateManager.resetRound();
      auctionService.resetAuction();
      taskService.resetTask();
      io.emit("system:reset");
      io.emit("phase:changed", stateManager.getGameState());
      await broadcastFullState();
      cb?.({ success: true });
    });

    // Explicit Timer Handlers (admin-controlled optional timer, does not mutate phase)
    socket.on("admin:explicit_timer_start", async (data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const duration = data?.duration || 60;
        const timer = timerEngineService.startExplicitTimer(duration);
        io.emit("timer:explicit:start", {
          startTime: timer.startTime,
          duration: timer.duration,
          remaining: timer.remaining,
        });
        io.emit("timer:side:start", {
          startTime: timer.startTime,
          duration: timer.duration,
          remaining: timer.remaining,
        });
        io.emit("timer:update", timerEngineService.getTimers() as any);
        cb({ success: true, timer });
      } catch (err: any) {
        cb({ success: false, error: err.message || "Explicit timer start failed" });
      }
    });

    socket.on("admin:explicit_timer_pause", async (_data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        timerEngineService.pauseExplicitTimer();
        io.emit("timer:update", timerEngineService.getTimers() as any);
        cb({ success: true });
      } catch (err: any) {
        cb({ success: false, error: err.message || "Explicit timer pause failed" });
      }
    });

    socket.on("admin:explicit_timer_adjust", async (data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const s = data?.seconds || 30;
        timerEngineService.adjustExplicitTimer(s);
        io.emit("timer:update", timerEngineService.getTimers() as any);
        cb({ success: true });
      } catch (err: any) {
        cb({ success: false, error: err.message || "Explicit timer adjust failed" });
      }
    });

    socket.on("admin:explicit_timer_stop", async (_data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        timerEngineService.stopExplicitTimer();
        io.emit("timer:update", timerEngineService.getTimers() as any);
        cb({ success: true });
      } catch (err: any) {
        cb({ success: false, error: err.message || "Explicit timer stop failed" });
      }
    });

    // Backwards-compatible side timer events
    socket.on("admin:side_timer_start", async (data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const duration = data?.duration || 60;
        const timer = timerEngineService.startExplicitTimer(duration);
        io.emit("timer:side:start", {
          startTime: timer.startTime,
          duration: timer.duration,
          remaining: timer.remaining,
        });
        io.emit("timer:explicit:start", {
          startTime: timer.startTime,
          duration: timer.duration,
          remaining: timer.remaining,
        });
        io.emit("timer:update", timerEngineService.getTimers() as any);
        cb({ success: true });
      } catch (err: any) {
        cb({ success: false, error: err.message || "Side timer start failed" });
      }
    });

    socket.on("admin:side_timer_pause", async (_data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        timerEngineService.pauseExplicitTimer();
        io.emit("timer:update", timerEngineService.getTimers() as any);
        cb({ success: true });
      } catch (err: any) {
        cb({ success: false, error: err.message || "Side timer pause failed" });
      }
    });

    socket.on("admin:side_timer_adjust", async (data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const s = data?.seconds || 30;
        timerEngineService.adjustExplicitTimer(s);
        io.emit("timer:update", timerEngineService.getTimers() as any);
        cb({ success: true });
      } catch (err: any) {
        cb({ success: false, error: err.message || "Side timer adjust failed" });
      }
    });

    socket.on("admin:end_round", async (_data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        resetManualTimer();
        stateManager.resetRound();
        io.emit("phase:changed", stateManager.getGameState());
        io.emit("timer:update", timerEngineService.getTimers() as any);
        await broadcastFullState();
        cb({ success: true });
      } catch (err: any) {
        cb({ success: false, error: err.message || "End round failed" });
      }
    });

    socket.on("disconnect", () => {
      const teamId = socketTeamMap.get(socket.id);
      console.log(`[Socket] Client disconnected: ${socket.id} (team: ${teamId || "none"})`);
      socketTeamMap.delete(socket.id);
    });
  });

  // Wire manual timer to broadcast every second
  manualTimerService.startBroadcasting((state) => {
    io.emit("manual_timer:update", state);
  });

  // Wire singleton timerEngineService to broadcast every second
  timerEngineService.setTickCallback((timers) => {
    io.emit("timer:update", timers);
  });

  // (Re)starts the authoritative per-second task ticks. Safe to call
  // redundantly — previous interval is always cleared first.
  const beginTaskCountdown = (taskId: string) => {
    taskService.startTaskTimer(
      (timeLeft) => {
        io.emit("task:timer", { taskId, timeLeft, version: taskService.getVersion() });
      },
      async () => {
        const expired = await taskService.expireTask(taskId);
        if (expired) {
          io.emit("task:ended", { taskId });
          console.log(`[Task] Timer expired: ${taskId} (awaiting admin result)`);
        }
      }
    );
  };

  const auctionControl = {
    startAuction: async (opts?: { question?: string; defaultReward?: number }) => {
      const curQ = stateManager.getCurrentQuestion();
      if (!curQ) {
        throw new Error("No question selected. Please select a question before starting auction.");
      }

      resetManualTimer();

      const auction = await auctionService.startAuction({ ...AUCTION_CONFIG, ...opts });

      io.emit("auction:started", auction);
      io.emit("auction:start", auction);
      io.emit("sound:auction_started");
      io.emit("sound:play", { type: "auction_start" });

      // Set phase to bidding and broadcast
      io.emit("phase:changed", stateManager.getGameState());

      // Start 60s bidding timer via singleton timerEngineService
      const bTimer = timerEngineService.startBidding(60, async () => {
        try {
          resetManualTimer();
          const result = await auctionService.endAuction();
          if (!result) return;

          io.emit("sound:auction_ended");
          io.emit("sound:play", { type: "auction_end" });

          if (result.winner && result.winningBid != null) {
            // BID WIN (CRITICAL FLOW)
            // On bid win:
            // 1. Stop auctionTimer (already stopped by timerEngineService)
            // 2. Set phase = post_bid_idle
            // 3. Set winningTeam
            // 4. Deduct bid coins immediately (handled inside endAuction transaction)
            // 5. DO NOT start any timer!
            try {
              const task = await taskService.assignTask({
                auctionId: result.auction.auctionId,
                teamId: result.winner.teamId,
                teamName: result.winner.teamName,
                finalBid: result.winningBid,
              });

              io.emit("auction:ended", {
                auctionId: result.auction.auctionId,
                winner: { teamId: result.winner.teamId, teamName: result.winner.teamName },
                winningBid: result.winningBid,
              });
              io.emit("auction:win", {
                winner: { teamId: result.winner.teamId, teamName: result.winner.teamName },
                winningBid: result.winningBid,
              });
              io.emit("bid:win", {
                winner: { teamId: result.winner.teamId, teamName: result.winner.teamName },
                winningBid: result.winningBid,
              });
              io.emit("sound:bid_won", {
                teamName: result.winner.teamName,
                bidAmount: result.winningBid,
              });
              io.emit("sound:play", { type: "win" });
              io.emit("task:assigned", task as any);

              const scoreboard = await teamService.getScoreboard();
              io.emit("scoreboard:update", { teams: scoreboard as any });
              io.emit("scoreboard:updated", { teams: scoreboard as any });
              const winnerTeam = await teamService.getTeam(result.winner.teamId);
              if (winnerTeam) {
                io.emit("team:update", { team: winnerTeam });
              }

              io.emit("phase:changed", stateManager.getGameState());
              io.emit("timer:update", timerEngineService.getTimers() as any);
              await broadcastFullState();
              console.log(`[Auction->PostBidIdle] ${task.teamName} won for ${task.finalBid}. Phase: post_bid_idle (no timer started)`);
            } catch (err) {
              console.error("[Auction] Task assignment failed:", err);
              stateManager.setPhase("idle");
              io.emit("phase:changed", stateManager.getGameState());
              await broadcastFullState();
            }
          } else {
            // EDGE CASE: If 60s timer expires with 0 bids:
            // - phase = "idle"
            // - do NOT start task timer
            stateManager.auctionClosedIdle(result.auction.auctionId);
            io.emit("auction:ended", {
              auctionId: result.auction.auctionId,
              winner: null,
              winningBid: null,
            });
            io.emit("phase:changed", stateManager.getGameState());
            io.emit("timer:update", timerEngineService.getTimers() as any);
            await broadcastFullState();
            console.log(`[Auction] Ended with 0 bids. Phase: idle ("No Winner")`);
          }
        } catch (err) {
          console.error("[Socket] Auction expiry handling failed:", err);
        }
      });

      io.emit("timer:auction:start", {
        startTime: bTimer.startTime,
        duration: bTimer.duration,
        remaining: bTimer.remaining,
      });

      // Backward compatible timer ticker
      auctionService.startTimer(
        (remaining) => {
          io.emit("auction:timer", { auctionId: auction.auctionId, remaining });
        },
        () => {}
      );

      io.emit("timer:update", timerEngineService.getTimers() as any);
      await broadcastFullState();
      return auction;
    },
    getFullSyncState,
    broadcastFullState,
  };

  return auctionControl;
}
