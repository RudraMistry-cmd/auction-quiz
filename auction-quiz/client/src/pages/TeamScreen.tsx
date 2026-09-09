import { useEffect, useRef, useState, useCallback } from "react";
import { useGamePhase, formatClock } from "../hooks/useGamePhase";
import { tokens } from "../design-system";
import { BrandHeader } from "../components/BrandHeader";
import TaskTimer from "../components/TaskTimer";
import type { Team, Auction, Bid, TaskResultEvent } from "../shared/types";

const C = tokens.color;
const F = tokens.font;

interface TeamScreenProps {
  sessionToken?: string | null;
}

/* ─── Sub-components ─── */

function TeamHeaderBar({ teamName, connected }: { teamName: string; connected: boolean }) {
  return (
    <div style={dashHeaderContainer}>
      <div style={dashTopRow}>
        <BrandHeader variant="compact" />
        <div style={{
          display: "flex", alignItems: "center", gap: "6px",
          fontFamily: F.body, fontSize: "0.8rem", fontWeight: 600,
          color: connected ? C.success : C.danger,
        }}>
          <span style={{
            width: "8px", height: "8px", borderRadius: "50%",
            backgroundColor: connected ? C.success : C.danger,
            boxShadow: connected ? `0 0 6px ${C.success}` : "none",
          }} />
          <span>{connected ? "Connected" : "Offline"}</span>
        </div>
      </div>
      <div style={dashTeamName}>{teamName}</div>
    </div>
  );
}

function DashboardCard({
  label,
  value,
  color,
  flash,
  icon,
  size = "normal",
}: {
  label: string;
  value: number;
  color: string;
  flash: boolean;
  icon: React.ReactNode;
  size?: "normal" | "large";
}) {
  const isLarge = size === "large";
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      backgroundColor: C.surface,
      border: `2px solid ${flash ? color : C.border}`,
      borderRadius: tokens.radius.xl,
      padding: isLarge ? "32px 48px" : "24px 36px",
      minWidth: isLarge ? "200px" : "160px",
      boxShadow: flash ? `0 0 32px ${color}44` : tokens.shadow.md,
      transition: `all ${tokens.transition.base}`,
      animation: flash ? "cardFlash 0.6s ease" : "none",
    }}>
      <div style={{ marginBottom: "8px", color, opacity: 0.8 }}>{icon}</div>
      <span style={{
        fontFamily: F.body, fontWeight: 600, fontSize: "0.7rem",
        color: C.muted, letterSpacing: "0.18em", textTransform: "uppercase",
        marginBottom: "8px",
      }}>{label}</span>
      <span style={{
        fontFamily: F.heading, fontWeight: 900,
        fontSize: isLarge ? "clamp(3rem, 10vw, 5rem)" : "clamp(2rem, 6vw, 3.2rem)",
        color, fontVariantNumeric: "tabular-nums", lineHeight: 1,
      }}>{value}</span>
    </div>
  );
}

function StatusBanner({ status, color }: { status: string; color: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: "12px",
      padding: "16px 32px",
      borderRadius: tokens.radius.full,
      backgroundColor: `${color}15`,
      border: `2px solid ${color}40`,
      animation: "statusPulse 2s ease-in-out infinite",
    }}>
      <div style={{
        width: "12px", height: "12px", borderRadius: "50%",
        backgroundColor: color,
        boxShadow: `0 0 12px ${color}`,
        animation: "dotPulse 1.5s ease-in-out infinite",
      }} />
      <span style={{
        fontFamily: F.heading, fontWeight: 700,
        fontSize: "clamp(1rem, 2.5vw, 1.3rem)",
        color, letterSpacing: "0.05em",
      }}>{status}</span>
    </div>
  );
}

function TimerDisplay({ timeLeft, isUrgent }: { timeLeft: number; isUrgent: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "12px",
      padding: "12px 24px",
      borderRadius: tokens.radius.lg,
      backgroundColor: isUrgent ? `${C.danger}15` : C.surface,
      border: `2px solid ${isUrgent ? C.danger : C.border}`,
    }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke={isUrgent ? C.danger : C.primary} strokeWidth="2.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      <span style={{
        fontFamily: F.heading, fontWeight: 800,
        fontSize: "clamp(1.8rem, 6vw, 2.8rem)",
        color: isUrgent ? C.danger : C.primary,
        fontVariantNumeric: "tabular-nums", lineHeight: 1,
      }}>
        {formatClock(timeLeft)}
      </span>
    </div>
  );
}

function BidButton({
  onClick, disabled, coins, bidAmount, leading, isTeam, increment,
}: {
  onClick: () => void; disabled: boolean; coins: number;
  bidAmount: number; leading: string; isTeam: string; increment: number;
}) {
  const isLeading = leading === isTeam;
  const cantAfford = coins < bidAmount;
  const isGold = increment === 50;
  const bgColor = isLeading ? C.success : cantAfford ? C.border : isGold ? C.accent : C.primary;
  const textColor = isLeading || cantAfford ? C.muted : isGold ? C.primary : "#FFFFFF";
  const label = isLeading ? "YOU LEAD" : cantAfford ? "NOT ENOUGH" : `+${increment}`;

  return (
    <button
      onClick={onClick}
      disabled={disabled || isLeading || cantAfford}
      style={{
        flex: 1, padding: "20px 28px",
        borderRadius: tokens.radius.lg,
        border: isGold && !isLeading && !cantAfford ? `2px solid ${C.primary}` : "none",
        backgroundColor: bgColor,
        color: textColor,
        fontFamily: F.heading, fontWeight: 900,
        fontSize: "clamp(1.2rem, 3vw, 1.6rem)",
        letterSpacing: "0.05em",
        cursor: disabled || isLeading || cantAfford ? "not-allowed" : "pointer",
        opacity: disabled || isLeading || cantAfford ? 0.4 : 1,
        boxShadow: disabled || isLeading || cantAfford ? "none" : isGold
          ? `0 4px 20px ${C.accent}55`
          : `0 4px 20px ${C.primary}44`,
        transition: `all ${tokens.transition.fast}`,
        userSelect: "none",
      }}
    >
      {label}
    </button>
  );
}

function FeedbackToast({ message }: { message: { type: "success" | "error"; text: string } | null }) {
  if (!message) return null;
  const isSuccess = message.type === "success";
  return (
    <div style={{
      position: "fixed", top: "24px", left: "50%", transform: "translateX(-50%)",
      backgroundColor: isSuccess ? C.success : C.danger,
      color: "#FFFFFF",
      fontFamily: F.heading, fontWeight: 700, fontSize: "1rem",
      padding: "12px 28px", borderRadius: tokens.radius.full,
      boxShadow: tokens.shadow.lg,
      animation: "toastSlide 0.3s ease",
      zIndex: 1000,
    }}>
      {message.text}
    </div>
  );
}

/* ─── Main Screen ─── */
export default function TeamScreen({ sessionToken }: TeamScreenProps = {}) {
  const {
    socket,
    connected,
    phase,
    currentQuestion,
    winningTeam,
    mainTaskTimer,
    sideTaskTimer,
    explicitTimer,
    task,
    taskTimer,
    taskEnded,
    taskPaused,
  } = useGamePhase();
  const [team, setTeam] = useState<Team | null>(null);
  const [auction, setAuction] = useState<Auction | null>(null);
  const [currentBid, setCurrentBid] = useState<number>(0);
  const [timer, setTimer] = useState<number>(0);
  const [leadingTeam, setLeadingTeam] = useState<string>("");
  const [auctionCleared, setAuctionCleared] = useState(false);
  const [bidMessage, setBidMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [coins, setCoins] = useState<number>(1000);
  const [points, setPoints] = useState<number>(0);
  const [coinFlash, setCoinFlash] = useState(false);
  const [pointsFlash, setPointsFlash] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  const teamRef = useRef<Team | null>(null);
  teamRef.current = team;

  type FormField = "teamName" | "player1" | "player2" | "phone" | "email";

  // Registration form
  const [form, setForm] = useState({ teamName: "", player1: "", player2: "", phone: "", email: "" });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formTouched, setFormTouched] = useState<Record<string, boolean>>({});

  // Validation functions
  const validateField = (name: string, value: string): string => {
    const trimmed = value.trim();
    switch (name) {
      case "teamName":
        if (trimmed.length < 3 || trimmed.length > 30) return "Team name must be 3-30 characters";
        if (!/^[a-zA-Z0-9 ]+$/.test(trimmed)) return "Team name must be alphanumeric (letters, numbers, spaces only)";
        return "";
      case "player1":
      case "player2":
        if (trimmed.length === 0) return "Player name is required";
        if (!/^[a-zA-Z ]+$/.test(trimmed)) return "Player name must contain only letters";
        return "";
      case "email":
        if (trimmed.length === 0) return "Email is required";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "Please enter a valid email address";
        return "";
      case "phone":
        if (trimmed.length === 0) return "Phone number is required";
        if (!/^[6-9]\d{9}$/.test(trimmed)) return "Enter a valid 10-digit Indian number (starting with 6-9)";
        return "";
      default:
        return "";
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    const touched: Record<string, boolean> = {};
    let valid = true;
    for (const [key, value] of Object.entries(form)) {
      const error = validateField(key, value);
      touched[key] = true;
      if (error) {
        errors[key] = error;
        valid = false;
      }
    }
    setFormTouched(touched);
    setFormErrors(errors);
    return valid;
  };

  const isFormValid = (): boolean => {
    return Object.entries(form).every(([key, value]) => validateField(key, value) === "");
  };

  const handleFieldChange = (name: FormField, value: string) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    const err = validateField(name, value);
    setFormErrors((prev) => ({ ...prev, [name]: err }));
  };

  const handleFieldBlur = (name: FormField) => {
    setFormTouched((prev) => ({ ...prev, [name]: true }));
    setFormErrors((prev) => ({ ...prev, [name]: validateField(name, form[name]) }));
  };

  const flash = (setter: (v: boolean) => void) => {
    setter(true);
    setTimeout(() => setter(false), 1500);
  };

  // Auto-reconnect
  useEffect(() => {
    if (!connected || !socket) return;
    const token = sessionToken || localStorage.getItem("sessionToken");
    if (token) {
      socket.emit("client:reconnect", { sessionToken: token }, (res: any) => {
        if (res.success && res.team) {
          setTeam(res.team);
          setCoins(res.team.bid_coins);
          setPoints(res.team.reward_points);
          if (res.currentAuction) {
            setAuction(res.currentAuction);
            setCurrentBid(res.currentBid || res.currentAuction.startBid);
            setTimer(res.timer || 0);
          }
        }
      });
    }
  }, [socket, connected, sessionToken]);

  // Bid handler
  const handleBid = useCallback((increment: number) => {
    if (!socket || !team || !auction || auction.status !== "active" || cooldown) return;

    socket.emit("client:place_bid", { teamId: team.teamId, auctionId: auction.auctionId, increment }, (res: any) => {
      if (!res.success) {
        setBidMessage({ type: "error", text: res.error || "Bid failed" });
        setTimeout(() => setBidMessage(null), 3000);
      }
    });

    // Cooldown
    setCooldown(true);
    setTimeout(() => setCooldown(false), 1500);
  }, [socket, team, auction, cooldown]);

  // Listen for auction events
  useEffect(() => {
    if (!socket || !connected) return;

    const handleStarted = (a: Auction) => {
      setAuction(a); setCurrentBid(a.startBid); setTimer(a.duration);
      setLeadingTeam(""); setBidMessage(null); setAuctionCleared(false);
    };
    const handleCleared = () => {
      setAuction(null); setCurrentBid(0); setTimer(0);
      setLeadingTeam(""); setBidMessage(null); setAuctionCleared(true);
    };
    const handleBidUpdate = (data: { auctionId: string; bid: Bid; teamName: string; increment?: number }) => {
      setCurrentBid(data.bid.amount); setLeadingTeam(data.teamName);
      if (data.bid.teamId === teamRef.current?.teamId) {
        setBidMessage({ type: "success", text: `Bid ${data.bid.amount} (+${data.increment ?? 0})` });
      } else {
        setBidMessage({ type: "error", text: `${data.teamName} → ${data.bid.amount}` });
      }
      setTimeout(() => setBidMessage(null), 3000);
    };
    const handleTimer = (data: { auctionId: string; remaining: number }) => { setTimer(data.remaining); };
    const handleEnded = (data: { auctionId?: string; winner: any; winningBid: number | null }) => {
      setAuction((a) => (a ? { ...a, status: "completed" } : null));
      if (data.winner) {
        const isWinner = data.winner.teamId === teamRef.current?.teamId;
        if (isWinner && data.winningBid) {
          setCoins((c) => Math.max(0, c - (data.winningBid ?? 0)));
          flash(setCoinFlash);
        }
        setBidMessage({
          type: isWinner ? "success" : "error",
          text: isWinner ? `You won! ${data.winningBid}` : `${data.winner.teamName} won`,
        });
      } else {
        setBidMessage({ type: "error", text: "No bids" });
      }
    };
    const handleTaskResult = (data: TaskResultEvent) => {
      if (data.teamId !== teamRef.current?.teamId) return;
      setCoins(data.coins); setPoints(data.rewardPoints);
      if (data.result === "pass") {
        flash(setPointsFlash);
        setBidMessage({ type: "success", text: `+${data.rewardGranted} points` });
      } else {
        setBidMessage({ type: "error", text: "Task failed" });
      }
      setTimeout(() => setBidMessage(null), 5000);
    };

    socket.on("auction:started", handleStarted);
    socket.on("auction:bid_update", handleBidUpdate);
    socket.on("auction:timer", handleTimer);
    socket.on("auction:ended", handleEnded);
    socket.on("auction:cleared", handleCleared);
    socket.on("task:result", handleTaskResult);

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
      socket.off("auction:cleared", handleCleared);
      socket.off("task:result", handleTaskResult);
      socket.off("theme:changed", handleThemeChanged);
    };
  }, [socket, connected]);

  // Arrow keys to bid (left = +20, right = +50)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!team || auction?.status !== "active" || timer <= 0) return;
      
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleBid(20);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleBid(50);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [team, auction, timer, handleBid]);

  // Register
  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket) return;

    // Validate all fields
    if (!validateForm()) {
      setBidMessage({ type: "error", text: "Please fix the errors below" });
      setTimeout(() => setBidMessage(null), 3000);
      return;
    }

    // Trim all inputs before sending
    const trimmedForm = {
      teamName: form.teamName.trim(),
      player1: form.player1.trim(),
      player2: form.player2.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
    };

    socket.emit("client:register", trimmedForm, (res: any) => {
      if (res.success && res.team && res.sessionToken) {
        setTeam(res.team); setCoins(res.team.bid_coins); setPoints(res.team.reward_points);
        localStorage.setItem("sessionToken", res.sessionToken);
        localStorage.setItem("teamId", res.team.teamId);
      } else {
        setBidMessage({ type: "error", text: res.error || "Registration failed" });
        setTimeout(() => setBidMessage(null), 3000);
      }
    });
  };

  /* ── Registration Form ── */
  if (!team) {
    return (
      <div style={regRoot}>
        <style>{dashboardStyles}</style>

        {/* Header */}
        <header style={regHeader}>
          <BrandHeader variant="compact" inverted />
        </header>

        {/* Main Content */}
        <div style={regContent}>
          {/* Left Side - Branding */}
          <div style={regLeft}>
            <BrandHeader variant="centered" inverted style={{ marginBottom: "20px" }} />
            <p style={{ fontFamily: F.body, fontSize: "clamp(0.95rem, 1.5vw, 1.15rem)", color: "#94A3B8", lineHeight: 1.7, maxWidth: "400px", marginBottom: "32px" }}>
              Compete in a fast-paced coding auction.
              Bid strategically, solve under pressure,
              and climb the leaderboard.
            </p>

            {/* Rule Hints */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "32px" }}>
              {[
                "Each team starts with coins",
                "Bid to win coding challenges",
                "Solve within time to earn rewards",
                "Highest reward points wins",
              ].map((rule, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: C.accent, flexShrink: 0 }} />
                    <span style={{ fontFamily: F.body, fontSize: "0.9rem", color: "#CBD5E1" }}>{rule}</span>
                  </div>
              ))}
            </div>

            <p style={{ fontFamily: F.body, fontSize: "0.85rem", color: "#64748B", fontStyle: "italic" }}>
              Stay sharp. Every bid counts.
            </p>
          </div>

          {/* Right Side - Form */}
          <div style={regRight}>
            <div style={regFormCard}>
              <div style={{ fontFamily: F.heading, fontWeight: 800, fontSize: "1.5rem", color: C.primary, textAlign: "center", marginBottom: "24px" }}>
                Team Registration
              </div>
              <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {([
                  { key: "teamName", label: "Team Name", placeholder: "Enter team name" },
                  { key: "player1", label: "Player 1", placeholder: "First player name" },
                  { key: "player2", label: "Player 2", placeholder: "Second player name" },
                  { key: "email", label: "Email", placeholder: "team@example.com", type: "email" },
                  { key: "phone", label: "Contact Number", placeholder: "10-digit phone number" },
                ] as Array<{ key: "teamName" | "player1" | "player2" | "email" | "phone"; label: string; placeholder: string; type?: string }>).map((field) => (
                  <div key={field.key}>
                    <label style={{ fontFamily: F.body, fontWeight: 600, fontSize: "0.75rem", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "6px", display: "block" }}>
                      {field.label}
                    </label>
                    <input
                      style={{
                        ...regInput,
                        borderColor: formErrors[field.key] && formTouched[field.key] ? C.danger : regInput.borderColor,
                      }}
                      type={field.type || "text"}
                      placeholder={field.placeholder}
                      value={form[field.key]}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      onBlur={() => handleFieldBlur(field.key)}
                      required
                    />
                    {formErrors[field.key] && formTouched[field.key] && (
                      <div style={{
                        fontFamily: F.body, fontSize: "0.7rem", color: C.danger,
                        marginTop: "4px", fontWeight: 500,
                      }}>
                        {formErrors[field.key]}
                      </div>
                    )}
                  </div>
                ))}
                <button
                  type="submit"
                  disabled={!isFormValid()}
                  style={{
                    ...regBtn,
                    opacity: isFormValid() ? 1 : 0.5,
                    cursor: isFormValid() ? "pointer" : "not-allowed",
                  }}
                >
                  Enter Auction
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Footer Sections */}
        <div style={regFooter}>
          <div style={regFooterContent}>
            {/* About */}
            <div style={regFooterSection}>
              <div style={{ fontFamily: F.heading, fontWeight: 700, fontSize: "1rem", color: C.accent, marginBottom: "12px", letterSpacing: "0.05em" }}>About</div>
              <p style={{ fontFamily: F.body, fontSize: "0.85rem", color: "#94A3B8", lineHeight: 1.6 }}>
                Bid for C is a competitive coding auction event where teams bid coins to solve challenges.
              </p>
            </div>

            {/* How it works */}
            <div style={regFooterSection}>
              <div style={{ fontFamily: F.heading, fontWeight: 700, fontSize: "1rem", color: C.accent, marginBottom: "12px", letterSpacing: "0.05em" }}>How it works</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {["Bid to win a problem", "Solve within given time", "Admin verifies result", "Earn reward points"].map((step, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontFamily: F.heading, fontWeight: 700, fontSize: "0.75rem", color: C.accent }}>{i + 1}.</span>
                    <span style={{ fontFamily: F.body, fontSize: "0.85rem", color: "#94A3B8" }}>{step}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Winning Criteria */}
            <div style={regFooterSection}>
              <div style={{ fontFamily: F.heading, fontWeight: 700, fontSize: "1rem", color: C.accent, marginBottom: "12px", letterSpacing: "0.05em" }}>Winning Criteria</div>
              <p style={{ fontFamily: F.body, fontSize: "0.85rem", color: "#94A3B8", lineHeight: 1.6 }}>
                Team with highest reward points wins. Ties resolved by remaining coins.
              </p>
            </div>
          </div>
        </div>

        <FeedbackToast message={bidMessage} />
      </div>
    );
  }

  const isActive = auction?.status === "active" && timer > 0;

  /* ── Main Task Phase ── */
  if ((phase === "main_task" || (phase as any) === "task") && (task || winningTeam)) {
    const winnerId = winningTeam?.teamId || task?.teamId;
    const winnerName = winningTeam?.teamName || task?.teamName || "Winning Team";
    const isWinner = winnerId === team.teamId;
    const displayTimer = (mainTaskTimer ? mainTaskTimer.remaining : taskTimer) ?? 0;
    const activeExplicit = explicitTimer || sideTaskTimer;
    const isFailed = task?.result === "fail";

    return (
      <div style={dashRoot}>
        <style>{dashboardStyles}</style>
        <FeedbackToast message={bidMessage} />

        {/* Team Header */}
        <TeamHeaderBar teamName={team.teamName} connected={connected} />

        {/* Stat Cards */}
        <div style={dashStatRow}>
          <DashboardCard
            label="COINS" value={coins} color={C.accent} flash={coinFlash}
            icon={<CoinIcon />} size="large"
          />
          <DashboardCard
            label="POINTS" value={points} color={C.success} flash={pointsFlash}
            icon={<PointsIcon />} size="large"
          />
        </div>

        {/* Status */}
        <StatusBanner
          status={
            isFailed
              ? (isWinner ? "TASK FAILED — WAITING FOR RESOLUTION" : "PRIMARY SOLVER FAILED")
              : (isWinner ? "YOUR TASK — SOLVE NOW" : `${winnerName} is solving`)
          }
          color={isFailed ? C.danger : isWinner ? C.accent : C.muted}
        />

        {/* Task Timer */}
        {!isFailed && (
          <div style={{ marginTop: "24px" }}>
            {task ? (
              <TaskTimer task={task} timeLimit={task.time_limit} endAt={task.endAt} timeLeft={displayTimer} ended={taskEnded} paused={taskPaused} size="medium" />
            ) : (
              <TimerDisplay timeLeft={displayTimer} isUrgent={displayTimer <= 30} />
            )}
          </div>
        )}

        {/* Secondary Explicit Timer ("Open Challenge") if active */}
        {activeExplicit && activeExplicit.remaining > 0 && (
          <div style={{
            marginTop: "20px", padding: "16px 24px", borderRadius: tokens.radius.lg,
            backgroundColor: `${C.accent}15`, border: `2px solid ${C.accent}`,
            display: "flex", flexDirection: "column", alignItems: "center", gap: "6px",
          }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 800, color: C.accent, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {activeExplicit.label || "Open Challenge"}
            </span>
            <span style={{ fontFamily: F.heading, fontWeight: 900, fontSize: "2.2rem", color: "#FFFFFF" }}>
              {formatClock(activeExplicit.remaining)}
            </span>
            <span style={{ fontSize: "0.75rem", color: "#94A3B8" }}>
              {isWinner ? "Open challenge running for other teams" : "Solve offline now — report solution to Admin!"}
            </span>
          </div>
        )}

        <div style={{ fontFamily: F.body, fontSize: "0.9rem", color: C.muted, marginTop: "16px", textAlign: "center" }}>
          Reward: {currentQuestion?.reward ?? task?.defaultReward ?? 100} pts
        </div>
      </div>
    );
  }

  /* ── Ended Phase ── */
  if (phase === "ended") {
    return (
      <div style={dashRoot}>
        <style>{dashboardStyles}</style>
        <FeedbackToast message={bidMessage} />

        {/* Team Header */}
        <TeamHeaderBar teamName={team.teamName} connected={connected} />

        {/* Stat Cards */}
        <div style={dashStatRow}>
          <DashboardCard
            label="COINS" value={coins} color={C.accent} flash={coinFlash}
            icon={<CoinIcon />} size="large"
          />
          <DashboardCard
            label="POINTS" value={points} color={C.success} flash={pointsFlash}
            icon={<PointsIcon />} size="large"
          />
        </div>

        {/* Status */}
        <StatusBanner
          status="ROUND COMPLETED — WAITING FOR NEXT AUCTION"
          color={C.info}
        />
      </div>
    );
  }

  /* ── Waiting State ── */
  if (!auction) {
    return (
      <div style={dashRoot}>
        <style>{dashboardStyles}</style>
        <FeedbackToast message={bidMessage} />

        {/* Team Header */}
        <TeamHeaderBar teamName={team.teamName} connected={connected} />

        {/* Stat Cards */}
        <div style={dashStatRow}>
          <DashboardCard
            label="COINS" value={coins} color={C.accent} flash={coinFlash}
            icon={<CoinIcon />} size="large"
          />
          <DashboardCard
            label="POINTS" value={points} color={C.success} flash={pointsFlash}
            icon={<PointsIcon />} size="large"
          />
        </div>

        {/* Status */}
        <StatusBanner
          status={auctionCleared ? "NEXT AUCTION SOON" : "WAITING FOR AUCTION"}
          color={C.info}
        />

        {/* Connection */}
        <div style={{
          marginTop: "24px",
          fontFamily: F.body, fontSize: "0.85rem",
          color: connected ? C.success : C.danger,
          display: "flex", alignItems: "center", gap: "8px",
        }}>
          <div style={{
            width: "8px", height: "8px", borderRadius: "50%",
            backgroundColor: connected ? C.success : C.danger,
          }} />
          {connected ? "Connected" : "Reconnecting..."}
        </div>
      </div>
    );
  }

  /* ── Active Auction ── */
  const isLeading = leadingTeam === team.teamName;
  return (
    <div style={dashRoot}>
      <style>{dashboardStyles}</style>
      <FeedbackToast message={bidMessage} />

      {/* Team Header */}
      <TeamHeaderBar teamName={team.teamName} connected={connected} />

      {/* Timer */}
      <div style={{ marginBottom: "24px" }}>
        <TimerDisplay timeLeft={timer} isUrgent={timer <= 10} />
      </div>

      {/* Current Bid Hero */}
      <div style={{
        backgroundColor: C.surface, border: `2px solid ${C.border}`,
        borderRadius: tokens.radius.xl, padding: "24px 48px",
        marginBottom: "8px", textAlign: "center",
        boxShadow: tokens.shadow.md,
      }}>
        <div style={{
          fontFamily: F.body, fontWeight: 600, fontSize: "0.7rem",
          color: C.muted, letterSpacing: "0.2em", textTransform: "uppercase",
          marginBottom: "4px",
        }}>CURRENT BID</div>
        <div style={{
          fontFamily: F.heading, fontWeight: 900,
          fontSize: "clamp(3.5rem, 14vw, 6rem)",
          color: C.primary, fontVariantNumeric: "tabular-nums", lineHeight: 1,
        }}>{currentBid}</div>
      </div>

      {/* Next Bids */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
        <div style={{
          fontFamily: F.heading, fontWeight: 700, fontSize: "1rem",
          color: C.primary, backgroundColor: C.surface,
          border: `2px solid ${C.border}`, borderRadius: tokens.radius.md,
          padding: "10px 20px", display: "flex", alignItems: "center", gap: "8px",
        }}>
          <span style={{ color: C.muted, fontFamily: F.body, fontSize: "0.85rem" }}>+20 →</span>
          <span style={{ color: C.accent }}>{currentBid + 20}</span>
        </div>
        <div style={{
          fontFamily: F.heading, fontWeight: 700, fontSize: "1rem",
          color: C.primary, backgroundColor: C.accent,
          border: `2px solid ${C.primary}`, borderRadius: tokens.radius.md,
          padding: "10px 20px", display: "flex", alignItems: "center", gap: "8px",
          boxShadow: `0 2px 12px ${C.accent}44`,
        }}>
          <span style={{ color: C.primary, fontFamily: F.body, fontSize: "0.85rem" }}>+50 →</span>
          <span style={{ color: C.primary }}>{currentBid + 50}</span>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={dashStatRow}>
        <DashboardCard
          label="COINS" value={coins} color={C.accent} flash={coinFlash}
          icon={<CoinIcon />}
        />
        <DashboardCard
          label="POINTS" value={points} color={C.success} flash={pointsFlash}
          icon={<PointsIcon />}
        />
      </div>

      {/* Status Banner */}
      <div style={{ marginTop: "20px" }}>
        <StatusBanner
          status={isLeading ? "YOU ARE LEADING" : "BIDDING ACTIVE"}
          color={isLeading ? C.success : C.info}
        />
      </div>

      {/* Bid Buttons */}
      {isActive && (
        <div style={{ width: "100%", maxWidth: "420px", marginTop: "24px" }}>
          <div style={{ display: "flex", gap: "16px" }}>
            <BidButton
              onClick={() => handleBid(20)}
              disabled={!isActive}
              coins={coins}
              bidAmount={currentBid + 20}
              leading={leadingTeam}
              isTeam={team.teamName}
              increment={20}
            />
            <BidButton
              onClick={() => handleBid(50)}
              disabled={!isActive}
              coins={coins}
              bidAmount={currentBid + 50}
              leading={leadingTeam}
              isTeam={team.teamName}
              increment={50}
            />
          </div>
          <div style={{
            marginTop: "12px",
            fontFamily: F.body, fontSize: "0.75rem",
            color: C.muted, textAlign: "center",
          }}>
            Press ← for +20  |  Press → for +50
          </div>
        </div>
      )}

      {/* Ended */}
      {!isActive && auction.status === "completed" && (
        <div style={{
          marginTop: "20px", padding: "16px 32px",
          borderRadius: tokens.radius.lg,
          backgroundColor: C.surface, border: `2px solid ${C.border}`,
          fontFamily: F.heading, fontWeight: 700, fontSize: "1.2rem",
          color: C.muted, textAlign: "center",
        }}>
          Auction Ended
        </div>
      )}
    </div>
  );
}

/* ─── Layout ─── */
const dashRoot: React.CSSProperties = {
  minHeight: "100vh", display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center",
  backgroundColor: C.bg, color: C.text,
  fontFamily: F.body, userSelect: "none",
  padding: "clamp(24px, 4vw, 48px)",
  gap: "20px",
};

const dashHeaderContainer: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center",
  width: "100%", maxWidth: "500px", marginBottom: "16px",
};

const dashTopRow: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  width: "100%", marginBottom: "12px",
};

const dashTeamName: React.CSSProperties = {
  fontFamily: F.heading, fontWeight: 900,
  fontSize: "clamp(1.75rem, 5vw, 2.75rem)",
  color: C.primary, letterSpacing: "0.03em",
  lineHeight: 1.1, textAlign: "center",
};

const dashStatRow: React.CSSProperties = {
  display: "flex", gap: "20px", justifyContent: "center",
};

/* ─── SVG Icons ─── */
function CoinIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 6v12M8 9.5c0-1.38 1.79-2.5 4-2.5s4 1.12 4 2.5-1.79 2.5-4 2.5-4 1.12-4 2.5 1.79 2.5 4 2.5"/>
    </svg>
  );
}

function PointsIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={C.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  );
}

/* ─── Dashboard CSS Animations ─── */
const dashboardStyles = `
  @keyframes toastSlide {
    from { opacity: 0; transform: translateX(-50%) translateY(-12px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  @keyframes cardFlash {
    0% { box-shadow: 0 0 0 0 rgba(212,175,55,0.4); }
    50% { box-shadow: 0 0 32px 8px rgba(212,175,55,0.25); }
    100% { box-shadow: 0 0 0 0 rgba(212,175,55,0); }
  }
  @keyframes statusPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.85; }
  }
  @keyframes dotPulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.3); opacity: 0.7; }
  }
  @keyframes regFadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

/* ─── Registration Page ─── */
const regRoot: React.CSSProperties = {
  minHeight: "100vh", display: "flex", flexDirection: "column",
  backgroundColor: C.primary, color: "#FFFFFF",
  fontFamily: F.body, userSelect: "none",
  animation: "regFadeIn 0.6s ease-out",
};

const regHeader: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  gap: "10px", padding: "20px 0",
  borderBottom: "1px solid rgba(255,255,255,0.1)",
};

const regContent: React.CSSProperties = {
  flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
  gap: "clamp(32px, 5vw, 80px)", padding: "clamp(24px, 4vw, 64px)",
  flexWrap: "wrap",
};

const regLeft: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center",
  maxWidth: "450px", textAlign: "center",
};

const regRight: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
};

const regFormCard: React.CSSProperties = {
  backgroundColor: "#FFFFFF", borderRadius: "16px",
  padding: "clamp(24px, 3vw, 36px)",
  width: "100%", maxWidth: "400px",
  boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
};

const regInput: React.CSSProperties = {
  fontFamily: F.body, fontSize: "0.95rem",
  padding: "12px 16px", borderRadius: "8px",
  border: `2px solid ${C.border}`, backgroundColor: C.bg,
  color: C.text, outline: "none", width: "100%",
  transition: "border-color 0.2s ease",
  boxSizing: "border-box" as const,
};

const regBtn: React.CSSProperties = {
  fontFamily: F.heading, fontWeight: 700, fontSize: "1rem",
  padding: "14px 24px", borderRadius: "8px",
  border: "none", backgroundColor: C.accent, color: C.primary,
  cursor: "pointer", width: "100%",
  marginTop: "8px", transition: "all 0.2s ease",
};

const regFooter: React.CSSProperties = {
  borderTop: "1px solid rgba(255,255,255,0.1)",
  padding: "clamp(24px, 4vw, 48px)",
};

const regFooterContent: React.CSSProperties = {
  display: "flex", justifyContent: "center", gap: "clamp(32px, 5vw, 80px)",
  flexWrap: "wrap", maxWidth: "1200px", margin: "0 auto",
};

const regFooterSection: React.CSSProperties = {
  maxWidth: "300px",
};
