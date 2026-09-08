import { useEffect, useState, useRef, useCallback } from "react";
import { useGamePhase } from "../hooks/useGamePhase";
import { BrandHeader } from "../components/BrandHeader";
import { tokens, badge as badgeStyle, card as cardStyle, tabular } from "../design-system";

const C = tokens.color;
const F = tokens.font;

/* ─── Types ─── */
interface ScoreboardTeam {
  teamId: string;
  teamName: string;
  bid_coins: number;
  reward_points: number;
  totalBids: number;
}

/* ─── Sub-components ─── */

function Header({ connected }: { connected: boolean }) {
  return (
    <header style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      marginBottom: "clamp(24px, 4vw, 48px)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span style={{
          fontFamily: F.body, fontSize: "0.8rem", fontWeight: 700,
          color: C.muted, letterSpacing: "0.15em", textTransform: "uppercase",
        }}>Auction Quiz</span>
      </div>

      <div style={{ display: "flex", justifyContent: "center", flex: 1 }}>
        <BrandHeader variant="scoreboard" />
      </div>

      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        fontFamily: F.body, fontSize: "0.85rem", fontWeight: 600,
        color: connected ? C.success : C.muted,
      }}>
        <span style={{
          width: "10px", height: "10px", borderRadius: "50%",
          backgroundColor: connected ? C.success : C.muted,
          boxShadow: connected ? `0 0 8px ${C.success}` : "none",
          transition: `all ${tokens.transition.base}`,
        }} />
        {connected ? "Live" : "Offline"}
      </div>
    </header>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const medals: Record<number, { bg: string; fg: string; glow: string }> = {
    1: { bg: "#D4AF37", fg: "#FFFFFF", glow: "0 0 16px rgba(212,175,55,0.4)" },
    2: { bg: "#94A3B8", fg: "#FFFFFF", glow: "0 0 12px rgba(148,163,184,0.3)" },
    3: { bg: "#CD7F32", fg: "#FFFFFF", glow: "0 0 12px rgba(205,127,50,0.3)" },
  };
  const m = medals[rank];
  return (
    <div style={{
      width: rank <= 3 ? "56px" : "44px",
      height: rank <= 3 ? "56px" : "44px",
      borderRadius: "50%",
      display: "flex", alignItems: "center", justifyContent: "center",
      backgroundColor: m?.bg ?? "transparent",
      color: m?.fg ?? C.muted,
      border: m ? "none" : `2px solid ${C.border}`,
      fontFamily: F.heading,
      fontWeight: 800,
      fontSize: rank <= 3 ? "1.4rem" : "1.1rem",
      boxShadow: m?.glow ?? "none",
      transition: `all ${tokens.transition.slow}`,
    }}>
      {rank}
    </div>
  );
}

function TeamRow({
  team,
  rank,
  prevRank,
  highlight,
}: {
  team: ScoreboardTeam;
  rank: number;
  prevRank: number;
  highlight: boolean;
}) {
  const rankChanged = prevRank > 0 && prevRank !== rank;
  const movedUp = prevRank > rank;

  const podium: Record<number, { border: string; bg: string }> = {
    1: { border: "#D4AF37", bg: "linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)" },
    2: { border: "#94A3B8", bg: "linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)" },
    3: { border: "#CD7F32", bg: "linear-gradient(135deg, #FFF7ED 0%, #FEF3C7 100%)" },
  };
  const p = podium[rank];

  return (
    <div
      key={team.teamId}
      style={{
        display: "flex",
        alignItems: "center",
        padding: rank <= 3 ? "18px 28px" : "14px 28px",
        borderRadius: tokens.radius.lg,
        border: `2px solid ${p?.border ?? C.border}`,
        backgroundColor: p?.bg ?? C.surface,
        boxShadow: rank <= 3 ? tokens.shadow.md : tokens.shadow.xs,
        transition: `all 0.6s cubic-bezier(0.34,1.56,0.64,1)`,
        animation: highlight ? "scoreFlash 0.8s ease" : "none",
      }}
    >
      {/* Rank */}
      <div style={{ width: "64px", flexShrink: 0 }}>
        <RankBadge rank={rank} />
      </div>

      {/* Rank change indicator */}
      <div style={{ width: "40px", flexShrink: 0, textAlign: "center" }}>
        {rankChanged && (
          <span style={{
            fontFamily: F.body, fontSize: "0.9rem", fontWeight: 700,
            color: movedUp ? C.success : C.danger,
            opacity: 0.8,
          }}>
            {movedUp ? "▲" : "▼"}
          </span>
        )}
      </div>

      {/* Team name */}
      <div style={{
        flex: 1, fontFamily: F.heading,
        fontWeight: 700,
        fontSize: rank <= 3 ? "clamp(1.4rem, 2.5vw, 2rem)" : "clamp(1.1rem, 2vw, 1.5rem)",
        color: rank <= 3 ? C.text : C.textSecondary,
        paddingLeft: "8px",
      }}>
        {team.teamName}
      </div>

      {/* Reward points */}
      <div style={{
        width: "120px", textAlign: "right",
        fontFamily: F.heading, fontWeight: 800,
        fontSize: rank <= 3 ? "clamp(1.6rem, 3vw, 2.4rem)" : "clamp(1.2rem, 2vw, 1.6rem)",
        color: rank <= 3 ? C.accent : C.primary,
        fontVariantNumeric: "tabular-nums",
      }}>
        {team.reward_points}
        <span style={{
          fontFamily: F.body, fontSize: "0.65rem", fontWeight: 600,
          color: C.muted, marginLeft: "4px", letterSpacing: "0.1em",
        }}>PTS</span>
      </div>

      {/* Bid coins */}
      <div style={{
        width: "110px", textAlign: "right",
        fontFamily: F.heading, fontWeight: 700,
        fontSize: rank <= 3 ? "1.2rem" : "1rem",
        color: C.muted,
        fontVariantNumeric: "tabular-nums",
      }}>
        {team.bid_coins}
        <span style={{
          fontFamily: F.body, fontSize: "0.6rem", fontWeight: 600,
          color: C.muted, marginLeft: "4px", letterSpacing: "0.1em",
        }}>COINS</span>
      </div>
    </div>
  );
}

/* ─── Main Screen ─── */
export default function ScoreboardScreen() {
  const { socket, connected } = useGamePhase();
  const [teams, setTeams] = useState<ScoreboardTeam[]>([]);
  const [prevRanks, setPrevRanks] = useState<Record<string, number>>({});
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const prevTeams = useRef<ScoreboardTeam[]>([]);

  const handleRefresh = useCallback((teamList: ScoreboardTeam[]) => {
    // Detect score changes for flash animation
    const prevMap = new Map(prevTeams.current.map((t) => [t.teamId, t.reward_points]));
    const changed = new Set<string>();
    for (const t of teamList) {
      const prev = prevMap.get(t.teamId);
      if (prev !== undefined && prev !== t.reward_points) {
        changed.add(t.teamId);
      }
    }
    if (changed.size > 0) {
      setFlashIds(changed);
      setTimeout(() => setFlashIds(new Set()), 1000);
    }

    // Store previous ranks for animation
    const sorted = [...teamList].sort((a, b) => b.reward_points - a.reward_points || a.teamName.localeCompare(b.teamName));
    const rankMap: Record<string, number> = {};
    sorted.forEach((t, i) => { rankMap[t.teamId] = i + 1; });

    // Only update prevRanks if teams existed before
    if (prevTeams.current.length > 0) {
      const oldSorted = [...prevTeams.current].sort((a, b) => b.reward_points - a.reward_points || a.teamName.localeCompare(b.teamName));
      const oldRankMap: Record<string, number> = {};
      oldSorted.forEach((t, i) => { oldRankMap[t.teamId] = i + 1; });
      setPrevRanks(oldRankMap);
    }

    prevTeams.current = teamList;
    setTeams(teamList);
  }, []);

  useEffect(() => {
    if (!socket || !connected) return;
    let cancelled = false;

    const refresh = () => {
      socket.emit("client:get_scoreboard", (res: any) => {
        if (!cancelled && res.teams) handleRefresh(res.teams);
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
  }, [socket, connected, handleRefresh]);

  const sorted = [...teams].sort(
    (a, b) => b.reward_points - a.reward_points || a.teamName.localeCompare(b.teamName)
  );

  return (
    <div style={root}>
      <style>{`
        @keyframes scoreFlash {
          0% { box-shadow: 0 0 0 0 rgba(212,175,55,0.4); }
          50% { box-shadow: 0 0 24px 4px rgba(212,175,55,0.2); }
          100% { box-shadow: 0 0 0 0 rgba(212,175,55,0); }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <Header connected={connected} />

      <div style={stage}>
        {sorted.length === 0 ? (
          <div style={empty}>
            <div style={{
              fontFamily: F.heading, fontWeight: 800,
              fontSize: "clamp(2rem, 5vw, 4rem)",
              color: C.muted, marginBottom: "12px",
            }}>No Teams Yet</div>
            <div style={{
              fontFamily: F.body, fontSize: "1.1rem", color: C.muted,
            }}>Teams will appear here once they register</div>
          </div>
        ) : (
          <div style={{
            display: "flex", flexDirection: "column", gap: "10px",
            width: "100%", maxWidth: "960px",
          }}>
            {/* Column labels */}
            <div style={{
              display: "flex", alignItems: "center",
              padding: "0 28px 0 132px",
              marginBottom: "4px",
            }}>
              <div style={{ flex: 1, ...labelStyle }}>TEAM</div>
              <div style={{ width: "120px", textAlign: "right", ...labelStyle }}>POINTS</div>
              <div style={{ width: "110px", textAlign: "right", ...labelStyle }}>COINS</div>
            </div>

            {sorted.map((t, i) => (
              <TeamRow
                key={t.teamId}
                team={t}
                rank={i + 1}
                prevRank={prevRanks[t.teamId] ?? 0}
                highlight={flashIds.has(t.teamId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Layout styles ─── */
const root: React.CSSProperties = {
  minHeight: "100vh", display: "flex", flexDirection: "column",
  backgroundColor: C.bg, color: C.text, fontFamily: F.body,
  userSelect: "none", padding: "clamp(24px, 4vw, 56px)",
};

const stage: React.CSSProperties = {
  flex: 1, display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "flex-start", width: "100%",
};

const empty: React.CSSProperties = {
  display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center",
  flex: 1, width: "100%",
};

const labelStyle: React.CSSProperties = {
  fontFamily: F.body, fontWeight: 600, fontSize: "0.75rem",
  color: C.muted, letterSpacing: "0.18em", textTransform: "uppercase" as const,
};
