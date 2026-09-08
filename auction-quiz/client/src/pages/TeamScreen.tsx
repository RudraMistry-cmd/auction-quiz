import { useEffect, useRef, useState, useCallback } from "react";
import { useGamePhase, formatClock } from "../hooks/useGamePhase";
import { BrandHeader } from "../components/BrandHeader";
import { tokens } from "../design-system";
import TaskTimer from "../components/TaskTimer";
import type { Team, Auction, Bid, TaskResultEvent } from "../shared/types";

const C = tokens.color;
const F = tokens.font;

interface TeamScreenProps {
  sessionToken: string | null;
  onLogout: () => void;
}

/* ─── Sub-components ─── */

function TimerPill({ timeLeft, isUrgent }: { timeLeft: number; isUrgent: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "10px",
      backgroundColor: isUrgent ? C.dangerBg : C.surface,
      border: `2px solid ${isUrgent ? C.danger : C.border}`,
      borderRadius: tokens.radius.lg,
      padding: "12px 28px",
      transition: `all ${tokens.transition.base}`,
    }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke={isUrgent ? C.danger : C.primary} strokeWidth="2.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      <span style={{
        fontFamily: F.heading, fontWeight: 800, fontSize: "clamp(2.5rem, 8vw, 4rem)",
        color: isUrgent ? C.danger : C.primary,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1,
      }}>
        {formatClock(timeLeft)}
      </span>
    </div>
  );
}

function StatCard({ label, value, color, flash }: { label: string; value: number; color: string; flash: boolean }) {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
      backgroundColor: C.surface, border: `1px solid ${C.border}`,
      borderRadius: tokens.radius.lg, padding: "16px 12px",
      transition: `all ${tokens.transition.base}`,
      boxShadow: flash ? `0 0 20px ${color}33` : "none",
    }}>
      <span style={{
        fontFamily: F.body, fontWeight: 600, fontSize: "0.7rem",
        color: C.muted, letterSpacing: "0.15em", textTransform: "uppercase",
        marginBottom: "6px",
      }}>{label}</span>
      <span style={{
        fontFamily: F.heading, fontWeight: 800,
        fontSize: "clamp(1.8rem, 5vw, 2.8rem)",
        color, fontVariantNumeric: "tabular-nums", lineHeight: 1,
        transition: `color ${tokens.transition.base}`,
      }}>{value}</span>
    </div>
  );
}

function BidButton({ onClick, disabled, coins, bidAmount, leading, isTeam, increment }: { onClick: () => void; disabled: boolean; coins: number; bidAmount: number; leading: string; isTeam: string; increment: number }) {
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
        flex: 1, padding: "24px 32px",
        borderRadius: tokens.radius.lg,
        border: isGold && !isLeading && !cantAfford ? `2px solid ${C.primary}` : "none",
        backgroundColor: bgColor,
        color: textColor,
        fontFamily: F.heading, fontWeight: 900,
        fontSize: "clamp(1.4rem, 4vw, 1.8rem)",
        letterSpacing: "0.05em",
        cursor: disabled || isLeading || cantAfford ? "not-allowed" : "pointer",
        opacity: disabled || isLeading || cantAfford ? 0.5 : 1,
        boxShadow: disabled || isLeading || cantAfford ? "none" : isGold ? `0 4px 24px ${C.accent}66` : `0 4px 24px ${C.primary}44`,
        transition: `all ${tokens.transition.fast}`,
        userSelect: "none",
        transform: disabled || isLeading || cantAfford ? "none" : "scale(1)",
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
export default function TeamScreen({ sessionToken, onLogout }: TeamScreenProps) {
  const { socket, connected, phase, task, taskTimer, taskEnded, taskPaused } = useGamePhase();
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

  // Registration form
  const [form, setForm] = useState({ teamName: "", player1: "", player2: "", phone: "", email: "" });

  const flash = (setter: (v: boolean) => void) => {
    setter(true);
    setTimeout(() => setter(false), 1500);
  };

  // Auto-reconnect
  useEffect(() => {
    if (!connected || !socket) return;
    if (sessionToken) {
      socket.emit("client:reconnect", { sessionToken }, (res: any) => {
        if (res.success && res.team) {
          setTeam(res.team);
          setCoins(res.team.bid_coins);
          setPoints(res.team.reward_points);
          if (res.currentAuction) {
            setAuction(res.currentAuction);
            setCurrentBid(res.currentBid || res.currentAuction.startBid);
            setTimer(res.timer || 0);
          }
        } else {
          onLogout();
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
    const handleBidUpdate = (data: { auctionId: string; bid: Bid; teamName: string; increment: number }) => {
      setCurrentBid(data.bid.amount); setLeadingTeam(data.teamName);
      if (data.bid.teamId === teamRef.current?.teamId) {
        setBidMessage({ type: "success", text: `Bid ${data.bid.amount} (+${data.increment})` });
      } else {
        setBidMessage({ type: "error", text: `${data.teamName} → ${data.bid.amount}` });
      }
      setTimeout(() => setBidMessage(null), 3000);
    };
    const handleTimer = (data: { auctionId: string; remaining: number }) => { setTimer(data.remaining); };
    const handleEnded = (data: { auctionId: string; winner: Team | null; winningBid: number | null }) => {
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

    return () => {
      socket.off("auction:started", handleStarted);
      socket.off("auction:bid_update", handleBidUpdate);
      socket.off("auction:timer", handleTimer);
      socket.off("auction:ended", handleEnded);
      socket.off("auction:cleared", handleCleared);
      socket.off("task:result", handleTaskResult);
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
    socket.emit("client:register", form, (res: any) => {
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
        <style>{`
          @keyframes regFadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        {/* Header */}
        <header style={regHeader}>
          <img src="/assets/logo.png" alt="Bid for C" style={{ height: "32px", objectFit: "contain" }} />
          <span style={{ fontFamily: F.heading, fontWeight: 700, fontSize: "1rem", color: "#FFFFFF", letterSpacing: "0.05em" }}>Bid for C</span>
        </header>

        {/* Main Content */}
        <div style={regContent}>
          {/* Left Side - Branding */}
          <div style={regLeft}>
            <img src="/assets/logo.png" alt="Bid for C" style={{ height: "120px", objectFit: "contain", marginBottom: "24px", filter: "drop-shadow(0 0 20px rgba(212,175,55,0.3))" }} />
            <div style={{ fontFamily: F.heading, fontWeight: 800, fontSize: "clamp(2rem, 4vw, 3rem)", color: "#FFFFFF", marginBottom: "16px", letterSpacing: "0.05em" }}>
              BID FOR C
            </div>
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
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#D4AF37", flexShrink: 0 }} />
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
                  { key: "phone", label: "Contact Number", placeholder: "Phone number" },
                ] as Array<{ key: "teamName" | "player1" | "player2" | "email" | "phone"; label: string; placeholder: string; type?: string }>).map((field) => (
                  <div key={field.key}>
                    <label style={{ fontFamily: F.body, fontWeight: 600, fontSize: "0.75rem", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "6px", display: "block" }}>
                      {field.label}
                    </label>
                    <input
                      style={regInput}
                      type={field.type || "text"}
                      placeholder={field.placeholder}
                      value={form[field.key]}
                      onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                      required
                    />
                  </div>
                ))}
                <button type="submit" style={regBtn}>
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
              <div style={{ fontFamily: F.heading, fontWeight: 700, fontSize: "1rem", color: "#D4AF37", marginBottom: "12px", letterSpacing: "0.05em" }}>About</div>
              <p style={{ fontFamily: F.body, fontSize: "0.85rem", color: "#94A3B8", lineHeight: 1.6 }}>
                Bid for C is a competitive coding auction event where teams bid coins to solve challenges.
              </p>
            </div>

            {/* How it works */}
            <div style={regFooterSection}>
              <div style={{ fontFamily: F.heading, fontWeight: 700, fontSize: "1rem", color: "#D4AF37", marginBottom: "12px", letterSpacing: "0.05em" }}>How it works</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {["Bid to win a problem", "Solve within given time", "Admin verifies result", "Earn reward points"].map((step, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontFamily: F.heading, fontWeight: 700, fontSize: "0.75rem", color: "#D4AF37" }}>{i + 1}.</span>
                    <span style={{ fontFamily: F.body, fontSize: "0.85rem", color: "#94A3B8" }}>{step}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Winning Criteria */}
            <div style={regFooterSection}>
              <div style={{ fontFamily: F.heading, fontWeight: 700, fontSize: "1rem", color: "#D4AF37", marginBottom: "12px", letterSpacing: "0.05em" }}>Winning Criteria</div>
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

  /* ── Task Phase ── */
  if (phase === "task" && task) {
    const isWinner = task.teamId === team.teamId;
    return (
      <div style={root}>
        <FeedbackToast message={bidMessage} />
        <div style={topBar}>
          <span style={{ fontFamily: F.heading, fontWeight: 700, fontSize: "1.1rem", color: C.primary }}>{team.teamName}</span>
          <div style={{ display: "flex", gap: "12px" }}>
            <StatCard label="COINS" value={coins} color={C.accent} flash={coinFlash} />
            <StatCard label="POINTS" value={points} color={C.success} flash={pointsFlash} />
          </div>
        </div>

        <div style={stage}>
          {isWinner ? (
            <>
              <div style={{ fontFamily: F.heading, fontWeight: 800, fontSize: "clamp(2rem, 6vw, 3.5rem)", color: C.accent, marginBottom: "8px" }}>
                YOUR TASK
              </div>
              <div style={{ fontFamily: F.body, fontSize: "1rem", color: C.muted, marginBottom: "16px" }}>
                Solve the task on the main display
              </div>
              <TaskTimer task={task} timeLimit={task.time_limit} endAt={task.endAt} timeLeft={taskTimer} ended={taskEnded} paused={taskPaused} size="medium" />
            </>
          ) : (
            <>
              <div style={{ fontFamily: F.heading, fontWeight: 700, fontSize: "clamp(1.2rem, 4vw, 2rem)", color: C.muted, marginBottom: "8px" }}>
                <span style={{ color: C.primary }}>{task.teamName}</span> is solving
              </div>
              <TaskTimer task={task} timeLimit={task.time_limit} endAt={task.endAt} timeLeft={taskTimer} ended={taskEnded} paused={taskPaused} size="medium" />
              <div style={{ fontFamily: F.body, fontSize: "0.9rem", color: C.muted, marginTop: "8px" }}>
                Task in progress on main display
              </div>
            </>
          )}
          <div style={{ fontFamily: F.body, fontSize: "0.85rem", color: C.muted, marginTop: "16px" }}>Final bid: {task.finalBid}</div>
        </div>
      </div>
    );
  }

  /* ── Waiting State ── */
  if (!auction) {
    return (
      <div style={root}>
        <FeedbackToast message={bidMessage} />
        <div style={topBar}>
          <span style={{ fontFamily: F.heading, fontWeight: 700, fontSize: "1.1rem", color: C.primary }}>{team.teamName}</span>
          <button onClick={onLogout} style={btnGhost}>Logout</button>
        </div>
        <div style={stage}>
          <div style={{ display: "flex", gap: "16px", marginBottom: "32px" }}>
            <StatCard label="COINS" value={coins} color={C.accent} flash={coinFlash} />
            <StatCard label="POINTS" value={points} color={C.success} flash={pointsFlash} />
          </div>
          <div style={{
            fontFamily: F.heading, fontWeight: 700,
            fontSize: "clamp(1.2rem, 3vw, 1.8rem)",
            color: C.text, marginBottom: "8px",
          }}>{auctionCleared ? "Next auction starting soon" : "Waiting to start..."}</div>
          <div style={{ fontFamily: F.body, fontSize: "0.9rem", color: C.muted }}>
            {connected ? "Connected" : "Reconnecting..."}
          </div>
        </div>
      </div>
    );
  }

  /* ── Active Auction ── */
  return (
    <div style={root}>
      <style>{`
        @keyframes toastSlide {
          from { opacity: 0; transform: translateX(-50%) translateY(-12px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes bidPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.03); }
        }
      `}</style>

      <FeedbackToast message={bidMessage} />

      {/* Top bar: team name + logout */}
      <div style={topBar}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <BrandHeader variant="team" />
          <span style={{ fontFamily: F.heading, fontWeight: 700, fontSize: "1.1rem", color: C.primary }}>{team.teamName}</span>
        </div>
        <button onClick={onLogout} style={btnGhost}>Logout</button>
      </div>

      {/* Timer */}
      <div style={{ marginBottom: "24px" }}>
        <TimerPill timeLeft={timer} isUrgent={timer <= 10} />
      </div>

      {/* Current Bid - center hero */}
      <div style={{
        backgroundColor: C.surface, border: `2px solid ${C.border}`,
        borderRadius: tokens.radius.xl, padding: "20px 40px",
        marginBottom: "8px", width: "100%", maxWidth: "400px",
        boxShadow: tokens.shadow.md,
        textAlign: "center",
      }}>
        <div style={{
          fontFamily: F.body, fontWeight: 600, fontSize: "0.7rem",
          color: C.muted, letterSpacing: "0.2em", textTransform: "uppercase",
          marginBottom: "4px",
        }}>CURRENT BID</div>
        <div style={{
          fontFamily: F.heading, fontWeight: 800,
          fontSize: "clamp(3rem, 12vw, 5rem)",
          color: C.primary, fontVariantNumeric: "tabular-nums", lineHeight: 1,
        }}>{currentBid}</div>
      </div>

      {/* Next Bids */}
      <div style={{
        display: "flex", gap: "16px", justifyContent: "center",
        marginBottom: "20px",
      }}>
        <div style={{
          fontFamily: F.body, fontWeight: 600, fontSize: "0.9rem",
          color: C.primary,
        }}>
          Next: <span style={{ fontFamily: F.heading, fontWeight: 800, color: C.accent }}>{currentBid + 20}</span>
          <span style={{ color: C.muted, fontSize: "0.75rem" }}> (+20)</span>
        </div>
        <div style={{
          fontFamily: F.body, fontWeight: 600, fontSize: "0.9rem",
          color: C.primary,
        }}>
          Next: <span style={{ fontFamily: F.heading, fontWeight: 800, color: C.accent }}>{currentBid + 50}</span>
          <span style={{ color: C.muted, fontSize: "0.75rem" }}> (+50)</span>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: "flex", gap: "12px", width: "100%", maxWidth: "400px", marginBottom: "24px" }}>
        <StatCard label="COINS" value={coins} color={C.accent} flash={coinFlash} />
        <StatCard label="POINTS" value={points} color={C.success} flash={pointsFlash} />
      </div>

      {/* Leading team */}
      {leadingTeam && (
        <div style={{
          fontFamily: F.body, fontWeight: 600, fontSize: "0.9rem",
          color: C.muted, marginBottom: "12px",
        }}>
          Leading: <span style={{ color: C.primary, fontWeight: 700 }}>{leadingTeam}</span>
        </div>
      )}

      {/* Bid buttons */}
      {isActive && (
        <div style={{ width: "100%", maxWidth: "420px" }}>
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
        </div>
      )}

      {/* Ended */}
      {!isActive && auction.status === "completed" && (
        <div style={{
          fontFamily: F.heading, fontWeight: 700, fontSize: "1.2rem",
          color: C.muted, marginTop: "16px",
        }}>Auction Ended</div>
      )}
    </div>
  );
}

/* ─── Layout ─── */
const root: React.CSSProperties = {
  minHeight: "100vh", display: "flex", flexDirection: "column",
  alignItems: "center", backgroundColor: C.bg, color: C.text,
  fontFamily: F.body, userSelect: "none",
  padding: "clamp(16px, 3vw, 32px)",
};

const topBar: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  width: "100%", maxWidth: "500px", marginBottom: "24px",
};

const stage: React.CSSProperties = {
  flex: 1, display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", gap: "16px", width: "100%",
};

const btnGhost: React.CSSProperties = {
  fontFamily: F.body, fontWeight: 600, fontSize: "0.8rem",
  padding: "8px 16px", borderRadius: tokens.radius.sm,
  border: `1px solid ${C.border}`, backgroundColor: "transparent",
  color: C.muted, cursor: "pointer",
  transition: `all ${tokens.transition.fast}`,
};

/* ─── Registration Page ─── */
const regRoot: React.CSSProperties = {
  minHeight: "100vh", display: "flex", flexDirection: "column",
  backgroundColor: "#0B3C5D", color: "#FFFFFF",
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
  border: "2px solid #E2E8F0", backgroundColor: "#F8FAFC",
  color: "#0F172A", outline: "none", width: "100%",
  transition: "border-color 0.2s ease",
  boxSizing: "border-box" as const,
};

const regBtn: React.CSSProperties = {
  fontFamily: F.heading, fontWeight: 700, fontSize: "1rem",
  padding: "14px 24px", borderRadius: "8px",
  border: "none", backgroundColor: "#D4AF37", color: "#0B3C5D",
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
