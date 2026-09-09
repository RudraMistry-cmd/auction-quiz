import { useEffect, useState, useRef } from "react";
import { getServerBase } from "../hooks/useSocket";
import { useGamePhase, formatClock } from "../hooks/useGamePhase";
import { BrandHeader } from "../components/BrandHeader";
import { tokens } from "../design-system";
import { useSoundSystem } from "../hooks/useSoundSystem";
import { soundManager } from "../utils/soundManager";
import type { Auction, Bid, TaskResultEvent } from "../shared/types";

const C = tokens.color;
const F = tokens.font;

interface BidEntry {
  teamName: string;
  amount: number;
  timestamp: number;
}

interface ResultData {
  result: "pass" | "fail";
  teamName: string;
  points?: number;
}

function getQuestionImageUrl(imagePath?: string | null): string {
  if (!imagePath) return "";
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) return imagePath;
  if (imagePath.startsWith("/questions/")) return `${getServerBase()}${imagePath}`;
  if (imagePath.startsWith("/")) return `${getServerBase()}${imagePath}`;
  return `${getServerBase()}/questions/${imagePath}`;
}

export default function LiveAuctionScreen() {
  const {
    socket,
    phase,
    currentQuestion,
    currentBid: gameBid,
    leadingTeam: phaseLeadingTeam,
    winningTeam,
    biddingTimer,
    mainTaskTimer,
    taskTimer,
    extraTimer,
  } = useGamePhase();

  // Local state
  const [currentBid, setCurrentBid] = useState(0);
  const [leadingTeam, setLeadingTeam] = useState("");
  const [timer, setTimer] = useState(0);
  const [winner, setWinner] = useState<{ teamName: string; bid: number } | null>(null);
  const [bidHistory, setBidHistory] = useState<BidEntry[]>([]);
  const [resultData, setResultData] = useState<ResultData | null>(null);
  const [questionImage, setQuestionImage] = useState<string | null>(null);
  const [bidFlash, setBidFlash] = useState(false);

  const prevBid = useRef(0);
  const autoResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // SOUND: this screen is the ONLY playback site in the app.
  // Event-driven triggers via useSoundSystem; unlock requires a user gesture.
  useSoundSystem(socket);
  const [soundReady, setSoundReady] = useState(() => soundManager.isUnlocked());

  // Autoplay policy: first interaction anywhere unlocks + preloads audio.
  useEffect(() => {
    if (soundReady) return;
    const enable = () => {
      soundManager.unlock();
      setSoundReady(true);
    };
    document.addEventListener("pointerdown", enable, { once: true });
    document.addEventListener("keydown", enable, { once: true });
    return () => {
      document.removeEventListener("pointerdown", enable);
      document.removeEventListener("keydown", enable);
    };
  }, [soundReady]);

  // Sync gameBid and flash
  useEffect(() => {
    if (gameBid !== undefined && gameBid !== null) {
      setCurrentBid(gameBid);
      if (gameBid !== prevBid.current && gameBid > 0) {
        setBidFlash(true);
        const t = setTimeout(() => setBidFlash(false), 500);
        return () => clearTimeout(t);
      }
      prevBid.current = gameBid;
    }
  }, [gameBid]);

  // Sync leading team
  useEffect(() => {
    if (phaseLeadingTeam !== undefined) setLeadingTeam(phaseLeadingTeam || "");
  }, [phaseLeadingTeam]);

  // Sync winning team
  useEffect(() => {
    if (winningTeam) {
      setWinner({ teamName: winningTeam.teamName, bid: gameBid || currentBid });
    }
  }, [winningTeam, gameBid, currentBid]);

  // Sync bidding timer
  useEffect(() => {
    if (biddingTimer && biddingTimer.remaining !== undefined) {
      setTimer(biddingTimer.remaining);
    }
  }, [biddingTimer?.remaining]);

  // Sync question image
  useEffect(() => {
    if (currentQuestion?.image) {
      setQuestionImage(currentQuestion.image);
    }
  }, [currentQuestion?.image]);

  // Clear auto-reset timer on unmount
  useEffect(() => {
    return () => {
      if (autoResetTimeoutRef.current) clearTimeout(autoResetTimeoutRef.current);
    };
  }, []);

  // System auto-reset handler (State 4)
  const performReset = () => {
    if (autoResetTimeoutRef.current) clearTimeout(autoResetTimeoutRef.current);
    setCurrentBid(0);
    setLeadingTeam("");
    setBidHistory([]);
    setWinner(null);
    setResultData(null);
    setQuestionImage(null);
  };

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    // 1. Auction Start
    const handleAuctionStart = (a?: Auction) => {
      if (autoResetTimeoutRef.current) clearTimeout(autoResetTimeoutRef.current);
      setResultData(null);
      setWinner(null);
      setBidHistory([]);
      const startAmount = a?.startBid || 0;
      setCurrentBid(startAmount);
      setLeadingTeam("");
      setTimer(a?.duration || 60);
      if (a?.question) setQuestionImage(a.question.image);
    };

    // 2. Bid Update
    const handleBidUpdate = (data: { auctionId: string; bid: Bid; teamName: string; increment?: number }) => {
      setCurrentBid(data.bid.amount);
      setLeadingTeam(data.teamName);
      setBidFlash(true);
      setTimeout(() => setBidFlash(false), 500);

      // Add to last 5 bids (reverse chronological)
      setBidHistory((prev) => {
        const entry: BidEntry = {
          teamName: data.teamName,
          amount: data.bid.amount,
          timestamp: Date.now(),
        };
        return [entry, ...prev].slice(0, 5);
      });
    };

    // 3. Auction Win / End
    const handleAuctionWin = (data: { winner: { teamId: string; teamName: string } | null; winningBid: number | null }) => {
      if (data.winner && data.winningBid != null) {
        setWinner({ teamName: data.winner.teamName, bid: data.winningBid });
        setLeadingTeam(data.winner.teamName);
      } else {
        setWinner(null);
      }
    };

    // 4. Task Start
    const handleTaskStart = () => {
      setResultData(null);
    };

    // 5. Result Declared / Task Result (State 3)
    const handleResultDeclared = (data: { result: "pass" | "fail"; teamName: string; points?: number }) => {
      setResultData({
        result: data.result,
        teamName: data.teamName,
        points: data.points,
      });

      // State 4: Auto-reset after 5.0s
      if (autoResetTimeoutRef.current) clearTimeout(autoResetTimeoutRef.current);
      autoResetTimeoutRef.current = setTimeout(() => {
        performReset();
      }, 5000);
    };

    const handleTaskResultEvent = (data: TaskResultEvent) => {
      setResultData({
        result: data.result,
        teamName: data.teamName,
        points: data.rewardGranted,
      });

      if (autoResetTimeoutRef.current) clearTimeout(autoResetTimeoutRef.current);
      autoResetTimeoutRef.current = setTimeout(() => {
        performReset();
      }, 5000);
    };

    // 6. System Reset (State 4 Broadcast)
    const handleSystemReset = () => {
      performReset();
    };

    const handleTimerEvent = (data: { auctionId: string; remaining: number }) => {
      setTimer(data.remaining);
    };

    const handleQuestionChanged = (data: any) => {
      if (data.imagePath) setQuestionImage(data.imagePath);
      else if (data.question?.image) setQuestionImage(data.question.image);
    };

    const handleFullState = (data: any) => {
      if (data.currentBid !== undefined) setCurrentBid(data.currentBid);
      if (data.leadingTeam) setLeadingTeam(data.leadingTeam);
      if (data.currentQuestion?.image) setQuestionImage(data.currentQuestion.image);
      if (data.timers?.bidding?.remaining !== undefined) setTimer(data.timers.bidding.remaining);
    };

    socket.on("auction:started", handleAuctionStart);
    socket.on("auction:start" as any, handleAuctionStart);
    socket.on("auction:bid_update", handleBidUpdate);
    socket.on("bid:update" as any, handleBidUpdate);
    socket.on("auction:ended", handleAuctionWin);
    socket.on("auction:win" as any, handleAuctionWin);
    socket.on("bid:win" as any, handleAuctionWin);
    socket.on("task:started" as any, handleTaskStart);
    socket.on("task:start" as any, handleTaskStart);
    socket.on("result:declared" as any, handleResultDeclared);
    socket.on("task:result", handleTaskResultEvent);
    socket.on("system:reset" as any, handleSystemReset);
    socket.on("auction:timer", handleTimerEvent);
    socket.on("question:changed" as any, handleQuestionChanged);
    socket.on("state:full" as any, handleFullState);

    return () => {
      socket.off("auction:started", handleAuctionStart);
      socket.off("auction:start" as any, handleAuctionStart);
      socket.off("auction:bid_update", handleBidUpdate);
      socket.off("bid:update" as any, handleBidUpdate);
      socket.off("auction:ended", handleAuctionWin);
      socket.off("auction:win" as any, handleAuctionWin);
      socket.off("bid:win" as any, handleAuctionWin);
      socket.off("task:started" as any, handleTaskStart);
      socket.off("task:start" as any, handleTaskStart);
      socket.off("result:declared" as any, handleResultDeclared);
      socket.off("task:result", handleTaskResultEvent);
      socket.off("system:reset" as any, handleSystemReset);
      socket.off("auction:timer", handleTimerEvent);
      socket.off("question:changed" as any, handleQuestionChanged);
      socket.off("state:full" as any, handleFullState);
    };
  }, [socket]);

  // Derived state resolution
  const isBiddingPhase = phase === "bidding";
  const isResultState = phase === "result_display" || resultData !== null;
  const isTaskPhase = (phase === "main_task" || (!!mainTaskTimer?.isRunning && !isBiddingPhase)) && !isResultState;
  const isFallbackActive = (phase === "fallback_active" || (!!extraTimer?.isRunning && !isBiddingPhase && !isTaskPhase)) && !isResultState;
  const isFallbackIdle = phase === "fallback_idle" && !isFallbackActive && !isResultState;
  const isPostBidIdle = phase === "post_bid_idle" && !isTaskPhase && !isFallbackActive && !isResultState;
  const isIdleState = !isBiddingPhase && !isPostBidIdle && !isTaskPhase && !isFallbackIdle && !isFallbackActive && !isResultState;

  // Active question image resolution
  const activeImage = currentQuestion?.image || questionImage;

  // Timers
  const activeBiddingTimer = biddingTimer ? biddingTimer.remaining : timer;
  const activeTaskTimer = (mainTaskTimer ? mainTaskTimer.remaining : taskTimer) ?? 0;
  const activeExtraTimer = extraTimer?.remaining ?? 0;
  const isBiddingUrgent = activeBiddingTimer <= 10;
  const isTaskUrgent = activeTaskTimer <= 30;
  const isExtraUrgent = activeExtraTimer <= 30;

  return (
    <div style={root}>
      <style>{liveStyles}</style>

      {/* Autoplay gate: visible until first interaction unlocks audio. */}
      {!soundReady && (
        <button
          onClick={() => {
            soundManager.unlock();
            setSoundReady(true);
          }}
          style={enableSoundBtn}
        >
          🔊 Enable Sound
        </button>
      )}

      {/* ─── 1. TOP HEADER ROW (80px Fixed Height) ─── */}
      <header style={headerStyle}>
        {/* Left: Stage Badge */}
        <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
          <div style={stageBadge}>
            <span style={stageDot} />
            <span style={stageText}>LIVE AUCTION STAGE</span>
          </div>
        </div>

        {/* Center: Event Logo + Event Name */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <BrandHeader variant="compact" style={{ marginBottom: 0 }} />
        </div>

        {/* Right side: EMPTY (Reserved, No Timer Here!) */}
        <div style={{ flex: 1 }} />
      </header>

      {/* ─── 2. MAIN SCREEN SPLIT (30% LEFT / 70% RIGHT) ─── */}
      <div style={splitArea}>

        {/* ═══════════════════════════════════════════════════
            LEFT PANEL (30%) — STATE-DRIVEN UI
            ═══════════════════════════════════════════════════ */}
        <aside style={leftPanel}>

          {/* ───────────────────────────────────────────────────
              STATE 1: BIDDING PHASE
              ─────────────────────────────────────────────────── */}
          {isBiddingPhase && (
            <div style={stateContainer}>
              {/* 1. Auction Timer (Primary Focus) */}
              <div style={timerBox(isBiddingUrgent)}>
                <span style={timerBoxLabel(isBiddingUrgent)}>AUCTION TIME</span>
                <div style={timerBoxValue(isBiddingUrgent)}>
                  {formatClock(activeBiddingTimer)}
                </div>
              </div>

              {/* 2. Current Bid + 3. Leading Team */}
              <div style={currentBidCard(bidFlash)}>
                <span style={currentBidLabel}>CURRENT BID</span>
                <div style={currentBidValue}>
                  {currentBid}
                </div>
                <div style={leadingTeamLine}>
                  <span style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: leadingTeam ? C.success : C.muted,
                    boxShadow: leadingTeam ? `0 0 8px ${C.success}` : "none",
                  }} />
                  <span>{leadingTeam ? `Leading: ${leadingTeam}` : "Waiting for first bid..."}</span>
                </div>
              </div>

              {/* 4. Last 5 Bids (Live) */}
              <div style={bidHistoryCard}>
                <span style={bidHistoryHeader}>RECENT BIDS</span>
                <div style={bidListContainer}>
                  {bidHistory.length === 0 ? (
                    <div style={emptyHistoryText}>No bids placed yet</div>
                  ) : (
                    bidHistory.map((b, idx) => {
                      const isTop = idx === 0;
                      return (
                        <div
                          key={`${b.teamName}-${b.amount}-${b.timestamp}`}
                          style={bidRow(isTop)}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            {isTop && <span style={latestBadge}>LATEST</span>}
                            <span style={bidTeamName(isTop)}>{b.teamName}</span>
                          </div>
                          <div style={bidAmountText(isTop)}>
                            → {b.amount}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────
              STATE 2A: POST-BID IDLE (WINNER DETERMINED, STANDBY)
              ─────────────────────────────────────────────────── */}
          {isPostBidIdle && (
            <div style={stateContainer}>
              {/* Winning Block */}
              <div style={winnerBlock}>
                <span style={winnerBlockSubtitle}>AUCTION WON</span>
                <div style={winnerTeamTitle}>
                  {winner?.teamName || winningTeam?.teamName || "WINNING TEAM"} WON THE BID
                </div>
                <div style={winnerBidSubtitle}>
                  Winning Bid: {winner?.bid || currentBid}
                </div>
              </div>

              {/* Status Line */}
              <div style={solvingStatusLine}>
                <span style={solvingDot} />
                <span style={solvingText}>
                  Awaiting task timer start
                </span>
              </div>

              {/* Task Standby Box */}
              <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "16px 20px",
                borderRadius: tokens.radius.xl,
                backgroundColor: `${C.primary}08`,
                border: `2px dashed ${C.border}`,
                flexShrink: 0,
                textAlign: "center",
              }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: "4px" }}>
                  TASK TIME
                </span>
                <div style={{ fontFamily: F.mono, fontWeight: 900, fontSize: "clamp(2.4rem, 3.8vw, 3.2rem)", color: C.muted, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                  --:--
                </div>
                <span style={{ fontSize: "0.75rem", color: C.muted, marginTop: "6px" }}>
                  Standby for admin to start timer
                </span>
              </div>

              {/* Last 5 Bids (Frozen) */}
              <div style={bidHistoryCard}>
                <span style={bidHistoryHeader}>FINAL BIDS (FROZEN)</span>
                <div style={bidListContainer}>
                  {bidHistory.length === 0 ? (
                    <div style={emptyHistoryText}>No bids recorded</div>
                  ) : (
                    bidHistory.map((b, idx) => {
                      const isTop = idx === 0;
                      return (
                        <div
                          key={`${b.teamName}-${b.amount}-${b.timestamp}`}
                          style={bidRow(isTop)}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            {isTop && <span style={latestBadge}>WINNING</span>}
                            <span style={bidTeamName(isTop)}>{b.teamName}</span>
                          </div>
                          <div style={bidAmountText(isTop)}>
                            → {b.amount}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────
              STATE 2B: MAIN TASK (SOLVING)
              ─────────────────────────────────────────────────── */}
          {isTaskPhase && (
            <div style={stateContainer}>
              {/* Winning Block */}
              <div style={winnerBlock}>
                <span style={winnerBlockSubtitle}>AUCTION WON</span>
                <div style={winnerTeamTitle}>
                  {winner?.teamName || winningTeam?.teamName || "WINNING TEAM"} WON THE BID
                </div>
                <div style={winnerBidSubtitle}>
                  Bid: {winner?.bid || currentBid}
                </div>
              </div>

              {/* Status Line */}
              <div style={solvingStatusLine}>
                <span style={solvingDot} />
                <span style={solvingText}>
                  {winner?.teamName || winningTeam?.teamName || "Winning Team"} is solving
                </span>
              </div>

              {/* Task Timer (Primary Focus) */}
              <div style={timerBox(isTaskUrgent)}>
                <span style={timerBoxLabel(isTaskUrgent)}>TASK TIME REMAINING</span>
                <div style={timerBoxValue(isTaskUrgent)}>
                  {formatClock(activeTaskTimer)}
                </div>
              </div>

              {/* Last 5 Bids (Frozen) */}
              <div style={bidHistoryCard}>
                <span style={bidHistoryHeader}>FINAL BIDS (FROZEN)</span>
                <div style={bidListContainer}>
                  {bidHistory.length === 0 ? (
                    <div style={emptyHistoryText}>No bids recorded</div>
                  ) : (
                    bidHistory.map((b, idx) => {
                      const isTop = idx === 0;
                      return (
                        <div
                          key={`${b.teamName}-${b.amount}-${b.timestamp}`}
                          style={bidRow(isTop)}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            {isTop && <span style={latestBadge}>WINNING</span>}
                            <span style={bidTeamName(isTop)}>{b.teamName}</span>
                          </div>
                          <div style={bidAmountText(isTop)}>
                            → {b.amount}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────
              STATE 2C: FALLBACK IDLE (STANDBY FOR EXTRA TIMER)
              ─────────────────────────────────────────────────── */}
          {isFallbackIdle && (
            <div style={stateContainer}>
              <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "16px 18px",
                borderRadius: tokens.radius.xl,
                backgroundColor: `${C.danger}10`,
                border: `2px solid ${C.danger}60`,
                textAlign: "center",
                flexShrink: 0,
              }}>
                <span style={{ fontSize: "0.7rem", fontWeight: 800, color: C.danger, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "4px" }}>
                  FALLBACK ROUND
                </span>
                <div style={{ fontFamily: F.heading, fontWeight: 900, fontSize: "clamp(1.2rem, 1.8vw, 1.5rem)", color: C.text, lineHeight: 1.2 }}>
                  FALLBACK OPEN
                </div>
                <span style={{ fontSize: "0.8rem", color: C.muted, marginTop: "4px" }}>
                  Primary team failed • Open to all teams
                </span>
              </div>

              <div style={solvingStatusLine}>
                <span style={solvingDot} />
                <span style={solvingText}>
                  Extra Timer Standby
                </span>
              </div>

              <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "16px 20px",
                borderRadius: tokens.radius.xl,
                backgroundColor: `${C.primary}08`,
                border: `2px dashed ${C.border}`,
                flexShrink: 0,
              }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: "4px" }}>
                  {extraTimer?.label?.toUpperCase() || "EXTRA TIMER"}
                </span>
                <div style={{ fontFamily: F.mono, fontWeight: 900, fontSize: "clamp(2.4rem, 3.8vw, 3.2rem)", color: C.muted, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                  --:--
                </div>
                <span style={{ fontSize: "0.75rem", color: C.muted, marginTop: "6px" }}>
                  Standby for admin to start timer
                </span>
              </div>

              {/* Last 5 Bids (Frozen) */}
              <div style={bidHistoryCard}>
                <span style={bidHistoryHeader}>FINAL BIDS (FROZEN)</span>
                <div style={bidListContainer}>
                  {bidHistory.length === 0 ? (
                    <div style={emptyHistoryText}>No bids recorded</div>
                  ) : (
                    bidHistory.map((b, idx) => {
                      const isTop = idx === 0;
                      return (
                        <div
                          key={`${b.teamName}-${b.amount}-${b.timestamp}`}
                          style={bidRow(isTop)}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            {isTop && <span style={latestBadge}>WINNING</span>}
                            <span style={bidTeamName(isTop)}>{b.teamName}</span>
                          </div>
                          <div style={bidAmountText(isTop)}>
                            → {b.amount}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────
              STATE 2D: FALLBACK ACTIVE (EXTRA TIMER RUNNING)
              ─────────────────────────────────────────────────── */}
          {isFallbackActive && (
            <div style={stateContainer}>
              <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "16px 18px",
                borderRadius: tokens.radius.xl,
                backgroundColor: `${C.accent}15`,
                border: `2px solid ${C.accent}`,
                boxShadow: `0 0 24px ${C.accent}40`,
                textAlign: "center",
                flexShrink: 0,
              }}>
                <span style={{ fontSize: "0.7rem", fontWeight: 800, color: C.accent, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "4px" }}>
                  FALLBACK ROUND
                </span>
                <div style={{ fontFamily: F.heading, fontWeight: 900, fontSize: "clamp(1.2rem, 1.8vw, 1.5rem)", color: C.text, lineHeight: 1.2 }}>
                  SOLVING IN PROGRESS
                </div>
                <span style={{ fontSize: "0.8rem", color: C.muted, marginTop: "4px" }}>
                  Other teams can solve now
                </span>
              </div>

              {/* Extra Timer Box */}
              <div style={timerBox(isExtraUrgent)}>
                <span style={timerBoxLabel(isExtraUrgent)}>{extraTimer?.label?.toUpperCase() || "EXTRA TIMER"}</span>
                <div style={timerBoxValue(isExtraUrgent)}>
                  {formatClock(activeExtraTimer)}
                </div>
              </div>

              {/* Last 5 Bids (Frozen) */}
              <div style={bidHistoryCard}>
                <span style={bidHistoryHeader}>FINAL BIDS (FROZEN)</span>
                <div style={bidListContainer}>
                  {bidHistory.length === 0 ? (
                    <div style={emptyHistoryText}>No bids recorded</div>
                  ) : (
                    bidHistory.map((b, idx) => {
                      const isTop = idx === 0;
                      return (
                        <div
                          key={`${b.teamName}-${b.amount}-${b.timestamp}`}
                          style={bidRow(isTop)}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            {isTop && <span style={latestBadge}>WINNING</span>}
                            <span style={bidTeamName(isTop)}>{b.teamName}</span>
                          </div>
                          <div style={bidAmountText(isTop)}>
                            → {b.amount}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────
              STATE 3: RESULT DISPLAY (5s LOCK)
              ─────────────────────────────────────────────────── */}
          {isResultState && (
            <div style={stateContainer}>
              <div style={resultCard(resultData ? resultData.result === "pass" : true)}>
                <div style={resultTitle(resultData ? resultData.result === "pass" : true)}>
                  {resultData
                    ? resultData.result === "pass"
                      ? `✅ ${resultData.teamName} PASSED`
                      : `❌ ${resultData.teamName} FAILED`
                    : "ROUND COMPLETE"}
                </div>
                {resultData?.result === "pass" && (
                  <div style={resultPointsText}>
                    +{resultData.points || currentQuestion?.reward || 100} points awarded
                  </div>
                )}
                <div style={{
                  fontSize: "0.8rem",
                  color: C.muted,
                  marginTop: "12px",
                  fontFamily: F.mono,
                  letterSpacing: "0.05em",
                }}>
                  Resetting in 5s...
                </div>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────
              STATE 4 / IDLE: NEUTRAL STATE
              ─────────────────────────────────────────────────── */}
          {isIdleState && (
            <div style={neutralContainer}>
              <div style={neutralIcon}>🎯</div>
              <div style={neutralTitle}>Waiting for Auction</div>
              <p style={neutralText}>
                The next challenge will be presented shortly. Stand by for the countdown!
              </p>
            </div>
          )}
        </aside>

        {/* ═══════════════════════════════════════════════════
            RIGHT PANEL (70%) — QUESTION DISPLAY
            ═══════════════════════════════════════════════════ */}
        <main style={rightPanel}>
          {/* Question visibility:
              - Visible on Live Display when selected by admin (even in idle)
              - Visible during bidding
              - Remains visible on bid won
              - Cleared after result declaration upon auto-reset
          */}
          {activeImage ? (
            <div style={questionCard}>
              <div style={questionMetaHeader}>
                <span style={questionBadge}>
                  {isTaskPhase || isPostBidIdle || isFallbackIdle || isFallbackActive ? "ACTIVE CHALLENGE" : "AUCTION QUESTION"}
                </span>
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

              <div style={imageWrapper}>
                <img
                  src={getQuestionImageUrl(activeImage)}
                  alt="Question"
                  style={imageStyle}
                />
              </div>
            </div>
          ) : (
            /* Idle Placeholder: Centered Logo (dimmed) + Tagline */
            <div style={idlePlaceholder}>
              <img
                src="/assets/logo.png"
                alt="Event Logo"
                style={idleLogo}
              />
              <div style={idleEventName}>BID FOR C</div>
              <p style={idleTagline}>Bid Smart. Code Fast. Win Big.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/* ─── Styles: Strict 100vh Non-Scrollable Layout ─── */
const root: React.CSSProperties = {
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

/* "Enable Sound" autoplay-gate button (hidden after first interaction). */
const enableSoundBtn: React.CSSProperties = {
  position: "fixed",
  bottom: "28px",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 1000,
  padding: "14px 32px",
  borderRadius: tokens.radius.full,
  border: `2px solid ${C.accent}`,
  backgroundColor: C.accent,
  color: "#0F172A",
  fontFamily: F.heading,
  fontWeight: 800,
  fontSize: "1.05rem",
  letterSpacing: "0.04em",
  cursor: "pointer",
  boxShadow: `0 8px 32px ${C.accent}66`,
};

const headerStyle: React.CSSProperties = {
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

const stageBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  padding: "6px 14px",
  borderRadius: tokens.radius.full,
  backgroundColor: `${C.primary}12`,
  border: `1px solid ${C.primary}30`,
};

const stageDot: React.CSSProperties = {
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  backgroundColor: C.danger,
  boxShadow: `0 0 8px ${C.danger}`,
  animation: "dotPulse 1.5s infinite",
};

const stageText: React.CSSProperties = {
  fontFamily: F.heading,
  fontSize: "0.85rem",
  fontWeight: 800,
  color: C.primary,
  letterSpacing: "0.06em",
};

const splitArea: React.CSSProperties = {
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

const stateContainer: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "14px",
  width: "100%",
  height: "100%",
  overflow: "hidden",
};

/* ─── Timer Box ─── */
const timerBox = (urgent: boolean): React.CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "16px 20px",
  borderRadius: tokens.radius.xl,
  backgroundColor: urgent ? `${C.danger}15` : `${C.primary}10`,
  border: `2px solid ${urgent ? C.danger : C.primary}`,
  boxShadow: urgent ? `0 0 24px ${C.danger}44` : `0 4px 16px ${C.primary}15`,
  animation: urgent ? "urgentPulse 1s infinite" : "none",
  flexShrink: 0,
});

const timerBoxLabel = (urgent: boolean): React.CSSProperties => ({
  fontSize: "0.75rem",
  fontWeight: 800,
  color: urgent ? C.danger : C.muted,
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  marginBottom: "4px",
});

const timerBoxValue = (urgent: boolean): React.CSSProperties => ({
  fontFamily: F.mono,
  fontWeight: 900,
  fontSize: "clamp(2.8rem, 4.5vw, 3.8rem)",
  color: urgent ? C.danger : C.primary,
  fontVariantNumeric: "tabular-nums",
  lineHeight: 1,
});

/* ─── Current Bid Card ─── */
const currentBidCard = (flash: boolean): React.CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "14px 20px",
  borderRadius: tokens.radius.xl,
  backgroundColor: C.bg,
  border: `2px solid ${flash ? C.accent : C.border}`,
  boxShadow: flash ? `0 0 24px ${C.accent}60` : tokens.shadow.xs,
  animation: flash ? "bidPop 0.4s ease" : "none",
  transition: "all 0.25s ease",
  flexShrink: 0,
});

const currentBidLabel: React.CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 800,
  color: C.muted,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  marginBottom: "4px",
};

const currentBidValue: React.CSSProperties = {
  fontFamily: F.heading,
  fontWeight: 900,
  fontSize: "clamp(2.5rem, 4vw, 3.5rem)",
  color: C.accent,
  fontVariantNumeric: "tabular-nums",
  lineHeight: 1,
};

const leadingTeamLine: React.CSSProperties = {
  marginTop: "6px",
  fontSize: "0.85rem",
  fontWeight: 800,
  color: C.text,
  display: "flex",
  alignItems: "center",
  gap: "6px",
};

/* ─── Bid History (Last 5 Bids) ─── */
const bidHistoryCard: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  width: "100%",
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
};

const bidHistoryHeader: React.CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 800,
  color: C.muted,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  marginBottom: "2px",
  flexShrink: 0,
};

const bidListContainer: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  overflow: "hidden",
  flex: 1,
};

const emptyHistoryText: React.CSSProperties = {
  fontSize: "0.8rem",
  color: C.muted,
  fontStyle: "italic",
  padding: "8px 0",
};

const bidRow = (isTop: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: isTop ? "8px 12px" : "6px 10px",
  borderRadius: tokens.radius.md,
  backgroundColor: isTop ? `${C.accent}18` : `${C.bg}80`,
  border: isTop ? `1.5px solid ${C.accent}` : `1px solid ${C.border}`,
  boxShadow: isTop ? `0 0 12px ${C.accent}30` : "none",
  transition: "all 0.2s ease",
  flexShrink: 0,
});

const latestBadge: React.CSSProperties = {
  fontSize: "0.58rem",
  fontWeight: 900,
  color: "#0F172A",
  backgroundColor: C.accent,
  padding: "2px 6px",
  borderRadius: tokens.radius.sm,
  letterSpacing: "0.05em",
};

const bidTeamName = (isTop: boolean): React.CSSProperties => ({
  fontFamily: F.heading,
  fontWeight: isTop ? 800 : 600,
  fontSize: isTop ? "0.95rem" : "0.85rem",
  color: isTop ? C.accent : C.text,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const bidAmountText = (isTop: boolean): React.CSSProperties => ({
  fontFamily: F.mono,
  fontWeight: 800,
  fontSize: isTop ? "1.1rem" : "0.95rem",
  color: isTop ? C.accent : C.muted,
  marginLeft: "8px",
  flexShrink: 0,
});

/* ─── State 2: Winning Block Styles ─── */
const winnerBlock: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "16px 18px",
  borderRadius: tokens.radius.xl,
  backgroundColor: `${C.accent}15`,
  border: `2px solid ${C.accent}`,
  boxShadow: `0 0 24px ${C.accent}40`,
  textAlign: "center",
  flexShrink: 0,
};

const winnerBlockSubtitle: React.CSSProperties = {
  fontSize: "0.7rem",
  fontWeight: 800,
  color: C.accent,
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  marginBottom: "4px",
};

const winnerTeamTitle: React.CSSProperties = {
  fontFamily: F.heading,
  fontWeight: 900,
  fontSize: "clamp(1.2rem, 1.8vw, 1.6rem)",
  color: C.text,
  lineHeight: 1.2,
  marginBottom: "4px",
};

const winnerBidSubtitle: React.CSSProperties = {
  fontFamily: F.heading,
  fontWeight: 800,
  fontSize: "1.1rem",
  color: C.accent,
};

const solvingStatusLine: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "8px 16px",
  borderRadius: tokens.radius.full,
  backgroundColor: `${C.accent}12`,
  border: `1.5px solid ${C.accent}40`,
  flexShrink: 0,
};

const solvingDot: React.CSSProperties = {
  width: "10px",
  height: "10px",
  borderRadius: "50%",
  backgroundColor: C.accent,
  boxShadow: `0 0 8px ${C.accent}`,
  animation: "dotPulse 1.6s infinite",
  flexShrink: 0,
};

const solvingText: React.CSSProperties = {
  fontFamily: F.heading,
  fontWeight: 800,
  fontSize: "0.85rem",
  color: C.accent,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/* ─── State 3: Result Card Styles ─── */
const resultCard = (isPass: boolean): React.CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "36px 20px",
  backgroundColor: isPass ? `${C.success}12` : `${C.danger}12`,
  border: `2px solid ${isPass ? C.success : C.danger}`,
  borderRadius: tokens.radius.xl,
  boxShadow: `0 0 30px ${isPass ? C.success : C.danger}33`,
  textAlign: "center",
  gap: "12px",
  flexShrink: 0,
});

const resultTitle = (isPass: boolean): React.CSSProperties => ({
  fontFamily: F.heading,
  fontWeight: 900,
  fontSize: "clamp(1.4rem, 2.2vw, 1.9rem)",
  color: isPass ? C.success : C.danger,
  lineHeight: 1.2,
});

const resultPointsText: React.CSSProperties = {
  fontFamily: F.heading,
  fontWeight: 800,
  fontSize: "1.2rem",
  color: C.accent,
};

/* ─── State 4 / Neutral State Styles ─── */
const neutralContainer: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "36px 20px",
  borderRadius: tokens.radius.xl,
  backgroundColor: C.bg,
  border: `1.5px dashed ${C.border}`,
  textAlign: "center",
  gap: "10px",
};

const neutralIcon: React.CSSProperties = {
  fontSize: "2.5rem",
  marginBottom: "4px",
};

const neutralTitle: React.CSSProperties = {
  fontFamily: F.heading,
  fontWeight: 800,
  fontSize: "1.2rem",
  color: C.primary,
};

const neutralText: React.CSSProperties = {
  fontFamily: F.body,
  fontSize: "0.88rem",
  color: C.muted,
  lineHeight: 1.5,
  margin: 0,
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
  padding: "24px",
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

const questionMetaHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "12px",
  flexShrink: 0,
};

const questionBadge: React.CSSProperties = {
  fontFamily: F.heading,
  fontSize: "0.8rem",
  fontWeight: 800,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: C.primary,
  backgroundColor: `${C.primary}12`,
  padding: "4px 12px",
  borderRadius: tokens.radius.sm,
  border: `1px solid ${C.primary}25`,
};

const imageWrapper: React.CSSProperties = {
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

const imageStyle: React.CSSProperties = {
  maxWidth: "100%",
  maxHeight: "100%",
  width: "auto",
  height: "auto",
  objectFit: "contain",
  borderRadius: tokens.radius.md,
  boxShadow: "0 6px 24px rgba(0,0,0,0.15)",
};

const idlePlaceholder: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: "40px",
  maxWidth: "520px",
};

const idleLogo: React.CSSProperties = {
  height: "90px",
  width: "auto",
  objectFit: "contain",
  opacity: 0.35,
  filter: "grayscale(25%)",
  marginBottom: "20px",
};

const idleEventName: React.CSSProperties = {
  fontFamily: F.heading,
  fontWeight: 900,
  fontSize: "clamp(2rem, 3.5vw, 2.8rem)",
  color: C.primary,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  marginBottom: "12px",
  opacity: 0.8,
};

const idleTagline: React.CSSProperties = {
  fontFamily: F.heading,
  fontWeight: 700,
  fontSize: "clamp(1.1rem, 1.8vw, 1.4rem)",
  color: C.accent,
  letterSpacing: "0.04em",
  margin: 0,
};

/* ─── CSS Animations ─── */
const liveStyles = `
  @keyframes bidPop {
    0% { transform: scale(1); }
    50% { transform: scale(1.06); }
    100% { transform: scale(1); }
  }
  @keyframes dotPulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.3); opacity: 0.7; }
  }
  @keyframes urgentPulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.03); }
  }
`;
