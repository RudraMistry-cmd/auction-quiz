import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useGamePhase } from "../hooks/useGamePhase";
import { BrandHeader } from "../components/BrandHeader";
import { tokens } from "../design-system";
import { listReorder } from "../utils/motion";

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

function Header({ status }: { status: "connected" | "reconnecting" | "disconnected" }) {
  const isConnected = status === "connected";
  const isReconnecting = status === "reconnecting";
  const badgeColor = isConnected ? C.success : isReconnecting ? C.warning : C.muted;
  const badgeLabel = isConnected ? "Live" : isReconnecting ? "Reconnecting..." : "Offline";

  return (
    <header style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      marginBottom: "clamp(24px, 4vw, 48px)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: "60px" }} />

      <div style={{ display: "flex", justifyContent: "center", flex: 1 }}>
        <BrandHeader variant="centered" subtitle="LEADERBOARD" style={{ marginBottom: 0 }} />
      </div>

      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        fontFamily: F.body, fontSize: "0.85rem", fontWeight: 600,
        color: badgeColor,
      }}>
        <span style={{
          width: "10px", height: "10px", borderRadius: "50%",
          backgroundColor: badgeColor,
          boxShadow: isConnected ? `0 0 8px ${C.success}` : isReconnecting ? `0 0 8px ${C.warning}` : "none",
          transition: `all ${tokens.transition.base}`,
        }} />
        {badgeLabel}
      </div>
    </header>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const medals: Record<number, {
    bg: string;
    fg: string;
    glow: string;
    size: string;
    fontSize: string;
    icon?: string;
  }> = {
    1: {
      bg: "linear-gradient(135deg, #F59E0B 0%, #D4AF37 50%, #B8860B 100%)",
      fg: "#FFFFFF",
      glow: "0 0 24px rgba(212,175,55,0.5), 0 0 48px rgba(212,175,55,0.2)",
      size: "72px",
      fontSize: "1.8rem",
      icon: "👑",
    },
    2: {
      bg: "linear-gradient(135deg, #E2E8F0 0%, #94A3B8 50%, #64748B 100%)",
      fg: "#FFFFFF",
      glow: "0 0 16px rgba(148,163,184,0.4)",
      size: "64px",
      fontSize: "1.5rem",
    },
    3: {
      bg: "linear-gradient(135deg, #FED7AA 0%, #CD7F32 50%, #A0522D 100%)",
      fg: "#FFFFFF",
      glow: "0 0 16px rgba(205,127,50,0.4)",
      size: "58px",
      fontSize: "1.35rem",
    },
  };

  const m = medals[rank];

  return (
    <div style={{
      width: m?.size ?? "48px",
      height: m?.size ?? "48px",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      backgroundColor: m?.bg ?? "transparent",
      color: m?.fg ?? C.muted,
      border: m ? "none" : `2px solid ${C.border}`,
      fontFamily: F.heading,
      fontWeight: 800,
      fontSize: m?.fontSize ?? "1rem",
      boxShadow: m?.glow ?? "none",
      transition: `all ${tokens.transition.slow}`,
      position: "relative",
    }}>
      {m?.icon && (
        <span style={{ fontSize: "0.9rem", marginBottom: "-2px" }}>{m.icon}</span>
      )}
      <span>{rank}</span>
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

  /* ─── Podium styling for top 3 ─── */
  const podiumStyles: Record<number, {
    border: string;
    bg: string;
    scale: number;
    padding: string;
    shadow: string;
    nameSize: string;
    pointsSize: string;
    coinsSize: string;
  }> = {
    1: {
      border: "transparent",
      bg: "linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 30%, #FDE68A 100%)",
      scale: 1.12,
      padding: "24px 32px",
      shadow: "0 8px 32px rgba(212,175,55,0.35), 0 0 0 3px #D4AF37, inset 0 1px 0 rgba(255,255,255,0.8)",
      nameSize: "clamp(1.8rem, 3.5vw, 2.8rem)",
      pointsSize: "clamp(2.2rem, 4vw, 3.4rem)",
      coinsSize: "1.4rem",
    },
    2: {
      border: "transparent",
      bg: "linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 50%, #CBD5E1 100%)",
      scale: 1.06,
      padding: "20px 28px",
      shadow: "0 6px 24px rgba(148,163,184,0.3), 0 0 0 2px #94A3B8, inset 0 1px 0 rgba(255,255,255,0.9)",
      nameSize: "clamp(1.5rem, 2.8vw, 2.2rem)",
      pointsSize: "clamp(1.8rem, 3.2vw, 2.8rem)",
      coinsSize: "1.2rem",
    },
    3: {
      border: "transparent",
      bg: "linear-gradient(135deg, #FFF7ED 0%, #FED7AA 50%, #FDBA74 100%)",
      scale: 1.02,
      padding: "18px 28px",
      shadow: "0 6px 20px rgba(205,127,50,0.25), 0 0 0 2px #CD7F32, inset 0 1px 0 rgba(255,255,255,0.7)",
      nameSize: "clamp(1.3rem, 2.5vw, 1.9rem)",
      pointsSize: "clamp(1.6rem, 2.8vw, 2.4rem)",
      coinsSize: "1.1rem",
    },
  };

  const isTop3 = rank <= 3;
  const podium = podiumStyles[rank];

  /* ─── Default row style (rank 4+) ─── */
  const defaultStyle = {
    border: `2px solid ${C.border}`,
    bg: rank % 2 === 0 ? C.surface : C.bg,
    scale: 1,
    padding: "16px 28px",
    shadow: tokens.shadow.sm,
    nameSize: "clamp(1.1rem, 2vw, 1.5rem)",
    pointsSize: "clamp(1.2rem, 2vw, 1.6rem)",
    coinsSize: "1rem",
  };

  const style = podium ?? defaultStyle;

  return (
    <motion.div
      layout
      layoutId={team.teamId}
      initial={{ opacity: 0, y: 8 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: style.scale,
      }}
      transition={listReorder}
      style={{
        display: "flex",
        alignItems: "center",
        padding: style.padding,
        borderRadius: isTop3 ? tokens.radius.xl : tokens.radius.lg,
        border: style.border,
        backgroundColor: style.bg,
        boxShadow: style.shadow,
        transformOrigin: "center left",
        ...(highlight ? { animation: "scoreFlash 0.8s ease" } : {}),
      }}
    >
      {/* Rank Badge */}
      <div style={{ width: isTop3 ? "72px" : "56px", flexShrink: 0 }}>
        <RankBadge rank={rank} />
      </div>

      {/* Rank change indicator */}
      <div style={{ width: "48px", flexShrink: 0, textAlign: "center" }}>
        {rankChanged && (
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            backgroundColor: movedUp ? `${C.success}20` : `${C.danger}20`,
            fontFamily: F.body, fontSize: "1rem", fontWeight: 800,
            color: movedUp ? C.success : C.danger,
          }}>
            {movedUp ? "▲" : "▼"}
          </span>
        )}
      </div>

      {/* Team name */}
      <div style={{
        flex: 1,
        fontFamily: F.heading,
        fontWeight: isTop3 ? 800 : 700,
        fontSize: style.nameSize,
        color: isTop3 ? C.text : C.textSecondary,
        paddingLeft: "12px",
        lineHeight: 1.2,
      }}>
        {team.teamName}
      </div>

      {/* Reward points */}
      <div style={{
        width: "140px",
        textAlign: "right",
        fontFamily: F.heading,
        fontWeight: 800,
        fontSize: style.pointsSize,
        color: isTop3 ? C.accent : C.primary,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1,
      }}>
        {team.reward_points}
        <span style={{
          fontFamily: F.body, fontSize: "0.6rem", fontWeight: 600,
          color: C.muted, marginLeft: "6px", letterSpacing: "0.12em",
          verticalAlign: "super",
        }}>PTS</span>
      </div>

      {/* Bid coins */}
      <div style={{
        width: "120px",
        textAlign: "right",
        fontFamily: F.heading,
        fontWeight: 700,
        fontSize: style.coinsSize,
        color: C.muted,
        fontVariantNumeric: "tabular-nums",
      }}>
        {team.bid_coins}
        <span style={{
          fontFamily: F.body, fontSize: "0.55rem", fontWeight: 600,
          color: C.muted, marginLeft: "4px", letterSpacing: "0.1em",
        }}>COINS</span>
      </div>
    </motion.div>
  );
}

/* ─── Main Screen ─── */
export default function ScoreboardScreen() {
  const { socket, connected, connectionStatus, scoreboard: phaseScoreboard } = useGamePhase();
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

  // Sync when phaseScoreboard is populated
  useEffect(() => {
    if (phaseScoreboard && phaseScoreboard.length > 0) {
      handleRefresh(phaseScoreboard as ScoreboardTeam[]);
    }
  }, [phaseScoreboard, handleRefresh]);

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

    const handleScoreUpdate = (data?: any) => {
      const list = data?.teams || data?.scoreboard;
      if (list && Array.isArray(list)) {
        handleRefresh(list);
      } else {
        refresh();
      }
    };

    const handleThemeChanged = (data: { theme: string }) => {
      document.documentElement.setAttribute("data-theme", data.theme);
      localStorage.setItem("theme", data.theme);
    };

    socket.on("auction:bid_update", () => refresh());
    socket.on("bid:update" as any, () => refresh());
    socket.on("auction:ended", () => refresh());
    socket.on("bid:win" as any, () => refresh());
    socket.on("task:result", handleScoreUpdate);
    socket.on("scoreboard:updated", handleScoreUpdate);
    socket.on("scoreboard:update" as any, handleScoreUpdate);
    socket.on("team:update" as any, () => refresh());
    socket.on("state:full" as any, (full: any) => {
      if (full?.scoreboard) handleRefresh(full.scoreboard);
    });
    socket.on("theme:changed", handleThemeChanged);

    return () => {
      cancelled = true;
      clearInterval(id);
      socket.off("auction:bid_update", () => refresh());
      socket.off("bid:update" as any, () => refresh());
      socket.off("auction:ended", () => refresh());
      socket.off("bid:win" as any, () => refresh());
      socket.off("task:result", handleScoreUpdate);
      socket.off("scoreboard:updated", handleScoreUpdate);
      socket.off("scoreboard:update" as any, handleScoreUpdate);
      socket.off("team:update" as any, () => refresh());
      socket.off("state:full" as any, (full: any) => {
        if (full?.scoreboard) handleRefresh(full.scoreboard);
      });
      socket.off("theme:changed", handleThemeChanged);
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
          50% { box-shadow: 0 0 32px 8px rgba(212,175,55,0.3); }
          100% { box-shadow: 0 0 0 0 rgba(212,175,55,0); }
        }
        @keyframes rankUp {
          0% { transform: scale(1) translateY(8px); opacity: 0.7; }
          50% { transform: scale(1.03) translateY(-4px); }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes rankDown {
          0% { transform: scale(1) translateY(-8px); opacity: 0.7; }
          50% { transform: scale(0.98) translateY(4px); }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes podiumShine {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>

      <Header status={connectionStatus} />

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
          <LayoutGroup>
            <div style={{
              display: "flex", flexDirection: "column", gap: "12px",
              width: "100%", maxWidth: "1000px",
            }}>
              {/* Column labels */}
              <div style={{
                display: "flex", alignItems: "center",
                padding: "0 32px 0 140px",
                marginBottom: "8px",
              }}>
                <div style={{ flex: 1, ...labelStyle }}>TEAM</div>
                <div style={{ width: "140px", textAlign: "right", ...labelStyle }}>POINTS</div>
                <div style={{ width: "120px", textAlign: "right", ...labelStyle }}>COINS</div>
              </div>

              <AnimatePresence mode="popLayout">
                {sorted.map((t, i) => (
                  <TeamRow
                    key={t.teamId}
                    team={t}
                    rank={i + 1}
                    prevRank={prevRanks[t.teamId] ?? 0}
                    highlight={flashIds.has(t.teamId)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </LayoutGroup>
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
