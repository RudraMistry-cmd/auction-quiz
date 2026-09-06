import { Server, Socket } from "socket.io";
import { teamService } from "../services/team.service";
import { auctionService } from "../services/auction.service";
import { taskService } from "../services/task.service";
import { questionService } from "../services/question.service";
import { stateManager } from "../services/phase.service";
import type { ServerEvents, ClientEvents } from "../types";

const AUCTION_CONFIG = {
  startBid: 50,
  increment: 10,
  duration: 60,
};

export function setupSocketHandlers(io: Server) {
  const socketTeamMap = new Map<string, string>();

  io.on("connection", (socket: Socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

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

        let activeQuestion = null;
        if (activeAuction?.questionId) {
          const bankQ = await questionService.getQuestion(activeAuction.questionId);
          if (bankQ) activeQuestion = questionService.toPayload(bankQ);
        }
        const upcoming = await questionService.getSelected();

        cb({
          success: true,
          team,
          currentAuction: activeAuction || undefined,
          currentBid,
          timer,
          phase: taskState.phase,
          activeTask: taskState.task || undefined,
          taskTimer: taskState.task ? taskState.task.timeLeft : undefined,
          activeQuestion: activeQuestion || undefined,
          upcomingQuestion: upcoming ? questionService.toPayload(upcoming) : undefined,
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

        const result = await auctionService.placeBid(teamId, data.auctionId);
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
        });

        console.log(`[Bid] ${team?.teamName} bid ${result.bid.amount} on auction ${data.auctionId}`);
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

    socket.on("admin:submit_result", async (data, cb) => {
      try {
        const r = await taskService.submitResult(data);
        const scoreboard = (await teamService.getScoreboard()) as any;
        io.emit("task:result", {
          taskId: r.task.taskId,
          result: r.task.result as "pass" | "fail",
          undone: false,
          teamId: r.team.teamId,
          teamName: r.team.teamName,
          coins: r.team.bid_coins,
          rewardPoints: r.team.reward_points,
          rewardGranted: r.appliedReward,
          coinsDeducted: r.appliedDeduction,
        });
        io.emit("scoreboard:updated", { teams: scoreboard });
        cb({ success: true, task: r.task as any, team: r.team as any });
        console.log(`[Task] Result recorded: ${r.task.taskId} → ${r.task.result} (${r.team.teamName})`);
      } catch (err: any) {
        console.error("[Socket] admin:submit_result failed:", err);
        cb({ success: false, error: err.message || "Failed to record result." });
      }
    });

    socket.on("admin:undo", async (data, cb) => {
      try {
        const r = await taskService.undo(data?.taskId);
        const scoreboard = (await teamService.getScoreboard()) as any;
        io.emit("task:result", {
          taskId: r.taskId,
          result: r.result,
          undone: true,
          teamId: r.team.teamId,
          teamName: r.team.teamName,
          coins: r.team.bid_coins,
          rewardPoints: r.team.reward_points,
          rewardGranted: 0,
          coinsDeducted: 0,
        });
        io.emit("scoreboard:updated", { teams: scoreboard });
        cb({ success: true, taskId: r.taskId, team: r.team as any });
        console.log(`[Task] Undo applied: ${r.taskId} (${r.team.teamName} balances restored)`);
      } catch (err: any) {
        console.error("[Socket] admin:undo failed:", err);
        cb({ success: false, error: err.message || "Undo failed." });
      }
    });

    socket.on("admin:get_questions", async (cb) => {
      try {
        cb(await questionService.getPools());
      } catch (err: any) {
        console.error("[Socket] admin:get_questions failed:", err);
        cb({ easy: [], medium: [], hard: [], selected: null });
      }
    });

    socket.on("admin:select_question", async (data, cb) => {
      try {
        const q = await questionService.selectQuestion(data?.questionId);
        cb({ success: true, question: q });
        // Visible to everyone immediately: bidding is never blind.
        io.emit("question:selected", questionService.toPayload(q));
        console.log(`[Bank] Selected: ${q.id} (${q.difficulty}, ${q.reward_points} pts)`);
      } catch (err: any) {
        console.error("[Socket] admin:select_question failed:", err);
        cb({ success: false, error: err.message || "Selection failed." });
      }
    });

    socket.on("admin:task_pause", async (data, cb) => {
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
      try {
        const r = await taskService.restartTask(data.taskId);
        beginTaskCountdown(r.task.taskId);
        io.emit("task:resumed", { taskId: r.task.taskId, timeLeft: r.timeLeft, version: taskService.getVersion() });
        io.emit("task:timer", { taskId: r.task.taskId, timeLeft: r.timeLeft, version: taskService.getVersion() });
        cb({ success: true, taskId: r.task.taskId, timeLeft: r.timeLeft, paused: false });
        console.log(`[Task] (Re)started: ${r.task.taskId} (full countdown)`);
      } catch (err: any) {
        cb({ success: false, error: err.message || "Start failed." });
      }
    });

    socket.on("disconnect", () => {
      const teamId = socketTeamMap.get(socket.id);
      console.log(`[Socket] Client disconnected: ${socket.id} (team: ${teamId || "none"})`);
      socketTeamMap.delete(socket.id);
    });
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
                    io.emit("question:active", {
                      taskId: task.taskId,
                      questionId: bankQ.id,
                      question_text: bankQ.question_text,
                      options: bankQ.options,
                      reward_points: bankQ.reward_points,
                    });
                  }
                }
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
