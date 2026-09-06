import { useEffect, useState } from "react";
import { getServerBase } from "../hooks/useSocket";
import { useGamePhase } from "../hooks/useGamePhase";
import TaskStage from "../components/TaskStage";
import QuestionView from "../components/QuestionView";
import { colors, fontFamily, label, tabular } from "../theme";
import type { Auction, Bid } from "../shared/types";

interface RecentBid {
  amount: number;
  seqNo: number;
  teamName: string;
}

/**
 * DISPLAY 1 — Live Auction Screen (projector).
 * Center focus: giant current bid. Timer, leader, next-bid hint, last bids.
 */
export default function LiveAuctionScreen() {
  const { socket, connected, phase, task, taskTimer, taskEnded, taskPaused, upcomingQuestion, activeQuestion } = useGamePhase();
  const [auction, setAuction] = useState<Auction | null>(null);
  const [currentBid, setCurrentBid] = useState<number>(0);
  const [leadingTeam, setLeadingTeam] = useState<string>("");
  const [timer, setTimer] = useState<number>(0);
  const [winner, setWinner] = useState<{ teamName: string; bid: number } | null>(null);
  const [recent, setRecent] = useState<RecentBid[]>([]);
  // True once the server broadcasts auction:cleared — drives the
  // "No active auction" copy. Reset on every auction:started.
  const [auctionCleared, setAuctionCleared] = useState(false);

  // Restore live state after a refresh.
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
      })
      .catch(() => {});
    return () => {
      cancelled = true;
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
      setRecent([]);
      setAuctionCleared(false);
    };

    const handleBidUpdate = (data: { auctionId: string; bid: Bid; teamName: string }) => {
      setCurrentBid(data.bid.amount);
      setLeadingTeam(data.teamName);
      setRecent((prev) =>
        [
          { amount: data.bid.amount, seqNo: data.bid.seqNo, teamName: data.teamName },
          ...prev,
        ].slice(0, 5)
      );
    };

    const handleTimer = (data: { auctionId: string; remaining: number }) => {
      setTimer(data.remaining);
    };

    const handleEnded = (data: { auctionId: string; winner: any; winningBid: number | null }) => {
      setAuction((a) => (a ? { ...a, status: "completed" } : null));
      if (data.winner && data.winningBid) {
        setWinner({ teamName: data.winner.teamName, bid: data.winningBid });
      }
    };

    // auction:cleared wipes all auction display state (bid, leader,
    // timer, recent, winner banner) — task/question state untouched.
    const handleCleared = () => {
      setAuction(null);
      setCurrentBid(0);
      setTimer(0);
      setLeadingTeam("");
      setWinner(null);
      setRecent([]);
      setAuctionCleared(true);
    };

    socket.on("auction:started", handleStarted);
    socket.on("auction:bid_update", handleBidUpdate);
    socket.on("auction:timer", handleTimer);
    socket.on("auction:ended", handleEnded);
    socket.on("auction:cleared", handleCleared);

    return () => {
      socket.off("auction:started", handleStarted);
      socket.off("auction:bid_update", handleBidUpdate);
      socket.off("auction:timer", handleTimer);
      socket.off("auction:ended", handleEnded);
      socket.off("auction:cleared", handleCleared);
    };
  }, [socket, connected]);

  const isActive = auction?.status === "active" && timer > 0;

  // Round question never disappears during the auction: live event wins,
  // auction-row copy covers refreshes.
  const aq = activeQuestion ?? (auction?.question
    ? {
        question_text: auction.question,
        options: null as unknown[] | Record<string, unknown> | null,
        reward_points: auction.defaultReward ?? 1,
      }
    : null);
  const urgency = timer <= 10 ? "high" : timer <= 20 ? "mid" : "low";
  const timerColor = urgency === "high" ? colors.red : urgency === "mid" ? colors.gold : colors.green;
  const nextBid = auction ? currentBid + auction.increment : 0;

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.brand}>Auction Quiz</span>
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
        {phase === "task" && task ? (
          <TaskStage task={task} timeLeft={taskTimer} ended={taskEnded} paused={taskPaused} />
        ) : (
          <>
        {!auction && !winner && (
          <div style={styles.waiting}>
            <div style={styles.waitingIcon}>Auction</div>
            <div style={styles.waitingText}>{auctionCleared ? "No active auction" : "Waiting to start..."}</div>
            {upcomingQuestion && (
              <div style={styles.nextUp}>
                <div style={styles.nextUpLabel}>Next up</div>
                <QuestionView
                  text={upcomingQuestion.question_text}
                  options={upcomingQuestion.options}
                  reward={upcomingQuestion.reward_points}
                />
              </div>
            )}
          </div>
        )}

        {isActive && aq && (
          <div style={styles.qBand}>
            <QuestionView
              text={aq.question_text}
              options={aq.options}
              reward={aq.reward_points}
              maxHeight="24vh"
            />
          </div>
        )}

        {isActive && (
          <div style={styles.activeView}>
            <div style={styles.timerSection}>
              <div style={styles.timerLabel}>Time Left</div>
              <div
                style={{
                  ...styles.timerValue,
                  color: timerColor,
                  transform: urgency === "high" ? "scale(1.06)" : "scale(1)",
                }}
              >
                {timer}
              </div>
            </div>

            <div style={styles.bidSection}>
              <div style={styles.bidLabel}>Current Bid</div>
              <div key={currentBid} style={styles.bidValue}>
                {currentBid}
              </div>
              {leadingTeam && (
                <div key={leadingTeam} style={styles.leaderPill}>
                  {leadingTeam}
                </div>
              )}
              <div style={styles.nextHint}>
                Next bid: <strong>+{auction?.increment}</strong> → {nextBid}
              </div>
            </div>

            {recent.length > 0 && (
              <div style={styles.recentList}>
                {recent.map((b) => (
                  <div key={b.seqNo} style={styles.recentItem}>
                    <span style={styles.recentSeq}>#{b.seqNo}</span>
                    <span style={styles.recentTeam}>{b.teamName}</span>
                    <span style={styles.recentAmount}>{b.amount}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {winner && (
          <div style={styles.winnerView}>
            <div style={styles.winnerLabel}>Winner</div>
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
  brand: { color: colors.ink },
  liveBadge: { display: "flex", alignItems: "center", gap: "12px" },
  liveDot: { width: "16px", height: "16px", borderRadius: "50%" },
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
    alignItems: "center",
    justifyContent: "center",
    gap: "clamp(48px, 8vw, 120px)",
    flexWrap: "wrap",
    width: "100%",
  },
  timerSection: { textAlign: "center" },
  timerLabel: { ...label, fontSize: "1.5rem", marginBottom: "8px" },
  timerValue: {
    ...tabular,
    fontSize: "clamp(7rem, 20vw, 15rem)",
    fontWeight: 800,
    lineHeight: 0.9,
    transition: "transform 0.3s ease, color 0.3s ease",
  },
  bidSection: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "16px",
  },
  bidLabel: { ...label, fontSize: "1.5rem" },
  bidValue: {
    ...tabular,
    fontSize: "clamp(5rem, 14vw, 10rem)",
    fontWeight: 800,
    color: colors.gold,
    lineHeight: 1,
    animation: "bidPop 0.45s ease",
  },
  leaderPill: {
    fontSize: "clamp(1.5rem, 3.5vw, 2.5rem)",
    fontWeight: 700,
    color: colors.violet,
    backgroundColor: colors.surface,
    border: `2px solid ${colors.violet}`,
    borderRadius: "999px",
    padding: "12px 40px",
    boxShadow: "0 0 48px rgba(183,156,255,0.35)",
    animation: "fadeSlideIn 0.35s ease",
  },
  nextHint: {
    ...tabular,
    fontSize: "1.5rem",
    color: colors.muted,
  },
  recentList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    minWidth: "280px",
  },
  recentItem: {
    ...tabular,
    display: "flex",
    gap: "16px",
    alignItems: "baseline",
    fontSize: "1.25rem",
    color: colors.muted,
    backgroundColor: colors.surface,
    border: `1px solid ${colors.surfaceBorder}`,
    borderRadius: "0.5rem",
    padding: "8px 16px",
    animation: "fadeSlideIn 0.3s ease",
  },
  recentSeq: { color: colors.muted, minWidth: "3rem" },
  recentTeam: { flex: 1, color: colors.ink, fontWeight: 600 },
  recentAmount: { color: colors.gold, fontWeight: 700 },
  winnerView: { textAlign: "center" },
  winnerLabel: { ...label, fontSize: "2rem", color: colors.gold, marginBottom: "16px" },
  winnerName: {
    fontSize: "clamp(3rem, 9vw, 5.5rem)",
    fontWeight: 800,
    color: colors.green,
    marginBottom: "16px",
  },
  winnerBid: { ...tabular, fontSize: "clamp(1.5rem, 3.5vw, 2.25rem)", color: colors.gold },
  noBids: { fontSize: "2rem", color: colors.muted },
};
