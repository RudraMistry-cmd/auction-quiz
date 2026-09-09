import { useEffect, useState, useRef, useCallback, useMemo, memo } from "react";
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

/* ─── Stable sort: POINTS desc → COINS desc → name ─── */
function sortTeams(list: ScoreboardTeam[]): ScoreboardTeam[] {
  return [...list].sort(
    (a, b) =>
      b.reward_points - a.reward_points ||
      b.bid_coins - a.bid_coins ||
      a.teamName.localeCompare(b.teamName)
  );
}

/* ─── Rank Badge (system colors only) ─── */
const RankBadge = memo(function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div style={{ position: "relative", width: "56px", height: "64px", flexShrink: 0 }}>
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: "-14px",
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: "1.25rem",
            lineHeight: 1,
          }}
        >
          👑
        </span>
        <div
          style={{
            width: "56px",
            height: "56px",
            marginTop: "8px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: C.accent,
            color: "#0F172A",
            fontFamily: F.heading,
            fontWeight: 800,
            fontSize: "1.4rem",
            boxShadow: `${tokens.shadow.gold}, ${tokens.shadow.md}`,
            transition: `all ${tokens.transition.slow}`,
          }}
        >
          1
        </div>
      </div>
    );
  }

  if (rank === 2) {
    return (
      <div
        style={{
          width: "50px",
          height: "50px",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: C.primary,
          color: "#FFFFFF",
          fontFamily: F.heading,
          fontWeight: 800,
          fontSize: "1.2rem",
          boxShadow: tokens.shadow.navy,
          flexShrink: 0,
          transition: `all ${tokens.transition.slow}`,
        }}
      >
        2
      </div>
    );
  }

  if (rank === 3) {
    return (
      <div
        style={{
          width: "46px",
          height: "46px",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: C.surface,
          color: C.primary,
          border: `2px solid ${C.accent}`,
          fontFamily: F.heading,
          fontWeight: 800,
          fontSize: "1.1rem",
          boxShadow: tokens.shadow.sm,
          flexShrink: 0,
          transition: `all ${tokens.transition.slow}`,
        }}
      >
        3
      </div>
    );
  }

  return (
    <div
      style={{
        width: "42px",
        height: "42px",
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "transparent",
        color: C.muted,
        border: `2px solid ${C.border}`,
        fontFamily: F.heading,
        fontWeight: 700,
        fontSize: "1rem",
        flexShrink: 0,
        transition: `all ${tokens.transition.slow}`,
      }}
    >
      {rank}
    </div>
  );
});

/* ─── Animated number (soft transition on points update) ─── */
const SoftNumber = memo(function SoftNumber({
  value,
  style,
}: {
  value: number;
  style: React.CSSProperties;
}) {
  return (
    <span style={{ display: "inline-block", overflow: "hidden", ...style }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ opacity: 0.3, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0.3, y: -6 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          style={{ display: "inline-block", fontVariantNumeric: "tabular-nums" }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
});

/* ─── Team Row ─── */
const TeamRow = memo(function TeamRow({
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

  const isFirst = rank === 1;
  const isSecond = rank === 2;
  const isThird = rank === 3;

  const cardStyle: React.CSSProperties = isFirst
    ? {
        border: `2px solid ${C.accent}`,
        boxShadow: `${tokens.shadow.gold}, ${tokens.shadow.md}`,
        padding: "20px 28px",
        borderRadius: tokens.radius.xl,
      }
    : isSecond
      ? {
          border: `1.5px solid ${C.accent}`,
          boxShadow: tokens.shadow.md,
          padding: "17px 28px",
          borderRadius: tokens.radius.xl,
        }
      : isThird
        ? {
            border: `1.5px solid ${C.border}`,
            boxShadow: tokens.shadow.sm,
            padding: "16px 28px",
            borderRadius: tokens.radius.lg,
          }
        : {
            border: `1px solid ${C.border}`,
            boxShadow: tokens.shadow.sm,
            padding: "15px 28px",
            borderRadius: tokens.radius.lg,
          };

  const scale = isFirst ? 1.04 : isSecond ? 1.02 : isThird ? 1.01 : 1;
  const nameSize = isFirst
    ? "clamp(1.5rem, 2.8vw, 2.2rem)"
    : isSecond
      ? "clamp(1.35rem, 2.5vw, 1.9rem)"
      : "clamp(1.15rem, 2.1vw, 1.55rem)";
  const pointsSize = isFirst
    ? "clamp(1.9rem, 3.4vw, 2.8rem)"
    : isSecond
      ? "clamp(1.65rem, 3vw, 2.4rem)"
      : "clamp(1.35rem, 2.4vw, 1.8rem)";

  return (
    <motion.div
      layout
      layoutId={team.teamId}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, scale }}
      transition={listReorder}
      style={{
        display: "flex",
        alignItems: "center",
        backgroundColor: C.surface,
        transformOrigin: "center",
        minWidth: 0,
        ...cardStyle,
        ...(highlight ? { animation: "scoreSoftGlow 0.8s ease" } : {}),
        ...(rankChanged && movedUp ? { animation: "rankNudgeUp 0.45s ease" } : {}),
        ...(rankChanged && !movedUp ? { animation: "rankNudgeDown 0.45s ease" } : {}),
      }}
    >
      {/* LEFT: Rank badge */}
      <div
        style={{
          width: isFirst ? "64px" : "56px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <RankBadge rank={rank} />
      </div>

      {/* Rank movement indicator (subtle, fixed width to prevent shift) */}
      <div style={{ width: "36px", flexShrink: 0, textAlign: "center" }}>
        {rankChanged && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "26px",
              height: "26px",
              borderRadius: "50%",
              backgroundColor: movedUp ? `${C.success}18` : `${C.danger}14`,
              fontFamily: F.body,
              fontSize: "0.8rem",
              fontWeight: 800,
              color: movedUp ? C.success : C.danger,
            }}
          >
            {movedUp ? "▲" : "▼"}
          </span>
        )}
      </div>

      {/* LEFT: Team name (large, bold) */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: F.heading,
          fontWeight: isFirst ? 800 : 700,
          fontSize: nameSize,
          color: isFirst || isSecond ? C.text : C.textSecondary,
          paddingLeft: "8px",
          paddingRight: "16px",
          lineHeight: 1.2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={team.teamName}
      >
        {team.teamName}
      </div>

      {/* RIGHT: Points (primary) */}
      <div
        style={{
          width: "150px",
          textAlign: "right",
          flexShrink: 0,
          fontFamily: F.heading,
          fontWeight: 800,
          fontSize: pointsSize,
          color: isFirst ? C.accent : C.primary,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        <SoftNumber
          value={team.reward_points}
          style={{
            fontFamily: F.heading,
            fontWeight: 800,
            fontSize: pointsSize,
            color: isFirst ? C.accent : C.primary,
          }}
        />
        <span
          style={{
            fontFamily: F.body,
            fontSize: "0.62rem",
            fontWeight: 600,
            color: C.muted,
            marginLeft: "6px",
            letterSpacing: "0.12em",
            verticalAlign: "super",
          }}
        >
          PTS
        </span>
      </div>

      {/* RIGHT: Coins (secondary) */}
      <div
        style={{
          width: "120px",
          textAlign: "right",
          flexShrink: 0,
          fontFamily: F.heading,
          fontWeight: 700,
          fontSize: isFirst ? "1.25rem" : "1.05rem",
          color: C.muted,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <SoftNumber
          value={team.bid_coins}
          style={{
            fontFamily: F.heading,
            fontWeight: 700,
            fontSize: isFirst ? "1.25rem" : "1.05rem",
            color: C.muted,
          }}
        />
        <span
          style={{
            fontFamily: F.body,
            fontSize: "0.58rem",
            fontWeight: 600,
            color: C.muted,
            marginLeft: "4px",
            letterSpacing: "0.1em",
          }}
        >
          COINS
        </span>
      </div>
    </motion.div>
  );
});

/* ─── Main Screen ─── */
export default function ScoreboardScreen() {
  const { socket, connected, scoreboard: phaseScoreboard } = useGamePhase();
  // NOTE: No sound here — playback is Live Display ONLY.
  const [teams, setTeams] = useState<ScoreboardTeam[]>([]);
  const [prevRanks, setPrevRanks] = useState<Record<string, number>>({});
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const prevTeams = useRef<ScoreboardTeam[]>([]);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRefresh = useCallback((teamList: ScoreboardTeam[]) => {
    // Detect point/coin changes for soft highlight
    const prevMap = new Map(prevTeams.current.map((t) => [t.teamId, t]));
    const changed = new Set<string>();
    for (const t of teamList) {
      const prev = prevMap.get(t.teamId);
      if (
        prev !== undefined &&
        (prev.reward_points !== t.reward_points || prev.bid_coins !== t.bid_coins)
      ) {
        changed.add(t.teamId);
      }
    }
    if (changed.size > 0) {
      setFlashIds(changed);
      if (flashTimeout.current) clearTimeout(flashTimeout.current);
      flashTimeout.current = setTimeout(() => setFlashIds(new Set()), 900);
    }

    // Store previous ranks for movement indicators (stable sort)
    if (prevTeams.current.length > 0) {
      const oldRankMap: Record<string, number> = {};
      sortTeams(prevTeams.current).forEach((t, i) => {
        oldRankMap[t.teamId] = i + 1;
      });
      setPrevRanks(oldRankMap);
    }

    prevTeams.current = teamList;
    setTeams((prev) => {
      // Prevent flicker: skip update if payload is identical
      if (
        prev.length === teamList.length &&
        prev.every(
          (t, i) =>
            t.teamId === teamList[i]?.teamId &&
            t.reward_points === teamList[i]?.reward_points &&
            t.bid_coins === teamList[i]?.bid_coins
        )
      ) {
        return prev;
      }
      return teamList;
    });
  }, []);

  // Sync when phaseScoreboard is populated (socket-driven, no manual refresh)
  useEffect(() => {
    if (phaseScoreboard && phaseScoreboard.length > 0) {
      handleRefresh(phaseScoreboard as ScoreboardTeam[]);
    }
  }, [phaseScoreboard, handleRefresh]);

  useEffect(() => {
    return () => {
      if (flashTimeout.current) clearTimeout(flashTimeout.current);
    };
  }, []);

  useEffect(() => {
    if (!socket || !connected) return;
    let cancelled = false;

    const refresh = () => {
      socket.emit("client:get_scoreboard", (res: any) => {
        if (!cancelled && res?.teams) handleRefresh(res.teams);
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
    const handleFull = (full: any) => {
      if (full?.scoreboard) handleRefresh(full.scoreboard);
    };
    const handleThemeChanged = (data: { theme: string }) => {
      document.documentElement.setAttribute("data-theme", data.theme);
      localStorage.setItem("theme", data.theme);
    };

    socket.on("auction:bid_update", refresh);
    socket.on("bid:update" as any, refresh);
    socket.on("auction:ended", refresh);
    socket.on("bid:win" as any, refresh);
    socket.on("task:result", handleScoreUpdate);
    socket.on("scoreboard:updated", handleScoreUpdate);
    socket.on("scoreboard:update" as any, handleScoreUpdate);
    socket.on("team:update" as any, refresh);
    socket.on("state:full" as any, handleFull);
    socket.on("theme:changed", handleThemeChanged);

    return () => {
      cancelled = true;
      clearInterval(id);
      socket.off("auction:bid_update", refresh);
      socket.off("bid:update" as any, refresh);
      socket.off("auction:ended", refresh);
      socket.off("bid:win" as any, refresh);
      socket.off("task:result", handleScoreUpdate);
      socket.off("scoreboard:updated", handleScoreUpdate);
      socket.off("scoreboard:update" as any, handleScoreUpdate);
      socket.off("team:update" as any, refresh);
      socket.off("state:full" as any, handleFull);
      socket.off("theme:changed", handleThemeChanged);
    };
  }, [socket, connected, handleRefresh]);

  // Top 5 only — stable memo to avoid unnecessary re-renders
  const topFive = useMemo(() => sortTeams(teams).slice(0, 5), [teams]);

  return (
    <div style={root}>
      <style>{`
        @keyframes scoreSoftGlow {
          0% { box-shadow: 0 0 0 0 rgba(212,175,55,0.35); }
          50% { box-shadow: 0 0 24px 4px rgba(212,175,55,0.22); }
          100% { box-shadow: 0 0 0 0 rgba(212,175,55,0); }
        }
        @keyframes rankNudgeUp {
          0% { transform: translateY(10px); opacity: 0.75; }
          50% { transform: translateY(-3px); }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes rankNudgeDown {
          0% { transform: translateY(-10px); opacity: 0.75; }
          50% { transform: translateY(3px); }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ─── 1. GLOBAL HEADER (identical structure/height to Team + Live screens) ─── */}
      <header style={headerStyle}>
        {/* Left: reserved spacer for symmetry */}
        <div style={{ flex: 1, display: "flex", alignItems: "center" }} />
        {/* Center: Event logo + BID FOR C */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <BrandHeader variant="compact" style={{ marginBottom: 0 }} />
        </div>
        {/* Right: intentionally empty — no timer, no extra controls */}
        <div style={{ flex: 1 }} />
      </header>

      {/* ─── 2. FULL-WIDTH CENTERED STAGE ─── */}
      <div style={stage}>
        {/* ─── 3. TITLE BLOCK ─── */}
        <div style={titleBlock}>
          <h1 style={titleStyle}>LEADERBOARD</h1>
          <p style={subtitleStyle}>Top Performing Teams</p>
          <div style={accentRule} />
        </div>

        {topFive.length === 0 ? (
          <div style={empty}>
            <div style={emptyText}>Waiting for results...</div>
          </div>
        ) : (
          <LayoutGroup>
            <div style={listWrap}>
              {/* Column labels */}
              <div style={labelRow}>
                <div style={{ flex: 1, ...labelStyle }}>TEAM</div>
                <div style={{ width: "150px", textAlign: "right", ...labelStyle }}>POINTS</div>
                <div style={{ width: "120px", textAlign: "right", ...labelStyle }}>COINS</div>
              </div>

              <AnimatePresence mode="popLayout" initial={false}>
                {topFive.map((t, i) => (
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

/* ─── Layout styles (match Team / Live header exactly) ─── */
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

const stage: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "flex-start",
  width: "100%",
  overflow: "hidden",
  padding: "clamp(16px, 3vh, 32px) clamp(20px, 4vw, 56px)",
  boxSizing: "border-box",
};

const titleBlock: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  marginBottom: "clamp(18px, 3.5vh, 32px)",
  marginTop: "clamp(8px, 2vh, 20px)",
  animation: "fadeSlideUp 0.4s ease",
};

const titleStyle: React.CSSProperties = {
  fontFamily: F.heading,
  fontWeight: 800,
  fontSize: "clamp(1.9rem, 4vw, 3rem)",
  letterSpacing: "0.1em",
  color: C.primary,
  margin: 0,
  lineHeight: 1.1,
};

const subtitleStyle: React.CSSProperties = {
  fontFamily: F.body,
  fontSize: "clamp(0.85rem, 1.4vw, 1.05rem)",
  fontWeight: 500,
  color: C.muted,
  letterSpacing: "0.06em",
  margin: "8px 0 0 0",
};

const accentRule: React.CSSProperties = {
  width: "64px",
  height: "4px",
  borderRadius: tokens.radius.full,
  backgroundColor: C.accent,
  marginTop: "14px",
};

const listWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  width: "100%",
  maxWidth: "960px",
};

const labelRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "0 28px 0 108px",
  marginBottom: "2px",
};

const empty: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  flex: 1,
  width: "100%",
};

const emptyText: React.CSSProperties = {
  fontFamily: F.body,
  fontWeight: 500,
  fontSize: "clamp(1.1rem, 2vw, 1.4rem)",
  color: C.muted,
  letterSpacing: "0.02em",
  animation: "fadeSlideUp 0.4s ease",
};

const labelStyle: React.CSSProperties = {
  fontFamily: F.body,
  fontWeight: 600,
  fontSize: "0.75rem",
  color: C.muted,
  letterSpacing: "0.18em",
  textTransform: "uppercase" as const,
};
