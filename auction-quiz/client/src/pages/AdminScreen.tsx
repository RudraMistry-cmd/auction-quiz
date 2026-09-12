import { useEffect, useMemo, useState } from "react";
import { getServerBase } from "../hooks/useSocket";
import { useGamePhase, formatClock } from "../hooks/useGamePhase";
import { BrandHeader } from "../components/BrandHeader";
import { tokens, tabular } from "../design-system";
import { soundManager } from "../utils/soundManager";
import type { Auction, Bid } from "../shared/types";

const C = tokens.color;
const F = tokens.font;

/* ─── Question Bank category order + display labels ─── */
const CATEGORY_ORDER = [
  "super_easy",
  "easy",
  "medium",
  "hard",
  "bonus",
  "jackpot",
  "code_fix",
  "code_completion",
];
const CATEGORY_LABELS: Record<string, string> = {
  super_easy: "Super Easy",
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  bonus: "Bonus",
  jackpot: "Jackpot",
  code_fix: "Code Fix / Debugging",
  code_completion: "Code Completion",
};
function categoryLabel(slug: string): string {
  return CATEGORY_LABELS[slug] || slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ─── Reusable Card ─── */
function Card({ title, children, span, scroll }: { title: string; children: React.ReactNode; span?: number; scroll?: boolean }) {
  return (
    <div style={{
      gridColumn: span ? `span ${span}` : "span 12",
      backgroundColor: C.surface,
      border: "none",
      borderRadius: "20px",
      padding: "22px 26px",
      boxShadow: tokens.shadow.md,
      display: "flex", flexDirection: "column",
      overflow: scroll ? "hidden" : undefined,
      minHeight: 0,
    }}>
      <div style={{
        fontFamily: F.heading, fontWeight: 700, fontSize: "0.95rem",
        color: C.primary, marginBottom: "16px",
        letterSpacing: "0.05em", textTransform: "uppercase" as const,
      }}>{title}</div>
      <div style={{ flex: 1, overflow: scroll ? "auto" : undefined }}>
        {children}
      </div>
    </div>
  );
}

interface ScoreboardTeam {
  teamId: string;
  teamName: string;
  bid_coins: number;
  reward_points: number;
  totalBids: number;
}

interface AdminScreenProps {
  adminSecret?: string;
}

export default function AdminScreen({ adminSecret }: AdminScreenProps = {}) {
  const secret = adminSecret || import.meta.env.VITE_ADMIN_SECRET || "7f8a9b2c";
  const {
    socket,
    connected,
    connectionStatus,
    phase,
    currentQuestion: phaseQuestion,
    currentBid: phaseBid,
    leadingTeam: phaseLeadingTeam,
    winningTeam: phaseWinner,
    biddingTimer,
    mainTaskTimer,
    extraTimer,
    activeAuction,
    scoreboard: phaseScoreboard,
    winnerCount,
    resultsRevealed,
  } = useGamePhase();
  // NOTE: No sound playback here — admin only broadcasts settings.
  // Playback happens strictly on the Live Display screen.
  const [isAdminVerified, setIsAdminVerified] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [auction, setAuction] = useState<Auction | null>(null);
  const [currentBid, setCurrentBid] = useState<number>(0);
  const [leadingTeam, setLeadingTeam] = useState<string>("");
  const [timer, setTimer] = useState<number>(0);
  const [scoreboard, setScoreboard] = useState<ScoreboardTeam[]>([]);
  const [lastEvent, setLastEvent] = useState<string>("");
  const [startArmed, setStartArmed] = useState(false);
  const [resultsBusy, setResultsBusy] = useState(false);

  // Task & Extra Timer controls
  const [taskTimerDuration, setTaskTimerDuration] = useState<number>(60);
  const [extraTimerDuration, setExtraTimerDuration] = useState<number>(60);
  const [extraTimerLabel, setExtraTimerLabel] = useState<string>("Extra Timer");
  const [taskTimerBusy, setTaskTimerBusy] = useState(false);
  const [extraTimerBusy, setExtraTimerBusy] = useState(false);
  const [timerPurpose, setTimerPurpose] = useState<"task" | "extra">("task");

  // Sync taskTimerDuration & timerDuration to question time if selected
  useEffect(() => {
    if (phaseQuestion?.time) {
      setTaskTimerDuration(phaseQuestion.time);
      setTimerDuration(phaseQuestion.time);
    }
  }, [phaseQuestion?.time]);

  // Sync state changes from useGamePhase
  useEffect(() => {
    if (phaseScoreboard && phaseScoreboard.length > 0) {
      setScoreboard(phaseScoreboard);
    }
  }, [phaseScoreboard]);

  useEffect(() => {
    if (phaseBid !== undefined && phaseBid !== null) setCurrentBid(phaseBid);
  }, [phaseBid]);

  useEffect(() => {
    if (phaseLeadingTeam !== undefined) setLeadingTeam(phaseLeadingTeam || "");
  }, [phaseLeadingTeam]);

  useEffect(() => {
    if (activeAuction) setAuction(activeAuction);
  }, [activeAuction]);

  // Manifest & Fallback state
  const [manifest, setManifest] = useState<any[]>([]);
  const [qbCategory, setQbCategory] = useState<string>("");

  const qbCategories = useMemo(() => {
    const present = new Set(manifest.map((q) => q.category).filter(Boolean));
    const ordered = CATEGORY_ORDER.filter((c) => present.has(c));
    const extra = [...present].filter((c) => !CATEGORY_ORDER.includes(c)).sort();
    return [...ordered, ...extra] as string[];
  }, [manifest]);

  useEffect(() => {
    if (!qbCategory && qbCategories.length > 0) setQbCategory(qbCategories[0]);
  }, [qbCategory, qbCategories]);

  const qbFiltered = useMemo(
    () => manifest.filter((q) => (q.category ? q.category === qbCategory : !qbCategory)),
    [manifest, qbCategory]
  );
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [fallbackTeamId, setFallbackTeamId] = useState<string>("");
  const [fallbackBusy, setFallbackBusy] = useState(false);
  const [endRoundBusy, setEndRoundBusy] = useState(false);

  // Team management state
  const [teamEdits, setTeamEdits] = useState<Record<string, { bid_coins?: number; reward_points?: number }>>({});
  const [teamBusy, setTeamBusy] = useState(false);
  const [teamConfirm, setTeamConfirm] = useState<{ teamId: string; teamName: string } | null>(null);

  // Manual timer control state
  const [timerDuration, setTimerDuration] = useState(60);

  // Sound control state (initialized from persisted local settings; the
  // global toggle/volume broadcast to the Live Display via socket).
  const [soundEnabled, setSoundEnabled] = useState(() => soundManager.isEnabled());
  const [soundVolume, setSoundVolume] = useState(() => soundManager.getVolume());
  const [soundPanelOpen, setSoundPanelOpen] = useState(false);
  const [perSoundEnabled, setPerSoundEnabled] = useState<Record<string, boolean>>({
    auction_start: true, auction_end: true, bid_small: true, bid_big: true,
    bid_win: true, timer_start: true, timer_end: true, pass: true, fail: true, tick: true,
  });
  const [soundFiles, setSoundFiles] = useState<{ name: string; exists: boolean; ext?: string | null; path?: string }[]>([]);
  const [uploadingSound, setUploadingSound] = useState<string | null>(null);

  // Data Management state
  const [dataPanelOpen, setDataPanelOpen] = useState(false);
  const [allTeams, setAllTeams] = useState<any[]>([]);
  const [dataEdits, setDataEdits] = useState<Record<string, any>>({});
  const [dataBusy, setDataBusy] = useState(false);
  const [dataConfirm, setDataConfirm] = useState<{ teamId: string; teamName: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ teamId: string; teamName: string } | null>(null);
  const [dataToast, setDataToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [poolStats, setPoolStats] = useState<{ total: number; assigned: number; remaining: number } | null>(null);
  const [resetPoolConfirm, setResetPoolConfirm] = useState(false);

  const [taskPending, setTaskPending] = useState(false);

  // Fetch team pool stats
  const fetchPoolStats = () => {
    if (!socket || !connected) return;
    socket.emit("admin:get_team_pool" as any, (res: any) => {
      if (res && res.success && res.stats) {
        setPoolStats(res.stats);
      }
    });
  };

  // Fetch scoreboard
  const fetchScoreboard = () => {
    if (!socket || !connected) return;
    socket.emit("client:get_scoreboard", (res: any) => {
      setScoreboard(res.teams || []);
    });
  };



  const fetchSounds = async () => {
    try {
      const res = await fetch(`${getServerBase()}/api/sounds?secret=${secret}`);
      const data = await res.json();
      if (data.success && data.sounds) {
        setSoundFiles(data.sounds);
        const enabledMap: Record<string, boolean> = {};
        data.sounds.forEach((s: { name: string; exists: boolean }) => {
          enabledMap[s.name] = s.exists;
        });
        setPerSoundEnabled(enabledMap);
      }
    } catch (err) {
      console.error("[Sound] Failed to fetch sounds:", err);
    }
  };

  const uploadSound = async (soundName: string, file: File) => {
    setUploadingSound(soundName);
    try {
      // Support .wav and .mp3: extension from filename, falling back to MIME.
      const lower = file.name.toLowerCase();
      const isWav = lower.endsWith(".wav") || file.type.includes("wav") || file.type.includes("wave");
      const ext = isWav ? "wav" : "mp3";
      const res = await fetch(`${getServerBase()}/api/sounds/upload?name=${soundName}&ext=${ext}&secret=${secret}`, {
        method: "POST",
        headers: { "Content-Type": isWav ? "audio/wav" : "audio/mpeg" },
        body: file,
      });
      const data = await res.json();
      if (data.success) {
        setLastEvent(`Sound uploaded: ${soundName}.${data.ext || ext}`);
        fetchSounds();
      } else {
        setLastEvent(`Error: ${data.error || "upload failed"}`);
      }
    } catch (err: any) {
      setLastEvent(`Error: ${err.message}`);
    } finally {
      setUploadingSound(null);
    }
  };

  useEffect(() => {
    sessionStorage.setItem("isAdmin", "true");
    sessionStorage.setItem("adminSecret", secret);
  }, [secret]);

  useEffect(() => {
    if (!socket || !connected) return;

    // Authenticate socket as admin
    socket.emit("admin:auth", { secret }, (res: any) => {
      if (res.success) {
        setIsAdminVerified(true);
        setAuthError(null);
        fetchScoreboard();
        fetchSounds();
        fetchPoolStats();
      } else {
        setIsAdminVerified(false);
        setAuthError(res.error || "Admin verification failed");
      }
    });

    // Restore the live auction after a refresh (admin holds no team session).
    fetch(`${getServerBase()}/api/auction/current`)
      .then((r) => r.json())
      .then((s: any) => {
        if (s.auction && s.auction.status === "active") {
          setAuction(s.auction);
          setCurrentBid(s.currentBid ?? s.auction.startBid);
          setTimer(s.remaining ?? 0);
          setLeadingTeam(s.leadingTeam || "");
        }
      })
      .catch(() => {});
    const interval = setInterval(fetchScoreboard, 5000);
    fetchManifest();
    return () => clearInterval(interval);
  }, [socket, connected, secret]);

  // Listen for events
  useEffect(() => {
    if (!socket || !connected) return;

    const handleStarted = (a: Auction) => {
      setAuction(a);
      setCurrentBid(a.startBid);
      setTimer(a.duration);
      setLeadingTeam("");
      setLastEvent(`Auction #${a.seqNo} started`);
      setStartArmed(false);
    };

    const handleBidUpdate = (data: { auctionId: string; bid: Bid; teamName: string }) => {
      setCurrentBid(data.bid.amount);
      setLeadingTeam(data.teamName);
      setLastEvent(`${data.teamName} bid ${data.bid.amount}`);
      fetchScoreboard();
    };

    const handleTimer = (data: { auctionId: string; remaining: number }) => {
      setTimer(data.remaining);
    };

    const handleEnded = (data: { auctionId?: string; winner: any; winningBid: number | null }) => {
      setAuction((a) => (a ? { ...a, status: "completed" } : null));
      const winnerText = data.winner
        ? `${data.winner.teamName} won with ${data.winningBid}`
        : "No bids placed";
      setLastEvent(`Auction ended: ${winnerText}`);
      fetchScoreboard();
      fetchManifest();
    };

    const handleScores = () => fetchScoreboard();

    const handleTimerUpdate = (_data: any) => {
      // Manual timer update acknowledged
    };

    const handleFullState = (data: any) => {
      if (data.activeAuction) setAuction(data.activeAuction);
      if (data.currentBid !== undefined) setCurrentBid(data.currentBid);
      if (data.leadingTeam) setLeadingTeam(data.leadingTeam);
      if (data.timers?.bidding?.remaining !== undefined) setTimer(data.timers.bidding.remaining);
      if (data.scoreboard) setScoreboard(data.scoreboard);
      fetchManifest();
    };

    socket.on("state:full" as any, handleFullState);
    socket.on("auction:started", handleStarted);
    socket.on("auction:start" as any, handleStarted);
    socket.on("auction:bid_update", handleBidUpdate);
    socket.on("bid:update" as any, handleBidUpdate);
    socket.on("auction:timer", handleTimer);
    socket.on("auction:ended", handleEnded);
    socket.on("bid:win" as any, handleEnded);
    socket.on("task:result", handleScores);
    socket.on("scoreboard:updated", handleScores);
    socket.on("scoreboard:update" as any, handleScores);
    socket.on("team:update" as any, handleScores);
    socket.on("manual_timer:update", handleTimerUpdate);
    const handlePoolUpdate = (stats: any) => {
      setPoolStats(stats);
    };
    socket.on("team_pool:update" as any, handlePoolUpdate);

    const handleThemeChanged = (data: { theme: string }) => {
      document.documentElement.setAttribute("data-theme", data.theme);
      localStorage.setItem("theme", data.theme);
    };
    socket.on("theme:changed", handleThemeChanged);

    return () => {
      socket.off("state:full" as any, handleFullState);
      socket.off("auction:started", handleStarted);
      socket.off("auction:start" as any, handleStarted);
      socket.off("auction:bid_update", handleBidUpdate);
      socket.off("bid:update" as any, handleBidUpdate);
      socket.off("auction:timer", handleTimer);
      socket.off("auction:ended", handleEnded);
      socket.off("bid:win" as any, handleEnded);
      socket.off("task:result", handleScores);
      socket.off("scoreboard:updated", handleScores);
      socket.off("scoreboard:update" as any, handleScores);
      socket.off("team:update" as any, handleScores);
      socket.off("manual_timer:update", handleTimerUpdate);
      socket.off("theme:changed", handleThemeChanged);
    };
  }, [socket, connected]);

  const fetchManifest = () => {
    if (!socket) return;
    socket.emit("admin:get_manifest", {}, (res: any) => {
      if (res.success && res.questions) {
        setManifest(res.questions);
        if (res.currentQuestion) {
          setSelectedQuestionId(res.currentQuestion.id);
        }
      }
    });
  };

  const selectQuestion = (qId: string) => {
    setSelectedQuestionId(qId);
    socket?.emit("admin:select_question", { questionId: qId }, (res) => {
      if (res.success && res.question) {
        setLastEvent(`Selected Question: ${res.question.id} (${res.question.reward} pts, ${res.question.time}s)`);
      } else {
        setLastEvent(`Error: ${res.error || "Failed to select question"}`);
      }
    });
  };

  const startAuction = async () => {
    try {
      setStartArmed(false);
      const q = phaseQuestion || manifest.find((m) => m.id === selectedQuestionId);
      if (!q) {
        setLastEvent("Error: Please select a question from Question Bank before starting auction.");
        return;
      }
      socket?.emit("admin:start_auction", {}, (res) => {
        if (res.success) {
          setLastEvent("Auction started successfully");
        } else {
          setLastEvent(`Error: ${res.error || "Failed to start auction"}`);
        }
      });
    } catch (err: any) {
      setLastEvent(`Error: ${err.message}`);
    }
  };

  const passTask = () => {
    if (!socket || taskPending) return;
    setTaskPending(true);
    socket.emit("admin:pass_task", {}, (res) => {
      setTaskPending(false);
      if (res.success) {
        setLastEvent("Task PASS recorded! Reward points awarded.");
        fetchScoreboard();
      } else {
        setLastEvent(`Error: ${res.error || "Failed to pass task"}`);
      }
    });
  };

  const failTask = () => {
    if (!socket || taskPending) return;
    setTaskPending(true);
    socket.emit("admin:fail_task", {}, (res) => {
      setTaskPending(false);
      if (res.success) {
        setLastEvent("Task FAIL recorded! Winner receives 0 pts.");
        fetchScoreboard();
      } else {
        setLastEvent(`Error: ${res.error || "Failed to fail task"}`);
      }
    });
  };

  const endRound = () => {
    if (!socket || endRoundBusy) return;
    setEndRoundBusy(true);
    socket.emit("admin:end_round", {}, (res) => {
      setEndRoundBusy(false);
      if (res.success) {
        setLastEvent("Round ended. Reset to idle for next auction.");
        setSelectedQuestionId(null);
        fetchManifest();
        fetchScoreboard();
      } else {
        setLastEvent(`Error: ${res.error || "Failed to end round"}`);
      }
    });
  };

  const setWinnerCountValue = (count: number) => {
    if (!socket) return;
    socket.emit("admin:set_winner_count", { count }, (res) => {
      if (!res.success) setLastEvent(`Error: ${res.error || "Failed to set winner count"}`);
    });
  };

  const revealResults = () => {
    if (!socket || resultsBusy) return;
    setResultsBusy(true);
    socket.emit("admin:reveal_results", {}, (res) => {
      setResultsBusy(false);
      if (res.success) {
        setLastEvent(`Final results revealed (top ${winnerCount}).`);
      } else {
        setLastEvent(`Error: ${res.error || "Failed to reveal results"}`);
      }
    });
  };

  const hideResults = () => {
    if (!socket || resultsBusy) return;
    setResultsBusy(true);
    socket.emit("admin:hide_results", {}, (res) => {
      setResultsBusy(false);
      if (res.success) {
        setLastEvent("Back to live scoreboard.");
      } else {
        setLastEvent(`Error: ${res.error || "Failed to hide results"}`);
      }
    });
  };

  const startTaskTimer = (duration?: number) => {
    if (!socket || taskTimerBusy) return;
    setTaskTimerBusy(true);
    const d = duration ?? taskTimerDuration;
    socket.emit("admin:start_task_timer", { duration: d }, (res) => {
      setTaskTimerBusy(false);
      if (res.success) {
        setLastEvent(`Task Timer started (${d}s)`);
      } else {
        setLastEvent(`Error: ${res.error || "Failed to start task timer"}`);
      }
    });
  };

  const pauseTaskTimer = () => {
    if (!socket || taskTimerBusy) return;
    setTaskTimerBusy(true);
    socket.emit("admin:pause_task_timer", {}, (res) => {
      setTaskTimerBusy(false);
      if (res.success) setLastEvent("Task Timer paused / resumed");
    });
  };

  const adjustTaskTimer = (seconds: number = 30) => {
    if (!socket || taskTimerBusy) return;
    setTaskTimerBusy(true);
    socket.emit("admin:adjust_task_timer", { seconds }, (res) => {
      setTaskTimerBusy(false);
      if (res.success) setLastEvent(`Task Timer +${seconds}s`);
    });
  };

  const stopTaskTimer = () => {
    if (!socket || taskTimerBusy) return;
    setTaskTimerBusy(true);
    socket.emit("admin:stop_task_timer", {}, (res) => {
      setTaskTimerBusy(false);
      if (res.success) setLastEvent("Task Timer stopped");
    });
  };

  const triggerFailWithFallback = () => {
    if (!socket || taskPending) return;
    setTaskPending(true);
    socket.emit("admin:fail_with_fallback", {}, (res) => {
      setTaskPending(false);
      if (res.success) {
        setLastEvent("Task failed with fallback enabled! Winner gets 0 pts.");
        fetchScoreboard();
      } else {
        setLastEvent(`Error: ${res.error || "Failed to enable fallback"}`);
      }
    });
  };

  const startExtraTimer = (duration?: number, label?: string) => {
    if (!socket || extraTimerBusy) return;
    setExtraTimerBusy(true);
    const d = duration ?? extraTimerDuration;
    const l = label ?? extraTimerLabel;
    socket.emit("admin:start_extra_timer", { duration: d, label: l }, (res) => {
      setExtraTimerBusy(false);
      if (res.success) {
        setLastEvent(`${l} started (${d}s)`);
      } else {
        setLastEvent(`Error: ${res.error || "Failed to start extra timer"}`);
      }
    });
  };

  const pauseExtraTimer = () => {
    if (!socket || extraTimerBusy) return;
    setExtraTimerBusy(true);
    socket.emit("admin:pause_extra_timer", {}, (res) => {
      setExtraTimerBusy(false);
      if (res.success) setLastEvent("Extra Timer paused / resumed");
    });
  };

  const adjustExtraTimer = (seconds: number = 30) => {
    if (!socket || extraTimerBusy) return;
    setExtraTimerBusy(true);
    socket.emit("admin:adjust_extra_timer", { seconds }, (res) => {
      setExtraTimerBusy(false);
      if (res.success) setLastEvent(`Extra Timer +${seconds}s`);
    });
  };

  const stopExtraTimer = () => {
    if (!socket || extraTimerBusy) return;
    setExtraTimerBusy(true);
    socket.emit("admin:stop_extra_timer", {}, (res) => {
      setExtraTimerBusy(false);
      if (res.success) setLastEvent("Extra Timer stopped");
    });
  };

  const submitFallbackPass = () => {
    if (!socket || !fallbackTeamId || fallbackBusy) return;
    setFallbackBusy(true);
    socket.emit("admin:fallback_pass", { teamId: fallbackTeamId }, (res) => {
      setFallbackBusy(false);
      if (res.success) {
        setLastEvent("Fallback awarded successfully! Round moved to result display.");
        setFallbackTeamId("");
        fetchScoreboard();
      } else {
        setLastEvent(`Error: ${res.error || "Failed to award fallback"}`);
      }
    });
  };

  const submitFallbackFail = () => {
    if (!socket || fallbackBusy) return;
    setFallbackBusy(true);
    socket.emit("admin:fallback_fail", {}, (res) => {
      setFallbackBusy(false);
      if (res.success) {
        setLastEvent("Fallback ended (No Winner). Round moved to result display.");
        fetchScoreboard();
      } else {
        setLastEvent(`Error: ${res.error || "Failed to conclude fallback"}`);
      }
    });
  };



  const applyTeamUpdate = (teamId: string) => {
    if (!socket || teamBusy) return;
    const edit = teamEdits[teamId];
    if (!edit) return;
    setTeamBusy(true);
    socket.emit("admin:update_team", {
      teamId,
      bid_coins: edit.bid_coins,
      reward_points: edit.reward_points,
    }, (res: any) => {
      setTeamBusy(false);
      if (res.success) {
        setTeamEdits((prev) => { const n = { ...prev }; delete n[teamId]; return n; });
        setTeamConfirm(null);
        setLastEvent(`Team ${res.team?.teamName ?? teamId} updated`);
        fetchScoreboard();
      } else {
        setLastEvent(`Error: ${res.error || "update failed"}`);
      }
    });
  };

  const applyDataUpdate = async (teamId: string) => {
    const edit = dataEdits[teamId];
    if (!edit) return;

    setDataBusy(true);
    try {
      const res = await fetch(`${getServerBase()}/admin/team/${teamId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": secret,
        },
        body: JSON.stringify(edit),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update team");
      }

      setAllTeams((prev) =>
        prev.map((t) => (t.teamId === teamId ? { ...t, ...data.team } : t))
      );

      setDataEdits((prev) => {
        const next = { ...prev };
        delete next[teamId];
        return next;
      });

      setDataConfirm(null);
      setDataToast({ type: "success", text: `Updated ${data.team?.teamName || "team"} successfully!` });
      setTimeout(() => setDataToast(null), 3000);

      fetchScoreboard();
    } catch (err: any) {
      console.error("[Data] Update error:", err);
      setDataToast({ type: "error", text: err.message || "Failed to update team" });
      setTimeout(() => setDataToast(null), 4000);
      setDataConfirm(null);
    } finally {
      setDataBusy(false);
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    setDataBusy(true);
    try {
      const res = await fetch(`${getServerBase()}/admin/team/${teamId}`, {
        method: "DELETE",
        headers: {
          "x-admin-secret": secret,
        },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete team");
      }

      setAllTeams((prev) => prev.filter((t) => t.teamId !== teamId));
      setDataEdits((prev) => {
        const next = { ...prev };
        delete next[teamId];
        return next;
      });

      const deletedName = deleteConfirm?.teamName || "Team";
      setDeleteConfirm(null);
      setDataToast({ type: "success", text: `Deleted ${deletedName} successfully!` });
      setTimeout(() => setDataToast(null), 3000);

      fetchScoreboard();
    } catch (err: any) {
      console.error("[Data] Delete error:", err);
      setDataToast({ type: "error", text: err.message || "Failed to delete team" });
      setTimeout(() => setDataToast(null), 4000);
      setDeleteConfirm(null);
    } finally {
      setDataBusy(false);
    }
  };



  const isActive = auction?.status === "active" && timer > 0;

  const isTaskRunning = !!mainTaskTimer?.isRunning;
  const isExtraRunning = !!extraTimer?.isRunning;
  const isAnyTimerRunning = isTaskRunning || isExtraRunning;
  const hasTaskTimer = !!(mainTaskTimer && mainTaskTimer.remaining > 0);
  const hasExtraTimer = !!(extraTimer && extraTimer.remaining > 0);
  const hasActivePaused = (!isAnyTimerRunning) && (hasTaskTimer || hasExtraTimer);
  const hasWinner = !!(phaseWinner?.teamId || phaseWinner?.teamName);

  let timerDisplayRemaining = timerDuration;
  let timerStatusText = "Ready / Stopped";
  let isTimerUrgent = false;

  if (isTaskRunning) {
    timerDisplayRemaining = mainTaskTimer!.remaining;
    timerStatusText = `Task Timer: Running (${phaseWinner?.teamName || "Winner"})`;
    isTimerUrgent = timerDisplayRemaining <= 30;
  } else if (isExtraRunning) {
    timerDisplayRemaining = extraTimer!.remaining;
    timerStatusText = `Extra Timer: Running`;
    isTimerUrgent = timerDisplayRemaining <= 30;
  } else if (hasTaskTimer) {
    timerDisplayRemaining = mainTaskTimer!.remaining;
    timerStatusText = `Task Timer: Paused`;
  } else if (hasExtraTimer) {
    timerDisplayRemaining = extraTimer!.remaining;
    timerStatusText = `Extra Timer: Paused`;
  }

  return (
    <div style={{
        minHeight: "100vh",
        backgroundColor: C.bg,
        color: C.text,
        fontFamily: F.body,
        padding: "clamp(16px, 3vw, 48px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}>
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <BrandHeader variant="left" subtitle="CONTROL PANEL" style={{ marginBottom: 0 }} />
          {isAdminVerified && (
            <span style={styles.verifiedBadge}>Host Verified</span>
          )}
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          fontFamily: F.body, fontSize: "0.85rem", fontWeight: 600,
          color: connectionStatus === "connected" ? C.success : connectionStatus === "reconnecting" ? C.warning : C.danger,
        }}>
          <span style={{
            width: "8px", height: "8px", borderRadius: "50%",
            backgroundColor: connectionStatus === "connected" ? C.success : connectionStatus === "reconnecting" ? C.warning : C.danger,
            boxShadow: connectionStatus === "connected" ? `0 0 6px ${C.success}` : connectionStatus === "reconnecting" ? `0 0 6px ${C.warning}` : "none",
          }} />
          <span>{connectionStatus === "connected" ? "Connected" : connectionStatus === "reconnecting" ? "Reconnecting..." : "Disconnected"}</span>
        </div>
      </div>

      {authError && (
        <div style={styles.authErrorBanner}>
          <strong>Access Denied:</strong> {authError}
          <div style={{ fontSize: "0.85rem", marginTop: "4px", opacity: 0.85 }}>
            Admin actions are strictly restricted to the host machine via the non-guessable control panel route.
          </div>
        </div>
      )}

      <div style={gridStyle}>
        {/* Row 1: Auction Control (8) + Manual Timer (4) */}
        <Card title="Auction Control" span={8}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div style={styles.authStatusBadge}>
              <span style={{ ...styles.authStatusDot, backgroundColor: isAdminVerified ? C.success : C.danger }} />
              <span>{isAdminVerified ? "Host Verified Session" : "Authenticating session..."}</span>
            </div>
            <span style={{
              fontSize: "0.8rem", fontWeight: 800, padding: "4px 12px", borderRadius: "12px",
              backgroundColor: phase === "bidding" ? `${C.accent}20` : phase === "main_task" ? `${C.primary}20` : `${C.muted}20`,
              color: phase === "bidding" ? C.accent : phase === "main_task" ? C.primary : C.muted,
              textTransform: "uppercase", letterSpacing: "0.05em",
            }}>
              Phase: {phase}
            </span>
          </div>

          {/* Question selection status */}
          <div style={{
            padding: "10px 14px", borderRadius: "0.75rem", marginBottom: "16px",
            backgroundColor: (phaseQuestion || selectedQuestionId) ? `${C.success}10` : `${C.danger}10`,
            border: `1px solid ${(phaseQuestion || selectedQuestionId) ? C.success : C.danger}`,
            fontSize: "0.85rem",
          }}>
            {(phaseQuestion || selectedQuestionId) ? (
              <span style={{ color: C.success, fontWeight: 700 }}>
                ✓ Selected Question: {phaseQuestion?.id || selectedQuestionId}
                {phaseQuestion && ` · Reward: ${phaseQuestion.reward} pts · Time: ${phaseQuestion.time}s`}
              </span>
            ) : (
              <span style={{ color: C.danger, fontWeight: 700 }}>
                ⚠️ No question selected. Please pick a question from Question Bank below before starting auction.
              </span>
            )}
          </div>

          {!startArmed ? (
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => setStartArmed(true)}
                disabled={isActive || (!phaseQuestion && !selectedQuestionId)}
                style={{
                  ...styles.startBtn, flex: 1,
                  opacity: (isActive || (!phaseQuestion && !selectedQuestionId)) ? 0.5 : 1,
                  cursor: (isActive || (!phaseQuestion && !selectedQuestionId)) ? "not-allowed" : "pointer",
                }}
              >
                {isActive ? "Auction in Progress" : "Start Auction (60s Timer)"}
              </button>
              {phase === "ended" && (
                <button
                  onClick={endRound}
                  disabled={endRoundBusy}
                  style={{ ...styles.cancelBtn, padding: "10px 20px" }}
                >
                  End Round & Reset
                </button>
              )}
            </div>
          ) : (
            <div style={styles.confirmRow}>
              <span style={styles.confirmText}>Start 60s bidding for question {phaseQuestion?.id || selectedQuestionId}?</span>
              <button onClick={startAuction} disabled={isActive} style={styles.startBtn}>Confirm Start</button>
              <button onClick={() => setStartArmed(false)} disabled={isActive} style={styles.cancelBtn}>Cancel</button>
            </div>
          )}
          {auction && (
            <div style={styles.auctionInfo}>
              <div style={styles.timerLarge}>{biddingTimer ? biddingTimer.remaining : timer}</div>
              <div style={styles.bidSection}>
                <span style={styles.bidLabel}>Current Bid</span>
                <span style={styles.bidValue}>{currentBid}</span>
              </div>
              {leadingTeam && <div style={styles.leadingTeam}>Leading: {leadingTeam}</div>}
            </div>
          )}
          {lastEvent && <div style={styles.lastEvent}>{lastEvent}</div>}
        </Card>

        <Card title="Manual Timer Control" span={4}>
          <p style={{ color: C.muted, fontSize: "0.8rem", marginBottom: "0.75rem" }}>
            Single authoritative controller for task & extra timers.
          </p>

          {/* 1. Timer Purpose Dropdown */}
          <div style={{ marginBottom: "0.75rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "4px" }}>
              Timer Purpose *
            </label>
            <select
              value={timerPurpose}
              onChange={(e) => setTimerPurpose(e.target.value as "task" | "extra")}
              disabled={isAnyTimerRunning || taskTimerBusy || extraTimerBusy}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: "0.625rem",
                border: `1px solid ${C.border}`,
                backgroundColor: C.surface,
                color: C.text,
                fontFamily: F.body,
                fontSize: "0.85rem",
                fontWeight: 600,
              }}
            >
              <option value="task">Task Timer (Winner & Live Display)</option>
              <option value="extra">Extra Timer (Live Display Only)</option>
            </select>
          </div>

          {/* 2. Target / Validation Notice */}
          {timerPurpose === "task" ? (
            !hasWinner ? (
              <div style={{
                padding: "8px 10px",
                borderRadius: "0.625rem",
                backgroundColor: `${C.danger}18`,
                border: `1px solid ${C.danger}50`,
                color: C.danger,
                fontSize: "0.8rem",
                fontWeight: 700,
                marginBottom: "0.75rem",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}>
                <span>⚠️</span>
                <span>No team has won the bid</span>
              </div>
            ) : (
              <div style={{
                padding: "8px 10px",
                borderRadius: "0.625rem",
                backgroundColor: `${C.success}15`,
                border: `1px solid ${C.success}40`,
                color: C.success,
                fontSize: "0.8rem",
                fontWeight: 600,
                marginBottom: "0.75rem",
              }}>
                Target: <strong>{phaseWinner?.teamName || "Winner"}</strong> & Live Projector
              </div>
            )
          ) : (
            <div style={{
              padding: "8px 10px",
              borderRadius: "0.625rem",
              backgroundColor: `${C.accent}15`,
              border: `1px solid ${C.accent}40`,
              color: C.accent,
              fontSize: "0.8rem",
              fontWeight: 600,
              marginBottom: "0.75rem",
            }}>
              Target: <strong>Live Projector Only</strong> (Hidden from all teams)
            </div>
          )}

          {/* 3. Timer Preview Display */}
          <div style={styles.timerPreview}>
            <span style={{
              ...styles.timerPreviewValue,
              color: isAnyTimerRunning
                ? (isTimerUrgent ? C.danger : timerPurpose === "task" ? C.primary : C.accent)
                : hasActivePaused
                ? C.warning
                : C.muted,
            }}>
              {formatClock(timerDisplayRemaining)}
            </span>
            <span style={styles.timerPreviewLabel}>{timerStatusText}</span>
          </div>

          {/* 4. Duration & Label Input */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "0.75rem", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "4px" }}>
                Duration (sec)
              </label>
              <input
                style={{
                  ...styles.timerInput,
                  width: "100%",
                }}
                type="number"
                min={5}
                max={3600}
                value={timerDuration}
                onChange={(e) => {
                  const val = Math.max(5, parseInt(e.target.value, 10) || 5);
                  setTimerDuration(val);
                  setTaskTimerDuration(val);
                  setExtraTimerDuration(val);
                }}
                disabled={isAnyTimerRunning || taskTimerBusy || extraTimerBusy}
              />
            </div>

            {timerPurpose === "extra" && (
              <div style={{ flex: 1.5 }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "4px" }}>
                  Label
                </label>
                <input
                  style={{
                    ...styles.timerInput,
                    width: "100%",
                    textAlign: "left",
                  }}
                  type="text"
                  placeholder="Extra Timer"
                  value={extraTimerLabel}
                  onChange={(e) => setExtraTimerLabel(e.target.value)}
                  disabled={isAnyTimerRunning || taskTimerBusy || extraTimerBusy}
                />
              </div>
            )}
          </div>

          {/* 5. Control Buttons */}
          <div style={styles.timerBtnRow}>
            {!isAnyTimerRunning && !hasActivePaused ? (
              <button
                onClick={() => {
                  if (timerPurpose === "task") {
                    if (!hasWinner) return;
                    startTaskTimer(timerDuration);
                  } else {
                    startExtraTimer(timerDuration, extraTimerLabel);
                  }
                }}
                disabled={
                  taskTimerBusy ||
                  extraTimerBusy ||
                  (timerPurpose === "task" && !hasWinner)
                }
                style={{
                  ...styles.timerCtrlBtn,
                  flex: 1,
                  backgroundColor: (timerPurpose === "task" && !hasWinner) ? `${C.border}` : C.success,
                  cursor: (timerPurpose === "task" && !hasWinner) ? "not-allowed" : "pointer",
                  opacity: (timerPurpose === "task" && !hasWinner) ? 0.5 : 1,
                }}
              >
                ▶ Start {timerPurpose === "task" ? "Task Timer" : "Extra Timer"}
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    if (isTaskRunning || hasTaskTimer) pauseTaskTimer();
                    else if (isExtraRunning || hasExtraTimer) pauseExtraTimer();
                  }}
                  disabled={taskTimerBusy || extraTimerBusy}
                  style={{
                    ...styles.timerCtrlBtn,
                    backgroundColor: isAnyTimerRunning ? C.accent : C.success,
                  }}
                >
                  {isAnyTimerRunning ? "Pause" : "Resume"}
                </button>

                <button
                  onClick={() => {
                    if (isTaskRunning || hasTaskTimer) adjustTaskTimer(30);
                    else if (isExtraRunning || hasExtraTimer) adjustExtraTimer(30);
                  }}
                  disabled={taskTimerBusy || extraTimerBusy}
                  style={{
                    ...styles.timerCtrlBtn,
                    backgroundColor: C.info,
                  }}
                >
                  +30s
                </button>

                <button
                  onClick={() => {
                    if (isTaskRunning || hasTaskTimer) stopTaskTimer();
                    if (isExtraRunning || hasExtraTimer) stopExtraTimer();
                  }}
                  disabled={taskTimerBusy || extraTimerBusy}
                  style={{
                    ...styles.timerCtrlBtn,
                    background: "linear-gradient(180deg, #F87171, #EF4444)",
                  }}
                >
                  Stop
                </button>
              </>
            )}
          </div>
        </Card>

        <Card title="Question Bank & Manifest" span={8} scroll>
          <p style={{ color: C.muted, fontSize: "0.8rem", marginBottom: "0.75rem" }}>
            Select a question to auction. Reward points and time limit are automatically loaded from manifest.
          </p>
          {manifest.length === 0 ? (
            <div style={styles.empty}>No questions in manifest.json</div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", flexWrap: "wrap" }}>
                <select
                  value={qbCategory}
                  onChange={(e) => setQbCategory(e.target.value)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "0.625rem",
                    border: `1px solid ${C.border}`,
                    backgroundColor: C.surface,
                    color: C.text,
                    fontFamily: F.body,
                    fontSize: "0.85rem",
                    fontWeight: 700,
                  }}
                >
                  {qbCategories.map((c) => {
                    const count = manifest.filter((q) => q.category === c).length;
                    return (
                      <option key={c} value={c}>
                        {categoryLabel(c)} ({count})
                      </option>
                    );
                  })}
                  {manifest.some((q) => !q.category) && (
                    <option value="">Uncategorized ({manifest.filter((q) => !q.category).length})</option>
                  )}
                </select>
                <span style={{ fontSize: "0.75rem", color: C.muted }}>
                  {qbFiltered.length} question{qbFiltered.length === 1 ? "" : "s"} in this category
                </span>
              </div>

              {qbFiltered.length === 0 ? (
                <div style={styles.empty}>No questions in this category</div>
              ) : (
                <div style={styles.imageGrid}>
                  {qbFiltered.map((q) => {
                    const isSelected = selectedQuestionId === q.id || phaseQuestion?.id === q.id;
                    return (
                      <div
                        key={q.id}
                        onClick={() => selectQuestion(q.id)}
                        style={{
                          ...styles.imageGridItem,
                          borderColor: isSelected ? C.success : q.used ? `${C.accent}88` : C.border,
                          backgroundColor: isSelected ? `${C.success}15` : q.used ? `${C.accent}08` : C.bg,
                          cursor: "pointer",
                          display: "flex", flexDirection: "column", alignItems: "center",
                          padding: "8px", position: "relative",
                        }}
                      >
                        <img
                          src={`${getServerBase()}/questions/${q.image}`}
                          alt={q.id}
                          style={{ ...styles.imageGridThumb, maxHeight: "80px", objectFit: "contain" }}
                          loading="lazy"
                        />
                        <div style={{ fontWeight: 800, fontSize: "0.85rem", color: C.text, marginTop: "6px", textAlign: "center" }}>
                          {q.title || q.id.toUpperCase()}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: C.accent, fontWeight: 700 }}>
                          {q.reward} pts · {q.time}s
                        </div>
                        {isSelected && (
                          <div style={{
                            fontSize: "0.65rem", fontWeight: 800, color: "#fff",
                            background: "linear-gradient(180deg, #4ADE80, #22C55E)", padding: "2px 8px", borderRadius: "999px", marginTop: "4px",
                          }}>
                            SELECTED
                          </div>
                        )}
                        {q.used && !isSelected && (
                          <div style={{
                            fontSize: "0.65rem", fontWeight: 700, color: C.accent,
                            backgroundColor: `${C.accent}20`, padding: "2px 6px", borderRadius: "999px", marginTop: "4px",
                          }}>
                            USED
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </Card>

        <Card title="Sound Settings" span={4}>
          {/* Collapsible Header */}
          <div
            onClick={() => setSoundPanelOpen(!soundPanelOpen)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              cursor: "pointer", padding: "8px 0", userSelect: "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{
                display: "inline-block", width: "8px", height: "8px",
                borderRadius: "50%", backgroundColor: soundEnabled ? C.success : C.danger,
              }} />
              <span style={{ fontWeight: 600, color: C.text }}>
                {soundEnabled ? "Sounds ON" : "Sounds OFF"}
              </span>
            </div>
            <span style={{ color: C.muted, fontSize: "0.8rem" }}>
              {soundPanelOpen ? "▲ Close" : "▼ Configure"}
            </span>
          </div>

          {/* Collapsible Content */}
          {soundPanelOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "12px", borderTop: `1px solid ${C.border}`, paddingTop: "16px" }}>
              {/* Global Toggle */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 600, color: C.text, fontSize: "0.9rem" }}>Enable All Sounds</span>
                <button
                  onClick={() => {
                    const newEnabled = !soundEnabled;
                    setSoundEnabled(newEnabled);
                    // Apply instantly locally, then broadcast to all clients.
                    soundManager.applySettings({ enabled: newEnabled, volume: soundVolume });
                    socket?.emit("admin:sound_settings", { enabled: newEnabled, volume: soundVolume }, (res) => {
                      if (!res.success) console.error("[Sound] Failed:", res.error);
                    });
                  }}
                  style={{
                    width: "44px", height: "24px", borderRadius: "12px", border: "none",
                    backgroundColor: soundEnabled ? C.success : C.border, cursor: "pointer",
                    position: "relative", transition: "background-color 0.2s ease",
                  }}
                >
                  <div style={{
                    width: "20px", height: "20px", borderRadius: "50%", backgroundColor: "#fff",
                    position: "absolute", top: "2px",
                    left: soundEnabled ? "22px" : "2px",
                    transition: "left 0.2s ease", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }} />
                </button>
              </div>

              {/* Volume Slider */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ fontWeight: 600, color: C.text, fontSize: "0.9rem" }}>Volume</span>
                  <span style={{ fontWeight: 700, color: C.accent, fontSize: "0.85rem" }}>{soundVolume}%</span>
                </div>
                <input
                  type="range" min={0} max={100} value={soundVolume}
                  onChange={(e) => {
                    const vol = parseInt(e.target.value, 10);
                    setSoundVolume(vol);
                    soundManager.applySettings({ enabled: soundEnabled, volume: vol });
                    socket?.emit("admin:sound_settings", { enabled: soundEnabled, volume: vol }, (res) => {
                      if (!res.success) console.error("[Sound] Failed:", res.error);
                    });
                  }}
                  style={{ width: "100%", height: "6px", borderRadius: "3px", backgroundColor: C.border, cursor: "pointer", accentColor: C.accent }}
                />
              </div>

              {/* Sound Test (emit-only): plays on the Live Display, silent here.
                  Admin NEVER plays audio locally — these only emit the bus. */}
              <div>
                <div style={{ fontWeight: 600, color: C.text, fontSize: "0.9rem", marginBottom: "4px" }}>Sound Test → Live Display</div>
                <div style={{ fontSize: "0.75rem", color: C.muted, marginBottom: "8px" }}>
                  Fires the global sound bus. You will hear nothing here — sound plays only on the Live Display.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {(["bid", "win", "pass", "fail", "timer_end", "auction_start"] as const).map((type) => (
                    <div key={type} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
                      <span style={{ fontSize: "0.8rem", color: C.text, fontFamily: "monospace" }}>{type}</span>
                      <button
                        onClick={() => socket?.emit("sound:play", { type })}
                        style={{
                          padding: "4px 12px", borderRadius: "0.75rem", cursor: "pointer",
                          border: `1px solid ${C.accent}`, backgroundColor: `${C.accent}15`,
                          color: C.text, fontSize: "0.75rem", fontWeight: 700,
                        }}
                      >
                        ▶ Test
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Per-Sound Toggles */}
              <div>
                <div style={{ fontWeight: 600, color: C.text, fontSize: "0.9rem", marginBottom: "8px" }}>Individual Sounds</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {(["auction_start", "auction_end", "bid_small", "bid_big", "bid_win", "timer_start", "timer_end", "pass", "fail", "tick"] as const).map((name) => (
                    <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
                      <span style={{ fontSize: "0.8rem", color: C.text, fontFamily: "monospace" }}>{name}</span>
                      <button
                        onClick={() => {
                          const newEnabled = !perSoundEnabled[name];
                          setPerSoundEnabled((prev) => ({ ...prev, [name]: newEnabled }));
                          soundManager.setPerSoundEnabled(name, newEnabled);
                          socket?.emit("admin:sound_per_setting", { soundName: name, enabled: newEnabled }, (res) => {
                            if (!res.success) console.error("[Sound] Failed:", res.error);
                          });
                        }}
                        style={{
                          width: "36px", height: "20px", borderRadius: "10px", border: "none",
                          backgroundColor: perSoundEnabled[name] ? C.success : C.border, cursor: "pointer",
                          position: "relative", transition: "background-color 0.2s ease",
                        }}
                      >
                        <div style={{
                          width: "16px", height: "16px", borderRadius: "50%", backgroundColor: "#fff",
                          position: "absolute", top: "2px",
                          left: perSoundEnabled[name] ? "18px" : "2px",
                          transition: "left 0.2s ease", boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                        }} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* File Upload */}
              <div>
                <div style={{ fontWeight: 600, color: C.text, fontSize: "0.9rem", marginBottom: "8px" }}>Upload Sound Files</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {(["auction_start", "auction_end", "bid_small", "bid_big", "bid_win", "timer_start", "timer_end", "pass", "fail", "tick"] as const).map((name) => {
                    const file = soundFiles.find((f) => f.name === name);
                    const isUploading = uploadingSound === name;
                    return (
                      <div key={name} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem" }}>
                        <span style={{ fontFamily: "monospace", color: C.text, minWidth: "100px" }}>{name}.{file?.ext || "mp3"}</span>
                        <span style={{ color: file?.exists ? C.success : C.muted, fontSize: "0.7rem" }}>
                          {file?.exists ? `✓ ${file.ext || "mp3"}` : "—"}
                        </span>
                        <label style={{
                          marginLeft: "auto", cursor: "pointer", color: C.accent,
                          fontSize: "0.7rem", fontWeight: 600,
                          opacity: isUploading ? 0.5 : 1,
                        }}>
                          {isUploading ? "Uploading..." : "Upload"}
                          <input
                            type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave,.mp3,.wav" style={{ display: "none" }}
                            disabled={isUploading}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) uploadSound(name, file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Row 3: Task Control (6) + Scoreboard (6) */}
        <Card title="Task Control & Resolution" span={6}>
          {phase === "post_bid_idle" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "1.25rem", fontWeight: 800, color: C.accent }}>
                  {phaseWinner?.teamName || "Winning Team"}
                </span>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, padding: "4px 10px", borderRadius: "999px", backgroundColor: `${C.accent}20`, color: C.accent, border: `1px solid ${C.accent}` }}>
                  AUCTION WON · STANDBY
                </span>
              </div>

              {phaseQuestion && (
                <div style={{ fontSize: "0.875rem", color: C.muted, display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                  <span>Question: <strong>{phaseQuestion.id}</strong></span>
                  <span>Reward: <strong>{phaseQuestion.reward} pts</strong></span>
                  <span>Winning Bid: <strong>{phaseBid ?? currentBid} coins</strong> (deducted)</span>
                </div>
              )}

              <div style={{
                padding: "10px 14px", borderRadius: "0.75rem",
                backgroundColor: `${C.accent}12`, border: `1px solid ${C.accent}40`,
                fontSize: "0.85rem", color: C.text,
              }}>
                Coins have been deducted from <strong>{phaseWinner?.teamName || "winner"}</strong>. Task timers are controlled from the <strong>Manual Timer Control</strong> panel above. Verdicts can be submitted directly below at any time.
              </div>

              {/* Direct Verdict Options */}
              <div style={{ display: "flex", gap: "0.75rem", flexDirection: "column" }}>
                <button
                  onClick={passTask}
                  disabled={taskPending}
                  style={{
                    width: "100%", padding: "0.8rem", borderRadius: "1rem",
                    border: "none", background: "linear-gradient(180deg, #4ADE80, #22C55E)", color: C.bg,
                    fontSize: "1rem", fontWeight: 800, cursor: taskPending ? "not-allowed" : "pointer",
                    opacity: taskPending ? 0.6 : 1,
                  }}
                >
                  PASS (Direct Pass, +{phaseQuestion?.reward ?? 100} pts)
                </button>
                <button
                  onClick={failTask}
                  disabled={taskPending}
                  style={{
                    width: "100%", padding: "0.8rem", borderRadius: "1rem",
                    border: "none", background: "linear-gradient(180deg, #F87171, #EF4444)", color: C.bg,
                    fontSize: "1rem", fontWeight: 800, cursor: taskPending ? "not-allowed" : "pointer",
                    opacity: taskPending ? 0.6 : 1,
                  }}
                >
                  FAIL (Direct Fail, 0 pts)
                </button>
                <button
                  onClick={triggerFailWithFallback}
                  disabled={taskPending}
                  style={{
                    width: "100%", padding: "0.8rem", borderRadius: "1rem",
                    border: `1.5px solid ${C.accent}`, backgroundColor: `${C.accent}15`, color: C.accent,
                    fontSize: "0.95rem", fontWeight: 800, cursor: taskPending ? "not-allowed" : "pointer",
                    opacity: taskPending ? 0.6 : 1,
                  }}
                >
                  Fail Winner → Open Fallback Round
                </button>
              </div>
            </div>
          ) : phase === "main_task" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "1.25rem", fontWeight: 800, color: C.accent }}>
                  {phaseWinner?.teamName || "Winning Team"}
                </span>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, padding: "4px 10px", borderRadius: "999px", backgroundColor: `${C.primary}20`, color: C.primary, border: `1px solid ${C.primary}` }}>
                  MAIN TASK ACTIVE
                </span>
              </div>

              {phaseQuestion && (
                <div style={{ fontSize: "0.875rem", color: C.muted, display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                  <span>Question: <strong>{phaseQuestion.id}</strong></span>
                  <span>Reward: <strong>{phaseQuestion.reward} pts</strong></span>
                  <span>Time Limit: <strong>{phaseQuestion.time}s</strong></span>
                </div>
              )}

              <div style={{
                padding: "8px 12px", borderRadius: "0.625rem",
                backgroundColor: `${C.primary}10`, border: `1px solid ${C.primary}30`,
                fontSize: "0.82rem", color: C.text,
              }}>
                Task timer is managed via the <strong>Manual Timer Control</strong> panel above. Verdicts can be issued at any time independently of any timer.
              </div>

              {/* Verdict Section */}
              <div style={{ display: "flex", gap: "0.75rem", flexDirection: "column", marginTop: "0.5rem" }}>
                <button
                  onClick={passTask}
                  disabled={taskPending}
                  style={{
                    width: "100%", padding: "0.875rem", borderRadius: "1rem",
                    border: "none", background: "linear-gradient(180deg, #4ADE80, #22C55E)", color: C.bg,
                    fontSize: "1.05rem", fontWeight: 800, cursor: taskPending ? "not-allowed" : "pointer",
                    opacity: taskPending ? 0.6 : 1,
                  }}
                >
                  PASS (+{phaseQuestion?.reward ?? 100} pts to {phaseWinner?.teamName || "Winner"})
                </button>

                <button
                  onClick={failTask}
                  disabled={taskPending}
                  style={{
                    width: "100%", padding: "0.875rem", borderRadius: "1rem",
                    border: "none", background: "linear-gradient(180deg, #F87171, #EF4444)", color: C.bg,
                    fontSize: "1rem", fontWeight: 800, cursor: taskPending ? "not-allowed" : "pointer",
                    opacity: taskPending ? 0.6 : 1,
                  }}
                >
                  Direct FAIL (0 pts, End Round)
                </button>

                <button
                  onClick={triggerFailWithFallback}
                  disabled={taskPending}
                  style={{
                    width: "100%", padding: "0.875rem", borderRadius: "1rem",
                    border: `1.5px solid ${C.accent}`, backgroundColor: `${C.accent}15`, color: C.accent,
                    fontSize: "1rem", fontWeight: 800, cursor: taskPending ? "not-allowed" : "pointer",
                    opacity: taskPending ? 0.6 : 1,
                  }}
                >
                  FAIL Winner → Open Fallback Round
                </button>
              </div>
            </div>
          ) : phase === "fallback_idle" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "1.25rem", fontWeight: 800, color: C.accent }}>
                  FALLBACK ROUND (STANDBY)
                </span>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, padding: "4px 10px", borderRadius: "999px", backgroundColor: `${C.danger}20`, color: C.danger, border: `1px solid ${C.danger}` }}>
                  WINNER FAILED (0 PTS)
                </span>
              </div>

              <div style={{
                padding: "10px 14px", borderRadius: "0.75rem",
                backgroundColor: `${C.accent}10`, border: `1px solid ${C.accent}40`,
                fontSize: "0.85rem", color: C.text,
              }}>
                Primary team {phaseWinner?.teamName ? `(${phaseWinner.teamName})` : ""} failed. Fallback is open to other teams. If a countdown is needed on the Live Display, start an Extra Timer using the <strong>Manual Timer Control</strong> panel above.
              </div>

              {/* Fallback Team Selection & Award */}
              <div style={{
                padding: "1rem", borderRadius: "1rem",
                backgroundColor: C.surface, border: `1px solid ${C.border}`,
                display: "flex", flexDirection: "column", gap: "0.75rem",
              }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: C.text }}>
                  Award Fallback to Solving Team
                </span>
                <select
                  value={fallbackTeamId}
                  onChange={(e) => setFallbackTeamId(e.target.value)}
                  disabled={fallbackBusy}
                  style={{
                    width: "100%", padding: "0.6rem 0.75rem", borderRadius: "0.75rem",
                    border: `1px solid ${C.border}`, backgroundColor: C.bg, color: C.text,
                    fontSize: "0.9rem",
                  }}
                >
                  <option value="">-- Select team who solved --</option>
                  {scoreboard
                    .filter((t) => t.teamId !== phaseWinner?.teamId)
                    .map((t) => (
                      <option key={t.teamId} value={t.teamId}>
                        {t.teamName} (Points: {t.reward_points}, Coins: {t.bid_coins})
                      </option>
                    ))}
                </select>

                <button
                  onClick={submitFallbackPass}
                  disabled={!fallbackTeamId || fallbackBusy}
                  style={{
                    padding: "0.75rem", borderRadius: "0.75rem", border: "none",
                    background: "linear-gradient(180deg, #4ADE80, #22C55E)", color: C.bg, fontWeight: 800, fontSize: "0.95rem",
                    cursor: !fallbackTeamId || fallbackBusy ? "not-allowed" : "pointer",
                    opacity: !fallbackTeamId || fallbackBusy ? 0.5 : 1,
                  }}
                >
                  Award Points (+{phaseQuestion?.reward ?? 100} pts) & End Round
                </button>

                <button
                  onClick={submitFallbackFail}
                  disabled={fallbackBusy}
                  style={{
                    padding: "0.75rem", borderRadius: "0.75rem",
                    border: `1px solid ${C.border}`, backgroundColor: "transparent", color: C.text,
                    fontWeight: 700, fontSize: "0.9rem", cursor: fallbackBusy ? "not-allowed" : "pointer",
                  }}
                >
                  No Team Solved (End Fallback with 0 pts)
                </button>
              </div>
            </div>
          ) : phase === "fallback_active" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "1.25rem", fontWeight: 800, color: C.accent }}>
                  FALLBACK IN PROGRESS
                </span>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, padding: "4px 10px", borderRadius: "999px", backgroundColor: `${C.accent}20`, color: C.accent, border: `1px solid ${C.accent}` }}>
                  EXTRA TIMER RUNNING
                </span>
              </div>

              <div style={{
                padding: "8px 12px", borderRadius: "0.625rem",
                backgroundColor: `${C.accent}12`, border: `1px solid ${C.accent}40`,
                fontSize: "0.82rem", color: C.text,
              }}>
                Fallback timer is running on Live Display and managed via the <strong>Manual Timer Control</strong> panel above. Award fallback points below when a team solves.
              </div>

              {/* Fallback Award / Fail */}
              <div style={{
                padding: "1rem", borderRadius: "1rem",
                backgroundColor: C.surface, border: `1px solid ${C.border}`,
                display: "flex", flexDirection: "column", gap: "0.75rem",
              }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: C.text }}>
                  Award Fallback to Solving Team
                </span>
                <select
                  value={fallbackTeamId}
                  onChange={(e) => setFallbackTeamId(e.target.value)}
                  disabled={fallbackBusy}
                  style={{
                    width: "100%", padding: "0.6rem 0.75rem", borderRadius: "0.75rem",
                    border: `1px solid ${C.border}`, backgroundColor: C.bg, color: C.text,
                    fontSize: "0.9rem",
                  }}
                >
                  <option value="">-- Select team who solved --</option>
                  {scoreboard
                    .filter((t) => t.teamId !== phaseWinner?.teamId)
                    .map((t) => (
                      <option key={t.teamId} value={t.teamId}>
                        {t.teamName} (Points: {t.reward_points}, Coins: {t.bid_coins})
                      </option>
                    ))}
                </select>

                <button
                  onClick={submitFallbackPass}
                  disabled={!fallbackTeamId || fallbackBusy}
                  style={{
                    padding: "0.75rem", borderRadius: "0.75rem", border: "none",
                    background: "linear-gradient(180deg, #4ADE80, #22C55E)", color: C.bg, fontWeight: 800, fontSize: "0.95rem",
                    cursor: !fallbackTeamId || fallbackBusy ? "not-allowed" : "pointer",
                    opacity: !fallbackTeamId || fallbackBusy ? 0.5 : 1,
                  }}
                >
                  Award Points (+{phaseQuestion?.reward ?? 100} pts) & End Round
                </button>

                <button
                  onClick={submitFallbackFail}
                  disabled={fallbackBusy}
                  style={{
                    padding: "0.75rem", borderRadius: "0.75rem",
                    border: `1px solid ${C.border}`, backgroundColor: "transparent", color: C.text,
                    fontWeight: 700, fontSize: "0.9rem", cursor: fallbackBusy ? "not-allowed" : "pointer",
                  }}
                >
                  No Team Solved (End Fallback with 0 pts)
                </button>
              </div>
            </div>
          ) : phase === "result_display" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", textAlign: "center", padding: "1.5rem" }}>
              <div style={{ fontSize: "1.2rem", fontWeight: 800, color: C.success }}>
                RESULT DISPLAY LOCKED (5.0s)
              </div>
              <div style={{ fontSize: "0.9rem", color: C.muted }}>
                Verdict is currently displayed on all screens. The system will automatically reset to idle in 5 seconds.
              </div>
              <button
                onClick={endRound}
                disabled={endRoundBusy}
                style={{
                  ...styles.startBtn,
                  background: `linear-gradient(180deg, ${C.primaryLight}, ${C.primary})`,
                  marginTop: "0.5rem",
                }}
              >
                Force Reset Now (Bypass 5s)
              </button>
            </div>
          ) : phase === "ended" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", textAlign: "center", padding: "1rem" }}>
              <div style={{ fontSize: "1.2rem", fontWeight: 800, color: C.text }}>
                Round Completed
              </div>
              <div style={{ fontSize: "0.9rem", color: C.muted }}>
                {phaseWinner
                  ? `Winner: ${phaseWinner.teamName} · Final Bid: ${phaseBid ?? 0} coins`
                  : "No winner for this round."}
              </div>
              <button
                onClick={endRound}
                disabled={endRoundBusy}
                style={{
                  ...styles.startBtn,
                  background: `linear-gradient(180deg, ${C.primaryLight}, ${C.primary})`,
                  marginTop: "0.5rem",
                }}
              >
                Reset & Prepare Next Auction
              </button>
            </div>
          ) : phase === "bidding" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", textAlign: "center", padding: "1.5rem 0" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Auction In Progress
              </span>
              <div style={{ ...styles.taskTimer, color: C.accent }}>
                {formatClock((biddingTimer ? biddingTimer.remaining : timer) ?? 0)}
              </div>
              <div style={{ fontSize: "0.85rem", color: C.muted }}>
                Auction timer is running. On win, coins will be deducted and round will wait for admin to start task timer.
              </div>
            </div>
          ) : (
            <div style={styles.empty}>
              No active task. Select a question above and click "Start Auction (60s)".
            </div>
          )}
        </Card>

        <Card title="Scoreboard" span={6} scroll>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: "12px", padding: "10px 14px", marginBottom: "14px",
            borderRadius: "0.75rem", backgroundColor: resultsRevealed ? `${C.accent}18` : C.bg,
            border: resultsRevealed ? `1.5px solid ${C.accent}` : "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Winners
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  onClick={() => setWinnerCountValue(winnerCount - 1)}
                  disabled={winnerCount <= 1}
                  style={{
                    width: "26px", height: "26px", borderRadius: "999px", border: `1px solid ${C.border}`,
                    backgroundColor: C.surface, color: C.text, fontWeight: 700, cursor: winnerCount <= 1 ? "not-allowed" : "pointer",
                    opacity: winnerCount <= 1 ? 0.4 : 1,
                  }}
                >
                  −
                </button>
                <span style={{ minWidth: "24px", textAlign: "center", fontWeight: 800, color: C.primary, fontSize: "1rem" }}>
                  {winnerCount}
                </span>
                <button
                  onClick={() => setWinnerCountValue(winnerCount + 1)}
                  disabled={winnerCount >= 10}
                  style={{
                    width: "26px", height: "26px", borderRadius: "999px", border: `1px solid ${C.border}`,
                    backgroundColor: C.surface, color: C.text, fontWeight: 700, cursor: winnerCount >= 10 ? "not-allowed" : "pointer",
                    opacity: winnerCount >= 10 ? 0.4 : 1,
                  }}
                >
                  +
                </button>
              </div>
            </div>
            <button
              onClick={resultsRevealed ? hideResults : revealResults}
              disabled={resultsBusy}
              style={{
                padding: "8px 16px", borderRadius: "0.75rem", border: "none",
                background: resultsRevealed
                  ? "linear-gradient(180deg, #94A3B8, #64748B)"
                  : `linear-gradient(180deg, ${C.accentLight}, ${C.accent})`,
                color: resultsRevealed ? "#fff" : C.primaryDark,
                fontWeight: 800, fontSize: "0.8rem", cursor: resultsBusy ? "not-allowed" : "pointer",
                opacity: resultsBusy ? 0.6 : 1, whiteSpace: "nowrap",
              }}
            >
              {resultsRevealed ? "Back to Live" : "Reveal Final Results"}
            </button>
          </div>
          <div style={styles.scoreTable}>
            <div style={styles.tableHeader}>
              <span style={styles.colRank}>#</span><span style={styles.colName}>Team</span><span style={styles.colCoins}>Coins</span><span style={styles.colPoints}>Points</span><span style={styles.colBids}>Bids</span>
            </div>
            {scoreboard.map((t, i) => (
              <div key={t.teamId} style={{ ...styles.tableRow, backgroundColor: i % 2 === 0 ? C.surface : C.bg }}>
                <span style={styles.colRank}>{i + 1}</span>
                <span style={styles.colName}>{t.teamName}</span>
                <span style={{ ...styles.colCoins, color: t.bid_coins < 200 ? C.danger : C.accent }}>{t.bid_coins}</span>
                <span style={{ ...styles.colPoints, color: C.info }}>{t.reward_points}</span>
                <span style={{ ...styles.colBids, color: C.muted }}>{t.totalBids}</span>
              </div>
            ))}
            {scoreboard.length === 0 && <div style={styles.empty}>No teams registered yet</div>}
          </div>
        </Card>

        <Card title="Data Management" span={12}>
          {/* Collapsible Header */}
          <div
            onClick={() => {
              const nextState = !dataPanelOpen;
              setDataPanelOpen(nextState);
              if (nextState) {
                // Fetch teams when opening
                fetch(`${getServerBase()}/admin/teams`, {
                  headers: { "x-admin-secret": secret },
                })
                  .then((r) => r.json())
                  .then((data) => {
                    if (data.success) setAllTeams(data.teams);
                  })
                  .catch((err) => console.error("[Data] Failed to fetch teams:", err));
              }
            }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              cursor: "pointer", padding: "8px 0", userSelect: "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{
                display: "inline-block", width: "8px", height: "8px",
                borderRadius: "50%", backgroundColor: C.info,
              }} />
              <span style={{ fontWeight: 600, color: C.text }}>
                Teams Database ({allTeams.length} teams)
              </span>
            </div>
            <span style={{ color: C.muted, fontSize: "0.8rem" }}>
              {dataPanelOpen ? "▲ Close" : "▼ View & Edit"}
            </span>
          </div>

          {/* Collapsible Content */}
          {dataPanelOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "12px", borderTop: `1px solid ${C.border}`, paddingTop: "16px" }}>
              {/* Controls Header Row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    onClick={() => {
                      fetch(`${getServerBase()}/admin/teams`, {
                        headers: { "x-admin-secret": secret },
                      })
                        .then((r) => r.json())
                        .then((data) => {
                          if (data.success) {
                            setAllTeams(data.teams);
                            fetchPoolStats();
                            setDataToast({ type: "success", text: "Teams & pool refreshed" });
                            setTimeout(() => setDataToast(null), 2000);
                          }
                        })
                        .catch((err) => {
                          console.error("[Data] Failed to refresh teams:", err);
                          setDataToast({ type: "error", text: "Failed to refresh" });
                          setTimeout(() => setDataToast(null), 3000);
                        });
                    }}
                    style={{
                      padding: "8px 16px", borderRadius: "0.625rem",
                      border: `1px solid ${C.border}`, backgroundColor: C.surface,
                      cursor: "pointer", fontFamily: F.body, fontWeight: 600,
                      fontSize: "0.8rem", color: C.text,
                    }}
                  >
                    ↻ Refresh Data
                  </button>

                  {poolStats && (
                    <div style={{
                      padding: "6px 14px", borderRadius: "0.625rem",
                      backgroundColor: `${C.accent}15`, border: `1px solid ${C.accent}40`,
                      fontFamily: F.mono, fontSize: "0.8rem", color: C.accent, fontWeight: 700,
                    }}>
                      Pool Capacity: {poolStats.assigned} assigned / {poolStats.total} total ({poolStats.remaining} available)
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setResetPoolConfirm(true)}
                  disabled={dataBusy}
                  style={{
                    padding: "8px 14px", borderRadius: "0.625rem",
                    border: `1px solid ${C.border}`, backgroundColor: `${C.danger}15`,
                    cursor: dataBusy ? "not-allowed" : "pointer", fontFamily: F.body, fontWeight: 600,
                    fontSize: "0.8rem", color: C.danger,
                  }}
                  title="Reset team pool assignments"
                >
                  ↺ Reset Team Pool
                </button>
              </div>

              {/* Teams Table */}
              {allTeams.length === 0 ? (
                <div style={{ color: C.muted, fontSize: "0.85rem", textAlign: "center", padding: "16px" }}>
                  No teams registered yet
                </div>
              ) : (
                <div style={{ overflowX: "auto", maxHeight: "400px", overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${C.border}`, position: "sticky", top: 0, backgroundColor: C.surface }}>
                        <th style={tableHeaderStyle}>Team Name</th>
                        <th style={tableHeaderStyle}>Player 1</th>
                        <th style={tableHeaderStyle}>Player 2</th>
                        <th style={tableHeaderStyle}>Email</th>
                        <th style={tableHeaderStyle}>Phone</th>
                        <th style={tableHeaderStyle}>Coins</th>
                        <th style={tableHeaderStyle}>Points</th>
                        <th style={{ ...tableHeaderStyle, textAlign: "center" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allTeams.map((team, i) => {
                        const edit = dataEdits[team.teamId];
                        return (
                          <tr key={team.teamId} style={{ borderBottom: `1px solid ${C.border}`, backgroundColor: i % 2 === 0 ? C.bg : C.surface }}>
                            <td style={{ ...tableCellStyle, fontWeight: 600 }}>{team.teamName}</td>
                            <td style={tableCellStyle}>{team.player1}</td>
                            <td style={tableCellStyle}>{team.player2}</td>
                            <td style={tableCellStyle}>
                              <input
                                type="email"
                                value={edit?.email ?? team.email ?? ""}
                                onChange={(e) => setDataEdits((prev) => ({ ...prev, [team.teamId]: { ...prev[team.teamId], email: e.target.value } }))}
                                style={{ ...tableInputStyle, minWidth: "160px" }}
                                disabled={dataBusy}
                              />
                            </td>
                            <td style={tableCellStyle}>
                              <input
                                type="text"
                                value={edit?.phone ?? team.phone ?? ""}
                                onChange={(e) => setDataEdits((prev) => ({ ...prev, [team.teamId]: { ...prev[team.teamId], phone: e.target.value } }))}
                                style={{ ...tableInputStyle, minWidth: "110px" }}
                                disabled={dataBusy}
                              />
                            </td>
                            <td style={tableCellStyle}>
                              <input
                                type="number"
                                min={0}
                                value={edit?.bid_coins ?? team.bid_coins ?? 0}
                                onChange={(e) => setDataEdits((prev) => ({ ...prev, [team.teamId]: { ...prev[team.teamId], bid_coins: parseInt(e.target.value, 10) || 0 } }))}
                                style={{ ...tableInputStyle, width: "70px" }}
                                disabled={dataBusy}
                              />
                            </td>
                            <td style={tableCellStyle}>
                              <input
                                type="number"
                                min={0}
                                value={edit?.reward_points ?? team.reward_points ?? 0}
                                onChange={(e) => setDataEdits((prev) => ({ ...prev, [team.teamId]: { ...prev[team.teamId], reward_points: parseInt(e.target.value, 10) || 0 } }))}
                                style={{ ...tableInputStyle, width: "70px" }}
                                disabled={dataBusy}
                              />
                            </td>
                            <td style={{ ...tableCellStyle, textAlign: "center" }}>
                              <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                                <button
                                  onClick={() => setDataConfirm({ teamId: team.teamId, teamName: team.teamName })}
                                  disabled={!edit || dataBusy}
                                  style={{
                                    padding: "5px 12px", borderRadius: "999px",
                                    border: "none",
                                    backgroundColor: edit ? C.success : C.border,
                                    color: edit ? "#fff" : C.muted,
                                    cursor: (!edit || dataBusy) ? "not-allowed" : "pointer",
                                    fontWeight: 600, fontSize: "0.75rem",
                                    opacity: (!edit || dataBusy) ? 0.4 : 1,
                                    transition: "all 0.15s ease",
                                  }}
                                  title={edit ? "Save changes to team" : "Edit a field to save"}
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm({ teamId: team.teamId, teamName: team.teamName })}
                                  disabled={dataBusy}
                                  style={{
                                    padding: "5px 10px", borderRadius: "999px",
                                    border: "none",
                                    background: "linear-gradient(180deg, #F87171, #EF4444)",
                                    color: "#fff",
                                    cursor: dataBusy ? "not-allowed" : "pointer",
                                    fontWeight: 600, fontSize: "0.75rem",
                                    opacity: dataBusy ? 0.4 : 1,
                                    transition: "all 0.15s ease",
                                  }}
                                  title="Delete team from database"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card title="Theme Settings" span={4}>
          <p style={{ color: C.muted, fontSize: "0.8rem", marginBottom: "0.75rem" }}>Switch theme across all connected screens.</p>
          <div style={{ display: "flex", gap: "8px" }}>
            {(["default", "bidforc"] as const).map((themeOption) => (
              <button
                key={themeOption}
                onClick={() => {
                  socket?.emit("admin:theme", { theme: themeOption }, (res) => {
                    if (!res.success) console.error("[Theme] Failed:", res.error);
                  });
                }}
                style={{
                  flex: 1, padding: "12px 16px", borderRadius: "0.75rem",
                  border: `2px solid ${C.border}`,
                  backgroundColor: C.surface,
                  cursor: "pointer", transition: "all 0.2s ease",
                  fontFamily: F.heading, fontWeight: 600, fontSize: "0.85rem",
                  color: C.text,
                }}
              >
                {themeOption === "default" ? "Default" : "Bid for C"}
              </button>
            ))}
          </div>
        </Card>

        <Card title="Team Management" span={8} scroll>
          <p style={{ color: C.muted, fontSize: "0.8rem", marginBottom: "0.75rem" }}>Edit bid coins and reward points. Changes persist to the database.</p>
          {scoreboard.length === 0 ? (
            <div style={styles.empty}>No teams to manage</div>
          ) : (
            <div style={styles.teamTable}>
              <div style={styles.teamTableHeader}>
                <span style={styles.tmColName}>Team</span>
                <span style={styles.tmColInput}>Coins</span>
                <span style={styles.tmColInput}>Points</span>
                <span style={styles.tmColAction}>Action</span>
              </div>
              {scoreboard.map((t, i) => {
                const edit = teamEdits[t.teamId];
                const coinsStr = edit?.bid_coins !== undefined ? String(edit.bid_coins) : "";
                const ptsStr = edit?.reward_points !== undefined ? String(edit.reward_points) : "";
                return (
                  <div key={t.teamId} style={{ ...styles.teamTableRow, backgroundColor: i % 2 === 0 ? C.surface : C.bg }}>
                    <span style={styles.tmColName}>{t.teamName}</span>
                    <input style={styles.tmInput} type="number" min={0} placeholder={String(t.bid_coins)} value={coinsStr} onChange={(e) => { const v = e.target.value === "" ? undefined : parseInt(e.target.value, 10); setTeamEdits((prev) => ({ ...prev, [t.teamId]: { ...prev[t.teamId], bid_coins: v } })); }} disabled={teamBusy} />
                    <input style={styles.tmInput} type="number" min={0} placeholder={String(t.reward_points)} value={ptsStr} onChange={(e) => { const v = e.target.value === "" ? undefined : parseInt(e.target.value, 10); setTeamEdits((prev) => ({ ...prev, [t.teamId]: { ...prev[t.teamId], reward_points: v } })); }} disabled={teamBusy} />
                    <button style={{ ...styles.tmApplyBtn, opacity: (!edit || teamBusy) ? 0.5 : 1, cursor: (!edit || teamBusy) ? "not-allowed" : "pointer" }} disabled={!edit || teamBusy} onClick={() => setTeamConfirm({ teamId: t.teamId, teamName: t.teamName })}>Apply</button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

      </div>

      {/* Team update confirmation modal */}
      {teamConfirm && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>Confirm Team Update</h3>
            <p style={styles.modalText}>
              Apply changes to <strong>{teamConfirm.teamName}</strong>?
            </p>
            {teamEdits[teamConfirm.teamId] && (
              <div style={styles.modalChanges}>
                {teamEdits[teamConfirm.teamId].bid_coins !== undefined && (
                  <div>bid_coins → <strong>{teamEdits[teamConfirm.teamId].bid_coins}</strong></div>
                )}
                {teamEdits[teamConfirm.teamId].reward_points !== undefined && (
                  <div>reward_points → <strong>{teamEdits[teamConfirm.teamId].reward_points}</strong></div>
                )}
              </div>
            )}
            <div style={styles.modalActions}>
              <button
                onClick={() => applyTeamUpdate(teamConfirm.teamId)}
                disabled={teamBusy}
                style={styles.modalConfirmBtn}
              >
                {teamBusy ? "Applying…" : "Confirm"}
              </button>
              <button
                onClick={() => setTeamConfirm(null)}
                disabled={teamBusy}
                style={styles.modalCancelBtn}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Data Management team update confirmation modal */}
      {dataConfirm && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>Confirm Team Update</h3>
            <p style={styles.modalText}>
              Save changes to <strong>{dataConfirm.teamName}</strong>?
            </p>
            {dataEdits[dataConfirm.teamId] && (
              <div style={styles.modalChanges}>
                {dataEdits[dataConfirm.teamId].bid_coins !== undefined && (
                  <div>Coins → <strong>{dataEdits[dataConfirm.teamId].bid_coins}</strong></div>
                )}
                {dataEdits[dataConfirm.teamId].reward_points !== undefined && (
                  <div>Points → <strong>{dataEdits[dataConfirm.teamId].reward_points}</strong></div>
                )}
                {dataEdits[dataConfirm.teamId].email !== undefined && (
                  <div>Email → <strong>{dataEdits[dataConfirm.teamId].email}</strong></div>
                )}
                {dataEdits[dataConfirm.teamId].phone !== undefined && (
                  <div>Phone → <strong>{dataEdits[dataConfirm.teamId].phone}</strong></div>
                )}
              </div>
            )}
            <div style={styles.modalActions}>
              <button
                onClick={() => applyDataUpdate(dataConfirm.teamId)}
                disabled={dataBusy}
                style={styles.modalConfirmBtn}
              >
                {dataBusy ? "Saving…" : "Confirm"}
              </button>
              <button
                onClick={() => setDataConfirm(null)}
                disabled={dataBusy}
                style={styles.modalCancelBtn}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Team confirmation modal */}
      {deleteConfirm && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={{ ...styles.modalTitle, color: C.danger }}>Delete Team</h3>
            <p style={styles.modalText}>
              Are you sure you want to permanently delete <strong>{deleteConfirm.teamName}</strong> from the database?
            </p>
            <p style={{ color: C.danger, fontSize: "0.85rem", marginTop: "-8px", marginBottom: "20px", lineHeight: "1.4" }}>
              ⚠️ This will remove their registration, session, and bid history. This action cannot be undone.
            </p>
            <div style={styles.modalActions}>
              <button
                onClick={() => handleDeleteTeam(deleteConfirm.teamId)}
                disabled={dataBusy}
                style={{ ...styles.modalConfirmBtn, background: "linear-gradient(180deg, #F87171, #EF4444)" }}
              >
                {dataBusy ? "Deleting…" : "Yes, Delete"}
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={dataBusy}
                style={styles.modalCancelBtn}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Team Pool confirmation modal */}
      {resetPoolConfirm && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={{ ...styles.modalTitle, color: C.accent }}>Reset Team Pool</h3>
            <p style={styles.modalText}>
              Are you sure you want to reset pool assignments?
            </p>
            <p style={{ color: C.muted, fontSize: "0.85rem", lineHeight: "1.4" }}>
              This will mark all pool team names that are not actively registered in the database as available for new teams.
            </p>
            <div style={styles.modalActions}>
              <button
                onClick={() => {
                  setDataBusy(true);
                  socket?.emit("admin:reset_team_pool" as any, {}, (res: any) => {
                    setDataBusy(false);
                    setResetPoolConfirm(false);
                    if (res && res.success) {
                      setPoolStats(res.stats);
                      setDataToast({ type: "success", text: "Team pool reset successfully!" });
                      setTimeout(() => setDataToast(null), 3000);
                    } else {
                      setDataToast({ type: "error", text: res?.error || "Reset failed" });
                      setTimeout(() => setDataToast(null), 3000);
                    }
                  });
                }}
                disabled={dataBusy}
                style={{ ...styles.modalConfirmBtn, background: `linear-gradient(180deg, ${C.accentLight}, ${C.accent})`, color: C.bg }}
              >
                {dataBusy ? "Resetting…" : "Confirm Reset"}
              </button>
              <button
                onClick={() => setResetPoolConfirm(false)}
                disabled={dataBusy}
                style={styles.modalCancelBtn}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Data Management Toast Notification */}
      {dataToast && (
        <div style={{
          position: "fixed", top: "24px", right: "24px",
          backgroundColor: dataToast.type === "success" ? C.success : C.danger,
          color: "#FFFFFF", fontFamily: F.heading, fontWeight: 700, fontSize: "0.9rem",
          padding: "12px 24px", borderRadius: tokens.radius.md,
          boxShadow: tokens.shadow.lg, zIndex: 9999,
          display: "flex", alignItems: "center", gap: "8px",
        }}>
          <span>{dataToast.type === "success" ? "✓" : "⚠"}</span>
          <span>{dataToast.text}</span>
        </div>
      )}
    </div>
  );
}

/* ─── 12-column grid style ─── */
const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(12, 1fr)",
  gap: "24px",
  maxWidth: "1400px",
  width: "100%",
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    backgroundColor: C.bg,
    color: C.text,
    fontFamily: F.body,
    padding: "48px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "24px",
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: "bold",
    color: C.text,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(12, 1fr)",
    gap: "24px",
    maxWidth: "1400px",
  },
  keyInput: {
    width: "100%",
    padding: "0.75rem 1rem",
    borderRadius: "1rem",
    border: `1px solid ${C.border}`,
    backgroundColor: C.bg,
    color: C.text,
    fontSize: "1rem",
    outline: "none",
    marginBottom: "0.75rem",
    boxSizing: "border-box",
  },
  taskInfo: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.75rem",
    textAlign: "center",
  },
  taskTeam: {
    fontSize: "1.5rem",
    fontWeight: "bold",
    color: C.info,
  },
  taskQuestion: {
    fontSize: "1.125rem",
    fontWeight: 600,
    color: C.text,
    textAlign: "center",
  },
  bankRow: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
    marginBottom: "0.75rem",
    fontSize: "0.875rem",
    color: C.muted,
  },
  modeSelect: {
    padding: "0.5rem",
    borderRadius: "0.75rem",
    border: `1px solid ${C.border}`,
    backgroundColor: C.bg,
    color: C.text,
    fontSize: "0.875rem",
  },
  importBtn: {
    padding: "0.5rem 1rem",
    borderRadius: "0.75rem",
    border: "none",
    backgroundColor: C.info,
    color: C.bg,
    fontSize: "0.875rem",
    fontWeight: "bold",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  selectedBox: {
    padding: "0.75rem",
    borderRadius: "0.75rem",
    backgroundColor: C.bg,
    border: `1px solid ${C.success}`,
    color: C.text,
    fontSize: "0.875rem",
    marginBottom: "0.75rem",
  },
  ddRow: {
    display: "flex",
    gap: "0.75rem",
    marginTop: "0.75rem",
  },
  ddField: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    minWidth: 0,
  },
  ddLabel: {
    fontSize: "0.875rem",
    fontWeight: "bold",
    color: C.muted,
  },
  ddSelect: {
    width: "100%",
    padding: "0.75rem",
    borderRadius: "1rem",
    border: `1px solid ${C.border}`,
    backgroundColor: C.bg,
    color: C.text,
    fontSize: "0.95rem",
    outline: "none",
    boxSizing: "border-box",
  },
  ddEmpty: {
    fontSize: "0.875rem",
    fontWeight: "bold",
    color: C.danger,
    marginTop: "0.25rem",
  },
  qSelectBtn: {
    padding: "0.375rem 0.75rem",
    borderRadius: "0.75rem",
    border: "none",
    background: "linear-gradient(180deg, #4ADE80, #22C55E)",
    color: C.bg,
    fontSize: "0.875rem",
    fontWeight: "bold",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  qConfirmBtn: {
    padding: "0.375rem 0.75rem",
    borderRadius: "0.75rem",
    border: "none",
    background: `linear-gradient(180deg, ${C.accentLight}, ${C.accent})`,
    color: C.bg,
    fontSize: "0.875rem",
    fontWeight: "bold",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  useQuestionBtn: {
    width: "100%",
    padding: "0.85rem 1.5rem",
    borderRadius: "1rem",
    border: "none",
    background: "linear-gradient(180deg, #4ADE80, #22C55E)",
    color: C.bg,
    fontSize: "1.1rem",
    fontWeight: 800,
    cursor: "pointer",
    transition: "all 0.2s ease",
    marginTop: "0.75rem",
    boxShadow: `0 4px 14px ${C.success}44`,
  },
  previewContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    marginTop: "1rem",
    padding: "1rem",
    borderRadius: "1rem",
    backgroundColor: C.bg,
    border: `1px solid ${C.border}`,
  },
  previewHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "0.5rem",
  },
  previewTitle: {
    fontFamily: F.body, fontWeight: 600, fontSize: "0.75rem",
    color: C.accent, textTransform: "uppercase" as const,
    letterSpacing: "0.18em",
  },
  previewBadges: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
    flexWrap: "wrap",
  },
  previewDifficultyBadge: {
    fontSize: "0.75rem",
    fontWeight: 800,
    color: C.bg,
    backgroundColor: C.info,
    padding: "2px 8px",
    borderRadius: "999px",
  },
  previewMetaBadge: {
    ...tabular,
    fontSize: "0.75rem",
    fontWeight: 700,
    color: C.text,
    backgroundColor: C.border,
    padding: "2px 8px",
    borderRadius: "999px",
  },
  previewScrollWrap: {
    width: "100%",
    overflowY: "auto",
    maxHeight: "360px",
  },
  selectedHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.875rem",
    color: C.muted,
    marginBottom: "0.5rem",
  },
  bankWarning: {
    padding: "0.75rem",
    borderRadius: "0.75rem",
    backgroundColor: C.bg,
    border: `1px solid ${C.danger}`,
    color: C.danger,
    fontSize: "0.875rem",
    fontWeight: "bold",
    marginBottom: "0.5rem",
  },
  taskMeta: {
    fontSize: "1rem",
    color: C.muted,
    fontVariantNumeric: "tabular-nums",
  },
  taskTimer: {
    fontSize: "3rem",
    fontWeight: 800,
    color: C.text,
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1,
  },
  timeUpNote: {
    fontSize: "1rem",
    fontWeight: "bold",
    color: C.danger,
  },
  timerRow: {
    display: "flex",
    gap: "0.5rem",
    width: "100%",
  },
  timerBtn: {
    flex: 1,
    padding: "0.6rem 0.25rem",
    borderRadius: "1rem",
    border: `1px solid ${C.border}`,
    backgroundColor: C.bg,
    color: C.text,
    fontSize: "0.95rem",
    fontWeight: "bold",
    cursor: "pointer",
    fontVariantNumeric: "tabular-nums",
  },
  pausedNote: {
    fontSize: "1rem",
    fontWeight: "bold",
    color: C.accent,
  },
  rewardRow: {
    display: "flex",
    gap: "0.75rem",
    width: "100%",
  },
  rewardInput: {
    width: "5rem",
    padding: "0.75rem",
    borderRadius: "1rem",
    border: `1px solid ${C.border}`,
    backgroundColor: C.bg,
    color: C.text,
    fontSize: "1.125rem",
    fontWeight: "bold",
    textAlign: "center",
    outline: "none",
  },
  passBtn: {
    flex: 1,
    padding: "0.75rem",
    borderRadius: "1rem",
    border: "none",
    background: "linear-gradient(180deg, #4ADE80, #22C55E)",
    color: C.bg,
    fontSize: "1.125rem",
    fontWeight: "bold",
    cursor: "pointer",
  },
  failBtn: {
    width: "100%",
    padding: "0.75rem",
    borderRadius: "1rem",
    border: "none",
    background: "linear-gradient(180deg, #F87171, #EF4444)",
    color: C.bg,
    fontSize: "1.125rem",
    fontWeight: "bold",
    cursor: "pointer",
  },
  confirmRow: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    width: "100%",
  },
  confirmText: {
    fontSize: "0.875rem",
    color: C.danger,
    fontWeight: "bold",
  },
  cancelBtn: {
    width: "100%",
    padding: "0.5rem",
    borderRadius: "1rem",
    border: `1px solid ${C.border}`,
    backgroundColor: "transparent",
    color: C.muted,
    fontSize: "0.875rem",
    cursor: "pointer",
  },
  startBtn: {
    width: "100%",
    padding: "1rem",
    borderRadius: "1rem",
    border: "none",
    background: "linear-gradient(180deg, #4ADE80, #22C55E)",
    color: C.bg,
    fontSize: "1.125rem",
    fontWeight: "bold",
    cursor: "pointer",
  },
  startHint: {
    fontSize: "0.875rem",
    fontWeight: "bold",
    color: C.accent,
    textAlign: "center",
    marginBottom: "0.5rem",
  },
  auctionInfo: {
    marginTop: "1.5rem",
    textAlign: "center",
  },
  timerLarge: {
    ...tabular,
    fontSize: "4rem",
    fontWeight: 800,
    lineHeight: 1,
    marginBottom: "1rem",
  },
  bidSection: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.25rem",
  },
  bidLabel: {
    fontSize: "0.875rem",
    color: C.muted,
  },
  bidValue: {
    ...tabular,
    fontSize: "2rem",
    fontWeight: "bold",
    color: C.accent,
  },
  leadingTeam: {
    marginTop: "0.75rem",
    fontSize: "1rem",
    color: C.info,
  },
  lastEvent: {
    marginTop: "1rem",
    padding: "0.75rem",
    borderRadius: "0.75rem",
    backgroundColor: C.bg,
    color: C.muted,
    fontSize: "0.875rem",
    textAlign: "center",
  },
  scoreTable: {
    display: "flex",
    flexDirection: "column",
    borderRadius: "0.75rem",
    overflow: "hidden",
  },
  tableHeader: {
    display: "flex",
    padding: "0.75rem 1rem",
    backgroundColor: C.border,
    fontWeight: "bold",
    fontSize: "0.875rem",
    color: C.muted,
  },
  tableRow: {
    display: "flex",
    padding: "0.625rem 1rem",
    fontSize: "0.875rem",
  },
  colRank: { width: "2rem", textAlign: "center", color: C.muted },
  colName: { flex: 1 },
  colCoins: { ...tabular, width: "4rem", textAlign: "right" },
  colPoints: { ...tabular, width: "4rem", textAlign: "right" },
  colBids: { ...tabular, width: "3rem", textAlign: "right" },
  empty: {
    padding: "2rem",
    textAlign: "center",
    color: C.muted,
  },
  authStatusBadge: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "0.625rem 1rem",
    borderRadius: "0.75rem",
    backgroundColor: C.bg,
    color: C.text,
    fontSize: "0.875rem",
    fontWeight: 600,
    marginBottom: "1rem",
    border: `1px solid ${C.border}`,
  },
  authStatusDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    flexShrink: 0,
  },
  authErrorBanner: {
    padding: "1rem 1.25rem",
    borderRadius: "1rem",
    backgroundColor: "rgba(255, 92, 92, 0.15)",
    border: `1px solid ${C.danger}`,
    color: C.danger,
    marginBottom: "1.5rem",
    fontSize: "0.95rem",
  },
  verifiedBadge: {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: C.success,
    backgroundColor: "rgba(61, 220, 132, 0.12)",
    border: `1px solid ${C.success}`,
    borderRadius: "999px",
    padding: "4px 12px",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
  },
  // Team management
  teamTable: {
    display: "flex",
    flexDirection: "column",
    borderRadius: "0.75rem",
    overflow: "hidden",
    border: `1px solid ${C.border}`,
  },
  teamTableHeader: {
    display: "flex",
    padding: "0.625rem 0.75rem",
    backgroundColor: C.border,
    fontWeight: "bold",
    fontSize: "0.8rem",
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  teamTableRow: {
    display: "flex",
    padding: "0.5rem 0.75rem",
    fontSize: "0.875rem",
    alignItems: "center",
    gap: "0.5rem",
  },
  tmColName: {
    flex: 1,
    fontWeight: 600,
    color: C.text,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  tmColInput: {
    width: "4.5rem",
    textAlign: "center" as const,
    fontSize: "0.75rem",
    fontWeight: 700,
    color: C.muted,
  },
  tmColAction: {
    width: "3.5rem",
    textAlign: "center" as const,
  },
  tmInput: {
    width: "4.5rem",
    padding: "0.375rem 0.5rem",
    borderRadius: "0.75rem",
    border: `1px solid ${C.border}`,
    backgroundColor: C.bg,
    color: C.text,
    fontSize: "0.875rem",
    fontWeight: "bold",
    textAlign: "center",
    outline: "none",
    ...tabular,
  },
  tmApplyBtn: {
    width: "3.5rem",
    padding: "0.375rem 0",
    borderRadius: "0.75rem",
    border: "none",
    backgroundColor: C.info,
    color: C.bg,
    fontSize: "0.8rem",
    fontWeight: 700,
    cursor: "pointer",
  },
  // Confirmation modal
  modalOverlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    backgroundColor: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: "1rem",
    padding: "2rem",
    minWidth: "320px",
    maxWidth: "420px",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  modalTitle: {
    fontSize: "1.25rem",
    fontWeight: 800,
    color: C.text,
    margin: 0,
  },
  modalText: {
    fontSize: "0.95rem",
    color: C.muted,
    margin: 0,
  },
  modalChanges: {
    padding: "0.75rem",
    borderRadius: "0.75rem",
    backgroundColor: C.bg,
    border: `1px solid ${C.border}`,
    fontSize: "0.9rem",
    color: C.text,
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
  },
  modalActions: {
    display: "flex",
    gap: "0.75rem",
    marginTop: "0.5rem",
  },
  modalConfirmBtn: {
    flex: 1,
    padding: "0.65rem",
    borderRadius: "0.75rem",
    border: "none",
    background: "linear-gradient(180deg, #4ADE80, #22C55E)",
    color: C.bg,
    fontSize: "1rem",
    fontWeight: 700,
    cursor: "pointer",
  },
  modalCancelBtn: {
    flex: 1,
    padding: "0.65rem",
    borderRadius: "0.75rem",
    border: `1px solid ${C.border}`,
    backgroundColor: "transparent",
    color: C.muted,
    fontSize: "1rem",
    cursor: "pointer",
  },
  // Manual timer
  timerPreview: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.25rem",
    padding: "1rem",
    borderRadius: "1rem",
    backgroundColor: C.bg,
    border: `1px solid ${C.border}`,
    marginBottom: "0.75rem",
  },
  timerPreviewValue: {
    ...tabular,
    fontSize: "3rem",
    fontWeight: 800,
    lineHeight: 1,
  },
  timerPreviewLabel: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: C.muted,
    textTransform: "uppercase" as const,
    letterSpacing: "0.1em",
  },
  timerInputRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    marginBottom: "0.75rem",
  },
  timerInputLabel: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: C.muted,
    whiteSpace: "nowrap" as const,
  },
  timerInput: {
    flex: 1,
    padding: "0.5rem 0.75rem",
    borderRadius: "0.75rem",
    border: `1px solid ${C.border}`,
    backgroundColor: C.bg,
    color: C.text,
    fontSize: "1rem",
    fontWeight: "bold",
    textAlign: "center",
    outline: "none",
    ...tabular,
  },
  timerBtnRow: {
    display: "flex",
    gap: "0.5rem",
  },
  timerCtrlBtn: {
    flex: 1,
    padding: "0.6rem 0",
    borderRadius: "0.75rem",
    border: "none",
    color: C.bg,
    fontSize: "0.9rem",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
  // Image bank
  imageGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "0.5rem",
    marginBottom: "0.75rem",
  },
  imageGridItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0.5rem",
    borderRadius: "0.75rem",
    border: `2px solid ${C.border}`,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  imageGridThumb: {
    width: "100%",
    height: "60px",
    objectFit: "contain" as const,
    borderRadius: "0.5rem",
    marginBottom: "0.25rem",
  },
  imageGridName: {
    fontSize: "0.65rem",
    color: C.muted,
    textAlign: "center" as const,
    wordBreak: "break-all" as const,
    lineHeight: 1.2,
    maxHeight: "2.4em",
    overflow: "hidden",
  },
  imagePreviewPanel: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.75rem",
    borderRadius: "0.75rem",
    backgroundColor: C.bg,
    border: `1px solid ${C.border}`,
    marginTop: "0.5rem",
  },
  imagePreviewLabel: {
    fontSize: "0.7rem",
    fontWeight: 700,
    color: C.accent,
    textTransform: "uppercase" as const,
    letterSpacing: "0.1em",
  },
  imagePreviewImg: {
    maxWidth: "100%",
    maxHeight: "180px",
    objectFit: "contain" as const,
    borderRadius: "0.5rem",
  },
  setImageBtn: {
    width: "100%",
    padding: "0.65rem",
    borderRadius: "0.75rem",
    border: "none",
    background: `linear-gradient(180deg, ${C.accentLight}, ${C.accent})`,
    color: C.bg,
    fontSize: "0.9rem",
    fontWeight: 700,
    cursor: "pointer",
  },
  currentImageNote: {
    marginTop: "0.5rem",
    padding: "0.5rem",
    borderRadius: "0.375rem",
    backgroundColor: `${C.success}15`,
    border: `1px solid ${C.success}`,
    color: C.success,
    fontSize: "0.75rem",
    fontWeight: 600,
    textAlign: "center" as const,
  },
};

/* ─── Table Styles for Data Management ─── */
const tableHeaderStyle: React.CSSProperties = {
  padding: "8px 6px",
  textAlign: "left",
  fontFamily: F.body,
  fontWeight: 700,
  fontSize: "0.7rem",
  color: C.muted,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const tableCellStyle: React.CSSProperties = {
  padding: "6px",
  fontFamily: F.body,
  fontSize: "0.75rem",
  color: C.text,
  whiteSpace: "nowrap",
};

const tableInputStyle: React.CSSProperties = {
  width: "80px",
  padding: "4px 6px",
  borderRadius: "999px",
  border: `1px solid ${C.border}`,
  backgroundColor: C.bg,
  color: C.text,
  fontSize: "0.75rem",
  fontFamily: F.body,
};
