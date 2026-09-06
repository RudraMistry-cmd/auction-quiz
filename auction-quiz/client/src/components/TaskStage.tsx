import { colors, fontFamily, label, tabular } from "../theme";
import { formatClock } from "../hooks/useGamePhase";
import QuestionView from "./QuestionView";
import type { Task } from "../shared/types";

interface TaskStageProps {
  task: Task;
  timeLeft: number;
  ended: boolean;
  paused?: boolean;
  highlightTeamId?: string | null; // "YOU" badge when set to the viewer's team
}

/**
 * Shared projector task view (DISPLAY 1 + legacy display).
 * Winner gets a glowing pill; everyone sees the same giant countdown.
 */
export default function TaskStage({ task, timeLeft, ended, paused, highlightTeamId }: TaskStageProps) {
  const isMine = highlightTeamId != null && task.teamId === highlightTeamId;
  const urgency = timeLeft <= 30 ? "high" : timeLeft <= 60 ? "mid" : "low";
  const timerColor =
    urgency === "high" ? colors.red : urgency === "mid" ? colors.gold : colors.green;

  return (
    <div style={styles.wrap}>
      <div style={styles.phaseTag}>Task Phase</div>

      {isMine ? (
        <div style={styles.headline}>You won the bid</div>
      ) : (
        <div style={styles.subline}>
          <span style={styles.teamPill}>{task.teamName}</span>
          <span style={styles.verb}>is solving</span>
        </div>
      )}

      <QuestionView text={task.question} options={task.options} reward={task.defaultReward ?? 1} />

      {ended ? (
        <div style={styles.timeUp}>Time Up</div>
      ) : paused ? (
        <>
          <div style={{ ...styles.timer, color: colors.muted }}>{formatClock(timeLeft)}</div>
          <div style={styles.pausedBadge}>Paused</div>
        </>
      ) : (
        <>
          <div style={{ ...styles.timer, color: timerColor }}>{formatClock(timeLeft)}</div>
          <div style={styles.instruction}>
            {isMine ? "Solve the task" : "Hold tight for the verdict"}
          </div>
        </>
      )}

      <div style={styles.meta}>
        Final bid: <strong style={styles.gold}>{task.finalBid}</strong>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "24px",
    textAlign: "center",
    fontFamily,
    animation: "fadeSlideIn 0.35s ease",
  },
  phaseTag: {
    ...label,
    fontSize: "1.25rem",
    color: colors.violet,
  },
  headline: {
    fontSize: "clamp(3rem, 9vw, 5.5rem)",
    fontWeight: 800,
    color: colors.gold,
  },
  subline: {
    display: "flex",
    alignItems: "center",
    gap: "24px",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  teamPill: {
    fontSize: "clamp(2rem, 6vw, 4rem)",
    fontWeight: 800,
    color: colors.violet,
    backgroundColor: colors.surface,
    border: `2px solid ${colors.violet}`,
    borderRadius: "999px",
    padding: "12px 48px",
    boxShadow: "0 0 48px rgba(183,156,255,0.35)",
  },
  verb: {
    fontSize: "clamp(1.5rem, 4vw, 3rem)",
    color: colors.muted,
    fontWeight: 600,
  },
  timer: {
    ...tabular,
    fontSize: "clamp(7rem, 22vw, 16rem)",
    fontWeight: 800,
    lineHeight: 0.9,
    transition: "color 0.3s ease",
  },
  instruction: {
    fontSize: "clamp(1.5rem, 3.5vw, 2.5rem)",
    color: colors.ink,
    fontWeight: 600,
  },
  timeUp: {
    fontSize: "clamp(4rem, 12vw, 9rem)",
    fontWeight: 800,
    color: colors.red,
  },
  pausedBadge: {
    fontSize: "clamp(1.5rem, 4vw, 2.5rem)",
    fontWeight: 800,
    color: colors.gold,
    letterSpacing: "0.3em",
    textTransform: "uppercase",
    border: `2px solid ${colors.gold}`,
    borderRadius: "999px",
    padding: "8px 32px",
  },
  meta: {
    ...tabular,
    fontSize: "1.5rem",
    color: colors.muted,
  },
  gold: { color: colors.gold },
};
