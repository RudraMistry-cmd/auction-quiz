import { useEffect, useState, useRef, useCallback } from "react";
import { getServerBase } from "../hooks/useSocket";
import { useGamePhase, formatClock } from "../hooks/useGamePhase";
import TaskStage from "../components/TaskStage";
import QuestionView from "../components/QuestionView";
import { BrandHeader } from "../components/BrandHeader";
import { tokens, badge as badgeStyle, card as cardStyle, tabular } from "../design-system";
import { soundManager } from "../utils/soundManager";
import type { Auction, Bid } from "../shared/types";

const C = tokens.color;
const F = tokens.font;

/* ─── Sub-components ─── */

function TimerBadge({ timeLeft }: { timeLeft: number }) {
  const urgent = timeLeft <= 10;
  const mid = timeLeft <= 20;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "16px",
      backgroundColor: urgent ? C.dangerBg : mid ? `${C.accent}15` : `${C.primary}08`,
      border: `3px solid ${urgent ? C.danger : mid ? C.accent : C.primary}`,
      borderRadius: tokens.radius.xl, padding: "16px 36px",
      transition: `all ${tokens.transition.base}`,
      boxShadow: urgent ? `0 0 30px ${C.danger}33` : mid ? `0 0 20px ${C.accent}22` : "none",
    }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={urgent ? C.danger : C.primary} strokeWidth="2.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      <span style={{
        fontFamily: F.heading, fontWeight: 900, fontSize: "clamp(2rem, 5vw, 3rem)",
        color: urgent ? C.danger : C.primary,
        fontVariantNumeric: "tabular-nums",
        minWidth: "8ch", textAlign: "center",
        letterSpacing: "0.05em",
      }}>
        {formatClock(timeLeft)}
      </span>
      {urgent && <span style={{
        fontSize: "0.8rem", fontWeight: 800, color: "#fff",
        backgroundColor: C.danger,
        borderRadius: tokens.radius.sm, padding: "4px 12px",
        letterSpacing: "0.1em", animation: "pulse 1s infinite",
      }}>HURRY</span>}
    </div>
  );
}

function DifficultyBadge({ level }: { level?: string }) {
  const l = (level || "medium").toLowerCase();
  const s = badgeStyle(l as any);
  return <span style={s}>{l.toUpperCase()}</span>;
}

function BidDisplay({ amount, animate, increment }: { amount: number; animate: boolean; increment: number }) {
  const isGold = increment === 50;
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{
        fontFamily: F.body, fontWeight: 600, fontSize: "0.85rem",
        color: C.muted, letterSpacing: "0.2em", textTransform: "uppercase",
        marginBottom: "6px",
      }}>CURRENT BID</div>
      <div style={{
        fontFamily: F.heading, fontWeight: 800,
        fontSize: "clamp(5rem, 14vw, 11rem)",
        lineHeight: 1, color: C.accent,
        fontVariantNumeric: "tabular-nums",
        animation: animate ? (isGold ? "bidPopGold 0.5s ease, goldFlash 1s ease" : "bidPop 0.45s ease, goldFlash 0.8s ease") : "none",
        textShadow: animate && isGold ? `0 0 40px ${C.accent}66` : "none",
      }} key={amount}>
        {amount}
      </div>
      {animate && (
        <div style={{
          fontFamily: F.heading, fontWeight: 700, fontSize: "1.2rem",
          color: isGold ? C.accent : C.muted,
          marginTop: "8px",
          animation: "fadeIn 0.3s ease",
        }}>+{increment}</div>
      )}
    </div>
  );
}

function NextBidPill({ current, increment }: { current: number; increment: number }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: "8px",
      backgroundColor: C.surface, border: `1.5px solid ${C.border}`,
      borderRadius: tokens.radius.lg, padding: "10px 24px",
      fontFamily: F.body, fontSize: "1.1rem", color: C.muted,
    }}>
      <span style={{ fontWeight: 600 }}>NEXT BID</span>
      <span style={{
        fontWeight: 700, color: C.primary,
        fontVariantNumeric: "tabular-nums",
      }}>+{increment} → {current + increment}</span>
    </div>
  );
}

function FeedList({ items }: { items: { amount: number; seqNo: number; teamName: string; increment: number }[] }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: "6px",
      width: "100%", maxWidth: "420px",
    }}>
      <div style={{
        fontFamily: F.body, fontWeight: 600, fontSize: "0.75rem",
        color: C.muted, letterSpacing: "0.15em", textTransform: "uppercase",
        marginBottom: "2px",
      }}>LIVE FEED</div>
      {items.map((b, i) => {
        const isGold = b.increment === 50;
        return (
          <div key={b.seqNo} style={{
            display: "flex", alignItems: "center", gap: "12px",
            backgroundColor: i === 0 ? (isGold ? `${C.accent}15` : C.successBg) : C.surface,
            border: `1px solid ${i === 0 ? (isGold ? C.accent : C.successBorder) : C.border}`,
            borderRadius: tokens.radius.md, padding: "10px 16px",
            fontFamily: F.body, fontSize: "0.95rem",
            animation: isGold ? "bidSlideGold 0.4s ease" : "slideUp 0.3s ease",
            boxShadow: i === 0 && isGold ? `0 0 20px ${C.accent}33` : "none",
          }}>
            <span style={{
              fontWeight: 700, color: i === 0 ? (isGold ? C.accent : C.success) : C.muted,
              fontVariantNumeric: "tabular-nums", minWidth: "4ch",
            }}>#{b.seqNo}</span>
            <span style={{ flex: 1, fontWeight: 600, color: C.text }}>{b.teamName}</span>
            <span style={{
              fontWeight: 700, color: i === 0 ? (isGold ? C.accent : C.success) : C.primary,
              fontVariantNumeric: "tabular-nums",
            }}>{b.amount}</span>
            <span style={{
              fontWeight: 600, fontSize: "0.75rem",
              color: isGold ? C.accent : C.muted,
              backgroundColor: isGold ? `${C.accent}20` : `${C.muted}15`,
              padding: "2px 8px", borderRadius: tokens.radius.sm,
            }}>+{b.increment}</span>
          </div>
        );
      })}
      {items.length === 0 && (
        <div style={{
          textAlign: "center", padding: "20px",
          color: C.muted, fontSize: "0.9rem", fontStyle: "italic",
        }}>No bids yet</div>
      )}
    </div>
  );
}

/* ─── Main Screen ─── */
export default function LiveAuctionScreen() {
  const { socket, connected, phase, task, taskTimer, taskEnded, taskPaused, upcomingQuestion, activeQuestion } = useGamePhase();
  const [auction, setAuction] = useState<Auction | null>(null);
  const [currentBid, setCurrentBid] = useState<number>(0);
  const [leadingTeam, setLeadingTeam] = useState<string>("");
  const [timer, setTimer] = useState<number>(0);
  const [winner, setWinner] = useState<{ teamName: string; bid: number } | null>(null);
  const [recent, setRecent] = useState<{ amount: number; seqNo: number; teamName: string; increment: number }[]>([]);
  const [manualTimer, setManualTimer] = useState<{ timeLeft: number; isRunning: boolean; duration: number }>({ timeLeft: 0, isRunning: false, duration: 0 });
  const [auctionCleared, setAuctionCleared] = useState(false);
  const [bidFlash, setBidFlash] = useState(false);
  const [lastIncrement, setLastIncrement] = useState<number>(20);
  const [questionImage, setQuestionImage] = useState<string | null>(null);
  const prevBid = useRef(0);
  const prevTimer = useRef(0);
  const tickPlayedRef = useRef(false);

  // Initialize sound system
  useEffect(() => {
    soundManager.preload();
  }, []);

  // Unlock audio on first user interaction
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

  // Tick sound for last 10 seconds of manual timer
  useEffect(() => {
    if (manualTimer.isRunning && manualTimer.timeLeft <= 10 && manualTimer.timeLeft > 0) {
      // Only play tick if timer actually changed
      if (manualTimer.timeLeft !== prevTimer.current) {
        soundManager.play("tick");
        tickPlayedRef.current = true;
      }
    }
    // Reset tick flag when timer stops or goes above 10
    if (!manualTimer.isRunning || manualTimer.timeLeft > 10 || manualTimer.timeLeft === 0) {
      tickPlayedRef.current = false;
    }
    prevTimer.current = manualTimer.timeLeft;
  }, [manualTimer.timeLeft, manualTimer.isRunning]);

  // Restore state on refresh
  useEffect(() => {
    if (!socket || !connected) return;
    let cancelled = false;
    fetch(`${getServerBase()}/api/auction/current`)
      .then((r) => r.json())
      .then((s: any) => {
        if (cancelled) return;
        if (s.auction) {
          setAuction(s.auction);
          setCurrentBid(s.currentBid ?? s.auction.startBid);
          setTimer(s.remaining ?? 0);
          setLeadingTeam(s.leadingTeam || "");
          setWinner(null);
          setRecent(s.recentBids || []);
        } else if (s.lastResult?.teamName) {
          setWinner({ teamName: s.lastResult.teamName, bid: s.lastResult.bid ?? 0 });
        }
        // Restore question image from server state
        if (s.currentQuestionImage !== undefined) {
          setQuestionImage(s.currentQuestionImage);
        }
        // Restore manual timer from server state
        if (s.manualTimer) {
          setManualTimer({
            timeLeft: s.manualTimer.timeLeft ?? 0,
            isRunning: s.manualTimer.isRunning ?? false,
            duration: s.manualTimer.duration ?? 0,
          });
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [socket, connected]);

  // Live events
  useEffect(() => {
    if (!socket || !connected) return;

    const handleStarted = (a: Auction) => {
      setAuction(a); setCurrentBid(a.startBid); setTimer(a.duration);
      setLeadingTeam(""); setWinner(null); setRecent([]); setAuctionCleared(false);
    };
    const handleBidUpdate = (data: { auctionId: string; bid: Bid; teamName: string; increment: number }) => {
      setCurrentBid(data.bid.amount); setLeadingTeam(data.teamName);
      setLastIncrement(data.increment);
      setRecent((prev) => [{ amount: data.bid.amount, seqNo: data.bid.seqNo, teamName: data.teamName, increment: data.increment }, ...prev].slice(0, 5));
    };
    const handleTimer = (data: { auctionId: string; remaining: number }) => { setTimer(data.remaining); };
    const handleEnded = (data: { auctionId: string; winner: any; winningBid: number | null }) => {
      setAuction((a) => (a ? { ...a, status: "completed" } : null));
      if (data.winner && data.winningBid) setWinner({ teamName: data.winner.teamName, bid: data.winningBid });
    };
    const handleCleared = () => {
      setAuction(null); setCurrentBid(0); setTimer(0); setLeadingTeam("");
      setWinner(null); setRecent([]); setAuctionCleared(true);
    };
    const handleManualTimer = (data: { duration: number; endAt: number | null; isRunning: boolean; timeLeft: number }) => {
      setManualTimer({ timeLeft: data.timeLeft, isRunning: data.isRunning, duration: data.duration });
    };

    const handleImageSet = (data: { imagePath: string }) => {
      setQuestionImage(data.imagePath);
    };

    const handleClearedImage = () => {
      setQuestionImage(null);
    };

    // Sound event handlers
    const handleSoundAuctionStarted = () => {
      soundManager.play("auction_start");
    };
    const handleSoundAuctionEnded = () => {
      soundManager.play("auction_end");
    };
    const handleSoundBidUpdated = (data: { teamName: string; bidAmount: number; increment: number }) => {
      soundManager.play(data.increment === 50 ? "bid_big" : "bid_small");
    };
    const handleSoundBidWon = (data: { teamName: string; bidAmount: number }) => {
      soundManager.play("bid_win");
    };
    const handleSoundTimerStarted = () => {
      soundManager.play("timer_start");
    };
    const handleSoundTimerStopped = () => {
      soundManager.play("timer_end");
    };
    const handleSoundTaskResult = (data: { result: "pass" | "fail" }) => {
      soundManager.play(data.result === "pass" ? "pass" : "fail");
    };

    const handleSoundSettings = (data: { enabled: boolean; volume: number }) => {
      soundManager.applySettings(data);
    };

    const handleSoundPerSetting = (data: { soundName: string; enabled: boolean }) => {
      soundManager.setPerSoundEnabled(data.soundName, data.enabled);
    };

    socket.on("auction:started", handleStarted);
    socket.on("auction:bid_update", handleBidUpdate);
    socket.on("auction:timer", handleTimer);
    socket.on("auction:ended", handleEnded);
    socket.on("auction:cleared", handleCleared);
    socket.on("timer:update", handleManualTimer);
    socket.on("question:image_set", handleImageSet);
    socket.on("auction:cleared", handleClearedImage);

    // Sound events
    socket.on("sound:auction_started", handleSoundAuctionStarted);
    socket.on("sound:auction_ended", handleSoundAuctionEnded);
    socket.on("sound:bid_updated", handleSoundBidUpdated);
    socket.on("sound:bid_won", handleSoundBidWon);
    socket.on("sound:timer_started", handleSoundTimerStarted);
    socket.on("sound:timer_stopped", handleSoundTimerStopped);
    socket.on("sound:task_result", handleSoundTaskResult);
    socket.on("sound:settings", handleSoundSettings);
    socket.on("sound:per_setting", handleSoundPerSetting);

    return () => {
      socket.off("auction:started", handleStarted);
      socket.off("auction:bid_update", handleBidUpdate);
      socket.off("auction:timer", handleTimer);
      socket.off("auction:ended", handleEnded);
      socket.off("auction:cleared", handleCleared);
      socket.off("timer:update", handleManualTimer);
      socket.off("question:image_set", handleImageSet);
      socket.off("auction:cleared", handleClearedImage);

      // Sound events
      socket.off("sound:auction_started", handleSoundAuctionStarted);
      socket.off("sound:auction_ended", handleSoundAuctionEnded);
      socket.off("sound:bid_updated", handleSoundBidUpdated);
      socket.off("sound:bid_won", handleSoundBidWon);
      socket.off("sound:timer_started", handleSoundTimerStarted);
      socket.off("sound:timer_stopped", handleSoundTimerStopped);
      socket.off("sound:task_result", handleSoundTaskResult);
      socket.off("sound:settings", handleSoundSettings);
      socket.off("sound:per_setting", handleSoundPerSetting);
    };
  }, [socket, connected]);

  const isActive = auction?.status === "active" && timer > 0;
  const aq = activeQuestion ?? (auction?.question
    ? { questionId: auction.questionId || "", question_text: auction.question, options: null as unknown[] | Record<string, unknown> | null, file_path: "", reward_points: auction.defaultReward ?? 1, time_limit: 300, template_html: undefined }
    : null);
  const nextBid = auction ? currentBid + auction.increment : 0;
  const showManualTimer = manualTimer.isRunning || manualTimer.timeLeft > 0;
  const showWaiting = !showManualTimer && !auction;
  const showTask = phase === "task" && task;

  return (
    <div style={root}>
      {/* ── Brand Header ── */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "8px" }}>
        <BrandHeader variant="live" />
      </div>

      {/* ── Top Bar ── */}
      <header style={topBar}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: "1 1 0" }}>
          <DifficultyBadge level={auction?.difficulty} />
          {isActive && (
            <span style={{
              fontFamily: F.body, fontSize: "0.75rem", fontWeight: 700,
              color: C.success, backgroundColor: C.successBg,
              padding: "4px 12px", borderRadius: tokens.radius.sm,
              letterSpacing: "0.1em",
            }}>● LIVE</span>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "center", flex: "1 1 0" }}>
          {isActive && <TimerBadge timeLeft={timer} />}
          {!isActive && (
            <div style={{
              fontFamily: F.heading, fontWeight: 700, fontSize: "1.1rem",
              color: C.navy, letterSpacing: "0.15em",
            }}>
              AUCTION ROUND
              {auction && <span style={{ color: C.muted, fontWeight: 500, marginLeft: "10px" }}>#{auction.seqNo}</span>}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "12px", flex: "1 1 0" }}>
          {!isActive && (
            <span style={{
              fontFamily: F.body, fontSize: "0.85rem", color: C.muted,
              fontWeight: 600,
            }}>{connected ? "Standby" : "Offline"}</span>
          )}
        </div>
      </header>

      {/* ── Task overlay ── */}
      {showTask && (
        <div style={stage}>
          <TaskStage task={task!} timeLeft={taskTimer} ended={taskEnded} paused={taskPaused} />
        </div>
      )}

      {/* ── Manual Timer + Image (combined) ── */}
      {showManualTimer && (
        <div style={stage}>
          <div style={{
            fontFamily: F.body, fontWeight: 600, fontSize: "1rem",
            color: C.muted, letterSpacing: "0.2em", textTransform: "uppercase",
            marginBottom: "12px",
          }}>
            {manualTimer.isRunning ? "COUNTDOWN" : "TIMER PAUSED"}
          </div>
          <div style={{
            fontFamily: F.heading, fontWeight: 800,
            fontSize: "clamp(6rem, 20vw, 16rem)",
            lineHeight: 0.9,
            color: manualTimer.isRunning
              ? manualTimer.timeLeft <= 10 ? C.red : manualTimer.timeLeft <= 30 ? C.gold : C.navy
              : C.muted,
            fontVariantNumeric: "tabular-nums",
            transition: "color 0.3s ease",
          }}>
            {formatClock(manualTimer.timeLeft)}
          </div>
          {questionImage && (
            <div style={{
              marginTop: "24px",
              backgroundColor: "#fff",
              border: `1px solid ${C.border}`,
              borderRadius: tokens.radius.xl,
              padding: "20px",
              maxWidth: "70%",
              maxHeight: "50vh",
              boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <img
                src={`${getServerBase()}/questions/${questionImage}`}
                alt="Question"
                style={{
                  maxWidth: "100%",
                  maxHeight: "45vh",
                  objectFit: "contain",
                  borderRadius: tokens.radius.md,
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Waiting / Standby (no timer running) ── */}
      {showWaiting && (
        <div style={stage}>
          {questionImage ? (
            <div style={{
              backgroundColor: "#fff",
              border: `1px solid ${C.border}`,
              borderRadius: tokens.radius.xl,
              padding: "24px",
              maxWidth: "85%",
              maxHeight: "80vh",
              boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              animation: "fadeScale 0.4s ease",
            }}>
              <img
                src={`${getServerBase()}/questions/${questionImage}`}
                alt="Question"
                style={{
                  maxWidth: "100%",
                  maxHeight: "75vh",
                  objectFit: "contain",
                  borderRadius: tokens.radius.md,
                }}
              />
            </div>
          ) : (
            <>
              <div style={{
                fontFamily: F.heading, fontWeight: 800,
                fontSize: "clamp(2.5rem, 6vw, 5rem)",
                color: C.navy, marginBottom: "8px",
              }}>Auction Quiz</div>
              <div style={{
                fontFamily: F.body, fontSize: "clamp(1.2rem, 2.5vw, 1.6rem)",
                color: C.muted,
              }}>{auctionCleared ? "No active auction" : "Waiting for question..."}</div>
            </>
          )}
          {upcomingQuestion && (
            <div style={{
              marginTop: "32px", width: "100%", maxWidth: "800px",
              backgroundColor: C.surface, border: `1px solid ${C.border}`,
              borderRadius: tokens.radius.xl, padding: "28px",
              animation: "fadeScale 0.4s ease",
            }}>
              <div style={{
                fontFamily: F.body, fontWeight: 700, fontSize: "0.8rem",
                color: C.muted, letterSpacing: "0.2em", textTransform: "uppercase",
                marginBottom: "14px",
              }}>NEXT UP</div>
              <QuestionView
                text={upcomingQuestion.question_text}
                template_html={upcomingQuestion.template_html}
                options={upcomingQuestion.options}
                reward={upcomingQuestion.reward_points}
                timeLimit={upcomingQuestion.time_limit}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Active Auction ── */}
      {isActive && (
        <div style={activeLayout}>
          {/* Left: Question or Image */}
          <div style={questionCol}>
            {questionImage ? (
              <div style={{
                backgroundColor: "#fff",
                border: `1px solid ${C.border}`,
                borderRadius: tokens.radius.xl,
                padding: "24px",
                maxWidth: "85%",
                maxHeight: "75vh",
                width: "100%",
                boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <img
                  src={`${getServerBase()}/questions/${questionImage}`}
                  alt="Question"
                  style={{
                    maxWidth: "100%",
                    maxHeight: "70vh",
                    objectFit: "contain",
                    borderRadius: tokens.radius.md,
                  }}
                />
              </div>
            ) : aq ? (
              <div style={{
                backgroundColor: C.surface, border: `1px solid ${C.border}`,
                borderRadius: tokens.radius.xl, padding: "28px",
                maxWidth: "80%", width: "100%",
                boxShadow: "0 4px 24px rgba(0,0,0,0.04)",
              }}>
                <QuestionView
                  text={aq.question_text}
                  template_html={(aq as any).template_html}
                  options={aq.options}
                  reward={aq.reward_points}
                  timeLimit={(aq as any).time_limit}
                  maxHeight="32vh"
                />
              </div>
            ) : null}
          </div>

          {/* Right: Bid + Feed */}
          <div style={bidCol}>
            <BidDisplay amount={currentBid} animate={bidFlash} increment={lastIncrement} />

            {leadingTeam && (
              <div style={{
                fontFamily: F.heading, fontWeight: 700,
                fontSize: "clamp(1.3rem, 3vw, 2rem)",
                color: C.primary, backgroundColor: C.primaryBg,
                border: `2px solid ${C.primary}`, borderRadius: tokens.radius.full,
                padding: "10px 36px", textAlign: "center",
                animation: "fadeScale 0.3s ease",
              }} key={leadingTeam}>
                {leadingTeam}
              </div>
            )}

            {auction && <NextBidPill current={currentBid} increment={auction.increment} />}

            <FeedList items={recent} />
          </div>
        </div>
      )}

      {/* ── Winner ── */}
      {winner && (
        <div style={stage}>
          <div style={{
            fontFamily: F.body, fontWeight: 700, fontSize: "1rem",
            color: C.gold, letterSpacing: "0.25em", textTransform: "uppercase",
            marginBottom: "12px",
          }}>WINNER</div>
          <div style={{
            fontFamily: F.heading, fontWeight: 800,
            fontSize: "clamp(3rem, 9vw, 6rem)",
            color: C.green, marginBottom: "12px",
            animation: "fadeScale 0.5s ease",
          }}>{winner.teamName}</div>
          <div style={{
            fontFamily: F.body, fontWeight: 600,
            fontSize: "clamp(1.2rem, 2.5vw, 1.8rem)",
            color: C.muted,
            fontVariantNumeric: "tabular-nums",
          }}>Winning Bid: <span style={{ color: C.gold, fontWeight: 700 }}>{winner.bid}</span></div>
        </div>
      )}

      {/* ── No Bids ── */}
      {!isActive && auction?.status === "completed" && !winner && (
        <div style={stage}>
          <div style={{
            fontFamily: F.heading, fontWeight: 700, fontSize: "2rem", color: C.muted,
          }}>Auction Ended — No Bids</div>
        </div>
      )}

      {/* ── Tagline ── */}
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

/* ─── Layout styles ─── */

const root: React.CSSProperties = {
  minHeight: "100vh", display: "flex", flexDirection: "column",
  backgroundColor: C.bg, color: C.text, fontFamily: F.body,
  userSelect: "none", padding: "clamp(16px, 3vw, 48px)",
};

const topBar: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  flexWrap: "wrap", gap: "12px", marginBottom: "clamp(16px, 3vw, 32px)",
};

const stage: React.CSSProperties = {
  flex: 1, display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", gap: "20px", width: "100%",
};

const activeLayout: React.CSSProperties = {
  flex: 1, display: "flex", alignItems: "flex-start",
  justifyContent: "center", gap: "clamp(32px, 5vw, 80px)",
  flexWrap: "wrap", width: "100%",
};

const questionCol: React.CSSProperties = {
  flex: "1 1 500px", display: "flex", justifyContent: "center",
  minWidth: "300px",
};

const bidCol: React.CSSProperties = {
  flex: "0 1 480px", display: "flex", flexDirection: "column",
  alignItems: "center", gap: "20px", minWidth: "280px",
};
