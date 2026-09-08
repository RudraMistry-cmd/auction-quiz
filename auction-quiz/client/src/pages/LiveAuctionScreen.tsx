import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getServerBase } from "../hooks/useSocket";
import { useGamePhase, formatClock } from "../hooks/useGamePhase";
import { BrandHeader } from "../components/BrandHeader";
import { tokens } from "../design-system";
import { soundManager } from "../utils/soundManager";
import {
  timerPulse,
  DURATION,
  EASE,
} from "../utils/motion";
import type { Auction, TimestampTimer } from "../shared/types";

const C = tokens.color;
const F = tokens.font;

type DisplayState = "idle" | "auction" | "ended" | "task" | "result";

/* ─── Timer (Top Center) ─── */
function TimerDisplay({ timeLeft, size = "large" }: { timeLeft: number; size?: "large" | "medium" }) {
  const urgent = timeLeft <= 10;
  const mid = timeLeft <= 20;
  const isLarge = size === "large";

  return (
    <motion.div
      animate={urgent ? "urgent" : "normal"}
      variants={timerPulse}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: "16px",
        padding: isLarge ? "20px 48px" : "12px 32px",
        backgroundColor: urgent ? `${C.danger}15` : mid ? `${C.accent}10` : `${C.primary}08`,
        border: `3px solid ${urgent ? C.danger : mid ? C.accent : C.primary}`,
        borderRadius: tokens.radius.xl,
        boxShadow: urgent ? `0 0 40px ${C.danger}33` : mid ? `0 0 24px ${C.accent}22` : "none",
        transition: "background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease",
      }}
    >
      <svg width={isLarge ? 32 : 24} height={isLarge ? 32 : 24} viewBox="0 0 24 24" fill="none"
        stroke={urgent ? C.danger : C.primary} strokeWidth="2.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      <span style={{
        fontFamily: F.heading, fontWeight: 900,
        fontSize: isLarge ? "clamp(3rem, 8vw, 5rem)" : "clamp(2rem, 5vw, 3rem)",
        color: urgent ? C.danger : mid ? C.accent : C.primary,
        fontVariantNumeric: "tabular-nums",
        minWidth: "8ch", textAlign: "center",
        letterSpacing: "0.05em",
      }}>
        {formatClock(timeLeft)}
      </span>
      {urgent && (
        <motion.span
          animate={{ opacity: [1, 0.6, 1] }}
          transition={{ duration: 1, repeat: Infinity, ease: EASE.out }}
          style={{
            fontSize: isLarge ? "1rem" : "0.8rem", fontWeight: 800, color: "#fff",
            backgroundColor: C.danger,
            borderRadius: tokens.radius.sm, padding: "6px 16px",
            letterSpacing: "0.1em",
          }}
        >HURRY</motion.span>
      )}
    </motion.div>
  );
}

/* ─── Side Timer Card (Top Right Dual Timer Panel) ─── */
function SideTimerCard({ timer }: { timer: TimestampTimer }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: EASE.out }}
      style={{
        position: "fixed",
        top: "24px",
        right: "24px",
        backgroundColor: "#1E293B",
        border: `2px solid ${C.accent}`,
        borderRadius: tokens.radius.lg,
        padding: "12px 24px",
        boxShadow: "0 8px 30px rgba(0,0,0,0.3)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        zIndex: 100,
      }}
    >
      <span style={{
        fontSize: "0.75rem",
        fontWeight: 800,
        color: C.accent,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginBottom: "4px",
      }}>
        {timer.label || "Open Challenge"}
      </span>
      <span style={{
        fontFamily: F.heading,
        fontWeight: 900,
        fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)",
        color: "#fff",
        fontVariantNumeric: "tabular-nums",
      }}>
        {formatClock(timer.remaining)}
      </span>
      <span style={{
        fontSize: "0.65rem",
        fontWeight: 700,
        color: timer.isRunning ? C.success : C.accent,
        textTransform: "uppercase",
        marginTop: "2px",
      }}>
        {timer.isRunning ? "RUNNING" : "PAUSED"}
      </span>
    </motion.div>
  );
}

/* ─── Big Bid Display ─── */
function BidHero({ amount, animate, increment }: { amount: number; animate: boolean; increment: number }) {
  const isGold = increment === 50;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: DURATION.base, ease: EASE.out }}
      style={{ textAlign: "center" }}
    >
      <div style={{
        fontFamily: F.body, fontWeight: 600, fontSize: "clamp(0.9rem, 1.5vw, 1.2rem)",
        color: "#94A3B8", letterSpacing: "0.3em", textTransform: "uppercase",
        marginBottom: "8px",
      }}>CURRENT BID</div>
      <motion.div
        key={amount}
        animate={animate ? { scale: [1, 1.06, 1] } : { scale: 1 }}
        transition={{ duration: DURATION.base, ease: EASE.out }}
        style={{
          fontFamily: F.heading, fontWeight: 900,
          fontSize: "clamp(6rem, 18vw, 14rem)",
          lineHeight: 0.9, color: C.accent,
          fontVariantNumeric: "tabular-nums",
          textShadow: animate && isGold ? `0 0 60px ${C.accent}66` : "none",
        }}
      >
        {amount}
      </motion.div>
      <AnimatePresence>
        {animate && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.fast, ease: EASE.out }}
            style={{
              fontFamily: F.heading, fontWeight: 800, fontSize: "clamp(1.5rem, 3vw, 2.5rem)",
              color: isGold ? C.accent : "#94A3B8",
              marginTop: "12px",
            }}
          >+{increment}</motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Leading Team Badge ─── */
function LeadingBadge({ teamName }: { teamName: string }) {
  return (
    <motion.div
      key={teamName}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: DURATION.base, ease: EASE.out }}
      style={{
        fontFamily: F.heading, fontWeight: 700,
        fontSize: "clamp(1.2rem, 2.5vw, 1.8rem)",
        color: C.primary, backgroundColor: `${C.primary}10`,
        border: `2px solid ${C.primary}`, borderRadius: tokens.radius.full,
        padding: "10px 36px", textAlign: "center",
      }}
    >
      {teamName} is leading
    </motion.div>
  );
}

/* ─── Winner Display ─── */
function WinnerDisplay({ teamName, bid }: { teamName: string; bid: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: EASE.out }}
      style={{ textAlign: "center" }}
    >
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: DURATION.base, ease: EASE.out }}
        style={{
          fontFamily: F.body, fontWeight: 700, fontSize: "clamp(1rem, 2vw, 1.4rem)",
          color: C.accent, letterSpacing: "0.3em", textTransform: "uppercase",
          marginBottom: "16px",
        }}
      >WINNER</motion.div>
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{
          opacity: 1,
          scale: 1,
          boxShadow: [
            "0 0 0 0 rgba(34,197,94,0)",
            "0 0 60px 20px rgba(34,197,94,0.4)",
            "0 0 30px 10px rgba(34,197,94,0.2)",
          ],
        }}
        transition={{ delay: 0.4, duration: 0.8, ease: EASE.out }}
        style={{
          fontFamily: F.heading, fontWeight: 900,
          fontSize: "clamp(4rem, 12vw, 8rem)",
          color: C.success, lineHeight: 1,
          borderRadius: tokens.radius.xl,
          padding: "16px 32px",
        }}
      >{teamName}</motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: DURATION.base, ease: EASE.out }}
        style={{
          fontFamily: F.body, fontWeight: 600,
          fontSize: "clamp(1.2rem, 2.5vw, 1.8rem)",
          color: "#94A3B8", marginTop: "16px",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        Winning Bid: <span style={{ color: C.accent, fontWeight: 700 }}>{bid}</span>
      </motion.div>
    </motion.div>
  );
}

/* ─── Task Display ─── */
function TaskDisplay({ timeLeft, ended, paused }: { timeLeft: number; ended: boolean; paused: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: DURATION.base, ease: EASE.out }}
      style={{ textAlign: "center" }}
    >
      <div style={{
        fontFamily: F.body, fontWeight: 600, fontSize: "clamp(0.9rem, 1.5vw, 1.2rem)",
        color: "#94A3B8", letterSpacing: "0.3em", textTransform: "uppercase",
        marginBottom: "16px",
      }}>TASK IN PROGRESS</div>
      <TimerDisplay timeLeft={timeLeft} size="large" />
      <div style={{
        fontFamily: F.heading, fontWeight: 700,
        fontSize: "clamp(1rem, 2vw, 1.4rem)",
        color: "#94A3B8", marginTop: "24px",
      }}>
        {ended ? "Time's up!" : paused ? "Timer paused" : "Solve the challenge"}
      </div>
    </motion.div>
  );
}

/* ─── Question Image ─── */
function QuestionImage({ imagePath }: { imagePath: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: DURATION.base, ease: EASE.out }}
      style={{
        backgroundColor: "#fff",
        border: `1px solid ${C.border}`,
        borderRadius: tokens.radius.xl,
        padding: "24px",
        maxWidth: "70%",
        maxHeight: "50vh",
        boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <img
        src={`${getServerBase()}/questions/${imagePath}`}
        alt="Question"
        style={{
          maxWidth: "100%",
          maxHeight: "45vh",
          objectFit: "contain",
          borderRadius: tokens.radius.md,
        }}
      />
    </motion.div>
  );
}

/* ─── Main Component ─── */
export default function LiveAuctionScreen() {
  const {
    socket,
    connected,
    phase,
    currentQuestion,
    currentBid: gameBid,
    winningTeam,
    biddingTimer,
    mainTaskTimer,
    sideTaskTimer,
    explicitTimer,
    task,
    taskTimer,
    taskEnded,
    taskPaused,
    lastResult,
  } = useGamePhase();

  const [auction, setAuction] = useState<(Auction & { currentBid?: number; leadingTeam?: string }) | null>(null);
  const [currentBid, setCurrentBid] = useState(0);
  const [leadingTeam, setLeadingTeam] = useState("");
  const [timer, setTimer] = useState(0);
  const [winner, setWinner] = useState<{ teamName: string; bid: number } | null>(null);
  const [bidFlash, setBidFlash] = useState(false);
  const [lastIncrement, setLastIncrement] = useState(20);
  const [questionImage, setQuestionImage] = useState<string | null>(null);
  const [manualTimer, setManualTimer] = useState({ isRunning: false, timeLeft: 0 });
  const prevBid = useRef(0);

  // Sync gameBid & winningTeam from phase
  useEffect(() => {
    if (gameBid) setCurrentBid(gameBid);
  }, [gameBid]);

  useEffect(() => {
    if (winningTeam) {
      setWinner({ teamName: winningTeam.teamName, bid: gameBid || currentBid });
    }
  }, [winningTeam, gameBid, currentBid]);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;

    const handleStarted = (data: any) => {
      setAuction(data);
      setCurrentBid(data.currentBid || 0);
      setLeadingTeam(data.leadingTeam || "");
      setWinner(null);
    };

    const handleBidUpdate = (data: { auctionId: string; bid: any; teamName: string; increment?: number }) => {
      setCurrentBid(data.bid.amount);
      setLeadingTeam(data.teamName);
      if (data.increment) setLastIncrement(data.increment);
    };

    const handleTimer = (data: { auctionId: string; remaining: number }) => {
      setTimer(data.remaining);
    };

    const handleEnded = (data: { auctionId?: string; winner: any; winningBid: number | null }) => {
      setAuction((prev) => (prev ? { ...prev, status: "completed" } : null));
      if (data.winner && data.winningBid != null) {
        setWinner({ teamName: data.winner.teamName, bid: data.winningBid });
      } else {
        setWinner(null);
      }
    };

    const handleCleared = () => {
      setAuction(null);
      setCurrentBid(0);
      setLeadingTeam("");
      setWinner(null);
    };

    const handleManualTimer = (data: any) => {
      setManualTimer({
        isRunning: data.isRunning ?? false,
        timeLeft: data.isRunning ? (data.timeLeft ?? 0) : 0,
      });
    };

    const handleImageSet = (data: { imagePath: string }) => {
      setQuestionImage(data.imagePath);
    };

    const handleSoundSettings = (data: { enabled: boolean; volume: number }) => {
      soundManager.applySettings(data);
    };

    const handleSoundPerSetting = (data: { soundName: string; enabled: boolean }) => {
      soundManager.setPerSoundEnabled(data.soundName, data.enabled);
    };

    const handleThemeChanged = (data: { theme: string }) => {
      document.documentElement.setAttribute("data-theme", data.theme);
      localStorage.setItem("theme", data.theme);
    };

    socket.on("auction:started", handleStarted);
    socket.on("auction:bid_update", handleBidUpdate);
    socket.on("auction:timer", handleTimer);
    socket.on("auction:ended", handleEnded);
    socket.on("auction:cleared", handleCleared);
    socket.on("manual_timer:update", handleManualTimer);
    socket.on("question:image_set", handleImageSet);
    socket.on("sound:settings", handleSoundSettings);
    socket.on("sound:per_setting", handleSoundPerSetting);
    socket.on("theme:changed", handleThemeChanged);

    return () => {
      socket.off("auction:started", handleStarted);
      socket.off("auction:bid_update", handleBidUpdate);
      socket.off("auction:timer", handleTimer);
      socket.off("auction:ended", handleEnded);
      socket.off("auction:cleared", handleCleared);
      socket.off("manual_timer:update", handleManualTimer);
      socket.off("question:image_set", handleImageSet);
      socket.off("sound:settings", handleSoundSettings);
      socket.off("sound:per_setting", handleSoundPerSetting);
      socket.off("theme:changed", handleThemeChanged);
    };
  }, [socket, connected]);

  // Unlock audio on user interaction
  useEffect(() => {
    const unlockAudio = () => {
      soundManager.unlock();
      document.removeEventListener("click", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
      document.removeEventListener("touchstart", unlockAudio);
    };
    document.addEventListener("click", unlockAudio);
    document.addEventListener("keydown", unlockAudio);
    document.addEventListener("touchstart", unlockAudio);
    return () => {
      document.removeEventListener("click", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
      document.removeEventListener("touchstart", unlockAudio);
    };
  }, []);

  // Flash on new bid
  useEffect(() => {
    if (currentBid !== prevBid.current && prevBid.current !== 0) {
      setBidFlash(true);
      const t = setTimeout(() => setBidFlash(false), 600);
      prevBid.current = currentBid;
      return () => clearTimeout(t);
    }
    prevBid.current = currentBid;
  }, [currentBid]);

  // Determine display state based on 4-phase model: idle | bidding | main_task | ended
  const isBidding = phase === "bidding" || (auction?.status === "active" && timer > 0);
  const isMainTask = phase === "main_task" || ((phase as any) === "task" && !taskEnded);
  const isEnded = phase === "ended";

  let displayState: DisplayState = "idle";
  if (lastResult || task?.result) {
    displayState = "result";
  } else if (isMainTask) {
    displayState = "task";
  } else if (isBidding) {
    displayState = "auction";
  } else if (isEnded) {
    displayState = "ended";
  } else if (winner) {
    displayState = "ended";
  }

  // Active image path
  const activeImage = currentQuestion?.image || questionImage;

  // Active central timer value
  let centralTimeLeft = 0;
  let showCentralTimer = false;

  if (isBidding) {
    centralTimeLeft = biddingTimer ? biddingTimer.remaining : timer;
    showCentralTimer = true;
  } else if (isMainTask) {
    centralTimeLeft = mainTaskTimer ? mainTaskTimer.remaining : taskTimer;
    showCentralTimer = true;
  } else if (manualTimer.isRunning) {
    centralTimeLeft = manualTimer.timeLeft;
    showCentralTimer = true;
  }

  const activeSecondaryTimer = explicitTimer || sideTaskTimer;

  return (
    <div style={root}>
      <style>{`
        @keyframes fadeScale {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes bidPop {
          0% { transform: scale(1); }
          50% { transform: scale(1.08); }
          100% { transform: scale(1); }
        }
        @keyframes bidPopGold {
          0% { transform: scale(1); }
          40% { transform: scale(1.12); }
          100% { transform: scale(1); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>

      {/* Secondary Timer Card: "Open Challenge" (optional explicit timer, runs independently) */}
      {activeSecondaryTimer && activeSecondaryTimer.remaining > 0 && (
        <SideTimerCard timer={activeSecondaryTimer} />
      )}

      {/* Brand Header */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
        <BrandHeader variant="live" />
      </div>

      {/* Timer - Top Center (visible during bidding, task, or side_task) */}
      {showCentralTimer && displayState !== "result" && displayState !== "ended" && (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
          <TimerDisplay timeLeft={centralTimeLeft} size="large" />
        </div>
      )}

      {/* Main Content Area */}
      <div style={contentArea}>
        {/* IDLE STATE */}
        {displayState === "idle" && (
          <div style={stage}>
            {activeImage ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
                <QuestionImage imagePath={activeImage} />
                {currentQuestion && (
                  <div style={{
                    display: "flex", gap: "24px",
                    fontFamily: F.heading, fontWeight: 700, fontSize: "1.2rem",
                    color: C.accent,
                  }}>
                    <span>Reward: {currentQuestion.reward} pts</span>
                    <span>Time Limit: {currentQuestion.time}s</span>
                  </div>
                )}
                <div style={{
                  fontFamily: F.body, fontSize: "1.1rem", color: "#94A3B8",
                }}>
                  Question selected · Ready to start auction
                </div>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, ease: EASE.out }}
                style={{ textAlign: "center" }}
              >
                <div style={{
                  fontFamily: F.heading, fontWeight: 900,
                  fontSize: "clamp(3rem, 8vw, 6rem)",
                  color: C.primary, marginBottom: "16px",
                  letterSpacing: "0.05em",
                }}>Waiting for Auction</div>
                <div style={{
                  fontFamily: F.body, fontSize: "clamp(1rem, 2vw, 1.4rem)",
                  color: "#94A3B8",
                }}>{connected ? "Standby" : "Offline"}</div>
              </motion.div>
            )}
          </div>
        )}

        {/* AUCTION / BIDDING STATE */}
        {displayState === "auction" && (
          <div style={stage}>
            <BidHero amount={currentBid} animate={bidFlash} increment={lastIncrement} />
            {leadingTeam && <LeadingBadge teamName={leadingTeam} />}
            {activeImage && <QuestionImage imagePath={activeImage} />}
          </div>
        )}

        {/* MAIN TASK RUNNING STATE */}
        {displayState === "task" && (
          <div style={stage}>
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ textAlign: "center", marginBottom: "8px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}
            >
              <span style={{
                fontFamily: F.heading, fontWeight: 800, fontSize: "clamp(1.2rem, 2.5vw, 1.8rem)",
                color: C.accent, backgroundColor: `${C.accent}15`, border: `2px solid ${C.accent}`,
                borderRadius: tokens.radius.full, padding: "8px 28px", display: "inline-block",
              }}>
                Solving: {winningTeam?.teamName || task?.teamName || "Winning Team"}
              </span>
              {currentQuestion && (
                <span style={{
                  fontFamily: F.heading, fontWeight: 700, fontSize: "clamp(1rem, 2vw, 1.4rem)",
                  color: C.success, backgroundColor: `${C.success}15`, border: `1px solid ${C.success}40`,
                  borderRadius: tokens.radius.full, padding: "4px 20px", display: "inline-block",
                }}>
                  Reward: +{currentQuestion.reward} Points
                </span>
              )}
            </motion.div>
            <TaskDisplay timeLeft={centralTimeLeft} ended={taskEnded} paused={taskPaused} />
            {activeImage && <QuestionImage imagePath={activeImage} />}
          </div>
        )}

        {/* ENDED STATE (Winner OR No Winner) */}
        {displayState === "ended" && (
          <div style={stage}>
            {winner ? (
              <WinnerDisplay teamName={winner.teamName} bid={winner.bid} />
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: EASE.out }}
                style={{ textAlign: "center" }}
              >
                <div style={{
                  fontFamily: F.heading, fontWeight: 900,
                  fontSize: "clamp(3.5rem, 10vw, 7rem)",
                  color: C.danger, marginBottom: "16px",
                }}>
                  No Winner
                </div>
                <div style={{
                  fontFamily: F.body, fontSize: "clamp(1.2rem, 2.5vw, 1.8rem)",
                  color: "#94A3B8",
                }}>
                  60s bidding timer expired with 0 bids
                </div>
              </motion.div>
            )}
          </div>
        )}

        {/* RESULT STATE (Pass / Fail recorded) */}
        {displayState === "result" && (
          <div style={stage}>
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={
                (lastResult?.result || task?.result) === "pass"
                  ? {
                      opacity: 1,
                      scale: [0.6, 1.1, 1],
                      boxShadow: [
                        "0 0 0 0 rgba(34,197,94,0)",
                        "0 0 60px 20px rgba(34,197,94,0.5)",
                        "0 0 30px 10px rgba(34,197,94,0.2)",
                      ],
                    }
                  : {
                      opacity: 1,
                      scale: 1,
                      x: [0, -12, 12, -8, 8, -4, 4, 0],
                    }
              }
              transition={{ duration: 0.7, ease: EASE.out }}
              style={{
                fontFamily: F.heading, fontWeight: 900,
                fontSize: "clamp(5rem, 15vw, 12rem)",
                color: (lastResult?.result || task?.result) === "pass" ? C.success : C.danger,
                letterSpacing: "0.1em",
                borderRadius: tokens.radius.xl,
                padding: "16px 32px",
              }}
            >
              {(lastResult?.result || task?.result) === "pass" ? "PASS" : "FAIL"}
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: DURATION.base, ease: EASE.out }}
              style={{
                fontFamily: F.heading, fontWeight: 700,
                fontSize: "clamp(1.5rem, 4vw, 2.5rem)",
                color: "#94A3B8", marginTop: "16px",
              }}
            >
              {lastResult?.teamName || task?.teamName || ""}
            </motion.div>
          </div>
        )}
      </div>

      {/* Tagline */}
      <div style={{
        textAlign: "center",
        fontFamily: F.body,
        fontSize: "clamp(0.85rem, 1.2vw, 1.1rem)",
        color: "#475569",
        letterSpacing: "0.04em",
        opacity: 0.85,
        marginTop: "auto",
        paddingTop: "16px",
      }}>
        Bid Smart. Code Fast. Win Big.
      </div>
    </div>
  );
}

/* ─── Layout Styles ─── */
const root: React.CSSProperties = {
  minHeight: "100vh", display: "flex", flexDirection: "column",
  backgroundColor: C.bg, color: C.text, fontFamily: F.body,
  userSelect: "none", padding: "clamp(16px, 3vw, 48px)",
};

const contentArea: React.CSSProperties = {
  flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
  width: "100%",
};

const stage: React.CSSProperties = {
  display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", gap: "24px", width: "100%",
};
