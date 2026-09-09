import { useEffect, useState } from "react";
import { getServerBase } from "../hooks/useSocket";
import { useGamePhase } from "../hooks/useGamePhase";
import TaskStage from "../components/TaskStage";
import QuestionView from "../components/QuestionView";
import { BrandHeader } from "../components/BrandHeader";
import { colors, fontFamily, label, tabular } from "../theme";
import type { Auction, Bid } from "../shared/types";

interface ScoreboardTeam {
  teamId: string;
  teamName: string;
  bid_coins: number;
  reward_points: number;
  totalBids: number;
}

export default function DisplayScreen() {
  const { socket, connected, phase, task, taskTimer, taskEnded, taskPaused, upcomingQuestion, activeQuestion } = useGamePhase();
  // NOTE: No sound here — playback is Live Display ONLY.
  const [auction, setAuction] = useState<Auction | null>(null);
  const [currentBid, setCurrentBid] = useState<number>(0);
  const [leadingTeam, setLeadingTeam] = useState<string>("");
  const [timer, setTimer] = useState<number>(0);
  const [winner, setWinner] = useState<{ teamName: string; bid: number } | null>(null);
  const [leaders, setLeaders] = useState<ScoreboardTeam[]>([]);
  const [manualTimer, setManualTimer] = useState<{ timeLeft: number; isRunning: boolean; duration: number }>({ timeLeft: 0, isRunning: false, duration: 0 });

  // True once the server broadcasts auction:cleared — drives the
  // "No active auction" copy. Reset on every auction:started.
  const [auctionCleared, setAuctionCleared] = useState(false);

  // Restore live state after a refresh (display holds no team session),
  // plus a live top-5 leaderboard for the projector.
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
        } else if (s.lastResult?.teamName) {
          setWinner({ teamName: s.lastResult.teamName, bid: s.lastResult.bid ?? 0 });
        }
      })
      .catch(() => {});

    // Fetch manual timer state on page load
    fetch(`${getServerBase()}/api/timer`)
      .then((r) => r.json())
      .then((s: any) => {
        if (cancelled) return;
        setManualTimer({ timeLeft: s.isRunning ? (s.timeLeft ?? 0) : 0, isRunning: s.isRunning ?? false, duration: s.duration ?? 0 });
      })
      .catch(() => {});

    const refreshLeaders = () => {
      socket.emit("client:get_scoreboard", (res: any) => {
        if (!cancelled) setLeaders((res.teams || []).slice(0, 5));
      });
    };
    refreshLeaders();
    const id = setInterval(refreshLeaders, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [socket, connected]);

  useEffect(() => {
    if (!socket || !connected) return;

    const handleStarted = (a: Auction) => {
      setAuction(a);
      setCurrentBid(a.startBid);
      setTimer(a.duration);
      setLeadingTeam("");
      setWinner(null);
      setAuctionCleared(false);
    };

    const handleBidUpdate = (data: { auctionId: string; bid: Bid; teamName: string }) => {
      setCurrentBid(data.bid.amount);
      setLeadingTeam(data.teamName);
      socket.emit("client:get_scoreboard", (res: any) => {
        setLeaders((res.teams || []).slice(0, 5));
      });
    };

    const handleTimer = (data: { auctionId: string; remaining: number }) => {
      setTimer(data.remaining);
    };

    const handleEnded = (data: { auctionId?: string; winner: any; winningBid: number | null }) => {
      setAuction((a) => (a ? { ...a, status: "completed" } : null));
      if (data.winner && data.winningBid) {
        setWinner({ teamName: data.winner.teamName, bid: data.winningBid });
      }
      socket.emit("client:get_scoreboard", (res: any) => {
        setLeaders((res.teams || []).slice(0, 5));
      });
    };

    // auction:cleared wipes all auction display state (bid, leader,
    // timer, winner banner) — task/question/leaderboard state untouched.
    const handleCleared = () => {
      setAuction(null);
      setCurrentBid(0);
      setTimer(0);
      setLeadingTeam("");
      setWinner(null);
      setAuctionCleared(true);
    };

    socket.on("auction:started", handleStarted);
    socket.on("auction:bid_update", handleBidUpdate);
    socket.on("auction:timer", handleTimer);
    socket.on("auction:ended", handleEnded);
    socket.on("auction:cleared", handleCleared);

    const handleManualTimer = (data: any) => {
      setManualTimer({ timeLeft: data.isRunning ? (data.timeLeft ?? 0) : 0, isRunning: data.isRunning ?? false, duration: data.duration ?? 0 });
    };
    socket.on("manual_timer:update", handleManualTimer);

    return () => {
      socket.off("auction:started", handleStarted);
      socket.off("auction:bid_update", handleBidUpdate);
      socket.off("auction:timer", handleTimer);
      socket.off("auction:ended", handleEnded);
      socket.off("auction:cleared", handleCleared);
      socket.off("manual_timer:update", handleManualTimer);
    };
  }, [socket, connected]);

  const isActive = auction?.status === "active" && timer > 0;

  // Round question never disappears during the auction: live event wins,
  // auction-row copy covers refreshes.
  const aq = activeQuestion ?? (auction?.question
    ? {
        questionId: auction.questionId || "",
        question_text: auction.question,
        options: null as unknown[] | Record<string, unknown> | null,
        file_path: "",
        reward_points: auction.defaultReward ?? 1,
        time_limit: 300,
        template_html: undefined,
      }
    : null);

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <BrandHeader variant="compact" />
        <span>{auction ? `Auction #${auction.seqNo}` : "Standby"}</span>
        <span style={styles.liveBadge}>
          <span
            style={{
              ...styles.liveDot,
              backgroundColor: isActive ? colors.green : colors.muted,
            }}
          />
          {isActive ? "Live" : connected ? "Connected" : "Offline"}
        </span>
      </div>

      <div style={styles.stage}>
      {(phase === "main_task" || (phase as any) === "task") && task ? (
        <TaskStage task={task} timeLeft={taskTimer} ended={taskEnded} paused={taskPaused} />
      ) : (
      <>
      {!winner && manualTimer.isRunning && (
        <div style={styles.waiting}>
            <div style={styles.manualTimerSection}>
              <div style={styles.manualTimerLabel}>
                TIME REMAINING
              </div>
              <div style={{
                ...styles.manualTimerValue,
                color: manualTimer.isRunning
                  ? manualTimer.timeLeft <= 10 ? colors.red : manualTimer.timeLeft <= 30 ? colors.gold : colors.green
                  : colors.muted,
              }}>
                {manualTimer.timeLeft}
              </div>
            </div>
        </div>
      )}
      {!winner && !manualTimer.isRunning && !auction && (
        <div style={styles.waiting}>
          <div style={styles.waitingIcon}>Auction</div>
          <div style={styles.waitingText}>{auctionCleared ? "No active auction" : "Waiting to start..."}</div>
          {upcomingQuestion && (
            <div style={styles.nextUp}>
              <div style={styles.nextUpLabel}>Next up</div>
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

      {isActive && aq && (
        <div style={styles.qBand}>
          <QuestionView
            text={aq.question_text}
            template_html={(aq as any).template_html}
            options={aq.options}
            reward={aq.reward_points}
            timeLimit={(aq as any).time_limit}
            maxHeight="24vh"
          />
        </div>
      )}

      {isActive && (
        <div style={styles.activeView}>
          <div style={styles.timerSection}>
            <div style={styles.timerLabel}>TIME LEFT</div>
            <div style={{
              ...styles.timerValue,
              color: timer <= 10 ? colors.red : timer <= 20 ? colors.gold : colors.green,
            }}>
              {timer}
            </div>
          </div>

          <div style={styles.bidSection}>
            <div style={styles.bidLabel}>CURRENT BID</div>
            <div style={styles.bidValue}>{currentBid}</div>
          </div>

          {leadingTeam && (
            <div style={styles.leadingSection}>
              <div style={styles.leadingLabel}>LEADING TEAM</div>
              <div style={styles.leadingValue}>{leadingTeam}</div>
            </div>
          )}
        </div>
      )}

      {winner && (
        <div style={styles.winnerView}>
          <div style={styles.winnerLabel}>WINNER</div>
          <div style={styles.winnerName}>{winner.teamName}</div>
          <div style={styles.winnerBid}>Winning Bid: {winner.bid}</div>
        </div>
      )}

      {!isActive && auction?.status === "completed" && !winner && (
        <div style={styles.noBids}>Auction Ended - No Bids</div>
      )}
      </>
      )}
      </div>

      <div style={styles.boardBar}>
        {leaders.length === 0 ? (
          <span style={styles.boardEmpty}>No teams yet</span>
        ) : (
          leaders.map((t, i) => (
            <span key={t.teamId} style={styles.boardItem}>
              <span style={styles.boardRank}>{i + 1}</span>
              <span style={styles.boardName}>{t.teamName}</span>
              <span style={styles.boardPts}>{t.reward_points} pts</span>
              <span style={styles.boardCoins}>{t.bid_coins}</span>
            </span>
          ))
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: colors.bg,
    color: colors.ink,
    fontFamily,
    userSelect: "none",
    padding: "48px",
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: "1.25rem",
    fontWeight: 600,
    color: colors.muted,
    letterSpacing: "0.15em",
    textTransform: "uppercase",
  },
  brand: {
    color: colors.ink,
  },
  liveBadge: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  liveDot: {
    width: "16px",
    height: "16px",
    borderRadius: "50%",
  },
  stage: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "24px",
    width: "100%",
  },
  qBand: {
    width: "100%",
    maxWidth: "1100px",
  },
  waiting: {
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1.5rem",
    width: "100%",
  },
  nextUp: {
    width: "100%",
    maxWidth: "900px",
  },
  nextUpLabel: {
    fontSize: "1.1rem",
    fontWeight: 800,
    letterSpacing: "0.25em",
    textTransform: "uppercase",
    color: colors.muted,
    marginBottom: "0.75rem",
  },
  waitingIcon: {
    fontSize: "clamp(3rem, 8vw, 6rem)",
    fontWeight: 800,
    color: colors.ink,
    marginBottom: "24px",
  },
  waitingText: {
    fontSize: "clamp(1.5rem, 3vw, 2.25rem)",
    color: colors.muted,
  },
  activeView: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "64px",
  },
  timerSection: {
    textAlign: "center",
  },
  timerLabel: {
    ...label,
    fontSize: "1.25rem",
    marginBottom: "8px",
  },
  timerValue: {
    ...tabular,
    fontSize: "clamp(8rem, 26vw, 19rem)",
    fontWeight: 800,
    lineHeight: 0.9,
  },
  bidSection: {
    textAlign: "center",
  },
  bidLabel: {
    ...label,
    fontSize: "1.25rem",
    marginBottom: "8px",
  },
  bidValue: {
    ...tabular,
    fontSize: "clamp(3.5rem, 10vw, 6.5rem)",
    fontWeight: 800,
    color: colors.gold,
  },
  leadingSection: {
    textAlign: "center",
  },
  leadingLabel: {
    ...label,
    fontSize: "1.125rem",
    marginBottom: "12px",
  },
  leadingValue: {
    display: "inline-block",
    fontSize: "clamp(1.5rem, 4vw, 3rem)",
    fontWeight: 700,
    color: colors.violet,
    backgroundColor: colors.surface,
    border: `1px solid ${colors.surfaceBorder}`,
    borderRadius: "999px",
    padding: "16px 40px",
  },
  winnerView: {
    textAlign: "center",
  },
  winnerLabel: {
    ...label,
    fontSize: "2rem",
    color: colors.gold,
    marginBottom: "16px",
  },
  winnerName: {
    fontSize: "clamp(3rem, 9vw, 5.5rem)",
    fontWeight: 800,
    color: colors.green,
    marginBottom: "16px",
  },
  winnerBid: {
    ...tabular,
    fontSize: "clamp(1.5rem, 3.5vw, 2.25rem)",
    color: colors.gold,
  },
  noBids: {
    fontSize: "2rem",
    color: colors.muted,
  },
  boardBar: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: "16px 40px",
    paddingTop: "32px",
    borderTop: `1px solid ${colors.surfaceBorder}`,
  },
  boardEmpty: {
    fontSize: "1.25rem",
    color: colors.muted,
  },
  boardItem: {
    display: "flex",
    alignItems: "baseline",
    gap: "12px",
    fontSize: "1.25rem",
  },
  boardRank: {
    color: colors.muted,
    fontWeight: 700,
  },
  boardName: {
    color: colors.ink,
    fontWeight: 700,
  },
  boardPts: {
    color: colors.violet,
    fontWeight: 600,
  },
  boardCoins: {
    ...tabular,
    color: colors.gold,
    fontWeight: 600,
  },
  manualTimerSection: {
    textAlign: "center",
  },
  manualTimerLabel: {
    ...label,
    fontSize: "1.5rem",
    marginBottom: "12px",
  },
  manualTimerValue: {
    ...tabular,
    fontSize: "clamp(8rem, 26vw, 19rem)",
    fontWeight: 800,
    lineHeight: 0.9,
  },
};
