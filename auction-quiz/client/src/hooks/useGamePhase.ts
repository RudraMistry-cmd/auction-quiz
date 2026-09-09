import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { getServerBase } from "./useSocket";
import type {
  ServerEvents,
  ClientEvents,
  GamePhase,
  GameState,
  QuestionManifestItem,
  TimestampTimer,
  QuestionPayload,
  Task,
  TaskResultEvent,
  FullSyncState,
} from "../shared/types";

type TypedSocket = Socket<ServerEvents, ClientEvents>;

/** Format seconds as m:ss for task countdowns (e.g. 4:37). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Calculate drift-free remaining seconds using server startTime and duration.
 * remaining = duration - (now - startTime)
 */
export function computeRemaining(timer: TimestampTimer | null | undefined): number {
  if (!timer) return 0;
  if (!timer.isRunning || !timer.startTime) return Math.max(0, Math.round(timer.remaining ?? 0));
  const elapsedSec = (Date.now() - timer.startTime) / 1000;
  return Math.max(0, Math.ceil(timer.duration - elapsedSec));
}

/**
 * Global game-phase state hook. Owns the connection AND
 * tracks phase / current question / dual timers / active task / latest verdict / scoreboard / leadingTeam.
 */
export function useGamePhase() {
  const [socket, setSocket] = useState<TypedSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "reconnecting" | "disconnected">("disconnected");
  const [phase, setPhase] = useState<GamePhase>("idle");
  const [currentQuestion, setCurrentQuestion] = useState<QuestionManifestItem | null>(null);
  const [currentBid, setCurrentBid] = useState<number>(0);
  const [leadingTeam, setLeadingTeam] = useState<string | null>(null);
  const [winningTeam, setWinningTeam] = useState<{ teamId: string; teamName: string } | null>(null);
  const [biddingTimer, setBiddingTimer] = useState<TimestampTimer | null>(null);
  const [mainTaskTimer, setMainTaskTimer] = useState<TimestampTimer | null>(null);
  const [sideTaskTimer, setSideTaskTimer] = useState<TimestampTimer | null>(null);
  const [explicitTimer, setExplicitTimer] = useState<TimestampTimer | null>(null);
  const [extraTimer, setExtraTimer] = useState<TimestampTimer | null>(null);

  const [task, setTask] = useState<(Task & { timeLeft?: number }) | null>(null);
  const [taskTimer, setTaskTimer] = useState(0);
  const [taskEnded, setTaskEnded] = useState(false);
  const [taskPaused, setTaskPaused] = useState(false);
  const [lastResult, setLastResult] = useState<TaskResultEvent | null>(null);
  const [upcomingQuestion, setUpcomingQuestion] = useState<QuestionPayload | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<QuestionPayload | null>(null);
  const [scoreboard, setScoreboard] = useState<any[]>([]);
  const [activeAuction, setActiveAuction] = useState<any | null>(null);

  const seenVersion = useRef(0);
  const hasLiveTaskEvent = useRef(false);
  const lastEventTime = useRef(Date.now());
  const noteStructural = (version?: number) => {
    hasLiveTaskEvent.current = true;
    if (typeof version === "number") {
      seenVersion.current = Math.max(seenVersion.current, version);
    }
  };

  const handleFullState = useCallback((full: FullSyncState) => {
    lastEventTime.current = Date.now();
    if (!full) return;

    if (full.phase) setPhase(full.phase);
    if (full.currentBid !== undefined) setCurrentBid(full.currentBid);
    if (full.leadingTeam !== undefined) setLeadingTeam(full.leadingTeam);
    if (full.winningTeam !== undefined) {
      if (!full.winningTeam) {
        setWinningTeam(null);
      } else if (typeof full.winningTeam === "string") {
        setWinningTeam({ teamId: "", teamName: full.winningTeam });
      } else {
        setWinningTeam(full.winningTeam);
      }
    }
    if (full.currentQuestion !== undefined) setCurrentQuestion(full.currentQuestion);
    if (full.activeAuction !== undefined) setActiveAuction(full.activeAuction);
    if (full.scoreboard) setScoreboard(full.scoreboard);
    if (full.timers) {
      if (full.timers.bidding !== undefined) setBiddingTimer(full.timers.bidding);
      if (full.timers.auctionTimer !== undefined) setBiddingTimer(full.timers.auctionTimer);
      if (full.timers.main !== undefined) {
        setMainTaskTimer(full.timers.main);
        if (full.timers.main) {
          const rem = computeRemaining(full.timers.main);
          setTaskTimer(rem);
          if (rem <= 0 && full.timers.main.duration > 0) setTaskEnded(true);
        }
      }
      if (full.timers.taskTimer !== undefined) {
        setMainTaskTimer(full.timers.taskTimer);
        if (full.timers.taskTimer) {
          const rem = computeRemaining(full.timers.taskTimer);
          setTaskTimer(rem);
          if (rem <= 0 && full.timers.taskTimer.duration > 0) setTaskEnded(true);
        }
      }
      if (full.timers.explicit !== undefined) setExplicitTimer(full.timers.explicit);
      if (full.timers.side !== undefined) setSideTaskTimer(full.timers.side);
      if (full.timers.extraTimer !== undefined) {
        setExtraTimer(full.timers.extraTimer);
        setExplicitTimer(full.timers.extraTimer);
        setSideTaskTimer(full.timers.extraTimer);
      }
    }
    if ((full as any).upcomingQuestion !== undefined) setUpcomingQuestion((full as any).upcomingQuestion);
    if ((full as any).activeQuestion !== undefined) setActiveQuestion((full as any).activeQuestion);
    if (full.activeTask !== undefined) {
      setTask(full.activeTask);
      if (full.activeTask) {
        const rem = (full.activeTask as any).timeLeft ?? 0;
        setTaskTimer(rem);
        setTaskEnded(rem <= 0 && !full.activeTask.paused);
        setTaskPaused(!!full.activeTask.paused);
      } else {
        setTask(null);
        setTaskEnded(false);
        setTaskPaused(false);
      }
    }
  }, []);

  // Socket initialization and connection handling
  useEffect(() => {
    const s: TypedSocket = io(getServerBase(), {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
      auth: {
        adminSecret: sessionStorage.getItem("adminSecret") || undefined,
        secret: sessionStorage.getItem("adminSecret") || undefined,
      },
    });
    setSocket(s);

    const handleConnect = () => {
      setConnected(true);
      setConnectionStatus("connected");
      lastEventTime.current = Date.now();
      // Proactively request full sync state upon connecting / reconnecting
      s.emit("state:request", (res) => {
        if (res) handleFullState(res);
      });
    };

    const handleDisconnect = () => {
      setConnected(false);
      setConnectionStatus("disconnected");
    };

    const handleConnectError = () => {
      setConnected(false);
      setConnectionStatus("reconnecting");
    };

    const handleReconnectAttempt = () => {
      setConnectionStatus("reconnecting");
    };

    s.on("connect", handleConnect);
    s.on("disconnect", handleDisconnect);
    s.on("connect_error", handleConnectError);
    s.io.on("reconnect_attempt", handleReconnectAttempt);

    return () => {
      s.off("connect", handleConnect);
      s.off("disconnect", handleDisconnect);
      s.off("connect_error", handleConnectError);
      s.io.off("reconnect_attempt", handleReconnectAttempt);
      s.disconnect();
      setSocket(null);
    };
  }, [handleFullState]);

  // Fallback Polling Safety Net:
  // Poll /api/state every 10s only if disconnected or no socket event has arrived in >12s
  useEffect(() => {
    const fallbackInterval = setInterval(() => {
      const isQuiet = Date.now() - lastEventTime.current > 12000;
      if (!connected || isQuiet) {
        fetch(`${getServerBase()}/api/state`)
          .then((r) => (r.ok ? r.json() : null))
          .then((state) => {
            if (state) handleFullState(state);
          })
          .catch(() => {});
      }
    }, 10000);

    return () => clearInterval(fallbackInterval);
  }, [connected, handleFullState]);

  // Initial snapshot fetch on mount
  useEffect(() => {
    let cancelled = false;
    fetch(`${getServerBase()}/api/state`)
      .then((r) => (r.ok ? r.json() : null))
      .then((snap) => {
        if (!cancelled && snap) handleFullState(snap);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [handleFullState]);

  // High precision local interval (250ms) to update drift-free timer countdowns
  useEffect(() => {
    const interval = setInterval(() => {
      if (biddingTimer?.isRunning && biddingTimer.startTime) {
        const rem = computeRemaining(biddingTimer);
        setBiddingTimer((prev) => (prev && prev.remaining !== rem ? { ...prev, remaining: rem } : prev));
      }
      if (mainTaskTimer?.isRunning && mainTaskTimer.startTime) {
        const rem = computeRemaining(mainTaskTimer);
        setMainTaskTimer((prev) => (prev && prev.remaining !== rem ? { ...prev, remaining: rem } : prev));
        setTaskTimer((prev) => (prev !== rem ? rem : prev));
        if (rem <= 0) setTaskEnded(true);
      }
      if (explicitTimer?.isRunning && explicitTimer.startTime) {
        const rem = computeRemaining(explicitTimer);
        setExplicitTimer((prev) => (prev && prev.remaining !== rem ? { ...prev, remaining: rem } : prev));
        setSideTaskTimer((prev) => (prev && prev.remaining !== rem ? { ...prev, remaining: rem } : prev));
        setExtraTimer((prev) => (prev && prev.remaining !== rem ? { ...prev, remaining: rem } : prev));
      } else if (extraTimer?.isRunning && extraTimer.startTime) {
        const rem = computeRemaining(extraTimer);
        setExtraTimer((prev) => (prev && prev.remaining !== rem ? { ...prev, remaining: rem } : prev));
      }
    }, 250);

    return () => clearInterval(interval);
  }, [
    biddingTimer?.isRunning,
    biddingTimer?.startTime,
    biddingTimer?.duration,
    mainTaskTimer?.isRunning,
    mainTaskTimer?.startTime,
    mainTaskTimer?.duration,
    explicitTimer?.isRunning,
    explicitTimer?.startTime,
    explicitTimer?.duration,
    extraTimer?.isRunning,
    extraTimer?.startTime,
    extraTimer?.duration,
  ]);

  // Live socket event listeners
  useEffect(() => {
    if (!socket || !connected) return;

    const onFullState = (data: FullSyncState) => {
      handleFullState(data);
    };

    const handlePhaseChanged = (data: GameState) => {
      lastEventTime.current = Date.now();
      noteStructural();
      setPhase(data.phase);
      if (data.currentQuestion !== undefined) setCurrentQuestion(data.currentQuestion);
      if (data.currentBid !== undefined) setCurrentBid(data.currentBid);
      if (data.leadingTeam !== undefined) setLeadingTeam(data.leadingTeam);
      if (data.winningTeam !== undefined) setWinningTeam(data.winningTeam);
      if (data.biddingTimer !== undefined) setBiddingTimer(data.biddingTimer);
      if (data.mainTaskTimer !== undefined) {
        setMainTaskTimer(data.mainTaskTimer);
        if (data.mainTaskTimer) setTaskTimer(computeRemaining(data.mainTaskTimer));
      }
      if (data.explicitTimer !== undefined) setExplicitTimer(data.explicitTimer);
      if (data.sideTaskTimer !== undefined) setSideTaskTimer(data.sideTaskTimer);
    };

    const handleTimerAuctionStart = (data: { startTime: number; duration: number; remaining: number }) => {
      lastEventTime.current = Date.now();
      setBiddingTimer({
        startTime: data.startTime,
        duration: data.duration,
        remaining: data.remaining,
        isRunning: true,
        label: "Auction",
      });
    };

    const handleTimerMainStart = (data: { startTime: number; duration: number; remaining: number; label?: string }) => {
      lastEventTime.current = Date.now();
      setMainTaskTimer({
        startTime: data.startTime,
        duration: data.duration,
        remaining: data.remaining,
        isRunning: true,
        label: data.label || "Task Time Remaining",
      });
      setTaskTimer(data.remaining);
      setTaskEnded(false);
      setTaskPaused(false);
    };

    const handleTimerTaskStart = (data: { startTime: number; duration: number; remaining: number; label?: string }) => {
      handleTimerMainStart(data);
    };

    const handleTimerExtraStart = (data: { startTime: number; duration: number; remaining: number; label?: string }) => {
      lastEventTime.current = Date.now();
      const t: TimestampTimer = {
        startTime: data.startTime,
        duration: data.duration,
        remaining: data.remaining,
        isRunning: true,
        label: data.label || "Extra Timer",
      };
      setExtraTimer(t);
      setExplicitTimer(t);
      setSideTaskTimer(t);
    };

    const handleTimerExplicitStart = (data: { startTime: number; duration: number; remaining: number; label?: string }) => {
      handleTimerExtraStart(data);
    };

    const handleTimerSideStart = (data: { startTime: number; duration: number; remaining: number; label?: string }) => {
      handleTimerExtraStart(data);
    };

    const handleTimerEnd = (data: { timerType: "auction" | "task" | "extra" }) => {
      lastEventTime.current = Date.now();
      if (data.timerType === "auction") {
        setBiddingTimer((prev) => (prev ? { ...prev, isRunning: false, remaining: 0 } : null));
      } else if (data.timerType === "task") {
        setMainTaskTimer((prev) => (prev ? { ...prev, isRunning: false, remaining: 0 } : null));
        setTaskEnded(true);
      } else if (data.timerType === "extra") {
        setExtraTimer((prev) => (prev ? { ...prev, isRunning: false, remaining: 0 } : null));
        setExplicitTimer((prev) => (prev ? { ...prev, isRunning: false, remaining: 0 } : null));
        setSideTaskTimer((prev) => (prev ? { ...prev, isRunning: false, remaining: 0 } : null));
      }
    };

    const handleTimerUpdate = (data: any) => {
      lastEventTime.current = Date.now();
      if (data.biddingTimer !== undefined) setBiddingTimer(data.biddingTimer);
      if (data.auctionTimer !== undefined) setBiddingTimer(data.auctionTimer);
      if (data.mainTaskTimer !== undefined) {
        setMainTaskTimer(data.mainTaskTimer);
        if (data.mainTaskTimer) {
          const rem = computeRemaining(data.mainTaskTimer);
          setTaskTimer(rem);
          if (rem <= 0) setTaskEnded(true);
        }
      }
      if (data.taskTimer !== undefined) {
        setMainTaskTimer(data.taskTimer);
        if (data.taskTimer) {
          const rem = computeRemaining(data.taskTimer);
          setTaskTimer(rem);
          if (rem <= 0) setTaskEnded(true);
        }
      }
      if (data.explicitTimer !== undefined) setExplicitTimer(data.explicitTimer);
      if (data.sideTaskTimer !== undefined) setSideTaskTimer(data.sideTaskTimer);
      if (data.extraTimer !== undefined) {
        setExtraTimer(data.extraTimer);
        setExplicitTimer(data.extraTimer);
        setSideTaskTimer(data.extraTimer);
      }
      if (data.timeLeft !== undefined && !data.mainTaskTimer && !data.taskTimer) {
        setTaskTimer(data.timeLeft);
        if (data.timeLeft <= 0) setTaskEnded(true);
      }
    };

    const handleAuctionStarted = (a: any) => {
      lastEventTime.current = Date.now();
      noteStructural();
      setPhase("bidding");
      setTask(null);
      setTaskEnded(false);
      setLastResult(null);
      setActiveQuestion(null);
      setWinningTeam(null);
      setLeadingTeam(null);
      setCurrentBid(a?.startBid || 0);
      setActiveAuction(a || null);
    };

    const handleBidUpdate = (data: { auctionId: string; bid: any; teamName: string; increment?: number }) => {
      lastEventTime.current = Date.now();
      if (data.bid?.amount !== undefined) setCurrentBid(data.bid.amount);
      if (data.teamName) setLeadingTeam(data.teamName);
    };

    const handleAuctionEnded = (data: { winner: any; winningBid?: number | null }) => {
      lastEventTime.current = Date.now();
      noteStructural();
      if (data.winner) {
        setWinningTeam({ teamId: data.winner.teamId, teamName: data.winner.teamName });
        setLeadingTeam(data.winner.teamName);
        if (data.winningBid != null) setCurrentBid(data.winningBid);
        setPhase("post_bid_idle");
      } else {
        setPhase("idle");
        setWinningTeam(null);
        setLeadingTeam(null);
      }
    };

    const handleScoreboardUpdate = (data: { teams?: any[]; scoreboard?: any[] }) => {
      lastEventTime.current = Date.now();
      const teams = data.teams || data.scoreboard;
      if (teams) setScoreboard(teams);
    };

    const handleTeamUpdate = (data: { team: any }) => {
      lastEventTime.current = Date.now();
      if (data.team) {
        setScoreboard((prev) => {
          const idx = prev.findIndex((t) => t.teamId === data.team.teamId);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], ...data.team };
            return updated;
          }
          return prev;
        });
      }
    };

    const handleQuestionChanged = (data: { question?: QuestionManifestItem | null; imagePath?: string | null }) => {
      lastEventTime.current = Date.now();
      if (data.question) setCurrentQuestion(data.question);
    };

    const handleAssigned = (t: Task) => {
      lastEventTime.current = Date.now();
      noteStructural(t.version);
      setTask(t);
      setTaskTimer(Math.max(0, Math.ceil((t.endAt - Date.now()) / 1000)));
      setTaskEnded(false);
      setTaskPaused(false);
      setLastResult(null);
      setPhase("main_task");
    };

    const handleTaskStarted = (data: { time_limit: number; endAt?: number; taskId?: string; teamName?: string }) => {
      lastEventTime.current = Date.now();
      noteStructural();
      setPhase("main_task");
      const initialRemaining = data.endAt ? Math.max(0, Math.ceil((data.endAt - Date.now()) / 1000)) : data.time_limit;
      setTaskTimer(initialRemaining > 0 ? initialRemaining : data.time_limit);
      setTaskEnded(false);
      setTaskPaused(false);
      setTask((prev) => {
        if (!prev) {
          return {
            taskId: data.taskId || "",
            auctionId: "",
            teamId: "",
            teamName: data.teamName,
            finalBid: 0,
            time_limit: data.time_limit,
            endAt: data.endAt || Date.now() + data.time_limit * 1000,
            paused: false,
            status: "active",
          } as Task;
        }
        return {
          ...prev,
          time_limit: data.time_limit,
          endAt: data.endAt || Date.now() + data.time_limit * 1000,
          paused: false,
          status: "active",
        };
      });
    };

    const handleTaskTimer = (data: { taskId: string; timeLeft: number; version: number }) => {
      lastEventTime.current = Date.now();
      if (typeof data.version === "number") {
        seenVersion.current = Math.max(seenVersion.current, data.version);
      }
      setTaskTimer(data.timeLeft);
      if (data.timeLeft > 0) setTaskEnded(false);
    };

    const handleTaskEnded = () => {
      lastEventTime.current = Date.now();
      noteStructural();
      setTaskEnded(true);
    };

    const handlePaused = (data: { taskId: string; timeLeft: number; version: number }) => {
      lastEventTime.current = Date.now();
      noteStructural(data.version);
      setTaskPaused(true);
      setTaskTimer(data.timeLeft);
      setTask((prev) => (prev ? { ...prev, paused: true } : prev));
    };

    const handleResumed = (data: { taskId: string; timeLeft: number; version: number }) => {
      lastEventTime.current = Date.now();
      noteStructural(data.version);
      setTaskPaused(false);
      setTaskEnded(false);
      setTaskTimer(data.timeLeft);
      setTask((prev) => (prev ? { ...prev, paused: false, endAt: Date.now() + data.timeLeft * 1000 } : prev));
    };

    const handleTaskResult = (r: TaskResultEvent) => {
      lastEventTime.current = Date.now();
      noteStructural();
      setLastResult(r);
      setTask(null);
      setTaskEnded(false);
      setTaskPaused(false);
      setActiveQuestion(null);
      setPhase("ended");
    };

    const handleQuestionImageSet = (data: { imagePath: string; question?: QuestionManifestItem }) => {
      lastEventTime.current = Date.now();
      if (data.question) {
        setCurrentQuestion(data.question);
      }
    };

    const handleSystemReset = () => {
      lastEventTime.current = Date.now();
      setPhase("idle");
      setCurrentBid(0);
      setLeadingTeam(null);
      setWinningTeam(null);
      setTask(null);
      setTaskTimer(0);
      setTaskEnded(false);
      setTaskPaused(false);
      setLastResult(null);
      setActiveAuction(null);
      setCurrentQuestion(null);
      setActiveQuestion(null);
      setBiddingTimer(null);
      setMainTaskTimer(null);
      setExplicitTimer(null);
      setSideTaskTimer(null);
      setExtraTimer(null);
    };

    socket.on("state:full", onFullState);
    socket.on("phase:changed", handlePhaseChanged);
    socket.on("timer:main:start", handleTimerMainStart);
    socket.on("timer:side:start", handleTimerSideStart);
    socket.on("timer:explicit:start", handleTimerExplicitStart);
    socket.on("timer:auction:start" as any, handleTimerAuctionStart);
    socket.on("timer:task:start" as any, handleTimerTaskStart);
    socket.on("timer:extra:start" as any, handleTimerExtraStart);
    socket.on("timer:end" as any, handleTimerEnd);
    socket.on("timer:update", handleTimerUpdate);
    socket.on("auction:started", handleAuctionStarted);
    socket.on("auction:start" as any, handleAuctionStarted);
    socket.on("auction:bid_update", handleBidUpdate);
    socket.on("bid:update" as any, handleBidUpdate);
    socket.on("auction:ended", handleAuctionEnded);
    socket.on("auction:win" as any, handleAuctionEnded);
    socket.on("bid:win" as any, handleAuctionEnded);
    socket.on("scoreboard:updated", handleScoreboardUpdate);
    socket.on("scoreboard:update" as any, handleScoreboardUpdate);
    socket.on("team:update" as any, handleTeamUpdate);
    socket.on("question:changed" as any, handleQuestionChanged);
    socket.on("question:image_set", handleQuestionImageSet);
    socket.on("task:assigned", handleAssigned);
    socket.on("task:started", handleTaskStarted);
    socket.on("task:start" as any, handleTaskStarted);
    socket.on("task:timer", handleTaskTimer);
    socket.on("task:ended", handleTaskEnded);
    socket.on("task:end" as any, handleTaskEnded);
    socket.on("task:paused", handlePaused);
    socket.on("task:resumed", handleResumed);
    socket.on("task:result", handleTaskResult);
    socket.on("system:reset" as any, handleSystemReset);

    return () => {
      socket.off("state:full", onFullState);
      socket.off("phase:changed", handlePhaseChanged);
      socket.off("timer:main:start", handleTimerMainStart);
      socket.off("timer:side:start", handleTimerSideStart);
      socket.off("timer:explicit:start", handleTimerExplicitStart);
      socket.off("timer:auction:start" as any, handleTimerAuctionStart);
      socket.off("timer:task:start" as any, handleTimerTaskStart);
      socket.off("timer:extra:start" as any, handleTimerExtraStart);
      socket.off("timer:end" as any, handleTimerEnd);
      socket.off("timer:update", handleTimerUpdate);
      socket.off("auction:started", handleAuctionStarted);
      socket.off("auction:start" as any, handleAuctionStarted);
      socket.off("auction:bid_update", handleBidUpdate);
      socket.off("bid:update" as any, handleBidUpdate);
      socket.off("auction:ended", handleAuctionEnded);
      socket.off("auction:win" as any, handleAuctionEnded);
      socket.off("bid:win" as any, handleAuctionEnded);
      socket.off("scoreboard:updated", handleScoreboardUpdate);
      socket.off("scoreboard:update" as any, handleScoreboardUpdate);
      socket.off("team:update" as any, handleTeamUpdate);
      socket.off("question:changed" as any, handleQuestionChanged);
      socket.off("question:image_set", handleQuestionImageSet);
      socket.off("task:assigned", handleAssigned);
      socket.off("task:started", handleTaskStarted);
      socket.off("task:start" as any, handleTaskStarted);
      socket.off("task:timer", handleTaskTimer);
      socket.off("task:ended", handleTaskEnded);
      socket.off("task:end" as any, handleTaskEnded);
      socket.off("task:paused", handlePaused);
      socket.off("task:resumed", handleResumed);
      socket.off("task:result", handleTaskResult);
      socket.off("system:reset" as any, handleSystemReset);
    };
  }, [socket, connected, handleFullState]);

  return {
    socket,
    connected,
    connectionStatus,
    phase,
    currentQuestion,
    currentBid,
    leadingTeam,
    winningTeam,
    biddingTimer,
    mainTaskTimer,
    sideTaskTimer: sideTaskTimer || explicitTimer,
    explicitTimer: explicitTimer || sideTaskTimer,
    extraTimer: extraTimer || explicitTimer,
    task,
    taskTimer,
    taskEnded,
    taskPaused,
    lastResult,
    upcomingQuestion,
    activeQuestion,
    scoreboard,
    activeAuction,
  };
}
