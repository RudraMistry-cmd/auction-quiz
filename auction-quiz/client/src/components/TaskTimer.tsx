import React, { useEffect, useState } from "react";
import { colors, fontFamily, label as labelStyle, tabular } from "../theme";
import { formatClock } from "../hooks/useGamePhase";
import type { Task } from "../shared/types";

export interface TaskTimerProps {
  /** Optional Task object to extract time_limit, endAt, paused, status from */
  task?: (Partial<Task> & { timeLeft?: number }) | null;
  /** Server-provided time limit in seconds (from question time_limit) */
  timeLimit?: number;
  /** Server-provided deadline timestamp in milliseconds */
  endAt?: number;
  /** Server-provided remaining seconds (from task:timer ticks or snapshot) */
  timeLeft?: number;
  /** Whether the countdown is currently paused */
  paused?: boolean;
  /** Whether the task time has expired */
  ended?: boolean;
  /** Label to display. Defaults to "Time Remaining" */
  label?: string;
  /** Display sizing preset */
  size?: "large" | "medium" | "small";
  /** Whether to show the visual progress bar */
  showProgress?: boolean;
  /** Optional callback fired when countdown reaches 0 */
  onExpire?: () => void;
  /** Custom container style */
  style?: React.CSSProperties;
  /** Optional custom class name */
  className?: string;
}

/**
 * Task countdown timer component.
 *
 * Requirements:
 * - DISPLAY: countdown timer + label "Time Remaining"
 * - SOURCE: uses server-provided time_limit + endAt
 * - BEHAVIOR: auto-starts on task start, stays synchronized with server ticks & state
 */
export default function TaskTimer({
  task,
  timeLimit: propTimeLimit,
  endAt: propEndAt,
  timeLeft: propTimeLeft,
  paused: propPaused,
  ended: propEnded,
  label = "Time Remaining",
  size = "medium",
  showProgress = true,
  onExpire,
  style,
  className,
}: TaskTimerProps) {
  // 1. Resolve server-provided sources
  const effectiveTimeLimit = propTimeLimit ?? task?.time_limit ?? 300;
  const effectiveEndAt = propEndAt ?? task?.endAt;
  const effectivePaused = propPaused ?? task?.paused ?? false;
  const effectiveEnded = propEnded ?? (task?.status === "ended");

  const [remaining, setRemaining] = useState<number>(() => {
    if (propTimeLeft !== undefined) return propTimeLeft;
    if (effectiveEndAt) return Math.max(0, Math.ceil((effectiveEndAt - Date.now()) / 1000));
    return effectiveTimeLimit;
  });

  // 2. Sync with authoritative server ticks (task:timer / task:paused / task:resumed)
  useEffect(() => {
    if (propTimeLeft !== undefined) {
      setRemaining(propTimeLeft);
    }
  }, [propTimeLeft]);

  // 3. Auto-start on task start & continuous countdown between server ticks
  useEffect(() => {
    if (effectivePaused || effectiveEnded || !effectiveEndAt) {
      return;
    }

    const updateRemaining = () => {
      const rem = Math.max(0, Math.ceil((effectiveEndAt - Date.now()) / 1000));
      setRemaining(rem);
      if (rem <= 0) {
        onExpire?.();
      }
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 250);
    return () => clearInterval(interval);
  }, [effectiveEndAt, effectivePaused, effectiveEnded, onExpire]);

  // Determine urgency and display state
  const isTimeUp = effectiveEnded || remaining <= 0;
  const urgency = remaining <= 30 ? "high" : remaining <= 60 ? "mid" : "low";

  const timerColor = effectivePaused
    ? colors.muted
    : isTimeUp
      ? colors.red
      : urgency === "high"
        ? colors.red
        : urgency === "mid"
          ? colors.gold
          : colors.green;

  // Calculate percentage remaining from server-provided time_limit
  const total = effectiveTimeLimit > 0 ? effectiveTimeLimit : 300;
  const progressPercent = isTimeUp ? 0 : Math.min(100, Math.max(0, (remaining / total) * 100));

  // Styles tailored per size preset
  const preset = sizePresets[size];

  return (
    <div
      className={className}
      style={{
        ...preset.wrap,
        ...style,
      }}
      data-testid="task-timer"
    >
      {/* Required Label: "Time Remaining" */}
      <div style={preset.label}>{label}</div>

      {/* Countdown Timer Display */}
      <div style={{ ...preset.timer, color: timerColor }}>
        {formatClock(remaining)}
      </div>

      {/* State Badges (Paused / Time Up) */}
      {effectivePaused && (
        <div style={preset.pausedBadge}>PAUSED</div>
      )}
      {isTimeUp && !effectivePaused && (
        <div style={preset.timeUpBadge}>TIME UP</div>
      )}

      {/* Progress Bar (indicates elapsed vs server time_limit) */}
      {showProgress && (
        <div style={preset.progressBarTrack}>
          <div
            style={{
              ...preset.progressBarFill,
              width: `${progressPercent}%`,
              backgroundColor: timerColor,
              boxShadow: `0 0 12px ${timerColor}66`,
            }}
          />
        </div>
      )}
    </div>
  );
}

const sizePresets = {
  large: {
    wrap: {
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      gap: "14px",
      textAlign: "center" as const,
      fontFamily,
      width: "100%",
    },
    label: {
      ...labelStyle,
      fontSize: "clamp(1.25rem, 3.2vw, 2.2rem)",
      color: colors.muted,
      letterSpacing: "0.3em",
      textTransform: "uppercase" as const,
      fontWeight: 700,
    },
    timer: {
      ...tabular,
      fontSize: "clamp(6rem, 18vw, 14rem)",
      fontWeight: 800,
      lineHeight: 0.92,
      transition: "color 0.3s ease",
    },
    pausedBadge: {
      fontSize: "clamp(1.25rem, 3vw, 2rem)",
      fontWeight: 800,
      color: colors.gold,
      letterSpacing: "0.25em",
      textTransform: "uppercase" as const,
      border: `2px solid ${colors.gold}`,
      borderRadius: "999px",
      padding: "6px 28px",
      marginTop: "4px",
    },
    timeUpBadge: {
      fontSize: "clamp(1.25rem, 3vw, 2rem)",
      fontWeight: 800,
      color: colors.red,
      letterSpacing: "0.25em",
      textTransform: "uppercase" as const,
      border: `2px solid ${colors.red}`,
      borderRadius: "999px",
      padding: "6px 28px",
      marginTop: "4px",
    },
    progressBarTrack: {
      width: "clamp(260px, 60vw, 680px)",
      height: "10px",
      backgroundColor: colors.surface,
      border: `1px solid ${colors.surfaceBorder}`,
      borderRadius: "999px",
      overflow: "hidden" as const,
      marginTop: "6px",
    },
    progressBarFill: {
      height: "100%",
      borderRadius: "999px",
      transition: "width 0.25s linear, background-color 0.3s ease",
    },
  },
  medium: {
    wrap: {
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      gap: "8px",
      textAlign: "center" as const,
      fontFamily,
      width: "100%",
    },
    label: {
      ...labelStyle,
      fontSize: "0.95rem",
      color: colors.muted,
      letterSpacing: "0.25em",
      textTransform: "uppercase" as const,
      fontWeight: 600,
    },
    timer: {
      ...tabular,
      fontSize: "clamp(3.2rem, 11vw, 5.2rem)",
      fontWeight: 800,
      lineHeight: 1,
      transition: "color 0.3s ease",
    },
    pausedBadge: {
      fontSize: "0.95rem",
      fontWeight: 800,
      color: colors.gold,
      letterSpacing: "0.2em",
      textTransform: "uppercase" as const,
      border: `1.5px solid ${colors.gold}`,
      borderRadius: "999px",
      padding: "4px 16px",
    },
    timeUpBadge: {
      fontSize: "0.95rem",
      fontWeight: 800,
      color: colors.red,
      letterSpacing: "0.2em",
      textTransform: "uppercase" as const,
      border: `1.5px solid ${colors.red}`,
      borderRadius: "999px",
      padding: "4px 16px",
    },
    progressBarTrack: {
      width: "100%",
      maxWidth: "320px",
      height: "8px",
      backgroundColor: colors.surface,
      border: `1px solid ${colors.surfaceBorder}`,
      borderRadius: "999px",
      overflow: "hidden" as const,
      marginTop: "4px",
    },
    progressBarFill: {
      height: "100%",
      borderRadius: "999px",
      transition: "width 0.25s linear, background-color 0.3s ease",
    },
  },
  small: {
    wrap: {
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      gap: "4px",
      textAlign: "center" as const,
      fontFamily,
      width: "100%",
    },
    label: {
      ...labelStyle,
      fontSize: "0.75rem",
      color: colors.muted,
      letterSpacing: "0.2em",
      textTransform: "uppercase" as const,
      fontWeight: 600,
    },
    timer: {
      ...tabular,
      fontSize: "2.4rem",
      fontWeight: 800,
      lineHeight: 1.05,
      transition: "color 0.3s ease",
    },
    pausedBadge: {
      fontSize: "0.75rem",
      fontWeight: 700,
      color: colors.gold,
      letterSpacing: "0.15em",
      textTransform: "uppercase" as const,
      border: `1px solid ${colors.gold}`,
      borderRadius: "999px",
      padding: "2px 10px",
    },
    timeUpBadge: {
      fontSize: "0.75rem",
      fontWeight: 700,
      color: colors.red,
      letterSpacing: "0.15em",
      textTransform: "uppercase" as const,
      border: `1px solid ${colors.red}`,
      borderRadius: "999px",
      padding: "2px 10px",
    },
    progressBarTrack: {
      width: "100%",
      maxWidth: "200px",
      height: "5px",
      backgroundColor: colors.surface,
      border: `1px solid ${colors.surfaceBorder}`,
      borderRadius: "999px",
      overflow: "hidden" as const,
      marginTop: "2px",
    },
    progressBarFill: {
      height: "100%",
      borderRadius: "999px",
      transition: "width 0.25s linear, background-color 0.3s ease",
    },
  },
};
