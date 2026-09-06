import { useEffect, useState } from "react";
import { getServerBase } from "../hooks/useSocket";
import { useGamePhase, formatClock } from "../hooks/useGamePhase";
import QuestionView from "../components/QuestionView";
import { colors, fontFamily, tabular } from "../theme";
import type { Auction, Bid, Question } from "../shared/types";

interface ScoreboardTeam {
  teamId: string;
  teamName: string;
  bid_coins: number;
  reward_points: number;
  totalBids: number;
}

export default function AdminScreen() {
  const { socket, connected, phase, task, taskTimer, taskEnded, taskPaused, lastResult } = useGamePhase();
  const [auction, setAuction] = useState<Auction | null>(null);
  const [currentBid, setCurrentBid] = useState<number>(0);
  const [leadingTeam, setLeadingTeam] = useState<string>("");
  const [timer, setTimer] = useState<number>(0);
  const [scoreboard, setScoreboard] = useState<ScoreboardTeam[]>([]);
  const [lastEvent, setLastEvent] = useState<string>("");
  const [adminKey, setAdminKey] = useState<string>(
    () => sessionStorage.getItem("adminKey") || ""
  );
  const [rewardInput, setRewardInput] = useState("1");
  const [bankFile, setBankFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<"append" | "overwrite">("append");
  const [pools, setPools] = useState<{ easy: Question[]; medium: Question[]; hard: Question[] }>({
    easy: [],
    medium: [],
    hard: [],
  });
  const [selectedQ, setSelectedQ] = useState<Question | null>(null);
  const [bankBusy, setBankBusy] = useState(false);
  const [selDifficulty, setSelDifficulty] = useState<"" | "easy" | "medium" | "hard">("");
  const [selQuestionId, setSelQuestionId] = useState("");
  const [selectArmed, setSelectArmed] = useState(false);

  // Pre-fill PASS reward from the round's default — editing stays optional.
  useEffect(() => {
    if (task) {
      setRewardInput(String(task.defaultReward ?? 1));
    }
  }, [task?.taskId]);
  const [failArmed, setFailArmed] = useState(false);
  const [taskPending, setTaskPending] = useState(false);
  const [undoLeft, setUndoLeft] = useState<number | null>(null);

  // UNDO is visible for 30s after a recorded (non-undone) verdict.
  useEffect(() => {
    if (lastResult && !lastResult.undone) {
      setUndoLeft(30);
      const id = setInterval(() => {
        setUndoLeft((v) => {
          if (v === null || v <= 1) {
            clearInterval(id);
            return 0;
          }
          return v - 1;
        });
      }, 1000);
      return () => clearInterval(id);
    }
    setUndoLeft(null);
  }, [lastResult]);

  // Fetch scoreboard
  const fetchScoreboard = () => {
    if (!socket || !connected) return;
    socket.emit("client:get_scoreboard", (res: any) => {
      setScoreboard(res.teams || []);
    });
  };

  const fetchPools = () => {
    if (!socket || !connected) return;
    socket.emit("admin:get_questions", (res: any) => {
      setPools({ easy: res.easy || [], medium: res.medium || [], hard: res.hard || [] });
      setSelectedQ(res.selected || null);
    });
  };

  // Two-step select: pick in dropdowns → arm → confirm.
  const selectQ = (id: string) => {
    if (!socket || bankBusy) return;
    setBankBusy(true);
    socket.emit("admin:select_question", { questionId: id }, (res: any) => {
      setBankBusy(false);
      setSelectArmed(false);
      if (res.success && res.question) {
        setSelectedQ(res.question);
        setSelQuestionId("");
        setLastEvent(`Selected (${res.question.difficulty}, ${res.question.reward_points} pts): ${res.question.question_text.slice(0, 60)}`);
        fetchPools();
      } else {
        setLastEvent(`Error: ${res.error || "selection failed"}`);
      }
    });
  };

  const visibleQs = selDifficulty ? pools[selDifficulty] : [];

  const importFile = async () => {
    if (!bankFile) {
      setLastEvent("Choose an .xlsx file first");
      return;
    }
    setBankBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", bankFile);
      const res = await fetch(`${getServerBase()}/api/questions/import?mode=${importMode}`, {
        method: "POST",
        headers: { "x-admin-key": adminKey },
        body: fd,
      });
      const data = await res.json();
      if (data.success) {
        const firstErr = data.errors?.length
          ? ` — e.g. row ${data.errors[0].row}: ${data.errors[0].reason}`
          : "";
        setLastEvent(`Imported ${data.imported}, skipped ${data.skipped}${firstErr}`);
        fetchPools();
      } else {
        setLastEvent(`Error: ${data.error || "import failed"}`);
      }
    } catch (err: any) {
      setLastEvent(`Error: ${err.message}`);
    }
    setBankBusy(false);
  };

  useEffect(() => {
    if (!socket || !connected) return;
    fetchScoreboard();
    fetchPools();
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
  }, [socket, connected]);

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
      fetchPools(); // selection was consumed — refresh pools + selected
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

    socket.on("auction:started", handleStarted);
    socket.on("auction:bid_update", handleBidUpdate);
    socket.on("auction:timer", handleTimer);
    socket.on("auction:ended", handleEnded);
    socket.on("task:result", handleScores);
    socket.on("scoreboard:updated", handleScores);

    return () => {
      socket.off("auction:started", handleStarted);
      socket.off("auction:bid_update", handleBidUpdate);
      socket.off("auction:timer", handleTimer);
      socket.off("auction:ended", handleEnded);
      socket.off("task:result", handleScores);
      socket.off("scoreboard:updated", handleScores);
    };
  }, [socket, connected]);

  const [startArmed, setStartArmed] = useState(false);

  const startAuction = async () => {
    try {
      sessionStorage.setItem("adminKey", adminKey);
      setStartArmed(false);
      const res = await fetch(`${getServerBase()}/api/auction/start`, {
        method: "POST",
        headers: { "x-admin-key": adminKey },
      });
      const data = await res.json();
      if (!data.success) {
        setLastEvent(
          res.status === 401 ? "Error: wrong admin key" : `Error: ${data.error}`
        );
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
    timerAction("admin:task_start", { taskId: task!.taskId }, () => "Timer started (5:00)");

  const doUndo = () => {
    if (!socket || taskPending || undoLeft === 0) return;
    setTaskPending(true);
    socket.emit("admin:undo", {}, (res: any) => {
      setTaskPending(false);
      if (res.success) {
        setLastEvent("Undone — balances restored");
      } else {
        setLastEvent(`Error: ${res.error || "undo failed"}`);
      }
    });
  };

  const isActive = auction?.status === "active" && timer > 0;
  const showUndo = lastResult && !lastResult.undone;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Admin Panel</h1>
        <span style={{ color: connected ? colors.green : colors.red }}>
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      <div style={styles.grid}>
        {/* Left: Controls + Timer */}
        <div style={styles.left}>
          <div style={{ ...styles.card, marginBottom: "1.5rem" }}>
            <h2 style={styles.cardTitle}>Question Bank</h2>
            <div style={styles.bankRow}>
              <input
                type="file"
                accept=".xlsx"
                onChange={(e) => setBankFile(e.target.files?.[0] || null)}
                disabled={bankBusy}
              />
              <select
                value={importMode}
                onChange={(e) => setImportMode(e.target.value as "append" | "overwrite")}
                style={styles.modeSelect}
                disabled={bankBusy}
                aria-label="Import mode"
              >
                <option value="append">Append</option>
                <option value="overwrite">Overwrite</option>
              </select>
              <button
                onClick={importFile}
                disabled={bankBusy || !bankFile}
                style={{
                  ...styles.importBtn,
                  opacity: bankBusy || !bankFile ? 0.5 : 1,
                  cursor: bankBusy || !bankFile ? "not-allowed" : "pointer",
                }}
              >
                Import
              </button>
            </div>
            {selectedQ ? (
              <div style={styles.selectedBox}>
                <div style={styles.selectedHead}>
                  <span>
                    Selected ({selectedQ.difficulty}, {selectedQ.reward_points} pts)
                  </span>
                </div>
                <QuestionView
                  text={selectedQ.question_text}
                  options={selectedQ.options}
                  reward={selectedQ.reward_points}
                  compact
                />
              </div>
            ) : (
              <div style={styles.empty}>No question selected — pick one below to start</div>
            )}
            {pools.easy.length + pools.medium.length + pools.hard.length === 0 && (
              <div style={styles.bankWarning}>
                Bank is empty — import an .xlsx file above to load questions.
              </div>
            )}
            <div style={styles.ddRow}>
              <div style={styles.ddField}>
                <div style={styles.ddLabel}>1. Difficulty</div>
                <select
                  value={selDifficulty}
                  onChange={(e) => {
                    setSelDifficulty(e.target.value as "" | "easy" | "medium" | "hard");
                    setSelQuestionId("");
                    setSelectArmed(false);
                  }}
                  disabled={bankBusy || phase !== "idle"}
                  style={styles.ddSelect}
                  aria-label="Select difficulty"
                >
                  <option value="">Select difficulty…</option>
                  <option value="easy">Easy ({pools.easy.length})</option>
                  <option value="medium">Medium ({pools.medium.length})</option>
                  <option value="hard">Hard ({pools.hard.length})</option>
                </select>
              </div>
              <div style={styles.ddField}>
                <div style={styles.ddLabel}>2. Question</div>
                <select
                  value={selQuestionId}
                  onChange={(e) => {
                    setSelQuestionId(e.target.value);
                    setSelectArmed(false);
                  }}
                  disabled={bankBusy || phase !== "idle" || !selDifficulty}
                  style={styles.ddSelect}
                  aria-label="Select question"
                >
                  <option value="">
                    {!selDifficulty ? "Pick a difficulty first…" : "Select question…"}
                  </option>
                  {visibleQs.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.question_text.slice(0, 60)}{q.question_text.length > 60 ? "…" : ""} [{q.reward_points} pts]
                    </option>
                  ))}
                </select>
                {selDifficulty && visibleQs.length === 0 && (
                  <div style={styles.ddEmpty}>No questions left in this category</div>
                )}
              </div>
            </div>
            {!selectArmed ? (
              <button
                onClick={() => setSelectArmed(true)}
                disabled={bankBusy || phase !== "idle" || !selQuestionId}
                style={{
                  ...styles.qSelectBtn,
                  width: "100%",
                  marginTop: "0.5rem",
                  opacity: bankBusy || phase !== "idle" || !selQuestionId ? 0.5 : 1,
                  cursor: bankBusy || phase !== "idle" || !selQuestionId ? "not-allowed" : "pointer",
                }}
              >
                Select Question
              </button>
            ) : (
              <div style={styles.confirmRow}>
                <span style={styles.confirmText}>
                  Lock in this question? It will be marked used.
                </span>
                <button
                  onClick={() => selectQ(selQuestionId)}
                  disabled={bankBusy}
                  style={styles.qConfirmBtn}
                >
                  Confirm Select
                </button>
                <button
                  onClick={() => setSelectArmed(false)}
                  disabled={bankBusy}
                  style={styles.cancelBtn}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Auction Control</h2>
            <input
              style={styles.keyInput}
              type="password"
              placeholder="Admin key"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
            />
            {!selectedQ && !isActive && (
              <div style={styles.startHint}>Select a question from the bank first</div>
            )}
            {!startArmed ? (
              <button
                onClick={() => {
                  if (!selectedQ) {
                    setLastEvent("Error: select a question from the bank first");
                    return;
                  }
                  setStartArmed(true);
                }}
                disabled={isActive}
                style={{
                  ...styles.startBtn,
                  opacity: isActive ? 0.5 : 1,
                  cursor: isActive ? "not-allowed" : "pointer",
                }}
              >
                {isActive ? "Auction in Progress" : "Start Auction"}
              </button>
            ) : (
              <div style={styles.confirmRow}>
                <span style={styles.confirmText}>
                  Start auction{selectedQ ? ` for "${selectedQ.question_text.slice(0, 60)}"` : ""}?
                </span>
                <button onClick={startAuction} disabled={isActive} style={styles.startBtn}>
                  Confirm Start
                </button>
                <button
                  onClick={() => setStartArmed(false)}
                  disabled={isActive}
                  style={styles.cancelBtn}
                >
                  Cancel
                </button>
              </div>
            )}

            {auction && (
              <div style={styles.auctionInfo}>
                <div style={styles.timerLarge}>{timer}</div>
                <div style={styles.bidSection}>
                  <span style={styles.bidLabel}>Current Bid</span>
                  <span style={styles.bidValue}>{currentBid}</span>
                </div>
                {leadingTeam && (
                  <div style={styles.leadingTeam}>Leading: {leadingTeam}</div>
                )}
              </div>
            )}

            {lastEvent && (
              <div style={styles.lastEvent}>{lastEvent}</div>
            )}
          </div>

          {/* Task Control Panel */}
          <div style={{ ...styles.card, marginTop: "1.5rem" }}>
            <h2 style={styles.cardTitle}>Task Control</h2>

            {phase === "task" && task ? (
              <div style={styles.taskInfo}>
                <div style={styles.taskTeam}>{task.teamName}</div>
                {task.question && <div style={styles.taskQuestion}>{task.question}</div>}
                <div style={styles.taskMeta}>
                  Final bid: {task.finalBid} · Default reward: {task.defaultReward ?? 1} pts
                </div>
                <div style={styles.taskTimer}>{formatClock(taskTimer)}</div>
                {taskEnded && (
                  <div style={styles.timeUpNote}>Time Up — verdict still allowed</div>
                )}
                <div style={styles.timerRow}>
                  {!taskPaused ? (
                    <button
                      onClick={pauseTimer}
                      disabled={taskPending || taskEnded}
                      style={{
                        ...styles.timerBtn,
                        opacity: taskPending || taskEnded ? 0.5 : 1,
                        cursor: taskPending || taskEnded ? "not-allowed" : "pointer",
                      }}
                    >
                      Pause
                    </button>
                  ) : (
                    <button
                      onClick={resumeTimer}
                      disabled={taskPending}
                      style={{
                        ...styles.timerBtn,
                        opacity: taskPending ? 0.5 : 1,
                        cursor: taskPending ? "not-allowed" : "pointer",
                      }}
                    >
                      Resume
                    </button>
                  )}
                  <button
                    onClick={addThirty}
                    disabled={taskPending}
                    style={{
                      ...styles.timerBtn,
                      opacity: taskPending ? 0.5 : 1,
                      cursor: taskPending ? "not-allowed" : "pointer",
                    }}
                  >
                    +30s
                  </button>
                  <button
                    onClick={startTimer}
                    disabled={taskPending}
                    style={{
                      ...styles.timerBtn,
                      opacity: taskPending ? 0.5 : 1,
                      cursor: taskPending ? "not-allowed" : "pointer",
                    }}
                  >
                    Start 5:00
                  </button>
                </div>
                {taskPaused && <div style={styles.pausedNote}>Timer paused</div>}
                <div style={styles.rewardRow}>
                  <input
                    style={styles.rewardInput}
                    type="number"
                    min={0}
                    max={10000}
                    value={rewardInput}
                    onChange={(e) => setRewardInput(e.target.value)}
                    disabled={taskPending}
                    aria-label="Reward points"
                  />
                  <button
                    onClick={submitPass}
                    disabled={taskPending}
                    style={{
                      ...styles.passBtn,
                      opacity: taskPending ? 0.5 : 1,
                      cursor: taskPending ? "not-allowed" : "pointer",
                    }}
                  >
                    PASS
                  </button>
                </div>
                {!failArmed ? (
                  <button
                    onClick={() => setFailArmed(true)}
                    disabled={taskPending}
                    style={{
                      ...styles.failBtn,
                      opacity: taskPending ? 0.5 : 1,
                      cursor: taskPending ? "not-allowed" : "pointer",
                    }}
                  >
                    FAIL
                  </button>
                ) : (
                  <div style={styles.confirmRow}>
                    <span style={styles.confirmText}>
                      Record FAIL for {task.teamName}? No points awarded
                      ({task.finalBid} coins were already paid at auction end).
                    </span>
                    <button
                      onClick={submitFail}
                      disabled={taskPending}
                      style={styles.failBtn}
                    >
                      Confirm FAIL
                    </button>
                    <button
                      onClick={() => setFailArmed(false)}
                      disabled={taskPending}
                      style={styles.cancelBtn}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ) : showUndo ? (
              <div style={styles.taskInfo}>
                <div style={styles.taskMeta}>
                  {lastResult!.result === "pass" ? "PASS" : "FAIL"} recorded
                  {lastResult!.result === "pass" && ` (+${lastResult!.rewardGranted} pts)`}
                  {lastResult!.result === "fail" && ` (−${lastResult!.coinsDeducted} coins)`}
                </div>
                <button
                  onClick={doUndo}
                  disabled={taskPending || undoLeft === 0}
                  style={{
                    ...styles.undoBtn,
                    opacity: taskPending || undoLeft === 0 ? 0.5 : 1,
                    cursor: taskPending || undoLeft === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  {undoLeft === 0 ? "UNDO expired" : `UNDO (${undoLeft ?? 30}s)`}
                </button>
              </div>
            ) : (
              <div style={styles.empty}>No active task</div>
            )}
          </div>
        </div>

        {/* Right: Scoreboard */}
        <div style={styles.right}>
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Scoreboard</h2>
            <div style={styles.scoreTable}>
              <div style={styles.tableHeader}>
                <span style={styles.colRank}>#</span>
                <span style={styles.colName}>Team</span>
                <span style={styles.colCoins}>Coins</span>
                <span style={styles.colPoints}>Points</span>
                <span style={styles.colBids}>Bids</span>
              </div>
              {scoreboard.map((t, i) => (
                <div key={t.teamId} style={{
                  ...styles.tableRow,
                  backgroundColor: i % 2 === 0 ? colors.surface : colors.bg,
                }}>
                  <span style={styles.colRank}>{i + 1}</span>
                  <span style={styles.colName}>{t.teamName}</span>
                  <span style={{ ...styles.colCoins, color: t.bid_coins < 200 ? colors.red : colors.gold }}>
                    {t.bid_coins}
                  </span>
                  <span style={{ ...styles.colPoints, color: colors.violet }}>
                    {t.reward_points}
                  </span>
                  <span style={{ ...styles.colBids, color: colors.muted }}>
                    {t.totalBids}
                  </span>
                </div>
              ))}
              {scoreboard.length === 0 && (
                <div style={styles.empty}>No teams registered yet</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    backgroundColor: colors.bg,
    color: colors.ink,
    fontFamily,
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
    color: colors.ink,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1.5fr",
    gap: "24px",
    maxWidth: "1200px",
  },
  left: {},
  right: {},
  card: {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.surfaceBorder}`,
    borderRadius: "1rem",
    padding: "1.5rem",
    height: "100%",
  },
  cardTitle: {
    fontSize: "1.125rem",
    fontWeight: "bold",
    marginBottom: "1rem",
    color: colors.ink,
  },
  keyInput: {
    width: "100%",
    padding: "0.75rem 1rem",
    borderRadius: "0.75rem",
    border: `1px solid ${colors.surfaceBorder}`,
    backgroundColor: colors.bg,
    color: colors.ink,
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
    color: colors.violet,
  },
  taskQuestion: {
    fontSize: "1.125rem",
    fontWeight: 600,
    color: colors.ink,
    textAlign: "center",
  },
  bankRow: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
    marginBottom: "0.75rem",
    fontSize: "0.875rem",
    color: colors.muted,
  },
  modeSelect: {
    padding: "0.5rem",
    borderRadius: "0.5rem",
    border: `1px solid ${colors.surfaceBorder}`,
    backgroundColor: colors.bg,
    color: colors.ink,
    fontSize: "0.875rem",
  },
  importBtn: {
    padding: "0.5rem 1rem",
    borderRadius: "0.5rem",
    border: "none",
    backgroundColor: colors.violet,
    color: colors.bg,
    fontSize: "0.875rem",
    fontWeight: "bold",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  selectedBox: {
    padding: "0.75rem",
    borderRadius: "0.5rem",
    backgroundColor: colors.bg,
    border: `1px solid ${colors.green}`,
    color: colors.ink,
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
    color: colors.muted,
  },
  ddSelect: {
    width: "100%",
    padding: "0.75rem",
    borderRadius: "0.75rem",
    border: `1px solid ${colors.surfaceBorder}`,
    backgroundColor: colors.bg,
    color: colors.ink,
    fontSize: "0.95rem",
    outline: "none",
    boxSizing: "border-box",
  },
  ddEmpty: {
    fontSize: "0.875rem",
    fontWeight: "bold",
    color: colors.red,
    marginTop: "0.25rem",
  },
  qSelectBtn: {
    padding: "0.375rem 0.75rem",
    borderRadius: "0.5rem",
    border: "none",
    backgroundColor: colors.green,
    color: colors.bg,
    fontSize: "0.875rem",
    fontWeight: "bold",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  qConfirmBtn: {
    padding: "0.375rem 0.75rem",
    borderRadius: "0.5rem",
    border: "none",
    backgroundColor: colors.gold,
    color: colors.bg,
    fontSize: "0.875rem",
    fontWeight: "bold",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  selectedHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.875rem",
    color: colors.muted,
    marginBottom: "0.5rem",
  },
  bankWarning: {
    padding: "0.75rem",
    borderRadius: "0.5rem",
    backgroundColor: colors.bg,
    border: `1px solid ${colors.red}`,
    color: colors.red,
    fontSize: "0.875rem",
    fontWeight: "bold",
    marginBottom: "0.5rem",
  },
  taskMeta: {
    fontSize: "1rem",
    color: colors.muted,
    fontVariantNumeric: "tabular-nums",
  },
  taskTimer: {
    fontSize: "3rem",
    fontWeight: 800,
    color: colors.ink,
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1,
  },
  timeUpNote: {
    fontSize: "1rem",
    fontWeight: "bold",
    color: colors.red,
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
    border: `1px solid ${colors.surfaceBorder}`,
    backgroundColor: colors.bg,
    color: colors.ink,
    fontSize: "0.95rem",
    fontWeight: "bold",
    cursor: "pointer",
    fontVariantNumeric: "tabular-nums",
  },
  pausedNote: {
    fontSize: "1rem",
    fontWeight: "bold",
    color: colors.gold,
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
    border: `1px solid ${colors.surfaceBorder}`,
    backgroundColor: colors.bg,
    color: colors.ink,
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
    backgroundColor: colors.green,
    color: colors.bg,
    fontSize: "1.125rem",
    fontWeight: "bold",
    cursor: "pointer",
  },
  failBtn: {
    width: "100%",
    padding: "0.75rem",
    borderRadius: "0.75rem",
    border: "none",
    backgroundColor: colors.red,
    color: colors.bg,
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
    color: colors.red,
    fontWeight: "bold",
  },
  cancelBtn: {
    width: "100%",
    padding: "0.5rem",
    borderRadius: "0.75rem",
    border: `1px solid ${colors.surfaceBorder}`,
    backgroundColor: "transparent",
    color: colors.muted,
    fontSize: "0.875rem",
    cursor: "pointer",
  },
  undoBtn: {
    width: "100%",
    padding: "0.75rem",
    borderRadius: "0.75rem",
    border: `2px solid ${colors.gold}`,
    backgroundColor: "transparent",
    color: colors.gold,
    fontSize: "1.125rem",
    fontWeight: "bold",
    cursor: "pointer",
    fontVariantNumeric: "tabular-nums",
  },
  startBtn: {
    width: "100%",
    padding: "1rem",
    borderRadius: "0.75rem",
    border: "none",
    backgroundColor: colors.green,
    color: colors.bg,
    fontSize: "1.125rem",
    fontWeight: "bold",
    cursor: "pointer",
  },
  startHint: {
    fontSize: "0.875rem",
    fontWeight: "bold",
    color: colors.gold,
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
    color: colors.muted,
  },
  bidValue: {
    ...tabular,
    fontSize: "2rem",
    fontWeight: "bold",
    color: colors.gold,
  },
  leadingTeam: {
    marginTop: "0.75rem",
    fontSize: "1rem",
    color: colors.violet,
  },
  lastEvent: {
    marginTop: "1rem",
    padding: "0.75rem",
    borderRadius: "0.5rem",
    backgroundColor: colors.bg,
    color: colors.muted,
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
    backgroundColor: colors.surfaceBorder,
    fontWeight: "bold",
    fontSize: "0.875rem",
    color: colors.muted,
  },
  tableRow: {
    display: "flex",
    padding: "0.625rem 1rem",
    fontSize: "0.875rem",
  },
  colRank: { width: "2rem", textAlign: "center", color: colors.muted },
  colName: { flex: 1 },
  colCoins: { ...tabular, width: "4rem", textAlign: "right" },
  colPoints: { ...tabular, width: "4rem", textAlign: "right" },
  colBids: { ...tabular, width: "3rem", textAlign: "right" },
  empty: {
    padding: "2rem",
    textAlign: "center",
    color: colors.muted,
  },
};
