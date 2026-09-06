import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { getServerBase } from "./useSocket";
import type { ServerEvents, ClientEvents, GamePhase, QuestionPayload, Task, TaskResultEvent } from "../shared/types";

type TypedSocket = Socket<ServerEvents, ClientEvents>;

/** Format seconds as m:ss for task countdowns (e.g. 4:37). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Global game-phase state. Superset of useSocket: owns the connection AND
 * tracks phase / active task / task timer / latest verdict across
 * auction → task → result → idle, restoring from the server snapshot
 * on (re)connect so refreshes never strand the UI.
 */
export function useGamePhase() {
  const [socket, setSocket] = useState<TypedSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [phase, setPhase] = useState<GamePhase>("idle");
  const [task, setTask] = useState<(Task & { timeLeft?: number }) | null>(null);
  const [taskTimer, setTaskTimer] = useState(0);
  const [taskEnded, setTaskEnded] = useState(false); // timer expired, verdict pending
  const [taskPaused, setTaskPaused] = useState(false);
  const [lastResult, setLastResult] = useState<TaskResultEvent | null>(null);
  const [upcomingQuestion, setUpcomingQuestion] = useState<QuestionPayload | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<QuestionPayload | null>(null);
  // Stale-snapshot defense: a state-changing socket event that arrives
  // after the snapshot fetch was dispatched is strictly newer — the
  // snapshot is ignored then. hasLiveTaskEvent is scoped per fetch
  // (reset at dispatch) so future refreshes still restore. Ticks are
  // excluded: they carry no structural info, and flagging on them would
  // block restores on fresh mounts where only ticks are streaming.
  // seenVersion orders versioned payloads as the stronger second layer.
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

  // Restore phase + task after (re)connect, e.g. page refresh mid-task.
  // Guards: if a live task event arrived after dispatch, the snapshot is
  // stale — ignore it. A versioned snapshot older than versions already
  // seen is ignored too.
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

  // Live phase transitions.
  useEffect(() => {
    if (!socket || !connected) return;

    const handleAuctionStarted = () => {
      noteStructural();
      setPhase("auction");
      setTask(null);
      setTaskEnded(false);
      setLastResult(null);
      setActiveQuestion(null);
    };
    const handleSelected = (data: QuestionPayload) => {
      noteStructural();
      setUpcomingQuestion({ ...data });
    };
    const handleQuestionActive = (data: QuestionPayload) => {
      noteStructural();
      setActiveQuestion({ ...data });
      setUpcomingQuestion(null);
    };
    const handleAuctionEnded = (data: { winner: unknown | null }) => {
      // Winner → task:assigned follows immediately. No winner → idle.
      if (!data.winner) {
        noteStructural();
        setPhase("idle");
      }
    };
    const handleAssigned = (t: Task) => {
      noteStructural(t.version);
      setTask(t);
      setTaskTimer(Math.max(0, Math.ceil((t.endAt - Date.now()) / 1000)));
      setTaskEnded(false);
      setTaskPaused(false);
      setLastResult(null);
      setPhase("task");
    };
    const handleTaskTimer = (data: { taskId: string; timeLeft: number; version: number }) => {
      if (typeof data.version === "number") {
        seenVersion.current = Math.max(seenVersion.current, data.version);
      }
      setTaskTimer(data.timeLeft);
      if (data.timeLeft > 0) setTaskEnded(false); // revived via +30s / restart
    };
    const handleTaskEnded = () => {
      noteStructural();
      setTaskEnded(true);
    };
    const handlePaused = (data: { taskId: string; timeLeft: number; version: number }) => {
      noteStructural(data.version);
      setTaskPaused(true);
      setTaskTimer(data.timeLeft);
    };
    const handleResumed = (data: { taskId: string; timeLeft: number; version: number }) => {
      noteStructural(data.version);
      setTaskPaused(false);
      setTaskEnded(false);
      setTaskTimer(data.timeLeft);
    };
    const handleTaskResult = (r: TaskResultEvent) => {
      noteStructural();
      setLastResult(r);
      setTask(null);
      setTaskEnded(false);
      setTaskPaused(false);
      setActiveQuestion(null);
      setPhase("idle");
    };

    socket.on("auction:started", handleAuctionStarted);
    socket.on("auction:ended", handleAuctionEnded);
    socket.on("task:assigned", handleAssigned);
    socket.on("task:timer", handleTaskTimer);
    socket.on("task:ended", handleTaskEnded);
    socket.on("task:paused", handlePaused);
    socket.on("task:resumed", handleResumed);
    socket.on("task:result", handleTaskResult);
    socket.on("question:selected", handleSelected);
    socket.on("question:active", handleQuestionActive);

    return () => {
      socket.off("auction:started", handleAuctionStarted);
      socket.off("auction:ended", handleAuctionEnded);
      socket.off("task:assigned", handleAssigned);
      socket.off("task:timer", handleTaskTimer);
      socket.off("task:ended", handleTaskEnded);
      socket.off("task:paused", handlePaused);
      socket.off("task:resumed", handleResumed);
      socket.off("task:result", handleTaskResult);
      socket.off("question:selected", handleSelected);
      socket.off("question:active", handleQuestionActive);
    };
  }, [socket, connected]);

  return { socket, connected, phase, task, taskTimer, taskEnded, taskPaused, lastResult, upcomingQuestion, activeQuestion };
}
