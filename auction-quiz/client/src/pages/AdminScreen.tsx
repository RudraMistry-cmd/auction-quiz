import { useEffect, useState } from "react";
import { getServerBase } from "../hooks/useSocket";
import { useGamePhase, formatClock } from "../hooks/useGamePhase";
import TaskTimer from "../components/TaskTimer";
import { BrandHeader } from "../components/BrandHeader";
import { tokens, tabular } from "../design-system";
import type { Auction, Bid } from "../shared/types";

const C = tokens.color;
const F = tokens.font;

/* ─── Reusable Card ─── */
function Card({ title, children, span, scroll }: { title: string; children: React.ReactNode; span?: number; scroll?: boolean }) {
  return (
    <div style={{
      gridColumn: span ? `span ${span}` : "span 12",
      backgroundColor: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: "12px",
      padding: "20px 24px",
      boxShadow: tokens.shadow.sm,
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
  const { socket, connected, phase, task, taskTimer, taskEnded, taskPaused } = useGamePhase();
  const [isAdminVerified, setIsAdminVerified] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [auction, setAuction] = useState<Auction | null>(null);
  const [currentBid, setCurrentBid] = useState<number>(0);
  const [leadingTeam, setLeadingTeam] = useState<string>("");
  const [timer, setTimer] = useState<number>(0);
  const [scoreboard, setScoreboard] = useState<ScoreboardTeam[]>([]);
  const [lastEvent, setLastEvent] = useState<string>("");
  const [rewardInput, setRewardInput] = useState("1");

  // Team management state
  const [teamEdits, setTeamEdits] = useState<Record<string, { bid_coins?: number; reward_points?: number }>>({});
  const [teamBusy, setTeamBusy] = useState(false);
  const [teamConfirm, setTeamConfirm] = useState<{ teamId: string; teamName: string } | null>(null);

  // Manual timer control state
  const [timerDuration, setTimerDuration] = useState(60);
  const [timerState, setTimerState] = useState<{
    duration: number;
    endAt: number | null;
    isRunning: boolean;
    timeLeft: number;
  }>({ duration: 0, endAt: null, isRunning: false, timeLeft: 0 });
  const [timerBusy, setTimerBusy] = useState(false);

  // Image picker state
  const [images, setImages] = useState<{ name: string; path: string; folder: string; used?: boolean }[]>([]);
  const [selectedImagePath, setSelectedImagePath] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [currentImageSet, setCurrentImageSet] = useState<string | null>(null);

  // Sound control state
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(100);
  const [soundPanelOpen, setSoundPanelOpen] = useState(false);
  const [perSoundEnabled, setPerSoundEnabled] = useState<Record<string, boolean>>({
    auction_start: true, auction_end: true, bid_small: true, bid_big: true,
    bid_win: true, timer_start: true, timer_end: true, pass: true, fail: true, tick: true,
  });
  const [soundFiles, setSoundFiles] = useState<{ name: string; exists: boolean }[]>([]);
  const [uploadingSound, setUploadingSound] = useState<string | null>(null);

  // Data Management state
  const [dataPanelOpen, setDataPanelOpen] = useState(false);
  const [allTeams, setAllTeams] = useState<any[]>([]);
  const [dataEdits, setDataEdits] = useState<Record<string, any>>({});
  const [dataBusy, setDataBusy] = useState(false);
  const [dataConfirm, setDataConfirm] = useState<{ teamId: string; teamName: string } | null>(null);
  const [dataToast, setDataToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Pre-fill PASS reward from the round's default — editing stays optional.
  useEffect(() => {
    if (task) {
      setRewardInput(String(task.defaultReward ?? 1));
    }
  }, [task?.taskId]);
  const [failArmed, setFailArmed] = useState(false);
  const [taskPending, setTaskPending] = useState(false);

  // Fetch scoreboard
  const fetchScoreboard = () => {
    if (!socket || !connected) return;
    socket.emit("client:get_scoreboard", (res: any) => {
      setScoreboard(res.teams || []);
    });
  };

  const fetchImages = () => {
    if (!socket || !connected) return;
    socket.emit("admin:get_images", (res: any) => {
      if (res.success && res.images) {
        setImages(res.images);
      }
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
      const res = await fetch(`${getServerBase()}/api/sounds/upload?name=${soundName}&secret=${secret}`, {
        method: "POST",
        headers: { "Content-Type": "audio/mpeg" },
        body: file,
      });
      const data = await res.json();
      if (data.success) {
        setLastEvent(`Sound uploaded: ${soundName}.mp3`);
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

  const setImage = (imagePath: string) => {
    if (!socket || imageBusy) return;
    setImageBusy(true);
    socket.emit("admin:set_question_image", { imagePath }, (res: any) => {
      setImageBusy(false);
      if (res.success) {
        setCurrentImageSet(res.imagePath);
        setSelectedImagePath(null);
        setLastEvent(`Question image set: ${res.imagePath}`);
      } else {
        setLastEvent(`Error: ${res.error || "failed to set image"}`);
      }
    });
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
        fetchImages();
        fetchSounds();
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

    const handleEnded = (data: { auctionId: string; winner: any; winningBid: number | null }) => {
      setAuction((a) => (a ? { ...a, status: "completed" } : null));
      const winnerText = data.winner
        ? `${data.winner.teamName} won with ${data.winningBid}`
        : "No bids placed";
      setLastEvent(`Auction ended: ${winnerText}`);
      fetchScoreboard();
    };

    const handleScores = () => fetchScoreboard();

    const handleTimerUpdate = (data: { duration: number; endAt: number | null; isRunning: boolean; timeLeft: number }) => {
      setTimerState(data);
    };

    const handleImageSet = (data: { imagePath: string }) => {
      setCurrentImageSet(data.imagePath);
    };

    socket.on("auction:started", handleStarted);
    socket.on("auction:bid_update", handleBidUpdate);
    socket.on("auction:timer", handleTimer);
    socket.on("auction:ended", handleEnded);
    socket.on("task:result", handleScores);
    socket.on("scoreboard:updated", handleScores);
    socket.on("timer:update", handleTimerUpdate);
    socket.on("question:image_set", handleImageSet);

    const handleThemeChanged = (data: { theme: string }) => {
      document.documentElement.setAttribute("data-theme", data.theme);
      localStorage.setItem("theme", data.theme);
    };
    socket.on("theme:changed", handleThemeChanged);

    return () => {
      socket.off("auction:started", handleStarted);
      socket.off("auction:bid_update", handleBidUpdate);
      socket.off("auction:timer", handleTimer);
      socket.off("auction:ended", handleEnded);
      socket.off("task:result", handleScores);
      socket.off("scoreboard:updated", handleScores);
      socket.off("timer:update", handleTimerUpdate);
      socket.off("question:image_set", handleImageSet);
      socket.off("theme:changed", handleThemeChanged);
    };
  }, [socket, connected]);

  const [startArmed, setStartArmed] = useState(false);

  const startAuction = async () => {
    try {
      setStartArmed(false);
      const res = await fetch(`${getServerBase()}/api/auction/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": secret,
        },
      });
      const data = await res.json();
      if (!data.success) {
        setLastEvent(`Error: ${data.error || "Failed to start auction"}`);
      }
    } catch (err: any) {
      setLastEvent(`Error: ${err.message}`);
    }
  };

  const submitPass = () => {
    if (!socket || !task || taskPending) return;
    const pts = parseInt(rewardInput, 10);
    if (!Number.isInteger(pts) || pts < 0) {
      setLastEvent("Enter a reward of 0 or more");
      return;
    }
    setTaskPending(true);
    socket.emit(
      "admin:submit_result",
      { taskId: task.taskId, result: "pass", rewardPoints: pts },
      (res: any) => {
        setTaskPending(false);
        if (res.success) {
          setFailArmed(false);
          setLastEvent(`PASS recorded: ${task.teamName} +${pts} pts`);
        } else {
          setLastEvent(`Error: ${res.error || "failed to record"}`);
        }
      }
    );
  };

  const submitFail = () => {
    if (!socket || !task || taskPending) return;
    setTaskPending(true);
    socket.emit("admin:submit_result", { taskId: task.taskId, result: "fail" }, (res: any) => {
      setTaskPending(false);
      if (res.success) {
        setFailArmed(false);
        setLastEvent(`FAIL recorded: ${task.teamName}`);
      } else {
        setLastEvent(`Error: ${res.error || "failed to record"}`);
      }
    });
  };

  const timerAction = (
    event: "admin:task_pause" | "admin:task_resume" | "admin:task_adjust" | "admin:task_start",
    data: any,
    okText: (res: any) => string
  ) => {
    if (!socket || !task || taskPending) return;
    setTaskPending(true);
    socket.emit(event, data, (res: any) => {
      setTaskPending(false);
      setLastEvent(res.success ? okText(res) : `Error: ${res.error || "timer action failed"}`);
    });
  };

  const pauseTimer = () =>
    timerAction("admin:task_pause", { taskId: task!.taskId }, (r) => `Timer paused (${r.timeLeft}s left)`);
  const resumeTimer = () =>
    timerAction("admin:task_resume", { taskId: task!.taskId }, (r) => `Timer resumed (${r.timeLeft}s left)`);
  const addThirty = () =>
    timerAction(
      "admin:task_adjust",
      { taskId: task!.taskId, seconds: 30 },
      (r) => (r.revived ? `Timer revived (+30s)` : `+30s (${r.timeLeft}s left)`)
    );
  const startTimer = () =>
    timerAction("admin:task_start", { taskId: task!.taskId }, (r) => `Timer started (${formatClock(r.timeLeft)})`);

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

  // Manual timer control functions
  const manualTimerAction = (event: string, data: any) => {
    if (!socket || timerBusy) return;
    setTimerBusy(true);
    const safetyReset = setTimeout(() => setTimerBusy(false), 5000);
    socket.emit(event as any, data, (res: any) => {
      clearTimeout(safetyReset);
      setTimerBusy(false);
      if (res.success) {
        setTimerState({
          duration: res.duration ?? 0,
          endAt: res.endAt ?? null,
          isRunning: res.isRunning ?? false,
          timeLeft: res.timeLeft ?? 0,
        });
        setLastEvent(`Timer: ${event.replace("admin:timer_", "")} (${res.timeLeft ?? 0}s)`);
      } else {
        setLastEvent(`Error: ${res.error || "timer action failed"}`);
      }
    });
  };

  const timerSetDuration = () => manualTimerAction("admin:timer_set_duration", { duration: timerDuration });
  const timerStart = () => manualTimerAction("admin:timer_start", {});
  const timerPause = () => manualTimerAction("admin:timer_pause", {});
  const timerReset = () => manualTimerAction("admin:timer_reset", {});
  const timerAdd30 = () => manualTimerAction("admin:timer_adjust", { seconds: 30 });

  const isActive = auction?.status === "active" && timer > 0;

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
        <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
          <BrandHeader variant="admin" />
          <h1 style={styles.title}>Admin Control Panel</h1>
          {isAdminVerified && (
            <span style={styles.verifiedBadge}>Host Verified</span>
          )}
        </div>
        <span style={{ color: connected ? C.success : C.danger }}>
          {connected ? "Connected" : "Disconnected"}
        </span>
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
          <div style={styles.authStatusBadge}>
            <span style={{ ...styles.authStatusDot, backgroundColor: isAdminVerified ? C.success : C.danger }} />
            <span>{isAdminVerified ? "Host Verified Session" : "Authenticating session..."}</span>
          </div>
          {!startArmed ? (
            <button onClick={() => setStartArmed(true)} disabled={isActive} style={{ ...styles.startBtn, opacity: isActive ? 0.5 : 1, cursor: isActive ? "not-allowed" : "pointer" }}>
              {isActive ? "Auction in Progress" : "Start Auction"}
            </button>
          ) : (
            <div style={styles.confirmRow}>
              <span style={styles.confirmText}>Start auction?</span>
              <button onClick={startAuction} disabled={isActive} style={styles.startBtn}>Confirm Start</button>
              <button onClick={() => setStartArmed(false)} disabled={isActive} style={styles.cancelBtn}>Cancel</button>
            </div>
          )}
          {auction && (
            <div style={styles.auctionInfo}>
              <div style={styles.timerLarge}>{timer}</div>
              <div style={styles.bidSection}>
                <span style={styles.bidLabel}>Current Bid</span>
                <span style={styles.bidValue}>{currentBid}</span>
              </div>
              {leadingTeam && <div style={styles.leadingTeam}>Leading: {leadingTeam}</div>}
            </div>
          )}
          {lastEvent && <div style={styles.lastEvent}>{lastEvent}</div>}
        </Card>

        <Card title="Manual Timer" span={4}>
          <p style={{ color: C.muted, fontSize: "0.8rem", marginBottom: "0.75rem" }}>Admin-controlled countdown (independent of auction/task timers).</p>
          <div style={styles.timerPreview}>
            <span style={{ ...styles.timerPreviewValue, color: timerState.isRunning ? (timerState.timeLeft <= 10 ? C.danger : timerState.timeLeft <= 30 ? C.accent : C.success) : C.muted }}>
              {formatClock(timerState.timeLeft)}
            </span>
            <span style={styles.timerPreviewLabel}>{timerState.isRunning ? "Running" : timerState.timeLeft > 0 ? "Paused" : "Stopped"}</span>
          </div>
          <div style={styles.timerInputRow}>
            <label style={styles.timerInputLabel}>Duration (s)</label>
            <input style={styles.timerInput} type="number" min={1} max={3600} value={timerDuration} onChange={(e) => setTimerDuration(Math.max(1, parseInt(e.target.value, 10) || 1))} disabled={timerBusy} />
          </div>
          <div style={styles.timerBtnRow}>
            <button onClick={timerSetDuration} disabled={timerBusy} style={{ ...styles.timerCtrlBtn, backgroundColor: C.info }}>Set</button>
            {!timerState.isRunning ? (
              <button onClick={timerStart} disabled={timerBusy || timerState.timeLeft <= 0} style={{ ...styles.timerCtrlBtn, backgroundColor: C.success }}>Start</button>
            ) : (
              <button onClick={timerPause} disabled={timerBusy} style={{ ...styles.timerCtrlBtn, backgroundColor: C.accent }}>Pause</button>
            )}
            <button onClick={timerReset} disabled={timerBusy} style={{ ...styles.timerCtrlBtn, backgroundColor: C.danger }}>Reset</button>
            <button onClick={timerAdd30} disabled={timerBusy} style={{ ...styles.timerCtrlBtn, backgroundColor: C.info }}>+30s</button>
          </div>
        </Card>

        <Card title="Image Bank" span={8} scroll>
          <p style={{ color: C.muted, fontSize: "0.8rem", marginBottom: "0.75rem" }}>Select an image from the questions folder to display on the projector.</p>
          {images.length === 0 ? (
            <div style={styles.empty}>No images found in /questions folder</div>
          ) : (
            <>
              <div style={styles.imageGrid}>
                {images.map((img) => (
                  <div
                    key={img.path}
                    onClick={() => setSelectedImagePath(img.path)}
                    style={{
                      ...styles.imageGridItem,
                      borderColor: selectedImagePath === img.path ? C.accent : currentImageSet === img.path ? C.success : img.used ? `${C.accent}88` : C.border,
                      backgroundColor: selectedImagePath === img.path ? `${C.accent}15` : img.used ? `${C.accent}08` : C.bg,
                      cursor: "pointer",
                    }}
                  >
                    <img
                      src={`${getServerBase()}/questions/${img.path}`}
                      alt={img.name}
                      style={styles.imageGridThumb}
                      loading="lazy"
                    />
                    <div style={styles.imageGridName}>{img.name}</div>
                    {img.used && (
                      <div style={{
                        fontSize: "0.6rem",
                        fontWeight: 700,
                        color: C.accent,
                        backgroundColor: `${C.accent}20`,
                        padding: "2px 6px",
                        borderRadius: "4px",
                        marginTop: "2px",
                      }}>USED</div>
                    )}
                  </div>
                ))}
              </div>
              {selectedImagePath && (
                <div style={styles.imagePreviewPanel}>
                  <div style={styles.imagePreviewLabel}>Preview</div>
                  <img
                    src={`${getServerBase()}/questions/${selectedImagePath}`}
                    alt="Preview"
                    style={styles.imagePreviewImg}
                  />
                  <button
                    onClick={() => setImage(selectedImagePath)}
                    disabled={imageBusy}
                    style={{ ...styles.setImageBtn, opacity: imageBusy ? 0.5 : 1, cursor: imageBusy ? "not-allowed" : "pointer" }}
                  >
                    {imageBusy ? "Setting..." : "Set as Question"}
                  </button>
                </div>
              )}
            </>
          )}
          {currentImageSet && (
            <div style={styles.currentImageNote}>
              Active: {currentImageSet}
            </div>
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
                    socket?.emit("admin:sound_settings", { enabled: soundEnabled, volume: vol }, (res) => {
                      if (!res.success) console.error("[Sound] Failed:", res.error);
                    });
                  }}
                  style={{ width: "100%", height: "6px", borderRadius: "3px", backgroundColor: C.border, cursor: "pointer", accentColor: C.accent }}
                />
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
                        <span style={{ fontFamily: "monospace", color: C.text, minWidth: "100px" }}>{name}.mp3</span>
                        <span style={{ color: file?.exists ? C.success : C.muted, fontSize: "0.7rem" }}>
                          {file?.exists ? "✓" : "—"}
                        </span>
                        <label style={{
                          marginLeft: "auto", cursor: "pointer", color: C.accent,
                          fontSize: "0.7rem", fontWeight: 600,
                          opacity: isUploading ? 0.5 : 1,
                        }}>
                          {isUploading ? "Uploading..." : "Upload"}
                          <input
                            type="file" accept="audio/mpeg,audio/mp3" style={{ display: "none" }}
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
              {/* Refresh Button */}
              <button
                onClick={() => {
                  fetch(`${getServerBase()}/admin/teams`, {
                    headers: { "x-admin-secret": secret },
                  })
                    .then((r) => r.json())
                    .then((data) => {
                      if (data.success) {
                        setAllTeams(data.teams);
                        setDataToast({ type: "success", text: "Teams refreshed" });
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
                  padding: "8px 16px", borderRadius: "6px",
                  border: `1px solid ${C.border}`, backgroundColor: C.surface,
                  cursor: "pointer", fontFamily: F.body, fontWeight: 600,
                  fontSize: "0.8rem", color: C.text, alignSelf: "flex-start",
                }}
              >
                ↻ Refresh Data
              </button>

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
                        <th style={{ ...tableHeaderStyle, textAlign: "center" }}>Action</th>
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
                              <button
                                onClick={() => setDataConfirm({ teamId: team.teamId, teamName: team.teamName })}
                                disabled={!edit || dataBusy}
                                style={{
                                  padding: "5px 14px", borderRadius: "4px",
                                  border: "none",
                                  backgroundColor: edit ? C.success : C.border,
                                  color: edit ? "#fff" : C.muted,
                                  cursor: (!edit || dataBusy) ? "not-allowed" : "pointer",
                                  fontWeight: 600, fontSize: "0.75rem",
                                  opacity: (!edit || dataBusy) ? 0.4 : 1,
                                  transition: "all 0.15s ease",
                                }}
                              >
                                Save
                              </button>
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
                  flex: 1, padding: "12px 16px", borderRadius: "8px",
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

        <Card title="Team Management" span={4} scroll>
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

        {/* Row 3: Task Control (6) + Scoreboard (6) */}
        <Card title="Task Control" span={6}>
          {phase === "task" && task ? (
            <div style={styles.taskInfo}>
              <div style={styles.taskTeam}>{task.teamName}</div>
              {task.question && <div style={styles.taskQuestion}>{task.question}</div>}
              <div style={styles.taskMeta}>Final bid: {task.finalBid} · Default reward: {task.defaultReward ?? 1} pts</div>
              <div style={{ margin: "16px 0" }}><TaskTimer task={task} timeLimit={task.time_limit} endAt={task.endAt} timeLeft={taskTimer} ended={taskEnded} paused={taskPaused} size="small" /></div>
              {taskEnded && <div style={styles.timeUpNote}>Time Up — verdict still allowed</div>}
              <div style={styles.timerRow}>
                {!taskPaused ? <button onClick={pauseTimer} disabled={taskPending || taskEnded} style={{ ...styles.timerBtn, opacity: taskPending || taskEnded ? 0.5 : 1 }}>Pause</button> : <button onClick={resumeTimer} disabled={taskPending} style={{ ...styles.timerBtn, opacity: taskPending ? 0.5 : 1 }}>Resume</button>}
                <button onClick={addThirty} disabled={taskPending} style={{ ...styles.timerBtn, opacity: taskPending ? 0.5 : 1 }}>+30s</button>
                <button onClick={startTimer} disabled={taskPending} style={{ ...styles.timerBtn, opacity: taskPending ? 0.5 : 1 }}>Start {formatClock(task.time_limit || 300)}</button>
              </div>
              {taskPaused && <div style={styles.pausedNote}>Timer paused</div>}
              <div style={styles.rewardRow}>
                <input style={styles.rewardInput} type="number" min={0} max={10000} value={rewardInput} onChange={(e) => setRewardInput(e.target.value)} disabled={taskPending} aria-label="Reward points" />
                <button onClick={submitPass} disabled={taskPending} style={{ ...styles.passBtn, opacity: taskPending ? 0.5 : 1 }}>PASS</button>
              </div>
              {!failArmed ? <button onClick={() => setFailArmed(true)} disabled={taskPending} style={{ ...styles.failBtn, opacity: taskPending ? 0.5 : 1 }}>FAIL</button> : (
                <div style={styles.confirmRow}>
                  <span style={styles.confirmText}>Record FAIL for {task.teamName}? No points awarded ({task.finalBid} coins were already paid at auction end).</span>
                  <button onClick={submitFail} disabled={taskPending} style={styles.failBtn}>Confirm FAIL</button>
                  <button onClick={() => setFailArmed(false)} disabled={taskPending} style={styles.cancelBtn}>Cancel</button>
                </div>
              )}
            </div>
          ) : <div style={styles.empty}>No active task</div>}
        </Card>

        <Card title="Scoreboard" span={6} scroll>
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
    marginBottom: "32px",
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
    borderRadius: "0.75rem",
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
    borderRadius: "0.5rem",
    border: `1px solid ${C.border}`,
    backgroundColor: C.bg,
    color: C.text,
    fontSize: "0.875rem",
  },
  importBtn: {
    padding: "0.5rem 1rem",
    borderRadius: "0.5rem",
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
    borderRadius: "0.5rem",
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
    borderRadius: "0.75rem",
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
    borderRadius: "0.5rem",
    border: "none",
    backgroundColor: C.success,
    color: C.bg,
    fontSize: "0.875rem",
    fontWeight: "bold",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  qConfirmBtn: {
    padding: "0.375rem 0.75rem",
    borderRadius: "0.5rem",
    border: "none",
    backgroundColor: C.accent,
    color: C.bg,
    fontSize: "0.875rem",
    fontWeight: "bold",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  useQuestionBtn: {
    width: "100%",
    padding: "0.85rem 1.5rem",
    borderRadius: "0.75rem",
    border: "none",
    backgroundColor: C.success,
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
    borderRadius: "0.75rem",
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
    borderRadius: "0.5rem",
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
    borderRadius: "0.75rem",
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
    borderRadius: "0.75rem",
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
    borderRadius: "0.75rem",
    border: "none",
    backgroundColor: C.success,
    color: C.bg,
    fontSize: "1.125rem",
    fontWeight: "bold",
    cursor: "pointer",
  },
  failBtn: {
    width: "100%",
    padding: "0.75rem",
    borderRadius: "0.75rem",
    border: "none",
    backgroundColor: C.danger,
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
    borderRadius: "0.75rem",
    border: `1px solid ${C.border}`,
    backgroundColor: "transparent",
    color: C.muted,
    fontSize: "0.875rem",
    cursor: "pointer",
  },
  startBtn: {
    width: "100%",
    padding: "1rem",
    borderRadius: "0.75rem",
    border: "none",
    backgroundColor: C.success,
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
    borderRadius: "0.5rem",
    backgroundColor: C.bg,
    color: C.muted,
    fontSize: "0.875rem",
    textAlign: "center",
  },
  scoreTable: {
    display: "flex",
    flexDirection: "column",
    borderRadius: "0.5rem",
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
    borderRadius: "0.5rem",
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
    borderRadius: "0.75rem",
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
    borderRadius: "0.5rem",
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
    borderRadius: "0.5rem",
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
    borderRadius: "0.5rem",
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
    borderRadius: "0.5rem",
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
    borderRadius: "0.5rem",
    border: "none",
    backgroundColor: C.success,
    color: C.bg,
    fontSize: "1rem",
    fontWeight: 700,
    cursor: "pointer",
  },
  modalCancelBtn: {
    flex: 1,
    padding: "0.65rem",
    borderRadius: "0.5rem",
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
    borderRadius: "0.75rem",
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
    borderRadius: "0.5rem",
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
    borderRadius: "0.5rem",
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
    borderRadius: "0.5rem",
    border: `2px solid ${C.border}`,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  imageGridThumb: {
    width: "100%",
    height: "60px",
    objectFit: "contain" as const,
    borderRadius: "0.25rem",
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
    borderRadius: "0.5rem",
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
    borderRadius: "0.25rem",
  },
  setImageBtn: {
    width: "100%",
    padding: "0.65rem",
    borderRadius: "0.5rem",
    border: "none",
    backgroundColor: C.accent,
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
  borderRadius: "4px",
  border: `1px solid ${C.border}`,
  backgroundColor: C.bg,
  color: C.text,
  fontSize: "0.75rem",
  fontFamily: F.body,
};
