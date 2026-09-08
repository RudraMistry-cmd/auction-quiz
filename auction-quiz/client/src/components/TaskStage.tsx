import { colors, fontFamily, label, tabular } from "../theme";
import QuestionView from "./QuestionView";
import TaskTimer from "./TaskTimer";
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

      <QuestionView
        text={task.question}
        template_html={task.template_html || task.rendered_html}
        options={task.options}
        reward={task.defaultReward ?? 1}
        timeLimit={task.time_limit}
      />

      <TaskTimer
        task={task}
        timeLimit={task.time_limit}
        endAt={task.endAt}
        timeLeft={timeLeft}
        ended={ended}
        paused={paused}
        size="large"
      />

      <div style={styles.instruction}>
        {isMine ? "Solve the task" : "Hold tight for the verdict"}
      </div>

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
  instruction: {
    fontSize: "clamp(1.5rem, 3.5vw, 2.5rem)",
    color: colors.ink,
    fontWeight: 600,
  },
  meta: {
    ...tabular,
    fontSize: "1.5rem",
    color: colors.muted,
  },
  gold: { color: colors.gold },
};
