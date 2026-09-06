import { useEffect, useState } from "react";
import { useGamePhase } from "../hooks/useGamePhase";
import { colors, fontFamily, label, tabular } from "../theme";

/**
 * DISPLAY 2 — Scoreboard Screen (projector).
 * Full standings: rank + team + reward points (primary) + bid coins.
 * Top 3 highlighted gold / silver / bronze.
 */
interface ScoreboardTeam {
  teamId: string;
  teamName: string;
  bid_coins: number;
  reward_points: number;
  totalBids: number;
}

const MEDALS = [colors.gold, colors.silver, colors.bronze];

export default function ScoreboardScreen() {
  const { socket, connected } = useGamePhase();
  const [teams, setTeams] = useState<ScoreboardTeam[]>([]);

  useEffect(() => {
    if (!socket || !connected) return;
    let cancelled = false;

    const refresh = () => {
      socket.emit("client:get_scoreboard", (res: any) => {
        if (!cancelled) setTeams(res.teams || []);
      });
    };
    refresh();
    const id = setInterval(refresh, 5000);

    const handleBid = () => refresh();
    const handleEnded = () => refresh();
    const handleScores = () => refresh();
    socket.on("auction:bid_update", handleBid);
    socket.on("auction:ended", handleEnded);
    socket.on("task:result", handleScores);
    socket.on("scoreboard:updated", handleScores);

    return () => {
      cancelled = true;
      clearInterval(id);
      socket.off("auction:bid_update", handleBid);
      socket.off("auction:ended", handleEnded);
      socket.off("task:result", handleScores);
      socket.off("scoreboard:updated", handleScores);
    };
  }, [socket, connected]);

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.brand}>Auction Quiz</span>
        <span>Scoreboard</span>
        <span style={styles.liveBadge}>
          <span
            style={{
              ...styles.liveDot,
              backgroundColor: connected ? colors.green : colors.muted,
            }}
          />
          {connected ? "Live" : "Offline"}
        </span>
      </div>

      <div style={styles.stage}>
        {teams.length === 0 ? (
          <div style={styles.empty}>No teams yet</div>
        ) : (
          <div style={styles.table}>
            <div style={styles.headerRow}>
              <span style={styles.colRank}>#</span>
              <span style={styles.colName}>Team</span>
              <span style={styles.colPoints}>Points</span>
              <span style={styles.colCoins}>Coins</span>
            </div>
            {teams.map((t, i) => {
              const medal = i < 3 ? MEDALS[i] : null;
              return (
                <div
                  key={t.teamId}
                  style={{
                    ...styles.row,
                    borderColor: medal ?? colors.surfaceBorder,
                    backgroundColor: medal ? "#1B2440" : colors.surface,
                  }}
                >
                  <span style={styles.colRank}>
                    <span
                      style={{
                        ...styles.rankBadge,
                        backgroundColor: medal ?? "transparent",
                        border: `2px solid ${medal ?? colors.surfaceBorder}`,
                        color: medal ? colors.bg : colors.muted,
                      }}
                    >
                      {i + 1}
                    </span>
                  </span>
                  <span style={styles.colName}>{t.teamName}</span>
                  <span style={styles.colPoints}>{t.reward_points}</span>
                  <span style={styles.colCoins}>{t.bid_coins}</span>
                </div>
              );
            })}
          </div>
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
    marginBottom: "32px",
  },
  brand: { color: colors.ink },
  liveBadge: { display: "flex", alignItems: "center", gap: "12px" },
  liveDot: { width: "16px", height: "16px", borderRadius: "50%" },
  stage: {
    flex: 1,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
  },
  empty: { fontSize: "2rem", color: colors.muted, marginTop: "64px" },
  table: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    width: "100%",
    maxWidth: "900px",
  },
  headerRow: {
    ...label,
    display: "flex",
    alignItems: "center",
    padding: "0 24px",
    fontSize: "1.125rem",
  },
  row: {
    display: "flex",
    alignItems: "center",
    padding: "16px 24px",
    borderRadius: "1rem",
    border: "2px solid",
    transition: "background-color 0.4s ease, border-color 0.4s ease",
  },
  colRank: { width: "5rem" },
  rankBadge: {
    ...tabular,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    fontSize: "1.5rem",
    fontWeight: 800,
  },
  colName: {
    flex: 1,
    fontSize: "clamp(1.5rem, 3vw, 2.25rem)",
    fontWeight: 700,
  },
  colPoints: {
    ...tabular,
    width: "9rem",
    textAlign: "right",
    fontSize: "clamp(1.75rem, 3.5vw, 2.75rem)",
    fontWeight: 800,
    color: colors.gold,
  },
  colCoins: {
    ...tabular,
    width: "9rem",
    textAlign: "right",
    fontSize: "clamp(1.25rem, 2.5vw, 1.75rem)",
    fontWeight: 600,
    color: colors.muted,
  },
};
