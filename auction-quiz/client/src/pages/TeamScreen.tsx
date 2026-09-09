import { useEffect, useRef, useState, useCallback } from "react";
import { useGamePhase, formatClock } from "../hooks/useGamePhase";
import { getServerBase } from "../hooks/useSocket";
import { tokens } from "../design-system";
import { BrandHeader } from "../components/BrandHeader";
import type { Team, Auction, Bid, TaskResultEvent } from "../shared/types";

const C = tokens.color;
const F = tokens.font;

interface TeamScreenProps {
  sessionToken?: string | null;
}

/* ─── Helpers ─── */
function getQuestionImageUrl(imagePath?: string): string {
  if (!imagePath) return "";
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) return imagePath;
  if (imagePath.startsWith("/questions/")) return `${getServerBase()}${imagePath}`;
  if (imagePath.startsWith("/")) return `${getServerBase()}${imagePath}`;
  return `${getServerBase()}/questions/${imagePath}`;
}

/* ─── SVG Icons ─── */
function CoinIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v12M8 9.5c0-1.38 1.79-2.5 4-2.5s4 1.12 4 2.5-1.79 2.5-4 2.5-4 1.12-4 2.5 1.79 2.5 4 2.5" />
    </svg>
  );
}

function PointsIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={C.success} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function ClockIcon({ size = 20, color = C.primary }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

/* ─── Header Timer Zone (Top Right ONLY) ─── */
function HeaderTimerZone({
  phase,
  isWinner,
  biddingTime,
  taskTime,
}: {
  phase: string;
  isWinner: boolean;
  biddingTime: number;
  taskTime: number;
}) {
  const isBidding = phase === "bidding";
  const isTask = phase === "main_task" && isWinner;

  if (isBidding) {
    const isUrgent = biddingTime <= 10;
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "6px 16px",
        borderRadius: tokens.radius.md,
        backgroundColor: isUrgent ? `${C.danger}15` : `${C.primary}12`,
        border: `2px solid ${isUrgent ? C.danger : C.primary}`,
        boxShadow: isUrgent ? `0 0 16px ${C.danger}40` : "none",
        animation: isUrgent ? "urgentPulse 1s infinite" : "none",
      }}>
        <ClockIcon size={20} color={isUrgent ? C.danger : C.primary} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <span style={{
            fontFamily: F.mono,
            fontWeight: 900,
            fontSize: "1.55rem",
            color: isUrgent ? C.danger : C.primary,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}>
            {formatClock(biddingTime)}
          </span>
          <span style={{
            fontSize: "0.6rem",
            fontWeight: 800,
            color: isUrgent ? C.danger : C.muted,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginTop: "2px",
          }}>
            BID TIMER
          </span>
        </div>
      </div>
    );
  }

  if (isTask) {
    const isUrgent = taskTime <= 30;
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "6px 16px",
        borderRadius: tokens.radius.md,
        backgroundColor: isUrgent ? `${C.danger}15` : `${C.accent}15`,
        border: `2px solid ${isUrgent ? C.danger : C.accent}`,
        boxShadow: isUrgent ? `0 0 16px ${C.danger}40` : "none",
        animation: isUrgent ? "urgentPulse 1s infinite" : "none",
      }}>
        <ClockIcon size={20} color={isUrgent ? C.danger : C.accent} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <span style={{
            fontFamily: F.mono,
            fontWeight: 900,
            fontSize: "1.55rem",
            color: isUrgent ? C.danger : C.accent,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}>
            {formatClock(taskTime)}
          </span>
          <span style={{
            fontSize: "0.6rem",
            fontWeight: 800,
            color: isUrgent ? C.danger : C.accent,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginTop: "2px",
          }}>
            TASK TIMER
          </span>
        </div>
      </div>
    );
  }

  if (phase === "post_bid_idle" && isWinner) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "6px 16px",
        borderRadius: tokens.radius.md,
        backgroundColor: `${C.accent}15`,
        border: `2px solid ${C.accent}`,
      }}>
        <ClockIcon size={20} color={C.accent} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <span style={{
            fontFamily: F.mono,
            fontWeight: 900,
            fontSize: "1.3rem",
            color: C.accent,
            lineHeight: 1,
          }}>
            STANDBY
          </span>
          <span style={{
            fontSize: "0.6rem",
            fontWeight: 800,
            color: C.accent,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginTop: "2px",
          }}>
            AWAITING TIMER
          </span>
        </div>
      </div>
    );
  }

  // Idle / Inactive Timer Zone (No connection status here!)
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "6px 14px",
      borderRadius: tokens.radius.md,
      backgroundColor: `${C.border}40`,
      border: `1px solid ${C.border}`,
      opacity: 0.65,
    }}>
      <ClockIcon size={18} color={C.muted} />
      <span style={{
        fontFamily: F.mono,
        fontWeight: 700,
        fontSize: "1.1rem",
        color: C.muted,
        letterSpacing: "0.05em",
        lineHeight: 1,
      }}>
        --:--
      </span>
    </div>
  );
}

/* ─── Feedback Toast ─── */
function FeedbackToast({ message }: { message: { type: "success" | "error"; text: string } | null }) {
  if (!message) return null;
  const isSuccess = message.type === "success";
  return (
    <div style={{
      position: "fixed",
      top: "92px",
      left: "50%",
      transform: "translateX(-50%)",
      backgroundColor: isSuccess ? C.success : C.danger,
      color: "#FFFFFF",
      fontFamily: F.heading,
      fontWeight: 700,
      fontSize: "0.95rem",
      padding: "10px 24px",
      borderRadius: tokens.radius.full,
      boxShadow: tokens.shadow.lg,
      animation: "toastSlide 0.3s ease",
      zIndex: 1000,
      display: "flex",
      alignItems: "center",
      gap: "8px",
    }}>
      {message.text}
    </div>
  );
}

/* ─── Main Team Screen Component ─── */
export default function TeamScreen({ sessionToken }: TeamScreenProps = {}) {
  const {
    socket,
    connected,
    phase,
    currentQuestion,
    currentBid: gameBid,
    leadingTeam: phaseLeadingTeam,
    winningTeam,
    biddingTimer,
    mainTaskTimer,
    task,
    taskTimer,
    activeAuction,
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
  const [bidFlash, setBidFlash] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [imgError, setImgError] = useState(false);

  const teamRef = useRef<Team | null>(null);
  teamRef.current = team;

  const prevBidRef = useRef(currentBid);

  // Sync gameBid and flash current bid
  useEffect(() => {
    if (gameBid !== undefined && gameBid !== null) {
      setCurrentBid(gameBid);
      if (gameBid !== prevBidRef.current && gameBid > 0) {
        setBidFlash(true);
        const t = setTimeout(() => setBidFlash(false), 800);
        return () => clearTimeout(t);
      }
      prevBidRef.current = gameBid;
    }
  }, [gameBid]);

  // Sync leading team
  useEffect(() => {
    if (phaseLeadingTeam !== undefined) setLeadingTeam(phaseLeadingTeam || "");
  }, [phaseLeadingTeam]);

  // Sync active auction
  useEffect(() => {
    if (activeAuction) setAuction(activeAuction);
  }, [activeAuction]);

  // Sync bidding timer
  useEffect(() => {
    if (biddingTimer && biddingTimer.remaining !== undefined) {
      setTimer(biddingTimer.remaining);
    }
  }, [biddingTimer?.remaining]);

  // Reset imgError when currentQuestion changes
  useEffect(() => {
    setImgError(false);
  }, [currentQuestion?.id, currentQuestion?.image]);

  const flash = (setter: (v: boolean) => void) => {
    setter(true);
    setTimeout(() => setter(false), 1500);
  };

  // Auto-reconnect session
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

  // Bid placement handler
  const handleBid = useCallback((increment: number) => {
    const targetAuction = activeAuction || auction;
    const targetAuctionId = targetAuction?.auctionId;
    if (!socket || !team || !targetAuctionId || cooldown) return;
    if (phase !== "bidding") return;

    socket.emit(
      "client:place_bid",
      { teamId: team.teamId, auctionId: targetAuctionId, increment },
      (res: any) => {
        if (!res.success) {
          setBidMessage({ type: "error", text: res.error || "Bid failed" });
          setTimeout(() => setBidMessage(null), 3000);
        } else {
          setBidMessage({ type: "success", text: `Bid placed: +${increment}` });
          setTimeout(() => setBidMessage(null), 2000);
        }
      }
    );

    setCooldown(true);
    setTimeout(() => setCooldown(false), 1000);
  }, [socket, team, activeAuction, auction, cooldown, phase]);

  // Socket event listeners for live sync
  useEffect(() => {
    if (!socket || !connected) return;

    const handleStarted = (a: Auction) => {
      setAuction(a);
      setCurrentBid(a.startBid);
      setTimer(a.duration);
      setLeadingTeam("");
      setBidMessage(null);
      setAuctionCleared(false);
      setImgError(false);
    };

    const handleCleared = () => {
      setAuction(null);
      setCurrentBid(0);
      setTimer(0);
      setLeadingTeam("");
      setBidMessage(null);
      setAuctionCleared(true);
      setImgError(false);
    };

    const handleBidUpdate = (data: { auctionId: string; bid: Bid; teamName: string; increment?: number }) => {
      setCurrentBid(data.bid.amount);
      setLeadingTeam(data.teamName);
      setBidFlash(true);
      setTimeout(() => setBidFlash(false), 800);

      if (data.bid.teamId === teamRef.current?.teamId) {
        setBidMessage({ type: "success", text: `Your bid: ${data.bid.amount} (+${data.increment ?? 0})` });
      } else {
        setBidMessage({ type: "error", text: `${data.teamName} → ${data.bid.amount}` });
      }
      setTimeout(() => setBidMessage(null), 3000);
    };

    const handleTimerEvent = (data: { auctionId: string; remaining: number }) => {
      setTimer(data.remaining);
    };

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
          text: isWinner ? `You won the bid! (${data.winningBid})` : `${data.winner.teamName} won the bid`,
        });
      } else {
        setBidMessage({ type: "error", text: "No bids received" });
      }
      setTimeout(() => setBidMessage(null), 4000);
    };

    const handleTaskResult = (data: TaskResultEvent) => {
      if (data.teamId !== teamRef.current?.teamId) return;
      setCoins(data.coins);
      setPoints(data.rewardPoints);
      if (data.result === "pass") {
        flash(setPointsFlash);
        setBidMessage({ type: "success", text: `+${data.rewardGranted} points granted!` });
      } else {
        setBidMessage({ type: "error", text: "Task marked as failed" });
      }
      setTimeout(() => setBidMessage(null), 5000);
    };

    const handleTeamUpdate = (data: { team: Team }) => {
      if (data.team && data.team.teamId === teamRef.current?.teamId) {
        setCoins(data.team.bid_coins);
        setPoints(data.team.reward_points);
        setTeam(data.team);
      }
    };

    const handleScoreUpdate = (data?: any) => {
      const list = data?.teams || data?.scoreboard;
      if (list && Array.isArray(list) && teamRef.current) {
        const found = list.find((t: any) => t.teamId === teamRef.current?.teamId);
        if (found) {
          setCoins(found.bid_coins);
          setPoints(found.reward_points);
        }
      }
    };

    const handleFullState = (data: any) => {
      if (data.activeAuction) setAuction(data.activeAuction);
      if (data.currentBid !== undefined) setCurrentBid(data.currentBid);
      if (data.leadingTeam) setLeadingTeam(data.leadingTeam);
      if (data.timers?.bidding?.remaining !== undefined) setTimer(data.timers.bidding.remaining);
      if (data.scoreboard && teamRef.current) {
        const found = data.scoreboard.find((t: any) => t.teamId === teamRef.current?.teamId);
        if (found) {
          setCoins(found.bid_coins);
          setPoints(found.reward_points);
        }
      }
    };

    socket.on("state:full" as any, handleFullState);
    socket.on("auction:started", handleStarted);
    socket.on("auction:start" as any, handleStarted);
    socket.on("auction:bid_update", handleBidUpdate);
    socket.on("bid:update" as any, handleBidUpdate);
    socket.on("auction:timer", handleTimerEvent);
    socket.on("auction:ended", handleEnded);
    socket.on("bid:win" as any, handleEnded);
    socket.on("auction:cleared", handleCleared);
    socket.on("task:result", handleTaskResult);
    socket.on("team:update" as any, handleTeamUpdate);
    socket.on("scoreboard:updated", handleScoreUpdate);
    socket.on("scoreboard:update" as any, handleScoreUpdate);

    return () => {
      socket.off("state:full" as any, handleFullState);
      socket.off("auction:started", handleStarted);
      socket.off("auction:start" as any, handleStarted);
      socket.off("auction:bid_update", handleBidUpdate);
      socket.off("bid:update" as any, handleBidUpdate);
      socket.off("auction:timer", handleTimerEvent);
      socket.off("auction:ended", handleEnded);
      socket.off("bid:win" as any, handleEnded);
      socket.off("auction:cleared", handleCleared);
      socket.off("task:result", handleTaskResult);
      socket.off("team:update" as any, handleTeamUpdate);
      socket.off("scoreboard:updated", handleScoreUpdate);
      socket.off("scoreboard:update" as any, handleScoreUpdate);
    };
  }, [socket, connected]);

  // Keyboard arrow key shortcuts (Left Arrow -> +20, Right Arrow -> +50)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Must NOT trigger when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (phase !== "bidding") return;
      if (!team || cooldown) return;
      if (leadingTeam === team.teamName) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (coins >= currentBid + 20) {
          handleBid(20);
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (coins >= currentBid + 50) {
          handleBid(50);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, team, coins, currentBid, leadingTeam, cooldown, handleBid]);

  /* ─── Registration Form State & Handlers ─── */
  type FormField = "teamName" | "player1" | "player2" | "phone" | "email";
  const [form, setForm] = useState({ teamName: "", player1: "", player2: "", phone: "", email: "" });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formTouched, setFormTouched] = useState<Record<string, boolean>>({});

  const validateField = (name: string, value: string): string => {
    const trimmed = value.trim();
    switch (name) {
      case "teamName":
        if (trimmed.length < 3 || trimmed.length > 30) return "Team name must be 3-30 characters";
        if (!/^[a-zA-Z0-9 ]+$/.test(trimmed)) return "Team name must be alphanumeric";
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

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket) return;
    if (!validateForm()) {
      setBidMessage({ type: "error", text: "Please fix the errors below" });
      setTimeout(() => setBidMessage(null), 3000);
      return;
    }

    const trimmedForm = {
      teamName: form.teamName.trim(),
      player1: form.player1.trim(),
      player2: form.player2.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
    };

    socket.emit("client:register", trimmedForm, (res: any) => {
      if (res.success && res.team && res.sessionToken) {
        setTeam(res.team);
        setCoins(res.team.bid_coins);
        setPoints(res.team.reward_points);
        localStorage.setItem("sessionToken", res.sessionToken);
        localStorage.setItem("teamId", res.team.teamId);
      } else {
        setBidMessage({ type: "error", text: res.error || "Registration failed" });
        setTimeout(() => setBidMessage(null), 3000);
      }
    });
  };

  /* ─── Registration View (When not logged in) ─── */
  if (!team) {
    return (
      <div style={regRoot}>
        <style>{dashboardStyles}</style>
        <header style={regHeader}>
          <BrandHeader variant="compact" inverted />
        </header>

        <div style={regContent}>
          <div style={regLeft}>
            <BrandHeader variant="centered" inverted style={{ marginBottom: "20px" }} />
            <p style={{ fontFamily: F.body, fontSize: "clamp(0.95rem, 1.5vw, 1.15rem)", color: "#94A3B8", lineHeight: 1.7, maxWidth: "400px", marginBottom: "32px" }}>
              Compete in a fast-paced coding auction.
              Bid strategically, solve under pressure,
              and climb the leaderboard.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "32px" }}>
              {[
                "Each team starts with 1000 coins",
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
                        borderColor: formErrors[field.key] && formTouched[field.key] ? C.danger : C.border,
                      }}
                      type={field.type || "text"}
                      placeholder={field.placeholder}
                      value={form[field.key]}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      onBlur={() => handleFieldBlur(field.key)}
                      required
                    />
                    {formErrors[field.key] && formTouched[field.key] && (
                      <div style={{ fontFamily: F.body, fontSize: "0.7rem", color: C.danger, marginTop: "4px", fontWeight: 500 }}>
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

        <FeedbackToast message={bidMessage} />
      </div>
    );
  }

  /* ─── Derived Dashboard State ─── */
  const isLeading = leadingTeam === team.teamName;
  const winnerId = winningTeam?.teamId || task?.teamId;
  const isWinner = !!(winnerId && team && winnerId === team.teamId);
  const winnerName = winningTeam?.teamName || task?.teamName || "Winning Team";

  // Active question image resolution
  const activeImage = currentQuestion?.image || (task as any)?.image || (activeAuction as any)?.image;

  // Strict Question Visibility Rules:
  // 1. Never in idle or ended states (even if admin picked question)
  // 2. Visible to all teams during "bidding"
  // 3. Visible ONLY to the winning team during "post_bid_idle" & "main_task"
  const showQuestion = (phase === "bidding" || ((phase === "main_task" || phase === "post_bid_idle") && isWinner)) && !!activeImage && !imgError;

  // Timers
  const activeBiddingTime = biddingTimer ? biddingTimer.remaining : timer;
  const activeTaskTime = (mainTaskTimer ? mainTaskTimer.remaining : taskTimer) ?? 0;

  // Bid Button validation
  const bid20Disabled = phase !== "bidding" || isLeading || coins < currentBid + 20 || cooldown;
  const bid50Disabled = phase !== "bidding" || isLeading || coins < currentBid + 50 || cooldown;

  // Status Message & Color
  let statusMessage = "WAITING FOR AUCTION";
  let statusColor: string = C.muted;

  if (phase === "bidding") {
    statusMessage = isLeading ? "YOU ARE LEADING" : "AUCTION LIVE";
    statusColor = isLeading ? C.success : C.primary;
  } else if (phase === "post_bid_idle") {
    statusMessage = isWinner ? "AUCTION WON — STANDBY" : `${winnerName} won the bid`;
    statusColor = isWinner ? C.accent : C.muted;
  } else if (phase === "main_task") {
    statusMessage = isWinner ? "SOLVE THE TASK!" : `${winnerName} is solving`;
    statusColor = isWinner ? C.accent : C.warning;
  } else if (phase === "fallback_idle" || phase === "fallback_active") {
    statusMessage = "FALLBACK ROUND (WATCH DISPLAY)";
    statusColor = C.accent;
  } else if (phase === "result_display") {
    statusMessage = "VERDICT DECLARED";
    statusColor = C.info;
  } else if (phase === "ended") {
    statusMessage = "ROUND COMPLETED";
    statusColor = C.info;
  } else if (auctionCleared) {
    statusMessage = "NEXT AUCTION SOON";
    statusColor = C.muted;
  }

  // Inactive Placeholder Content for Left Panel (Item F)
  let placeholderTitle = "Auction Standby";
  let placeholderDesc = "Questions will appear when the quiz master starts bidding.";

  if (phase === "post_bid_idle") {
    if (isWinner) {
      placeholderTitle = "You Won the Auction!";
      placeholderDesc = "Standby as the quiz master initiates your task timer.";
    } else {
      placeholderTitle = "Auction Ended";
      placeholderDesc = `${winnerName} claimed this question. Stand by for the next round.`;
    }
  } else if (phase === "main_task") {
    if (isWinner) {
      placeholderTitle = "You Won the Auction!";
      placeholderDesc = "Solve the question shown and alert the admin when finished.";
    } else {
      placeholderTitle = "Task in Progress";
      placeholderDesc = `${winnerName} is attempting to solve the task. Stand by!`;
    }
  } else if (phase === "fallback_idle" || phase === "fallback_active") {
    placeholderTitle = "Fallback Opportunity";
    placeholderDesc = "The question has opened up to other teams. Check the projector screen!";
  } else if (phase === "result_display") {
    placeholderTitle = "Round Concluded";
    placeholderDesc = "Result has been recorded. Round is resetting...";
  } else if (phase === "ended") {
    placeholderTitle = "Round Concluded";
    placeholderDesc = "Points are recorded. Prepare for the next round.";
  }

  return (
    <div style={dashRoot}>
      <style>{dashboardStyles}</style>

      {/* ─── 1. TOP HEADER ROW (~80px FIXED HEIGHT) ─── */}
      <header style={dashHeader}>
        {/* Left: Team Info Badge */}
        <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
          <div style={headerTeamBadge}>
            <span style={headerTeamLabel}>TEAM</span>
            <span style={headerTeamValue}>{team.teamName}</span>
          </div>
        </div>

        {/* Center: Event Logo + Event Name */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <BrandHeader variant="compact" style={{ marginBottom: 0 }} />
        </div>

        {/* Right: Dynamic Timer Zone ONLY (NO connection status here!) */}
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
          <HeaderTimerZone
            phase={phase}
            isWinner={isWinner}
            biddingTime={activeBiddingTime}
            taskTime={activeTaskTime}
          />
        </div>
      </header>

      {/* ─── 2. MAIN SCREEN SPLIT (30% LEFT / 70% RIGHT) ─── */}
      <div style={dashSplit}>

        {/* ─── LEFT PANEL (30%) — TEAM CONTROL ZONE ─── */}
        <aside style={leftPanel}>
          {/* A. Team Name (Large, Bold, Left Aligned) */}
          <div style={teamNameSection}>
            <span style={teamSubLabel}>Logged in Team</span>
            <h1 style={teamHeading} title={team.teamName}>
              {team.teamName}
            </h1>
          </div>

          {/* B. Stats Row (Horizontal Side-by-Side: Coins + Points) */}
          <div style={statsRow}>
            {/* Coins Card */}
            <div style={statCard(coinFlash, C.accent)}>
              <div style={statHeader}>
                <CoinIcon size={16} />
                <span style={statLabel}>COINS</span>
              </div>
              <span style={{ ...statValue, color: C.accent }}>{coins}</span>
            </div>

            {/* Points Card */}
            <div style={statCard(pointsFlash, C.success)}>
              <div style={statHeader}>
                <PointsIcon size={16} />
                <span style={statLabel}>POINTS</span>
              </div>
              <span style={{ ...statValue, color: C.success }}>{points}</span>
            </div>
          </div>

          {/* C. Current Bid Display (NEW - MANDATORY) */}
          {phase === "bidding" ? (
            <div style={bidCardActive(bidFlash, isLeading)}>
              <span style={bidCardLabel}>CURRENT BID</span>
              <div style={{ ...bidCardNumber, color: isLeading ? C.success : C.primary }}>
                {currentBid}
              </div>
              <div style={{ ...bidCardFooter, color: isLeading ? C.success : leadingTeam ? C.accent : C.muted }}>
                {isLeading ? "★ Your team is leading!" : leadingTeam ? `Leader: ${leadingTeam}` : "Starting bid"}
              </div>
            </div>
          ) : (
            <div style={bidCardInactive}>
              <span style={bidCardLabel}>CURRENT BID</span>
              <div style={{ ...bidCardNumber, color: C.muted, opacity: 0.35 }}>
                --
              </div>
              <div style={{ ...bidCardFooter, color: C.muted, opacity: 0.7 }}>
                Inactive outside bidding
              </div>
            </div>
          )}

          {/* D. Auction Status Text (Subtle Animated Indicator) */}
          <div style={statusBanner(statusColor)}>
            <div style={{ ...statusDot, backgroundColor: statusColor, boxShadow: `0 0 10px ${statusColor}` }} />
            <span style={{ ...statusText, color: statusColor }}>
              {statusMessage}
            </span>
          </div>

          {/* E / F. Bid Controls (When Bidding) OR Clean Inactive Placeholder */}
          {phase === "bidding" ? (
            <div style={bidControlsContainer}>
              <div style={{ display: "flex", gap: "10px", width: "100%" }}>
                <button
                  type="button"
                  className="bid-btn"
                  onClick={() => handleBid(20)}
                  disabled={bid20Disabled}
                  style={bidButtonStyle(20, bid20Disabled, isLeading)}
                >
                  <span style={{ fontSize: "1.2rem", fontWeight: 900, lineHeight: 1 }}>+20</span>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, opacity: 0.85 }}>
                    {isLeading ? "LEAD" : coins < currentBid + 20 ? "NO COINS" : `Next: ${currentBid + 20}`}
                  </span>
                </button>

                <button
                  type="button"
                  className="bid-btn"
                  onClick={() => handleBid(50)}
                  disabled={bid50Disabled}
                  style={bidButtonStyle(50, bid50Disabled, isLeading)}
                >
                  <span style={{ fontSize: "1.2rem", fontWeight: 900, lineHeight: 1 }}>+50</span>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, opacity: 0.85 }}>
                    {isLeading ? "LEAD" : coins < currentBid + 50 ? "NO COINS" : `Next: ${currentBid + 50}`}
                  </span>
                </button>
              </div>

              <div style={shortcutHint}>
                Press <strong>←</strong> for +20 &nbsp;·&nbsp; Press <strong>→</strong> for +50
              </div>
            </div>
          ) : (
            <div style={inactivePlaceholderCard}>
              <div style={{ fontSize: "1.4rem", marginBottom: "4px" }}>
                {phase === "main_task" ? (isWinner ? "⚡" : "⏳") : phase === "ended" ? "🏁" : "🎯"}
              </div>
              <div style={{ fontFamily: F.heading, fontWeight: 800, fontSize: "0.95rem", color: C.primary, marginBottom: "4px" }}>
                {placeholderTitle}
              </div>
              <div style={{ fontFamily: F.body, fontSize: "0.8rem", color: C.muted, lineHeight: 1.45 }}>
                {placeholderDesc}
              </div>
            </div>
          )}
        </aside>

        {/* ─── RIGHT PANEL (70%) — QUESTION DISPLAY ZONE ─── */}
        <main style={rightPanel}>
          {showQuestion ? (
            /* Question is visible ONLY during bidding OR for winning team during main_task */
            <div style={questionCard}>
              {/* Question Metadata Header */}
              <div style={questionHeader}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={questionBadge}>
                    {phase === "main_task" ? "YOUR ACTIVE TASK" : "AUCTION QUESTION"}
                  </span>
                  {currentQuestion?.id && (
                    <span style={{ fontFamily: F.mono, fontSize: "0.8rem", color: C.muted, fontWeight: 600 }}>
                      ID: {currentQuestion.id}
                    </span>
                  )}
                </div>
                {currentQuestion && (
                  <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                    <span style={{ fontFamily: F.heading, fontSize: "0.85rem", fontWeight: 800, color: C.success }}>
                      +{currentQuestion.reward} Pts
                    </span>
                    <span style={{ fontFamily: F.heading, fontSize: "0.85rem", fontWeight: 800, color: C.accent }}>
                      {currentQuestion.time}s Limit
                    </span>
                  </div>
                )}
              </div>

              {/* Scaled Question Image (Guaranteed No Scroll) */}
              <div style={questionImageWrapper}>
                <img
                  src={getQuestionImageUrl(activeImage)}
                  alt="Challenge Question"
                  onError={() => setImgError(true)}
                  style={questionImg}
                />
              </div>
            </div>
          ) : (phase === "main_task" || phase === "post_bid_idle") && !isWinner ? (
            /* Non-winning teams during main_task or post_bid_idle */
            <div style={waitingSolveCard}>
              <div style={waitingSolveIconBox}>
                <ClockIcon size={44} color={C.accent} />
              </div>
              <h2 style={waitingSolveTitle}>
                {winnerName} {phase === "post_bid_idle" ? "Won the Bid" : "is Solving"}
              </h2>
              <p style={waitingSolveText}>
                {phase === "post_bid_idle"
                  ? `${winnerName} won the auction. Stand by as they prepare to solve.`
                  : "The winning team has claimed this challenge and is working on the solution. Stand by for the next auction round!"}
              </p>
            </div>
          ) : phase === "fallback_idle" || phase === "fallback_active" ? (
            /* Fallback round display on team screen */
            <div style={waitingSolveCard}>
              <div style={waitingSolveIconBox}>
                <ClockIcon size={44} color={C.accent} />
              </div>
              <h2 style={{ ...waitingSolveTitle, color: C.accent }}>
                Fallback Round Active
              </h2>
              <p style={waitingSolveText}>
                The challenge is open for fallback solving. Watch the projector screen for live countdown and instructions!
              </p>
            </div>
          ) : (
            /* Default / Idle / Ended Placeholder (Never reveals question prematurely) */
            <div style={idlePlaceholderContainer}>
              <BrandHeader variant="centered" style={{ marginBottom: "16px" }} />
              <div style={taglinePill}>
                <span>THE ULTIMATE TECHNICAL AUCTION</span>
              </div>
              <p style={idlePlaceholderText}>
                {phase === "ended"
                  ? "Round has finished. Scores are updating. The next challenge will begin shortly."
                  : "Challenge will be revealed to all teams once bidding begins. Keep your coins ready!"}
              </p>
            </div>
          )}
        </main>
      </div>

      <FeedbackToast message={bidMessage} />
    </div>
  );
}

/* ─── Styles: Strict 100vh Non-Scrollable Layout ─── */
const dashRoot: React.CSSProperties = {
  height: "100vh",
  maxHeight: "100vh",
  width: "100vw",
  maxWidth: "100vw",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  backgroundColor: C.bg,
  color: C.text,
  fontFamily: F.body,
  userSelect: "none",
  boxSizing: "border-box",
};

const dashHeader: React.CSSProperties = {
  height: "80px",
  minHeight: "80px",
  maxHeight: "80px",
  width: "100%",
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 28px",
  backgroundColor: C.surface,
  borderBottom: `1px solid ${C.border}`,
  flexShrink: 0,
  zIndex: 10,
};

const headerTeamBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  padding: "6px 14px",
  borderRadius: tokens.radius.full,
  backgroundColor: `${C.primary}12`,
  border: `1px solid ${C.primary}30`,
};

const headerTeamLabel: React.CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 800,
  color: C.muted,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const headerTeamValue: React.CSSProperties = {
  fontFamily: F.heading,
  fontSize: "0.95rem",
  fontWeight: 800,
  color: C.primary,
  maxWidth: "180px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const dashSplit: React.CSSProperties = {
  flex: 1,
  display: "flex",
  width: "100%",
  height: "calc(100vh - 80px)",
  maxHeight: "calc(100vh - 80px)",
  overflow: "hidden",
  boxSizing: "border-box",
};

/* ─── Left Panel (30%) ─── */
const leftPanel: React.CSSProperties = {
  flex: "0 0 30%",
  width: "30%",
  maxWidth: "30%",
  height: "100%",
  maxHeight: "100%",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  padding: "20px 24px",
  boxSizing: "border-box",
  backgroundColor: C.surface,
  borderRight: `1px solid ${C.border}`,
  gap: "14px",
  justifyContent: "flex-start",
};

const teamNameSection: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "2px",
  flexShrink: 0,
};

const teamSubLabel: React.CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 700,
  color: C.muted,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const teamHeading: React.CSSProperties = {
  fontFamily: F.heading,
  fontSize: "clamp(1.35rem, 2vw, 1.8rem)",
  fontWeight: 900,
  color: C.primary,
  margin: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  letterSpacing: "0.02em",
  lineHeight: 1.15,
};

const statsRow: React.CSSProperties = {
  display: "flex",
  gap: "12px",
  width: "100%",
  flexShrink: 0,
};

const statCard = (flash: boolean, color: string): React.CSSProperties => ({
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 14px",
  backgroundColor: C.bg,
  border: `2px solid ${flash ? color : C.border}`,
  borderRadius: tokens.radius.lg,
  boxShadow: flash ? `0 0 16px ${color}44` : tokens.shadow.xs,
  transition: "all 0.25s ease",
  animation: flash ? "cardFlash 0.6s ease" : "none",
});

const statHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  marginBottom: "4px",
};

const statLabel: React.CSSProperties = {
  fontSize: "0.68rem",
  fontWeight: 800,
  color: C.muted,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const statValue: React.CSSProperties = {
  fontFamily: F.heading,
  fontWeight: 900,
  fontSize: "clamp(1.4rem, 2.2vw, 2rem)",
  fontVariantNumeric: "tabular-nums",
  lineHeight: 1,
};

/* ─── Current Bid Cards ─── */
const bidCardActive = (flash: boolean, isLeading: boolean): React.CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "14px 18px",
  backgroundColor: C.bg,
  borderRadius: tokens.radius.xl,
  border: `2px solid ${flash ? C.accent : isLeading ? C.success : C.primary}`,
  boxShadow: flash ? `0 0 24px ${C.accent}60` : `0 4px 16px ${C.primary}15`,
  animation: flash ? "bidPulse 0.4s ease" : "none",
  transition: "all 0.25s ease",
  flexShrink: 0,
});

const bidCardInactive: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "12px 18px",
  backgroundColor: `${C.bg}80`,
  borderRadius: tokens.radius.xl,
  border: `1.5px dashed ${C.border}`,
  opacity: 0.7,
  flexShrink: 0,
};

const bidCardLabel: React.CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 800,
  color: C.muted,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  marginBottom: "4px",
};

const bidCardNumber: React.CSSProperties = {
  fontFamily: F.heading,
  fontWeight: 900,
  fontSize: "clamp(2.2rem, 3.8vw, 3.2rem)",
  fontVariantNumeric: "tabular-nums",
  lineHeight: 1,
};

const bidCardFooter: React.CSSProperties = {
  marginTop: "4px",
  fontSize: "0.72rem",
  fontWeight: 700,
  letterSpacing: "0.03em",
};

/* ─── Auction Status Banner ─── */
const statusBanner = (color: string): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "9px 16px",
  borderRadius: tokens.radius.full,
  backgroundColor: `${color}12`,
  border: `1.5px solid ${color}40`,
  flexShrink: 0,
});

const statusDot: React.CSSProperties = {
  width: "10px",
  height: "10px",
  borderRadius: "50%",
  flexShrink: 0,
  animation: "dotPulse 1.6s ease-in-out infinite",
};

const statusText: React.CSSProperties = {
  fontFamily: F.heading,
  fontWeight: 800,
  fontSize: "0.82rem",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/* ─── Bid Controls ─── */
const bidControlsContainer: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  width: "100%",
  flexShrink: 0,
};

function bidButtonStyle(
  increment: number,
  disabled: boolean,
  isLeading: boolean
): React.CSSProperties {
  const isGold = increment === 50;
  const bgColor = isLeading
    ? `${C.success}20`
    : disabled
    ? `${C.border}60`
    : isGold
    ? C.accent
    : C.primary;
  const textColor = isLeading
    ? C.success
    : disabled
    ? C.muted
    : isGold
    ? "#0F172A"
    : "#FFFFFF";
  const borderColor = isLeading
    ? C.success
    : disabled
    ? C.border
    : isGold
    ? C.accent
    : C.primary;

  return {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "3px",
    padding: "12px 14px",
    borderRadius: tokens.radius.lg,
    border: `2px solid ${borderColor}`,
    backgroundColor: bgColor,
    color: textColor,
    fontFamily: F.heading,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled && !isLeading ? 0.45 : 1,
    boxShadow: disabled
      ? "none"
      : isGold
      ? `0 4px 16px ${C.accent}40`
      : `0 4px 16px ${C.primary}30`,
    transition: `all ${tokens.transition.fast}`,
    userSelect: "none",
  };
}

const shortcutHint: React.CSSProperties = {
  fontFamily: F.body,
  fontSize: "0.72rem",
  color: C.muted,
  textAlign: "center",
  marginTop: "2px",
};

/* ─── Inactive Placeholder Card ─── */
const inactivePlaceholderCard: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "14px 16px",
  backgroundColor: C.bg,
  borderRadius: tokens.radius.lg,
  border: `1px solid ${C.border}`,
  textAlign: "center",
  flexShrink: 0,
};

/* ─── Right Panel (70%) ─── */
const rightPanel: React.CSSProperties = {
  flex: "0 0 70%",
  width: "70%",
  maxWidth: "70%",
  height: "100%",
  maxHeight: "100%",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px",
  boxSizing: "border-box",
  backgroundColor: C.bg,
};

const questionCard: React.CSSProperties = {
  width: "100%",
  height: "100%",
  maxHeight: "100%",
  display: "flex",
  flexDirection: "column",
  backgroundColor: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: tokens.radius.xl,
  padding: "16px 20px",
  boxSizing: "border-box",
  boxShadow: tokens.shadow.lg,
  overflow: "hidden",
};

const questionHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "12px",
  flexShrink: 0,
};

const questionBadge: React.CSSProperties = {
  fontFamily: F.heading,
  fontSize: "0.78rem",
  fontWeight: 800,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: C.primary,
  backgroundColor: `${C.primary}12`,
  padding: "4px 10px",
  borderRadius: tokens.radius.sm,
  border: `1px solid ${C.primary}25`,
};

const questionImageWrapper: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  width: "100%",
  minHeight: 0,
  backgroundColor: "rgba(0,0,0,0.03)",
  borderRadius: tokens.radius.lg,
  padding: "8px",
  boxSizing: "border-box",
};

const questionImg: React.CSSProperties = {
  maxWidth: "100%",
  maxHeight: "100%",
  width: "auto",
  height: "auto",
  objectFit: "contain",
  borderRadius: tokens.radius.md,
  boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
};

const waitingSolveCard: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "40px",
  textAlign: "center",
  maxWidth: "520px",
};

const waitingSolveIconBox: React.CSSProperties = {
  width: "80px",
  height: "80px",
  borderRadius: "50%",
  backgroundColor: `${C.accent}15`,
  border: `2px solid ${C.accent}40`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: "20px",
};

const waitingSolveTitle: React.CSSProperties = {
  fontFamily: F.heading,
  fontSize: "1.6rem",
  fontWeight: 900,
  color: C.primary,
  marginBottom: "12px",
};

const waitingSolveText: React.CSSProperties = {
  fontFamily: F.body,
  fontSize: "1rem",
  color: C.muted,
  lineHeight: 1.6,
  margin: 0,
};

const idlePlaceholderContainer: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "40px",
  textAlign: "center",
  maxWidth: "520px",
};

const taglinePill: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 16px",
  borderRadius: tokens.radius.full,
  backgroundColor: `${C.primary}10`,
  border: `1px solid ${C.primary}25`,
  marginBottom: "16px",
  fontSize: "0.8rem",
  fontWeight: 800,
  color: C.primary,
  letterSpacing: "0.1em",
};

const idlePlaceholderText: React.CSSProperties = {
  fontFamily: F.body,
  fontSize: "1.05rem",
  color: C.muted,
  lineHeight: 1.65,
  margin: 0,
};

/* ─── Dashboard Keyframes ─── */
const dashboardStyles = `
  @keyframes toastSlide {
    from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  @keyframes cardFlash {
    0% { box-shadow: 0 0 0 0 rgba(212,175,55,0.6); }
    50% { box-shadow: 0 0 24px 6px rgba(212,175,55,0.3); }
    100% { box-shadow: 0 0 0 0 rgba(212,175,55,0); }
  }
  @keyframes bidPulse {
    0% { transform: scale(1); }
    40% { transform: scale(1.03); }
    100% { transform: scale(1); }
  }
  @keyframes dotPulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.3); opacity: 0.7; }
  }
  @keyframes urgentPulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.04); }
  }
  .bid-btn:active:not(:disabled) {
    transform: scale(0.96);
  }
`;

/* ─── Registration Styles ─── */
const regRoot: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  backgroundColor: C.primary,
  color: "#FFFFFF",
  fontFamily: F.body,
  userSelect: "none",
};

const regHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "10px",
  padding: "20px 0",
  borderBottom: "1px solid rgba(255,255,255,0.1)",
};

const regContent: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "clamp(32px, 5vw, 80px)",
  padding: "clamp(24px, 4vw, 64px)",
  flexWrap: "wrap",
};

const regLeft: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  maxWidth: "450px",
  textAlign: "center",
};

const regRight: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const regFormCard: React.CSSProperties = {
  backgroundColor: "#FFFFFF",
  borderRadius: "16px",
  padding: "clamp(24px, 3vw, 36px)",
  width: "100%",
  maxWidth: "400px",
  boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
};

const regInput: React.CSSProperties = {
  fontFamily: F.body,
  fontSize: "0.95rem",
  padding: "12px 16px",
  borderRadius: "8px",
  border: `2px solid ${C.border}`,
  backgroundColor: C.bg,
  color: C.text,
  outline: "none",
  width: "100%",
  transition: "border-color 0.2s ease",
  boxSizing: "border-box",
};

const regBtn: React.CSSProperties = {
  fontFamily: F.heading,
  fontWeight: 700,
  fontSize: "1rem",
  padding: "14px 24px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: C.accent,
  color: C.primary,
  cursor: "pointer",
  width: "100%",
  marginTop: "8px",
  transition: "all 0.2s ease",
};
