import { useEffect, useRef, useState } from "react";
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
} from "../shared/types";

type TypedSocket = Socket<ServerEvents, ClientEvents>;

/** Format seconds as m:ss for task countdowns (e.g. 4:37). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Global game-phase state hook. Owns the connection AND
 * tracks phase / current question / dual timers / active task / latest verdict.
 */
export function useGamePhase() {
  const [socket, setSocket] = useState<TypedSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [phase, setPhase] = useState<GamePhase>("idle");
  const [currentQuestion, setCurrentQuestion] = useState<QuestionManifestItem | null>(null);
  const [currentBid, setCurrentBid] = useState<number>(0);
  const [winningTeam, setWinningTeam] = useState<{ teamId: string; teamName: string } | null>(null);
  const [biddingTimer, setBiddingTimer] = useState<TimestampTimer | null>(null);
  const [mainTaskTimer, setMainTaskTimer] = useState<TimestampTimer | null>(null);
  const [sideTaskTimer, setSideTaskTimer] = useState<TimestampTimer | null>(null);
  const [explicitTimer, setExplicitTimer] = useState<TimestampTimer | null>(null);

  const [task, setTask] = useState<(Task & { timeLeft?: number }) | null>(null);
  const [taskTimer, setTaskTimer] = useState(0);
  const [taskEnded, setTaskEnded] = useState(false);
  const [taskPaused, setTaskPaused] = useState(false);
  const [lastResult, setLastResult] = useState<TaskResultEvent | null>(null);
  const [upcomingQuestion, setUpcomingQuestion] = useState<QuestionPayload | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<QuestionPayload | null>(null);

  const seenVersion = useRef(0);
  const hasLiveTaskEvent = useRef(false);
  const noteStructural = (version?: number) => {
    hasLiveTaskEvent.current = true;
    if (typeof version === "number") {
      seenVersion.current = Math.max(seenVersion.current, version);
    }
  };

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

    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);
    s.on("connect", handleConnect);
    s.on("disconnect", handleDisconnect);
    s.on("connect_error", handleDisconnect);

    return () => {
      s.off("connect", handleConnect);
      s.off("disconnect", handleDisconnect);
      s.off("connect_error", handleDisconnect);
      s.disconnect();
      setSocket(null);
    };
  }, []);

  // Restore snapshot on connect / refresh
  useEffect(() => {
    if (!socket || !connected) return;
    let cancelled = false;
    hasLiveTaskEvent.current = false;
    fetch(`${getServerBase()}/api/auction/current`)
      .then((r) => r.json())
      .then((snap: any) => {
        if (cancelled) return;
        if (hasLiveTaskEvent.current) return;
        const v = snap.activeTask?.version ?? 0;
        if (snap.activeTask && v < seenVersion.current) return;
        setPhase((snap.phase as GamePhase) || "idle");
        setUpcomingQuestion(snap.upcomingQuestion || null);
        setActiveQuestion(snap.activeQuestion || null);
        if (snap.activeTask) {
          setTask(snap.activeTask);
          setTaskTimer(snap.activeTask.timeLeft ?? 0);
          setTaskEnded((snap.activeTask.timeLeft ?? 0) <= 0 && !snap.activeTask.paused);
          setTaskPaused(!!snap.activeTask.paused);
          seenVersion.current = Math.max(seenVersion.current, v);
        } else {
          setTask(null);
          setTaskEnded(false);
          setTaskPaused(false);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [socket, connected]);

  // Live event listeners
  useEffect(() => {
    if (!socket || !connected) return;

    const handlePhaseChanged = (data: GameState) => {
      noteStructural();
      setPhase(data.phase);
      if (data.currentQuestion !== undefined) setCurrentQuestion(data.currentQuestion);
      if (data.currentBid !== undefined) setCurrentBid(data.currentBid);
      if (data.winningTeam !== undefined) setWinningTeam(data.winningTeam);
      if (data.biddingTimer !== undefined) setBiddingTimer(data.biddingTimer);
      if (data.mainTaskTimer !== undefined) {
        setMainTaskTimer(data.mainTaskTimer);
        if (data.mainTaskTimer) setTaskTimer(data.mainTaskTimer.remaining);
      }
      if (data.explicitTimer !== undefined) setExplicitTimer(data.explicitTimer);
      if (data.sideTaskTimer !== undefined) setSideTaskTimer(data.sideTaskTimer);
    };

    // Also fetch current game state directly on connect
    socket.emit("client:get_game_state", (res: any) => {
      if (res?.success && res.gameState) {
        handlePhaseChanged(res.gameState);
      }
    });

    const handleTimerMainStart = (data: { startTime: number; duration: number; remaining: number }) => {
      setMainTaskTimer({
        startTime: data.startTime,
        duration: data.duration,
        remaining: data.remaining,
        isRunning: true,
        label: "Main Task",
      });
      setTaskTimer(data.remaining);
      setTaskEnded(false);
      setTaskPaused(false);
    };

    const handleTimerExplicitStart = (data: { startTime: number; duration: number; remaining: number }) => {
      const t: TimestampTimer = {
        startTime: data.startTime,
        duration: data.duration,
        remaining: data.remaining,
        isRunning: true,
        label: "Open Challenge",
      };
      setExplicitTimer(t);
      setSideTaskTimer(t);
    };

    const handleTimerSideStart = (data: { startTime: number; duration: number; remaining: number }) => {
      handleTimerExplicitStart(data);
    };

    const handleTimerUpdate = (data: any) => {
      if (data.biddingTimer !== undefined) setBiddingTimer(data.biddingTimer);
      if (data.mainTaskTimer !== undefined) {
        setMainTaskTimer(data.mainTaskTimer);
        if (data.mainTaskTimer) {
          setTaskTimer(data.mainTaskTimer.remaining);
          if (data.mainTaskTimer.remaining <= 0) setTaskEnded(true);
        }
      }
      if (data.explicitTimer !== undefined) setExplicitTimer(data.explicitTimer);
      if (data.sideTaskTimer !== undefined) setSideTaskTimer(data.sideTaskTimer);
      if (data.timeLeft !== undefined && !data.mainTaskTimer) {
        setTaskTimer(data.timeLeft);
        if (data.timeLeft <= 0) setTaskEnded(true);
      }
    };

    const handleAuctionStarted = (a: any) => {
      noteStructural();
      setPhase("bidding");
      setTask(null);
      setTaskEnded(false);
      setLastResult(null);
      setActiveQuestion(null);
      setWinningTeam(null);
      setCurrentBid(a?.startBid || 0);
    };

    const handleAuctionEnded = (data: { winner: any; winningBid?: number | null }) => {
      noteStructural();
      if (data.winner) {
        setWinningTeam({ teamId: data.winner.teamId, teamName: data.winner.teamName });
        if (data.winningBid != null) setCurrentBid(data.winningBid);
      } else {
        setPhase("ended");
        setWinningTeam(null);
      }
    };

    const handleAssigned = (t: Task) => {
      noteStructural(t.version);
      setTask(t);
      setTaskTimer(Math.max(0, Math.ceil((t.endAt - Date.now()) / 1000)));
      setTaskEnded(false);
      setTaskPaused(false);
      setLastResult(null);
      setPhase("main_task");
    };

    const handleTaskStarted = (data: { time_limit: number; endAt?: number; taskId?: string; teamName?: string }) => {
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
      if (typeof data.version === "number") {
        seenVersion.current = Math.max(seenVersion.current, data.version);
      }
      setTaskTimer(data.timeLeft);
      if (data.timeLeft > 0) setTaskEnded(false);
    };

    const handleTaskEnded = () => {
      noteStructural();
      setTaskEnded(true);
    };

    const handlePaused = (data: { taskId: string; timeLeft: number; version: number }) => {
      noteStructural(data.version);
      setTaskPaused(true);
      setTaskTimer(data.timeLeft);
      setTask((prev) => (prev ? { ...prev, paused: true } : prev));
    };

    const handleResumed = (data: { taskId: string; timeLeft: number; version: number }) => {
      noteStructural(data.version);
      setTaskPaused(false);
      setTaskEnded(false);
      setTaskTimer(data.timeLeft);
      setTask((prev) => (prev ? { ...prev, paused: false, endAt: Date.now() + data.timeLeft * 1000 } : prev));
    };

    const handleTaskResult = (r: TaskResultEvent) => {
      noteStructural();
      setLastResult(r);
      setTask(null);
      setTaskEnded(false);
      setTaskPaused(false);
      setActiveQuestion(null);
      setPhase("ended");
    };

    const handleQuestionImageSet = (data: { imagePath: string; question?: QuestionManifestItem }) => {
      if (data.question) {
        setCurrentQuestion(data.question);
      }
    };

    socket.on("phase:changed", handlePhaseChanged);
    socket.on("timer:main:start", handleTimerMainStart);
    socket.on("timer:side:start", handleTimerSideStart);
    socket.on("timer:explicit:start", handleTimerExplicitStart);
    socket.on("timer:update", handleTimerUpdate);
    socket.on("auction:started", handleAuctionStarted);
    socket.on("auction:ended", handleAuctionEnded);
    socket.on("task:assigned", handleAssigned);
    socket.on("task:started", handleTaskStarted);
    socket.on("task:timer", handleTaskTimer);
    socket.on("task:ended", handleTaskEnded);
    socket.on("task:paused", handlePaused);
    socket.on("task:resumed", handleResumed);
    socket.on("task:result", handleTaskResult);
    socket.on("question:image_set", handleQuestionImageSet);

    return () => {
      socket.off("phase:changed", handlePhaseChanged);
      socket.off("timer:main:start", handleTimerMainStart);
      socket.off("timer:side:start", handleTimerSideStart);
      socket.off("timer:explicit:start", handleTimerExplicitStart);
      socket.off("timer:update", handleTimerUpdate);
      socket.off("auction:started", handleAuctionStarted);
      socket.off("auction:ended", handleAuctionEnded);
      socket.off("task:assigned", handleAssigned);
      socket.off("task:started", handleTaskStarted);
      socket.off("task:timer", handleTaskTimer);
      socket.off("task:ended", handleTaskEnded);
      socket.off("task:paused", handlePaused);
      socket.off("task:resumed", handleResumed);
      socket.off("task:result", handleTaskResult);
      socket.off("question:image_set", handleQuestionImageSet);
    };
  }, [socket, connected]);

  return {
    socket,
    connected,
    phase,
    currentQuestion,
    currentBid,
    winningTeam,
    biddingTimer,
    mainTaskTimer,
    sideTaskTimer: sideTaskTimer || explicitTimer,
    explicitTimer: explicitTimer || sideTaskTimer,
    task,
    taskTimer,
    taskEnded,
    taskPaused,
    lastResult,
    upcomingQuestion,
    activeQuestion,
  };
}
