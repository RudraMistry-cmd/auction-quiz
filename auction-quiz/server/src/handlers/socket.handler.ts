import { Server, Socket } from "socket.io";
import fs from "fs";
import path from "path";
import { teamService } from "../services/team.service";
import { auctionService } from "../services/auction.service";
import { taskService } from "../services/task.service";
import { questionService } from "../services/question.service";
import { stateManager } from "../services/phase.service";
import { manualTimerService } from "../services/manual-timer.service";
import { ADMIN_SECRET, ALLOW_REMOTE_ADMIN, isLocalOrHostIp } from "../auth";
import { getDb, persistDb } from "../db/database";
import type { ServerEvents, ClientEvents } from "../types";

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

    // Send current theme to new client immediately
    socket.emit("theme:changed", { theme: currentTheme });

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

        // Display separation: team sockets never receive question content
        // (no activeQuestion / upcomingQuestion). Teams see only balances,
        // bids and timers. Projector/admin screens use the public snapshot.
        cb({
          success: true,
          team,
          currentAuction: activeAuction || undefined,
          currentBid,
          timer,
          phase: taskState.phase,
          activeTask: taskState.task || undefined,
          taskTimer: taskState.task ? taskState.task.timeLeft : undefined,
        });

        console.log(`[Team] Reconnected: ${team.teamName}`);
      } catch (err) {
        console.error("[Socket] client:reconnect failed:", err);
        cb({ success: false, error: "Reconnect failed. Please try again." });
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

        io.emit("auction:bid_update", {
          auctionId: data.auctionId,
          bid: result.bid,
          teamName: team?.teamName || "Unknown",
          increment: data.increment,
        });

        // Sound trigger for bid
        io.emit("sound:bid_updated", {
          teamName: team?.teamName || "Unknown",
          bidAmount: result.bid.amount,
          increment: data.increment,
        });

        console.log(`[Bid] ${team?.teamName} bid ${result.bid.amount} (+${data.increment}) on auction ${data.auctionId}`);
      } catch (err) {
        console.error("[Socket] client:place_bid failed:", err);
        cb({ success: false, error: "Bid failed. Please try again." });
      }
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
        io.emit("sound:task_result", { result: r.task.result as "pass" | "fail" });
        io.emit("scoreboard:updated", { teams: scoreboard });
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
        io.emit("scoreboard:updated", {
          teams: (await teamService.getScoreboard()) as any,
        });
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
        io.emit("timer:update", state);
        cb({ success: true, ...state });
        console.log(`[Timer] Duration set: ${s}s`);
      } catch (err: any) {
        cb({ success: false, error: err.message || "Failed" });
      }
    });

    socket.on("admin:timer_start", async (data, cb) => {
      if (!requireAdmin(cb)) return;
      try {
        const state = manualTimerService.start();
        io.emit("timer:update", state);
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
        io.emit("timer:update", state);
        io.emit("sound:timer_stopped");
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
        io.emit("timer:update", state);
        io.emit("sound:timer_stopped");
        cb({ success: true, ...state });
        console.log(`[Timer] Reset`);
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
        io.emit("timer:update", state);
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
        cb({ success: true });
        console.log(`[Theme] Theme changed to: ${theme}`);
      } catch (err: any) {
        cb({ success: false, error: err.message || "Failed" });
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
    io.emit("timer:update", state);
  });

  // (Re)starts the authoritative per-second task ticks. Safe to call
  // redundantly — previous interval is always cleared first.
  const beginTaskCountdown = (taskId: string) => {
    taskService.startTaskTimer(
      (timeLeft) => {
        io.emit("task:timer", { taskId, timeLeft, version: taskService.getVersion() });
      },
      async () => {
        // Emit ONLY on a real transition: a verdict recorded in the final
        // millisecond must not be followed by a stale "Time Up".
        const expired = await taskService.expireTask(taskId);
        if (expired) {
          io.emit("task:ended", { taskId });
          console.log(`[Task] Timer expired: ${taskId} (awaiting admin result)`);
        }
      }
    );
  };

  return {
    startAuction: async (opts?: { question?: string; defaultReward?: number }) => {
      const auction = await auctionService.startAuction({ ...AUCTION_CONFIG, ...opts });
      io.emit("auction:started", auction);
      io.emit("sound:auction_started");

      // The round's question goes public the moment bidding opens.
      if (auction.questionId) {
        const bankQ = await questionService.getQuestion(auction.questionId);
        if (bankQ) {
          io.emit("question:active", questionService.toPayload(bankQ));
        }
      }

      auctionService.startTimer(
        (remaining) => {
          io.emit("auction:timer", { auctionId: auction.auctionId, remaining });
        },
        async () => {
          try {
            const result = await auctionService.endAuction();
            if (!result) return;

            io.emit("auction:ended", {
              auctionId: result.auction.auctionId,
              winner: result.winner
                ? { teamId: result.winner.teamId, teamName: result.winner.teamName } as any
                : null,
              winningBid: result.winningBid,
            });

            // Sound triggers for auction end
            io.emit("sound:auction_ended");
            if (result.winner && result.winningBid != null) {
              io.emit("sound:bid_won", {
                teamName: result.winner.teamName,
                bidAmount: result.winningBid,
              });
            }

            // AUCTION_ACTIVE → TASK_ACTIVE (or back to IDLE with no winner).
            if (result.winner && result.winningBid != null) {
              try {
                const task = await taskService.assignTask({
                  auctionId: result.auction.auctionId,
                  teamId: result.winner.teamId,
                  teamName: result.winner.teamName,
                  finalBid: result.winningBid,
                });
                io.emit("task:assigned", task as any);
                console.log(`[Task] Assigned: ${task.taskId} → ${task.teamName} (finalBid ${task.finalBid})`);
                if (task.questionId) {
                  const bankQ = await questionService.getQuestion(task.questionId);
                  if (bankQ) {
                    io.emit("question:active", questionService.toPayload(bankQ, task.taskId));
                  }
                }
                const timeLimit = task.time_limit || 300;
                // Question already locked as used at auction start
                // (takeSelection) + auction end / assignTask safety nets.
                io.emit("task:started", {
                  time_limit: timeLimit,
                  endAt: task.endAt,
                  taskId: task.taskId,
                });
                io.emit("task:timer", { taskId: task.taskId, timeLeft: timeLimit, version: taskService.getVersion() });
                beginTaskCountdown(task.taskId);
              } catch (err) {
                // Never strand the machine in 'auction': fall back to idle.
                console.error("[Task] assignTask failed, closing auction to idle:", err);
                stateManager.auctionClosedIdle(result.auction.auctionId);
              }
            } else {
              stateManager.auctionClosedIdle(result.auction.auctionId);
            }
            // Auction display state is over on every path (task assigned,
            // idle fallback, or no winner). Task/question state is
            // deliberately untouched — the task phase owns screens now.
            stateManager.setQuestionImage(null);
            io.emit("auction:cleared");
          } catch (err) {
            console.error("[Socket] auction end orchestration failed:", err);
          }
        }
      );

      return auction;
    },
  };
}
