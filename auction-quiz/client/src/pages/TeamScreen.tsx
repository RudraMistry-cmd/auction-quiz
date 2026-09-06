import { useEffect, useRef, useState } from "react";
import { useGamePhase, formatClock } from "../hooks/useGamePhase";
import QuestionView from "../components/QuestionView";
import { colors, fontFamily, tabular } from "../theme";
import type { Team, Auction, Bid, TaskResultEvent } from "../shared/types";

interface TeamScreenProps {
  sessionToken: string | null;
  onLogout: () => void;
}

export default function TeamScreen({ sessionToken, onLogout }: TeamScreenProps) {
  const { socket, connected, phase, task, taskTimer, taskEnded, taskPaused, upcomingQuestion, activeQuestion } = useGamePhase();
  const [team, setTeam] = useState<Team | null>(null);
  const [auction, setAuction] = useState<Auction | null>(null);
  const [currentBid, setCurrentBid] = useState<number>(0);
  const [timer, setTimer] = useState<number>(0);
  const [leadingTeam, setLeadingTeam] = useState<string>("");
  // True once the server broadcasts auction:cleared — drives the
  // "Waiting for next auction" copy. Reset on every auction:started.
  const [auctionCleared, setAuctionCleared] = useState(false);
  const [bidMessage, setBidMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [coins, setCoins] = useState<number>(1000);
  const [points, setPoints] = useState<number>(0);
  const [coinFlash, setCoinFlash] = useState(false);
  const [pointsFlash, setPointsFlash] = useState(false);

  // Brief color flash on balance changes (cleared on a timer).
  const flash = (setter: (v: boolean) => void) => {
    setter(true);
    setTimeout(() => setter(false), 1500);
  };

  const teamRef = useRef<Team | null>(null);
  teamRef.current = team;

  // Registration form
  const [form, setForm] = useState({
    teamName: "",
    player1: "",
    player2: "",
    phone: "",
    email: "",
  });

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

  // Listen for auction events
  useEffect(() => {
    if (!socket || !connected) return;

    const handleStarted = (a: Auction) => {
      setAuction(a);
      setCurrentBid(a.startBid);
      setTimer(a.duration);
      setLeadingTeam("");
      setBidMessage(null);
      setAuctionCleared(false);
    };

    // auction:cleared wipes bidding UI only — task/question state is
    // untouched, so a live task view keeps rendering.
    const handleCleared = () => {
      setAuction(null);
      setCurrentBid(0);
      setTimer(0);
      setLeadingTeam("");
      setBidMessage(null);
      setAuctionCleared(true);
    };

    const handleBidUpdate = (data: { auctionId: string; bid: Bid; teamName: string }) => {
      setCurrentBid(data.bid.amount);
      setLeadingTeam(data.teamName);
      if (data.bid.teamId === teamRef.current?.teamId) {
        // Coins are only deducted from the winner at auction end.
        setBidMessage({ type: "success", text: `Bid placed! ${data.bid.amount} coins` });
      } else {
        setBidMessage({ type: "error", text: `${data.teamName} bid ${data.bid.amount}` });
      }
      setTimeout(() => setBidMessage(null), 3000);
    };

    const handleTimer = (data: { auctionId: string; remaining: number }) => {
      setTimer(data.remaining);
    };

    const handleEnded = (data: { auctionId: string; winner: Team | null; winningBid: number | null }) => {
      setAuction((a) => (a ? { ...a, status: "completed" } : null));
      if (data.winner) {
        const isWinner = data.winner.teamId === teamRef.current?.teamId;
        // Mirror the server-side win payment instantly (same min math);
        // authoritative balances re-sync on task:result / reconnect.
        if (isWinner && data.winningBid) {
          setCoins((c) => Math.max(0, c - (data.winningBid ?? 0)));
          flash(setCoinFlash);
        }
        setBidMessage({
          type: isWinner ? "success" : "error",
          text: isWinner
            ? `You won with ${data.winningBid}! Task incoming…`
            : `${data.winner.teamName} won with ${data.winningBid}`,
        });
      } else {
        setBidMessage({ type: "error", text: "Auction ended with no bids" });
      }
    };

    // Task verdicts carry authoritative balances — apply them directly.
    const handleTaskResult = (data: TaskResultEvent) => {
      if (data.teamId !== teamRef.current?.teamId) return;
      setCoins(data.coins);
      setPoints(data.rewardPoints);
      if (data.undone) {
        setBidMessage({ type: "error", text: "Last result undone — balances restored" });
      } else if (data.result === "pass") {
        flash(setPointsFlash);
        setBidMessage({ type: "success", text: `Task passed! +${data.rewardGranted} points` });
      } else {
        setBidMessage({ type: "error", text: "Task failed. No points awarded." });
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

  // Register
  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket) return;

    socket.emit("client:register", form, (res: any) => {
      if (res.success && res.team && res.sessionToken) {
        setTeam(res.team);
        setCoins(res.team.bid_coins);
        setPoints(res.team.reward_points);
        localStorage.setItem("sessionToken", res.sessionToken);
        localStorage.setItem("teamId", res.team.teamId);
      } else {
        setBidMessage({ type: "error", text: res.error || "Registration failed" });
      }
    });
  };

  // Bid
  const handleBid = () => {
    if (!socket || !team || !auction || auction.status !== "active") return;

    socket.emit("client:place_bid", { teamId: team.teamId, auctionId: auction.auctionId }, (res: any) => {
      if (!res.success) {
        setBidMessage({ type: "error", text: res.error || "Bid failed" });
        setTimeout(() => setBidMessage(null), 3000);
      }
    });
  };

  // Enter to bid
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && team && auction?.status === "active" && timer > 0) {
        handleBid();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [team, auction, timer]);

  // Registration form
  if (!team) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Team Registration</h1>
          <form onSubmit={handleRegister} style={styles.form}>
            <input
              style={styles.input}
              placeholder="Team Name"
              value={form.teamName}
              onChange={(e) => setForm({ ...form, teamName: e.target.value })}
              required
            />
            <input
              style={styles.input}
              placeholder="Player 1"
              value={form.player1}
              onChange={(e) => setForm({ ...form, player1: e.target.value })}
              required
            />
            <input
              style={styles.input}
              placeholder="Player 2"
              value={form.player2}
              onChange={(e) => setForm({ ...form, player2: e.target.value })}
              required
            />
            <input
              style={styles.input}
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              required
            />
            <input
              style={styles.input}
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <button type="submit" style={styles.button}>
              Register
            </button>
          </form>
        </div>
      </div>
    );
  }

  const isActive = auction?.status === "active" && timer > 0;

  // Round question: live event wins, else the auction row's copy (refresh path).
  const aq = activeQuestion ?? (auction?.question
    ? {
        question_text: auction.question,
        options: null as unknown[] | Record<string, unknown> | null,
        reward_points: auction.defaultReward ?? 1,
      }
    : null);

  // TASK PHASE takes over the whole screen — never overlaps auction UI.
  if (team && phase === "task" && task) {
    const isWinner = task.teamId === team.teamId;
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.teamName}>{team.teamName}</span>
          <span style={{
            ...styles.coins,
            ...(coinFlash ? { color: colors.red, animation: "pulse 0.5s ease 3" } : null),
          }}>
            Coins: {coins}
          </span>
          <span style={{
            ...styles.points,
            ...(pointsFlash ? { color: colors.green, animation: "pulse 0.5s ease 3" } : null),
          }}>
            Score: {points}
          </span>
          <button onClick={onLogout} style={styles.logoutBtn}>Logout</button>
        </div>
        <div style={styles.taskView}>
          {isWinner ? (
            <>
              <div style={styles.taskHeadline}>You won the bid</div>
              {taskEnded ? (
                <div style={styles.timeUp}>Time Up</div>
              ) : (
                <>
                  <div style={styles.taskTimer}>{formatClock(taskTimer)}</div>
                  {taskPaused && <div style={styles.pausedNote}>Timer paused</div>}
                  <div style={styles.taskInstruction}>Solve the task</div>
                </>
              )}
            </>
          ) : (
            <>
              <div style={styles.taskHeadlineSmall}>
                <strong style={styles.taskTeam}>{task.teamName}</strong> is solving
              </div>
              {taskEnded ? (
                <div style={styles.timeUp}>Time Up</div>
              ) : (
                <>
                  <div style={styles.taskTimer}>{formatClock(taskTimer)}</div>
                  {taskPaused && <div style={styles.pausedNote}>Timer paused</div>}
                  <div style={styles.taskInstruction}>Hold tight for the verdict</div>
                </>
              )}
            </>
          )}
          <QuestionView text={task.question} options={task.options} reward={task.defaultReward ?? 1} />
          <div style={styles.taskMeta}>Final bid: {task.finalBid}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.teamName}>{team.teamName}</span>
        <span style={{
          ...styles.coins,
          ...(coinFlash ? { color: colors.red, animation: "pulse 0.5s ease 3" } : null),
        }}>
          Coins: {coins}
        </span>
        <span style={{
          ...styles.points,
          ...(pointsFlash ? { color: colors.green, animation: "pulse 0.5s ease 3" } : null),
        }}>
          Score: {points}
        </span>
        <button onClick={onLogout} style={styles.logoutBtn}>Logout</button>
      </div>

      {!auction && (
        <div style={styles.waiting}>
          <h2>{auctionCleared ? "Waiting for next auction" : "Waiting for auction to start..."}</h2>
          {upcomingQuestion && (
            <div style={styles.nextUp}>
              <div style={styles.nextUpLabel}>Next up</div>
              <QuestionView
                text={upcomingQuestion.question_text}
                options={upcomingQuestion.options}
                reward={upcomingQuestion.reward_points}
                compact
              />
            </div>
          )}
          <p>Connection: {connected ? "Connected" : "Disconnected"}</p>
        </div>
      )}

      {auction && (
        <div style={styles.auctionArea}>
          <div style={styles.timer}>
            {timer}
          </div>

          <div style={styles.bidDisplay}>
            <div style={styles.bidLabel}>Current Bid</div>
            <div style={styles.bidAmount}>{currentBid}</div>
          </div>

          {leadingTeam && (
            <div style={styles.leading}>
              Leading: <strong>{leadingTeam}</strong>
            </div>
          )}

          {aq && (
            <QuestionView text={aq.question_text} options={aq.options} reward={aq.reward_points} compact />
          )}

          {isActive && (
            <div style={styles.pressHint}>
              Press <strong>ENTER</strong> to Bid
            </div>
          )}

          {!isActive && auction.status === "completed" && (
            <div style={styles.ended}>Auction Ended</div>
          )}

          {bidMessage && (
            <div style={{
              ...styles.message,
              backgroundColor: bidMessage.type === "success" ? colors.green : colors.red,
              color: colors.bg
            }}>
              {bidMessage.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    color: colors.ink,
    fontFamily,
    padding: "1rem",
  },
  card: {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.surfaceBorder}`,
    borderRadius: "1rem",
    padding: "2rem",
    width: "100%",
    maxWidth: "400px",
    boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: "1.5rem",
    color: colors.gold,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  input: {
    padding: "0.75rem 1rem",
    borderRadius: "0.5rem",
    border: `1px solid ${colors.surfaceBorder}`,
    backgroundColor: colors.bg,
    color: colors.ink,
    fontSize: "1rem",
    outline: "none",
  },
  button: {
    padding: "0.75rem",
    borderRadius: "0.5rem",
    border: "none",
    backgroundColor: colors.gold,
    color: colors.bg,
    fontSize: "1rem",
    fontWeight: "bold",
    cursor: "pointer",
    marginTop: "0.5rem",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    maxWidth: "600px",
    marginBottom: "2rem",
    gap: "1rem",
  },
  teamName: {
    fontSize: "1.25rem",
    fontWeight: "bold",
    color: colors.gold,
  },
  coins: {
    ...tabular,
    fontSize: "1rem",
    color: colors.gold,
    fontWeight: "bold",
  },
  points: {
    ...tabular,
    fontSize: "1rem",
    color: colors.violet,
    fontWeight: "bold",
  },
  logoutBtn: {
    padding: "0.5rem 1rem",
    borderRadius: "0.5rem",
    border: `1px solid ${colors.surfaceBorder}`,
    backgroundColor: "transparent",
    color: colors.muted,
    cursor: "pointer",
    fontSize: "0.875rem",
  },
  waiting: {
    textAlign: "center",
    color: colors.muted,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1rem",
    width: "100%",
    maxWidth: "600px",
  },
  nextUp: {
    width: "100%",
  },
  nextUpLabel: {
    fontSize: "0.85rem",
    fontWeight: 800,
    letterSpacing: "0.25em",
    textTransform: "uppercase",
    color: colors.muted,
    marginBottom: "0.5rem",
  },
  auctionArea: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1.5rem",
    width: "100%",
    maxWidth: "600px",
  },
  timer: {
    ...tabular,
    fontSize: "5rem",
    fontWeight: 800,
    color: colors.ink,
    lineHeight: 1,
  },
  bidDisplay: {
    textAlign: "center",
  },
  bidLabel: {
    fontSize: "1rem",
    color: colors.muted,
    marginBottom: "0.25rem",
  },
  bidAmount: {
    ...tabular,
    fontSize: "3rem",
    fontWeight: 800,
    color: colors.gold,
  },
  leading: {
    fontSize: "1.125rem",
    color: colors.violet,
  },
  pressHint: {
    fontSize: "1.5rem",
    color: colors.green,
    animation: "pulse 1.5s ease-in-out infinite",
  },
  ended: {
    fontSize: "1.5rem",
    color: colors.red,
    fontWeight: "bold",
  },
  message: {
    padding: "0.75rem 1.5rem",
    borderRadius: "0.5rem",
    fontSize: "1.125rem",
    fontWeight: "bold",
    textAlign: "center",
    width: "100%",
  },
  taskView: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1.5rem",
    width: "100%",
    maxWidth: "600px",
    animation: "fadeSlideIn 0.35s ease",
  },
  taskHeadline: {
    fontSize: "clamp(2.5rem, 8vw, 4rem)",
    fontWeight: 800,
    color: colors.gold,
    textAlign: "center",
    textTransform: "uppercase",
  },
  taskHeadlineSmall: {
    fontSize: "clamp(1.5rem, 5vw, 2.25rem)",
    color: colors.muted,
    textAlign: "center",
  },
  taskTeam: {
    color: colors.violet,
  },
  taskTimer: {
    fontSize: "clamp(4rem, 15vw, 7rem)",
    fontWeight: 800,
    color: colors.ink,
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1,
  },
  taskInstruction: {
    fontSize: "1.5rem",
    color: colors.green,
    fontWeight: 600,
  },
  timeUp: {
    fontSize: "clamp(3rem, 10vw, 5rem)",
    fontWeight: 800,
    color: colors.red,
  },
  pausedNote: {
    fontSize: "1.25rem",
    fontWeight: "bold",
    color: colors.gold,
  },
  taskMeta: {
    fontSize: "1.125rem",
    color: colors.muted,
    fontVariantNumeric: "tabular-nums",
  },
};
